import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { exigirAdmin } from "@/lib/adminAuth";
import { preguntarJSON, textoDeError, type Turno } from "@/lib/ai";
import {
  DIAS,
  diaDeFecha,
  fechaCorta,
  etiquetaSemana,
  hoyISO,
  lunesDe,
  nombreClase,
  nombreMateria,
  semanaDe,
  sumarDias,
} from "@/lib/horario";

type Slot = { salon: string; dia: number; periodo: number; materia: string; sala: string | null; track: string };
type Period = { orden: number; etiqueta: string; hora_inicio: string; hora_fin: string; es_clase: boolean };

type IACambio = {
  slot?: string;
  cuando?: string; // "fecha" | "permanente"
  fecha?: string | null; // solo si el admin dio una fecha explícita
  tipo?: "cambio" | "cancelacion" | "evento";
  sala?: string | null;
  materia?: string | null;
  nota?: string | null;
  resumen?: string;
  cita?: string; // el trozo literal del mensaje del admin que originó este cambio
  repetir_hasta?: string | null; // "durante 4 semanas" / "hasta el 19 de octubre"
};

/** Dias (1-5) nombrados en un trozo de texto del admin; incluye "hoy" y "manana". */
function sinAcentos(txt: string): string {
  return txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Materias (de las que existen) nombradas en un trozo del pedido del admin.
 * Sirve para no dejar que el modelo cuelgue un cambio de otra clase.
 */
function materiasEnTexto(txt: string, vocabulario: string[]): string[] {
  const limpio = sinAcentos(txt);
  return vocabulario.filter((m) => m && limpio.includes(sinAcentos(m)));
}

/**
 * Cuántas semanas dura el cambio si el admin lo dijo con un número
 * ("durante 4 semanas", "las próximas 3 semanas"). 0 = no lo dijo así.
 */
function semanasEnTexto(txt: string): number {
  const t = sinAcentos(txt);
  const numeros: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8 };
  const m = /(?:durante|por|las proximas|los proximos|proximas|proximos)\s+(\d+|dos|tres|cuatro|cinco|seis|siete|ocho)\s+semanas?/.exec(
    t
  );
  if (!m) return 0;
  const n = Number(m[1]) || numeros[m[1]] || 0;
  return n >= 2 && n <= 52 ? n : 0;
}

/** ¿El admin habló de toda la escuela y no de un salón suelto? */
function mencionaTodaLaEscuela(txt: string): boolean {
  return /toda la escuela|todo el colegio|todos los salones|ambos salones|los dos salones|todos los estudiantes/.test(
    sinAcentos(txt)
  );
}

function diasEnTexto(txt: string, hoy: string): number[] {
  const limpio = sinAcentos(txt);
  const palabras = new Set(limpio.split(/[^a-z]+/));
  const dias = new Set<number>();
  const nombres: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5 };
  for (const [n, d] of Object.entries(nombres)) if (palabras.has(n)) dias.add(d);
  if (palabras.has("hoy")) dias.add(diaDeFecha(hoy));
  if (palabras.has("manana")) dias.add(diaDeFecha(sumarDias(hoy, 1)));
  return [...dias].filter((d) => d >= 1 && d <= 5);
}

type IAJornada = {
  dia?: number;
  modo?: "salida_temprana" | "sin_clases";
  salones?: string[] | null;
};

// La IA elige clases de una lista numerada (S1, S2, …) en vez de adivinar
// día/período/track; el servidor resuelve eso y calcula la fecha.
export async function POST(req: Request) {
  const no = exigirAdmin(req);
  if (no) return no;

  const { salon, texto, previo, lunes: lunesPedido } = (await req.json().catch(() => ({}))) as {
    salon?: string;
    texto?: string;
    previo?: Turno | null;
    lunes?: string;
  };
  if (!salon || !texto?.trim()) return NextResponse.json({ error: "Faltan salon o texto" }, { status: 400 });

  // Se listan las clases de TODOS los salones para que el admin pueda decir
  // "todos los salones" o "todo 10mo" sin nombrarlos uno por uno. Cada ID de
  // clase ya trae su salón, así que un pedido puede resolverse en varios.
  const [{ data: periods }, { data: slotsRaw }] = await Promise.all([
    db.from("periods").select("*").order("orden"),
    db.from("schedule_slots").select("salon, dia, periodo, materia, sala, track"),
  ]);
  const perDe = new Map(((periods as Period[] | null) || []).map((p) => [p.orden, p]));

  const slots = ((slotsRaw as Slot[] | null) || []).sort(
    (a, b) =>
      a.salon.localeCompare(b.salon) ||
      a.dia - b.dia ||
      a.periodo - b.periodo ||
      (a.track === "base" ? -1 : 1)
  );
  const salones = [...new Set(slots.map((s) => s.salon))].sort();
  // Nombres de materia que existen de verdad; es el vocabulario contra el que se
  // comprueba lo que el admin escribió. Los más largos primero ("Educación Física").
  const vocabularioMaterias = [...new Set(slots.map((s) => nombreMateria(s.materia)))].sort(
    (a, b) => b.length - a.length
  );
  const porId = new Map<string, Slot>();
  const lista = slots
    .map((s, i) => {
      const id = `S${i + 1}`;
      porId.set(id, s);
      const p = perDe.get(s.periodo);
      const quien = s.track === "base" ? "todos" : "solo inscritos en AP";
      return `${id} | ${s.salon} | ${DIAS[s.dia]} | ${p?.etiqueta} (${p?.hora_inicio.slice(0, 5)}) | ${nombreClase(s.materia, s.salon)} [${s.materia}] | sala ${s.sala || "—"} | ${quien}`;
    })
    .join("\n");

  const hoy = hoyISO();
  const diaHoy = diaDeFecha(hoy);
  const manana = sumarDias(hoy, 1);
  // Los cambios se resuelven dentro de la semana que el admin está viendo.
  const lunes = /^\d{4}-\d{2}-\d{2}$/.test(lunesPedido || "") ? lunesDe(lunesPedido!) : lunesDe(hoy);
  const semana = semanaDe(lunes);
  const esSemanaActual = lunes === lunesDe(hoy);
  const calendario = [1, 2, 3, 4, 5]
    .map((d) => `${DIAS[d]} ${semana[d]}${semana[d] === hoy ? " (hoy)" : ""}`)
    .join(", ");

  // El ajuste ("ahora que sea el martes") falla si el modelo tiene que recordar
  // su propuesta anterior; se la devolvemos escrita, con los mismos IDs.
  let propuesta = "";
  if (previo?.respuesta) {
    try {
      const anterior = JSON.parse(
        previo.respuesta.slice(previo.respuesta.indexOf("{"), previo.respuesta.lastIndexOf("}") + 1)
      ) as { cambios?: IACambio[] };
      const filas = (anterior.cambios || [])
        .filter((c) => c.slot && porId.has(c.slot))
        .map(
          (c, i) =>
            `  ${i + 1}. slot=${c.slot} cuando=${c.cuando || "fecha"} tipo=${c.tipo || "cambio"} sala=${
              c.sala ?? "null"
            } materia=${c.materia ?? "null"} nota=${c.nota ?? "null"} resumen="${c.resumen || ""}"`
        )
        .join("\n");
      if (filas) {
        propuesta = `

PROPUESTA ACTUAL (es la que el admin está ajustando con su mensaje nuevo):
${filas}
Devuelve SIEMPRE la lista completa: copia TAL CUAL las entradas que el ajuste no menciona y modifica únicamente las que sí. No las reordenes ni las elimines salvo que el admin lo pida.`;
      }
    } catch {
      // sin propuesta previa utilizable: se interpreta desde cero
    }
  }

  const SYSTEM = `Eres el asistente de cambios de horario de una escuela. El admin describe cambios en lenguaje natural y tú los conviertes en cambios sobre las clases de esta lista del salón ${salon}.

Salones con horario: ${salones.join(", ")}.
El admin está viendo el salón ${salon}.

Clases (ID | salón | día | período (hora) | materia [código] | sala | quién la toma):
${lista}

Hoy es ${DIAS[diaHoy]} ${hoy}. Mañana es ${DIAS[diaDeFecha(manana)]} ${manana}${diaDeFecha(manana) > 5 ? " (no hay clases)" : ""}.
El admin está viendo la semana del ${etiquetaSemana(lunes)}${esSemanaActual ? " (la semana actual)" : ""}.
Fechas de esa semana: ${calendario}.
Cuando el admin diga un día ("el lunes", "el viernes"), usa la fecha de ESA semana.

ANTES de escribir los cambios, descomponé el mensaje: en "pedidos" lista cada cosa distinta que pidió el admin, una por línea corta, en el orden en que la dijo. Incluye TODAS, aunque vengan unidas por "y", "además", "también", comas o punto y coma. Después emite un objeto en "cambios" por cada pedido que afecte a una clase. Si un pedido no se puede resolver, igual debe aparecer en "pedidos" y explicarse en "aviso".

Reglas:
- Por cada cambio elige el ID ("slot") de la clase afectada. Usa el nombre de la materia, el día y/o la hora que dijo el admin.
- SALONES: si el admin no dice de qué salón habla, usa solo clases del salón ${salon}. Si nombra salones ("en 10B", "10A y 10B") usa esos. Si habla de varios sin nombrarlos ("todos los salones", "toda la escuela", "los dos salones", "todo 10mo", "todos los décimos"), elige el ID de esa clase en CADA salón que corresponda y emite un cambio por salón, aunque caigan en días u horas distintas.
- Si un pedido afecta a varias clases (ej. "cancela todo el viernes"), emite un cambio por cada clase afectada.
- Si la materia existe en versión base y AP en la misma hora (ej. "Matemáticas" vs "AP Cálculo"), elige la que nombró el admin.
- "cuando": "fecha" SIEMPRE que el cambio tenga un final, aunque dure varias semanas
  ("durante 4 semanas", "las próximas 3 semanas", "hasta el 19 de octubre", "todo octubre").
  En esos casos usa "fecha" y además llena "repetir_hasta".
  "permanente" SOLO si no hay final ("siempre", "de ahora en adelante", "a partir de ahora
  queda así"). Si no queda claro, usa "fecha".
- "fecha": ponla SOLO si el admin dio una fecha explícita (ej. "el 25 de septiembre"). Para "hoy", "mañana" o un día de la semana deja null: el sistema calcula la fecha.
- "tipo": "cambio" (cambia sala o materia), "cancelacion" (se cancela la clase) o "evento" (anotación que no cambia la clase, ej. "hay prueba de Duolingo"; va en "nota").
- En "sala"/"materia" pon solo el valor nuevo si cambia; si no, null.
- "resumen": una línea corta en español con la materia y el cambio (ej. "Física pasa a la sala 300"). NO pongas números de período ni fechas: el sistema los agrega.
- Si no puedes identificar una clase con seguridad, no inventes: explícalo en "aviso" y omite ese cambio.
- Si el admin nombra una materia en un día donde esa materia NO aparece en la lista, NO elijas otro día ni otra materia parecida: omite ese cambio y dilo en "aviso" (ej. "No hay Hebreo el jueves").
- "repetir_hasta": si el admin dice que el cambio se repite varias semanas ("durante 4 semanas",
  "todos los lunes hasta el 19 de octubre", "las próximas 3 semanas"), pon la fecha del ÚLTIMO
  día afectado en formato YYYY-MM-DD. Si es solo para esa semana, null.
- "cita": copia LITERAL y sin corregir el trozo del mensaje del admin que originó este cambio (incluye el día si lo nombró). No la reescribas ni la traduzcas.

AJUSTES: si hay mensajes anteriores, el mensaje nuevo es un ajuste sobre tu propuesta anterior ("ahora que sea el martes", "cambia solo la sala", "quita el último"). Aplica SOLO lo que pide el ajuste, conserva el resto igual, y vuelve a devolver la lista COMPLETA y actualizada de cambios (no solo el ajuste). Si el mensaje nuevo claramente no tiene relación con lo anterior, empieza de cero.

JORNADA ESPECIAL: si el admin dice que un día NO hay clases ("el lunes se cancela la escuela",
"el martes no hay clases", "día libre") o que hay salida temprana ("el lunes hay salida temprana",
"salimos después del almuerzo"), NO listes las clases una por una. Devuelve en su lugar:
"jornada": {"dia": 1, "modo": "sin_clases" | "salida_temprana", "salones": null}
- "dia": 1=lunes … 5=viernes.
- "modo": "sin_clases" cancela todo el día; "salida_temprana" cancela solo lo que va después del almuerzo.
- "salones": null si el admin no nombró salones (se usa el que está viendo); la lista de salones
  si nombró algunos; TODOS los salones si dijo "toda la escuela" / "todos los salones".
Cuando devuelvas "jornada", deja "cambios" vacío. El sistema se encarga de tachar las clases.

TONO: escribe todo (resumen, aviso, texto) en español neutro tratando de "tú".
Nunca uses voseo: ni "vos", ni "queres/querés", ni "podes/podés", ni "aclaralo", ni "elegí".

Responde SOLO con JSON válido:
{"pedidos":["mover física del lunes a la sala 300"],"cambios":[{"slot":"S12","cuando":"fecha","fecha":null,"tipo":"cambio","sala":"300","materia":null,"nota":null,"resumen":"una línea","cita":"física del lunes pasa a la 300","repetir_hasta":null}],"aviso":null,"jornada":null}${propuesta}`;

  let parsed: { pedidos?: string[]; cambios?: IACambio[]; aviso?: string | null; jornada?: IAJornada | null };
  let raw = "";
  try {
    const r = await preguntarJSON({ system: SYSTEM, texto, previo, maxTokens: 2048 });
    parsed = r.data as typeof parsed;
    raw = r.raw;
  } catch (e) {
    return NextResponse.json({ cambios: [], aviso: textoDeError(e), error: textoDeError(e) });
  }

  // Resolver cada cambio contra la lista real.
  const avisos: string[] = parsed.aviso ? [parsed.aviso] : [];
  const cambios = [];
  for (const c of parsed.cambios || []) {
    const s = c.slot ? porId.get(c.slot) : undefined;
    if (!s) {
      avisos.push(`No encontré la clase para: "${c.resumen || c.slot}".`);
      continue;
    }
    // El día se lee de la cita literal del admin, no de lo que el modelo diga:
    // si nombró un día y la clase elegida cae en otro, sustituyó una clase por
    // otra y se descarta en vez de aplicar algo falso.
    // Si el admin nombró una materia y el modelo eligió otra, se descarta:
    // el día puede coincidir y aun así ser la clase equivocada.
    const materiasDichas = materiasEnTexto(c.cita || "", vocabularioMaterias);
    if (materiasDichas.length && !materiasDichas.includes(nombreMateria(s.materia))) {
      avisos.push(
        `No pude ubicar "${materiasDichas[0]}" en ese pedido ("${(c.cita || c.resumen || "").trim()}").`
      );
      continue;
    }
    const dichos = diasEnTexto(c.cita || "", hoy);
    if (dichos.length && !dichos.includes(s.dia)) {
      avisos.push(
        `No encontré ${nombreClase(s.materia, s.salon)} el ${DIAS[dichos[0]].toLowerCase()}; revisa ese pedido ("${(c.cita || c.resumen || "").trim()}").`
      );
      continue;
    }
    // "durante N semanas" tiene final: nunca es un cambio permanente.
    const semanasPedidas = semanasEnTexto(`${c.cita || ""} ${texto}`);
    const permanente = c.cuando === "permanente" && !semanasPedidas;
    let fecha: string | null = null;
    if (!permanente) {
      const f = c.fecha && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : null;
      // La fecha de la IA solo vale si cae en el día de esa clase; si no, se usa
      // la de la semana que el admin tiene abierta.
      fecha = f && diaDeFecha(f) === s.dia ? f : semana[s.dia];
    }
    const tipo = c.tipo === "cancelacion" || c.tipo === "evento" ? c.tipo : "cambio";
    // Solo se repite si la fecha final es válida y posterior a la del cambio.
    const hastaIA =
      c.repetir_hasta && /^\d{4}-\d{2}-\d{2}$/.test(c.repetir_hasta) ? c.repetir_hasta : null;
    const hastaContado = semanasPedidas && fecha ? sumarDias(fecha, (semanasPedidas - 1) * 7) : null;
    // Si el admin dio un número de semanas, ese número manda sobre la fecha del modelo.
    const candidato = hastaContado || hastaIA;
    const repetir = !permanente && fecha && candidato && candidato > fecha ? candidato : undefined;
    const p = perDe.get(s.periodo);
    cambios.push({
      salon: s.salon,
      dia: s.dia,
      periodo: s.periodo,
      track: s.track,
      scope: permanente ? "permanente" : "fecha",
      fecha,
      repetir_hasta: repetir,
      tipo,
      materia: tipo === "cambio" ? c.materia || null : null,
      sala: tipo === "cambio" ? c.sala || null : null,
      nota: c.nota || null,
      resumen: c.resumen || "",
      // para mostrar en el borrador
      detalle: `${s.salon} · ${DIAS[s.dia]} ${fecha ? fechaCorta(fecha) : "(permanente)"}${repetir ? ` → ${fechaCorta(repetir)}` : ""} · ${p?.etiqueta} ${p?.hora_inicio.slice(0, 5)} · ${nombreClase(s.materia, s.salon)}${s.track !== "base" ? " (AP)" : ""}`,
    });
  }

  // Jornada especial: el servidor expande el día en cancelaciones, una por clase.
  // Así se ve tachado en el cuadro sin inventar un tipo nuevo en la base de datos.
  let textoLote: string | null = null;
  let resumenLote: string | null = null;
  const j = parsed.jornada;
  const diaJornada = Number(j?.dia); // el modelo a veces lo manda como texto
  if (diaJornada >= 1 && diaJornada <= 5 && (j?.modo === "sin_clases" || j?.modo === "salida_temprana")) {
    // El alcance se decide leyendo el pedido del admin, no lo que el modelo diga.
    const destino = (j.salones || []).filter((x) => salones.includes(x));
    const objetivo = mencionaTodaLaEscuela(texto) ? salones : destino.length ? destino : [salon];
    const almuerzo = ((periods as Period[] | null) || []).find(
      (p) => !p.es_clase && /almuerzo/i.test(p.etiqueta)
    )?.orden;
    const soloTarde = j.modo === "salida_temprana";
    if (soloTarde && almuerzo === undefined) {
      avisos.push("No encontré el almuerzo en el horario, así que no puedo calcular la salida temprana.");
    } else {
      const fecha = semana[diaJornada];
      const afectadas = slots.filter(
        (sl) =>
          objetivo.includes(sl.salon) &&
          sl.dia === diaJornada &&
          (!soloTarde || sl.periodo > (almuerzo as number))
      );
      for (const sl of afectadas) {
        const p = perDe.get(sl.periodo);
        cambios.push({
          salon: sl.salon,
          dia: sl.dia,
          periodo: sl.periodo,
          track: sl.track,
          scope: "fecha",
          fecha,
          tipo: "cancelacion" as const,
          materia: null,
          sala: null,
          nota: null,
          resumen: `${nombreClase(sl.materia, sl.salon)} se cancela`,
          detalle: `${sl.salon} · ${DIAS[sl.dia]} ${fechaCorta(fecha)} · ${p?.etiqueta} ${p?.hora_inicio.slice(0, 5)}`,
        });
      }
      if (!afectadas.length) {
        avisos.push(`No hay clases registradas para ese ${DIAS[diaJornada].toLowerCase()}.`);
      } else {
        const donde = objetivo.length > 1 ? ` (${objetivo.join(", ")})` : "";
        const desde = perDe.get(Math.min(...afectadas.map((a) => a.periodo)))?.hora_inicio.slice(0, 5);
        // Al estudiante se le puede dar un poco más de contexto que al admin.
        textoLote = soloTarde
          ? `Salida temprana · ${DIAS[diaJornada].slice(0, 3)} ${fechaCorta(fecha)}, sin clases desde ${desde}`
          : `Sin clases · ${DIAS[diaJornada].slice(0, 3)} ${fechaCorta(fecha)}`;
        resumenLote = soloTarde
          ? `Salida temprana el ${DIAS[diaJornada]} ${fechaCorta(fecha)}${donde}`
          : `Sin clases el ${DIAS[diaJornada]} ${fechaCorta(fecha)}${donde}`;
      }
    }
  }

  // Si pidió más cosas de las que se resolvieron, avisarlo en vez de callarlo.
  const pedidos = (parsed.pedidos || []).filter((p) => typeof p === "string" && p.trim());
  if (!propuesta && pedidos.length > cambios.length && !avisos.length) {
    avisos.push(
      `Detecté ${pedidos.length} pedido(s) y resolví ${cambios.length}. Revisa que no falte: ${pedidos.join("; ")}.`
    );
  }

  return NextResponse.json({
    cambios,
    textoLote, // un solo mensaje para el aviso, en vez de 20 cancelaciones sueltas
    resumenLote,
    pedidos,
    aviso: avisos.length ? avisos.join(" ") : null,
    raw, // el cliente lo devuelve como "previo" para permitir ajustes
  });
}

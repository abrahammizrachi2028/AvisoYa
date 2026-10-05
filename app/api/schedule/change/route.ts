import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { exigirAdmin } from "@/lib/adminAuth";
import { pushToStudent } from "@/lib/push";
import { diaDeFecha, fechaCorta, fechasDeDiaEntre, nombreClase } from "@/lib/horario";

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

type Cambio = {
  salon?: string; // si viene, este cambio va a ese salón en vez del de la petición
  dia: number;
  periodo: number;
  track?: string; // 'base' o el código del curso AP (para cambios de salón)
  student_id?: string; // si viene, el cambio es solo para ese estudiante
  scope: "fecha" | "permanente";
  fecha?: string;
  repetir_hasta?: string; // repite el cambio ese día de la semana hasta esta fecha
  tipo: "cambio" | "cancelacion" | "evento";
  materia?: string;
  sala?: string;
  profesor?: string;
  nota?: string;
};

type Body = { salon: string; cambios: Cambio[]; texto?: string };

// Estudiantes afectados por un cambio de salón en (salon,dia,periodo,track).
// `idsSalon` llega ya resuelto: en un lote de cambios era la misma consulta repetida.
async function afectadosSalon(
  salon: string,
  dia: number,
  periodo: number,
  track: string,
  idsSalon: string[]
) {
  const ids = idsSalon;
  if (track === "base") {
    const { data: apHere } = await db
      .from("schedule_slots")
      .select("track")
      .eq("salon", salon)
      .eq("dia", dia)
      .eq("periodo", periodo)
      .neq("track", "base");
    const courses = (apHere || []).map((s) => s.track);
    if (!courses.length) return ids;
    const { data: enr } = await db.from("student_courses").select("student_id").in("course", courses);
    const takingAp = new Set((enr || []).map((e) => e.student_id));
    return ids.filter((id) => !takingAp.has(id));
  }
  const { data: enr } = await db.from("student_courses").select("student_id").eq("course", track);
  const enrolled = new Set((enr || []).map((e) => e.student_id));
  return ids.filter((id) => enrolled.has(id));
}

async function aplicarUno(salon: string, c: Cambio, idsSalon: string[]) {
  const studentId = c.student_id;
  const track = c.track || "base"; // track real del slot
  const ovrTrack = studentId ? `student:${studentId}` : track; // clave del override
  const permanente = !studentId && c.scope === "permanente"; // por estudiante siempre es por fecha

  const { data: period } = await db.from("periods").select("*").eq("orden", c.periodo).maybeSingle();

  // Slot de referencia (para el texto): la clase que ve el destinatario en esa celda.
  let refSlot: Record<string, unknown> | null = null;
  if (studentId) {
    const [{ data: cellSlots }, { data: enr }] = await Promise.all([
      db.from("schedule_slots").select("*").eq("salon", salon).eq("dia", c.dia).eq("periodo", c.periodo),
      db.from("student_courses").select("course").eq("student_id", studentId),
    ]);
    const courses = new Set((enr || []).map((e) => e.course));
    refSlot =
      (cellSlots || []).find((s) => s.track !== "base" && courses.has(s.track)) ||
      (cellSlots || []).find((s) => s.track === "base") ||
      null;
  } else {
    const { data } = await db
      .from("schedule_slots")
      .select("*")
      .eq("salon", salon)
      .eq("dia", c.dia)
      .eq("periodo", c.periodo)
      .eq("track", track)
      .maybeSingle();
    refSlot = data;
  }

  const materiaActual = (refSlot?.materia as string) || "la clase";
  const salaActual = (refSlot?.sala as string) || null;
  const horaTxt = period ? `${(period.hora_inicio as string)?.slice(0, 5)}` : "";
  // Formato corto de notificación: "Mar 22/09 13:30" o "los martes 13:30".
  const cuando = permanente
    ? `los ${DIAS[c.dia].toLowerCase()} ${horaTxt}`
    : `${DIAS[c.dia].slice(0, 3)} ${fechaCorta(c.fecha || "")} ${horaTxt}`;
  const clase = nombreClase(materiaActual, salon);

  // Se escriben SIEMPRE todas las columnas mutables: si antes había un cambio de
  // sala y ahora es una cancelación, la sala vieja no debe quedar pegada en la fila.
  const upsertOverride = (extra: Record<string, unknown>) =>
    db.from("schedule_overrides").upsert(
      {
        salon,
        fecha: c.fecha,
        dia: c.dia,
        periodo: c.periodo,
        track: ovrTrack,
        materia: null,
        sala: null,
        profesor: null,
        nota: c.nota || null,
        ...extra,
      },
      { onConflict: "salon,fecha,periodo,track" }
    );

  let mensaje = "";
  if (c.tipo === "evento") {
    await upsertOverride({ tipo: "evento" });
    mensaje = `📌 ${c.nota} en ${clase} · ${cuando}`;
  } else if (c.tipo === "cancelacion") {
    if (permanente) {
      await db
        .from("schedule_slots")
        .delete()
        .eq("salon", salon)
        .eq("dia", c.dia)
        .eq("periodo", c.periodo)
        .eq("track", track);
    } else {
      await upsertOverride({ tipo: "cancelacion" });
    }
    mensaje = permanente ? `${clase} sale del horario · ${cuando}` : `${clase} cancelada · ${cuando}`;
  } else {
    const nueva = {
      materia: c.materia ?? materiaActual,
      sala: c.sala ?? salaActual,
      profesor: c.profesor ?? null,
    };
    if (permanente) {
      await db
        .from("schedule_slots")
        .update(nueva)
        .eq("salon", salon)
        .eq("dia", c.dia)
        .eq("periodo", c.periodo)
        .eq("track", track);
    } else {
      await upsertOverride({ tipo: "cambio", ...nueva });
    }
    const cambios: string[] = [];
    if (c.materia && c.materia !== materiaActual) cambios.push(nombreClase(c.materia, salon));
    if (c.sala && c.sala !== salaActual) cambios.push(`salón ${c.sala}`);
    if (c.profesor) cambios.push(`prof. ${c.profesor}`);
    mensaje = `${clase} → ${cambios.length ? cambios.join(", ") : "cambio"} · ${cuando}`;
  }
  if (c.nota && c.tipo !== "evento") mensaje += ` · ${c.nota}`;

  const studentIds = studentId ? [studentId] : await afectadosSalon(salon, c.dia, c.periodo, track, idsSalon);
  return { mensaje, studentIds, urgente: !permanente };
}

export async function POST(req: Request) {
  const no = exigirAdmin(req);
  if (no) return no;

  const b = (await req.json()) as Body;
  if (!b.salon || !Array.isArray(b.cambios) || !b.cambios.length) {
    return NextResponse.json({ error: "Faltan los cambios" }, { status: 400 });
  }
  // Un cambio "de varias semanas" se guarda como una fila por fecha: cada semana
  // queda independiente y se puede editar o borrar sola después.
  // ponytail: se materializan las fechas en vez de guardar una regla. Si algún día
  // hace falta editar la serie completa de una vez, ahí sí conviene una tabla de reglas.
  const plan: { c: Cambio; primero: boolean; serie: number; hasta: string }[] = [];
  for (const c of b.cambios) {
    const repetible = c.scope !== "permanente" && c.fecha && c.repetir_hasta;
    const fechas = repetible ? fechasDeDiaEntre(c.dia, c.fecha!, c.repetir_hasta!) : [c.fecha];
    if (repetible && !fechas.length) {
      return NextResponse.json(
        { error: `No hay ningún ${DIAS[c.dia]} entre ${c.fecha} y ${c.repetir_hasta}.` },
        { status: 400 }
      );
    }
    fechas.forEach((f, i) =>
      plan.push({
        c: { ...c, fecha: f, repetir_hasta: undefined },
        primero: i === 0,
        serie: fechas.length,
        hasta: fechas[fechas.length - 1] || "",
      })
    );
  }

  // Un cambio por fecha debe caer en el día de su clase; si no, nunca se vería.
  for (const { c } of plan) {
    const porFecha = c.student_id || c.tipo === "evento" || c.scope !== "permanente";
    if (!porFecha) continue;
    if (!c.fecha) return NextResponse.json({ error: "Falta la fecha del cambio" }, { status: 400 });
    if (diaDeFecha(c.fecha) !== c.dia) {
      return NextResponse.json(
        { error: `La fecha ${c.fecha} no es ${DIAS[c.dia]}; elige un ${DIAS[c.dia]}.` },
        { status: 400 }
      );
    }
  }

  // Un lote puede tocar varios salones ("todos los salones de 10mo"): se resuelven
  // los estudiantes de cada salón involucrado una sola vez.
  const salonesLote = [...new Set(plan.map(({ c }) => c.salon || b.salon))];
  const { data: salonStudents } = await db.from("students").select("id, salon").in("salon", salonesLote);
  const idsPorSalon = new Map<string, string[]>(salonesLote.map((s) => [s, []]));
  for (const st of salonStudents || []) idsPorSalon.get(st.salon)?.push(st.id);

  const results = [];
  for (const { c } of plan) {
    const salonDelCambio = c.salon || b.salon;
    results.push(await aplicarUno(salonDelCambio, c, idsPorSalon.get(salonDelCambio) || []));
  }

  // De una serie se avisa una vez, diciendo hasta cuándo se repite.
  const messages = results
    .map((r, i) => {
      const it = plan[i];
      if (!it.primero) return null;
      return it.serie > 1
        ? `${r.mensaje} · cada ${DIAS[it.c.dia].toLowerCase()} hasta ${fechaCorta(it.hasta)}`
        : r.mensaje;
    })
    .filter((m): m is string => !!m);
  // Una jornada especial manda su propio texto: "No hay clases el Lunes 22/09."
  // es mucho más claro que veinte "Clase cancelada: …" seguidas.
  // Un lote grande encadenaba veinte frases. Se muestran las primeras y se cuenta el resto;
  // el detalle completo siempre está en el horario de la app.
  // Un cambio por línea; si son muchos, se cuentan los que faltan.
  const MAX_EN_AVISO = 3;
  const texto =
    b.texto?.trim() ||
    (messages.length <= MAX_EN_AVISO
      ? messages.join("\n")
      : `${messages.slice(0, MAX_EN_AVISO).join("\n")}\n+${messages.length - MAX_EN_AVISO} más`);
  const union = [...new Set(results.flatMap((r) => r.studentIds))];
  const urgencia = results.some((r) => r.urgente) ? "alta" : "normal";

  // Una sola notificación por lote; push genérico, detalle en la app.
  const { data: ann } = await db
    .from("announcements")
    .insert({
      texto,
      lugar: null,
      hora_evento: null,
      urgencia,
      audiencia_desc: salonesLote.length === 1 ? `Salón ${salonesLote[0]}` : `Salones ${salonesLote.join(", ")}`,
    })
    .select()
    .single();

  let pushSent = 0;
  if (ann && union.length) {
    await db.from("notifications").insert(union.map((id) => ({ announcement_id: ann.id, student_id: id })));
    const res = await Promise.all(
      union.map((id) =>
        pushToStudent(id, {
          title: "Hay un cambio en tu horario",
          body: "Ábrela para ver los detalles.",
          url: "/horario",
        })
      )
    );
    pushSent = res.reduce((n, r) => n + r.sent, 0);
  }

  return NextResponse.json({
    ok: true,
    announcementId: ann?.id ?? null,
    aplicados: plan.length,
    destinatarios: union.length,
    salones: salonesLote,
    pushSent,
    mensaje: texto,
  });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { exigirAdmin } from "@/lib/adminAuth";
import { preguntarJSON, textoDeError, type Turno } from "@/lib/ai";

// La IA lee el texto libre del admin y arma un aviso estructurado (a quién,
// urgencia, mensaje) para que lo confirme. No lo envía.
export async function POST(req: Request) {
  const no = exigirAdmin(req);
  if (no) return no;

  const { texto, previo } = (await req.json().catch(() => ({}))) as { texto?: string; previo?: Turno | null };
  if (!texto?.trim()) return NextResponse.json({ error: "Falta el texto" }, { status: 400 });

  const { data: students } = await db
    .from("students")
    .select("id, nombre, grado, salon")
    .order("salon")
    .order("nombre");
  const grados = [...new Set((students || []).map((s) => s.grado))].sort();
  const salones = [...new Set((students || []).map((s) => s.salon))].sort();
  const rosterTxt = (students || []).map((s) => `  ${s.id} | ${s.nombre} | ${s.salon}`).join("\n");

  const SYSTEM = `Eres el asistente de avisos escolares. El admin escribe un aviso en lenguaje natural y tú extraes a quién va, la urgencia y el mensaje.

Grados: ${grados.join(", ")}
Salones: ${salones.join(", ")}
Estudiantes (id | nombre | salón):
${rosterTxt}

ANTES de redactar, descomponé el mensaje: en "requisitos" lista cada dato que el aviso DEBE incluir (qué pasa, dónde, cuándo, qué llevar, qué hacer, condiciones). Incluye todos, aunque vengan en una sola oración. Luego redacta "texto" de forma que cumpla TODOS esos requisitos; no omitas ninguno ni agregues información que el admin no dio.

Reglas:
- audiencia_tipo: "todos" (TODA la escuela: "toda la escuela", "todos los salones", "todos los estudiantes"), "grado" (un grado entero: "10mo", "todos los salones de 10"), "salon" (un salón: "10A") o "individual" (estudiantes nombrados).
- audiencia_valor: todos -> ""; grado -> el número (ej "10"); salon -> el código (ej "10A"); individual -> los IDs separados por coma.
- urgencia "alta" si es urgente/emergencia/de último momento; si no "normal".
- texto: CORTO, estilo notificación de celular: idealmente menos de 15 palabras. Sin saludos ni
  relleno ("Atención estudiantes", "Es importante que", "Por favor"). Solo qué pasa, cuándo, dónde y
  qué llevar o hacer. Ejemplo: "Simulacro de incendio mañana 9am en la cancha. Trae tu carné."
- audiencia_desc: descripción legible (ej "Toda la escuela", "Salón 10A", "Grado 10", "2 estudiante(s)").
- Si no puedes determinar a quién va, encontrado=false y explícalo en "nota".

AJUSTES: si hay mensajes anteriores, el mensaje nuevo es un ajuste sobre tu propuesta anterior ("hazlo urgente", "ahora mándalo a 10B", "quita la hora"). Aplica solo ese ajuste, conserva todo lo demás igual y devuelve el aviso COMPLETO actualizado. Si el mensaje nuevo no tiene relación con lo anterior, empieza de cero.

TONO: escribe todo (resumen, aviso, texto) en español neutro tratando de "tú".
Nunca uses voseo: ni "vos", ni "queres/querés", ni "podes/podés", ni "aclaralo", ni "elegí".

Responde SOLO con JSON válido:
{"encontrado":true,"requisitos":["simulacro","mañana 9am"],"resumen":"una línea","texto":"el mensaje","urgencia":"normal","audiencia_tipo":"salon","audiencia_valor":"10A","audiencia_desc":"Salón 10A","nota":null}`;

  let d: Record<string, unknown>;
  let raw = "";
  try {
    const r = await preguntarJSON({ system: SYSTEM, texto, previo, maxTokens: 1024 });
    d = r.data as Record<string, unknown>;
    raw = r.raw;
  } catch (e) {
    return NextResponse.json({ encontrado: false, nota: textoDeError(e), error: textoDeError(e) });
  }

  if (!d.encontrado) return NextResponse.json({ ...d, raw });

  // Validar la audiencia contra el roster real (la IA a veces da nombres o minúsculas).
  const lista = students || [];
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const tipo = d.audiencia_tipo;
  const valor = String(d.audiencia_valor || "");
  let audiencia_valor = "";
  let audiencia_desc = "";

  if (tipo === "todos") {
    audiencia_valor = "todos";
    audiencia_desc = "Toda la escuela";
  } else if (tipo === "salon") {
    const s = salones.find((x) => norm(x) === norm(valor));
    if (s) {
      audiencia_valor = s;
      audiencia_desc = `Salón ${s}`;
    }
  } else if (tipo === "grado") {
    const g = grados.find((x) => x === valor.replace(/\D/g, ""));
    if (g) {
      audiencia_valor = g;
      audiencia_desc = `Grado ${g}`;
    }
  } else if (tipo === "individual") {
    const elegidos = valor
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => lista.find((s) => s.id === v) || lista.find((s) => norm(s.nombre).includes(norm(v))))
      .filter((s): s is NonNullable<typeof s> => !!s);
    const unicos = [...new Map(elegidos.map((s) => [s.id, s])).values()];
    if (unicos.length) {
      audiencia_valor = unicos.map((s) => s.id).join(",");
      audiencia_desc = unicos.map((s) => s.nombre).join(", ");
    }
  }

  if (!audiencia_valor) {
    return NextResponse.json({
      encontrado: false,
      nota: "No pude identificar a quién va el aviso. Menciona el salón (ej. 10A), el grado o el nombre del estudiante.",
      raw,
    });
  }
  return NextResponse.json({
    ...d,
    urgencia: d.urgencia === "alta" ? "alta" : "normal",
    audiencia_valor,
    audiencia_desc,
    raw,
  });
}

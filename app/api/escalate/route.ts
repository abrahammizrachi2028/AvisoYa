import { NextResponse } from "next/server";
import { preguntarJSON } from "@/lib/ai";
import { db } from "@/lib/supabase";
import { exigirAdmin } from "@/lib/adminAuth";
import { pushToStudent } from "@/lib/push";
import type { EscalationAction } from "@/lib/types";

const WINDOW_MIN = 10; // minutos sin ver antes de considerar escalar

type Body = { announcementId?: string; ignoreWindow?: boolean };

function minutesBetween(fromISO: string, toISO: string) {
  return Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 60000);
}

// Resumen del comportamiento reciente del estudiante para darle contexto a la IA.
function behaviorSummary(
  history: { acknowledged_at: string | null; created_at: string }[]
): string {
  if (!history.length) return "Sin historial previo de avisos.";
  const total = history.length;
  const acked = history.filter((h) => h.acknowledged_at);
  const rate = Math.round((acked.length / total) * 100);
  if (!acked.length) {
    return `De sus últimos ${total} avisos no marcó ninguno como visto.`;
  }
  const latencies = acked.map((h) => minutesBetween(h.created_at, h.acknowledged_at!));
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  return `Vio ${acked.length}/${total} de sus avisos recientes (${rate}%), con demora promedio de ~${avg} min.`;
}

const SYSTEM = `Eres el motor de escalamiento de AvisoYa, una app de avisos escolares.
Un estudiante NO ha marcado como visto un aviso URGENTE. Decide qué hacer.
Acciones posibles:
- "reenviar": reenviar la notificación push ahora (útil si probablemente no la vio pero suele responder).
- "tutor": avisar al tutor/encargado (útil si el evento es inminente y el estudiante no suele ver avisos).
- "resaltar": dejarlo resaltado con máxima prioridad pero sin molestar más (útil si aún hay tiempo).
- "ninguna": esperar, no escalar todavía (útil si pasó muy poco tiempo o el evento es lejano).
Responde SOLO con JSON válido, sin texto adicional: {"action":"...","reason":"una línea en español"}`;

export async function POST(req: Request) {
  const no = exigirAdmin(req);
  if (no) return no;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en .env.local" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const now = new Date();

  let q = db
    .from("notifications")
    .select(
      "id, created_at, student_id, announcement_id, announcements!inner(texto,hora_evento,urgencia,created_at), students(nombre,tutor)"
    )
    .is("acknowledged_at", null)
    .eq("escalated", false)
    .eq("announcements.urgencia", "alta");

  if (body.announcementId) q = q.eq("announcement_id", body.announcementId);
  if (!body.ignoreWindow) {
    q = q.lt("created_at", new Date(now.getTime() - WINDOW_MIN * 60000).toISOString());
  }

  const { data: pending, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ decisiones: [], mensaje: "No hay avisos urgentes pendientes de escalar." });

  // Historial reciente de todos los estudiantes involucrados (1 sola query).
  const studentIds = [...new Set(pending.map((p) => p.student_id))];
  const { data: histRows } = await db
    .from("notifications")
    .select("student_id, acknowledged_at, created_at")
    .in("student_id", studentIds)
    .order("created_at", { ascending: false });

  const histByStudent = new Map<string, { acknowledged_at: string | null; created_at: string }[]>();
  for (const h of histRows || []) {
    const arr = histByStudent.get(h.student_id) || [];
    if (arr.length < 8) arr.push({ acknowledged_at: h.acknowledged_at, created_at: h.created_at });
    histByStudent.set(h.student_id, arr);
  }

  const decisiones = [];

  for (const p of pending) {
    const ann = p.announcements as unknown as {
      texto: string;
      hora_evento: string | null;
      created_at: string;
    };
    const student = p.students as unknown as { nombre: string; tutor: string | null };

    const minSinVer = minutesBetween(ann.created_at, now.toISOString());
    const minHastaEvento =
      ann.hora_evento != null ? minutesBetween(now.toISOString(), ann.hora_evento) : null;
    const comportamiento = behaviorSummary(histByStudent.get(p.student_id) || []);

    const userMsg = `Aviso: "${ann.texto}"
Estudiante: ${student.nombre} (tutor: ${student.tutor || "sin tutor"})
Minutos desde que se envió sin verlo: ${minSinVer}
Minutos hasta el evento: ${minHastaEvento === null ? "sin hora definida" : minHastaEvento}
Comportamiento reciente: ${comportamiento}`;

    let action: EscalationAction = "resaltar";
    let reason = "Decisión por defecto (no se pudo interpretar la respuesta de la IA).";

    try {
      const { data } = await preguntarJSON({ system: SYSTEM, texto: userMsg, maxTokens: 512 });
      const parsed = data as { action: EscalationAction; reason: string };
      if (["reenviar", "tutor", "resaltar", "ninguna"].includes(parsed.action)) {
        action = parsed.action;
        reason = String(parsed.reason || reason);
      }
    } catch (e) {
      // Si la IA falla, se queda con el default seguro ("resaltar"): nunca se
      // deja la notificación sin decidir ni se corta el lote entero.
      console.error("[escalate] IA falló para un estudiante:", e);
    }

    if (action === "reenviar") {
      await pushToStudent(p.student_id, {
        title: "⚠️ Recordatorio urgente",
        body: ann.texto,
        url: "/avisos",
      });
    }

    await db
      .from("notifications")
      .update({ escalated: true, escalation_action: action, escalation_reason: reason })
      .eq("id", p.id);

    // El tutor se devuelve porque la acción "tutor" es una instrucción para el
    // admin: el sistema no contacta tutores, solo lo recomienda y lo registra.
    decisiones.push({ estudiante: student.nombre, action, reason, tutor: student.tutor });
  }

  return NextResponse.json({ decisiones });
}

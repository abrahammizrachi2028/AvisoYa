import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

// Avisos que recibió un estudiante, con su estado visto/no visto.
export async function GET(req: Request) {
  const studentId = new URL(req.url).searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "Falta studentId" }, { status: 400 });
  }

  const { data, error } = await db
    .from("notifications")
    .select("id, acknowledged_at, escalation_action, announcements(*)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const feed = (data || []).map((n) => {
    const a = n.announcements as unknown as Record<string, unknown>;
    return {
      notificationId: n.id,
      visto: !!n.acknowledged_at,
      resaltado: n.escalation_action === "resaltar" || n.escalation_action === "reenviar",
      texto: a.texto,
      lugar: a.lugar,
      hora_evento: a.hora_evento,
      urgencia: a.urgencia,
      created_at: a.created_at,
    };
  });

  return NextResponse.json({ feed });
}

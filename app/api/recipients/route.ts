import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { exigirAdmin } from "@/lib/adminAuth";

// Detalle de un anuncio: cada destinatario, si lo vio, y qué se escaló.
export async function GET(req: Request) {
  const no = exigirAdmin(req);
  if (no) return no;

  const announcementId = new URL(req.url).searchParams.get("announcementId");
  if (!announcementId) {
    return NextResponse.json({ error: "Falta announcementId" }, { status: 400 });
  }

  const { data, error } = await db
    .from("notifications")
    .select(
      "id, acknowledged_at, escalated, escalation_action, escalation_reason, students(nombre, salon, tutor)"
    )
    .eq("announcement_id", announcementId)
    .order("acknowledged_at", { ascending: true, nullsFirst: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipients = (data || []).map((n) => {
    const s = n.students as unknown as { nombre: string; salon: string; tutor: string | null };
    return {
      nombre: s?.nombre ?? "—",
      salon: s?.salon ?? "—",
      tutor: s?.tutor ?? null,
      visto: !!n.acknowledged_at,
      acknowledged_at: n.acknowledged_at,
      escalated: n.escalated,
      escalation_action: n.escalation_action,
      escalation_reason: n.escalation_reason,
    };
  });

  return NextResponse.json({ recipients });
}

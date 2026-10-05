import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

// Marca un aviso como visto por el estudiante.
export async function POST(req: Request) {
  const { notificationId } = (await req.json()) as { notificationId: string };
  if (!notificationId) {
    return NextResponse.json({ error: "Falta notificationId" }, { status: 400 });
  }

  const { error } = await db
    .from("notifications")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("acknowledged_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

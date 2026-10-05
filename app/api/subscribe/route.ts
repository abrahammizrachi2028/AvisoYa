import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

type Body = {
  studentId: string;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
};

// Guarda (o actualiza) la suscripción push del dispositivo del estudiante.
export async function POST(req: Request) {
  const { studentId, subscription } = (await req.json()) as Body;
  if (!studentId || !subscription?.endpoint) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  const { error } = await db.from("push_subscriptions").upsert(
    {
      student_id: studentId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

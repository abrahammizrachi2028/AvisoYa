import webpush from "web-push";
import { db } from "./supabase";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:avisoya@iae.edu",
    publicKey,
    privateKey
  );
}

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

// Sends a push to every subscription of a student. Dead subscriptions
// (410/404) are pruned so they don't accumulate.
export async function pushToStudent(studentId: string, payload: PushPayload) {
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("*")
    .eq("student_id", studentId);

  if (!subs?.length) return { sent: 0 };

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
  return { sent };
}

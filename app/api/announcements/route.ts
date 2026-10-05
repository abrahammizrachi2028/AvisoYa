import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { exigirAdmin } from "@/lib/adminAuth";
import { pushToStudent } from "@/lib/push";
import type { Urgencia } from "@/lib/types";

type Body = {
  texto: string;
  lugar?: string;
  hora_evento?: string | null;
  urgencia: Urgencia;
  audiencia_tipo: "todos" | "grado" | "salon" | "individual";
  audiencia_valor: string; // grado, salon, o student ids separados por coma
};

// Crea el anuncio, resuelve la audiencia manual, inserta una notificación por
// estudiante y le manda push a cada uno.
export async function POST(req: Request) {
  const no = exigirAdmin(req);
  if (no) return no;

  const body = (await req.json()) as Body;

  if (!body.texto?.trim()) {
    return NextResponse.json({ error: "El texto es obligatorio" }, { status: 400 });
  }

  // Resolver audiencia -> lista de estudiantes
  let studentQuery = db.from("students").select("id, nombre");
  let audienciaDesc = "";

  if (body.audiencia_tipo === "todos") {
    // Toda la escuela: sin filtro.
    audienciaDesc = "Toda la escuela";
  } else if (body.audiencia_tipo === "grado") {
    studentQuery = studentQuery.eq("grado", body.audiencia_valor);
    audienciaDesc = `Grado ${body.audiencia_valor}`;
  } else if (body.audiencia_tipo === "salon") {
    studentQuery = studentQuery.eq("salon", body.audiencia_valor);
    audienciaDesc = `Salón ${body.audiencia_valor}`;
  } else {
    const ids = body.audiencia_valor.split(",").map((s) => s.trim()).filter(Boolean);
    studentQuery = studentQuery.in("id", ids);
    audienciaDesc = `${ids.length} estudiante(s)`;
  }

  const { data: students, error: sErr } = await studentQuery;
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!students?.length) {
    return NextResponse.json({ error: "La audiencia no tiene estudiantes" }, { status: 400 });
  }

  const { data: ann, error: aErr } = await db
    .from("announcements")
    .insert({
      texto: body.texto.trim(),
      lugar: body.lugar?.trim() || null,
      hora_evento: body.hora_evento || null,
      urgencia: body.urgencia,
      audiencia_desc: audienciaDesc,
    })
    .select()
    .single();

  if (aErr || !ann) {
    return NextResponse.json({ error: aErr?.message || "No se creó" }, { status: 500 });
  }

  const rows = students.map((s) => ({ announcement_id: ann.id, student_id: s.id }));
  const { error: nErr } = await db.from("notifications").insert(rows);
  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  const title = body.urgencia === "alta" ? "⚠️ Aviso urgente" : "Aviso escolar";
  const bodyText = body.lugar ? `${body.texto} — ${body.lugar}` : body.texto;
  const results = await Promise.all(
    students.map((s) =>
      pushToStudent(s.id, { title, body: bodyText, url: "/avisos", tag: ann.id })
    )
  );
  const pushSent = results.reduce((n, r) => n + r.sent, 0);

  return NextResponse.json({
    ok: true,
    announcementId: ann.id,
    destinatarios: students.length,
    pushSent,
  });
}

// Lista de anuncios con conteo total / vistos para el historial.
export async function GET(req: Request) {
  const no = exigirAdmin(req);
  if (no) return no;

  // Antes se leían TODAS las notificaciones de la base para contar vistos, aunque
  // solo se muestren los últimos avisos. Ahora se acota a los que se van a mostrar.
  const LIMITE = 50;
  const { data: anns, error } = await db
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIMITE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (anns || []).map((a) => a.id);
  const { data: notifs } = ids.length
    ? await db
        .from("notifications")
        .select("announcement_id, acknowledged_at, escalated")
        .in("announcement_id", ids)
    : { data: [] };

  // "pendientes" = lo único sobre lo que /api/escalate puede actuar: sin ver y
  // sin revisar todavía. Sin este número el botón de la IA queda sin trabajo.
  const stats = new Map<string, { total: number; vistos: number; escalados: number; pendientes: number }>();
  for (const n of notifs || []) {
    const s = stats.get(n.announcement_id) || { total: 0, vistos: 0, escalados: 0, pendientes: 0 };
    s.total++;
    if (n.acknowledged_at) s.vistos++;
    if (n.escalated) s.escalados++;
    if (!n.acknowledged_at && !n.escalated) s.pendientes++;
    stats.set(n.announcement_id, s);
  }

  const out = (anns || []).map((a) => ({
    ...a,
    ...(stats.get(a.id) || { total: 0, vistos: 0, escalados: 0, pendientes: 0 }),
  }));

  return NextResponse.json({ announcements: out });
}

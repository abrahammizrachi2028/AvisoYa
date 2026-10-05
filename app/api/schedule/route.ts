import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { exigirAdmin } from "@/lib/adminAuth";
import { hoyISO, lunesDe, semanaDe } from "@/lib/horario";

type Ovr = Record<string, unknown> & { dia: number; periodo: number; fecha: string; track: string };

// Horario de un salón (modo admin, track 'base') o el horario efectivo de un
// estudiante (base MYP + sus AP). Con semana=1 trae los cambios de UNA semana
// calendario: la del lunes que se pida en `lunes`, o la actual por defecto.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId");
  const salonParam = url.searchParams.get("salon");
  // El modo admin (?salon=) muestra el horario de un salón entero: solo admin.
  // El modo estudiante (?studentId=) sigue abierto, como el resto de su vista.
  if (salonParam) {
    const no = exigirAdmin(req);
    if (no) return no;
  }
  const semana = url.searchParams.get("semana") === "1";
  const fecha = url.searchParams.get("fecha");

  // La semana que se está viendo. Sin parámetro, la actual (nunca una futura).
  const lunesPedido = url.searchParams.get("lunes");
  const lunes = /^\d{4}-\d{2}-\d{2}$/.test(lunesPedido || "") ? lunesDe(lunesPedido!) : lunesDe(hoyISO());
  const fechas = semanaDe(lunes);
  // override de la semana visible: solo cuenta si su fecha es la de esa columna
  const fechasPedidas = semana ? Object.values(fechas) : fecha ? [fecha] : [];
  const vigente = (o: Ovr) => (semana ? fechas[o.dia] === o.fecha : true);

  const { data: periods } = await db.from("periods").select("*").order("orden");

  // --- Modo estudiante: horario efectivo ---
  if (studentId) {
    const { data: student } = await db.from("students").select("salon").eq("id", studentId).maybeSingle();
    if (!student) return NextResponse.json({ error: "Estudiante no encontrado" }, { status: 404 });
    const salon = student.salon;

    const [{ data: enroll }, { data: allSlots }] = await Promise.all([
      db.from("student_courses").select("course").eq("student_id", studentId),
      db.from("schedule_slots").select("*").eq("salon", salon),
    ]);
    const courses = new Set((enroll || []).map((e) => e.course));

    const byCell = new Map<string, { base?: Record<string, unknown>; ap?: Record<string, unknown> }>();
    for (const s of allSlots || []) {
      const key = `${s.dia}-${s.periodo}`;
      const cell = byCell.get(key) || {};
      if (s.track === "base") cell.base = s;
      else if (courses.has(s.track)) cell.ap = s;
      byCell.set(key, cell);
    }
    const slots = [];
    const trackDe = new Map<string, string>();
    for (const [key, cell] of byCell) {
      const eff = cell.ap || cell.base;
      if (eff) {
        slots.push(eff);
        trackDe.set(key, (eff.track as string) || "base");
      }
    }

    let overrides: Ovr[] = [];
    if (fechasPedidas.length) {
      const { data } = await db
        .from("schedule_overrides")
        .select("*")
        .eq("salon", salon)
        .in("fecha", fechasPedidas);
      const miTrack = `student:${studentId}`;
      // Por celda: el cambio específico del estudiante gana sobre el del salón.
      const porCelda = new Map<string, Ovr>();
      for (const o of (data as Ovr[]) || []) {
        if (!vigente(o)) continue;
        const key = `${o.dia}-${o.periodo}`;
        const esMio = o.track === miTrack;
        const esSalon = trackDe.get(key) === o.track;
        if (!esMio && !esSalon) continue;
        if (!porCelda.get(key) || esMio) porCelda.set(key, o);
      }
      overrides = [...porCelda.values()];
    }

    return NextResponse.json({ periods: periods || [], slots, overrides, fechas, lunes });
  }

  // --- Modo admin: horario base del salón ---
  if (!salonParam) return NextResponse.json({ error: "Falta salon o studentId" }, { status: 400 });

  const { data: slots } = await db
    .from("schedule_slots")
    .select("*")
    .eq("salon", salonParam)
    .eq("track", "base");

  let overrides: Ovr[] = [];
  let individuales: Ovr[] = [];
  if (fechasPedidas.length) {
    const { data } = await db
      .from("schedule_overrides")
      .select("*")
      .eq("salon", salonParam)
      .in("fecha", fechasPedidas);
    const vig = ((data as Ovr[]) || []).filter(vigente);
    overrides = vig.filter((o) => o.track === "base");
    individuales = vig.filter((o) => o.track.startsWith("student:"));
  }

  return NextResponse.json({
    periods: periods || [],
    slots: slots || [],
    overrides,
    individuales,
    fechas,
    lunes,
  });
}

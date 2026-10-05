// Carga el horario base (grado 10) desde la foto de la escuela.
// Correr con:  node --env-file=.env.local scripts/seed_horario.mjs
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Sin nombres reales de profesores (regla de privacidad del concurso).
const periods = [
  [1, "Rezo", "07:15", "08:00", true],
  [2, "Periodo 2", "08:05", "08:45", true],
  [3, "Periodo 3", "08:50", "09:30", true],
  [4, "Recreo", "09:30", "09:55", false],
  [5, "Periodo 4", "09:55", "10:35", true],
  [6, "Periodo 5", "10:40", "11:20", true],
  [7, "Periodo 6", "11:25", "12:05", true],
  [8, "Periodo 7", "12:10", "12:50", true],
  [9, "Almuerzo", "12:50", "13:25", false],
  [10, "Periodo 9", "13:30", "14:05", true],
  [11, "Periodo 10", "14:10", "14:50", true],
  [12, "Periodo 11", "14:55", "15:30", true],
];

// [dia, periodo, materia, sala]  dia: 1=Lun..5=Vie
const grid = [
  // Lunes
  [1, 1, "10 REZ-M", "Sinagoga Grande"],
  [1, 2, "10 Cons 26-A", "222"],
  [1, 3, "10 AP Cal-26-A", "10 MAT MYP 26-A"],
  [1, 5, "10 HEBREO 26-A", "203"],
  [1, 6, "10 FIS 26-A", "116"],
  [1, 7, "10 HIS HEB 26-A", "196"],
  [1, 8, "10 UCP 26-A", "200"],
  [1, 10, "10 ED Fis MYP 26-M1", "CANCHA"],
  [1, 11, "10 AP SEM-26-A", "10 BA MYP 26-A"],
  [1, 12, "10 AP SEM-26-A", "10 ESP MYP 26-A"],
  // Martes
  [2, 1, "10 REZ-M", "Sinagoga Grande"],
  [2, 2, "10 AP Cal-26-A", "10 MAT MYP 26-A"],
  [2, 3, "10 TEC MYP 26-A", "MakerSpacer 1"],
  [2, 5, "10 HIS HEB 26-A", "196"],
  [2, 6, "10 TORAH 26-A", "197"],
  [2, 7, "10 AP SEM-26-A", "10 ESP MYP 26-A"],
  [2, 8, "10 TUSHBA 26-M1", "217"],
  [2, 10, "10 FIS 26-A", "116"],
  [2, 11, "10 AP SEM-26-A", "10 BA MYP 26-A"],
  [2, 12, "10 UCP 26-A", "200"],
  // Miércoles
  [3, 1, "10 REZ-M", "Sinagoga Grande"],
  [3, 2, "10 HIS HEB 26-A", "196"],
  [3, 3, "10 AP Cal-26-A", "10 MAT MYP 26-A"],
  [3, 5, "10 ESP MYP 26-A", "216"],
  [3, 6, "10 JA/MU 26-A", "197"],
  [3, 7, "10 HEBREO 26-A", "203"],
  [3, 8, "10 HU MYP 26-A", "192"],
  [3, 10, "10 ED Fis MYP 26-M1", "CANCHA"],
  [3, 11, "10 UCP 26-A", "200"],
  [3, 12, "10 AP SEM-26-A", "10 ESP MYP 26-A"],
  // Jueves
  [4, 1, "10 REZ-M", "Sinagoga Grande"],
  [4, 2, "10 AP Cal-26-A", "10 MAT MYP 26-A"],
  [4, 3, "10 NAVI 26-A", "197"],
  [4, 5, "10 HU MYP 26-A", "192"],
  [4, 6, "10 FIS 26-A", "116"],
  [4, 7, "10 Cons 26-A", "222"],
  [4, 8, "10 TUSHBA 26-M1", "217"],
  [4, 10, "10 TEC MYP 26-A", "MakerSpacer 1"],
  [4, 11, "10 AP SEM-26-A", "10 ESP MYP 26-A"],
  [4, 12, "10 UCP 26-A", "200"],
  // Viernes (sin tarde)
  [5, 1, "10 REZ-M", "Sinagoga Grande"],
  [5, 2, "10 HEBREO 26-A", "203"],
  [5, 3, "10 UCP 26-A", "200"],
  [5, 5, "10 FIS 26-A", "116"],
  [5, 6, "10 TEC MYP 26-A", "MakerSpacer 1"],
  [5, 7, "10 AP Cal-26-A", "10 MAT MYP 26-A"],
  [5, 8, "10 TORAH 26-A", "197"],
];

const salones = ["10A", "10B"]; // el grado 10 comparte esta grilla

async function main() {
  // periods
  await db.from("periods").upsert(
    periods.map(([orden, etiqueta, hora_inicio, hora_fin, es_clase]) => ({
      orden,
      etiqueta,
      hora_inicio,
      hora_fin,
      es_clase,
    }))
  );

  // Slots con tracks: base (MYP/regular) + variantes AP.
  // Regla: si la "sala" empieza con "10 " es un código de materia (celda AP):
  //   base = la materia MYP (lo rojo), AP = la materia AP (lo negro).
  // Si no, es un aula/lugar normal: base = la materia (negro) con su sala.
  await db.from("schedule_slots").delete().in("salon", salones);
  const rows = [];
  const apCourses = new Set();
  for (const salon of salones) {
    for (const [dia, periodo, materia, sala] of grid) {
      const esAP = typeof sala === "string" && sala.startsWith("10 ");
      if (esAP) {
        rows.push({ salon, dia, periodo, materia: sala, sala: null, track: "base" }); // MYP base
        rows.push({ salon, dia, periodo, materia, sala: null, track: materia }); // AP
        apCourses.add(materia);
      } else {
        rows.push({ salon, dia, periodo, materia, sala, track: "base" });
      }
    }
  }
  const { error } = await db.from("schedule_slots").insert(rows);
  if (error) {
    console.error("Error insertando slots:", error.message);
    process.exit(1);
  }

  // Inscripciones AP de demo: unos estudiantes toman AP, otros solo MYP.
  const { data: students } = await db
    .from("students")
    .select("id, nombre, salon")
    .in("salon", salones)
    .order("salon")
    .order("nombre");
  const courses = [...apCourses]; // ["10 AP Cal-26-A", "10 AP SEM-26-A"]
  await db.from("student_courses").delete().in("student_id", (students || []).map((s) => s.id));
  const enroll = [];
  const bySalon = {};
  for (const s of students || []) (bySalon[s.salon] ||= []).push(s);
  for (const salon of salones) {
    const list = bySalon[salon] || [];
    list.forEach((s, i) => {
      if (i === 0) courses.forEach((c) => enroll.push({ student_id: s.id, course: c })); // ambos AP
      else if (i === 1 && courses[0]) enroll.push({ student_id: s.id, course: courses[0] }); // AP Cal
      else if (i === 2 && courses[1]) enroll.push({ student_id: s.id, course: courses[1] }); // AP Sem
      // el resto: solo MYP base
    });
  }
  if (enroll.length) await db.from("student_courses").insert(enroll);

  console.log(
    `OK: ${periods.length} periodos, ${rows.length} slots (${courses.length} cursos AP), ${enroll.length} inscripciones en ${salones.join(", ")}`
  );
}

main();

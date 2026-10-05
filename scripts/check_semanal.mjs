// Los 10 casos del sistema semanal, de punta a punta contra el dev server.
//   npm run dev  (en otra terminal)
//   node --env-file=.env.local scripts/check_semanal.mjs
// Crea datos de prueba en una materia y semanas concretas, y los borra al final.
import assert from "node:assert/strict";
import { lunesDe, semanaDe, semanaDesplazada } from "../lib/horario.ts";

const BASE = process.env.BASE || "http://localhost:3001";
const SALON = "10A";
const DIA = 4; // jueves: no lo usa ningún dato real de la app
const PERIODO = 3; // 08:50

let fallos = 0;
const ok = (n, cond, extra = "") => {
  console.log(`${cond ? "  ok  " : "  FALLA "} ${n}${extra ? " — " + extra : ""}`);
  if (!cond) fallos++;
};

const login = await fetch(BASE + "/api/profesor-login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ passcode: process.env.PROFESOR_PASSCODE || "avisolab" }),
});
const COOKIE = (login.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
if (!(await login.json()).ok) {
  console.error("No se pudo entrar como admin.");
  process.exit(1);
}

const api = (path, body) =>
  fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const semana = (lunes) =>
  fetch(`${BASE}/api/schedule?salon=${SALON}&semana=1&lunes=${lunes}`, {
    headers: { Cookie: COOKIE },
  }).then((r) => r.json());

/** Qué le pasa a la clase de prueba en esa semana: null = normal. */
const estado = async (lunes) => {
  const d = await semana(lunes);
  assert.equal(d.lunes, lunes, "la API devolvió otra semana");
  const o = d.overrides.find((x) => x.dia === DIA && x.periodo === PERIODO);
  return o ? o.tipo + (o.sala ? `:${o.sala}` : "") : null;
};

// Se guardan los avisos creados para borrarlos al final.
const creados = [];
const aplicar = async (cambios, texto) => {
  const r = await api("/api/schedule/change", { salon: SALON, cambios, texto });
  if (r.announcementId) creados.push(r.announcementId);
  return r;
};
const cambio = (extra) => ({ dia: DIA, periodo: PERIODO, track: "base", scope: "fecha", ...extra });

const L0 = lunesDe(new Date().toISOString().slice(0, 10));
const L = (n) => semanaDesplazada(L0, n);
const F = (n) => semanaDe(L(n))[DIA];

console.log(`Semana actual: ${L0} · clase de prueba: jueves periodo ${PERIODO}\n`);

console.log("Caso 6 — semana actual por defecto");
const sinParam = await fetch(`${BASE}/api/schedule?salon=${SALON}&semana=1`, { headers: { Cookie: COOKIE } }).then((r) => r.json());
ok("sin parámetro devuelve la semana actual", sinParam.lunes === L0, sinParam.lunes);
ok("los 5 días son de la misma semana", Object.values(sinParam.fechas).every((f, i) => f === semanaDe(L0)[i + 1]));

console.log("\nCaso 1 — cambio de una sola semana");
await aplicar([cambio({ fecha: F(0), tipo: "cancelacion" })]);
ok("semana actual: cancelada", (await estado(L(0))) === "cancelacion");
ok("semana +1: normal", (await estado(L(1))) === null);
ok("semana +2: normal", (await estado(L(2))) === null);

console.log("\nCaso 2 — cambio durante 4 semanas");
const r4 = await aplicar([cambio({ fecha: F(1), tipo: "cambio", sala: "901", repetir_hasta: F(4) })]);
ok("se aplicó en 4 semanas", r4.aplicados === 4, `aplicados=${r4.aplicados}`);
ok("un solo aviso con el rango", /cada jueves hasta/.test(r4.mensaje || ""), (r4.mensaje || "").slice(0, 80));
for (const n of [1, 2, 3, 4]) ok(`semana +${n}: sala 901`, (await estado(L(n))) === "cambio:901");

console.log("\nCaso 7 — el cambio termina donde dice");
ok("semana +5: normal", (await estado(L(5))) === null);

console.log("\nCaso 3 — excepción en una sola semana de la serie");
await aplicar([cambio({ fecha: F(3), tipo: "cancelacion" })]);
ok("semana +3 pasa a cancelada", (await estado(L(3))) === "cancelacion");
ok("semana +2 sigue en 901", (await estado(L(2))) === "cambio:901");
ok("semana +4 sigue en 901", (await estado(L(4))) === "cambio:901");

console.log("\nCaso 8 — dos cambios distintos para la misma clase y semana");
await aplicar([cambio({ fecha: F(2), tipo: "cambio", sala: "902" })]);
ok("gana el último, no se duplica", (await estado(L(2))) === "cambio:902");
const dup = await semana(L(2));
ok("una sola fila por celda", dup.overrides.filter((o) => o.dia === DIA && o.periodo === PERIODO).length === 1);

console.log("\nCaso 9 — clases distintas en las mismas semanas");
await aplicar([{ dia: DIA, periodo: 2, track: "base", scope: "fecha", fecha: semanaDe(L(1))[DIA], tipo: "cancelacion", repetir_hasta: semanaDe(L(2))[DIA] }]);
const s1 = await semana(L(1));
ok("conviven las dos clases", s1.overrides.some((o) => o.periodo === 2) && s1.overrides.some((o) => o.periodo === PERIODO));

console.log("\nCaso 4 — semana futura sin cambios");
const lejana = await semana(L(8));
ok("se puede ver aunque esté vacía", lejana.periods.length > 0 && lejana.slots.length > 0);
ok("no inventa cambios", lejana.overrides.length === 0, `${lejana.overrides.length} overrides`);

console.log("\nCaso 5 — semana pasada conserva su historial");
await aplicar([cambio({ fecha: F(-1), tipo: "cancelacion" })]);
ok("la semana pasada guarda su cambio", (await estado(L(-1))) === "cancelacion");
ok("no se filtra a la semana actual", (await estado(L(0))) === "cancelacion"); // el del caso 1 sigue ahí
ok("no se filtra a la semana +6", (await estado(L(6))) === null);

console.log("\nCaso 10 — saltar entre semanas no mezcla información");
const saltos = await Promise.all([L(-1), L(0), L(1), L(2), L(5), L(8)].map(semana));
ok(
  "cada respuesta trae su propia semana",
  saltos.every((d, i) => d.lunes === [L(-1), L(0), L(1), L(2), L(5), L(8)][i])
);
ok(
  "ningún override cae fuera de su semana",
  saltos.every((d) => d.overrides.every((o) => Object.values(d.fechas).includes(o.fecha)))
);

// --- limpieza ---
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const fechasPrueba = [-1, 0, 1, 2, 3, 4, 5].map((n) => semanaDe(L(n))[DIA]);
for (const f of fechasPrueba) {
  await db.from("schedule_overrides").delete().eq("fecha", f).in("periodo", [PERIODO, 2]);
}
for (const id of creados) {
  await db.from("notifications").delete().eq("announcement_id", id);
  await db.from("announcements").delete().eq("id", id);
}
console.log(`\n(limpiado: ${fechasPrueba.length} fechas y ${creados.length} avisos de prueba)`);

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien: sistema semanal");
process.exit(fallos ? 1 : 0);

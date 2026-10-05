// Prueba la IA de punta a punta contra el servidor de desarrollo.
//   npm run dev   (en otra terminal)
//   node --env-file=.env.local scripts/check_ai.mjs
// No escribe nada: /interpret solo propone, no aplica cambios.
const BASE = process.env.BASE || "http://localhost:3001";

// Los endpoints de IA y el roster son de admin: hay que iniciar sesión primero.
const login = await fetch(BASE + "/api/profesor-login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ passcode: process.env.PROFESOR_PASSCODE || "avisolab" }),
});
const COOKIE = (login.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
if (!(await login.json()).ok) {
  console.error("No se pudo entrar como admin. Revisa PROFESOR_PASSCODE en .env.local.");
  process.exit(1);
}

let fallos = 0;
const ok = (n, cond, extra = "") => {
  console.log(`${cond ? "  ok " : "  FALLA "} ${n}${extra ? " — " + extra : ""}`);
  if (!cond) fallos++;
};

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: COOKIE },
    body: JSON.stringify(body),
  });
  return r.json();
}
const horario = (texto, previo = null, salon) => post("/api/schedule/interpret", { salon, texto, previo });
const resumen = (d) => (d.cambios || []).map((c) => `${c.resumen} [${c.detalle}]`).join(" | ") || d.aviso;

const { students } = await fetch(BASE + "/api/roster", { headers: { Cookie: COOKIE } }).then((r) => r.json());
const salon = students[0].salon;
console.log(`Salón de prueba: ${salon}\n`);

console.log("1. Sencilla");
let d = await horario("Cancela la clase de Física del martes", null, salon);
console.log("   →", resumen(d));
ok("un solo cambio", d.cambios?.length === 1, `${d.cambios?.length} cambios`);
ok("es una cancelación", d.cambios?.[0]?.tipo === "cancelacion");
ok("cae en martes", d.cambios?.[0]?.dia === 2);

console.log("\n2. Varias instrucciones (5 pedidos)");
d = await horario(
  "Física del lunes pasa a la sala 300, cancela Torá del viernes, en Hebreo del miércoles hay prueba de Duolingo, Español del jueves se muda a la 410 y Matemáticas del martes cambia a la sala 205",
  null,
  salon
);
console.log("   →", resumen(d));
ok("5 cambios", d.cambios?.length === 5, `${d.cambios?.length} cambios`);
ok("hay una cancelación", d.cambios?.some((c) => c.tipo === "cancelacion"));
ok("hay una anotación", d.cambios?.some((c) => c.tipo === "evento"));
ok("hay 3 cambios de sala", d.cambios?.filter((c) => c.sala).length === 3);

console.log("\n3. Contexto (\"ahora cambia X de lo anterior\")");
const p1 = await horario("Física del lunes pasa a la sala 300", null, salon);
const prev = { texto: "Física del lunes pasa a la sala 300", respuesta: p1.raw };
d = await horario("ahora que sea la sala 500", prev, salon);
console.log("   →", resumen(d));
ok("sigue siendo un cambio", d.cambios?.length === 1);
ok("aplicó la nueva sala", d.cambios?.[0]?.sala === "500", `sala=${d.cambios?.[0]?.sala}`);
ok("mantuvo el día lunes", d.cambios?.[0]?.dia === 1);

console.log("\n4. Solicitud larga con condiciones");
d = await horario(
  "Para la semana que viene reorganiza esto: como vienen los de acreditación, el lunes la clase de Física se hace en el auditorio que es la sala 700; el martes de Matemáticas no hay clase porque los profesores tienen reunión; y el jueves, en la hora de Hebreo, avisa que habrá una visita guiada de 20 minutos. Todo lo demás queda igual.",
  null,
  salon
);
console.log("   →", resumen(d));
ok("Física a la 700 el lunes", d.cambios?.some((c) => c.sala === "700" && c.dia === 1));
ok("Matemáticas cancelada el martes", d.cambios?.some((c) => c.tipo === "cancelacion" && c.dia === 2));
// No hay Hebreo el jueves: debe avisarlo, no mover la anotación a otro día.
ok("no inventa el Hebreo del jueves", !d.cambios?.some((c) => c.tipo === "evento" && c.dia !== 4));
ok("avisa que ese pedido no se pudo", !!d.aviso, d.aviso || "sin aviso");

console.log("\n5. Corrección de una sola parte");
const t5 = "Cancela Física del lunes y manda Español del jueves a la sala 410";
const p5 = await horario(t5, null, salon);
d = await horario("no canceles Física, solo muévela a la sala 210; lo de Español déjalo igual", { texto: t5, respuesta: p5.raw }, salon);
console.log("   →", resumen(d));
ok("siguen siendo 2 cambios", d.cambios?.length === 2, `${d.cambios?.length} cambios`);
ok("Física ya no se cancela", !d.cambios?.some((c) => c.tipo === "cancelacion"));
ok("Física va a la 210", d.cambios?.some((c) => c.sala === "210" && c.dia === 1));
ok("Español sigue en la 410", d.cambios?.some((c) => c.sala === "410" && c.dia === 4));

console.log("\n6. Conversación larga (4 turnos)");
let texto = "Física del lunes pasa a la sala 300";
let r = await horario(texto, null, salon);
for (const siguiente of [
  "agrega que Torá del viernes se cancela",
  "la sala de Física ahora es la 305",
  "y en Hebreo del miércoles anota que hay prueba de Duolingo",
]) {
  const previo = { texto, respuesta: r.raw };
  texto = siguiente;
  r = await horario(siguiente, previo, salon);
}
console.log("   →", resumen(r));
ok("acumuló los 3 cambios", r.cambios?.length === 3, `${r.cambios?.length} cambios`);
ok("conserva la sala corregida", r.cambios?.some((c) => c.sala === "305"));
ok("conserva la cancelación del viernes", r.cambios?.some((c) => c.tipo === "cancelacion" && c.dia === 5));
ok("agregó la anotación del miércoles", r.cambios?.some((c) => c.tipo === "evento" && c.dia === 3));

console.log("\n7. Varios salones");
d = await horario("Cancela Torá del viernes", null, salon);
ok("sin decir salón usa solo el actual", d.cambios?.every((c) => c.salon === salon), [...new Set((d.cambios||[]).map(c=>c.salon))].join(","));

d = await horario("Cancela Torá del viernes en todos los salones", null, salon);
const salonesTocados = [...new Set((d.cambios || []).map((c) => c.salon))];
ok("\"todos los salones\" toca más de uno", salonesTocados.length > 1, salonesTocados.join(","));
ok("todos son cancelaciones", d.cambios?.every((c) => c.tipo === "cancelacion"));

d = await horario("Física pasa a la sala 300 en todos los salones de 10mo", null, salon);
const deDecimo = [...new Set((d.cambios || []).map((c) => c.salon))];
ok("\"todo 10mo\" cubre los salones de 10", deDecimo.length > 1 && deDecimo.every((s) => s.startsWith("10")), deDecimo.join(","));
ok("todos van a la sala 300", d.cambios?.every((c) => c.sala === "300"));

console.log("\n8. Jornadas especiales");
d = await horario("el lunes hay salida temprana", null, salon);
const tarde = [...new Set((d.cambios || []).map((c) => c.periodo))].sort((a, b) => a - b);
ok("salida temprana solo toca la tarde", d.cambios?.length > 0 && tarde.every((p) => p >= 10), tarde.join(","));
ok("todas son cancelaciones", d.cambios?.every((c) => c.tipo === "cancelacion"));
ok("manda un solo aviso", /Salida temprana/.test(d.textoLote || ""), d.textoLote || "(sin texto)");

d = await horario("el lunes queda la escuela cancelada", null, salon);
const todoElDia = [...new Set((d.cambios || []).map((c) => c.periodo))];
ok("dia cancelado toca mañana y tarde", todoElDia.some((p) => p < 9) && todoElDia.some((p) => p > 9), todoElDia.sort((a,b)=>a-b).join(","));
ok("el aviso es una sola linea", /Sin clases/.test(d.textoLote || ""), d.textoLote || "(sin texto)");
ok("el aviso no encadena una frase por clase", (d.textoLote || "").split("•").length === 1);

d = await horario("el martes no hay clases en toda la escuela", null, salon);
ok("jornada en toda la escuela cubre los salones", [...new Set((d.cambios||[]).map(c=>c.salon))].length > 1);

console.log("\n9. Semanas");
d = await post("/api/schedule/interpret", { salon, texto: "cancela Torá del viernes", lunes: "2026-10-05" });
ok("resuelve la fecha en la semana que se ve", d.cambios?.[0]?.fecha === "2026-10-09", d.cambios?.[0]?.fecha);

d = await horario("cancela Física del lunes durante las próximas 4 semanas", null, salon);
ok("\"durante 4 semanas\" no es permanente", d.cambios?.every((c) => c.scope === "fecha"));
ok("marca hasta cuándo se repite", !!d.cambios?.[0]?.repetir_hasta, d.cambios?.[0]?.repetir_hasta || "(sin fecha final)");

d = await horario("Español del jueves se muda a la 410 de ahora en adelante", null, salon);
ok("\"de ahora en adelante\" sigue siendo permanente", d.cambios?.some((c) => c.scope === "permanente"));

console.log("\n10. Permisos");
const sinCookie = await fetch(BASE + "/api/schedule/interpret", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ salon, texto: "cancela todo" }),
});
ok("sin sesión de admin devuelve 401", sinCookie.status === 401, `status ${sinCookie.status}`);

console.log("\n11. Errores y ambigüedad");
d = await horario("mmm no sé, algo del horario", null, salon);
ok("no inventa cambios", !d.cambios?.length && !!d.aviso, JSON.stringify(d.aviso));
d = await post("/api/schedule/interpret", { salon, texto: "" });
ok("texto vacío da error claro", !!d.error);

console.log("\n12. Avisos con IA");
d = await post("/api/announcements/interpret", {
  texto: "Avísale a 10A que mañana a las 9am hay simulacro de incendio en la cancha, que lleven su carné y es urgente",
});
console.log("   →", d.texto);
ok("identificó el salón", d.audiencia_valor === "10A", d.audiencia_desc);
ok("marcó urgente", d.urgencia === "alta");
ok("no perdió requisitos", ["9", "cancha", "carné"].every((x) => (d.texto || "").toLowerCase().includes(x.toLowerCase())));

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien");
process.exit(fallos ? 1 : 0);

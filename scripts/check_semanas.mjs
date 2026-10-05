// Cada semana es una semana calendario de verdad, y los rangos multisemana
// generan exactamente las fechas que les toca.
//   node scripts/check_semanas.mjs
import assert from "node:assert/strict";
import {
  etiquetaSemana,
  fechasDeDiaEntre,
  lunesDe,
  semanaDe,
  semanaDesplazada,
} from "../lib/horario.ts";

// El lunes de la semana no se mueve, sea el día que sea.
for (const d of ["2026-09-21", "2026-09-22", "2026-09-25", "2026-09-27"]) {
  assert.equal(lunesDe(d), "2026-09-21", `lunesDe(${d})`);
}
assert.equal(lunesDe("2026-09-28"), "2026-09-28");

// Los cinco días salen de la MISMA semana (el bug viejo mezclaba dos).
assert.deepEqual(semanaDe("2026-09-21"), {
  1: "2026-09-21",
  2: "2026-09-22",
  3: "2026-09-23",
  4: "2026-09-24",
  5: "2026-09-25",
});
// Mirando el viernes, la semana sigue siendo la del 21, no la siguiente.
assert.deepEqual(semanaDe(lunesDe("2026-09-25")), semanaDe("2026-09-21"));

assert.equal(semanaDesplazada("2026-09-21", 1), "2026-09-28");
assert.equal(semanaDesplazada("2026-09-21", -1), "2026-09-14");
assert.equal(semanaDesplazada("2026-09-28", 1), "2026-10-05");

// Rango multisemana: los lunes del 21/09 al 19/10 son 5.
assert.deepEqual(fechasDeDiaEntre(1, "2026-09-21", "2026-10-19"), [
  "2026-09-21",
  "2026-09-28",
  "2026-10-05",
  "2026-10-12",
  "2026-10-19",
]);
// Termina donde dice: un día antes deja 4.
assert.equal(fechasDeDiaEntre(1, "2026-09-21", "2026-10-18").length, 4);
// Una sola semana = una sola fecha.
assert.deepEqual(fechasDeDiaEntre(1, "2026-09-21", "2026-09-25"), ["2026-09-21"]);
// Si el día no cae en el rango, no inventa nada.
assert.deepEqual(fechasDeDiaEntre(3, "2026-09-24", "2026-09-25"), []);

assert.equal(etiquetaSemana("2026-09-21"), "21–25 de septiembre");
assert.equal(etiquetaSemana("2026-09-28"), "28 de septiembre – 2 de octubre");

console.log("Todo bien: semanas calendario y rangos multisemana.");

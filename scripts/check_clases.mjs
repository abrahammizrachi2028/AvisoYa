// Comprueba cómo se le muestran las clases al usuario y el año automático.
//   node scripts/check_clases.mjs
import assert from "node:assert/strict";
import { anioEscolar, codigoMateria, hoyISO, nombreClase, seccionDeSalon, tinteMateria } from "../lib/horario.ts";

// Los dos salones usan el MISMO código interno: la sección sale del salón.
assert.equal(nombreClase("10 ESP MYP 26-A", "10A"), "Español A");
assert.equal(nombreClase("10 ESP MYP 26-A", "10B"), "Español B");
assert.equal(nombreClase("10 MAT MYP 26-A", "10A"), "Matemáticas A");
assert.equal(nombreClase("10 AP Cal-26-A", "11B"), "AP Cálculo B");
assert.equal(nombreClase("10 ED Fis MYP 26-M1", "10A"), "Educación Física A");
// Sin salón se muestra solo la materia; un código desconocido no se rompe.
assert.equal(nombreClase("10 FIS 26-A"), "Física");
assert.equal(nombreClase(null, "10A"), "");
// Texto libre (no es un código de la escuela): se muestra tal cual, sin sección.
assert.equal(nombreClase("Presentación de IA", "10A"), "Presentación de IA");
assert.equal(nombreClase("QUIMICA X", "10A"), "QUIMICA X");

assert.equal(seccionDeSalon("10A"), "A");
assert.equal(seccionDeSalon("11B"), "B");
assert.equal(seccionDeSalon(""), "");

// El año nunca se escribe a mano (el detalle del ciclo escolar va en check_anio.mjs).
assert.equal(codigoMateria("Química", "10", "B"), `10 Química ${anioEscolar()}-B`);
assert.match(anioEscolar(hoyISO()), /^\d{2}$/);

// Cada familia tiene su color y nada cae fuera de las clases definidas.
const validos = new Set(["tinte-mate", "tinte-ciencia", "tinte-judaica", "tinte-letras", "tinte-deporte", "tinte-neutro"]);
for (const c of ["10 MAT MYP 26-A", "10 FIS 26-A", "10 TORAH 26-A", "10 ESP MYP 26-A", "10 ED Fis MYP 26-M1", "10 Cons 26-A", null]) {
  assert.ok(validos.has(tinteMateria(c)), `tinte inesperado para ${c}`);
}
assert.equal(tinteMateria("10 MAT MYP 26-A"), "tinte-mate");
assert.equal(tinteMateria("10 ED Fis MYP 26-M1"), "tinte-deporte"); // antes que FIS

console.log("Todo bien: nombres de clase, sección, año automático y colores.");

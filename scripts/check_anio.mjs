// El año escolar es el año calendario y no hay ningún año escrito a mano.
//   node scripts/check_anio.mjs
import assert from "node:assert/strict";
import { MES_INICIO_ESCOLAR, anioEscolar, anioEscolarLargo, codigoMateria, rangoAnioEscolar } from "../lib/horario.ts";

// En este colegio el ciclo es el año calendario.
assert.equal(MES_INICIO_ESCOLAR, 1);
assert.deepEqual(rangoAnioEscolar("2026-01-01"), [2026, 2026]);
assert.deepEqual(rangoAnioEscolar("2026-09-20"), [2026, 2026]);
assert.deepEqual(rangoAnioEscolar("2026-12-31"), [2026, 2026]);
assert.deepEqual(rangoAnioEscolar("2027-03-04"), [2027, 2027]);

assert.equal(anioEscolarLargo("2026-09-20"), "2026");
assert.equal(anioEscolar("2026-09-20"), "26");
assert.equal(anioEscolar("2027-03-04"), "27");
assert.equal(codigoMateria("Quimica", "10", "B"), `10 Quimica ${anioEscolar()}-B`);

console.log("Todo bien: ano escolar = ano calendario, sin anos escritos a mano.");

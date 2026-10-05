export const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const TZ = "America/Panama";

export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

// 1=Lunes .. 7=Domingo
export function diaDeFecha(iso: string): number {
  const wd = new Date(iso + "T12:00:00Z").getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function sumarDias(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Próxima fecha (hoy incluido) que cae en `dia` (1..5).
export function proximaFecha(dia: number, desde = hoyISO()): string {
  for (let i = 0; i < 7; i++) {
    const f = sumarDias(desde, i);
    if (diaDeFecha(f) === dia) return f;
  }
  return desde;
}

/** Lunes de la semana calendario a la que pertenece una fecha. */
export function lunesDe(iso = hoyISO()): string {
  return sumarDias(iso, 1 - diaDeFecha(iso));
}

/**
 * Los cinco días de clase de UNA semana calendario, a partir de su lunes.
 * Antes se usaba "la próxima ocurrencia de cada día", que mezclaba semanas:
 * un viernes el cuadro mostraba el lunes siguiente junto al viernes actual.
 */
export function semanaDe(lunes: string): Record<number, string> {
  const r: Record<number, string> = {};
  for (let d = 1; d <= 5; d++) r[d] = sumarDias(lunes, d - 1);
  return r;
}

/** Lunes de la semana desplazada n semanas respecto de `lunes`. */
export function semanaDesplazada(lunes: string, n: number): string {
  return sumarDias(lunes, n * 7);
}

/** Todas las fechas de un día de la semana entre dos fechas, inclusive. */
export function fechasDeDiaEntre(dia: number, desde: string, hasta: string): string[] {
  const out: string[] = [];
  let f = proximaFecha(dia, desde);
  while (f <= hasta) {
    out.push(f);
    f = sumarDias(f, 7);
  }
  return out;
}

const MESES = [
  "",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "21–25 de septiembre" o "28 de septiembre – 2 de octubre". */
export function etiquetaSemana(lunes: string): string {
  const viernes = sumarDias(lunes, 4);
  const dL = Number(lunes.slice(8, 10));
  const dV = Number(viernes.slice(8, 10));
  const mL = MESES[Number(lunes.slice(5, 7))];
  const mV = MESES[Number(viernes.slice(5, 7))];
  return mL === mV ? `${dL}–${dV} de ${mL}` : `${dL} de ${mL} – ${dV} de ${mV}`;
}

export function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// Nombre legible de un código de materia de la escuela. El orden importa.
const MATERIAS: [RegExp, string][] = [
  [/AP Cal/i, "AP Cálculo"],
  [/AP SEM/i, "AP Seminario"],
  [/MAT MYP/i, "Matemáticas"],
  [/REZ/i, "Rezo"],
  [/HIS HEB/i, "Historia Hebrea"],
  [/HEBREO/i, "Hebreo"],
  [/TEC MYP/i, "Tecnología"],
  [/NAVI/i, "Navi"],
  [/UCP/i, "Inglés Avanzado"],
  [/ESP MYP/i, "Español"],
  [/HU MYP/i, "Humanidades"],
  [/ED Fis/i, "Educación Física"],
  [/FIS/i, "Física"],
  [/TORAH/i, "Torá"],
  [/TUSHBA/i, "Tushba"],
  [/JA\/MU/i, "JA/MU"],
  [/BA MYP/i, "BA (MYP)"],
  [/Cons/i, "Cons"],
];

export function nombreMateria(code: string | null | undefined): string {
  if (!code) return "";
  return MATERIAS.find(([re]) => re.test(code))?.[1] ?? code;
}

// ---- Cómo se le muestra una clase al usuario ----------------------------
// Internamente la materia es el código de la escuela ("10 ESP MYP 26-A"), que
// incluye el año lectivo. Los dos salones usan los mismos códigos, así que la
// sección sale del salón ("10A" -> "A"), no del código.

/**
 * Mes en que arranca el año escolar (1 = enero). Cambiarlo aquí lo cambia en
 * todo el sistema: es el único lugar donde está escrito.
 */
export const MES_INICIO_ESCOLAR = 1; // enero: en este colegio el ciclo es el año calendario

/**
 * Año escolar de una fecha, como [inicio, fin].
 * Con inicio en enero el ciclo cabe en un solo año: 2026 -> [2026, 2026].
 * Si algún día el ciclo cruzara de año (ej. agosto), basta cambiar
 * MES_INICIO_ESCOLAR: julio 2026 -> [2025, 2026]; agosto 2026 -> [2026, 2027].
 */
export function rangoAnioEscolar(desde = hoyISO()): [number, number] {
  const anio = Number(desde.slice(0, 4));
  const mes = Number(desde.slice(5, 7));
  const inicio = mes >= MES_INICIO_ESCOLAR ? anio : anio - 1;
  // Si arranca en enero, empieza y termina el mismo año.
  return [inicio, MES_INICIO_ESCOLAR === 1 ? inicio : inicio + 1];
}

/** Año escolar para mostrar: "2026" (o "2026–2027" si el ciclo cruzara de año). */
export function anioEscolarLargo(desde = hoyISO()): string {
  const [a, b] = rangoAnioEscolar(desde);
  return a === b ? String(a) : `${a}–${b}`;
}

/**
 * Año escolar en los dos dígitos que usan los códigos de la escuela ("26").
 * Se usa el año en que ARRANCA el ciclo, que es lo que traen los códigos
 * reales del horario ("10 MAT MYP 26-A" durante el ciclo 2026–2027).
 */
export function anioEscolar(desde = hoyISO()): string {
  return String(rangoAnioEscolar(desde)[0]).slice(2);
}

/** Sección de un salón: "10A" -> "A", "11B" -> "B". */
export function seccionDeSalon(salon: string | null | undefined): string {
  const m = /([A-Za-z]\d?)$/.exec((salon || "").trim());
  return m ? m[1].toUpperCase() : "";
}

/**
 * Nombre para mostrar: "Español A". Sin salón, solo la materia.
 * Un texto libre que no es un código de la escuela ("Presentación de IA") se
 * muestra tal cual: pegarle la sección daría "Presentación de IA A".
 */
export function nombreClase(code: string | null | undefined, salon?: string | null): string {
  const materia = nombreMateria(code);
  const esCodigo = !!code && MATERIAS.some(([re]) => re.test(code));
  const seccion = seccionDeSalon(salon);
  return materia && seccion && esCodigo ? `${materia} ${seccion}` : materia;
}

/** Construye el código interno de una materia nueva con el año lectivo actual. */
export function codigoMateria(nombre: string, grado: string, seccion = "A"): string {
  return `${grado} ${nombre.trim()} ${anioEscolar()}-${seccion}`;
}

// Familia de cada materia, para darle color a las celdas y tarjetas.
// El orden importa, igual que en MATERIAS: "ED Fis" antes que "FIS".
const FAMILIAS: [RegExp, string][] = [
  [/AP Cal|MAT MYP/i, "mate"],
  [/ED Fis/i, "deporte"],
  [/FIS|TEC MYP/i, "ciencia"],
  [/REZ|TORAH|TUSHBA|NAVI|HIS HEB|HEBREO|JA\/MU/i, "judaica"],
  [/UCP|ESP MYP|AP SEM|HU MYP/i, "letras"],
];

/** Clase CSS de color según la familia de la materia (ver globals.css). */
export function tinteMateria(code: string | null | undefined): string {
  if (!code) return "tinte-neutro";
  return `tinte-${FAMILIAS.find(([re]) => re.test(code))?.[1] ?? "neutro"}`;
}

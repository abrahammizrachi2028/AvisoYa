import Anthropic from "@anthropic-ai/sdk";

// Punto único por donde pasan TODAS las llamadas al modelo.
// Arreglar aquí los errores (timeouts, rate limits, JSON inválido) los arregla
// en los tres endpoints a la vez.

export type Turno = { texto: string; respuesta: string };

/** Error con un mensaje ya listo para mostrarle al admin. */
export class AiError extends Error {}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const TIMEOUT_MS = 20_000;

/** Saca el objeto JSON de la respuesta aunque venga con texto o ```json alrededor. */
export function extraerJSON(raw: string): unknown {
  const limpio = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const i = limpio.indexOf("{");
  const j = limpio.lastIndexOf("}");
  if (i < 0 || j <= i) throw new AiError("El modelo no devolvió un resultado válido. Intenta reformularlo.");
  try {
    return JSON.parse(limpio.slice(i, j + 1));
  } catch {
    throw new AiError("No se pudo interpretar la respuesta. Intenta reformularlo o usa el modo manual.");
  }
}

/** [user] o [user, assistant, user] cuando el admin ajusta una sugerencia anterior. */
export function construirMensajes(texto: string, previo?: Turno | null): Anthropic.MessageParam[] {
  const t = texto.trim();
  if (!previo?.texto?.trim() || !previo?.respuesta?.trim()) return [{ role: "user", content: t }];
  return [
    { role: "user", content: previo.texto.trim() },
    { role: "assistant", content: previo.respuesta.trim() },
    { role: "user", content: t },
  ];
}

function mensajeDeError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  const status = (e as { status?: number })?.status;
  const name = (e as { name?: string })?.name || "";
  if (status === 401 || status === 403) return "La clave de la IA no es válida. Revisa ANTHROPIC_API_KEY.";
  if (status === 429) return "La IA está recibiendo demasiadas solicitudes. Espera unos segundos y vuelve a intentar.";
  if (status === 400) return "La solicitud a la IA no era válida. Intenta escribirlo más corto.";
  if (status && status >= 500) return "El servicio de IA no está disponible ahora. Intenta de nuevo o usa el modo manual.";
  if (/timeout/i.test(name)) return "La IA tardó demasiado en responder. Intenta de nuevo.";
  if (/connection/i.test(name)) return "No se pudo conectar con la IA. Revisa la conexión.";
  return "No se pudo interpretar. Intenta reformularlo o usa el modo manual.";
}

/**
 * Pide JSON al modelo. Nunca devuelve algo a medias: o entrega `{ data, raw }`
 * o lanza AiError con un mensaje en español listo para la interfaz.
 */
export async function preguntarJSON(opts: {
  system: string;
  texto: string;
  previo?: Turno | null;
  maxTokens?: number;
}): Promise<{ data: unknown; raw: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiError("Falta ANTHROPIC_API_KEY en .env.local");

  const anthropic = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      system: opts.system,
      messages: construirMensajes(opts.texto, opts.previo),
    });
  } catch (e) {
    console.error("[ai] fallo de API:", e);
    throw new AiError(mensajeDeError(e));
  }

  if (resp.stop_reason === "max_tokens") {
    throw new AiError("La respuesta quedó incompleta (demasiados cambios a la vez). Divídelo en dos solicitudes.");
  }
  const bloque = resp.content.find((c) => c.type === "text");
  const raw = bloque && "text" in bloque ? bloque.text : "";
  if (!raw.trim()) throw new AiError("La IA respondió vacío. Intenta de nuevo.");

  return { data: extraerJSON(raw), raw };
}

/** Convierte cualquier error en el mensaje que ve el admin. */
export function textoDeError(e: unknown): string {
  return mensajeDeError(e);
}

// POST que nunca lanza: siempre devuelve un objeto, así la interfaz jamás se
// queda cargando por una excepción sin atrapar.
// `signal` permite cancelar (botón "Cancelar" o desmontar el componente); una
// cancelación no es un error que haya que mostrarle al usuario.
export async function postJSON<T>(
  url: string,
  body: unknown,
  ms = 30_000,
  signal?: AbortSignal
): Promise<T & { error?: string; cancelado?: boolean }> {
  const salida = (o: Record<string, unknown>) => o as T & { error?: string; cancelado?: boolean };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms),
    });
    const txt = await r.text();
    let d: Record<string, unknown> = {};
    try {
      d = txt ? JSON.parse(txt) : {};
    } catch {
      return salida({ error: `El servidor respondió de forma inesperada (${r.status}).` });
    }
    if (!r.ok && !d.error) return salida({ ...d, error: `Error del servidor (${r.status}).` });
    return salida(d);
  } catch (e) {
    if (signal?.aborted) return salida({ cancelado: true });
    const name = (e as { name?: string })?.name;
    return salida({
      error:
        name === "TimeoutError"
          ? "La solicitud tardó demasiado. Intenta de nuevo."
          : "No se pudo conectar. Revisa tu internet.",
    });
  }
}

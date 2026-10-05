import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente solo-servidor con la service role key. Se instancia perezosamente
// para que importar este módulo no rompa el build cuando faltan las env vars.
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Proxy: reenvía cualquier acceso al cliente real, creándolo en el primer uso.
export const db = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const real = getClient() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? v.bind(real) : v;
  },
});

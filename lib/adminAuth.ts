import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

// El passcode del admin solo vivía en localStorage del navegador: cualquiera
// podía llamar a los endpoints de admin directamente. Ahora el login deja una
// cookie httpOnly con un token derivado del passcode y el servidor la exige.
// ponytail: sin expiración por sesión ni rotación; alcanza para un passcode
// compartido. Si algún día hay cuentas por profesor, esto pasa a ser una sesión real.

const COOKIE = "avisoya_admin";
const MAX_AGE = 60 * 60 * 12; // 12 h

function passcode(): string {
  return process.env.PROFESOR_PASSCODE || "avisolab";
}

/** Token que se guarda en la cookie. Cambiar el passcode invalida los anteriores. */
export function tokenAdmin(): string {
  return createHash("sha256").update(`avisoya|${passcode()}`).digest("hex");
}

export function cookieAdmin(valor: string, maxAge = MAX_AGE): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function leerCookie(req: Request): string {
  const raw = req.headers.get("cookie") || "";
  const par = raw.split(";").find((c) => c.trim().startsWith(`${COOKIE}=`));
  return par ? par.split("=").slice(1).join("=").trim() : "";
}

export function esAdmin(req: Request): boolean {
  const dado = leerCookie(req);
  const esperado = tokenAdmin();
  if (dado.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(dado), Buffer.from(esperado));
}

/** Devuelve una respuesta 401 si quien llama no es admin; null si sí lo es. */
export function exigirAdmin(req: Request): NextResponse | null {
  if (esAdmin(req)) return null;
  return NextResponse.json(
    { error: "Tu sesión de admin expiró. Vuelve a ingresar el passcode." },
    { status: 401 }
  );
}

import { NextResponse } from "next/server";
import { cookieAdmin, esAdmin, tokenAdmin } from "@/lib/adminAuth";

// Passcode compartido del panel del admin. Si acierta, deja una cookie httpOnly
// que es lo que realmente autoriza los endpoints de admin.
export async function POST(req: Request) {
  const { passcode, logout, check } = (await req.json().catch(() => ({}))) as {
    passcode?: string;
    logout?: boolean;
    check?: boolean;
  };

  // El panel pregunta si la cookie sigue siendo válida antes de mostrarse.
  if (check) return NextResponse.json({ ok: esAdmin(req) });

  if (logout) {
    const res = NextResponse.json({ ok: true });
    res.headers.append("Set-Cookie", cookieAdmin("", 0));
    return res;
  }

  const ok = !!passcode && passcode === (process.env.PROFESOR_PASSCODE || "avisolab");
  const res = NextResponse.json({ ok });
  if (ok) res.headers.append("Set-Cookie", cookieAdmin(tokenAdmin()));
  return res;
}

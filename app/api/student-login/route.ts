import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

// Único dominio aceptado. El cliente ya lo muestra fijo junto al campo; aquí se
// vuelve a validar porque el cliente no es una frontera de confianza.
const DOMINIO = "iae.edu";

// Normaliza un texto: minúsculas, sin acentos.
function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// nombre.apellido a partir del nombre completo del estudiante ("Ana Gómez" -> "ana.gomez")
function claveDe(nombre: string) {
  return norm(nombre).split(/\s+/).join(".");
}

// Entra con el correo escolar nombre.apellido.añodegraduacion@iae.edu.
// El cliente manda solo el usuario (sin @); se acepta también el correo completo.
// DEMO: si el usuario no coincide con nadie del roster, entra como cuenta demo.
// ponytail: sin verificación de identidad. El código por correo se agrega aquí,
// entre validar el dominio y devolver el estudiante.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { usuario?: string; email?: string };

  // El usuario puede venir suelto o dentro de un correo completo.
  const crudo = norm(body.usuario || body.email || "");
  if (!crudo) return NextResponse.json({ error: "Escribe tu usuario del correo escolar." }, { status: 400 });

  let local = crudo;
  if (crudo.includes("@")) {
    const [antes, dominio] = crudo.split("@");
    if (dominio !== DOMINIO) {
      return NextResponse.json({ error: `Solo se permiten correos @${DOMINIO}.` }, { status: 400 });
    }
    local = antes;
  }
  if (!/^[a-z0-9]+(\.[a-z0-9]+)*$/.test(local)) {
    return NextResponse.json(
      { error: "Usuario inválido. Usa solo letras, números y puntos (nombre.apellido)." },
      { status: 400 }
    );
  }

  const { data: students, error } = await db
    .from("students")
    .select("id, nombre, salon")
    .order("salon")
    .order("nombre");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!students?.length) {
    return NextResponse.json({ error: "No hay estudiantes cargados." }, { status: 500 });
  }

  // Coincide si el correo es nombre.apellido(.año) del estudiante; si no, demo.
  const match =
    students.find((s) => {
      const clave = claveDe(s.nombre);
      return local === clave || local.startsWith(clave + ".");
    }) || students[0];

  return NextResponse.json({ id: match.id, nombre: match.nombre, salon: match.salon, correo: `${local}@${DOMINIO}` });
}

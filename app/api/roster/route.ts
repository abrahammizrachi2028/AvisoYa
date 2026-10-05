import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { exigirAdmin } from "@/lib/adminAuth";

export async function GET(req: Request) {
  const no = exigirAdmin(req);
  if (no) return no;

  const { data, error } = await db
    .from("students")
    .select("id, nombre, grado, salon, tutor")
    .order("grado")
    .order("salon")
    .order("nombre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ students: data });
}

# AvisoYa

Avisos escolares dirigidos con notificaciones push reales (PWA), más escalamiento
inteligente de avisos urgentes no vistos con Claude. Proyecto para el Desafío IA 2026.

Independiente de `sociedad-cuotas`: su propio repo, su propio Supabase, corre en el puerto **3001**.

## Stack

- Next.js 16 (App Router, TypeScript) + Tailwind
- Supabase Postgres (datos)
- Web Push / VAPID (notificaciones reales, sin costo)
- API de Claude (escalamiento)

## Puesta en marcha

1. **Supabase**: crear un proyecto nuevo en https://supabase.com (NO el de sociedad-cuotas).
   - En el SQL Editor, pegar y ejecutar `supabase/schema.sql`.
   - Luego pegar y ejecutar `supabase/seed.sql` (roster ficticio).
   - En Project Settings → API, copiar el **Project URL** y la **service_role key**.
2. **Variables**: copiar `.env.local.example` a `.env.local` y completar:
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - Las VAPID ya están generadas en `.env.local`.
   - `ANTHROPIC_API_KEY` (para el escalamiento; el resto funciona sin ella).
3. **Correr**: `npm run dev` → http://localhost:3001

## Flujo de demo

- **Estudiante** (`/avisos`): elegí salón y nombre → "Activar notificaciones" → quedás suscrito.
- **Profesor** (`/profesor`, passcode `avisolab`): escribí un aviso, elegí audiencia
  (grado / salón / individual), marcá urgencia, publicá. Los estudiantes reciben push.
- **Historial** (`/profesor/historial`): quién vio cada aviso. Para un aviso **urgente**
  con pendientes, "Revisar pendientes con IA" hace que Claude decida por cada estudiante
  si escalar (reenviar / avisar al tutor / resaltar / esperar), con justificación.

## Notas de diseño

- Selección de audiencia 100% manual (el profesor sabe a quién afecta el cambio).
- La IA se usa solo donde una regla fija falla: decidir si un aviso no visto necesita
  escalar ahora, dado urgencia + tiempo hasta el evento + comportamiento del estudiante.
- Datos ficticios únicamente. Ver `docs/` para la nota del proyecto.

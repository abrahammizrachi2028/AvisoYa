#!/usr/bin/env bash
# Sube las variables de .env.local a Vercel y publica a producción.
# Requiere haber hecho `npx vercel login` antes.
# Los valores nunca se imprimen.
set -euo pipefail
cd "$(dirname "$0")/.."

VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  ANTHROPIC_API_KEY
  ANTHROPIC_MODEL
  PROFESOR_PASSCODE
  NEXT_PUBLIC_VAPID_PUBLIC_KEY
  VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY
  VAPID_SUBJECT
)

echo "==> Vinculando el proyecto"
npx vercel link --yes >/dev/null

echo "==> Subiendo variables de entorno"
for v in "${VARS[@]}"; do
  val=$(grep -E "^${v}=" .env.local | head -1 | cut -d= -f2-)
  if [ -z "$val" ]; then echo "  -- $v no está en .env.local, se omite"; continue; fi
  for env in production preview; do
    npx vercel env rm "$v" "$env" --yes >/dev/null 2>&1 || true
    printf '%s' "$val" | npx vercel env add "$v" "$env" >/dev/null 2>&1
  done
  echo "  ok $v"
done

echo "==> Publicando"
npx vercel deploy --prod

-- AvisoYa — esquema. Pegar en el SQL Editor de Supabase y ejecutar.
-- Todo el acceso a datos pasa por API routes con la service_role key,
-- así que RLS queda deshabilitado (demo). No exponer la anon key para escritura.

create extension if not exists "pgcrypto";

create table if not exists students (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  grado     text not null,
  salon     text not null,
  tutor     text
);

create table if not exists announcements (
  id             uuid primary key default gen_random_uuid(),
  texto          text not null,
  lugar          text,
  hora_evento    timestamptz,
  urgencia       text not null default 'normal' check (urgencia in ('normal','alta')),
  audiencia_desc text not null,
  created_at     timestamptz not null default now()
);

create table if not exists notifications (
  id                uuid primary key default gen_random_uuid(),
  announcement_id   uuid not null references announcements(id) on delete cascade,
  student_id        uuid not null references students(id) on delete cascade,
  created_at        timestamptz not null default now(),
  acknowledged_at   timestamptz,
  escalated         boolean not null default false,
  escalation_action text check (escalation_action in ('resaltar','reenviar','tutor','ninguna')),
  escalation_reason text
);

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notif_student on notifications(student_id);
create index if not exists idx_notif_ann on notifications(announcement_id);

-- La service_role (secret key) necesita permisos explícitos sobre las tablas.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

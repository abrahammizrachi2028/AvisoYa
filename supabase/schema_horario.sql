-- AvisoYa — tablas del horario. Ejecutar en el SQL Editor de Supabase
-- DESPUÉS de schema.sql. No toca las tablas anteriores.

-- Definición de las filas del horario (períodos), compartida por todos los salones.
create table if not exists periods (
  orden       int primary key,
  etiqueta    text not null,
  hora_inicio time not null,
  hora_fin    time not null,
  es_clase    boolean not null default true
);

-- Horario base semanal, una fila por celda (salón, día, período).
create table if not exists schedule_slots (
  id        uuid primary key default gen_random_uuid(),
  salon     text not null,
  dia       int not null check (dia between 1 and 5), -- 1=Lunes .. 5=Viernes
  periodo   int not null references periods(orden),
  materia   text not null,
  sala      text,
  profesor  text,
  unique (salon, dia, periodo)
);

-- Cambios de un día específico (override sobre el horario base).
create table if not exists schedule_overrides (
  id         uuid primary key default gen_random_uuid(),
  salon      text not null,
  fecha      date not null,
  dia        int not null check (dia between 1 and 5),
  periodo    int not null references periods(orden),
  tipo       text not null check (tipo in ('cambio','cancelacion')),
  materia    text,
  sala       text,
  profesor   text,
  nota       text,
  created_at timestamptz not null default now(),
  unique (salon, fecha, periodo)
);

create index if not exists idx_slots_salon on schedule_slots(salon);
create index if not exists idx_ovr_salon_fecha on schedule_overrides(salon, fecha);

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

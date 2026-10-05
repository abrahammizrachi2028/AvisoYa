-- AvisoYa — v2: horario por persona (tracks AP/MYP) + anotaciones.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de schema_horario.sql.

-- 1) track en slots: 'base' (MYP/regular, lo ve todo el mundo) o el código
--    del curso AP (lo ven solo los estudiantes inscritos en ese AP).
alter table schedule_slots add column if not exists track text not null default 'base';
alter table schedule_slots drop constraint if exists schedule_slots_salon_dia_periodo_key;
alter table schedule_slots
  add constraint schedule_slots_salon_dia_periodo_track_key unique (salon, dia, periodo, track);

-- 2) inscripciones AP por estudiante (una fila por curso AP que toma).
create table if not exists student_courses (
  student_id uuid not null references students(id) on delete cascade,
  course     text not null,
  primary key (student_id, course)
);

-- 3) overrides con track y un nuevo tipo 'evento' (anotación que no cambia la
--    clase, ej. "prueba de Duolingo").
alter table schedule_overrides add column if not exists track text not null default 'base';
alter table schedule_overrides drop constraint if exists schedule_overrides_salon_fecha_periodo_key;
alter table schedule_overrides
  add constraint schedule_overrides_salon_fecha_periodo_track_key unique (salon, fecha, periodo, track);
alter table schedule_overrides drop constraint if exists schedule_overrides_tipo_check;
alter table schedule_overrides
  add constraint schedule_overrides_tipo_check check (tipo in ('cambio','cancelacion','evento'));

grant all on all tables in schema public to service_role;

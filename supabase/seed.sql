-- AvisoYa — datos ficticios para la demo. Ejecutar DESPUÉS de schema.sql.
-- Ningún dato real de estudiantes, profesores ni familias.

truncate push_subscriptions, notifications, announcements, students restart identity cascade;

insert into students (nombre, grado, salon, tutor) values
  ('Ana Gómez',       '10', '10A', 'Prof. Ruiz'),
  ('Beto Salas',      '10', '10A', 'Prof. Ruiz'),
  ('Carla Núñez',     '10', '10A', 'Prof. Ruiz'),
  ('Diego Pérez',     '10', '10A', 'Prof. Ruiz'),
  ('Elena Ortiz',     '10', '10B', 'Prof. Ruiz'),
  ('Fabio Luna',      '10', '10B', 'Prof. Ruiz'),
  ('Gaby Ramos',      '10', '10B', 'Prof. Ruiz'),
  ('Hugo Vega',       '10', '10B', 'Prof. Ruiz'),
  ('Inés Castro',     '11', '11A', 'Prof. Mora'),
  ('Javier Díaz',     '11', '11A', 'Prof. Mora'),
  ('Karla Ríos',      '11', '11A', 'Prof. Mora'),
  ('Luis Fuentes',    '11', '11A', 'Prof. Mora'),
  ('Marta Solís',     '11', '11B', 'Prof. Mora'),
  ('Nico Herrera',    '11', '11B', 'Prof. Mora'),
  ('Olga Prado',      '11', '11B', 'Prof. Mora'),
  ('Pablo Iglesias',  '11', '11B', 'Prof. Mora');

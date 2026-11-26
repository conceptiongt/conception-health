-- PROPUESTA (NO APLICADA) · 2026-11-25
-- Qué hace: agrega la columna `calendario` (jsonb) a `clinicas` para guardar los colores del Calendario
--   ({ "colorPor": "tipo" | "estado", "colores": { "tipo:Cirugía": "#RRGGBB", "estado:Pendiente": "#RRGGBB" } })
--   y así se compartan con todos los usuarios de la clínica. Mientras no exista, la app los guarda en el navegador
--   de cada equipo (localStorage) y funciona igual.
-- Seguridad: la política RLS existente `clinica_editar` ya limita las actualizaciones de `clinicas` a los usuarios de esa
--   clínica con el permiso 'configuracion'; no hace falta política nueva. La restricción acota el tamaño (< 8 KB) y exige un objeto.
-- Riesgo: bajo. Columna con valor por defecto '{}', no rompe lecturas (`select *`) ni escrituras existentes.
--   El `alter table` toma un candado breve sobre `clinicas` (tabla pequeña).
-- Cómo verificar después de aplicarla:
--   select column_name, data_type, column_default from information_schema.columns
--     where table_schema = 'public' and table_name = 'clinicas' and column_name = 'calendario';
--   -- como administrador de la clínica, en la app: Calendario → Personalizar colores → Guardar; recargar y ver que persiste.
-- Cómo deshacer:
--   alter table public.clinicas drop constraint if exists clinicas_calendario_valido;
--   alter table public.clinicas drop column if exists calendario;

alter table public.clinicas
  add column if not exists calendario jsonb not null default '{}'::jsonb;

alter table public.clinicas drop constraint if exists clinicas_calendario_valido;
alter table public.clinicas
  add constraint clinicas_calendario_valido
  check (jsonb_typeof(calendario) = 'object' and octet_length(calendario::text) < 8192);

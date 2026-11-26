-- PROPUESTA (NO APLICADA) · 2026-11-26
-- Qué hace: las sesiones de soporte (perfiles.rol = 'soporte') dejan de poder ESCRIBIR public.lia_config (agenda propia, bloqueos,
--   eventos, ajustes de la recepcionista). Hoy sí pueden, por la política lia_config_clinica (ALL, authenticated,
--   clinica_id = mi_clinica()). La lectura no cambia.
-- Cómo: una función auxiliar es_soporte() y tres políticas RESTRICTIVAS (insert, update, delete) sobre lia_config. Una política
--   restrictiva se combina con AND con las permisivas existentes: no reemplaza ni toca lia_config_clinica.
-- Por qué una función auxiliar y no un subselect directo a perfiles:
--   - Ninguna política RLS de hoy consulta `perfiles` directamente; esta sería la primera. Un subselect dentro de la política se
--     evalúa con el RLS de QUIEN LLAMA, y perfiles tiene RLS: un usuario de soporte solo lee su propia fila por la política
--     perfil_ver, y únicamente mientras mi_clinica() no sea null. Si ese camino falla (p. ej. mi_clinica() null o una política de
--     perfiles cambia), el `not exists` daría VERDADERO (no ve la fila) y soporte volvería a poder escribir: falla ABIERTO.
--   - es_soporte() es security definer (lee perfiles sin depender del RLS del llamador), stable, con search_path fijo, y solo se
--     ejecuta con sesión iniciada. El resultado no depende de otras políticas.
-- Riesgo: bajo. Solo agrega una función y tres políticas restrictivas. Efecto: un usuario con rol soporte recibe error de RLS al
--   insertar/actualizar/borrar en lia_config (la plataforma ya lo bloquea en la función de borde google-calendar). Dueño,
--   asistente y miembro no se ven afectados. El service role ignora RLS (Lía y las funciones de borde siguen igual).
-- Cómo probar dentro de una transacción (sin dejar nada):
--   begin;
--     \i supabase/migraciones-propuestas/2026-11-26_lia_config_soporte_solo_lectura.sql
--     -- como un usuario de soporte (sustituir el uuid por el user_id de un perfil con rol = 'soporte'):
--     set local role authenticated;
--     select set_config('request.jwt.claims', json_build_object('sub', '<UUID-SOPORTE>', 'role', 'authenticated')::text, true);
--     select public.es_soporte();                                                       -- debe dar true
--     select count(*) from public.lia_config;                                           -- lectura: sin cambio
--     update public.lia_config set updated_at = now();                                  -- debe dar 0 filas o error de RLS
--     delete from public.lia_config;                                                    -- debe dar 0 filas o error de RLS
--     -- como dueño: repetir con el user_id de un dueño: es_soporte() = false y el update afecta 1 fila de su clínica
--   rollback;
-- Cómo deshacer:
--   drop policy if exists lia_config_soporte_no_insert on public.lia_config;
--   drop policy if exists lia_config_soporte_no_update on public.lia_config;
--   drop policy if exists lia_config_soporte_no_delete on public.lia_config;
--   drop function if exists public.es_soporte();

create or replace function public.es_soporte() returns boolean
  language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.perfiles p where p.user_id = auth.uid() and p.rol = 'soporte')
$$;
revoke execute on function public.es_soporte() from public, anon;
grant execute on function public.es_soporte() to authenticated;

drop policy if exists lia_config_soporte_no_insert on public.lia_config;
create policy lia_config_soporte_no_insert on public.lia_config
  as restrictive for insert to authenticated
  with check (not public.es_soporte());

drop policy if exists lia_config_soporte_no_update on public.lia_config;
create policy lia_config_soporte_no_update on public.lia_config
  as restrictive for update to authenticated
  using (not public.es_soporte())
  with check (not public.es_soporte());

drop policy if exists lia_config_soporte_no_delete on public.lia_config;
create policy lia_config_soporte_no_delete on public.lia_config
  as restrictive for delete to authenticated
  using (not public.es_soporte());

-- NOTA: es un PRIMER PASO, no cierra todo. Las RPC `cita_eliminar`, `inventario_eliminar`, `orden_recibir`,
--   `categoria_renombrar` y `mi_clinica` siguen ejecutables por anon/PUBLIC por grant (revisan internamente la clínica de quien
--   llama). Hay que verificarlo contra pg_proc / pg_policies y probar todo en una rama de Supabase antes de aplicar.
-- PROPUESTA (NO APLICADA) · 2026-11-25 · REVISIÓN OBLIGATORIA (toca permisos de base de datos)
-- Qué hace: defensa en profundidad. Hoy todas las tablas tienen RLS y políticas basadas en mi_clinica(), pero el rol `anon`
--   (la llave pública del navegador, sin sesión) todavía conserva privilegios sobre las tablas y EXECUTE sobre funciones
--   SECURITY DEFINER. RLS lo frena, pero conviene quitarle también el permiso base.
--
-- Revisión del frontend (src/**) antes de escribirla: ¿algo consulta la base ANTES de iniciar sesión con la llave pública?
--   - src/pages/Acceso.jsx: solo `supabase.auth.*` (API de Auth, no usa tablas ni funciones de `public`) y
--     `supabase.functions.invoke('crear-cuenta')` (Edge Function, corre con su propia llave de servicio).
--   - src/pages/Publico.jsx: `fetch` a la Edge Function `publico` con la llave pública en la cabecera `apikey`
--     (portal /p, registro /r, documento /d). La función accede a los datos con service_role; no lee tablas como `anon`.
--   - src/main.jsx y src/lib/supabase.js: solo crean el cliente; sin consultas.
--   - src/lib/marca.js: logos por URL pública de Storage (esquema storage, bucket público; no se toca aquí).
--   - src/lib/studio.js: usa OTRO proyecto de Supabase (Conception Studio); no le afecta.
--   Conclusión: ninguna tabla ni función de `public` se usa como `anon` en el frontend; no se excluye ningún objeto.
--   Edge Functions (supabase/functions/**): todas leen/escriben con SUPABASE_SERVICE_ROLE_KEY; las dos que crean un cliente con la
--   llave anon (invitar-asistente, eliminar-cuenta) lo hacen con el JWT del usuario ya autenticado (rol authenticated), no como anon.
--
-- Riesgo: medio. Si algo (una función, un trigger o un script externo) todavía dependiera de `anon`, dejaría de funcionar.
--   `mi_clinica()` NO se toca aquí (la usan las políticas RLS de todas las tablas); revisar aparte si también debe quitarse a anon.
--   Las funciones de trigger no necesitan EXECUTE para disparar; se les quita a anon y PUBLIC.
-- Cómo probarla primero: en una rama de Supabase (branch) o una copia; luego en la app abrir sesión, Inicio, Citas, Registrar,
--   Inventario y un enlace público de paciente (/p, /r, /d).
-- Cómo verificar:
--   select grantee, table_name, privilege_type from information_schema.role_table_grants
--     where table_schema = 'public' and grantee = 'anon';                 -- debe quedar vacío
--   select routine_name, grantee from information_schema.routine_privileges
--     where routine_schema = 'public' and grantee in ('anon', 'PUBLIC');   -- no deben salir las funciones listadas abajo
-- Cómo deshacer (vuelve al estado anterior, no recomendado):
--   grant all on all tables in schema public to anon;
--   grant all on all sequences in schema public to anon;
--   grant execute on function public.es_admin(), public.tiene_permiso(text), public.puede_eliminar_citas(),
--     public.puede_eliminar_inventario(), public.citas_quien_agendo(), public.perfil_proteger(), public.invitacion_limite() to anon, public;
--   alter default privileges in schema public grant all on tables to anon;
--
-- PASOS MANUALES para la dueña (no son SQL):
--   1. Supabase → Authentication → Settings (Passwords): activar «Leaked password protection» (rechaza contraseñas filtradas).
--   2. Las tablas heredadas `patients`, `profiles` y `expedientes` (políticas con auth.uid() = user_id) parecen sin uso en la app.
--      Revisar más adelante si se pueden eliminar. NO se borra nada en esta propuesta.

begin;

-- 1) El rol anon no necesita tablas ni secuencias de public
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2) Funciones SECURITY DEFINER: fuera para anon y para el PUBLIC implícito
revoke execute on function
  public.es_admin(), public.tiene_permiso(text), public.puede_eliminar_citas(), public.puede_eliminar_inventario(),
  public.citas_quien_agendo(), public.perfil_proteger(), public.invitacion_limite()
  from anon, public;

-- 3) Solo los usuarios con sesión (y el servidor) usan los auxiliares que consultan las políticas RLS.
--    Las funciones de trigger (citas_quien_agendo, perfil_proteger, invitacion_limite) no necesitan grant.
grant execute on function
  public.es_admin(), public.tiene_permiso(text), public.puede_eliminar_citas(), public.puede_eliminar_inventario()
  to authenticated, service_role;

-- 4) Lo que cree el rol postgres en el futuro tampoco nace abierto para anon (tablas) ni para PUBLIC/anon (funciones;
--    en Postgres las funciones nuevas dan EXECUTE a PUBLIC por defecto, por eso se revoca de PUBLIC también)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

commit;

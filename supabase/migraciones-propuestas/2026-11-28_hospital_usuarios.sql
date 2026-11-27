-- PROPUESTA (NO APLICADA) · 2026-11-28 · Hospital: usuarios del personal SIN correo (usuario + contraseña)
--
-- Qué hace
--   En un hospital el administrador crea a cada persona desde la plataforma con un NOMBRE DE USUARIO y una CONTRASEÑA (sin correo personal),
--   elige qué puede ver y hacer, y los médicos entran con «código del hospital + usuario + contraseña». Este SQL pone la base de datos:
--     1. clinicas.codigo_acceso (código corto que se escribe al entrar, p. ej. POLI-4821) + RPC hospital_codigo_acceso(p_codigo).
--     2. perfiles.usuario / puesto / activo / clave_temporal_at + índice único (clinica_id, lower(usuario)) y el trigger NUEVO
--        perfil_campos_hospital (el cliente no puede tocar usuario, activo ni clave_temporal_at; puesto solo el administrador).
--     3. mi_clinica() devuelve NULL si perfiles.activo = false (un usuario desactivado pierde TODO el acceso a datos al instante, aunque tenga sesión).
--     4. acceso_intentos (bloqueo por intentos fallidos; solo service role).
--     5. Alta del personal: en vez de reemplazar crear_clinica_para_usuario() (cuyo cuerpo vivo no está en el repo), se agrega un trigger
--        hermano sobre auth.users, mutuamente excluyente por WHEN:
--           al_crear_usuario          → (el de siempre) solo cuando app_metadata.alta NO es 'hospital'  (la función viva NO se toca)
--           al_crear_usuario_hospital → hospital_crear_perfil_usuario(), solo cuando app_metadata.alta = 'hospital'
--        Así el cuerpo vivo de crear_clinica_para_usuario() queda byte por byte igual (cero riesgo de reconstruirlo mal desde una descripción).
--     5b. perfiles.email deja de ser NOT NULL (en vivo lo es: el alta del personal sin correo fallaría).
--     5c. RPC perfil_admin_actualizar(): único camino para «Editar permisos» (personal Y asistentes con correo, también en clínicas normales: hoy el
--         UPDATE directo lo rechazan los privilegios por columna de authenticated, solo perfiles(nombre, password_creada)).
--     5d. Trigger hospital_auth_fijo sobre auth.users: el correo / teléfono de un usuario del hospital no se puede cambiar (ni por la API de GoTrue).
--     6. Funciones de apoyo SOLO para service role: hospital_cupos_de(), hospital_cerrar_sesiones(); y para el administrador: hospital_usuarios_cupos().
--   Las llaves de permisos nuevas (registrar, ver_todos_pacientes, profesional_id) viven en perfiles.permisos (jsonb): no necesitan cambio de esquema.
--
-- Objetos nuevos / modificados
--   Columnas: clinicas.codigo_acceso; perfiles.usuario, puesto, activo (not null default true), clave_temporal_at.
--   Tabla: acceso_intentos (RLS activo, sin políticas).
--   Funciones nuevas: perfil_admin_actualizar(uuid,text,text,jsonb), hospital_auth_fijo() [trigger], hospital_codigo_acceso(text), hospital_usuarios_cupos(), hospital_cupos_de(uuid), hospital_cerrar_sesiones(uuid),
--     hospital_crear_perfil_usuario() [trigger], hospital_perfil_campos() [trigger], hospital_clinica_codigo() [trigger].
--   Triggers nuevos: hospital_auth_fijo (auth.users), perfil_campos_hospital (perfiles), clinicas_codigo_acceso_proteger (clinicas), al_crear_usuario_hospital (auth.users).
--   MODIFICADO (reemplazo): perfiles.email (drop not null), mi_clinica()  y  el trigger al_crear_usuario (se vuelve a crear idéntico + cláusula WHEN).
--
-- RIESGOS (revisar ANTES de aplicar)
--   * mi_clinica() es la base de TODO el RLS. El reemplazo solo agrega «and p.activo» al cuerpo vivo que se pegó en el pedido. Comparar con
--     pg_get_functiondef (pre-check A) y, si el cuerpo vivo cambió, rehacer el reemplazo sobre el vivo. Las columnas son NOT NULL DEFAULT true:
--     todos los perfiles existentes quedan activos, nada cambia para las cuentas actuales.
--   * Otras funciones que lean perfiles directamente (sin mi_clinica()) NO respetarían activo = false. Pre-check E las lista: revisar que ninguna
--     RPC SECURITY DEFINER de datos de pacientes dependa solo de perfiles/es_admin()/tiene_permiso() sin pasar por mi_clinica().
--   * El trigger sobre auth.users: se vuelve a crear al_crear_usuario con el MISMO evento (AFTER INSERT, FOR EACH ROW) y la misma función;
--     solo se le añade WHEN (...alta... is distinct from 'hospital'). Pre-check B imprime la definición viva: debe ser exactamente AFTER INSERT ... FOR EACH ROW
--     EXECUTE FUNCTION crear_clinica_para_usuario(); si tiene otra cosa (otro nombre, columnas, condición), ajustar antes de aplicar.
--     Aplicar todo dentro de UNA transacción: nunca hay un instante sin trigger de alta.
--   * app_metadata solo se puede escribir con la service role (nunca desde user_metadata ni desde el registro público): una persona normal no puede
--     llegar a la rama del hospital. Si alguna validación de la rama falla, la función LANZA excepción y la creación del usuario en auth se cancela
--     (el INSERT en auth.users y el trigger son UNA sola transacción: no queda ningún usuario huérfano ni clínica creada de más).
--   * Cupo de usuarios: la rama del hospital toma pg_advisory_xact_lock por clínica y revisa usuarios_ocupados < usuarios_permitidos DENTRO de la misma
--     transacción de la alta (dos altas simultáneas en el límite: la segunda espera y falla con LIMITE_USUARIOS). Asume que usuarios_ocupados(uuid)
--     y usuarios_permitidos(uuid) existen con UN argumento uuid (pre-check D).
--   * perfiles.email: el pre-check C en vivo mostró NOT NULL → la sección 2 ejecuta `alter column email drop not null` (solo metadatos, sin reescribir la tabla).
--     No se puede volver a poner NOT NULL mientras existan usuarios del personal (email null): ver ROLLBACK.
--   * perfil_proteger (en vivo, leído solo-lectura) hace: (1) un perfil rol 'soporte' es inmutable; (2) `if not es_admin() and (rol|permisos|clinica_id cambian)` → SIN_PERMISO;
--     (3) nadie cambia su propio rol. NO se modifica. perfil_admin_actualizar() corre como el dueño (auth.uid() = dueño, es_admin() = true) y solo cambia nombre,
--     puesto y permisos de un perfil que no es el suyo, así que perfil_proteger lo deja pasar. Con service role auth.uid() es null y es_admin() falsa: por eso la
--     función de borde NO actualiza permisos (se quitó la acción `actualizar`).
--   * «Cliente» en los triggers = current_user en ('authenticated','anon') (PostgREST cambia a ese rol). La service role (funciones de borde) y el
--     SQL editor quedan fuera. Las RPC SECURITY DEFINER corren como su dueño, por eso también quedan fuera (hospital_codigo_acceso puede escribir
--     el código aunque un cliente directo no pueda).
--   * hospital_cerrar_sesiones borra auth.sessions / auth.refresh_tokens del usuario (el dueño de la función debe poder escribir en el esquema auth;
--     en Supabase lo es). Los tokens de acceso ya emitidos siguen siendo válidos hasta vencer (~1 h) para PostgREST; por eso el desactivado también
--     corta con mi_clinica() = NULL.
--   * Nada para anon: ningún privilegio a anon ni a public en funciones nuevas.
--   * Orden de despliegue: SQL primero; luego las tres funciones de borde (usuarios-hospital JWT sí, cambiar-clave JWT sí, entrar-usuario JWT NO); luego el front.
--
-- VERIFICADO EN VIVO POR LA REVISIÓN (solo lectura): A) mi_clinica() coincide con el cuerpo de la sección 3; B) el trigger vivo es exactamente
--   AFTER INSERT ... FOR EACH ROW EXECUTE FUNCTION crear_clinica_para_usuario(); C) perfiles.email es NOT NULL (corregido con el drop not null de arriba);
--   G) limite_publico acepta accion = 'entrar'.
--
-- PRUEBAS EN SECO D1–D11 (todas dentro de una transacción con rollback; ver la receta de abajo)
--   D1  aplicar este archivo completo sin errores.
--   D2  insert en auth.users (id y email únicos) con app_metadata alta=hospital → exactamente UN perfil asistente, email null, clave_temporal_at no nulo, y NINGUNA clínica nueva.
--   D3  insert en auth.users con raw_app_meta_data '{}' → crea clínica + perfil dueno como antes.
--   D4  clínica inexistente / usuario 'AB' / permisos '[]' / clínica que no es hospital → excepción ALTA_HOSPITAL_INVALIDA (y no queda el usuario de auth).
--   D5  cupo lleno (usuarios_ocupados = usuarios_permitidos) → LIMITE_USUARIOS.
--   D6  mi_clinica() del usuario del personal = su clínica; tras update perfiles set activo = false → NULL.
--   D7  como ese usuario: update password_creada → CAMPO_PROTEGIDO; update usuario / activo → CAMPO_PROTEGIDO.
--   D8  perfil_admin_actualizar como dueño → ok (void); como asistente o como dueño de OTRA clínica → SIN_PERMISO.
--   D9  hospital_codigo_acceso como dueño (genera/cambia/valida), como asistente (SIN_PERMISO) y como anon (permission denied).
--   D10 hospital_cerrar_sesiones(uuid) corre (service role) y no falla aunque el usuario no tenga sesiones.
--   D11 update auth.users set email = ... de un usuario hospital → CAMPO_PROTEGIDO; update ... set last_sign_in_at = now() → pasa.
--
-- PRE-CHECKS (solo lectura, correr ANTES; guardar la salida)
--   A) select pg_get_functiondef('public.mi_clinica'::regproc);       -- comparar con el cuerpo de la sección 3
--   B) select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
--   B2) select pg_get_functiondef('public.crear_clinica_para_usuario'::regproc);   -- solo para leerla: este SQL NO la modifica
--   B3) select pg_get_functiondef(p.oid) from pg_proc p where p.proname = 'perfil_proteger' and p.pronamespace = 'public'::regnamespace;  -- NO se modifica
--   C) select column_name, is_nullable, data_type from information_schema.columns where table_schema = 'public' and table_name = 'perfiles' order by ordinal_position;
--   D) select proname, pg_get_function_arguments(oid), prosecdef from pg_proc where pronamespace = 'public'::regnamespace
--        and proname in ('usuarios_ocupados', 'usuarios_permitidos', 'es_admin', 'es_soporte', 'clinica_vencida', 'clinica_vencida_de', 'mi_clinica') order by 1;
--   E) select proname from pg_proc where pronamespace = 'public'::regnamespace and prosecdef and prosrc ilike '%perfiles%' and prosrc not ilike '%mi_clinica%' order by 1;
--   F) select grantee, privilege_type, column_name from information_schema.column_privileges where table_schema = 'public' and table_name in ('perfiles', 'clinicas')
--        and grantee = 'authenticated' and privilege_type in ('SELECT', 'UPDATE') order by table_name, column_name;   (¿por columna o de tabla completa?)
--   G) select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.limite_publico'::regclass;   -- ¿acepta accion = 'entrar'?
--   H) select to_regclass('public.acceso_intentos');  -- null
--   I) select count(*) from public.perfiles where email is null;  -- hoy 0 (los usuarios sin correo serán los primeros)
--
-- CÓMO APLICAR: como UNA sola migración (la herramienta la envuelve en transacción; por eso no lleva begin/commit).
--
-- CÓMO PROBAR DENTRO DE UNA TRANSACCIÓN (con rollback; nada queda aplicado)
--   begin;
--     -- pegar aquí TODO el contenido de este archivo (sin las líneas de comentario)
--     -- 1. Alta del personal (como service role / SQL editor): crear una clínica hospital de prueba y un usuario con app_metadata
--     insert into public.clinicas (nombre, especialidad) values ('Hospital de Prueba', 'hospital') returning id;   -- anotar <CLI>
--     insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
--       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'u-prueba@usuarios.invalid', '', now(),
--               jsonb_build_object('alta', 'hospital', 'clinica_id', '<CLI>', 'usuario', 'ana.lopez', 'nombre', 'Ana López', 'puesto', 'Recepción',
--                                  'permisos', jsonb_build_object('registrar', true)), '{}', now(), now());
--     select user_id, clinica_id, rol, usuario, puesto, activo, email, password_creada from public.perfiles where usuario = 'ana.lopez';  -- 1 fila, rol asistente, email null
--     select count(*) from public.clinicas where nombre = 'Hospital de Prueba';  -- 1 (no se creó otra clínica)
--     -- 2. Inconsistencias deben fallar (cada una por separado, con savepoint): clinica_id inexistente, usuario 'AB', permisos = '[]', clínica que no es hospital → excepción
--     -- 3. Usuario normal sin alta: insert en auth.users con raw_app_meta_data = '{}' → crea su clínica como siempre (rama vieja intacta)
--     -- 4. Cupo: bajar temporalmente el plan o llenar usuarios hasta usuarios_permitidos y probar que la siguiente alta falla con LIMITE_USUARIOS
--     -- 5. mi_clinica(): select set_config('request.jwt.claims', json_build_object('sub', '<USER-ID>', 'role', 'authenticated')::text, true); set local role authenticated;
--     --    select public.mi_clinica();  → <CLI>.  reset role;  update public.perfiles set activo = false where user_id = '<USER-ID>';  (otra vez como arriba) select public.mi_clinica();  → NULL
--     -- 6. Trigger perfil_campos_hospital (como ese usuario, set local role authenticated):
--     --    update public.perfiles set usuario = 'otro' where user_id = '<USER-ID>';  → ERROR CAMPO_PROTEGIDO.   update ... set activo = true → ERROR.   set password_creada = true → ERROR (usuario no nulo).
--     --    Como dueño: update public.perfiles set puesto = 'Caja' where user_id = '<USER-ID>';  → ok.  Como el propio usuario: set puesto → ERROR.
--     -- 7. hospital_codigo_acceso: como dueño de la clínica hospital: select public.hospital_codigo_acceso();  → genera y devuelve p. ej. HOSP-4821;
--     --    select public.hospital_codigo_acceso('poli-0001'); → 'POLI-0001';  select public.hospital_codigo_acceso('x'); → CODIGO_INVALIDO;  repetir el mismo código en otra clínica → CODIGO_OCUPADO.
--     --    Como dueño de una clínica que NO es hospital → NO_HOSPITAL.  Como asistente → SIN_PERMISO.
--     --    update public.clinicas set codigo_acceso = 'HACK-0001' where id = '<CLI>';  (set local role authenticated, como dueño) → ERROR CAMPO_PROTEGIDO.
--     -- 8. anon: set local role anon; select public.hospital_codigo_acceso();  → permission denied.  select * from public.acceso_intentos; → permission denied.
--   rollback;
--
-- ROLLBACK (deshacer esta migración; ver el bloque comentado al final)

-- ───────────────────────── 1. Código de acceso del hospital ─────────────────────────
alter table public.clinicas add column if not exists codigo_acceso text;
alter table public.clinicas drop constraint if exists clinicas_codigo_acceso_formato;
alter table public.clinicas add constraint clinicas_codigo_acceso_formato
  check (codigo_acceso is null or codigo_acceso ~ '^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$');   -- 4–20 caracteres: mayúsculas, dígitos y guion
create unique index if not exists clinicas_codigo_acceso_uq on public.clinicas (codigo_acceso) where codigo_acceso is not null;

-- A client (PostgREST role) can never write the code directly, even if it has UPDATE on the table; only the RPC below can.
-- Plain SECURITY INVOKER function on purpose: current_user is the role that ran the statement ('authenticated' for a direct call from the app,
-- the function owner when it runs inside the SECURITY DEFINER RPC).
create or replace function public.hospital_clinica_codigo() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.codigo_acceso is not null then raise exception 'CAMPO_PROTEGIDO'; end if;
    if tg_op = 'UPDATE' and new.codigo_acceso is distinct from old.codigo_acceso then raise exception 'CAMPO_PROTEGIDO'; end if;
  end if;
  return new;
end $$;
drop trigger if exists clinicas_codigo_acceso_proteger on public.clinicas;
create trigger clinicas_codigo_acceso_proteger before insert or update on public.clinicas
  for each row execute function public.hospital_clinica_codigo();

-- Returns the hospital's access code (creating one when missing) or sets a new one. Only the administrator of a hospital account.
create or replace function public.hospital_codigo_acceso(p_codigo text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  cid uuid := public.mi_clinica();
  esp text; nom text; actual text; v text; pref text; intento int := 0;
begin
  if cid is null or not public.es_admin() or public.es_soporte() or public.clinica_vencida_de(cid) is true then raise exception 'SIN_PERMISO'; end if;
  select especialidad, nombre, codigo_acceso into esp, nom, actual from public.clinicas where id = cid;
  if esp is distinct from 'hospital' then raise exception 'NO_HOSPITAL'; end if;

  if p_codigo is not null then
    v := upper(btrim(p_codigo));
    if v !~ '^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$' then raise exception 'CODIGO_INVALIDO'; end if;
    begin
      update public.clinicas set codigo_acceso = v where id = cid;
    exception when unique_violation then raise exception 'CODIGO_OCUPADO';
    end;
    return v;
  end if;

  if actual is not null then return actual; end if;
  -- generate: up to 4 letters of the name + 4 digits; retry on a collision
  pref := left(upper(regexp_replace(translate(coalesce(nom, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z]', '', 'g')), 4);
  if char_length(pref) < 2 then pref := 'HOSP'; end if;
  loop
    intento := intento + 1;
    v := pref || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    begin
      update public.clinicas set codigo_acceso = v where id = cid and codigo_acceso is null;
      return coalesce((select codigo_acceso from public.clinicas where id = cid), v);
    exception when unique_violation then
      if intento >= 20 then raise exception 'CODIGO_OCUPADO'; end if;
    end;
  end loop;
end $$;
revoke all on function public.hospital_codigo_acceso(text) from public, anon;
grant execute on function public.hospital_codigo_acceso(text) to authenticated;

-- ───────────────────────── 2. Columnas de perfiles + protección ─────────────────────────
alter table public.perfiles
  add column if not exists usuario text,
  add column if not exists puesto text,
  add column if not exists activo boolean not null default true,
  add column if not exists clave_temporal_at timestamptz;
alter table public.perfiles drop constraint if exists perfiles_usuario_formato;
alter table public.perfiles add constraint perfiles_usuario_formato check (usuario is null or usuario ~ '^[a-z0-9._-]{3,30}$');
alter table public.perfiles drop constraint if exists perfiles_puesto_largo;
alter table public.perfiles add constraint perfiles_puesto_largo check (puesto is null or char_length(puesto) <= 40);
create unique index if not exists perfiles_usuario_uq on public.perfiles (clinica_id, lower(usuario)) where usuario is not null;
-- staff users have no e-mail (live column is NOT NULL)
alter table public.perfiles alter column email drop not null;
-- harmless when SELECT is table-wide; needed when it was granted per column (pre-check F)
grant select (usuario, puesto, activo, clave_temporal_at) on public.perfiles to authenticated;

-- Separate trigger (the live perfil_proteger is NOT replaced). Clients: no change of usuario / activo / clave_temporal_at; for staff users also not
-- password_creada nor email (done by the cambiar-clave / usuarios-hospital functions with the service role); puesto only by the administrator.
create or replace function public.hospital_perfil_campos() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.usuario is distinct from old.usuario or new.activo is distinct from old.activo or new.clave_temporal_at is distinct from old.clave_temporal_at then
      raise exception 'CAMPO_PROTEGIDO';
    end if;
    if old.usuario is not null and (new.password_creada is distinct from old.password_creada or new.email is distinct from old.email) then
      raise exception 'CAMPO_PROTEGIDO';
    end if;
    if new.puesto is distinct from old.puesto and not public.es_admin() then
      raise exception 'CAMPO_PROTEGIDO';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists perfil_campos_hospital on public.perfiles;
create trigger perfil_campos_hospital before update on public.perfiles
  for each row execute function public.hospital_perfil_campos();

-- ───────────────────────── 3. mi_clinica(): un usuario desactivado no ve nada ─────────────────────────
-- Same body as the live one (pedido del planificador) + «and p.activo». Same attributes. Compare with pre-check A before applying.
create or replace function public.mi_clinica() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select p.clinica_id from public.perfiles p where p.user_id = auth.uid()
    and p.activo
    and (p.rol is distinct from 'soporte' or (exists (select 1 from public.soporte_agentes g where g.user_id = p.user_id and g.activo)
         and exists (select 1 from public.soporte_accesos a where a.clinica_id = p.clinica_id and a.usado_por = auth.uid() and a.revocado_at is null and a.terminado_at is null and a.vence_at > now())))
$$;

-- ───────────────────────── 4. Intentos de acceso (solo service role) ─────────────────────────
create table if not exists public.acceso_intentos (
  id bigserial primary key,
  clinica_id uuid,
  usuario text,
  ip text,
  ok boolean not null,
  at timestamptz not null default now()
);
alter table public.acceso_intentos enable row level security;   -- no policies: only the service role (edge function) reads or writes
create index if not exists acceso_intentos_usuario_idx on public.acceso_intentos (clinica_id, usuario, at desc);
create index if not exists acceso_intentos_ip_idx on public.acceso_intentos (ip, at desc);
revoke all on public.acceso_intentos from public, anon, authenticated;
revoke all on sequence public.acceso_intentos_id_seq from public, anon, authenticated;

-- ───────────────────────── 5. Alta del personal del hospital (trigger hermano) ─────────────────────────
create or replace function public.hospital_crear_perfil_usuario() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  cid uuid; esp text; usr text; nom text; pst text; perm jsonb;
begin
  -- every inconsistency aborts the creation of the auth user (same transaction): no clinic is ever created from this branch
  begin
    cid := (new.raw_app_meta_data ->> 'clinica_id')::uuid;
  exception when others then
    raise exception 'ALTA_HOSPITAL_INVALIDA';
  end;
  select c.especialidad into esp from public.clinicas c where c.id = cid;
  if not found or esp is distinct from 'hospital' then raise exception 'ALTA_HOSPITAL_INVALIDA'; end if;

  usr := lower(btrim(coalesce(new.raw_app_meta_data ->> 'usuario', '')));
  if usr !~ '^[a-z0-9._-]{3,30}$' then raise exception 'ALTA_HOSPITAL_INVALIDA'; end if;
  nom := btrim(coalesce(new.raw_app_meta_data ->> 'nombre', ''));
  if char_length(nom) < 2 or char_length(nom) > 80 then raise exception 'ALTA_HOSPITAL_INVALIDA'; end if;
  pst := nullif(btrim(coalesce(new.raw_app_meta_data ->> 'puesto', '')), '');
  if pst is not null and char_length(pst) > 40 then raise exception 'ALTA_HOSPITAL_INVALIDA'; end if;
  perm := new.raw_app_meta_data -> 'permisos';
  if perm is null or jsonb_typeof(perm) <> 'object' then raise exception 'ALTA_HOSPITAL_INVALIDA'; end if;

  -- seats: serialise the altas of one clinic and check the limit inside this same transaction
  perform pg_advisory_xact_lock(hashtextextended('hospital_cupo:' || cid::text, 0));
  if public.usuarios_ocupados(cid) >= public.usuarios_permitidos(cid) then raise exception 'LIMITE_USUARIOS'; end if;

  insert into public.perfiles (user_id, clinica_id, nombre, email, rol, permisos, password_creada, usuario, puesto, activo, clave_temporal_at)
  values (new.id, cid, nom, null, 'asistente', perm, false, usr, pst, true, now());   -- the temporary password's 72 h clock starts here
  return new;
end $$;
revoke all on function public.hospital_crear_perfil_usuario() from public, anon, authenticated;

-- The existing trigger is re-created IDENTICAL (AFTER INSERT, per row, same function) plus a WHEN that skips the hospital alta.
-- The body of crear_clinica_para_usuario() is not touched. Compare with pre-check B before applying.
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row when (coalesce(new.raw_app_meta_data ->> 'alta', '') is distinct from 'hospital')
  execute function public.crear_clinica_para_usuario();
drop trigger if exists al_crear_usuario_hospital on auth.users;
create trigger al_crear_usuario_hospital after insert on auth.users
  for each row when (new.raw_app_meta_data ->> 'alta' = 'hospital')
  execute function public.hospital_crear_perfil_usuario();

-- ───────────────────────── 5b. Editar permisos / nombre / puesto (administrador) ─────────────────────────
-- Only path for «Editar permisos» of staff users AND e-mail assistants. Runs as the owner (SECURITY DEFINER keeps auth.uid()), so the live
-- perfil_proteger sees es_admin() = true and lets it through. Unknown permission keys are dropped; wrong value types are rejected.
create or replace function public.perfil_admin_actualizar(p_user uuid, p_nombre text default null, p_puesto text default null, p_permisos jsonb default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  cid uuid := public.mi_clinica();
  objetivo record; nom text; pst text; limpio jsonb := '{}'::jsonb; r record; prof text;
  permitidas constant text[] := array['expedientes','finanzas','inventario','costos','compras','emergencias','exportar','eliminar_citas','eliminar_inventario','eliminar',
                                      'configuracion','quirofano','camas','registrar','ver_todos_pacientes'];
begin
  if auth.uid() is null or cid is null or not public.es_admin() or public.es_soporte() or public.clinica_vencida_de(cid) is true then raise exception 'SIN_PERMISO'; end if;
  select user_id, clinica_id, rol into objetivo from public.perfiles where user_id = p_user;
  if not found or objetivo.clinica_id <> cid or objetivo.user_id = auth.uid() or objetivo.rol in ('dueno', 'soporte') then raise exception 'SIN_PERMISO'; end if;

  if p_nombre is not null then
    nom := btrim(p_nombre);
    if char_length(nom) < 2 or char_length(nom) > 80 then raise exception 'DATOS_INVALIDOS'; end if;
  end if;
  if p_puesto is not null then
    pst := nullif(btrim(p_puesto), '');
    if pst is not null and char_length(pst) > 40 then raise exception 'DATOS_INVALIDOS'; end if;
  end if;
  if p_permisos is not null then
    if jsonb_typeof(p_permisos) <> 'object' then raise exception 'DATOS_INVALIDOS'; end if;
    for r in select key, value from jsonb_each(p_permisos) loop
      if r.key = 'profesional_id' then
        if jsonb_typeof(r.value) <> 'string' then raise exception 'DATOS_INVALIDOS'; end if;
        prof := r.value #>> '{}';
        if prof <> '' then
          begin
            perform 1 from public.profesionales where id = prof::uuid and clinica_id = cid;
          exception when others then raise exception 'DATOS_INVALIDOS';
          end;
          if not found then raise exception 'REFERENCIA_AJENA'; end if;
          limpio := limpio || jsonb_build_object('profesional_id', prof);
        end if;
      elsif r.key = any (permitidas) then
        if jsonb_typeof(r.value) <> 'boolean' then raise exception 'DATOS_INVALIDOS'; end if;
        limpio := limpio || jsonb_build_object(r.key, r.value);
      end if; -- unknown keys are dropped
    end loop;
  end if;

  update public.perfiles set
    nombre = coalesce(nom, nombre),
    puesto = case when p_puesto is null then puesto else pst end,
    permisos = case when p_permisos is null then permisos else limpio end
  where user_id = p_user and clinica_id = cid;
end $$;
revoke all on function public.perfil_admin_actualizar(uuid, text, text, jsonb) from public, anon;
grant execute on function public.perfil_admin_actualizar(uuid, text, text, jsonb) to authenticated;

-- ───────────────────────── 5d. El correo / teléfono de un usuario del hospital no cambia ─────────────────────────
create or replace function public.hospital_auth_fijo() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  raise exception 'CAMPO_PROTEGIDO';
end $$;
revoke all on function public.hospital_auth_fijo() from public, anon, authenticated;
drop trigger if exists hospital_auth_fijo on auth.users;
create trigger hospital_auth_fijo before update on auth.users for each row
  when (old.raw_app_meta_data ->> 'alta' = 'hospital' and (new.email is distinct from old.email or coalesce(new.email_change, '') <> '' or new.phone is distinct from old.phone))
  execute function public.hospital_auth_fijo();

-- ───────────────────────── 6. Funciones de apoyo ─────────────────────────
-- Seats of a clinic (service role: used by the usuarios-hospital edge function; positional call to the live helpers, so no argument names are assumed)
create or replace function public.hospital_cupos_de(p_clinica uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('ocupados', public.usuarios_ocupados(p_clinica), 'permitidos', public.usuarios_permitidos(p_clinica))
$$;
revoke all on function public.hospital_cupos_de(uuid) from public, anon, authenticated;
grant execute on function public.hospital_cupos_de(uuid) to service_role;

-- Seats of the caller's clinic (administrator only), for «5 de 15 usuarios» in Configuración
create or replace function public.hospital_usuarios_cupos() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare cid uuid := public.mi_clinica();
begin
  if cid is null or not public.es_admin() then raise exception 'SIN_PERMISO'; end if;
  return jsonb_build_object('ocupados', public.usuarios_ocupados(cid), 'permitidos', public.usuarios_permitidos(cid));
end $$;
revoke all on function public.hospital_usuarios_cupos() from public, anon;
grant execute on function public.hospital_usuarios_cupos() to authenticated;

-- Ends every session of a user (service role): password reset / deactivation. Access tokens already issued still work until they expire.
create or replace function public.hospital_cerrar_sesiones(p_user uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
end $$;
revoke all on function public.hospital_cerrar_sesiones(uuid) from public, anon, authenticated;
grant execute on function public.hospital_cerrar_sesiones(uuid) to service_role;

-- ROLLBACK (pegar tal cual para deshacer; los usuarios del personal ya creados quedarían como perfiles con usuario: borrarlos antes con la función eliminar)
--   drop trigger if exists al_crear_usuario_hospital on auth.users;
--   drop trigger if exists al_crear_usuario on auth.users;
--   create trigger al_crear_usuario after insert on auth.users for each row execute function public.crear_clinica_para_usuario();   -- como estaba (pre-check B)
--   -- mi_clinica(): volver al cuerpo vivo guardado del pre-check A (el mismo sin «and p.activo»)
--   drop trigger if exists hospital_auth_fijo on auth.users;  drop function if exists public.hospital_auth_fijo();
--   drop function if exists public.perfil_admin_actualizar(uuid, text, text, jsonb);
--   -- perfiles.email: `alter table public.perfiles alter column email set not null;` SOLO es posible cuando ya no existan usuarios del personal (email null); borrarlos antes.
--   drop function if exists public.hospital_crear_perfil_usuario();
--   drop function if exists public.hospital_cerrar_sesiones(uuid);
--   drop function if exists public.hospital_cupos_de(uuid);
--   drop function if exists public.hospital_usuarios_cupos();
--   drop function if exists public.hospital_codigo_acceso(text);
--   drop trigger if exists perfil_campos_hospital on public.perfiles;  drop function if exists public.hospital_perfil_campos();
--   drop trigger if exists clinicas_codigo_acceso_proteger on public.clinicas;  drop function if exists public.hospital_clinica_codigo();
--   drop table if exists public.acceso_intentos;
--   drop index if exists public.perfiles_usuario_uq;  drop index if exists public.clinicas_codigo_acceso_uq;
--   alter table public.perfiles drop constraint if exists perfiles_usuario_formato, drop constraint if exists perfiles_puesto_largo;
--   alter table public.perfiles drop column if exists usuario, drop column if exists puesto, drop column if exists activo, drop column if exists clave_temporal_at;
--   alter table public.clinicas drop constraint if exists clinicas_codigo_acceso_formato;  alter table public.clinicas drop column if exists codigo_acceso;

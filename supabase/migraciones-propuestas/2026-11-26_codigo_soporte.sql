-- PROPUESTA (NO APLICADA) · 2026-11-26
-- Qué hace: el personal de soporte de Conception solo puede entrar a una clínica con un código que la propia clínica genera.
--   * La dueña pulsa «Generar código de soporte» en Configuración: código aleatorio de 10 caracteres (XXXXX-XXXXX), válido 24 horas.
--     Generar otro cancela el anterior (y cierra la sesión de soporte si estaba en uso). También se puede cancelar sin generar otro.
--   * Soporte (cuentas dedicadas en `soporte_agentes`) escribe el código en la pantalla «Soporte Conception» y obtiene un perfil
--     temporal con rol 'soporte' en esa clínica. Ese perfil solo vale mientras el código esté vigente (ver mi_clinica()).
--   * La clínica ve un historial: quién creó cada código y cuándo, cuándo se usó y qué agente, cuándo vence / se canceló / terminó.
--   * Solo se guarda el hash (sha256) del código; el código en claro se muestra una sola vez al generarlo.
-- Tablas nuevas: soporte_agentes, soporte_accesos, soporte_intentos. Funciones nuevas: soporte_generar, soporte_revocar, soporte_entrar,
--   soporte_salir, soporte_estado (y dos internas: soporte_cerrar_clinica, soporte_limpiar_vencidos).
-- Funciones reemplazadas: mi_clinica(), tiene_permiso(text), perfil_proteger() (+ bloques TODO al final para usuarios_ocupados,
--   usuarios_permitidos, puede_eliminar_citas y puede_eliminar_inventario, que el planificador debe completar con las definiciones vivas).
-- Restricción cambiada: perfiles_rol_check ahora admite 'soporte'.
--
-- RIESGOS
--   * Reemplaza mi_clinica(), la base de casi todas las políticas RLS. Para rol 'dueno'/'asistente'/'miembro' el resultado es idéntico al
--     anterior (select clinica_id from perfiles where user_id = auth.uid()); solo cambia para rol 'soporte'. Probar a fondo antes de aplicar.
--   * Reemplaza perfil_proteger() con la definición que se nos dio; ANTES de aplicar, comparar con la viva:
--       select pg_get_functiondef('public.perfil_proteger'::regproc);
--     y ajustar si difiere (atributos, otras reglas). Lo único que se agrega es el bloque marcado «NUEVO (soporte)».
--   * Si hay triggers en perfiles al INSERT/DELETE (límite de usuarios, avisos) podrían reaccionar al perfil temporal: revisar
--       select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.perfiles'::regclass and not tgisinternal;
--   * Si algún trigger sobre auth.users crea clínica/perfil automáticamente para cada cuenta nueva (crear_clinica_para_usuario), las cuentas de
--     soporte nacerían con un perfil 'dueno'/'asistente' y soporte_entrar las rechazaría (AGENTE_CON_CLINICA): al crear un agente hay que
--     borrar ese perfil y su clínica vacía a mano.
--   * Las Edge Functions (service role) leen `perfiles` sin mirar si el código sigue vigente: ver la nota «EDGE FUNCTIONS» más abajo.
--   * Alta de agentes (a mano, en el editor SQL, nunca desde la app):
--       insert into public.soporte_agentes (user_id, nombre) values ('<uuid de auth.users>', 'Nombre del agente');
--
-- CÓMO PROBAR DENTRO DE UNA TRANSACCIÓN (con rollback; nada queda aplicado)
--   begin;
--     \i supabase/migraciones-propuestas/2026-11-26_codigo_soporte.sql   -- (o pegar el contenido sin su begin/commit)
--     -- simular a la dueña (reemplazar por ids reales):
--     select set_config('request.jwt.claims', json_build_object('sub', '<user_id_dueno>', 'role', 'authenticated')::text, true);
--     set local role authenticated;
--     select public.soporte_generar();                      -- devuelve XXXXX-XXXXX
--     select id, creado_nombre, vence_at from public.soporte_accesos;   -- ve su historial
--     select codigo_hash from public.soporte_accesos;       -- debe fallar: permission denied (columna sin permiso)
--     reset role;
--     -- simular al agente (debe existir en soporte_agentes y no tener perfil de clínica):
--     select set_config('request.jwt.claims', json_build_object('sub', '<user_id_agente>', 'role', 'authenticated')::text, true);
--     set local role authenticated;
--     select public.soporte_entrar('AAAAA-BBBBB');           -- código malo: devuelve null y suma un intento
--     select public.soporte_entrar('<el código generado>');  -- devuelve el id de la clínica
--     select public.mi_clinica(), public.es_admin(), public.tiene_permiso('finanzas'), public.tiene_permiso('eliminar');  -- id, f, t, f
--     select public.soporte_estado();
--     select public.soporte_salir();
--   rollback;   -- nada de lo anterior queda guardado
--
-- CÓMO DESHACER (si ya se aplicó)
--   begin;
--     delete from public.perfiles where rol = 'soporte';
--     create or replace function public.mi_clinica() returns uuid language sql stable security definer set search_path to 'public'
--       as $f$ select clinica_id from public.perfiles where user_id = auth.uid(); $f$;
--     create or replace function public.tiene_permiso(p text) returns boolean language sql stable security definer set search_path to 'public'
--       as $f$ select coalesce((select rol = 'dueno' or coalesce((permisos->>p)::boolean, false) from public.perfiles where user_id = auth.uid()), false); $f$;
--     -- perfil_proteger(): volver a la definición guardada antes de aplicar (la sin el bloque «NUEVO (soporte)»).
--     alter table public.perfiles drop constraint perfiles_rol_check;
--     alter table public.perfiles add constraint perfiles_rol_check check (rol in ('dueno', 'asistente', 'miembro'));
--     drop function if exists public.soporte_generar(), public.soporte_revocar(), public.soporte_entrar(text), public.soporte_salir(),
--       public.soporte_estado(), public.soporte_cerrar_clinica(uuid), public.soporte_limpiar_vencidos();
--     drop table if exists public.soporte_intentos, public.soporte_accesos, public.soporte_agentes;
--     -- y deshacer los bloques TODO que se hayan aplicado (usuarios_ocupados, usuarios_permitidos, puede_eliminar_*).
--   commit;
--
-- EDGE FUNCTIONS (no se tocan aquí; decisión del planificador)
--   * lia-responder (rutas desde la app) y eliminar-cuenta leen `perfiles` con service role y NO comprueban que el código siga vigente.
--     Mientras el perfil temporal exista (hasta que se cancele, se genere otro código, soporte salga, o corra soporte_limpiar_vencidos()),
--     un agente con el código ya vencido podría llamarlas directamente. Arreglos posibles: que esas funciones rechacen rol 'soporte', o
--     programar soporte_limpiar_vencidos() (requiere aprobación; hay una línea de pg_cron comentada al final).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ─────────────────────────────────────────────────────────────────────────────

-- Support agents: dedicated accounts, managed only from the SQL editor / service role (no policies on purpose).
create table public.soporte_agentes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz default now()
);
alter table public.soporte_agentes enable row level security;
revoke all on public.soporte_agentes from public, anon, authenticated;

-- One row per generated code. Only the sha256 of the code is stored.
create table public.soporte_accesos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  codigo_hash text not null,
  creado_por uuid,
  creado_nombre text,
  creado_at timestamptz default now(),
  vence_at timestamptz not null,
  usado_at timestamptz,
  usado_por uuid,
  usado_nombre text,
  revocado_at timestamptz,
  terminado_at timestamptz
);
create index soporte_accesos_clinica_idx on public.soporte_accesos (clinica_id, creado_at desc);
create unique index soporte_accesos_hash_idx on public.soporte_accesos (codigo_hash);
alter table public.soporte_accesos enable row level security;
revoke all on public.soporte_accesos from public, anon, authenticated;
-- Column-level grant: the hash is never readable by the browser. The app must select explicit columns (never select *).
grant select (id, clinica_id, creado_por, creado_nombre, creado_at, vence_at, usado_at, usado_por, usado_nombre, revocado_at, terminado_at)
  on public.soporte_accesos to authenticated;
-- Only the clinic's administrator sees the history of their own clinic. No insert/update/delete policies: only the RPCs below write.
create policy soporte_accesos_ver on public.soporte_accesos
  for select to authenticated
  using (clinica_id = public.mi_clinica() and public.es_admin());

-- Failed code attempts, used to rate-limit each agent. No policies: only soporte_entrar touches it.
create table public.soporte_intentos (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index soporte_intentos_user_idx on public.soporte_intentos (user_id, at desc);
alter table public.soporte_intentos enable row level security;
revoke all on public.soporte_intentos from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rol 'soporte' permitido en perfiles
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.perfiles drop constraint perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('dueno', 'asistente', 'miembro', 'soporte'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Helpers: a support session is honoured ONLY while its code is valid
-- ─────────────────────────────────────────────────────────────────────────────

-- For every role except 'soporte' this is exactly the previous definition (clinic of the caller's profile).
-- A 'soporte' profile resolves to its clinic only while a code used by that same user is unrevoked, unfinished and unexpired.
create or replace function public.mi_clinica() returns uuid
language sql stable security definer set search_path to 'public'
as $$
  select p.clinica_id
  from public.perfiles p
  where p.user_id = auth.uid()
    and (
      p.rol <> 'soporte'
      or exists (
        select 1 from public.soporte_accesos a
        where a.clinica_id = p.clinica_id
          and a.usado_por = auth.uid()
          and a.revocado_at is null
          and a.terminado_at is null
          and a.vence_at > now()
      )
    );
$$;

-- es_admin() is intentionally NOT replaced: rol = 'dueno' stays false for 'soporte'.

-- 'soporte' gets every permission except the destructive / export ones, and only while its code is valid (mi_clinica() not null).
-- Other roles: unchanged ('dueno' → true; others → their permisos jsonb).
create or replace function public.tiene_permiso(p text) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select coalesce((
    select case
      when pf.rol = 'dueno' then true
      when pf.rol = 'soporte' then
        tiene_permiso.p not in ('eliminar', 'eliminar_citas', 'eliminar_inventario', 'exportar')
        and public.mi_clinica() is not null
      else coalesce((pf.permisos ->> tiene_permiso.p)::boolean, false)
    end
    from public.perfiles pf
    where pf.user_id = auth.uid()
  ), false);
$$;

-- Same grants as before: authenticated and service_role only (not anon / public).
revoke execute on function public.mi_clinica() from public, anon;
revoke execute on function public.tiene_permiso(text) from public, anon;
grant execute on function public.mi_clinica() to authenticated, service_role;
grant execute on function public.tiene_permiso(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. perfil_proteger(): nobody can turn the temporary support profile into a real one
-- ─────────────────────────────────────────────────────────────────────────────
-- Without this, the clinic administrator (policy perfil_admin_editar, allowed by the trigger because es_admin() is true)
-- could update the support profile to rol 'dueno' and give the agent permanent access that no longer depends on the code.
-- Body = the definition we were given, plus the block marked NUEVO (soporte). VERIFY against the live function first (see RIESGOS).
create or replace function public.perfil_proteger() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  -- NUEVO (soporte): a support profile can only be created by soporte_entrar and removed (never edited or promoted);
  -- no profile can be turned INTO a support profile either.
  if (old.rol = 'soporte' or new.rol = 'soporte')
     and (new.rol is distinct from old.rol or new.clinica_id is distinct from old.clinica_id or new.permisos is distinct from old.permisos) then
    raise exception 'SIN_PERMISO';
  end if;
  if not es_admin() and (new.rol is distinct from old.rol or new.permisos is distinct from old.permisos or new.clinica_id is distinct from old.clinica_id) then
    raise exception 'SIN_PERMISO';
  end if;
  if old.user_id = auth.uid() and new.rol is distinct from old.rol then
    raise exception 'SIN_PERMISO';
  end if;
  return new;
end;
$$;
-- (the trigger that calls it is not recreated: create or replace keeps it attached)

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Funciones internas (no se pueden llamar desde la app)
-- ─────────────────────────────────────────────────────────────────────────────

-- Ends everything support-related in a clinic: revokes any still-valid code, closes sessions in use, removes the support profiles.
-- Support profiles are deleted/inserted (never updated), so perfil_proteger (an UPDATE trigger) is not involved, and this function,
-- owned by postgres and security definer, bypasses RLS. No GUC bypass is used.
create or replace function public.soporte_cerrar_clinica(p_clinica uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
begin
  update public.soporte_accesos
     set revocado_at = now()
   where clinica_id = p_clinica and revocado_at is null and terminado_at is null and vence_at > now();
  update public.soporte_accesos
     set terminado_at = now()
   where clinica_id = p_clinica and usado_at is not null and terminado_at is null;
  delete from public.perfiles where clinica_id = p_clinica and rol = 'soporte';
end;
$$;
revoke execute on function public.soporte_cerrar_clinica(uuid) from public, anon, authenticated;

-- Housekeeping for support profiles whose code is no longer valid (expired by time). Not called by the app.
-- To schedule it (needs approval): select cron.schedule('soporte-limpiar', '*/10 * * * *', 'select public.soporte_limpiar_vencidos()');
create or replace function public.soporte_limpiar_vencidos() returns integer
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_n integer;
begin
  update public.soporte_accesos
     set terminado_at = now()
   where usado_at is not null and terminado_at is null and (revocado_at is not null or vence_at <= now());
  delete from public.perfiles p
   where p.rol = 'soporte'
     and not exists (
       select 1 from public.soporte_accesos a
       where a.clinica_id = p.clinica_id and a.usado_por = p.user_id
         and a.revocado_at is null and a.terminado_at is null and a.vence_at > now()
     );
  get diagnostics v_n = row_count;
  delete from public.soporte_intentos where at < now() - interval '1 day';
  return v_n;
end;
$$;
revoke execute on function public.soporte_limpiar_vencidos() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPCs para la clínica (administrador)
-- ─────────────────────────────────────────────────────────────────────────────

-- Generates a new support code for the caller's clinic and cancels the previous one. Returns the code in clear ONCE.
create or replace function public.soporte_generar() returns text
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_clinica uuid;
  v_nombre text;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symbols: byte & 31 is unbiased
  v_bytes bytea;
  v_codigo text := '';
  i integer;
begin
  if auth.uid() is null or not public.es_admin() then raise exception 'SIN_PERMISO'; end if;
  v_clinica := public.mi_clinica();
  if v_clinica is null then raise exception 'SIN_PERMISO'; end if;

  -- serialise concurrent clicks (two tabs) on the same clinic
  perform 1 from public.clinicas where id = v_clinica for update;

  perform public.soporte_cerrar_clinica(v_clinica);

  v_bytes := extensions.gen_random_bytes(10);
  for i in 0..9 loop
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) & 31) + 1, 1);
  end loop;

  select nombre into v_nombre from public.perfiles where user_id = auth.uid();

  insert into public.soporte_accesos (clinica_id, codigo_hash, creado_por, creado_nombre, vence_at)
  values (v_clinica, encode(extensions.digest(v_codigo, 'sha256'), 'hex'), auth.uid(), v_nombre, now() + interval '24 hours');

  return left(v_codigo, 5) || '-' || right(v_codigo, 5);
end;
$$;
revoke execute on function public.soporte_generar() from public, anon;
grant execute on function public.soporte_generar() to authenticated;

-- Cancels the active code and ends any active support session in the caller's clinic.
create or replace function public.soporte_revocar() returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_clinica uuid;
begin
  if auth.uid() is null or not public.es_admin() then raise exception 'SIN_PERMISO'; end if;
  v_clinica := public.mi_clinica();
  if v_clinica is null then raise exception 'SIN_PERMISO'; end if;
  perform 1 from public.clinicas where id = v_clinica for update;
  perform public.soporte_cerrar_clinica(v_clinica);
end;
$$;
revoke execute on function public.soporte_revocar() from public, anon;
grant execute on function public.soporte_revocar() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPCs para soporte
-- ─────────────────────────────────────────────────────────────────────────────

-- A support agent enters a clinic with its code. Returns the clinic id, or NULL for an invalid code.
-- Errors: NO_AGENTE, AGENTE_CON_CLINICA, DEMASIADOS_INTENTOS. The invalid-code path does NOT raise (a raise would roll back the
-- attempt row and defeat the rate limit); the app treats NULL as «código no válido».
create or replace function public.soporte_entrar(p_codigo text) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_nombre text;
  v_norm text;
  v_acceso public.soporte_accesos%rowtype;
  v_email text;
begin
  select a.nombre into v_nombre from public.soporte_agentes a where a.user_id = v_uid and a.activo;
  if v_uid is null or v_nombre is null then raise exception 'NO_AGENTE'; end if;

  -- agents are dedicated accounts: a user that belongs to a real clinic cannot be an agent
  if exists (select 1 from public.perfiles where user_id = v_uid and rol <> 'soporte') then raise exception 'AGENTE_CON_CLINICA'; end if;

  if (select count(*) from public.soporte_intentos where user_id = v_uid and at > now() - interval '1 hour') >= 5 then
    raise exception 'DEMASIADOS_INTENTOS';
  end if;

  -- normalise: upper-case, no dashes or spaces
  v_norm := upper(regexp_replace(coalesce(p_codigo, ''), '[\s-]', '', 'g'));

  if length(v_norm) = 10 then
    -- FOR UPDATE: two agents sending the same code at once are serialised; the second re-checks usado_por and finds no row
    select * into v_acceso
      from public.soporte_accesos a
     where a.codigo_hash = encode(extensions.digest(v_norm, 'sha256'), 'hex')
       and a.revocado_at is null and a.terminado_at is null and a.vence_at > now()
       and (a.usado_at is null or a.usado_por = v_uid)
       for update;
  end if;

  if v_acceso.id is null then
    insert into public.soporte_intentos (user_id) values (v_uid);
    delete from public.soporte_intentos where at < now() - interval '1 day';
    return null;
  end if;

  update public.soporte_accesos
     set usado_at = coalesce(usado_at, now()), usado_por = v_uid, usado_nombre = v_nombre
   where id = v_acceso.id;

  -- leaving any earlier session of this agent (another clinic, or an old one of this clinic)
  update public.soporte_accesos set terminado_at = now()
   where usado_por = v_uid and id <> v_acceso.id and terminado_at is null;
  delete from public.perfiles where user_id = v_uid and rol = 'soporte';

  select email into v_email from auth.users where id = v_uid;
  insert into public.perfiles (user_id, clinica_id, nombre, email, rol, permisos, password_creada)
  values (v_uid, v_acceso.clinica_id, 'Soporte Conception — ' || v_nombre, v_email, 'soporte', '{}'::jsonb, true);

  return v_acceso.clinica_id;
end;
$$;
revoke execute on function public.soporte_entrar(text) from public, anon;
grant execute on function public.soporte_entrar(text) to authenticated;

-- The agent leaves the clinic (or the app cleans up after an expired code): closes the session and removes the temporary profile.
create or replace function public.soporte_salir() returns void
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
begin
  if auth.uid() is null then return; end if;
  update public.soporte_accesos set terminado_at = now()
   where usado_por = auth.uid() and usado_at is not null and terminado_at is null;
  delete from public.perfiles where user_id = auth.uid() and rol = 'soporte';
end;
$$;
revoke execute on function public.soporte_salir() from public, anon;
grant execute on function public.soporte_salir() to authenticated;

-- { agente: boolean, sesion: null | { clinica_id, clinica_nombre, vence_at } } for the caller. Any authenticated user may call it.
create or replace function public.soporte_estado() returns json
language sql stable security definer set search_path = public, extensions, pg_temp
as $$
  select json_build_object(
    'agente', exists (select 1 from public.soporte_agentes a where a.user_id = auth.uid() and a.activo),
    'sesion', (
      select json_build_object('clinica_id', c.id, 'clinica_nombre', c.nombre, 'vence_at', x.vence_at)
      from public.perfiles p
      join public.soporte_accesos x on x.clinica_id = p.clinica_id and x.usado_por = p.user_id
      join public.clinicas c on c.id = p.clinica_id
      where p.user_id = auth.uid() and p.rol = 'soporte'
        and x.revocado_at is null and x.terminado_at is null and x.vence_at > now()
      order by x.vence_at desc
      limit 1
    )
  );
$$;
revoke execute on function public.soporte_estado() from public, anon;
grant execute on function public.soporte_estado() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. TODO para el planificador (no se pueden escribir sin las definiciones vivas)
-- ─────────────────────────────────────────────────────────────────────────────
-- Obtener cada definición con:  select pg_get_functiondef('public.<nombre>'::regproc);  y reescribirla con el cambio indicado.
--
-- TODO-1  usuarios_ocupados(cid uuid) y usuarios_permitidos(cid uuid): las filas de perfiles con rol = 'soporte' NO cuentan como
--         asientos del plan (el perfil temporal de soporte no debe llenar el cupo ni bloquear invitaciones). Agregar
--         «and rol <> 'soporte'» al conteo de perfiles en usuarios_ocupados.
--         (supabase/sql no trae estas definiciones; el cupo también se muestra en la app: ConfigExtra.jsx ya excluye 'soporte' del conteo.)
--
-- TODO-2  puede_eliminar_citas() y puede_eliminar_inventario(): deben devolver false para rol = 'soporte'.
--         supabase/sql/citas_eliminadas.sql e inventario_eliminados.sql no traen el cuerpo completo. Si ambas funciones llaman a
--         tiene_permiso('eliminar_citas') / tiene_permiso('eliminar_inventario') (o a es_admin()), ya devuelven false para soporte con las
--         definiciones de arriba; si leen perfiles.permisos directamente, hay que agregar «and rol <> 'soporte'».
--
-- TODO-3  Revisar si alguna política (tablas o storage) lee `perfiles` directamente en vez de usar mi_clinica()/es_admin()/tiene_permiso():
--         esas ignorarían la vigencia del código. Buscar con:
--           select schemaname, tablename, policyname, qual, with_check from pg_policies
--            where (coalesce(qual,'') || coalesce(with_check,'')) ilike '%perfiles%';
--           select policyname, qual, with_check from pg_policies where schemaname = 'storage';

commit;

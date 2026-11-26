-- PROPUESTA (NO APLICADA) · 2026-11-27
-- Qué hace
--   A. Códigos de invitación de lanzamiento. La dueña da un código a sus clientes actuales; al crear la cuenta (o después, desde Suscripción,
--      si la cuenta no tiene plan) la clínica queda con el plan 'max' (por defecto; Lía/'ultra' todavía no se ofrece) gratis por N días (por
--      defecto 60). Los códigos son aleatorios y de un solo uso (recomendado); también puede haber códigos de varios usos.
--   B. CUENTA VENCIDA = SOLO LECTURA. Cuando el período gratis o la suscripción TERMINA y no pagan, la clínica queda de solo lectura: no pueden
--      registrar pacientes, usar el calendario, editar nada, descargar existencias del inventario ni hacer ajustes. Solo pueden descargar sus
--      datos (Excel y PDF), activar un plan o eliminar su cuenta. Sus datos NUNCA los borramos nosotros.
--      Definición única (SQL y pantalla): una clínica es «vencida» cuando  plan <> 'prueba'  Y NO (plan_activo Y (plan_hasta es null o > now())).
--      Una clínica que nunca tuvo plan (plan = 'prueba') conserva la prueba de 3 pacientes, sin cambios.
--
-- Objetos nuevos
--   Tablas codigos_promo y codigos_promo_usos (RLS activo, SIN políticas, sin privilegios para anon/authenticated); columnas
--   clinicas.promo_hasta y clinicas.promo_codigo_id; funciones promo_canjear() y promo_crear() (solo service_role);
--   clinica_vencida() y clinica_vencida_de(uuid); políticas RESTRICTIVE <tabla>_no_vencida_ins|upd|del en todas las tablas de datos de la clínica,
--   clinicas_no_vencida_upd, y políticas restrictivas de escritura en storage.objects (buckets expedientes, logos y compartidos).
-- Funciones reemplazadas
--   limite_prueba()  («activo» = plan_activo y plan_hasta null o futuro; el hint se conserva EXACTAMENTE como el vivo).
--   puede_eliminar_citas() y puede_eliminar_inventario()  (ahora también devuelven false si la clínica está vencida: así cita_eliminar() e
--   inventario_eliminar(), que son SECURITY DEFINER y se saltan RLS, también quedan bloqueadas).
--
-- RIESGOS (revisar ANTES de aplicar)
--   * limite_prueba(): comparar con la viva y ajustar nombre de columnas y momento del trigger si difieren:
--       select pg_get_functiondef('public.limite_prueba'::regproc);
--     Lo único que debe cambiar respecto a la viva es la condición de «activo».
--   * Funciones SECURITY DEFINER que escriben datos de la clínica se saltan RLS. Las vivas conocidas son cita_eliminar(uuid,text) e
--     inventario_eliminar(text,uuid,text) (cubiertas por los dos helpers de la sección 7). Confirmar que no hay otras:
--       select p.proname from pg_proc p where p.prosecdef and p.pronamespace = 'public'::regnamespace order by 1;
--     Las de soporte (soporte_generar / soporte_revocar) se dejan permitidas a propósito: soporte puede hacer falta para reactivar.
--   * Hay otras funciones que podrían mirar solo plan_activo sin plan_hasta (p. ej. inventario_habilitado(), políticas RLS de inventario):
--       select proname from pg_proc where prosrc ilike '%plan_activo%' and pronamespace = 'public'::regnamespace;
--     Si alguna no mira plan_hasta, un plan vencido seguiría dando acceso a esa parte. NO se tocan aquí (no están en el repo).
--   * Las políticas restrictivas solo ESTRECHAN: las permisivas que ya existen se quedan igual. Las políticas de storage.objects se crean con el
--     rol que aplica migraciones (si no es dueño de storage.objects, el create policy falla: crearlas desde el panel SQL como postgres).
--   * El perfil se excluye a propósito (la dueña debe poder entrar, cambiar su contraseña y usar el flujo de eliminar cuenta, que usa service role).
--     Tampoco se tocan soporte_accesos, google_* ni las tablas de límites/Recurrente (solo service role).
--   * clinicas: authenticated NO tiene update sobre plan/plan_activo/plan_hasta; tampoco sobre las columnas nuevas (se mantiene así;
--     solo se concede select de las dos columnas nuevas, por si el select de clinicas es por columna).
--   * El código vale una sola vez por clínica (codigos_promo_usos.clinica_id es único), aunque la clínica use otro código distinto.
--   * Un código se reclama con un UPDATE atómico (usos = usos + 1 ... where usos < max_usos): dos canjes simultáneos de un código de 1 uso
--     solo pueden ganar uno.
--   * Orden de despliegue: aplicar este SQL ANTES de desplegar las funciones (invitar-asistente llama a clinica_vencida_de) y antes del front.
--
-- CÓMO CREAR UN CÓDIGO (editor SQL, rol postgres / service role). RECOMENDADO: un código aleatorio de 10 caracteres por cliente, 1 uso, 60 días, plan max:
--     select public.promo_crear(upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 1, 60, 'max', null, 'Cliente: Dra. X');
--   También se puede un código para varias personas (p. ej. 50 usos, vence el 31 de enero), menos seguro porque se puede compartir:
--     select public.promo_crear('LANZAMIENTO', 50, 60, 'max', '2027-01-31 23:59:59-06', 'Campaña de lanzamiento');
--   Ver usos:  select c.codigo, c.usos, c.max_usos, c.activo from public.codigos_promo c order by creado_at desc;
--   Desactivar: update public.codigos_promo set activo = false where codigo = 'XXXX';
--
-- CÓMO APLICAR: como UNA sola migración (la herramienta la envuelve en transacción; por eso no lleva begin/commit).
--
-- CÓMO PROBAR DENTRO DE UNA TRANSACCIÓN (con rollback; nada queda aplicado)
--   begin;
--     -- pegar aquí TODO el contenido de este archivo
--     select public.promo_crear('PRUEBA-0001', 1, 60, 'max', null, 'prueba');
--     select public.promo_canjear('<ID-CLINICA-PRUEBA>', ' prueba-0001 ', '1.2.3.4');   -- {"ok":true,"hasta":"..."}
--     select plan, plan_activo, plan_hasta, promo_hasta from public.clinicas where id = '<ID-CLINICA-PRUEBA>';
--     select public.promo_canjear('<ID-CLINICA-PRUEBA>', 'PRUEBA-0001', '1.2.3.4');     -- {"ok":false,"motivo":"ya_activa"}
--     select public.promo_canjear('<OTRA-CLINICA>', 'PRUEBA-0001', '1.2.3.4');          -- {"ok":false} (agotado)
--     select public.promo_canjear('<OTRA-CLINICA>', 'NO-EXISTE-123', '1.2.3.4');        -- {"ok":false}
--     -- permisos: como authenticated no se puede llamar ni leer nada
--     set local role authenticated;
--     select public.promo_canjear('<ID-CLINICA-PRUEBA>', 'X', null);   -- debe fallar: permission denied for function
--     select * from public.codigos_promo;                              -- debe fallar: permission denied
--     update public.clinicas set plan_hasta = null;                    -- debe fallar: permission denied
--     reset role;
--   rollback;
--
-- PRUEBAS DE LA CUENTA VENCIDA (cada una dentro de begin; … rollback;). Simular al usuario con:
--     select set_config('request.jwt.claims', json_build_object('sub', '<USER-ID-DUEÑO>', 'role', 'authenticated')::text, true);  set local role authenticated;
--   1. Clínica vencida (update public.clinicas set plan = 'basico', plan_activo = false, plan_hasta = now() - interval '1 day' where id = '<CLINICA>'):
--        select public.clinica_vencida();                                  -- true
--        select count(*) from pacientes; select count(*) from citas; select count(*) from cobros; select count(*) from archivos;   -- siguen leyendo
--        insert / update / delete en CADA tabla de la lista de la sección 6 (pacientes, citas, cobros, abonos, servicios, productos, existencias,
--          inventario_movimientos, sedes, proveedores, paquetes, gastos, archivos, invitaciones…)  -- deben fallar: violates row-level security policy
--        update public.clinicas set nombre = nombre where id = '<CLINICA>';                      -- debe fallar (0 filas / RLS)
--        storage: subir un archivo a expedientes, logos o compartidos                            -- denegado; descargar/firmar uno existente -- permitido
--        select public.cita_eliminar('<CITA>', 'prueba');                                        -- debe fallar (sin permiso)
--        select public.inventario_eliminar('producto', '<ID>', 'prueba');                        -- debe fallar (sin permiso)
--        La función eliminar-cuenta sigue funcionando (usa service role, no pasa por estas políticas). canjear-codigo y recurrente-webhook también.
--   2. Clínica activa (plan = 'basico', plan_activo = true, plan_hasta = now() + interval '10 days'): clinica_vencida() = false y todo escribe como siempre.
--   3. Clínica 'prueba' (plan = 'prueba', plan_activo = false): clinica_vencida() = false; escribe como siempre y el 4.º paciente da LIMITE_PRUEBA.
--   4. Usuario sin clínica: clinica_vencida() = false (no null).
--   5. Promo vencida: plan 'max', plan_activo = true, plan_hasta = now() - interval '1 day', promo_hasta igual -> vencida (true).
--
-- CÓMO DESHACER (en este orden)
--   1. Quitar el bloqueo de solo lectura (sección 9 de este archivo, «ROLLBACK»), y volver puede_eliminar_citas() / puede_eliminar_inventario()
--      a su definición anterior (sin la llamada a clinica_vencida()).
--   2. Restaurar limite_prueba() a su definición anterior (la que dio pg_get_functiondef antes de aplicar; solo cambia la condición de «activo»).
--   3. update public.clinicas set plan = 'prueba', plan_activo = false, plan_hasta = null
--        where promo_codigo_id is not null and recurrente_suscripcion_id is null;      -- solo si se quiere retirar el plan promocional ya dado
--   4. drop function if exists public.clinica_vencida_de(uuid);  drop function if exists public.clinica_vencida();
--      drop function if exists public.promo_crear(text, int, int, text, timestamptz, text);
--      drop function if exists public.promo_canjear(uuid, text, text);
--      alter table public.clinicas drop column if exists promo_codigo_id, drop column if exists promo_hasta;
--      drop table if exists public.codigos_promo_usos;  drop table if exists public.codigos_promo;

-- 1. Tables ---------------------------------------------------------------------------------------------------------------------
create table public.codigos_promo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo = upper(codigo) and codigo ~ '^[A-Z0-9-]{6,40}$'),
  dias int not null default 60 check (dias between 1 and 366),
  plan text not null default 'max' check (plan in ('basico', 'max', 'ultra')),
  max_usos int not null default 1 check (max_usos >= 1),
  usos int not null default 0 check (usos >= 0),
  vence_at timestamptz,
  activo boolean not null default true,
  nota text,
  creado_at timestamptz not null default now()
);

create table public.codigos_promo_usos (
  id uuid primary key default gen_random_uuid(),
  codigo_id uuid not null references public.codigos_promo (id),
  clinica_id uuid not null unique references public.clinicas (id) on delete cascade,
  at timestamptz not null default now(),
  ip text
);

alter table public.codigos_promo enable row level security;
alter table public.codigos_promo_usos enable row level security;
-- no policies on purpose: only the service role (which bypasses RLS) and security definer functions touch them
revoke all on public.codigos_promo, public.codigos_promo_usos from public, anon, authenticated;
grant all on public.codigos_promo, public.codigos_promo_usos to service_role;

-- 2. Clinic columns (readable through the existing select policy; no client update privilege) -------------------------------------
alter table public.clinicas add column promo_hasta timestamptz;
alter table public.clinicas add column promo_codigo_id uuid references public.codigos_promo (id);
grant select (promo_hasta, promo_codigo_id) on public.clinicas to authenticated;

-- 3. Redeem ---------------------------------------------------------------------------------------------------------------------
-- Called ONLY by edge functions (service role), which decide which clinic the caller owns. Never callable by authenticated/anon.
create or replace function public.promo_canjear(p_clinica uuid, p_codigo text, p_ip text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_c record;
  v_promo record;
  v_hasta timestamptz;
begin
  -- lock the clinic row first: two redemptions for the same clinic are serialized, and the checks below see the committed state
  select id, plan_activo, plan_hasta, recurrente_suscripcion_id into v_c from public.clinicas where id = p_clinica for update;
  if not found then return json_build_object('ok', false); end if;

  -- the clinic-level checks come BEFORE claiming the code, so a refused clinic never consumes a use
  -- (and the answer does not depend on whether the code exists, so it cannot be used to probe codes)
  if exists (select 1 from public.codigos_promo_usos where clinica_id = p_clinica)
     or v_c.recurrente_suscripcion_id is not null
     or (v_c.plan_activo and (v_c.plan_hasta is null or v_c.plan_hasta > now())) then
    return json_build_object('ok', false, 'motivo', 'ya_activa');
  end if;

  -- atomic claim: the row lock taken by UPDATE makes simultaneous redemptions of a 1-use code serialize; only one passes usos < max_usos
  update public.codigos_promo
     set usos = usos + 1
   where codigo = v_codigo and activo and (vence_at is null or vence_at > now()) and usos < max_usos
  returning id, dias, plan into v_promo;
  if not found then return json_build_object('ok', false); end if; -- unknown, expired, disabled or exhausted: one generic outcome

  v_hasta := now() + make_interval(days => v_promo.dias);
  insert into public.codigos_promo_usos (codigo_id, clinica_id, ip) values (v_promo.id, p_clinica, left(p_ip, 64));
  update public.clinicas
     set plan = v_promo.plan, plan_activo = true, plan_hasta = v_hasta, promo_hasta = v_hasta, promo_codigo_id = v_promo.id, cancelada_at = null
   where id = p_clinica;

  return json_build_object('ok', true, 'hasta', v_hasta);
end;
$$;
revoke all on function public.promo_canjear(uuid, text, text) from public, anon, authenticated;
grant execute on function public.promo_canjear(uuid, text, text) to service_role;

-- Helper to create codes from the SQL editor (service role / postgres only)
create or replace function public.promo_crear(
  p_codigo text, p_usos int default 1, p_dias int default 60, p_plan text default 'max', p_vence timestamptz default null, p_nota text default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_codigo text := upper(btrim(p_codigo));
begin
  insert into public.codigos_promo (codigo, max_usos, dias, plan, vence_at, nota) values (v_codigo, p_usos, p_dias, p_plan, p_vence, p_nota);
  return v_codigo;
end;
$$;
revoke all on function public.promo_crear(text, int, int, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.promo_crear(text, int, int, text, timestamptz, text) to service_role;

-- 4. Trial limit: an expired plan_hasta no longer counts as active --------------------------------------------------------------
-- Compare with the live definition before applying (see RIESGOS). Only the «active» condition changes (the hint text stays exactly as live).
-- A clinic that never had a plan ('prueba') keeps this 3-patient trial. Expired clinics (plan <> 'prueba') are blocked by section 6, not here.
create or replace function public.limite_prueba()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_activo boolean;
begin
  select (plan_activo and (plan_hasta is null or plan_hasta > now())) into v_activo from public.clinicas where id = new.clinica_id;
  if not coalesce(v_activo, false) and (select count(*) from public.pacientes where clinica_id = new.clinica_id) >= 3 then
    raise exception 'LIMITE_PRUEBA' using hint = 'La versión de prueba permite 3 pacientes. Active su suscripción para continuar.';
  end if;
  return new;
end;
$$;


-- 5. «Vencida» helpers -------------------------------------------------------------------------------------------------------------
-- A clinic is expired when it has had a plan (plan <> 'prueba') and that plan is no longer active/paid. Never null: no clinic, no plan row
-- or a null flag all answer false. mi_clinica() is the existing helper that returns the signed-in user's clinic id.
create or replace function public.clinica_vencida()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select coalesce(c.plan, 'prueba') <> 'prueba'
       and not (coalesce(c.plan_activo, false) and (c.plan_hasta is null or c.plan_hasta > now()))
      from public.clinicas c
     where c.id = public.mi_clinica()
  ), false);
$$;
revoke all on function public.clinica_vencida() from public, anon;
grant execute on function public.clinica_vencida() to authenticated, service_role;

-- Same definition for a given clinic, for edge functions running with the service role
create or replace function public.clinica_vencida_de(p_clinica uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select coalesce(c.plan, 'prueba') <> 'prueba'
       and not (coalesce(c.plan_activo, false) and (c.plan_hasta is null or c.plan_hasta > now()))
      from public.clinicas c
     where c.id = p_clinica
  ), false);
$$;
revoke all on function public.clinica_vencida_de(uuid) from public, anon, authenticated;
grant execute on function public.clinica_vencida_de(uuid) to service_role;

-- 6. Read-only policies on every clinic data table ---------------------------------------------------------------------------------
-- RESTRICTIVE policies only narrow what the existing permissive ones allow: select is untouched (the owner can still read and export).
-- Excluded on purpose: perfiles (sign-in / password / account deletion), soporte_accesos, google_* and the limit / Recurrente tables.
-- Idempotent: each policy is dropped first. (select ...) makes the function run once per statement instead of once per row.
do $$
declare
  t text;
  tablas text[] := array[
    'cobros', 'servicios', 'lia_mensajes', 'lia_whatsapp', 'lia_config', 'lia_conversaciones', 'productos', 'sedes', 'existencias', 'abonos',
    'categorias_inventario', 'proveedores', 'ordenes_compra_lineas', 'ordenes_compra', 'inventario_movimientos', 'paquetes', 'paquete_items',
    'archivos', 'pacientes', 'citas', 'invitaciones', 'gastos', 'citas_eliminadas', 'lia_avisos', 'lia_uso', 'documentos_compartidos',
    'inventario_eliminados'
  ];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then
      raise exception 'Tabla % no existe: revisar la lista antes de aplicar', t;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_no_vencida_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_vencida_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_no_vencida_del', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not (select public.clinica_vencida()))', t || '_no_vencida_ins', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (not (select public.clinica_vencida())) with check (not (select public.clinica_vencida()))', t || '_no_vencida_upd', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not (select public.clinica_vencida()))', t || '_no_vencida_del', t);
  end loop;
end
$$;

-- the clinic's own settings (brand, hours, sedes link…) cannot change while expired
drop policy if exists clinicas_no_vencida_upd on public.clinicas;
create policy clinicas_no_vencida_upd on public.clinicas as restrictive for update to authenticated
  using (not (select public.clinica_vencida())) with check (not (select public.clinica_vencida()));

-- Storage: no uploads, replacements or deletes in the clinic buckets while expired. Reading / downloading (export) is untouched.
-- The predicate is true for every other bucket, so those are unaffected.
drop policy if exists objetos_no_vencida_ins on storage.objects;
drop policy if exists objetos_no_vencida_upd on storage.objects;
drop policy if exists objetos_no_vencida_del on storage.objects;
create policy objetos_no_vencida_ins on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('expedientes', 'logos', 'compartidos') or not (select public.clinica_vencida()));
create policy objetos_no_vencida_upd on storage.objects as restrictive for update to authenticated
  using (bucket_id not in ('expedientes', 'logos', 'compartidos') or not (select public.clinica_vencida()))
  with check (bucket_id not in ('expedientes', 'logos', 'compartidos') or not (select public.clinica_vencida()));
create policy objetos_no_vencida_del on storage.objects as restrictive for delete to authenticated
  using (bucket_id not in ('expedientes', 'logos', 'compartidos') or not (select public.clinica_vencida()));

-- 7. SECURITY DEFINER write functions bypass RLS: their permission helpers now also refuse an expired clinic ----------------------------
-- cita_eliminar(uuid, text) and inventario_eliminar(text, uuid, text) call these. Live bodies kept; only the expired check is added.
create or replace function public.puede_eliminar_citas()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not public.clinica_vencida() and coalesce((select case when rol = 'dueno' then true when rol = 'soporte' then false else coalesce((permisos->>'eliminar_citas')::boolean, true) end from public.perfiles where user_id = auth.uid()), false);
$$;
revoke all on function public.puede_eliminar_citas() from public, anon;
grant execute on function public.puede_eliminar_citas() to authenticated, service_role;

create or replace function public.puede_eliminar_inventario()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not public.clinica_vencida() and coalesce((select case when rol = 'dueno' then true when rol = 'soporte' then false else coalesce((permisos->>'eliminar_inventario')::boolean, true) end from public.perfiles where user_id = auth.uid()), false);
$$;
revoke all on function public.puede_eliminar_inventario() from public, anon;
grant execute on function public.puede_eliminar_inventario() to authenticated, service_role;

-- 8. Notes ----------------------------------------------------------------------------------------------------------------------------
-- * Triggers need nothing: they run as the table owner and are fired only by writes that RLS already allowed.
-- * eliminar-cuenta, canjear-codigo, recurrente-webhook and crear-cuenta use the service role: unaffected (an expired clinic can still
--   pay -> the webhook reactivates it, redeem... only if it never used a code, and delete its account).

-- 9. ROLLBACK of the read-only lock (run by hand if it has to be undone; keep commented here) --------------------------------------------
-- do $$
-- declare t text;
--   tablas text[] := array['cobros','servicios','lia_mensajes','lia_whatsapp','lia_config','lia_conversaciones','productos','sedes','existencias','abonos',
--     'categorias_inventario','proveedores','ordenes_compra_lineas','ordenes_compra','inventario_movimientos','paquetes','paquete_items','archivos',
--     'pacientes','citas','invitaciones','gastos','citas_eliminadas','lia_avisos','lia_uso','documentos_compartidos','inventario_eliminados'];
-- begin
--   foreach t in array tablas loop
--     execute format('drop policy if exists %I on public.%I', t || '_no_vencida_ins', t);
--     execute format('drop policy if exists %I on public.%I', t || '_no_vencida_upd', t);
--     execute format('drop policy if exists %I on public.%I', t || '_no_vencida_del', t);
--   end loop;
-- end $$;
-- drop policy if exists clinicas_no_vencida_upd on public.clinicas;
-- drop policy if exists objetos_no_vencida_ins on storage.objects;
-- drop policy if exists objetos_no_vencida_upd on storage.objects;
-- drop policy if exists objetos_no_vencida_del on storage.objects;
-- -- and restore puede_eliminar_citas() / puede_eliminar_inventario() without the «not public.clinica_vencida() and» prefix

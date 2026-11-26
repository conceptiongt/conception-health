-- PROPUESTA (NO APLICADA) · 2026-11-27
-- Qué hace: códigos de invitación de lanzamiento. La dueña da un código a sus clientes actuales; al crear la cuenta (o después, desde
--   Suscripción, si la cuenta sigue en prueba) la clínica queda con el plan completo (por defecto 'ultra') gratis por N días (por defecto 60).
--   Al vencer, la clínica vuelve al comportamiento de prueba: sus datos NO se borran ni se bloquean; solo se bloquea registrar pacientes nuevos
--   pasados los 3 de la prueba, hasta que se suscriba.
-- Objetos nuevos: tablas codigos_promo y codigos_promo_usos (RLS activo, SIN políticas, sin privilegios para anon/authenticated),
--   columnas clinicas.promo_hasta y clinicas.promo_codigo_id, funciones promo_canjear() y promo_crear() (solo service_role).
-- Función reemplazada: limite_prueba() (ahora «activo» = plan_activo y plan_hasta null o futuro; antes solo miraba plan_activo, así que un
--   plan promocional vencido habría quedado activo para siempre en la base de datos).
--
-- RIESGOS
--   * limite_prueba() se reemplaza con la definición descrita en el pedido (plpgsql, security definer, search_path public, mismo error
--     LIMITE_PRUEBA y tope de 3 pacientes). ANTES de aplicar comparar con la viva y ajustar mensaje, hint, nombre de columnas y momento del
--     trigger si difieren:   select pg_get_functiondef('public.limite_prueba'::regproc);
--     Lo único que debe cambiar respecto a la viva es la condición de «activo».
--   * Hay otras funciones que podrían mirar solo plan_activo sin plan_hasta (p. ej. inventario_habilitado(), políticas RLS de inventario):
--     revisar con   select proname from pg_proc where prosrc ilike '%plan_activo%' and pronamespace = 'public'::regnamespace;
--     y, si alguna no mira plan_hasta, un plan promocional vencido seguiría dando acceso a esa parte. NO se tocan aquí (no están en el repo).
--   * clinicas: authenticated NO tiene update sobre plan/plan_activo/plan_hasta; tampoco lo tiene sobre las columnas nuevas (se mantiene así;
--     solo se concede select de las dos columnas nuevas, por si el select de clinicas es por columna).
--   * El código vale una sola vez por clínica (codigos_promo_usos.clinica_id es único), aunque la clínica use otro código distinto.
--   * Un código se reclama con un UPDATE atómico (usos = usos + 1 ... where usos < max_usos): dos canjes simultáneos de un código de 1 uso
--     solo pueden ganar uno.
--
-- CÓMO CREAR UN CÓDIGO (editor SQL, rol postgres / service role). Código aleatorio de 10 caracteres, 1 uso, 60 días, plan ultra:
--     select public.promo_crear(upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 1, 60, 'ultra', null, 'Cliente: Dra. X');
--   Un código para varias personas (p. ej. 50 usos, vence el 31 de enero):
--     select public.promo_crear('LANZAMIENTO', 50, 60, 'ultra', '2027-01-31 23:59:59-06', 'Campaña de lanzamiento');
--   Ver usos:  select c.codigo, c.usos, c.max_usos, c.activo from public.codigos_promo c order by creado_at desc;
--   Desactivar: update public.codigos_promo set activo = false where codigo = 'XXXX';
--
-- CÓMO APLICAR: como UNA sola migración (la herramienta la envuelve en transacción; por eso no lleva begin/commit).
--
-- CÓMO PROBAR DENTRO DE UNA TRANSACCIÓN (con rollback; nada queda aplicado)
--   begin;
--     -- pegar aquí TODO el contenido de este archivo
--     select public.promo_crear('PRUEBA-0001', 1, 60, 'ultra', null, 'prueba');
--     -- clínica de prueba en prueba gratis (sustituir por el id de una clínica de prueba real):
--     select public.promo_canjear('<ID-CLINICA-PRUEBA>', ' prueba-0001 ', '1.2.3.4');   -- {"ok":true,"hasta":"..."}
--     select plan, plan_activo, plan_hasta, promo_hasta from public.clinicas where id = '<ID-CLINICA-PRUEBA>';
--     select public.promo_canjear('<ID-CLINICA-PRUEBA>', 'PRUEBA-0001', '1.2.3.4');     -- {"ok":false,"motivo":"ya_activa"}
--     select public.promo_canjear('<OTRA-CLINICA>', 'PRUEBA-0001', '1.2.3.4');          -- {"ok":false} (agotado)
--     select public.promo_canjear('<OTRA-CLINICA>', 'NO-EXISTE-123', '1.2.3.4');        -- {"ok":false}
--     -- vencimiento: la clínica vuelve a prueba y el límite de 3 pacientes se aplica otra vez
--     update public.clinicas set plan_hasta = now() - interval '1 day' where id = '<ID-CLINICA-PRUEBA>';
--     --   insertar un paciente en una clínica con >= 3 debe fallar con LIMITE_PRUEBA; leer y editar los existentes sigue funcionando.
--     -- permisos: como authenticated no se puede llamar ni leer nada
--     set local role authenticated;
--     select public.promo_canjear('<ID-CLINICA-PRUEBA>', 'X', null);   -- debe fallar: permission denied for function
--     select * from public.codigos_promo;                              -- debe fallar: permission denied
--     update public.clinicas set plan_hasta = null;                    -- debe fallar: permission denied
--     reset role;
--   rollback;
--
-- CÓMO DESHACER (en este orden)
--   1. Restaurar limite_prueba() a su definición anterior (la que dio pg_get_functiondef antes de aplicar; solo cambia la condición de «activo»).
--   2. update public.clinicas set plan = 'prueba', plan_activo = false, plan_hasta = null
--        where promo_codigo_id is not null and recurrente_suscripcion_id is null;      -- solo si se quiere retirar el plan promocional ya dado
--   3. drop function if exists public.promo_crear(text, int, int, text, timestamptz, text);
--      drop function if exists public.promo_canjear(uuid, text, text);
--      alter table public.clinicas drop column if exists promo_codigo_id, drop column if exists promo_hasta;
--      drop table if exists public.codigos_promo_usos;  drop table if exists public.codigos_promo;

-- 1. Tables ---------------------------------------------------------------------------------------------------------------------
create table public.codigos_promo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo = upper(codigo) and codigo ~ '^[A-Z0-9-]{6,40}$'),
  dias int not null default 60 check (dias between 1 and 366),
  plan text not null default 'ultra' check (plan in ('basico', 'max', 'ultra')),
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
  p_codigo text, p_usos int default 1, p_dias int default 60, p_plan text default 'ultra', p_vence timestamptz default null, p_nota text default null
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
-- Compare with the live definition before applying (see RIESGOS). Only the «active» condition changes.
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
    raise exception 'LIMITE_PRUEBA' using hint = 'La versión de prueba permite 3 pacientes. Active su suscripción para registrar más.';
  end if;
  return new;
end;
$$;

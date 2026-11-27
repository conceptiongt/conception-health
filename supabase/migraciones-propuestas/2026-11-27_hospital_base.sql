-- PROPUESTA (NO APLICADA) · 2026-11-27 · Hospital, etapa 1 de 6: la base del hospital
--
-- Qué hace
--   Las cuentas creadas como «Hospital» (clinicas.especialidad = 'hospital') necesitan su propia estructura, que el administrador arma a su manera:
--     * departamentos  = especialidades del hospital (cargadas del catálogo o creadas a mano). `clave` = clave del catálogo (null si es propia);
--                        `base` = clave del catálogo cuya ficha copia una especialidad propia.
--     * profesionales  = médicos y personal (de planta o externo), cada uno con su especialidad.
--     * areas          = quirófanos, encamamiento, emergencia, UCI, consulta…; recursos = cada quirófano, cama, cubículo o consultorio.
--   Y dos columnas para amarrar las citas y las tarifas: citas.profesional_id, citas.departamento_id y servicios.departamento_id
--   (todas NULLABLE: una clínica que no es hospital nunca las llena y no cambia en nada).
--
-- Objetos nuevos
--   Tablas departamentos, profesionales, areas, recursos (RLS activo; ver = cualquier usuario de la clínica; crear/editar/borrar = permiso
--   'configuracion'; más las tres políticas RESTRICTIVE <tabla>_no_vencida_ins|upd|del para que una cuenta vencida sea de solo lectura).
--   Función hospital_misma_clinica() + triggers (una referencia a una fila de OTRA clínica se rechaza con REFERENCIA_AJENA).
--   Columnas citas.profesional_id, citas.departamento_id, servicios.departamento_id (+ índices).
--
-- RIESGOS (revisar ANTES de aplicar)
--   * Solo agrega: ninguna tabla, política ni función existente se modifica. Las columnas nuevas son nullable y sin default, así que el ALTER es
--     de metadatos (no reescribe citas ni servicios).
--   * Privilegios por columna: si `authenticated` solo tiene INSERT/UPDATE por columna en citas o servicios (ya pasó con clinicas), las columnas
--     nuevas NO serían escribibles y el front fallaría al guardar una cita de hospital. Por eso se conceden explícitamente (sección 5); es inofensivo
--     si los privilegios son de tabla completa. Revisar antes con la consulta de la sección «PRE-CHECKS».
--   * El trigger solo se dispara cuando cambia profesional_id / departamento_id (UPDATE OF …), así que no frena ediciones normales de citas.
--     Como es SECURITY DEFINER, ve las filas de otras clínicas; por eso compara contra clinica_id de la fila que se guarda.
--   * ON DELETE SET NULL: borrar un departamento o profesional deja las citas/servicios con la columna en null (no se borran citas). El front
--     bloquea el borrado cuando hay citas o médicos que lo usan y ofrece «Desactivar».
--   * Los índices únicos (clinica_id, lower(btrim(nombre))) rechazan nombres repetidos dentro de una clínica (el front ya filtra el catálogo).
--   * Nada para anon: no se concede ningún privilegio a anon ni a public.
--   * Orden de despliegue: aplicar este SQL ANTES del front. Si el front sale primero, «Mi hospital» muestra «Disponible pronto» y las citas se
--     guardan como hoy (el front detecta que las tablas no existen y no manda las columnas nuevas).
--
-- PRE-CHECKS (correr ANTES, solo lectura; confirmar helpers y privilegios de citas / servicios)
--   select proname, prosecdef from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('mi_clinica', 'es_admin', 'tiene_permiso', 'es_soporte', 'clinica_vencida') order by 1;
--   select grantee, privilege_type, column_name from information_schema.column_privileges
--     where table_schema = 'public' and table_name in ('citas', 'servicios') and grantee = 'authenticated'
--       and privilege_type in ('INSERT', 'UPDATE') order by table_name, privilege_type, column_name;
--   select grantee, privilege_type from information_schema.table_privileges
--     where table_schema = 'public' and table_name in ('citas', 'servicios') and grantee = 'authenticated' order by 1, 2;
--     (si aparece INSERT/UPDATE en table_privileges es de tabla completa; si solo hay filas en column_privileges es por columna)
--   select to_regclass('public.departamentos'), to_regclass('public.profesionales'), to_regclass('public.areas'), to_regclass('public.recursos');  -- todos null
--
-- CÓMO APLICAR: como UNA sola migración (la herramienta la envuelve en transacción; por eso no lleva begin/commit).
--
-- CÓMO PROBAR DENTRO DE UNA TRANSACCIÓN (con rollback; nada queda aplicado)
--   begin;
--     -- pegar aquí TODO el contenido de este archivo (sin las líneas de comentario del ROLLBACK)
--     -- simular al dueño de una clínica de prueba:
--     select set_config('request.jwt.claims', json_build_object('sub', '<USER-ID-DUEÑO>', 'role', 'authenticated')::text, true);
--     set local role authenticated;
--     insert into public.departamentos (clinica_id, clave, nombre, es_emergencia) values ('<ID-CLINICA-PRUEBA>', 'pediatria', 'Pediatría', false);
--     insert into public.profesionales (clinica_id, nombre, departamento_id) select '<ID-CLINICA-PRUEBA>', 'Dra. Prueba', id from public.departamentos limit 1;
--     insert into public.areas (clinica_id, nombre, tipo) values ('<ID-CLINICA-PRUEBA>', 'Quirófanos', 'quirofanos');
--     insert into public.recursos (clinica_id, area_id, tipo, nombre) select '<ID-CLINICA-PRUEBA>', id, 'quirofano', 'Quirófano 1' from public.areas limit 1;
--     update public.departamentos set nombre = 'Pediatría general';  update public.profesionales set telefono = '5555-1234';
--     delete from public.recursos;  delete from public.areas;
--   -- Pruebas (cada una con su set_config / set local role; usar reset role entre una y otra):
--   --  1. Dueño: crea, edita y borra en las 4 tablas (lo de arriba) → todo pasa.
--   --  2. Asistente SIN 'configuracion': select en las 4 tablas devuelve filas; insert/update/delete falla con
--   --     «new row violates row-level security policy» (o 0 filas afectadas en update/delete).
--   --  3. Asistente (aunque sin 'configuracion') SÍ puede:
--   --       update public.citas set profesional_id = '<PROF>', departamento_id = '<DEP>' where id = '<CITA>';   -- política normal de citas
--   --  4. Usuario de OTRA clínica: select en las 4 tablas devuelve 0 filas; y
--   --       update public.citas set profesional_id = '<PROF-DE-OTRA-CLINICA>' where id = '<CITA-PROPIA>';   → ERROR REFERENCIA_AJENA
--   --       insert into public.profesionales (clinica_id, nombre, departamento_id) values ('<CLINICA-PROPIA>', 'X', '<DEP-AJENO>');  → ERROR REFERENCIA_AJENA
--   --       insert into public.recursos (clinica_id, area_id, tipo, nombre) values ('<CLINICA-PROPIA>', '<AREA-AJENA>', 'cama', 'Cama 1');  → ERROR REFERENCIA_AJENA
--   --       update public.servicios set departamento_id = '<DEP-AJENO>' where id = '<SERVICIO-PROPIO>';  → ERROR REFERENCIA_AJENA
--   --  5. Clínica vencida (plan <> 'prueba' y plan_activo false o plan_hasta pasado): insert/update/delete en las 4 tablas falla (políticas _no_vencida_);
--   --     select sigue funcionando.
--   --  6. Clínicas que no son hospital: select count(*) from public.citas where profesional_id is not null or departamento_id is not null;  → 0,
--   --     y registrar/editar una cita sin esas columnas funciona igual que antes.
--   --  7. Anon: set local role anon; select * from public.departamentos;  → permission denied.
--   --  8. Duplicados: insertar dos veces «Pediatría» (o «pediatría ») en la misma clínica → violación de departamentos_nombre_uq.
--   rollback;
--
-- ROLLBACK (deshacer todo; los datos de estas tablas se pierden, las citas conservan todo lo demás)
--   drop trigger if exists citas_hospital_ref on public.citas;
--   drop trigger if exists servicios_hospital_ref on public.servicios;
--   drop trigger if exists profesionales_hospital_ref on public.profesionales;
--   drop trigger if exists areas_hospital_ref on public.areas;
--   drop trigger if exists recursos_hospital_ref on public.recursos;
--   drop function if exists public.hospital_misma_clinica();
--   drop index if exists public.citas_profesional_fecha_idx;
--   drop index if exists public.citas_departamento_fecha_idx;
--   alter table public.citas drop column if exists profesional_id, drop column if exists departamento_id;
--   alter table public.servicios drop column if exists departamento_id;
--   drop table if exists public.recursos;
--   drop table if exists public.areas;
--   drop table if exists public.profesionales;
--   drop table if exists public.departamentos;

-- 1. departamentos (especialidades del hospital) ----------------------------------------------------------------------------------------
create table public.departamentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas on delete cascade,
  clave text check (clave is null or clave ~ '^[a-z_]{2,40}$'),                       -- catalogue key (null = created by hand)
  nombre text not null check (char_length(btrim(nombre)) between 2 and 60),
  base text check (base is null or base ~ '^[a-z_]{2,40}$'),                          -- catalogue key whose ficha a custom specialty copies
  es_emergencia boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz default now()
);
create unique index departamentos_nombre_uq on public.departamentos (clinica_id, lower(btrim(nombre)));
create index departamentos_clinica_idx on public.departamentos (clinica_id);

-- 2. profesionales (médicos y personal) -------------------------------------------------------------------------------------------------
create table public.profesionales (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 80),
  tipo text not null default 'planta' check (tipo in ('planta', 'externo')),
  funcion text not null default 'medico' check (funcion in ('medico', 'anestesiologo', 'enfermeria', 'otro')),
  departamento_id uuid references public.departamentos on delete set null,
  colegiado text check (colegiado is null or char_length(colegiado) <= 30),
  telefono text check (telefono is null or char_length(telefono) <= 30),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  activo boolean not null default true,
  user_id uuid unique references auth.users on delete set null,                        -- optional link to a login (later stages)
  created_at timestamptz default now()
);
create index profesionales_clinica_idx on public.profesionales (clinica_id);
create index profesionales_departamento_idx on public.profesionales (departamento_id);

-- 3. areas y recursos (quirófanos, camas, cubículos, consultorios) ---------------------------------------------------------------------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 60),
  tipo text not null check (tipo in ('quirofanos', 'encamamiento', 'emergencia', 'uci', 'consulta', 'otro')),
  sede_id uuid references public.sedes on delete set null,
  orden int not null default 0,
  created_at timestamptz default now()
);
create index areas_clinica_idx on public.areas (clinica_id);

create table public.recursos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas on delete cascade,
  area_id uuid not null references public.areas on delete cascade,
  tipo text not null check (tipo in ('quirofano', 'cama', 'cubiculo', 'consultorio')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 40),
  activo boolean not null default true,
  fuera_de_servicio boolean not null default false,
  orden int not null default 0,
  created_at timestamptz default now()
);
create unique index recursos_nombre_uq on public.recursos (area_id, lower(btrim(nombre)));
create index recursos_clinica_idx on public.recursos (clinica_id);

-- 4. columnas nuevas (nullable) en citas y servicios -----------------------------------------------------------------------------------
alter table public.citas
  add column profesional_id uuid references public.profesionales on delete set null,
  add column departamento_id uuid references public.departamentos on delete set null;
create index citas_profesional_fecha_idx on public.citas (clinica_id, profesional_id, fecha);
create index citas_departamento_fecha_idx on public.citas (clinica_id, departamento_id, fecha);

alter table public.servicios
  add column departamento_id uuid references public.departamentos on delete set null;   -- null = general (todas las especialidades)

-- 5. privilegios de las columnas nuevas (inofensivo si authenticated ya tiene privilegios de tabla completa) ---------------------------
grant insert (profesional_id, departamento_id), update (profesional_id, departamento_id) on public.citas to authenticated;
grant insert (departamento_id), update (departamento_id) on public.servicios to authenticated;

-- 6. una referencia nunca puede apuntar a una fila de otra clínica ---------------------------------------------------------------------
-- SECURITY DEFINER: ve las filas de todas las clínicas (RLS no aplica), por eso compara con el clinica_id de la fila que se guarda.
-- Solo mira la columna cuando es no nula y cambió (en INSERT, siempre que venga). Una referencia que no existe la rechaza la llave foránea.
create or replace function public.hospital_misma_clinica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ajena boolean := false;
begin
  if tg_table_name = 'citas' then
    if new.profesional_id is not null and (tg_op = 'INSERT' or new.profesional_id is distinct from old.profesional_id) then
      ajena := ajena or not exists (select 1 from public.profesionales x where x.id = new.profesional_id and x.clinica_id = new.clinica_id);
    end if;
    if new.departamento_id is not null and (tg_op = 'INSERT' or new.departamento_id is distinct from old.departamento_id) then
      ajena := ajena or not exists (select 1 from public.departamentos x where x.id = new.departamento_id and x.clinica_id = new.clinica_id);
    end if;
  elsif tg_table_name = 'servicios' then
    if new.departamento_id is not null and (tg_op = 'INSERT' or new.departamento_id is distinct from old.departamento_id) then
      ajena := not exists (select 1 from public.departamentos x where x.id = new.departamento_id and x.clinica_id = new.clinica_id);
    end if;
  elsif tg_table_name = 'profesionales' then
    if new.departamento_id is not null and (tg_op = 'INSERT' or new.departamento_id is distinct from old.departamento_id) then
      ajena := not exists (select 1 from public.departamentos x where x.id = new.departamento_id and x.clinica_id = new.clinica_id);
    end if;
  elsif tg_table_name = 'areas' then
    if new.sede_id is not null and (tg_op = 'INSERT' or new.sede_id is distinct from old.sede_id) then
      ajena := not exists (select 1 from public.sedes x where x.id = new.sede_id and x.clinica_id = new.clinica_id);
    end if;
  elsif tg_table_name = 'recursos' then
    if tg_op = 'INSERT' or new.area_id is distinct from old.area_id then
      ajena := not exists (select 1 from public.areas x where x.id = new.area_id and x.clinica_id = new.clinica_id);
    end if;
  end if;
  if ajena then
    raise exception 'REFERENCIA_AJENA' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.hospital_misma_clinica() from public;

create trigger citas_hospital_ref before insert or update of profesional_id, departamento_id, clinica_id on public.citas
  for each row execute function public.hospital_misma_clinica();
create trigger servicios_hospital_ref before insert or update of departamento_id, clinica_id on public.servicios
  for each row execute function public.hospital_misma_clinica();
create trigger profesionales_hospital_ref before insert or update of departamento_id, clinica_id on public.profesionales
  for each row execute function public.hospital_misma_clinica();
create trigger areas_hospital_ref before insert or update of sede_id, clinica_id on public.areas
  for each row execute function public.hospital_misma_clinica();
create trigger recursos_hospital_ref before insert or update of area_id, clinica_id on public.recursos
  for each row execute function public.hospital_misma_clinica();

-- 7. RLS: leer = cualquier usuario de la clínica; escribir = permiso 'configuracion'; cuenta vencida = solo lectura -------------------
do $$
declare
  t text;
begin
  foreach t in array array['departamentos', 'profesionales', 'areas', 'recursos'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('create policy %I on public.%I for select to authenticated using (clinica_id = (select public.mi_clinica()))', t || '_ver', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (clinica_id = (select public.mi_clinica()) and (select public.tiene_permiso(''configuracion'')))', t || '_crear', t);
    execute format('create policy %I on public.%I for update to authenticated using (clinica_id = (select public.mi_clinica()) and (select public.tiene_permiso(''configuracion''))) with check (clinica_id = (select public.mi_clinica()) and (select public.tiene_permiso(''configuracion'')))', t || '_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (clinica_id = (select public.mi_clinica()) and (select public.tiene_permiso(''configuracion'')))', t || '_borrar', t);

    -- an expired account is read-only (same form as the other clinic data tables, see 2026-11-27_codigo_promo.sql)
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not (select public.clinica_vencida()))', t || '_no_vencida_ins', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (not (select public.clinica_vencida())) with check (not (select public.clinica_vencida()))', t || '_no_vencida_upd', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (not (select public.clinica_vencida()))', t || '_no_vencida_del', t);

    -- table privileges: nothing for anon / public
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end
$$;

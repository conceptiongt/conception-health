-- PROPUESTA (NO APLICADA) · 2026-11-27 · Hospital, etapa 2: Emergencias 24/7
--
-- Qué hace
--   Una emergencia es una fila de `citas` (tipo = 'Emergencia', fecha/hora de llegada en America/Guatemala, departamento = la especialidad
--   marcada es_emergencia si existe) MÁS una fila 1:1 en `emergencias` con lo propio de urgencias: triaje 1-5, motivo, acompañante,
--   estado del proceso (espera → atención → observación → alta / hospitalizado / trasladado / falleció / se retiró), horas de llegada,
--   atención y cierre. Así fotos, cobros, expediente y exportaciones siguen funcionando sin tocar nada.
--   Un paciente que llega sin poder identificarse se crea como paciente provisional (`pacientes.sin_identificar = true`, nombre
--   «Sin identificar — DD/MM HH:MM»); la app muestra el aviso «Faltan datos» hasta que se completan.
--
-- Objetos nuevos
--   * Columna pacientes.sin_identificar boolean not null default false (las clínicas la dejan en false para siempre).
--   * Tabla emergencias (RLS activo; ver = cualquier usuario de la clínica; crear/editar = usuario de la clínica que NO sea soporte; sin delete
--     para clientes: borrar la cita con cita_eliminar arrastra la fila por la llave foránea; más las tres políticas RESTRICTIVE
--     emergencias_no_vencida_ins|upd|del para que una cuenta vencida sea de solo lectura).
--   * Trigger emergencias_integridad() (security definer): cita y paciente son de la clínica de la fila, la cita es de ese paciente, y
--     clinica_id / cita_id / paciente_id no cambian (paciente_id solo lo mueve emergencia_identificar, ver abajo).
--   * RPC emergencia_registrar(...)   registra la llegada: paciente (existente / nuevo / provisional) + cita + emergencia en UNA transacción.
--   * RPC emergencia_estado(...)      cambia el estado; al cerrar pone cerrado_at y el estado de la cita ('Asistió' / 'No asistió').
--   * RPC emergencia_identificar(...) completa los datos de un paciente provisional (renombrar) o lo UNE con un paciente existente.
--
-- QUIÉN PUEDE QUÉ (decisión de diseño; confirmar)
--   Las tres RPC y las políticas solo exigen ser miembro de una clínica HOSPITAL (clinicas.especialidad = 'hospital'), que no esté vencida y que
--   la sesión no sea de soporte. El permiso «Emergencias» de Configuración → Usuarios y permisos (por defecto activo para todos) oculta la
--   pantalla en la app, pero NO se verifica en el servidor (igual que otros permisos «de pantalla»). Si se quisiera forzarlo en la base,
--   habría que llamar a tiene_permiso('emergencias') en las RPC y revisar cómo trata esa función una llave nueva.
--
-- RIESGOS (revisar ANTES de aplicar)
--   * Solo agrega: no se modifica ninguna política, función ni trigger existente. pacientes.sin_identificar es NOT NULL DEFAULT false: en
--     PostgreSQL 11+ es un cambio de metadatos (no reescribe pacientes).
--   * Privilegios por columna: si `authenticated` tuviera select/update POR COLUMNA en pacientes, `select *` no traería la columna nueva (y la
--     app no podría limpiarla desde la ficha). La sección 2 concede select y update de esa sola columna; es inofensivo si ya son de tabla
--     completa. Confirmar con el PRE-CHECK de privilegios.
--   * Valores permitidos que este SQL ASUME (confirmar con los PRE-CHECKS; las RPC usan solo valores que la app ya escribe hoy):
--       citas.tipo = 'Emergencia'      → si citas.tipo tiene un CHECK con lista cerrada, hay que agregar 'Emergencia' ANTES.
--       citas.estado = 'Pendiente' / 'Asistió' / 'No asistió'  (los de ESTADOS_CITA en src/lib/constantes.js).
--       pacientes.origen = 'otro'      (uno de ORIGENES en la app; Registrar lo exige y la ficha lo deja editar a null).
--       pacientes.sexo ∈ 'Masculino' | 'Femenino' | 'Otro' (los de la ficha); «No determinado» de la pantalla se guarda como 'Otro'.
--       citas.fecha / citas.hora aceptan un date / time (o texto ISO); la función usa v_local::date y date_trunc('minute', v_local)::time,
--       que sirven tanto si la columna es date/time como si es text.
--   * Triggers vivos sobre citas y pacientes que la RPC dispara (security definer los ejecuta igual): limite_prueba (pacientes; puede
--     lanzar 'LIMITE_PRUEBA' y se deja pasar: la app ya lo traduce), el que llena agendo_nombre / creado_por en citas, y
--     citas_hospital_ref (valida departamento / profesional de la clínica). Ver el PRE-CHECK de triggers.
--   * emergencia_identificar (unir) BORRA el paciente provisional solo si ya no tiene otras citas. Antes mueve a la cita las filas de
--     archivos y cobros de esa cita. Si OTRA tabla apunta al paciente provisional con llave foránea sin cascada, el borrado falla con
--     foreign_key_violation: la función lo captura y deja el paciente provisional vacío en su lugar (no se pierde nada, solo queda un
--     paciente «Sin identificar» sin citas). Ver el PRE-CHECK de llaves foráneas hacia pacientes.
--     Las rutas de storage de las fotos movidas siguen llevando el id viejo del paciente en la carpeta (la ruta es solo una llave); si la
--     política de storage dependiera del segundo segmento de la ruta, revisarla (la guía de este repo solo usa la clínica como primer segmento).
--   * La excepción de inmutabilidad usa una variable de configuración local a la transacción (conception.emergencia_mover). Los clientes de
--     PostgREST no pueden ejecutar SET ni set_config (pg_catalog no se expone) y ninguna función expuesta la fija salvo
--     emergencia_identificar, que la pone al id de la cita y la limpia en cuanto mueve la fila. Aun si alguien lograra fijarla, el trigger
--     sigue comprobando que la cita sea de ese paciente y de esa clínica.
--   * Sesiones de soporte: SOLO LECTURA (las políticas de escritura exigen not es_soporte() y las RPC lanzan SIN_PERMISO).
--   * Nada para anon: ningún privilegio a anon ni a public.
--   * Orden de despliegue: aplicar este SQL ANTES del front. Si el front sale primero, «Emergencias» muestra «Disponible pronto» y nada más
--     cambia (el front detecta que la tabla no existe).
--
-- PRE-CHECKS (correr ANTES, solo lectura; la planificadora confirma cada uno)
--   -- 1. restricciones vivas de citas y pacientes (busque CHECK sobre tipo, estado, origen, sexo, hora)
--   select conrelid::regclass as tabla, conname, contype, pg_get_constraintdef(oid) as definicion
--     from pg_constraint where conrelid in ('public.citas'::regclass, 'public.pacientes'::regclass) and contype in ('c', 'u', 'f') order by 1, 2;
--   -- 2. tipos, nulabilidad y defaults de las columnas que escribe la RPC
--   select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and (
--       (table_name = 'citas' and column_name in ('clinica_id','paciente_id','fecha','hora','tipo','estado','notas','departamento_id','profesional_id','sede_id','agendo_nombre','creado_por','duracion'))
--       or (table_name = 'pacientes' and column_name in ('clinica_id','nombre','telefono','origen','sede_id','created_by','sexo','sin_identificar'))
--       or (table_name in ('archivos','cobros') and column_name in ('clinica_id','paciente_id','cita_id'))
--       or (table_name = 'perfiles' and column_name in ('user_id','nombre'))) order by table_name, column_name;
--   -- 3. triggers vivos (limite_prueba, quién agendó, referencias del hospital…)
--   select tgrelid::regclass as tabla, tgname, pg_get_triggerdef(oid) from pg_trigger
--     where not tgisinternal and tgrelid in ('public.citas'::regclass, 'public.pacientes'::regclass, 'public.archivos'::regclass, 'public.cobros'::regclass) order by 1, 2;
--   -- 4. llaves foráneas que apuntan a pacientes (¿alguna sin ON DELETE CASCADE además de citas/cobros/archivos?)
--   select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid) from pg_constraint where confrelid = 'public.pacientes'::regclass and contype = 'f' order by 1;
--   -- 5. ayudantes existentes
--   select proname, prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname in ('mi_clinica', 'es_soporte', 'clinica_vencida') order by 1;
--   -- 6. privilegios de pacientes para authenticated (tabla completa o por columna)
--   select privilege_type from information_schema.table_privileges where table_schema = 'public' and table_name = 'pacientes' and grantee = 'authenticated' order by 1;
--   select privilege_type, column_name from information_schema.column_privileges where table_schema = 'public' and table_name = 'pacientes' and grantee = 'authenticated'
--     and privilege_type in ('SELECT', 'UPDATE') order by 1, 2;
--   -- 7. nada de esto existe todavía (ambas deben ser null / 0 filas)
--   select to_regclass('public.emergencias');
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'pacientes' and column_name = 'sin_identificar';
--   -- 8. la clínica hospital tiene (o no) su especialidad de emergencias
--   select id, clinica_id, clave, nombre, activo, es_emergencia from public.departamentos where es_emergencia;
--
-- CÓMO APLICAR: como UNA sola migración (la herramienta la envuelve en transacción; por eso no lleva begin/commit).
--
-- CÓMO PROBAR DENTRO DE UNA TRANSACCIÓN (con rollback; nada queda aplicado)
--   begin;
--     -- pegar aquí TODO el contenido de este archivo (sin las líneas de comentario del ROLLBACK)
--     -- simular a un usuario de una clínica HOSPITAL de prueba (<USER-HOSP>) y a uno de otra clínica (<USER-OTRA>):
--     select set_config('request.jwt.claims', json_build_object('sub', '<USER-HOSP>', 'role', 'authenticated')::text, true);
--     set local role authenticated;
--     -- 1. llegada con paciente nuevo, sin identificar y existente
--     select public.emergencia_registrar(null, 'Prueba Nueva', '5555-0000', null, null, 2::smallint, 'Dolor en el pecho', 'Esposo', null, null);
--     select public.emergencia_registrar(null, null, null, 'Masculino', '35', 1::smallint, 'Trauma por accidente', null, null, null);
--     select public.emergencia_registrar('<PACIENTE-DE-LA-CLINICA>', null, null, null, null, 4::smallint, 'Fiebre', null, '<PROFESIONAL-DE-LA-CLINICA>', null);
--     select e.estado, e.triage, c.tipo, c.estado, c.fecha, c.hora, c.departamento_id, p.nombre, p.sin_identificar
--       from public.emergencias e join public.citas c on c.id = e.cita_id join public.pacientes p on p.id = e.paciente_id order by e.llegada_at;
--     -- 2. estados: atencion pone atendido_at; alta cierra (cita 'Asistió'); reabrir limpia cerrado_at (cita 'Pendiente'); retirado → 'No asistió'
--     select public.emergencia_estado('<CITA>', 'atencion');  select public.emergencia_estado('<CITA>', 'alta', 'Se va a casa');
--     select estado, atendido_at, cerrado_at, destino_nota from public.emergencias where cita_id = '<CITA>';
--     select public.emergencia_estado('<CITA>', 'observacion');  select public.emergencia_estado('<CITA2>', 'retirado');
--     -- 3. identificar: renombrar y unir (la cita, archivos y cobros pasan al paciente existente; el provisional se borra si queda sin citas)
--     select public.emergencia_identificar('<CITA-SIN-IDENTIFICAR>', null, 'Nombre Real', '5555-1111');
--     select public.emergencia_identificar('<CITA-SIN-IDENTIFICAR-2>', '<PACIENTE-EXISTENTE>', null, null);
--   -- Pruebas negativas (cada una con su set_config / set local role; usar reset role entre una y otra):
--   --  4. Usuario de OTRA clínica llama emergencia_estado / emergencia_identificar con una cita ajena → NO_ENCONTRADO; con p_paciente /
--   --     p_profesional / p_sede ajenos en emergencia_registrar → REFERENCIA_AJENA; select * from emergencias solo trae las suyas.
--   --  5. Clínica que NO es hospital llama emergencia_registrar → SIN_PERMISO. Clínica vencida → SIN_PERMISO. Sesión de soporte → SIN_PERMISO.
--   --  6. Clínica en prueba con 3 pacientes: registrar un paciente nuevo → LIMITE_PRUEBA (con uno existente pasa).
--   --  7. update public.emergencias set paciente_id = '<OTRO-PACIENTE-DE-LA-CLINICA>' where cita_id = '<CITA>';  → CAMPO_INMUTABLE
--   --     update public.emergencias set cita_id = '<OTRA-CITA>' ...;  update ... set clinica_id = '<OTRA-CLINICA>' ...;  → CAMPO_INMUTABLE
--   --     insert into public.emergencias (cita_id, clinica_id, paciente_id, triage, motivo) con una cita de otra clínica → REFERENCIA_AJENA.
--   --  8. update public.emergencias set estado = 'alta' where cita_id = '<CITA>';  (sin cerrado_at) → viola emergencias_cierre_coherente.
--   --  9. delete from public.emergencias → permission denied; cita_eliminar de la cita borra también su fila (cascada).
--   -- 10. Soporte: select funciona; insert/update directos fallan (RLS) y las RPC lanzan SIN_PERMISO.
--   -- 11. Anon: set local role anon; select * from public.emergencias; select public.emergencia_registrar(...) → permission denied.
--   -- 12. Clínicas que no son hospital: select count(*) from public.pacientes where sin_identificar;  → 0.
--   -- 13. Ejercitar CADA rama de las tres funciones y del trigger (plpgsql no se valida al crear la función).
--   rollback;
--
-- ROLLBACK (deshacer todo; las citas ya creadas con tipo 'Emergencia' y los pacientes provisionales QUEDAN como datos normales)
--   drop function if exists public.emergencia_identificar(uuid, uuid, text, text);
--   drop function if exists public.emergencia_estado(uuid, text, text);
--   drop function if exists public.emergencia_registrar(uuid, text, text, text, text, smallint, text, text, uuid, uuid);
--   drop table if exists public.emergencias;
--   drop function if exists public.emergencias_integridad();
--   alter table public.pacientes drop column if exists sin_identificar;

-- 1. pacientes.sin_identificar ---------------------------------------------------------------------------------------------------------
alter table public.pacientes add column sin_identificar boolean not null default false;

-- Harmless when authenticated already has table-wide privileges (see RIESGOS)
grant select (sin_identificar), update (sin_identificar) on public.pacientes to authenticated;

-- 2. emergencias (1:1 with the cita) ---------------------------------------------------------------------------------------------------
create table public.emergencias (
  cita_id uuid primary key references public.citas on delete cascade,
  clinica_id uuid not null references public.clinicas on delete cascade,
  paciente_id uuid not null references public.pacientes on delete cascade,
  llegada_at timestamptz not null default now(),
  triage smallint not null check (triage between 1 and 5),
  motivo text not null check (char_length(btrim(motivo)) between 2 and 500),
  acompanante text check (acompanante is null or char_length(acompanante) <= 120),
  estado text not null default 'espera' check (estado in ('espera', 'atencion', 'observacion', 'alta', 'hospitalizado', 'trasladado', 'fallecido', 'retirado')),
  atendido_at timestamptz,
  cerrado_at timestamptz,
  destino_nota text check (destino_nota is null or char_length(destino_nota) <= 300),
  registrado_por uuid,
  registrado_nombre text,
  created_at timestamptz default now(),
  -- a closing state always carries its closing time and an open one never does (also holds for direct API writes)
  constraint emergencias_cierre_coherente check ((cerrado_at is not null) = (estado in ('alta', 'hospitalizado', 'trasladado', 'fallecido', 'retirado')))
);
create index emergencias_clinica_llegada_idx on public.emergencias (clinica_id, llegada_at desc);
create index emergencias_abiertas_idx on public.emergencias (clinica_id, estado) where cerrado_at is null;
create index emergencias_paciente_idx on public.emergencias (paciente_id);

-- 3. integrity: same clinic, same patient, immutable keys ------------------------------------------------------------------------------
-- SECURITY DEFINER: it reads citas / pacientes of every clinic (RLS does not apply), so it compares with the clinica_id of the row being saved.
-- emergencia_identificar() is the ONLY code that may change paciente_id: it sets the transaction-local setting conception.emergencia_mover to the
-- id of the cita being moved (is_local = true: it disappears at the end of the transaction and is cleared right after the move). A client cannot
-- set it: PostgREST cannot issue SET / set_config (pg_catalog is not exposed) and no other exposed function sets it. Even then the checks below
-- (cita belongs to this clinic and to this patient, patient belongs to this clinic) still run on every move.
create or replace function public.emergencias_integridad()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cita record;
  v_mover boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.clinica_id is distinct from old.clinica_id or new.cita_id is distinct from old.cita_id then
      raise exception 'CAMPO_INMUTABLE' using errcode = '23514';
    end if;
    if new.paciente_id is distinct from old.paciente_id then
      if coalesce(current_setting('conception.emergencia_mover', true), '') <> new.cita_id::text then
        raise exception 'CAMPO_INMUTABLE' using errcode = '23514';
      end if;
      v_mover := true;
    end if;
  end if;

  if tg_op = 'INSERT' or v_mover then
    select c.clinica_id, c.paciente_id into v_cita from public.citas c where c.id = new.cita_id;
    if not found
       or v_cita.clinica_id is distinct from new.clinica_id
       or v_cita.paciente_id is distinct from new.paciente_id
       or not exists (select 1 from public.pacientes p where p.id = new.paciente_id and p.clinica_id = new.clinica_id) then
      raise exception 'REFERENCIA_AJENA' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.emergencias_integridad() from public, anon, authenticated;

create trigger emergencias_integridad before insert or update of clinica_id, cita_id, paciente_id on public.emergencias
  for each row execute function public.emergencias_integridad();

-- 4. RLS -------------------------------------------------------------------------------------------------------------------------------
alter table public.emergencias enable row level security;

create policy emergencias_ver on public.emergencias for select to authenticated
  using (clinica_id = (select public.mi_clinica()));
-- support sessions are READ-ONLY (and not (select public.es_soporte()))
create policy emergencias_crear on public.emergencias for insert to authenticated
  with check (clinica_id = (select public.mi_clinica()) and not (select public.es_soporte()));
create policy emergencias_editar on public.emergencias for update to authenticated
  using (clinica_id = (select public.mi_clinica()) and not (select public.es_soporte()))
  with check (clinica_id = (select public.mi_clinica()) and not (select public.es_soporte()));
-- no delete policy on purpose: only the foreign key cascade (cita_eliminar / deleting the patient) removes a row

-- an expired account is read-only (same form as the other clinic data tables, see 2026-11-27_codigo_promo.sql)
create policy emergencias_no_vencida_ins on public.emergencias as restrictive for insert to authenticated
  with check (not (select public.clinica_vencida()));
create policy emergencias_no_vencida_upd on public.emergencias as restrictive for update to authenticated
  using (not (select public.clinica_vencida())) with check (not (select public.clinica_vencida()));
create policy emergencias_no_vencida_del on public.emergencias as restrictive for delete to authenticated
  using (not (select public.clinica_vencida()));

-- table privileges: nothing for anon / public, no delete for clients
revoke all on public.emergencias from public, anon, authenticated;
grant select, insert, update on public.emergencias to authenticated;
grant all on public.emergencias to service_role;

-- 5. emergencia_registrar: arrival of a patient (patient + cita + emergency in ONE transaction) ---------------------------------------
create or replace function public.emergencia_registrar(
  p_paciente uuid, p_nombre text, p_telefono text, p_sexo text, p_edad text,
  p_triage smallint, p_motivo text, p_acompanante text, p_profesional uuid, p_sede uuid
) returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_local timestamp := (now() at time zone 'America/Guatemala');
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_nombre text;
  v_sexo text := case when p_sexo in ('Masculino', 'Femenino', 'Otro') then p_sexo end;
  v_edad text := nullif(left(btrim(coalesce(p_edad, '')), 20), '');
  v_tel text := nullif(left(btrim(coalesce(p_telefono, '')), 30), '');
  v_pac uuid;
  v_sin boolean := false;
  v_dep uuid;
  v_prof uuid;
  v_sede uuid;
  v_cita uuid;
  v_quien text;
begin
  -- who may call: a member of a HOSPITAL clinic that is not expired, never a support session
  v_clinica := public.mi_clinica();
  if auth.uid() is null or v_clinica is null or public.es_soporte() or public.clinica_vencida()
     or not exists (select 1 from public.clinicas c where c.id = v_clinica and c.especialidad = 'hospital') then
    raise exception 'SIN_PERMISO';
  end if;

  if p_triage is null or p_triage not between 1 and 5 then raise exception 'DATOS_INVALIDOS'; end if;
  if char_length(v_motivo) < 2 or char_length(v_motivo) > 500 then raise exception 'DATOS_INVALIDOS'; end if;

  -- every id the caller sends must belong to the caller's clinic
  if p_profesional is not null then
    select x.id into v_prof from public.profesionales x where x.id = p_profesional and x.clinica_id = v_clinica and x.activo;
    if v_prof is null then raise exception 'REFERENCIA_AJENA' using errcode = '23514'; end if;
  end if;
  if p_sede is not null then
    select x.id into v_sede from public.sedes x where x.id = p_sede and x.clinica_id = v_clinica;
    if v_sede is null then raise exception 'REFERENCIA_AJENA' using errcode = '23514'; end if;
  end if;

  -- the patient: an existing one, a new one with a name, or a provisional one
  if p_paciente is not null then
    select x.id into v_pac from public.pacientes x where x.id = p_paciente and x.clinica_id = v_clinica;
    if v_pac is null then raise exception 'REFERENCIA_AJENA' using errcode = '23514'; end if;
  else
    v_nombre := left(btrim(coalesce(p_nombre, '')), 120);
    if char_length(v_nombre) = 0 then
      v_sin := true;
      v_nombre := 'Sin identificar — ' || to_char(v_local, 'DD/MM HH24:MI')
        || coalesce(' · ' || v_sexo, '') || coalesce(' · ' || v_edad, '');
    end if;
    -- the trial-limit trigger on pacientes may raise LIMITE_PRUEBA: it propagates (the app already translates it)
    insert into public.pacientes (clinica_id, nombre, telefono, origen, sede_id, created_by, sexo, sin_identificar)
    values (v_clinica, v_nombre, v_tel, 'otro', v_sede, auth.uid(), v_sexo, v_sin)
    returning id into v_pac;
  end if;

  -- the clinic's emergency specialty, if it has one
  select d.id into v_dep from public.departamentos d
   where d.clinica_id = v_clinica and d.es_emergencia and d.activo order by d.orden, d.created_at limit 1;

  select pf.nombre into v_quien from public.perfiles pf where pf.user_id = auth.uid();

  insert into public.citas (clinica_id, paciente_id, fecha, hora, tipo, estado, notas, departamento_id, profesional_id, sede_id, agendo_nombre)
  values (v_clinica, v_pac, v_local::date, date_trunc('minute', v_local)::time, 'Emergencia', 'Pendiente', null, v_dep, v_prof, v_sede, v_quien)
  returning id into v_cita;

  insert into public.emergencias (cita_id, clinica_id, paciente_id, triage, motivo, acompanante, registrado_por, registrado_nombre)
  values (v_cita, v_clinica, v_pac, p_triage, v_motivo, nullif(left(btrim(coalesce(p_acompanante, '')), 120), ''), auth.uid(), v_quien);

  return json_build_object('cita_id', v_cita, 'paciente_id', v_pac, 'sin_identificar', v_sin);
end;
$$;
revoke all on function public.emergencia_registrar(uuid, text, text, text, text, smallint, text, text, uuid, uuid) from public, anon;
grant execute on function public.emergencia_registrar(uuid, text, text, text, text, smallint, text, text, uuid, uuid) to authenticated;

-- 6. emergencia_estado: move the emergency through its process -------------------------------------------------------------------------
-- Any state → any state. Closing states set cerrado_at (kept if already closed) and the cita's estado ('Asistió', or 'No asistió' for
-- 'retirado'); leaving a closing state (reopening) clears cerrado_at and puts the cita back to 'Pendiente'.
-- atendido_at is set the first time the patient is seen (atencion, observacion or an attended outcome); 'retirado' never sets it.
create or replace function public.emergencia_estado(p_cita uuid, p_estado text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_cierra boolean;
  v_antes timestamptz;
begin
  v_clinica := public.mi_clinica();
  if auth.uid() is null or v_clinica is null or public.es_soporte() or public.clinica_vencida()
     or not exists (select 1 from public.clinicas c where c.id = v_clinica and c.especialidad = 'hospital') then
    raise exception 'SIN_PERMISO';
  end if;
  if p_estado is null or p_estado not in ('espera', 'atencion', 'observacion', 'alta', 'hospitalizado', 'trasladado', 'fallecido', 'retirado') then
    raise exception 'DATOS_INVALIDOS';
  end if;

  select e.cerrado_at into v_antes from public.emergencias e where e.cita_id = p_cita and e.clinica_id = v_clinica for update;
  if not found then raise exception 'NO_ENCONTRADO'; end if;

  v_cierra := p_estado in ('alta', 'hospitalizado', 'trasladado', 'fallecido', 'retirado');

  update public.emergencias e set
    estado = p_estado,
    atendido_at = case when p_estado in ('espera', 'retirado') then e.atendido_at else coalesce(e.atendido_at, now()) end,
    cerrado_at = case when v_cierra then coalesce(e.cerrado_at, now()) else null end,
    destino_nota = case when v_cierra then nullif(left(btrim(coalesce(p_nota, '')), 300), '') else null end
  where e.cita_id = p_cita and e.clinica_id = v_clinica;

  if v_cierra then
    update public.citas c set estado = case when p_estado = 'retirado' then 'No asistió' else 'Asistió' end
     where c.id = p_cita and c.clinica_id = v_clinica;
  elsif v_antes is not null then
    update public.citas c set estado = 'Pendiente' where c.id = p_cita and c.clinica_id = v_clinica;
  end if;
end;
$$;
revoke all on function public.emergencia_estado(uuid, text, text) from public, anon;
grant execute on function public.emergencia_estado(uuid, text, text) to authenticated;

-- 7. emergencia_identificar: complete the data of a provisional patient (rename) or merge it into an existing patient ---------------------
create or replace function public.emergencia_identificar(p_cita uuid, p_paciente uuid, p_nombre text, p_telefono text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_actual uuid;
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 120);
  v_tel text := nullif(left(btrim(coalesce(p_telefono, '')), 30), '');
begin
  v_clinica := public.mi_clinica();
  if auth.uid() is null or v_clinica is null or public.es_soporte() or public.clinica_vencida()
     or not exists (select 1 from public.clinicas c where c.id = v_clinica and c.especialidad = 'hospital') then
    raise exception 'SIN_PERMISO';
  end if;

  select e.paciente_id into v_actual from public.emergencias e where e.cita_id = p_cita and e.clinica_id = v_clinica for update;
  if not found then raise exception 'NO_ENCONTRADO'; end if;

  -- only a provisional patient is completed or merged away
  perform 1 from public.pacientes x where x.id = v_actual and x.clinica_id = v_clinica and x.sin_identificar for update;
  if not found then raise exception 'NO_APLICA'; end if;

  if p_paciente is null then
    -- rename: it is now an identified patient
    if char_length(v_nombre) < 2 then raise exception 'DATOS_INVALIDOS'; end if;
    update public.pacientes x set nombre = v_nombre, telefono = coalesce(v_tel, x.telefono), sin_identificar = false
     where x.id = v_actual and x.clinica_id = v_clinica;
  else
    -- merge into an existing, identified patient of the same clinic
    if p_paciente = v_actual then raise exception 'DATOS_INVALIDOS'; end if;
    perform 1 from public.pacientes x where x.id = p_paciente and x.clinica_id = v_clinica;
    if not found then raise exception 'REFERENCIA_AJENA' using errcode = '23514'; end if;
    perform 1 from public.pacientes x where x.id = p_paciente and not x.sin_identificar;
    if not found then raise exception 'DATOS_INVALIDOS'; end if;

    -- see emergencias_integridad(): only this function may move paciente_id; the setting is local to this transaction
    perform set_config('conception.emergencia_mover', p_cita::text, true);
    update public.citas c set paciente_id = p_paciente where c.id = p_cita and c.clinica_id = v_clinica;
    update public.emergencias e set paciente_id = p_paciente where e.cita_id = p_cita and e.clinica_id = v_clinica;
    perform set_config('conception.emergencia_mover', '', true);

    update public.archivos a set paciente_id = p_paciente where a.cita_id = p_cita and a.clinica_id = v_clinica;
    update public.cobros b set paciente_id = p_paciente where b.cita_id = p_cita and b.clinica_id = v_clinica;

    -- the provisional patient goes away only when nothing else hangs from it
    if not exists (select 1 from public.citas c where c.paciente_id = v_actual) then
      update public.archivos a set paciente_id = p_paciente where a.paciente_id = v_actual and a.clinica_id = v_clinica;
      update public.cobros b set paciente_id = p_paciente where b.paciente_id = v_actual and b.clinica_id = v_clinica;
      begin
        delete from public.pacientes x where x.id = v_actual and x.clinica_id = v_clinica and x.sin_identificar;
      exception when foreign_key_violation then
        null; -- something else still references it: it stays as an empty provisional patient (see RIESGOS)
      end;
    end if;
  end if;
end;
$$;
revoke all on function public.emergencia_identificar(uuid, uuid, text, text) from public, anon;
grant execute on function public.emergencia_identificar(uuid, uuid, text, text) to authenticated;

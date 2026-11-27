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
-- Objetos nuevos / cambios
--   * Sección 0: el CHECK citas_tipo_check (lista cerrada en producción) se reemplaza por el mismo con 'Emergencia' agregado. Es lo ÚNICO
--     existente que se modifica.
--   * Columna pacientes.sin_identificar boolean not null default false (las clínicas la dejan en false para siempre) y el trigger
--     pacientes_sin_identificar_guard(): un cliente NUNCA puede dejarla en true (insert la fuerza a false; update false→true = CAMPO_INMUTABLE).
--     Solo emergencia_registrar la pone en true, mediante una variable de configuración local a la transacción.
--   * Tabla emergencias (RLS activo). Los clientes SOLO LEEN (select de la clínica); NO escriben directo: toda escritura pasa por las tres RPC
--     SECURITY DEFINER, que ya rechazan cuenta vencida y sesión de soporte. Sin insert/update/delete para clientes: borrar la cita con
--     cita_eliminar arrastra la fila por la llave foránea (la cascada corre con el dueño de la tabla).
--   * Trigger emergencias_integridad() (security definer): defensa en profundidad; cita y paciente son de la clínica de la fila, la cita es
--     de ese paciente, y clinica_id / cita_id / paciente_id no cambian (paciente_id solo lo mueve emergencia_identificar, ver abajo).
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
--   * Se modifica UNA restricción existente: citas_tipo_check (se quita y se vuelve a crear con 'Emergencia'). El ALTER bloquea brevemente la
--     tabla citas y valida todas las filas (el valor nuevo no invalida ninguna). Lo demás solo agrega: ninguna política, función o trigger
--     existente cambia. pacientes.sin_identificar es NOT NULL DEFAULT false: en PostgreSQL 11+ es un cambio de metadatos (no reescribe pacientes).
--   * Valores permitidos que este SQL usa (VERIFICADOS en producción): citas.estado ∈ ('Pendiente','Confirmada','Asistió','No asistió',
--     'Reagendada','Cancelada') (la RPC usa Pendiente / Asistió / No asistió); citas.tipo acepta NULL. NOT NULL sin default que la RPC llena:
--     citas.clinica_id, citas.paciente_id, citas.fecha, pacientes.clinica_id, pacientes.nombre. citas.portal tiene default false.
--     Sin verificar aquí (ver PRE-CHECKS 1 y 2): pacientes.origen = 'otro' (uno de ORIGENES en la app), pacientes.sexo ∈ 'Masculino' | 'Femenino' |
--     'Otro' («No determinado» de la pantalla se guarda como 'Otro'), y que citas.fecha / citas.hora acepten un date / time (o texto ISO): la función
--     usa v_local::date y date_trunc('minute', v_local)::time, que sirven tanto si la columna es date/time como si es text.
--   * Escritura de clientes: `authenticated` tiene INSERT/UPDATE de tabla completa en pacientes y citas, por eso la inmutabilidad de
--     sin_identificar se hace con un trigger (no con privilegios de columna) y no se concede nada por columna.
--   * Triggers vivos sobre citas y pacientes que la RPC dispara (security definer los ejecuta igual): limite_prueba (pacientes; puede
--     lanzar 'LIMITE_PRUEBA' y se deja pasar: la app ya lo traduce), el que llena agendo_nombre / creado_por en citas, y
--     citas_hospital_ref (valida departamento / profesional de la clínica). Ver el PRE-CHECK de triggers.
--   * emergencia_identificar (unir) mueve al paciente de destino: la cita, la emergencia, los archivos, cobros (con sus abonos, que cuelgan del
--     cobro) y movimientos de inventario de ESA cita. Si el provisional se queda sin citas, antes de borrarlo mueve también sus archivos, cobros,
--     inventario_movimientos y documentos_compartidos restantes (por paciente_id), así el borrado no pierde ni desvincula nada. Si el
--     provisional ya tiene datos escritos en su ficha NO se une ni se borra: lanza PROVISIONAL_CON_DATOS (la pantalla pide completar su nombre).
--     Si alguna otra tabla (no listada) apuntara al provisional con una llave sin cascada, el DELETE falla y TODA la función se revierte (nada
--     queda a medias). Los UPDATE de paciente_id sobre inventario_movimientos y documentos_compartidos disparan sus triggers (inv_aplicar,
--     documentos_codigo): ver los PRE-CHECKS 9 y 10 y ejercitarlos en el dry-run (el stock no debe cambiar al mover un movimiento de paciente).
--     Las rutas de storage de las fotos movidas siguen llevando el id viejo del paciente en la carpeta (la ruta es solo una llave); si la
--     política de storage dependiera del segundo segmento de la ruta, revisarla (la guía de este repo solo usa la clínica como primer segmento).
--   * Las excepciones usan variables de configuración locales a la transacción: conception.emergencia_mover (mover paciente_id de una
--     emergencia) y conception.emergencia_alta (crear un paciente provisional). Los clientes de PostgREST no pueden ejecutar SET ni
--     set_config (pg_catalog no se expone) y ninguna función expuesta las fija salvo las RPC de emergencias, que las limpian en cuanto
--     terminan el paso. Verificar con el PRE-CHECK 11. Aun si alguien lograra fijarlas, los triggers siguen comprobando clínica / cita.
--   * Sesiones de soporte: SOLO LECTURA (las RPC lanzan SIN_PERMISO y los clientes no tienen escritura directa).
--   * Nada para anon: ningún privilegio a anon ni a public.
--   * Google Calendar: las emergencias nunca se reflejan (la edge function google-calendar las excluye por tipo; desplegar la función junto
--     con el front).
--   * Orden de despliegue: aplicar este SQL ANTES del front. Si el front sale primero, «Emergencias» muestra «Disponible pronto» y nada más
--     cambia (el front detecta que la tabla no existe y no vuelve a consultarla durante esa carga de página).
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
--   -- 9. ¿el trigger de stock se dispara al cambiar paciente_id de un movimiento? (debe ser «after insert» / «update of» otras columnas; si es
--   --    «before/after update» sin lista de columnas, probar que mover un movimiento de paciente no vuelve a aplicar el stock)
--   select pg_get_triggerdef(oid) from pg_trigger where tgname = 'inv_aplicar';
--   -- 10. trigger de documentos_compartidos (¿regenera el código al actualizar?)
--   select pg_get_triggerdef(oid) from pg_trigger where tgname = 'documentos_codigo';
--   -- 11. funciones que fijan variables de configuración (tras aplicar: solo las RPC de emergencias deben aparecer)
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and prosrc ilike '%set_config%';
--   -- 12. citas_tipo_check actual (debe ser la lista de 5 tipos, NULL permitido)
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'citas_tipo_check' and conrelid = 'public.citas'::regclass;
--
-- CÓMO APLICAR: como UNA sola migración (la herramienta la envuelve en transacción; por eso no lleva begin/commit).
--
-- CÓMO PROBAR DENTRO DE UNA TRANSACCIÓN (con rollback; nada queda aplicado)
--   begin;
--     -- pegar aquí TODO el contenido de este archivo (sin las líneas de comentario del ROLLBACK)
--     -- simular a un usuario de una clínica HOSPITAL de prueba (<USER-HOSP>) y a uno de otra clínica (<USER-OTRA>):
--     select set_config('request.jwt.claims', json_build_object('sub', '<USER-HOSP>', 'role', 'authenticated')::text, true);
--     set local role authenticated;
--     -- 1. TRES caminos de registro: paciente nuevo, sin identificar y existente
--     select public.emergencia_registrar(null, 'Prueba Nueva', '5555-0000', null, null, 2::smallint, 'Dolor en el pecho', 'Esposo', null, null);
--     select public.emergencia_registrar(null, null, null, 'Masculino', '35', 1::smallint, 'Trauma por accidente', null, null, null);
--     select public.emergencia_registrar('<PACIENTE-DE-LA-CLINICA>', null, null, null, null, 4::smallint, 'Fiebre', null, '<PROFESIONAL-DE-LA-CLINICA>', null);
--     select e.estado, e.triage, c.tipo, c.estado, c.fecha, c.hora, c.departamento_id, p.nombre, p.sin_identificar
--       from public.emergencias e join public.citas c on c.id = e.cita_id join public.pacientes p on p.id = e.paciente_id order by e.llegada_at;
--         (solo el camino «sin identificar» deja sin_identificar = true; con la variable conception.emergencia_alta ya limpia: current_setting(...,true) = '')
--     -- 2. TRANSICIONES de estado: atencion pone atendido_at; alta cierra (cita 'Asistió'); REABRIR (alta → espera) limpia cerrado_at y deja la
--     --    cita 'Pendiente'; retirado → cita 'No asistió' y sin atendido_at
--     select public.emergencia_estado('<CITA>', 'atencion');  select public.emergencia_estado('<CITA>', 'alta', 'Se va a casa');
--     select estado, atendido_at, cerrado_at, destino_nota from public.emergencias where cita_id = '<CITA>';
--     select public.emergencia_estado('<CITA>', 'espera');  -- reabrir
--     select e.cerrado_at, e.destino_nota, c.estado from public.emergencias e join public.citas c on c.id = e.cita_id where e.cita_id = '<CITA>';
--     select public.emergencia_estado('<CITA>', 'observacion');  select public.emergencia_estado('<CITA2>', 'retirado');
--     -- 3. IDENTIFICAR
--     --   a. renombrar: select public.emergencia_identificar('<CITA-SIN-IDENTIFICAR>', null, 'Nombre Real', '5555-1111');  → sin_identificar = false
--     --   b. unir con un paciente existente cuando la cita tiene archivos, cobros (con abonos), inventario_movimientos y el provisional tiene
--     --      documentos_compartidos: select public.emergencia_identificar('<CITA-SIN-IDENTIFICAR-2>', '<PACIENTE-EXISTENTE>', null, null);
--     --      → archivos / cobros / abonos (vía cobro) / inventario_movimientos de la cita y los documentos del provisional ahora son del destino;
--     --        el provisional ya no existe; el STOCK de inventario no cambió (comparar select de stock antes y después)
--     --   c. unir cuando el provisional tiene una SEGUNDA cita: la cita elegida pasa al destino y el provisional se QUEDA (con su otra cita)
--     --   d. destino sin identificar (sin_identificar = true) → DATOS_INVALIDOS
--     --   e. paciente de la cita ya identificado → NO_APLICA
--     --   f. provisional con datos en su ficha (p. ej. update pacientes set alergias = 'Penicilina' where id = '<PROVISIONAL>') y unir →
--     --      PROVISIONAL_CON_DATOS, y no se movió nada (la cita sigue con el provisional)
--     -- 4. NEGATIVAS como authenticated (cada una con su set_config / set local role; usar reset role entre una y otra):
--     --   a. insert / update / delete sobre public.emergencias → permission denied (clientes solo tienen select)
--     --   b. update public.pacientes set sin_identificar = true where id = '<PACIENTE-IDENTIFICADO>';  → CAMPO_INMUTABLE
--     --   c. insert into public.pacientes (clinica_id, nombre, sin_identificar) values ('<SU-CLINICA>', 'Prueba', true) returning sin_identificar;  → false
--     --   d. update public.pacientes set sin_identificar = false where id = '<PROVISIONAL>';  funciona (limpiarla se permite)
--     -- 5. OTRA CLÍNICA (<USER-OTRA>): emergencia_estado / emergencia_identificar con una cita ajena → NO_ENCONTRADO; con p_paciente /
--     --    p_profesional / p_sede ajenos en emergencia_registrar → REFERENCIA_AJENA; select * from emergencias solo trae las suyas.
--     -- 6. Clínica que NO es hospital, clínica VENCIDA o sesión de SOPORTE llama cualquiera de las tres RPC → SIN_PERMISO.
--     -- 7. Clínica en prueba con 3 pacientes: registrar un paciente nuevo → LIMITE_PRUEBA (con uno existente pasa).
--     -- 8. Integridad (como dueño, set local role postgres; los clientes ya no escriben): update public.emergencias set paciente_id / cita_id /
--     --    clinica_id = <otro> → CAMPO_INMUTABLE; insert con una cita de otra clínica → REFERENCIA_AJENA; update ... set estado = 'alta' sin
--     --    cerrado_at → viola emergencias_cierre_coherente.
--     -- 9. cita_eliminar de una cita de emergencia borra también su fila de emergencias (cascada).
--     -- 10. ANON: set local role anon; select * from public.emergencias; select public.emergencia_registrar(...) → permission denied.
--     -- 11. Clínicas que no son hospital: select count(*) from public.pacientes where sin_identificar;  → 0.
--     -- 12. Ayudantes que fijan variables: select proname from pg_proc where pronamespace = 'public'::regnamespace and prosrc ilike '%set_config%';
--     --     → SOLO emergencia_registrar y emergencia_identificar.
--     -- 13. cita con tipo 'Emergencia' ya se acepta (sección 0); tipo 'Otro' sigue rechazado.
--     -- 14. Ejercitar CADA rama de las tres funciones y de los dos triggers (plpgsql no se valida al crear la función).
--   rollback;
--
-- ROLLBACK (deshacer todo; las citas ya creadas con tipo 'Emergencia' y los pacientes provisionales QUEDAN como datos normales)
--   -- el CHECK de tipo vuelve a la lista de 5 SOLO si ninguna fila tiene tipo 'Emergencia' (si hay, primero cambiarles el tipo o el ALTER falla):
--   --   select count(*) from public.citas where tipo = 'Emergencia';  → debe ser 0
--   alter table public.citas drop constraint citas_tipo_check;
--   alter table public.citas add constraint citas_tipo_check check (tipo = any (array['Primera consulta','Seguimiento','Evaluación','Procedimiento','Cirugía']));
--   drop function if exists public.emergencia_identificar(uuid, uuid, text, text);
--   drop function if exists public.emergencia_estado(uuid, text, text);
--   drop function if exists public.emergencia_registrar(uuid, text, text, text, text, smallint, text, text, uuid, uuid);
--   drop table if exists public.emergencias;
--   drop function if exists public.emergencias_integridad();
--   drop trigger if exists pacientes_sin_identificar_guard on public.pacientes;
--   drop function if exists public.pacientes_sin_identificar_guard();
--   alter table public.pacientes drop column if exists sin_identificar;

-- 0. citas.tipo accepts 'Emergencia' (production has a closed-list CHECK; NULL stays allowed) ----------------------------------------------
alter table public.citas drop constraint citas_tipo_check;
alter table public.citas add constraint citas_tipo_check
  check (tipo = any (array['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía', 'Emergencia']));

-- 1. pacientes.sin_identificar ---------------------------------------------------------------------------------------------------------
alter table public.pacientes add column sin_identificar boolean not null default false;

-- Clients can never turn it ON. authenticated has table-wide insert/update on pacientes, so this is enforced by a trigger:
--   * INSERT: forced to false unless the transaction-local setting conception.emergencia_alta = 'on', which only emergencia_registrar sets
--     (right around its own insert of a provisional patient, and cleared right after). Clients cannot set it: PostgREST cannot issue SET /
--     set_config (pg_catalog is not exposed) and no other exposed function sets it.
--   * UPDATE of sin_identificar: false -> true raises CAMPO_INMUTABLE; true -> false (completing the patient) stays allowed.
create or replace function public.pacientes_sin_identificar_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.sin_identificar and coalesce(current_setting('conception.emergencia_alta', true), '') <> 'on' then
      new.sin_identificar := false;
    end if;
  elsif new.sin_identificar and not old.sin_identificar then
    raise exception 'CAMPO_INMUTABLE' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.pacientes_sin_identificar_guard() from public, anon, authenticated;

create trigger pacientes_sin_identificar_guard before insert or update of sin_identificar on public.pacientes
  for each row execute function public.pacientes_sin_identificar_guard();

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

-- 3. integrity (defence in depth: clients cannot write this table at all): same clinic, same patient, immutable keys ------------------------------------------------------------------------------
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

-- 4. RLS + privileges -----------------------------------------------------------------------------------------------------------------
-- Clients only READ. Every write goes through the SECURITY DEFINER RPCs below (they refuse expired accounts and support sessions), so there
-- are no insert / update / delete policies and no such grants. The cascade from citas / pacientes removes rows with the table owner's rights.
alter table public.emergencias enable row level security;

create policy emergencias_ver on public.emergencias for select to authenticated
  using (clinica_id = (select public.mi_clinica()));

revoke all on public.emergencias from public, anon, authenticated;
grant select on public.emergencias to authenticated;
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
    -- pacientes_sin_identificar_guard() only keeps sin_identificar = true while this transaction-local setting is on
    perform set_config('conception.emergencia_alta', 'on', true);
    insert into public.pacientes (clinica_id, nombre, telefono, origen, sede_id, created_by, sexo, sin_identificar)
    values (v_clinica, v_nombre, v_tel, 'otro', v_sede, auth.uid(), v_sexo, v_sin)
    returning id into v_pac;
    perform set_config('conception.emergencia_alta', '', true);
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
  v_datos boolean;
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

    -- a provisional patient whose ficha already has data typed in is never merged away (that data would be lost): rename it instead.
    -- to_jsonb keeps this independent of the column types; empty strings / arrays / objects and null do not count as data.
    select exists (
      select 1 from public.pacientes x, jsonb_each(to_jsonb(x)) j
       where x.id = v_actual
         and (j.key in ('alergias', 'enfermedades', 'medicamentos', 'notas_medicas', 'tipo_sangre', 'fecha_nacimiento', 'dpi', 'direccion', 'contacto_emergencia', 'telefono_emergencia', 'email', 'ocupacion', 'estado_civil', 'habitos', 'extra')
              or j.key like 'antecedentes%')
         and j.value <> 'null'::jsonb and j.value <> '[]'::jsonb and j.value <> '{}'::jsonb
         and not (jsonb_typeof(j.value) = 'string' and btrim(j.value #>> '{}') = '')
    ) into v_datos;
    if v_datos then raise exception 'PROVISIONAL_CON_DATOS'; end if;

    -- see emergencias_integridad(): only this function may move paciente_id; the setting is local to this transaction
    perform set_config('conception.emergencia_mover', p_cita::text, true);
    update public.citas c set paciente_id = p_paciente where c.id = p_cita and c.clinica_id = v_clinica;
    update public.emergencias e set paciente_id = p_paciente where e.cita_id = p_cita and e.clinica_id = v_clinica;
    perform set_config('conception.emergencia_mover', '', true);

    -- everything that hangs from THIS cita follows it (abonos hang from the cobro)
    update public.archivos a set paciente_id = p_paciente where a.cita_id = p_cita and a.clinica_id = v_clinica;
    update public.cobros b set paciente_id = p_paciente where b.cita_id = p_cita and b.clinica_id = v_clinica;
    update public.inventario_movimientos m set paciente_id = p_paciente where m.cita_id = p_cita and m.clinica_id = v_clinica;

    -- the provisional patient goes away only when nothing else hangs from it: first move what is left, so the delete loses / unlinks nothing
    if not exists (select 1 from public.citas c where c.paciente_id = v_actual) then
      update public.archivos a set paciente_id = p_paciente where a.paciente_id = v_actual and a.clinica_id = v_clinica;
      update public.cobros b set paciente_id = p_paciente where b.paciente_id = v_actual and b.clinica_id = v_clinica;
      update public.inventario_movimientos m set paciente_id = p_paciente where m.paciente_id = v_actual and m.clinica_id = v_clinica;
      update public.documentos_compartidos d set paciente_id = p_paciente where d.paciente_id = v_actual and d.clinica_id = v_clinica;
      -- any other reference without a cascade makes this fail and the whole function rolls back (nothing is left half done)
      delete from public.pacientes x where x.id = v_actual and x.clinica_id = v_clinica and x.sin_identificar;
    end if;
  end if;
end;
$$;
revoke all on function public.emergencia_identificar(uuid, uuid, text, text) from public, anon;
grant execute on function public.emergencia_identificar(uuid, uuid, text, text) to authenticated;

-- PROPUESTA (NO APLICADA) · 2026-11-28 · Hospital, etapa 2: calendario de quirófanos (cirugías) y camas (hospitalización)
--
-- Qué hace
--   * Calendario de quirófanos: una cirugía es una cita (citas.tipo = 'Cirugía') más una fila en `cirugias` con el quirófano, el cirujano y el
--     anestesiólogo. Cada recurso ocupado se guarda en `reservas` (quirófano, cirujano, anestesiólogo) y una RESTRICCIÓN DE EXCLUSIÓN
--     (reservas_sin_choque) impide, a nivel de base de datos, que el mismo quirófano, cirujano o anestesiólogo tenga dos reservas que se
--     traslapen, aun si dos personas guardan al mismo tiempo. El tiempo de limpieza bloquea el quirófano pero no a los médicos.
--     También hay bloqueos manuales (vacaciones, mantenimiento) en la misma tabla.
--     Lo puede usar cualquier clínica (hospital o no) cuando la activa en Configuración; NO exige especialidad = 'hospital'.
--   * Camas: `estancias` (ingreso, traslado y egreso de un paciente en una cama) y `estancia_notas` (evolución, enfermería, indicaciones y
--     signos vitales; solo se agrega, nunca se edita ni se borra). Solo cuentas con especialidad = 'hospital'.
--
-- Objetos nuevos
--   Extensión btree_gist (schema extensions) — necesaria para la restricción de exclusión sobre uuid + rango de tiempo.
--   Tablas cirugias, reservas, estancias, estancia_notas. RLS activo: los usuarios de la clínica SOLO LEEN (select); NO hay políticas de
--   escritura: TODA escritura pasa por funciones SECURITY DEFINER que revisan sesión, clínica, cuenta vencida, sesión de soporte y que
--   CADA id recibido pertenezca a la clínica del usuario.
--   Funciones: hospital_guardia(), cirugia_programar, cirugia_estado, reserva_bloquear, reserva_quitar, disponibilidad,
--   estancia_ingresar, estancia_trasladar, estancia_egresar, estancia_nota, y las internas cirugia_reservar_interno(), citas_cirugia_sync()
--   y citas_cirugia_guardia() (triggers sobre citas).
--
-- Errores (códigos cortos en el mensaje; el front los traduce): SIN_PERMISO, NO_ENCONTRADO, REFERENCIA_AJENA, DATOS_INVALIDOS,
--   CHOQUE_QUIROFANO, CHOQUE_CIRUJANO, CHOQUE_ANESTESIOLOGO (con DETAIL «titulo|desde|hasta» del choque), CAMA_OCUPADA, PACIENTE_INGRESADO,
--   FUERA_DE_SERVICIO, CIRUGIA_USAR_QUIROFANOS (trigger de citas).
--
-- RIESGOS (revisar ANTES de aplicar)
--   * Solo agrega tablas y funciones. Lo único que toca algo existente son DOS triggers nuevos sobre `citas`:
--       - citas_cirugia_sync (after update of estado): si la cita tiene fila en cirugias y pasa a Cancelada / No asistió / Reagendada, borra
--         sus reservas y marca la cirugía «suspendida»; si pasa a Asistió, marca la cirugía «realizada». Una cita sin cirugía sale en la
--         primera línea (un exists por clave primaria); no cambia nada para clínicas que no usan quirófanos.
--       - citas_cirugia_guardia (before update of fecha, hora, duracion, profesional_id): si la cita tiene cirugía y el cambio NO viene de
--         cirugia_programar, lo rechaza con CIRUGIA_USAR_QUIROFANOS (así nadie desajusta la cita de la reserva con una llamada directa;
--         la fecha/hora de una cirugía solo cambia al reprogramar). El front ya no envía esos campos para una cita con cirugía.
--     Si prefiere no tocar `citas`, se pueden quitar los dos triggers (sección 11) y el calendario funciona igual, solo que una cita
--     cancelada desde Citas dejaría la reserva hasta que alguien suspenda la cirugía en Quirófanos.
--   * cirugia_programar INSERTA en `citas` cuando se crea la cirugía desde cero. Columnas que usa: clinica_id, paciente_id, fecha, hora, tipo,
--     estado, duracion, profesional_id, departamento_id, sede_id, servicio, procedimiento, agendo_nombre. Si alguna no existe o hay una
--     columna NOT NULL sin default que no listé, falla al crear (ver PRE-CHECKS). No crea cobro (la facturación de cirugías no está en esta etapa).
--   * La hora de la cita (fecha date + hora time) se calcula en la zona America/Guatemala (UTC-6, sin horario de verano).
--   * cirugias.quirofano_id y cirujano_id llevan FK sin ON DELETE (NO ACTION): no se puede borrar un quirófano ni un médico que ya tiene
--     cirugías (el historial se conserva; el front ya ofrece «desactivar»). cirugias/reservas/estancias SÍ se borran en cascada con la cita,
--     el paciente o la clínica.
--   * Borrar un paciente borra sus estancias y notas (cascade), igual que sus citas y cobros hoy.
--   * Concurrencia: la restricción de exclusión es la autoridad. Dos cirugías guardadas a la vez sobre el mismo recurso: la segunda falla
--     con CHOQUE_*. Siempre se inserta en el mismo orden (quirófano, cirujano, anestesiólogo), y una persona tiene una sola función, así
--     que no hay interbloqueos entre cirugías.
--   * `realizada` conserva las reservas como historial (el quirófano sigue «ocupado» hasta la hora planeada aunque se termine antes).
--   * Cuenta vencida y sesiones de soporte: NO escriben (hospital_guardia las rechaza con SIN_PERMISO); sí leen.
--   * Nada para anon / public: se revoca todo y las funciones solo se ejecutan por authenticated.
--
-- PRE-CHECKS (solo lectura; correr ANTES)
--   select name, installed_version, default_version from pg_available_extensions where name = 'btree_gist';   -- debe existir (Supabase la trae)
--   select proname, prosecdef from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('mi_clinica', 'es_admin', 'tiene_permiso', 'es_soporte', 'clinica_vencida', 'cita_eliminar') order by 1;
--   select to_regclass('public.cirugias'), to_regclass('public.reservas'), to_regclass('public.estancias'), to_regclass('public.estancia_notas');  -- null
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and table_name = 'citas' order by ordinal_position;
--     -- confirmar que existen hora, duracion, servicio, procedimiento, agendo_nombre, sede_id, profesional_id, departamento_id y que ninguna
--     -- columna NOT NULL sin default falta en el insert de cirugia_programar
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.citas'::regclass and contype = 'c';
--     -- citas_tipo_check debe permitir 'Cirugía'; citas_estado_check los 6 estados (Pendiente, Confirmada, Asistió, No asistió, Reagendada, Cancelada)
--   select tgname from pg_trigger where tgrelid = 'public.citas'::regclass and not tgisinternal;   -- ver triggers actuales de citas
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'perfiles' and column_name in ('user_id', 'nombre', 'clinica_id');
--   select pg_get_functiondef('public.cita_eliminar(uuid, text)'::regprocedure);   -- confirmar que borra la fila de citas (las FK en cascada hacen el resto)
--
-- CÓMO APLICAR: como UNA sola migración (la herramienta la envuelve en transacción; por eso no lleva begin/commit).
--
-- CÓMO PROBAR DENTRO DE UNA TRANSACCIÓN (con rollback; nada queda aplicado)
--   begin;
--     -- pegar aquí TODO el contenido de este archivo (sin las líneas de comentario del ROLLBACK)
--     -- crear datos de prueba como service_role/postgres: una clínica A (especialidad 'hospital') con 2 quirófanos (recursos tipo 'quirofano'),
--     -- 2 médicos (funcion 'medico'), 1 anestesiólogo (funcion 'anestesiologo'), 3 camas (tipo 'cama'), 2 pacientes y un usuario dueño;
--     -- una clínica B con su propio usuario, quirófano y médico. Luego, por cada prueba:
--     select set_config('request.jwt.claims', json_build_object('sub', '<USER-ID-DUEÑO-A>', 'role', 'authenticated')::text, true);
--     set local role authenticated;
--     select public.cirugia_programar(null, '<PAC1>', '<Q1>', '<MED1>', '<ANES1>', '2026-12-01 14:00+00', 120, 30, 'Apendicectomía', null, null, null, null);
--   -- Pruebas esperadas (usar reset role entre una y otra):
--   --  1. Mismo quirófano traslapado (Q1, otro médico, 15:00+00) → CHOQUE_QUIROFANO con DETAIL del choque.
--   --  2. Mismo cirujano en otro quirófano traslapado → CHOQUE_CIRUJANO.  3. Mismo anestesiólogo → CHOQUE_ANESTESIOLOGO.
--   --  4. Otro cirujano + otro quirófano + SIN anestesiólogo a la misma hora → OK.
--   --  5. Limpieza: cirugía de 14:00 a 16:00+00 con limpieza 30 → otra en Q1 a las 16:10+00 → CHOQUE_QUIROFANO; con OTRO médico/quirófano → OK;
--   --     el MISMO médico a las 16:10+00 en otro quirófano → OK (la limpieza no bloquea al médico).
--   --  6. cirugia_estado(cita, 'suspendida') → select count(*) from reservas where cita_id = '<CITA>' = 0 y la cita queda 'Cancelada'; lo mismo si se
--   --     cancela con update citas set estado = 'Cancelada' (trigger). cirugia_estado(cita, 'programada') las vuelve a crear (o CHOQUE_* si ya están ocupadas).
--   --  7. Reprogramar (cirugia_programar con p_cita existente) mueve las reservas de forma atómica: provocar un choque al reprogramar y comprobar que
--   --     las reservas y la cirugía quedan como estaban (select antes/después).
--   --  8. Concurrencia: en dos sesiones psql, begin; cirugia_programar(...) sobre el mismo recurso sin commit en la primera; la segunda se bloquea y,
--   --     al hacer commit la primera, falla con CHOQUE_*. (En una sola transacción se prueba con insert directo a reservas como postgres.)
--   --  9. Otra clínica: con el usuario de B, cirugia_programar con quirófano / médico / paciente de A → REFERENCIA_AJENA; estancia_ingresar con cama de A →
--   --     REFERENCIA_AJENA; select * from reservas / cirugias / estancias / estancia_notas → 0 filas de A; disponibilidad(...) → solo las de B.
--   -- 10. Soporte (es_soporte() true) y cuenta vencida: cualquier RPC de escritura → SIN_PERMISO; select funciona.
--   -- 11. Escritura directa denegada: como authenticated, insert / update / delete en cirugias, reservas, estancias, estancia_notas → permission denied.
--   -- 12. cita_eliminar sobre una cita con cirugía → desaparecen cirugias y reservas (select count(*) = 0).
--   -- 13. Camas: ingresar dos pacientes en la misma cama → CAMA_OCUPADA; el mismo paciente en dos camas → PACIENTE_INGRESADO; cama fuera_de_servicio → FUERA_DE_SERVICIO;
--   --     cama de otra área tipo 'cubiculo' → DATOS_INVALIDOS; estancia_egresar libera la cama (otro paciente entra); trasladar a cama ocupada → CAMA_OCUPADA
--   --     y la estancia sigue en su cama (sin nota de traslado); cuenta no-hospital → SIN_PERMISO.
--   -- 14. Notas: estancia_nota agrega (signos con valores no escalares o > 2 KB → DATOS_INVALIDOS); como authenticated update/delete sobre estancia_notas → denegado.
--   -- 15. Cita con cirugía: update citas set fecha = ... (como authenticated) → CIRUGIA_USAR_QUIROFANOS; update citas set notas = 'x' → OK.
--   -- 16. anon: set local role anon; select * from reservas; → permission denied; select public.disponibilidad(now(), now() + interval '1 day'); → permission denied.
--   rollback;
--
-- ROLLBACK (deshacer todo; se pierden las cirugías, reservas, estancias y notas; las citas se conservan)
--   drop trigger if exists citas_cirugia_sync on public.citas;
--   drop trigger if exists citas_cirugia_guardia on public.citas;
--   drop function if exists public.citas_cirugia_sync();
--   drop function if exists public.citas_cirugia_guardia();
--   drop function if exists public.estancia_nota(uuid, text, text, jsonb);
--   drop function if exists public.estancia_egresar(uuid, text, text);
--   drop function if exists public.estancia_trasladar(uuid, uuid);
--   drop function if exists public.estancia_ingresar(uuid, uuid, uuid, uuid, text);
--   drop function if exists public.disponibilidad(timestamptz, timestamptz);
--   drop function if exists public.reserva_quitar(uuid);
--   drop function if exists public.reserva_bloquear(text, uuid, timestamptz, timestamptz, text);
--   drop function if exists public.cirugia_estado(uuid, text, text);
--   drop function if exists public.cirugia_programar(uuid, uuid, uuid, uuid, uuid, timestamptz, int, int, text, text, text, uuid, uuid);
--   drop function if exists public.cirugia_reservar_interno(uuid);
--   drop function if exists public.hospital_guardia();
--   drop table if exists public.estancia_notas;
--   drop table if exists public.estancias;
--   drop table if exists public.reservas;
--   drop table if exists public.cirugias;
--   -- la extensión btree_gist se deja instalada (otras cosas podrían usarla): drop extension btree_gist; solo si se está seguro.

-- 0. extensión para la restricción de exclusión -------------------------------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;

-- 1. cirugias (una por cita de tipo Cirugía) ----------------------------------------------------------------------------------------------
create table public.cirugias (
  cita_id uuid primary key references public.citas on delete cascade,
  clinica_id uuid not null references public.clinicas on delete cascade,
  quirofano_id uuid not null references public.recursos,                       -- NO ACTION on purpose: a room with surgeries cannot be deleted
  cirujano_id uuid not null references public.profesionales,                   -- NO ACTION on purpose
  anestesiologo_id uuid references public.profesionales,                       -- null = local anesthesia / none
  ayudantes text check (ayudantes is null or char_length(ayudantes) <= 200),
  procedimiento text check (procedimiento is null or char_length(procedimiento) <= 200),
  inicio timestamptz not null,
  fin timestamptz not null,
  limpieza_min int not null default 0 check (limpieza_min between 0 and 120),
  estado text not null default 'programada' check (estado in ('programada', 'en_curso', 'realizada', 'suspendida')),
  nota text check (nota is null or char_length(nota) <= 500),
  creado_por uuid,
  created_at timestamptz default now(),
  check (fin > inicio and fin <= inicio + interval '16 hours')
);
create index cirugias_clinica_inicio_idx on public.cirugias (clinica_id, inicio);

-- 2. reservas (lo que está ocupado: quirófano, cirujano, anestesiólogo o un bloqueo manual) -------------------------------------------------
create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas on delete cascade,
  recurso_tipo text not null check (recurso_tipo in ('quirofano', 'profesional')),
  recurso_id uuid not null,                                                    -- recursos.id (quirofano) or profesionales.id (profesional); checked by the RPCs
  periodo tstzrange not null check (not isempty(periodo)),
  cita_id uuid references public.citas on delete cascade,
  motivo text not null default 'cirugia' check (motivo in ('cirugia', 'bloqueo')),
  titulo text check (titulo is null or char_length(titulo) <= 80),
  creado_por uuid,
  created_at timestamptz default now(),
  constraint reservas_sin_choque exclude using gist (recurso_id with =, periodo with &&)
);
create index reservas_clinica_periodo_idx on public.reservas using gist (clinica_id, periodo);
create index reservas_cita_idx on public.reservas (cita_id);

-- 3. estancias (hospitalización) y sus notas ------------------------------------------------------------------------------------------------
create table public.estancias (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas on delete cascade,
  paciente_id uuid not null references public.pacientes on delete cascade,
  cama_id uuid not null references public.recursos,
  profesional_id uuid references public.profesionales,
  departamento_id uuid references public.departamentos,
  motivo text not null check (char_length(btrim(motivo)) between 2 and 300),
  ingreso_at timestamptz not null default now(),
  egreso_at timestamptz,
  egreso_tipo text check (egreso_tipo is null or egreso_tipo in ('alta', 'traslado', 'fallecido', 'voluntario')),
  egreso_nota text check (egreso_nota is null or char_length(egreso_nota) <= 500),
  creado_por uuid,
  created_at timestamptz default now(),
  check ((egreso_at is null) = (egreso_tipo is null))
);
create unique index estancias_cama_abierta_uq on public.estancias (cama_id) where egreso_at is null;          -- one open stay per bed
create unique index estancias_paciente_abierta_uq on public.estancias (paciente_id) where egreso_at is null;  -- one open stay per patient
create index estancias_clinica_ingreso_idx on public.estancias (clinica_id, ingreso_at desc);
create index estancias_paciente_idx on public.estancias (paciente_id);

create table public.estancia_notas (
  id uuid primary key default gen_random_uuid(),
  estancia_id uuid not null references public.estancias on delete cascade,
  clinica_id uuid not null references public.clinicas on delete cascade,
  tipo text not null check (tipo in ('evolucion', 'enfermeria', 'indicacion', 'signos')),
  texto text check (texto is null or char_length(texto) <= 4000),
  signos jsonb check (signos is null or (jsonb_typeof(signos) = 'object' and octet_length(signos::text) <= 2048)),
  autor_id uuid,
  autor_nombre text,
  created_at timestamptz default now()
);
create index estancia_notas_estancia_idx on public.estancia_notas (estancia_id, created_at desc);

-- 4. RLS: los usuarios de la clínica solo LEEN; no hay políticas de escritura (todo pasa por las funciones de abajo) ------------------------
do $$
declare
  t text;
begin
  foreach t in array array['cirugias', 'reservas', 'estancias', 'estancia_notas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (clinica_id = (select public.mi_clinica()))', t || '_ver', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end
$$;

-- 5. guardia común de todas las funciones de escritura ----------------------------------------------------------------------------------------
-- Devuelve la clínica del usuario. Rechaza: sin sesión, sin clínica, sesión de soporte y cuenta vencida.
create or replace function public.hospital_guardia()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
begin
  if auth.uid() is null then
    raise exception 'SIN_PERMISO';
  end if;
  v_clinica := public.mi_clinica();
  if v_clinica is null or public.es_soporte() or public.clinica_vencida() then
    raise exception 'SIN_PERMISO';
  end if;
  return v_clinica;
end;
$$;
revoke all on function public.hospital_guardia() from public, anon, authenticated;

-- 6. reservas de una cirugía (interna: la usan cirugia_programar y cirugia_estado) ---------------------------------------------------------------
-- Borra las reservas de cirugía de la cita y las vuelve a crear desde su fila de cirugias: quirófano [inicio, fin + limpieza), cirujano y
-- anestesiólogo [inicio, fin). Si un recurso ya está ocupado, la restricción de exclusión lanza 23P01; se averigua cuál y se vuelve a lanzar con
-- el código específico (el bloque BEGIN/EXCEPTION deshace lo hecho dentro de él, y el error deshace TODA la función: nunca queda a medias).
create or replace function public.cirugia_reservar_interno(p_cita uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.cirugias%rowtype;
  v_fin_sala timestamptz;
  v_titulo text;
  v_choque record;
  v_codigo text;
begin
  select * into c from public.cirugias where cita_id = p_cita;
  if not found then
    raise exception 'NO_ENCONTRADO';
  end if;
  v_fin_sala := c.fin + make_interval(mins => c.limpieza_min);
  v_titulo := left(coalesce(nullif(btrim(c.procedimiento), ''), 'Cirugía'), 80);
  begin
    delete from public.reservas where cita_id = p_cita and motivo = 'cirugia';
    insert into public.reservas (clinica_id, recurso_tipo, recurso_id, periodo, cita_id, motivo, titulo, creado_por)
      values (c.clinica_id, 'quirofano', c.quirofano_id, tstzrange(c.inicio, v_fin_sala, '[)'), p_cita, 'cirugia', v_titulo, auth.uid());
    insert into public.reservas (clinica_id, recurso_tipo, recurso_id, periodo, cita_id, motivo, titulo, creado_por)
      values (c.clinica_id, 'profesional', c.cirujano_id, tstzrange(c.inicio, c.fin, '[)'), p_cita, 'cirugia', v_titulo, auth.uid());
    if c.anestesiologo_id is not null then
      insert into public.reservas (clinica_id, recurso_tipo, recurso_id, periodo, cita_id, motivo, titulo, creado_por)
        values (c.clinica_id, 'profesional', c.anestesiologo_id, tstzrange(c.inicio, c.fin, '[)'), p_cita, 'cirugia', v_titulo, auth.uid());
    end if;
  exception when exclusion_violation then
    -- who is busy? (the rows of this same cita are still there here: the subtransaction was rolled back, so ignore them)
    v_codigo := null;
    select r.titulo, lower(r.periodo) as desde, upper(r.periodo) as hasta into v_choque
      from public.reservas r
      where r.recurso_id = c.quirofano_id and r.periodo && tstzrange(c.inicio, v_fin_sala, '[)') and r.cita_id is distinct from p_cita
      order by lower(r.periodo) limit 1;
    if found then
      v_codigo := 'CHOQUE_QUIROFANO';
    else
      select r.titulo, lower(r.periodo) as desde, upper(r.periodo) as hasta into v_choque
        from public.reservas r
        where r.recurso_id = c.cirujano_id and r.periodo && tstzrange(c.inicio, c.fin, '[)') and r.cita_id is distinct from p_cita
        order by lower(r.periodo) limit 1;
      if found then
        v_codigo := 'CHOQUE_CIRUJANO';
      elsif c.anestesiologo_id is not null then
        select r.titulo, lower(r.periodo) as desde, upper(r.periodo) as hasta into v_choque
          from public.reservas r
          where r.recurso_id = c.anestesiologo_id and r.periodo && tstzrange(c.inicio, c.fin, '[)') and r.cita_id is distinct from p_cita
          order by lower(r.periodo) limit 1;
        if found then
          v_codigo := 'CHOQUE_ANESTESIOLOGO';
        end if;
      end if;
    end if;
    if v_codigo is null then
      -- a concurrent save took the slot between the violation and this lookup: report the room (the front reloads and shows who)
      raise exception 'CHOQUE_QUIROFANO';
    end if;
    raise exception '%', v_codigo using detail = coalesce(v_choque.titulo, '') || '|' || coalesce(v_choque.desde::text, '') || '|' || coalesce(v_choque.hasta::text, '');
  end;
end;
$$;
revoke all on function public.cirugia_reservar_interno(uuid) from public, anon, authenticated;

-- 7. cirugia_programar: crea o reprograma una cirugía (cita + cirugias + reservas, todo en la misma transacción) -------------------------------------
create or replace function public.cirugia_programar(
  p_cita uuid, p_paciente uuid, p_quirofano uuid, p_cirujano uuid, p_anestesiologo uuid,
  p_inicio timestamptz, p_minutos int, p_limpieza_min int,
  p_procedimiento text, p_ayudantes text, p_nota text, p_departamento uuid, p_sede uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_cita uuid;
  v_paciente uuid;
  v_fin timestamptz;
  v_limpieza int;
  v_proc text;
  v_ayud text;
  v_nota text;
  v_local timestamp;
  v_tipo text;
  v_estado_cita text;
  v_estado_cir text;
  v_ok boolean;
  v_activo boolean;
  v_fuera boolean;
  v_funcion text;
  v_tipo_rec text;
  v_agendo text;
begin
  v_clinica := public.hospital_guardia();

  -- data checks
  if p_inicio is null or p_quirofano is null or p_cirujano is null or p_minutos is null then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if p_minutos < 15 or p_minutos > 960 then
    raise exception 'DATOS_INVALIDOS';
  end if;
  v_limpieza := coalesce(p_limpieza_min, 0);
  if v_limpieza < 0 or v_limpieza > 120 then
    raise exception 'DATOS_INVALIDOS';
  end if;
  v_proc := nullif(btrim(coalesce(p_procedimiento, '')), '');
  v_ayud := nullif(btrim(coalesce(p_ayudantes, '')), '');
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  if char_length(coalesce(v_proc, '')) > 200 or char_length(coalesce(v_ayud, '')) > 200 or char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if p_anestesiologo is not null and p_anestesiologo = p_cirujano then
    raise exception 'DATOS_INVALIDOS';
  end if;
  v_fin := p_inicio + make_interval(mins => p_minutos);

  -- every id must belong to the clinic of the user
  select tipo, activo, fuera_de_servicio into v_tipo_rec, v_activo, v_fuera
    from public.recursos where id = p_quirofano and clinica_id = v_clinica;
  if not found then
    raise exception 'REFERENCIA_AJENA';
  end if;
  if v_tipo_rec <> 'quirofano' or not v_activo then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if v_fuera then
    raise exception 'FUERA_DE_SERVICIO';
  end if;

  select funcion, activo into v_funcion, v_activo from public.profesionales where id = p_cirujano and clinica_id = v_clinica;
  if not found then
    raise exception 'REFERENCIA_AJENA';
  end if;
  if v_funcion <> 'medico' or not v_activo then
    raise exception 'DATOS_INVALIDOS';
  end if;

  if p_anestesiologo is not null then
    select funcion, activo into v_funcion, v_activo from public.profesionales where id = p_anestesiologo and clinica_id = v_clinica;
    if not found then
      raise exception 'REFERENCIA_AJENA';
    end if;
    if v_funcion <> 'anestesiologo' or not v_activo then
      raise exception 'DATOS_INVALIDOS';
    end if;
  end if;

  if p_departamento is not null and not exists (select 1 from public.departamentos where id = p_departamento and clinica_id = v_clinica) then
    raise exception 'REFERENCIA_AJENA';
  end if;
  if p_sede is not null and not exists (select 1 from public.sedes where id = p_sede and clinica_id = v_clinica) then
    raise exception 'REFERENCIA_AJENA';
  end if;

  v_local := p_inicio at time zone 'America/Guatemala';
  -- this transaction may change fecha / hora / duracion / profesional_id of a surgery cita (see citas_cirugia_guardia)
  perform set_config('app.cirugia_rpc', '1', true);

  if p_cita is null then
    -- new surgery: a new cita
    if p_paciente is null then
      raise exception 'DATOS_INVALIDOS';
    end if;
    select true into v_ok from public.pacientes where id = p_paciente and clinica_id = v_clinica;
    if not found then
      raise exception 'REFERENCIA_AJENA';
    end if;
    select nombre into v_agendo from public.perfiles where user_id = auth.uid() limit 1;
    insert into public.citas (clinica_id, paciente_id, fecha, hora, tipo, estado, duracion, profesional_id, departamento_id, sede_id, servicio, procedimiento, agendo_nombre)
      values (v_clinica, p_paciente, v_local::date, v_local::time, 'Cirugía', 'Confirmada', least(p_minutos, 600), p_cirujano, p_departamento, p_sede, v_proc, v_proc, v_agendo)
      returning id into v_cita;
  else
    -- re-programming: an existing surgery cita of this clinic (a foreign or missing id both read as NO_ENCONTRADO)
    select c.id, c.tipo, c.estado, c.paciente_id into v_cita, v_tipo, v_estado_cita, v_paciente
      from public.citas c where c.id = p_cita and c.clinica_id = v_clinica for update;
    if not found then
      raise exception 'NO_ENCONTRADO';
    end if;
    if v_tipo is distinct from 'Cirugía' then
      raise exception 'DATOS_INVALIDOS';
    end if;
    select estado into v_estado_cir from public.cirugias where cita_id = v_cita for update;
    if found and v_estado_cir in ('realizada', 'en_curso') then
      raise exception 'DATOS_INVALIDOS';      -- a surgery that already started or finished is not re-programmed
    end if;
    update public.citas set
      fecha = v_local::date, hora = v_local::time, duracion = least(p_minutos, 600), profesional_id = p_cirujano,
      departamento_id = coalesce(p_departamento, departamento_id), sede_id = coalesce(p_sede, sede_id),
      servicio = coalesce(v_proc, servicio), procedimiento = coalesce(v_proc, procedimiento),
      estado = 'Confirmada'
      where id = v_cita;
  end if;

  insert into public.cirugias (cita_id, clinica_id, quirofano_id, cirujano_id, anestesiologo_id, ayudantes, procedimiento, inicio, fin, limpieza_min, estado, nota, creado_por)
    values (v_cita, v_clinica, p_quirofano, p_cirujano, p_anestesiologo, v_ayud, v_proc, p_inicio, v_fin, v_limpieza, 'programada', v_nota, auth.uid())
    on conflict (cita_id) do update set
      quirofano_id = excluded.quirofano_id, cirujano_id = excluded.cirujano_id, anestesiologo_id = excluded.anestesiologo_id,
      ayudantes = excluded.ayudantes, procedimiento = excluded.procedimiento, inicio = excluded.inicio, fin = excluded.fin,
      limpieza_min = excluded.limpieza_min, estado = 'programada', nota = excluded.nota;

  -- (re)create the reservations; a busy room / surgeon / anesthesiologist raises CHOQUE_* and the whole call rolls back
  perform public.cirugia_reservar_interno(v_cita);
  return v_cita;
end;
$$;
revoke all on function public.cirugia_programar(uuid, uuid, uuid, uuid, uuid, timestamptz, int, int, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.cirugia_programar(uuid, uuid, uuid, uuid, uuid, timestamptz, int, int, text, text, text, uuid, uuid) to authenticated;

-- 8. cirugia_estado: iniciar, realizada, suspender, volver a programar ----------------------------------------------------------------------------
create or replace function public.cirugia_estado(p_cita uuid, p_estado text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_actual text;
  v_nota text;
begin
  v_clinica := public.hospital_guardia();
  if p_cita is null or p_estado is null or p_estado not in ('programada', 'en_curso', 'realizada', 'suspendida') then
    raise exception 'DATOS_INVALIDOS';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  if char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'DATOS_INVALIDOS';
  end if;
  select estado into v_actual from public.cirugias where cita_id = p_cita and clinica_id = v_clinica for update;
  if not found then
    raise exception 'NO_ENCONTRADO';
  end if;
  -- allowed moves: programada → en_curso | realizada | suspendida · en_curso → realizada | suspendida · suspendida → programada
  if not ((v_actual = 'programada' and p_estado in ('en_curso', 'realizada', 'suspendida'))
       or (v_actual = 'en_curso' and p_estado in ('realizada', 'suspendida'))
       or (v_actual = 'suspendida' and p_estado = 'programada')) then
    raise exception 'DATOS_INVALIDOS';
  end if;
  perform set_config('app.cirugia_rpc', '1', true);

  if p_estado = 'suspendida' then
    delete from public.reservas where cita_id = p_cita and motivo = 'cirugia';
    update public.cirugias set estado = 'suspendida', nota = coalesce(v_nota, nota) where cita_id = p_cita;
    update public.citas set estado = 'Cancelada' where id = p_cita and clinica_id = v_clinica;
  elsif p_estado = 'programada' then
    update public.cirugias set estado = 'programada', nota = coalesce(v_nota, nota) where cita_id = p_cita;
    update public.citas set estado = 'Confirmada' where id = p_cita and clinica_id = v_clinica;
    perform public.cirugia_reservar_interno(p_cita);          -- may raise CHOQUE_*: everything above rolls back
  elsif p_estado = 'realizada' then
    update public.cirugias set estado = 'realizada', nota = coalesce(v_nota, nota) where cita_id = p_cita;
    update public.citas set estado = 'Asistió' where id = p_cita and clinica_id = v_clinica;
  else
    update public.cirugias set estado = 'en_curso', nota = coalesce(v_nota, nota) where cita_id = p_cita;
  end if;
end;
$$;
revoke all on function public.cirugia_estado(uuid, text, text) from public, anon;
grant execute on function public.cirugia_estado(uuid, text, text) to authenticated;

-- 9. bloqueos manuales (vacaciones, mantenimiento) ------------------------------------------------------------------------------------------------
create or replace function public.reserva_bloquear(p_tipo text, p_recurso uuid, p_inicio timestamptz, p_fin timestamptz, p_titulo text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_titulo text;
  v_id uuid;
  v_funcion text;
  v_choque record;
begin
  v_clinica := public.hospital_guardia();
  v_titulo := nullif(btrim(coalesce(p_titulo, '')), '');
  if p_tipo not in ('quirofano', 'profesional') or p_recurso is null or p_inicio is null or p_fin is null or v_titulo is null
     or char_length(v_titulo) > 80 or p_fin <= p_inicio or p_fin > p_inicio + interval '31 days' then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if p_tipo = 'quirofano' then
    if not exists (select 1 from public.recursos where id = p_recurso and clinica_id = v_clinica) then
      raise exception 'REFERENCIA_AJENA';
    end if;
    if not exists (select 1 from public.recursos where id = p_recurso and tipo = 'quirofano') then
      raise exception 'DATOS_INVALIDOS';
    end if;
  else
    select funcion into v_funcion from public.profesionales where id = p_recurso and clinica_id = v_clinica;
    if not found then
      raise exception 'REFERENCIA_AJENA';
    end if;
  end if;
  begin
    insert into public.reservas (clinica_id, recurso_tipo, recurso_id, periodo, motivo, titulo, creado_por)
      values (v_clinica, p_tipo, p_recurso, tstzrange(p_inicio, p_fin, '[)'), 'bloqueo', v_titulo, auth.uid())
      returning id into v_id;
  exception when exclusion_violation then
    select r.titulo, lower(r.periodo) as desde, upper(r.periodo) as hasta into v_choque
      from public.reservas r where r.recurso_id = p_recurso and r.periodo && tstzrange(p_inicio, p_fin, '[)') order by lower(r.periodo) limit 1;
    raise exception '%', case when p_tipo = 'quirofano' then 'CHOQUE_QUIROFANO' when v_funcion = 'anestesiologo' then 'CHOQUE_ANESTESIOLOGO' else 'CHOQUE_CIRUJANO' end
      using detail = coalesce(v_choque.titulo, '') || '|' || coalesce(v_choque.desde::text, '') || '|' || coalesce(v_choque.hasta::text, '');
  end;
  return v_id;
end;
$$;
revoke all on function public.reserva_bloquear(text, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.reserva_bloquear(text, uuid, timestamptz, timestamptz, text) to authenticated;

-- only manual blocks can be removed this way (a surgery's reservations go away by suspending / deleting the surgery)
create or replace function public.reserva_quitar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
begin
  v_clinica := public.hospital_guardia();
  delete from public.reservas where id = p_id and clinica_id = v_clinica and motivo = 'bloqueo';
  if not found then
    raise exception 'NO_ENCONTRADO';
  end if;
end;
$$;
revoke all on function public.reserva_quitar(uuid) from public, anon;
grant execute on function public.reserva_quitar(uuid) to authenticated;

-- 10. disponibilidad: lo ocupado en una ventana (SECURITY INVOKER: la RLS de reservas ya limita a la clínica del usuario) --------------------------
create or replace function public.disponibilidad(p_desde timestamptz, p_hasta timestamptz)
returns table (id uuid, recurso_tipo text, recurso_id uuid, inicio timestamptz, fin timestamptz, cita_id uuid, motivo text, titulo text)   -- id: needed by reserva_quitar
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.id, r.recurso_tipo, r.recurso_id, lower(r.periodo), upper(r.periodo), r.cita_id, r.motivo, r.titulo
    from public.reservas r
    where r.clinica_id = (select public.mi_clinica())
      and r.periodo && tstzrange(p_desde, greatest(p_desde, least(p_hasta, p_desde + interval '62 days')), '[)')
    order by lower(r.periodo)
$$;
revoke all on function public.disponibilidad(timestamptz, timestamptz) from public, anon;
grant execute on function public.disponibilidad(timestamptz, timestamptz) to authenticated;

-- 11. triggers sobre citas (ver RIESGOS) ------------------------------------------------------------------------------------------------------------
create or replace function public.citas_cirugia_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.cirugias where cita_id = new.id) then
    return new;
  end if;
  if new.estado in ('Cancelada', 'No asistió', 'Reagendada') then
    delete from public.reservas where cita_id = new.id and motivo = 'cirugia';
    update public.cirugias set estado = 'suspendida' where cita_id = new.id and estado in ('programada', 'en_curso');
  elsif new.estado = 'Asistió' then
    update public.cirugias set estado = 'realizada' where cita_id = new.id and estado in ('programada', 'en_curso');
  end if;
  return new;
end;
$$;
revoke all on function public.citas_cirugia_sync() from public, anon, authenticated;
create trigger citas_cirugia_sync after update of estado on public.citas
  for each row when (old.estado is distinct from new.estado) execute function public.citas_cirugia_sync();

create or replace function public.citas_cirugia_guardia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.fecha is distinct from old.fecha or new.hora is distinct from old.hora or new.duracion is distinct from old.duracion
      or new.profesional_id is distinct from old.profesional_id)
     and coalesce(current_setting('app.cirugia_rpc', true), '') <> '1'
     and exists (select 1 from public.cirugias where cita_id = new.id) then
    raise exception 'CIRUGIA_USAR_QUIROFANOS';
  end if;
  return new;
end;
$$;
revoke all on function public.citas_cirugia_guardia() from public, anon, authenticated;
create trigger citas_cirugia_guardia before update of fecha, hora, duracion, profesional_id on public.citas
  for each row execute function public.citas_cirugia_guardia();

-- 12. camas: ingresar, trasladar, egresar y notas (solo cuentas con especialidad = 'hospital') ------------------------------------------------------
create or replace function public.estancia_ingresar(p_paciente uuid, p_cama uuid, p_profesional uuid, p_departamento uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_motivo text;
  v_tipo text;
  v_activo boolean;
  v_fuera boolean;
  v_id uuid;
  v_constraint text;
begin
  v_clinica := public.hospital_guardia();
  if not exists (select 1 from public.clinicas where id = v_clinica and especialidad = 'hospital') then
    raise exception 'SIN_PERMISO';
  end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if p_paciente is null or p_cama is null or char_length(v_motivo) < 2 or char_length(v_motivo) > 300 then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if not exists (select 1 from public.pacientes where id = p_paciente and clinica_id = v_clinica) then
    raise exception 'REFERENCIA_AJENA';
  end if;
  select tipo, activo, fuera_de_servicio into v_tipo, v_activo, v_fuera from public.recursos where id = p_cama and clinica_id = v_clinica;
  if not found then
    raise exception 'REFERENCIA_AJENA';
  end if;
  if v_tipo <> 'cama' or not v_activo then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if v_fuera then
    raise exception 'FUERA_DE_SERVICIO';
  end if;
  if p_profesional is not null and not exists (select 1 from public.profesionales where id = p_profesional and clinica_id = v_clinica) then
    raise exception 'REFERENCIA_AJENA';
  end if;
  if p_departamento is not null and not exists (select 1 from public.departamentos where id = p_departamento and clinica_id = v_clinica) then
    raise exception 'REFERENCIA_AJENA';
  end if;
  begin
    insert into public.estancias (clinica_id, paciente_id, cama_id, profesional_id, departamento_id, motivo, creado_por)
      values (v_clinica, p_paciente, p_cama, p_profesional, p_departamento, v_motivo, auth.uid())
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'estancias_paciente_abierta_uq' then
      raise exception 'PACIENTE_INGRESADO';
    end if;
    raise exception 'CAMA_OCUPADA';
  end;
  return v_id;
end;
$$;
revoke all on function public.estancia_ingresar(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.estancia_ingresar(uuid, uuid, uuid, uuid, text) to authenticated;

create or replace function public.estancia_trasladar(p_estancia uuid, p_cama uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_actual uuid;
  v_nombre_a text;
  v_nombre_b text;
  v_tipo text;
  v_activo boolean;
  v_fuera boolean;
  v_autor text;
begin
  v_clinica := public.hospital_guardia();
  if not exists (select 1 from public.clinicas where id = v_clinica and especialidad = 'hospital') then
    raise exception 'SIN_PERMISO';
  end if;
  if p_estancia is null or p_cama is null then
    raise exception 'DATOS_INVALIDOS';
  end if;
  select cama_id into v_actual from public.estancias where id = p_estancia and clinica_id = v_clinica and egreso_at is null for update;
  if not found then
    raise exception 'NO_ENCONTRADO';
  end if;
  if v_actual = p_cama then
    raise exception 'DATOS_INVALIDOS';
  end if;
  select tipo, activo, fuera_de_servicio, nombre into v_tipo, v_activo, v_fuera, v_nombre_b from public.recursos where id = p_cama and clinica_id = v_clinica;
  if not found then
    raise exception 'REFERENCIA_AJENA';
  end if;
  if v_tipo <> 'cama' or not v_activo then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if v_fuera then
    raise exception 'FUERA_DE_SERVICIO';
  end if;
  select nombre into v_nombre_a from public.recursos where id = v_actual;
  select nombre into v_autor from public.perfiles where user_id = auth.uid() limit 1;
  begin
    update public.estancias set cama_id = p_cama where id = p_estancia;
  exception when unique_violation then
    raise exception 'CAMA_OCUPADA';
  end;
  insert into public.estancia_notas (estancia_id, clinica_id, tipo, texto, autor_id, autor_nombre)
    values (p_estancia, v_clinica, 'indicacion', left('Traslado de ' || coalesce(v_nombre_a, 'cama') || ' a ' || coalesce(v_nombre_b, 'cama'), 4000), auth.uid(), v_autor);
end;
$$;
revoke all on function public.estancia_trasladar(uuid, uuid) from public, anon;
grant execute on function public.estancia_trasladar(uuid, uuid) to authenticated;

create or replace function public.estancia_egresar(p_estancia uuid, p_tipo text, p_nota text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_nota text;
begin
  v_clinica := public.hospital_guardia();
  if not exists (select 1 from public.clinicas where id = v_clinica and especialidad = 'hospital') then
    raise exception 'SIN_PERMISO';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  if p_estancia is null or p_tipo is null or p_tipo not in ('alta', 'traslado', 'fallecido', 'voluntario') or char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'DATOS_INVALIDOS';
  end if;
  update public.estancias set egreso_at = now(), egreso_tipo = p_tipo, egreso_nota = v_nota
    where id = p_estancia and clinica_id = v_clinica and egreso_at is null;
  if not found then
    raise exception 'NO_ENCONTRADO';
  end if;
end;
$$;
revoke all on function public.estancia_egresar(uuid, text, text) from public, anon;
grant execute on function public.estancia_egresar(uuid, text, text) to authenticated;

create or replace function public.estancia_nota(p_estancia uuid, p_tipo text, p_texto text, p_signos jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_texto text;
  v_signos jsonb;
  v_autor text;
  v_id uuid;
  v_k text;
  v_v jsonb;
  v_n int := 0;
begin
  v_clinica := public.hospital_guardia();
  if not exists (select 1 from public.clinicas where id = v_clinica and especialidad = 'hospital') then
    raise exception 'SIN_PERMISO';
  end if;
  v_texto := nullif(btrim(coalesce(p_texto, '')), '');
  v_signos := p_signos;
  if p_estancia is null or p_tipo is null or p_tipo not in ('evolucion', 'enfermeria', 'indicacion', 'signos') or char_length(coalesce(v_texto, '')) > 4000 then
    raise exception 'DATOS_INVALIDOS';
  end if;
  if p_tipo = 'signos' then
    if v_signos is null or jsonb_typeof(v_signos) <> 'object' or octet_length(v_signos::text) > 2048 then
      raise exception 'DATOS_INVALIDOS';
    end if;
    for v_k, v_v in select key, value from jsonb_each(v_signos) loop
      v_n := v_n + 1;
      if v_n > 12 or char_length(v_k) > 40 or jsonb_typeof(v_v) not in ('string', 'number') then
        raise exception 'DATOS_INVALIDOS';
      end if;
    end loop;
    if v_n = 0 then
      raise exception 'DATOS_INVALIDOS';
    end if;
  else
    v_signos := null;
    if v_texto is null then
      raise exception 'DATOS_INVALIDOS';
    end if;
  end if;
  if not exists (select 1 from public.estancias where id = p_estancia and clinica_id = v_clinica and egreso_at is null) then
    raise exception 'NO_ENCONTRADO';
  end if;
  select nombre into v_autor from public.perfiles where user_id = auth.uid() limit 1;
  insert into public.estancia_notas (estancia_id, clinica_id, tipo, texto, signos, autor_id, autor_nombre)
    values (p_estancia, v_clinica, p_tipo, v_texto, v_signos, auth.uid(), v_autor)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.estancia_nota(uuid, text, text, jsonb) from public, anon;
grant execute on function public.estancia_nota(uuid, text, text, jsonb) to authenticated;

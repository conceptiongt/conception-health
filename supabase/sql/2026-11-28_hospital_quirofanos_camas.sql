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
-- CAMBIOS DE LA REVISIÓN (segunda versión)
--   * Pacientes: estancias.paciente_id ya NO se borra en cascada (NO ACTION; no RESTRICT, para que borrar una clínica entera siga en cascada): borrar un paciente
--     con hospitalizaciones falla con 23503. Un paciente con cirugías: sus citas se borran con él (FK existente de citas), pero una cirugía realizada o en curso lo
--     impide (trigger citas_cirugia_no_borrar → CIRUGIA_REALIZADA); las programadas / suspendidas se borran con su cita.
--   * emergencia_identificar (cuerpo VIVO de 2026-11-27_hospital_emergencias.sql, sección 7; el cuerpo anterior está en el ROLLBACK): al unir un provisional, sus
--     estancias pasan al paciente destino antes de borrarlo (destino ya ingresado → PACIENTE_INGRESADO) y se activa conception.cirugia_rpc alrededor del cambio de
--     paciente_id de la cita. Mismos atributos y grants. VERIFICAR antes de aplicar que el cuerpo vivo es idéntico al del archivo:
--       select pg_get_functiondef('public.emergencia_identificar(uuid, uuid, text, text)'::regprocedure);
--   * hospital_guardia(p_permiso): además de sesión / clínica / soporte / vencida, exige el permiso del asistente ('quirofano' o 'camas'; el dueño siempre; clave
--     ausente = permitido, como puede() en la app; NO usa tiene_permiso(), donde ausente = falso) y aplica el plan: hospital con plan = 'basico' (Hospital Básico) →
--     'PLAN' (prueba, max y otros planes pasan; una clínica normal con el calendario activado no depende del plan). Camas solo para especialidad = 'hospital'.
--   * citas: tres triggers de actualización (sync de estado — ahora una cirugía suspendida no se «des-cancela» con un update directo —, guardia de fecha / hora /
--     duración / médico / tipo / paciente) y uno de borrado (cirugía realizada o en curso no se borra). El sync ya no toca una cirugía realizada.
--   * Marcar «realizada» antes de la hora planeada termina la cirugía ahora: cirugias.fin = ahora y las reservas se acortan (quirófano: ahora + limpieza; médicos: ahora).
--   * Borrar un quirófano o médico que aún tiene reservas (cirugías o bloqueos) falla con 23503 (triggers recursos_reservas_no_borrar y profesionales_reservas_no_borrar);
--     borrar la clínica entera no se bloquea.
--   * Supuestos a confirmar: perfiles.rol ('dueno', 'asistente', 'soporte') y perfiles.permisos jsonb; clinicas.plan = 'basico' | 'max' | 'prueba'…
--
-- PRE-CHECKS (solo lectura; correr ANTES)
--   select name, installed_version, default_version from pg_available_extensions where name = 'btree_gist';   -- debe existir (Supabase la trae)
--   select proname, prosecdef from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('mi_clinica', 'es_admin', 'tiene_permiso', 'es_soporte', 'clinica_vencida', 'cita_eliminar') order by 1;
--   select data_type from information_schema.columns where table_schema = 'public' and table_name = 'perfiles' and column_name = 'permisos';   -- jsonb
--   select distinct plan, especialidad from public.clinicas order by 1, 2;   -- ver los valores reales de plan (se espera 'basico')
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
--   -- D1–D12 de la revisión:
--   -- 17. create → 1 cita + 3 reservas (quirófano, cirujano, anestesiólogo); sin anestesiólogo → 2 reservas.
--   -- 18. «realizada» a mitad de la cirugía (inicio < now() < fin): cirugias.fin = now(); las reservas del quirófano terminan en now() + limpieza y las de médicos en now();
--   --     otra cirugía puede entrar en ese quirófano después de la limpieza. «realizada» antes de empezar no cambia las horas.
--   -- 19. Suspender o cancelar (update citas set estado = 'Cancelada') → 0 reservas; deshacer con update citas set estado = 'Confirmada' como authenticated → CIRUGIA_USAR_QUIROFANOS;
--   --     cirugia_estado(cita, 'programada') y cirugia_programar sobre la cita sí funcionan. Cancelar una cirugía realizada no la toca ni borra sus reservas.
--   -- 20. update de fecha / hora / tipo / paciente_id de una cita con cirugía (authenticated) → CIRUGIA_USAR_QUIROFANOS; update de notas → OK;
--   --     citas sin cirugía, emergencia_estado y cita_eliminar sobre citas normales: sin cambios.
--   -- 21. delete de una cita con cirugía realizada o en curso (cita_eliminar, borrar al paciente, borrar la fila) → CIRUGIA_REALIZADA; programada / suspendida → se borra con cirugia y reservas;
--   --     borrar la clínica entera como postgres (cascada) NO se bloquea aunque tenga cirugías realizadas, bloqueos y camas ocupadas.
--   -- 22. Paciente con estancia (abierta o cerrada): delete from pacientes → 23503; emergencia_identificar sobre un provisional ingresado → la estancia pasa al paciente destino y
--   --     el provisional desaparece; si el destino ya está ingresado → PACIENTE_INGRESADO y nada cambia. Una cirugía cuya cita pertenece a la emergencia se mueve sin CIRUGIA_USAR_QUIROFANOS.
--   -- 23. Asistente con permisos {"quirofano": false} → cirugia_programar / cirugia_estado / reserva_* → SIN_PERMISO; {"camas": false} → estancia_* → SIN_PERMISO; clave ausente → permitido; dueño → permitido.
--   -- 24. Clínica hospital con plan = 'basico' → cualquier RPC de cirugías o camas → PLAN; plan 'max' o 'prueba' → permitido; clínica normal (flebología) con plan basico → cirugías permitidas, camas SIN_PERMISO.
--   -- 25. delete de un quirófano o médico con reservas (cirugía o bloqueo) → 23503; sin reservas → se borra.
--   rollback;
--
-- ROLLBACK (deshacer todo; se pierden las cirugías, reservas, estancias y notas; las citas se conservan)
--   drop trigger if exists citas_cirugia_no_borrar on public.citas;
--   drop trigger if exists recursos_reservas_no_borrar on public.recursos;
--   drop trigger if exists profesionales_reservas_no_borrar on public.profesionales;
--   drop function if exists public.citas_cirugia_no_borrar();
--   drop function if exists public.recurso_con_reservas_no_borrar();
--   -- emergencia_identificar: volver al cuerpo anterior (el de supabase/sql/2026-11-27_hospital_emergencias.sql, sección 7):
--   create or replace function public.emergencia_identificar(p_cita uuid, p_paciente uuid, p_nombre text, p_telefono text)
--   returns void
--   language plpgsql
--   security definer
--   set search_path = public, pg_temp
--   as $$
--   declare
--     v_clinica uuid;
--     v_actual uuid;
--     v_nombre text := left(btrim(coalesce(p_nombre, '')), 120);
--     v_tel text := nullif(left(btrim(coalesce(p_telefono, '')), 30), '');
--     v_datos boolean;
--   begin
--     v_clinica := public.mi_clinica();
--     if auth.uid() is null or v_clinica is null or public.es_soporte() or public.clinica_vencida()
--        or not exists (select 1 from public.clinicas c where c.id = v_clinica and c.especialidad = 'hospital') then
--       raise exception 'SIN_PERMISO';
--     end if;
--   
--     select e.paciente_id into v_actual from public.emergencias e where e.cita_id = p_cita and e.clinica_id = v_clinica for update;
--     if not found then raise exception 'NO_ENCONTRADO'; end if;
--   
--     -- only a provisional patient is completed or merged away
--     perform 1 from public.pacientes x where x.id = v_actual and x.clinica_id = v_clinica and x.sin_identificar for update;
--     if not found then raise exception 'NO_APLICA'; end if;
--   
--     if p_paciente is null then
--       -- rename: it is now an identified patient
--       if char_length(v_nombre) < 2 then raise exception 'DATOS_INVALIDOS'; end if;
--       update public.pacientes x set nombre = v_nombre, telefono = coalesce(v_tel, x.telefono), sin_identificar = false
--        where x.id = v_actual and x.clinica_id = v_clinica;
--     else
--       -- merge into an existing, identified patient of the same clinic
--       if p_paciente = v_actual then raise exception 'DATOS_INVALIDOS'; end if;
--       perform 1 from public.pacientes x where x.id = p_paciente and x.clinica_id = v_clinica;
--       if not found then raise exception 'REFERENCIA_AJENA' using errcode = '23514'; end if;
--       perform 1 from public.pacientes x where x.id = p_paciente and not x.sin_identificar;
--       if not found then raise exception 'DATOS_INVALIDOS'; end if;
--   
--       -- a provisional patient whose ficha already has data typed in is never merged away (that data would be lost): rename it instead.
--       -- to_jsonb keeps this independent of the column types; empty strings / arrays / objects and null do not count as data.
--       select exists (
--         select 1 from public.pacientes x, jsonb_each(to_jsonb(x)) j
--          where x.id = v_actual
--            and (j.key in ('alergias', 'enfermedades', 'medicamentos', 'notas_medicas', 'tipo_sangre', 'fecha_nacimiento', 'dpi', 'direccion', 'contacto_emergencia', 'telefono_emergencia', 'email', 'ocupacion', 'estado_civil', 'habitos', 'extra')
--                 or j.key like 'antecedentes%')
--            and j.value <> 'null'::jsonb and j.value <> '[]'::jsonb and j.value <> '{}'::jsonb
--            and not (jsonb_typeof(j.value) = 'string' and btrim(j.value #>> '{}') = '')
--       ) into v_datos;
--       if v_datos then raise exception 'PROVISIONAL_CON_DATOS'; end if;
--   
--       -- see emergencias_integridad(): only this function may move paciente_id; the setting is local to this transaction
--       perform set_config('conception.emergencia_mover', p_cita::text, true);
--       update public.citas c set paciente_id = p_paciente where c.id = p_cita and c.clinica_id = v_clinica;
--       update public.emergencias e set paciente_id = p_paciente where e.cita_id = p_cita and e.clinica_id = v_clinica;
--       perform set_config('conception.emergencia_mover', '', true);
--   
--       -- everything that hangs from THIS cita follows it (abonos hang from the cobro)
--       update public.archivos a set paciente_id = p_paciente where a.cita_id = p_cita and a.clinica_id = v_clinica;
--       update public.cobros b set paciente_id = p_paciente where b.cita_id = p_cita and b.clinica_id = v_clinica;
--       update public.inventario_movimientos m set paciente_id = p_paciente where m.cita_id = p_cita and m.clinica_id = v_clinica;
--   
--       -- the provisional patient goes away only when nothing else hangs from it: first move what is left, so the delete loses / unlinks nothing
--       if not exists (select 1 from public.citas c where c.paciente_id = v_actual) then
--         update public.archivos a set paciente_id = p_paciente where a.paciente_id = v_actual and a.clinica_id = v_clinica;
--         update public.cobros b set paciente_id = p_paciente where b.paciente_id = v_actual and b.clinica_id = v_clinica;
--         update public.inventario_movimientos m set paciente_id = p_paciente where m.paciente_id = v_actual and m.clinica_id = v_clinica;
--         update public.documentos_compartidos d set paciente_id = p_paciente where d.paciente_id = v_actual and d.clinica_id = v_clinica;
--         -- any other reference without a cascade makes this fail and the whole function rolls back (nothing is left half done)
--         delete from public.pacientes x where x.id = v_actual and x.clinica_id = v_clinica and x.sin_identificar;
--       end if;
--     end if;
--   end;
--   $$;
--   revoke all on function public.emergencia_identificar(uuid, uuid, text, text) from public, anon;
--   grant execute on function public.emergencia_identificar(uuid, uuid, text, text) to authenticated;
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
--   drop function if exists public.hospital_guardia(text);
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
  paciente_id uuid not null references public.pacientes,                        -- NO ACTION on purpose: a patient with hospitalizations cannot be deleted / merged away (23503); emergencia_identificar moves them first. NO ACTION (not RESTRICT) so deleting a whole clinic still cascades
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
alter table public.cirugias enable row level security;
create policy cirugias_ver on public.cirugias for select to authenticated using (clinica_id = (select public.mi_clinica()));
revoke all on public.cirugias from public, anon, authenticated;
grant select on public.cirugias to authenticated;
grant all on public.cirugias to service_role;
alter table public.reservas enable row level security;
create policy reservas_ver on public.reservas for select to authenticated using (clinica_id = (select public.mi_clinica()));
revoke all on public.reservas from public, anon, authenticated;
grant select on public.reservas to authenticated;
grant all on public.reservas to service_role;
alter table public.estancias enable row level security;
create policy estancias_ver on public.estancias for select to authenticated using (clinica_id = (select public.mi_clinica()));
revoke all on public.estancias from public, anon, authenticated;
grant select on public.estancias to authenticated;
grant all on public.estancias to service_role;
alter table public.estancia_notas enable row level security;
create policy estancia_notas_ver on public.estancia_notas for select to authenticated using (clinica_id = (select public.mi_clinica()));
revoke all on public.estancia_notas from public, anon, authenticated;
grant select on public.estancia_notas to authenticated;
grant all on public.estancia_notas to service_role;

-- 5. guardia común de todas las funciones de escritura ----------------------------------------------------------------------------------------
-- Devuelve la clínica del usuario. Rechaza: sin sesión, sin clínica, sesión de soporte y cuenta vencida.
-- p_permiso = 'quirofano' (surgery calendar) or 'camas' (beds). Checks, in this order:
--   session, clinic, support session, expired account · the assistant's own permission (owner always passes; a missing key counts as allowed, like puede() in the app;
--   tiene_permiso() is NOT used because there a missing key means false) · the plan: a hospital on plan 'basico' (Hospital Básico) has neither module → 'PLAN'
--   (trial, max and other plans pass) · beds only exist for hospital accounts. A normal clinic with the surgery calendar on is not limited by plan.
create or replace function public.hospital_guardia(p_permiso text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_rol text;
  v_permisos jsonb;
  v_esp text;
  v_plan text;
begin
  if auth.uid() is null or p_permiso not in ('quirofano', 'camas') then
    raise exception 'SIN_PERMISO';
  end if;
  v_clinica := public.mi_clinica();
  if v_clinica is null or public.es_soporte() or public.clinica_vencida() then
    raise exception 'SIN_PERMISO';
  end if;
  select p.rol, p.permisos into v_rol, v_permisos from public.perfiles p where p.user_id = auth.uid() limit 1;
  if v_rol is distinct from 'dueno' and coalesce(v_permisos ->> p_permiso, 'true') = 'false' then
    raise exception 'SIN_PERMISO';
  end if;
  select c.especialidad, c.plan into v_esp, v_plan from public.clinicas c where c.id = v_clinica;
  if p_permiso = 'camas' and v_esp is distinct from 'hospital' then
    raise exception 'SIN_PERMISO';
  end if;
  if v_esp = 'hospital' and v_plan = 'basico' then
    raise exception 'PLAN';
  end if;
  return v_clinica;
end;
$$;
revoke all on function public.hospital_guardia(text) from public, anon, authenticated;

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
  v_clinica := public.hospital_guardia('quirofano');

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
  perform set_config('conception.cirugia_rpc', '1', true);

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
  v_c public.cirugias%rowtype;
  v_fin_nuevo timestamptz;
begin
  v_clinica := public.hospital_guardia('quirofano');
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
  perform set_config('conception.cirugia_rpc', '1', true);

  if p_estado = 'suspendida' then
    delete from public.reservas where cita_id = p_cita and motivo = 'cirugia';
    update public.cirugias set estado = 'suspendida', nota = coalesce(v_nota, nota) where cita_id = p_cita;
    update public.citas set estado = 'Cancelada' where id = p_cita and clinica_id = v_clinica;
  elsif p_estado = 'programada' then
    update public.cirugias set estado = 'programada', nota = coalesce(v_nota, nota) where cita_id = p_cita;
    update public.citas set estado = 'Confirmada' where id = p_cita and clinica_id = v_clinica;
    perform public.cirugia_reservar_interno(p_cita);          -- may raise CHOQUE_*: everything above rolls back
  elsif p_estado = 'realizada' then
    -- finished earlier than planned: the surgery ends now and the room (after its cleaning) and the doctors are free from then on.
    -- (not before it started: lower(...) < now(); a surgery marked done ahead of time keeps its planned time)
    select * into v_c from public.cirugias where cita_id = p_cita;
    if v_c.inicio < now() and v_c.fin > now() then
      v_fin_nuevo := greatest(v_c.inicio + interval '1 minute', now());
      update public.cirugias set fin = v_fin_nuevo where cita_id = p_cita;
      update public.reservas r set periodo = tstzrange(lower(r.periodo),
          case when r.recurso_tipo = 'quirofano' then v_fin_nuevo + make_interval(mins => v_c.limpieza_min) else v_fin_nuevo end, '[)')
        where r.cita_id = p_cita and r.motivo = 'cirugia';
    end if;
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
  v_clinica := public.hospital_guardia('quirofano');
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
  v_clinica := public.hospital_guardia('quirofano');
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

-- 11. triggers sobre citas y borrados protegidos (ver RIESGOS) -------------------------------------------------------------------------------------------
-- The settings below are transaction-local (set_config(..., true)); clients cannot set them (PostgREST does not expose set_config).
--   conception.cirugia_rpc = '1'  → set by cirugia_programar / cirugia_estado / emergencia_identificar: this transaction may change a surgery cita.
create or replace function public.citas_cirugia_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado text;
  v_cancela constant text[] := array['Cancelada', 'No asistió', 'Reagendada'];
begin
  select c.estado into v_estado from public.cirugias c where c.cita_id = new.id;
  if not found then
    return new;
  end if;
  if new.estado = any (v_cancela) then
    -- a finished surgery keeps its reservations (history) and its state, whatever happens to the cita afterwards
    if v_estado in ('programada', 'en_curso') then
      delete from public.reservas where cita_id = new.id and motivo = 'cirugia';
      update public.cirugias set estado = 'suspendida' where cita_id = new.id;
    end if;
  elsif old.estado = any (v_cancela) and v_estado = 'suspendida' then
    -- un-cancelling a suspended surgery would leave a confirmed cita with no room and no team: it is re-scheduled in Quirófanos
    if coalesce(current_setting('conception.cirugia_rpc', true), '') <> '1' then
      raise exception 'CIRUGIA_USAR_QUIROFANOS';
    end if;
  elsif new.estado = 'Asistió' and v_estado in ('programada', 'en_curso') then
    update public.cirugias set estado = 'realizada' where cita_id = new.id;
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
      or new.profesional_id is distinct from old.profesional_id or new.tipo is distinct from old.tipo or new.paciente_id is distinct from old.paciente_id)
     and coalesce(current_setting('conception.cirugia_rpc', true), '') <> '1'
     and exists (select 1 from public.cirugias where cita_id = new.id) then
    raise exception 'CIRUGIA_USAR_QUIROFANOS';
  end if;
  return new;
end;
$$;
revoke all on function public.citas_cirugia_guardia() from public, anon, authenticated;
create trigger citas_cirugia_guardia before update of fecha, hora, duracion, profesional_id, tipo, paciente_id on public.citas
  for each row execute function public.citas_cirugia_guardia();

-- A surgery that is done or in progress is clinical history: its cita cannot be deleted (cita_eliminar, deleting the patient, a merge…).
-- Programmed and suspended surgeries can be deleted (cirugia + reservas follow by cascade). Deleting a whole clinic is not blocked (the clinic row is already gone).
create or replace function public.citas_cirugia_no_borrar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.cirugias c where c.cita_id = old.id and c.estado in ('realizada', 'en_curso'))
     and exists (select 1 from public.clinicas k where k.id = old.clinica_id) then
    raise exception 'CIRUGIA_REALIZADA';
  end if;
  return old;
end;
$$;
revoke all on function public.citas_cirugia_no_borrar() from public, anon, authenticated;
create trigger citas_cirugia_no_borrar before delete on public.citas
  for each row execute function public.citas_cirugia_no_borrar();

-- Manual blocks have no foreign key (the resource is a room or a doctor): deleting a room / doctor that still has reservations is refused (23503,
-- like the other history), so no block is left pointing nowhere. Deleting a whole clinic is not blocked.
create or replace function public.recurso_con_reservas_no_borrar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.reservas r where r.recurso_id = old.id)
     and exists (select 1 from public.clinicas k where k.id = old.clinica_id) then
    raise exception 'update or delete on table "%" violates foreign key constraint: it still has reservations', tg_table_name using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.recurso_con_reservas_no_borrar() from public, anon, authenticated;
create trigger recursos_reservas_no_borrar before delete on public.recursos
  for each row execute function public.recurso_con_reservas_no_borrar();
create trigger profesionales_reservas_no_borrar before delete on public.profesionales
  for each row execute function public.recurso_con_reservas_no_borrar();

-- 11b. emergencia_identificar (live function from 2026-11-27_hospital_emergencias.sql, same body and grants) with two additions:
--   (1) conception.cirugia_rpc is set around the move of the cita, so the guard above lets a merge change paciente_id of a surgery cita;
--   (2) hospitalizations (estancias) of the provisional patient follow the merge BEFORE the provisional patient is deleted (estancias.paciente_id has no cascade);
--       if the destination patient is already admitted → PACIENTE_INGRESADO and the whole function rolls back.
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
    perform set_config('conception.cirugia_rpc', '1', true);                 -- (1) see 11b
    update public.citas c set paciente_id = p_paciente where c.id = p_cita and c.clinica_id = v_clinica;
    update public.emergencias e set paciente_id = p_paciente where e.cita_id = p_cita and e.clinica_id = v_clinica;
    perform set_config('conception.emergencia_mover', '', true);
    perform set_config('conception.cirugia_rpc', '', true);

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
      -- (2) hospitalizations follow the merge; the destination patient already admitted → PACIENTE_INGRESADO
      begin
        update public.estancias s set paciente_id = p_paciente where s.paciente_id = v_actual and s.clinica_id = v_clinica;
      exception when unique_violation then
        raise exception 'PACIENTE_INGRESADO';
      end;
      -- any other reference without a cascade makes this fail and the whole function rolls back (nothing is left half done)
      delete from public.pacientes x where x.id = v_actual and x.clinica_id = v_clinica and x.sin_identificar;
    end if;
  end if;
end;
$$;
revoke all on function public.emergencia_identificar(uuid, uuid, text, text) from public, anon;
grant execute on function public.emergencia_identificar(uuid, uuid, text, text) to authenticated;

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
  v_clinica := public.hospital_guardia('camas');
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
  v_clinica := public.hospital_guardia('camas');
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
  v_clinica := public.hospital_guardia('camas');
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
  v_clinica := public.hospital_guardia('camas');
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

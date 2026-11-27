-- PROPUESTA (NO APLICADA) · 2026-11-28 · Hospital, ajustes de insumos tras unir quirófanos y usuarios del hospital
--
-- Qué hace (solo redefine DOS funciones ya aplicadas con `create or replace`; misma firma, mismos atributos y mismos grants; nada más cambia)
--   1. atencion_corregir(p_cita): si la cita tiene una cirugía (fila en public.cirugias) se trata igual que una emergencia: NO se restaura
--      estado_previo. La cita sigue «Asistió» y la cirugía sigue «realizada». Hoy «Corregir» devolvería la cita a su estado anterior
--      (p. ej. «Confirmada») mientras la cirugía queda realizada, y la cita y la cirugía se contradirían.
--   2. atencion_confirmar(p_cita, p_lineas, p_sede): en la regla «un médico al que no hay usuario vinculado» solo cuentan los usuarios ACTIVOS
--      (q.activo). Un usuario desactivado ya no impide que otra persona con permiso de expedientes confirme las atenciones de ese médico.
--      El front ya ignora a los desactivados; esto alinea la base de datos con él.
--
-- Riesgos
--   * Requiere que existan public.cirugias (sí, aplicada con quirófanos) y perfiles.activo (sí, existe en producción).
--   * Si se aplica sobre una base sin esas tablas/columnas, la función se crea pero falla al ejecutarse (plpgsql no lo valida al crear).
--   * No toca datos ni tablas; solo cambia el cuerpo de las dos funciones. Las confirmaciones ya hechas no cambian.
--   * Una cirugía cuya atención se corrige conserva la cita «Asistió»; si se quiere otro estado se cambia a mano en la cita después.
--
-- Receta de prueba (en una transacción, con rollback; sustituya los ids por los de una cuenta de prueba hospital)
--   begin;
--     -- a) cirugía: confirmar la atención de una cita con fila en cirugias y corregirla
--     select public.atencion_confirmar('<cita_con_cirugia>', '[]'::jsonb, '<sede>');
--     select public.atencion_corregir('<cita_con_cirugia>');
--     select estado from public.citas where id = '<cita_con_cirugia>';                 -- debe seguir 'Asistió'
--     select estado from public.cirugias where cita_id = '<cita_con_cirugia>';         -- debe seguir 'realizada'
--     -- b) cita normal: corregir debe devolver el estado previo
--     select public.atencion_confirmar('<cita_normal>', '[]'::jsonb, '<sede>');
--     select public.atencion_corregir('<cita_normal>');
--     select estado from public.citas where id = '<cita_normal>';                      -- vuelve a su estado anterior
--     -- c) usuario desactivado: desactive al usuario vinculado al médico y confirme con otro usuario con permiso «expedientes»
--     update public.perfiles set activo = false where permisos ->> 'profesional_id' = '<profesional>';
--     select public.atencion_confirmar('<cita_del_profesional>', '[]'::jsonb, '<sede>');   -- ya no debe dar NO_AUTORIZADO
--   rollback;
--
-- Reversa: volver a ejecutar los dos `create or replace` del archivo supabase/sql/2026-11-28_hospital_insumos.sql
--   (atencion_confirmar y atencion_corregir) tal como están allí; no hay datos que restaurar.

create or replace function public.atencion_confirmar(p_cita uuid, p_lineas jsonb default '[]'::jsonb, p_sede uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clinica uuid := public.mi_clinica();
  v_cita public.citas%rowtype;
  v_perfil_nombre text;
  v_vinculo text;
  v_autorizado boolean;
  v_sede uuid;
  v_n int;
  v_ids uuid[];
  v_atencion uuid;
  v_hay numeric;
  v_desc numeric;
  v_falt numeric;
  v_mov uuid;
  v_costo numeric;
  v_linea uuid;
  v_hoy date := (now() at time zone 'America/Guatemala')::date;
  v_faltantes int := 0;
  v_salida jsonb := '[]'::jsonb;
  r record;
begin
  if v_uid is null or v_clinica is null or public.es_soporte() or public.clinica_vencida() then
    raise exception 'SIN_PERMISO';
  end if;
  if not exists (select 1 from public.clinicas c where c.id = v_clinica and c.especialidad = 'hospital') then
    raise exception 'NO_HOSPITAL';
  end if;
  if not public.inventario_habilitado() then raise exception 'SIN_INVENTARIO'; end if;  -- plan without inventory (always, even with no lines)

  -- 1. the cita, locked (serializes two confirmations of the same cita); another clinic's id looks exactly like a missing one
  select * into v_cita from public.citas c where c.id = p_cita and c.clinica_id = v_clinica for update;
  if not found then raise exception 'CITA_AJENA'; end if;

  -- 2. who may confirm
  select nullif(btrim(p.nombre), ''), p.permisos ->> 'profesional_id' into v_perfil_nombre, v_vinculo
    from public.perfiles p where p.user_id = v_uid;
  v_autorizado := public.es_admin()
    or (v_vinculo is not null and v_cita.profesional_id is not null and v_vinculo = v_cita.profesional_id::text)
    or ((v_cita.profesional_id is null
         or not exists (select 1 from public.perfiles q where q.clinica_id = v_clinica and q.activo and q.permisos ->> 'profesional_id' = v_cita.profesional_id::text))
        and public.tiene_permiso('expedientes'));
  if not v_autorizado then raise exception 'NO_AUTORIZADO'; end if;

  -- 3. state of the cita
  if v_cita.estado not in ('Pendiente', 'Confirmada', 'Asistió') then raise exception 'CITA_NO_VALIDA'; end if;
  if exists (select 1 from public.emergencias e where e.cita_id = v_cita.id and e.cerrado_at is null) then
    raise exception 'EMERGENCIA_ABIERTA'; -- finish the emergency first
  end if;
  if exists (select 1 from public.atenciones a where a.cita_id = v_cita.id) then raise exception 'YA_CONFIRMADA'; end if;

  -- 4. the lines (validated with regular expressions: no casts that could fail half way)
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) > 100 then raise exception 'DATOS_INVALIDOS'; end if;
  -- coalesce(..., false): an element without the keys must count as invalid, never as null
  select count(*) into v_n from jsonb_array_elements(p_lineas) x
   where not coalesce(jsonb_typeof(x) = 'object'
     and (x ->> 'producto_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and (x ->> 'cantidad') ~ '^[0-9]{1,7}(\.[0-9]{1,3})?$', false)
      or (case when (x ->> 'cantidad') ~ '^[0-9]{1,7}(\.[0-9]{1,3})?$' then (x ->> 'cantidad')::numeric <= 0 else false end);
  if v_n > 0 then raise exception 'DATOS_INVALIDOS'; end if;
  select array_agg(distinct (x ->> 'producto_id')::uuid) into v_ids from jsonb_array_elements(p_lineas) x;
  if v_ids is not null then
    if (select count(*) from public.productos p where p.id = any (v_ids) and p.clinica_id = v_clinica) <> array_length(v_ids, 1) then
      raise exception 'PRODUCTO_AJENO';
    end if;
    if exists (select 1 from public.productos p where p.id = any (v_ids) and not p.activo) then raise exception 'PRODUCTO_INACTIVO'; end if;
  end if;

  -- 5. the location the stock comes from
  v_sede := coalesce(p_sede, v_cita.sede_id);
  if v_sede is null and (select count(*) from public.sedes s where s.clinica_id = v_clinica and s.activa) = 1 then
    select s.id into v_sede from public.sedes s where s.clinica_id = v_clinica and s.activa;
  end if;
  if v_sede is null then raise exception 'SIN_SEDE'; end if;
  if not exists (select 1 from public.sedes s where s.id = v_sede and s.clinica_id = v_clinica and s.activa) then raise exception 'SEDE_AJENA'; end if;

  -- 6. the confirmation
  insert into public.atenciones (clinica_id, cita_id, paciente_id, departamento_id, profesional_id, sede_id, estado_previo, confirmada_por, confirmada_nombre)
  values (v_clinica, v_cita.id, v_cita.paciente_id, v_cita.departamento_id, v_cita.profesional_id, v_sede, v_cita.estado, v_uid, v_perfil_nombre)
  returning id into v_atencion;

  -- 7. each product in a fixed order (producto_id): lock the stock row, take what exists, record the rest as pending
  for r in
    select (x ->> 'producto_id')::uuid as pid, sum((x ->> 'cantidad')::numeric) as cant
      from jsonb_array_elements(p_lineas) x group by 1 order by 1
  loop
    select e.cantidad into v_hay from public.existencias e where e.sede_id = v_sede and e.producto_id = r.pid for update;
    v_hay := coalesce(v_hay, 0);                 -- no stock row in that location = nothing there
    v_desc := least(v_hay, r.cant);
    v_falt := r.cant - v_desc;
    v_mov := null;
    if v_desc > 0 then
      insert into public.inventario_movimientos (clinica_id, sede_id, producto_id, tipo, delta, paciente_id, cita_id, notas, fecha, creado_por)
      values (v_clinica, v_sede, r.pid, 'uso', -v_desc, v_cita.paciente_id, v_cita.id, 'Atención confirmada', v_hoy, v_uid)
      returning id into v_mov;                   -- inv_aplicar applies it to existencias (same locked row)
    end if;
    select p.costo into v_costo from public.productos p where p.id = r.pid;
    insert into public.atencion_insumos (clinica_id, atencion_id, producto_id, cantidad, descontada, faltante, costo_unitario, movimiento_ids)
    values (v_clinica, v_atencion, r.pid, r.cant, v_desc, v_falt, v_costo, case when v_mov is null then '{}'::uuid[] else array[v_mov] end)
    returning id into v_linea;
    if v_falt > 0 then
      v_faltantes := v_faltantes + 1;
      insert into public.pendientes_bodega (clinica_id, atencion_insumo_id, cita_id, paciente_id, producto_id, departamento_id, sede_id, cantidad, cantidad_original, creado_por, creado_nombre)
      values (v_clinica, v_linea, v_cita.id, v_cita.paciente_id, r.pid, v_cita.departamento_id, v_sede, v_falt, v_falt, v_uid, v_perfil_nombre);
    end if;
    v_salida := v_salida || jsonb_build_object('producto_id', r.pid, 'cantidad', r.cant, 'descontada', v_desc, 'faltante', v_falt);
  end loop;

  update public.citas set estado = 'Asistió' where id = v_cita.id;
  return jsonb_build_object('atencion_id', v_atencion, 'sede_id', v_sede, 'faltantes', v_faltantes, 'lineas', v_salida);
end;
$$;
revoke all on function public.atencion_confirmar(uuid, jsonb, uuid) from public, anon;
grant execute on function public.atencion_confirmar(uuid, jsonb, uuid) to authenticated;

create or replace function public.atencion_corregir(p_cita uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clinica uuid := public.mi_clinica();
  v_cita public.citas%rowtype;
  v_atencion public.atenciones%rowtype;
  v_devueltos int := 0;
  v_quien text;
  mv record;
  r record;
begin
  if v_uid is null or v_clinica is null or public.es_soporte() or public.clinica_vencida() then raise exception 'SIN_PERMISO'; end if;
  if not exists (select 1 from public.clinicas c where c.id = v_clinica and c.especialidad = 'hospital') then raise exception 'NO_HOSPITAL'; end if;
  if not public.inventario_habilitado() then raise exception 'SIN_INVENTARIO'; end if;
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;

  select * into v_cita from public.citas c where c.id = p_cita and c.clinica_id = v_clinica for update;
  if not found then raise exception 'CITA_AJENA'; end if;
  select * into v_atencion from public.atenciones a where a.cita_id = v_cita.id and a.clinica_id = v_clinica for update;
  if not found then raise exception 'NO_CONFIRMADA'; end if;

  select coalesce(nullif(trim(p.nombre), ''), p.email) into v_quien from public.perfiles p where p.user_id = v_uid;
  perform set_config('conception.atencion_rpc', 'on', true);   -- the triggers atencion_mov_borrado / atenciones_estado_guard stand aside (this transaction only)

  -- movements go back in a fixed order (producto, then id); deleting a 'uso' returns its quantity through inv_aplicar.
  -- Each one is also written to inventario_eliminados exactly as inventario_eliminar() does for a movement (tipo 'movimiento').
  for r in
    select i.producto_id, mid as movimiento
      from public.atencion_insumos i, unnest(i.movimiento_ids) as mid
     where i.atencion_id = v_atencion.id and i.clinica_id = v_clinica
     order by i.producto_id, mid
  loop
    select x.*, p.nombre as producto, p.unidad, s.nombre as sede into mv
      from public.inventario_movimientos x join public.productos p on p.id = x.producto_id left join public.sedes s on s.id = x.sede_id
     where x.id = r.movimiento and x.clinica_id = v_clinica and x.cita_id = v_cita.id and x.tipo = 'uso';
    if mv.id is not null then
      insert into public.inventario_eliminados (clinica_id, tipo, nombre, detalle, motivo, eliminado_por, eliminado_por_nombre, datos)
      values (v_clinica, 'movimiento', mv.producto,
              'Uso en paciente · ' || trim(to_char(abs(mv.delta), 'FM999999990.##')) || coalesce(' ' || mv.unidad, '') || coalesce(' · ' || mv.sede, '') || ' · ' || to_char(mv.fecha, 'DD/MM/YYYY'),
              'Corrección de atención', v_uid, v_quien, (select to_jsonb(y) from public.inventario_movimientos y where y.id = mv.id));
      delete from public.inventario_movimientos where id = mv.id;
      v_devueltos := v_devueltos + 1;
    end if;
  end loop;

  -- an emergency or a surgery keeps the estado its own module set (the cita stays 'Asistió'); any other cita goes back to what it was
  if not exists (select 1 from public.emergencias e where e.cita_id = v_cita.id)
     and not exists (select 1 from public.cirugias q where q.cita_id = v_cita.id)
     and v_atencion.estado_previo is not null then
    update public.citas set estado = v_atencion.estado_previo where id = v_cita.id;
  end if;
  delete from public.atenciones where id = v_atencion.id;   -- cascades to its lines and pending rows
  perform set_config('conception.atencion_rpc', 'off', true);
  return jsonb_build_object('devueltos', v_devueltos);
end;
$$;
revoke all on function public.atencion_corregir(uuid) from public, anon;
grant execute on function public.atencion_corregir(uuid) to authenticated;

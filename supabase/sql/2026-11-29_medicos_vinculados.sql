-- Médicos vinculados (varios por usuario) — PROPUESTA, NO APLICADA
-- Fecha: 2026-11-29 · Producto: Conception Health (hospital) · Pide: la dueña (Configuración → Usuarios y permisos → «Médicos vinculados (opcional)»)
--
-- PROPÓSITO
--   Hoy un usuario del personal se vincula a UN médico (perfiles.permisos.profesional_id, string uuid). Se pasa a VARIOS: nueva llave
--   perfiles.permisos.profesional_ids = arreglo jsonb de uuid (string), 0–100, sin repetidos. La llave vieja profesional_id se sigue LEYENDO (filas
--   existentes) pero ya no se escribe: al guardar, un valor viejo se pliega dentro del arreglo y la llave vieja desaparece.
--
-- CAMBIOS (todo en este archivo, sin begin/commit: la herramienta lo envuelve en una transacción)
--   1. public.perfil_profesionales(jsonb) returns text[]  — unión distinta de profesional_ids (solo si es arreglo, solo elementos string) y del
--      profesional_id viejo (string no vacío). Nunca lanza error: entrada rara → '{}'. immutable, search_path = public. EXECUTE: authenticated (sin public/anon).
--   2. create or replace perfil_admin_actualizar — igual al vivo salvo: acepta profesional_ids (arreglo de ≤ 100 strings, cada uno uuid válido de un
--      profesional de la clínica de quien llama; si no → DATOS_INVALIDOS / REFERENCIA_AJENA como hoy; sin repetidos), sigue aceptando profesional_id
--      (se pliega al arreglo), guarda profesional_ids solo si queda con elementos y NUNCA guarda profesional_id. Misma firma, atributos y permisos.
--   3. create or replace atencion_confirmar — igual al VIVO (leído con pg_get_functiondef el 2026-11-27) salvo las dos comparaciones del vínculo:
--      «quien llama está vinculado» = cita.profesional_id::text = any(perfil_profesionales(permisos de quien llama)); «nadie activo vinculado a ese
--      médico» = not exists (perfil activo de la clínica con cita.profesional_id::text = any(perfil_profesionales(q.permisos))).
--   4. El trigger hospital_crear_perfil_usuario NO cambia (copia permisos tal cual); la función de borde usuarios-hospital valida.
--
-- RIESGOS
--   * atencion_confirmar es SECURITY DEFINER y decide quién puede descontar inventario: se reemplaza el cuerpo entero. Comparar con el vivo (pre-check B)
--     justo antes de aplicar; si cambió, rehacer el reemplazo sobre el vivo. Los perfiles actuales solo tienen profesional_id: el resultado es idéntico.
--   * perfil_profesionales se evalúa por cada perfil de la clínica en el not exists (decenas de filas): costo despreciable.
--   * Orden de despliegue: este SQL → función de borde usuarios-hospital → front (el front funciona también ANTES de este SQL: envía las dos llaves).
--
-- PRE-CHECKS (solo lectura)
--   A) select count(*) filter (where permisos ? 'profesional_id') as con_vinculo_viejo, count(*) filter (where permisos ? 'profesional_ids') as con_arreglo from public.perfiles;  -- arreglo: 0
--   B) select pg_get_functiondef('public.atencion_confirmar'::regproc), pg_get_functiondef('public.perfil_admin_actualizar'::regproc);  -- iguales a los del bloque ROLLBACK
--   C) select to_regprocedure('public.perfil_profesionales(jsonb)');  -- null
--
-- PRUEBA DENTRO DE UNA TRANSACCIÓN (con rollback; nada queda aplicado)
--   begin;
--     -- pegar TODO el cuerpo ejecutable (desde «create or replace function public.perfil_profesionales» hasta el último «revoke/grant»)
--     select public.perfil_profesionales('{"profesional_ids":["a","b","a"],"profesional_id":"c"}');  -- {a,b,c}
--     select public.perfil_profesionales('{"profesional_ids":"x"}'), public.perfil_profesionales('[]'), public.perfil_profesionales(null), public.perfil_profesionales('{"profesional_ids":[1,{"a":1}]}');  -- '{}' ×4
--     -- como dueño (set_config('request.jwt.claims', ...); set local role authenticated):
--     --   perfil_admin_actualizar(<usuario>, null, null, '{"profesional_ids":[<prof1>,<prof2>,<prof1>],"registrar":true}')  → permisos.profesional_ids = 2 elementos
--     --   '{"profesional_ids":[<prof de OTRA clínica>]}' → REFERENCIA_AJENA;  '{"profesional_ids":"x"}' / '{"profesional_ids":["no-uuid"]}' / 101 elementos / [1] → DATOS_INVALIDOS
--     --   '{"profesional_id":"<prof1>"}' → permisos = {"profesional_ids":["<prof1>"]} (sin profesional_id);  '{"profesional_ids":[]}' → sin llave
--     -- atencion_confirmar: usuario con arreglo [prof1,prof2] confirma cita de prof1 y de prof2 → ok; cita de prof3 con usuario vinculado (activo) → NO_AUTORIZADO;
--     --   desactivar a ese usuario → cita de prof3 ok para quien tiene expedientes; usuario con solo profesional_id viejo → ok en su cita.
--   rollback;
--
-- ROLLBACK: ver el bloque comentado al final (restaura los cuerpos vivos de las dos funciones y borra el auxiliar).

-- ───────────────────────── EJECUTABLE: primera línea de abajo ─────────────────────────
create or replace function public.perfil_profesionales(p jsonb) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct v), '{}'::text[]) from (
    select e #>> '{}' as v
      from jsonb_array_elements(case when jsonb_typeof(p) = 'object' and jsonb_typeof(p -> 'profesional_ids') = 'array' then p -> 'profesional_ids' else '[]'::jsonb end) e
     where jsonb_typeof(e) = 'string' and e #>> '{}' <> ''
    union
    select p ->> 'profesional_id'
     where jsonb_typeof(p) = 'object' and jsonb_typeof(p -> 'profesional_id') = 'string' and p ->> 'profesional_id' <> ''
  ) s
$$;
revoke all on function public.perfil_profesionales(jsonb) from public, anon;
grant execute on function public.perfil_profesionales(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.perfil_admin_actualizar(p_user uuid, p_nombre text DEFAULT NULL::text, p_puesto text DEFAULT NULL::text, p_permisos jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cid uuid := public.mi_clinica();
  objetivo record; nom text; pst text; limpio jsonb := '{}'::jsonb; r record; e record; prof text; ids text[] := '{}';
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
        -- legacy single doctor: folded into profesional_ids, never stored under this key
        if jsonb_typeof(r.value) <> 'string' then raise exception 'DATOS_INVALIDOS'; end if;
        prof := r.value #>> '{}';
        if prof <> '' then ids := ids || prof; end if;
      elsif r.key = 'profesional_ids' then
        if jsonb_typeof(r.value) <> 'array' or jsonb_array_length(r.value) > 100 then raise exception 'DATOS_INVALIDOS'; end if;
        for e in select value from jsonb_array_elements(r.value) loop
          if jsonb_typeof(e.value) <> 'string' then raise exception 'DATOS_INVALIDOS'; end if;
          ids := ids || (e.value #>> '{}');
        end loop;
      elsif r.key = any (permitidas) then
        if jsonb_typeof(r.value) <> 'boolean' then raise exception 'DATOS_INVALIDOS'; end if;
        limpio := limpio || jsonb_build_object(r.key, r.value);
      end if;
    end loop;
    -- profesional_ids: every id a valid uuid of a doctor of the caller's clinic; duplicates removed; stored only when non-empty
    if cardinality(ids) > 0 then
      select coalesce(array_agg(distinct lower(x)), '{}') into ids from unnest(ids) x;
      if cardinality(ids) > 100 then raise exception 'DATOS_INVALIDOS'; end if;
      foreach prof in array ids loop
        begin
          perform 1 from public.profesionales where id = prof::uuid and clinica_id = cid;
        exception when others then raise exception 'DATOS_INVALIDOS';
        end;
        if not found then raise exception 'REFERENCIA_AJENA'; end if;
      end loop;
      limpio := limpio || jsonb_build_object('profesional_ids', to_jsonb(ids));
    end if;
  end if;

  update public.perfiles set
    nombre = coalesce(nom, nombre),
    puesto = case when p_puesto is null then puesto else pst end,
    permisos = case when p_permisos is null then permisos else limpio end
  where user_id = p_user and clinica_id = cid;
end $function$;

CREATE OR REPLACE FUNCTION public.atencion_confirmar(p_cita uuid, p_lineas jsonb DEFAULT '[]'::jsonb, p_sede uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_clinica uuid := public.mi_clinica();
  v_cita public.citas%rowtype;
  v_perfil_nombre text;
  v_permisos jsonb;
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
  select nullif(btrim(p.nombre), ''), p.permisos into v_perfil_nombre, v_permisos
    from public.perfiles p where p.user_id = v_uid;
  v_autorizado := public.es_admin()
    or (v_cita.profesional_id is not null and v_cita.profesional_id::text = any (public.perfil_profesionales(v_permisos)))
    or ((v_cita.profesional_id is null
         or not exists (select 1 from public.perfiles q where q.clinica_id = v_clinica and q.activo and v_cita.profesional_id::text = any (public.perfil_profesionales(q.permisos))))
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
$function$;
-- (mismos permisos que hoy: create or replace conserva los grants existentes de ambas funciones)
-- ───────────────────────── EJECUTABLE: última línea de arriba ─────────────────────────

-- ROLLBACK (pegar sin los «-- » para deshacer): cuerpos VIVOS al 2026-11-27 + borrar el auxiliar
-- CREATE OR REPLACE FUNCTION public.perfil_admin_actualizar(p_user uuid, p_nombre text DEFAULT NULL::text, p_puesto text DEFAULT NULL::text, p_permisos jsonb DEFAULT NULL::jsonb)
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- declare
--   cid uuid := public.mi_clinica();
--   objetivo record; nom text; pst text; limpio jsonb := '{}'::jsonb; r record; prof text;
--   permitidas constant text[] := array['expedientes','finanzas','inventario','costos','compras','emergencias','exportar','eliminar_citas','eliminar_inventario','eliminar',
--                                       'configuracion','quirofano','camas','registrar','ver_todos_pacientes'];
-- begin
--   if auth.uid() is null or cid is null or not public.es_admin() or public.es_soporte() or public.clinica_vencida_de(cid) is true then raise exception 'SIN_PERMISO'; end if;
--   select user_id, clinica_id, rol into objetivo from public.perfiles where user_id = p_user;
--   if not found or objetivo.clinica_id <> cid or objetivo.user_id = auth.uid() or objetivo.rol in ('dueno', 'soporte') then raise exception 'SIN_PERMISO'; end if;
--
--   if p_nombre is not null then
--     nom := btrim(p_nombre);
--     if char_length(nom) < 2 or char_length(nom) > 80 then raise exception 'DATOS_INVALIDOS'; end if;
--   end if;
--   if p_puesto is not null then
--     pst := nullif(btrim(p_puesto), '');
--     if pst is not null and char_length(pst) > 40 then raise exception 'DATOS_INVALIDOS'; end if;
--   end if;
--   if p_permisos is not null then
--     if jsonb_typeof(p_permisos) <> 'object' then raise exception 'DATOS_INVALIDOS'; end if;
--     for r in select key, value from jsonb_each(p_permisos) loop
--       if r.key = 'profesional_id' then
--         if jsonb_typeof(r.value) <> 'string' then raise exception 'DATOS_INVALIDOS'; end if;
--         prof := r.value #>> '{}';
--         if prof <> '' then
--           begin
--             perform 1 from public.profesionales where id = prof::uuid and clinica_id = cid;
--           exception when others then raise exception 'DATOS_INVALIDOS';
--           end;
--           if not found then raise exception 'REFERENCIA_AJENA'; end if;
--           limpio := limpio || jsonb_build_object('profesional_id', prof);
--         end if;
--       elsif r.key = any (permitidas) then
--         if jsonb_typeof(r.value) <> 'boolean' then raise exception 'DATOS_INVALIDOS'; end if;
--         limpio := limpio || jsonb_build_object(r.key, r.value);
--       end if;
--     end loop;
--   end if;
--
--   update public.perfiles set
--     nombre = coalesce(nom, nombre),
--     puesto = case when p_puesto is null then puesto else pst end,
--     permisos = case when p_permisos is null then permisos else limpio end
--   where user_id = p_user and clinica_id = cid;
-- end $function$;
--
-- CREATE OR REPLACE FUNCTION public.atencion_confirmar(p_cita uuid, p_lineas jsonb DEFAULT '[]'::jsonb, p_sede uuid DEFAULT NULL::uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- declare
--   v_uid uuid := auth.uid();
--   v_clinica uuid := public.mi_clinica();
--   v_cita public.citas%rowtype;
--   v_perfil_nombre text;
--   v_vinculo text;
--   v_autorizado boolean;
--   v_sede uuid;
--   v_n int;
--   v_ids uuid[];
--   v_atencion uuid;
--   v_hay numeric;
--   v_desc numeric;
--   v_falt numeric;
--   v_mov uuid;
--   v_costo numeric;
--   v_linea uuid;
--   v_hoy date := (now() at time zone 'America/Guatemala')::date;
--   v_faltantes int := 0;
--   v_salida jsonb := '[]'::jsonb;
--   r record;
-- begin
--   if v_uid is null or v_clinica is null or public.es_soporte() or public.clinica_vencida() then
--     raise exception 'SIN_PERMISO';
--   end if;
--   if not exists (select 1 from public.clinicas c where c.id = v_clinica and c.especialidad = 'hospital') then
--     raise exception 'NO_HOSPITAL';
--   end if;
--   if not public.inventario_habilitado() then raise exception 'SIN_INVENTARIO'; end if;  -- plan without inventory (always, even with no lines)
--
--   -- 1. the cita, locked (serializes two confirmations of the same cita); another clinic's id looks exactly like a missing one
--   select * into v_cita from public.citas c where c.id = p_cita and c.clinica_id = v_clinica for update;
--   if not found then raise exception 'CITA_AJENA'; end if;
--
--   -- 2. who may confirm
--   select nullif(btrim(p.nombre), ''), p.permisos ->> 'profesional_id' into v_perfil_nombre, v_vinculo
--     from public.perfiles p where p.user_id = v_uid;
--   v_autorizado := public.es_admin()
--     or (v_vinculo is not null and v_cita.profesional_id is not null and v_vinculo = v_cita.profesional_id::text)
--     or ((v_cita.profesional_id is null
--          or not exists (select 1 from public.perfiles q where q.clinica_id = v_clinica and q.activo and q.permisos ->> 'profesional_id' = v_cita.profesional_id::text))
--         and public.tiene_permiso('expedientes'));
--   if not v_autorizado then raise exception 'NO_AUTORIZADO'; end if;
--
--   -- 3. state of the cita
--   if v_cita.estado not in ('Pendiente', 'Confirmada', 'Asistió') then raise exception 'CITA_NO_VALIDA'; end if;
--   if exists (select 1 from public.emergencias e where e.cita_id = v_cita.id and e.cerrado_at is null) then
--     raise exception 'EMERGENCIA_ABIERTA'; -- finish the emergency first
--   end if;
--   if exists (select 1 from public.atenciones a where a.cita_id = v_cita.id) then raise exception 'YA_CONFIRMADA'; end if;
--
--   -- 4. the lines (validated with regular expressions: no casts that could fail half way)
--   if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) > 100 then raise exception 'DATOS_INVALIDOS'; end if;
--   -- coalesce(..., false): an element without the keys must count as invalid, never as null
--   select count(*) into v_n from jsonb_array_elements(p_lineas) x
--    where not coalesce(jsonb_typeof(x) = 'object'
--      and (x ->> 'producto_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--      and (x ->> 'cantidad') ~ '^[0-9]{1,7}(\.[0-9]{1,3})?$', false)
--       or (case when (x ->> 'cantidad') ~ '^[0-9]{1,7}(\.[0-9]{1,3})?$' then (x ->> 'cantidad')::numeric <= 0 else false end);
--   if v_n > 0 then raise exception 'DATOS_INVALIDOS'; end if;
--   select array_agg(distinct (x ->> 'producto_id')::uuid) into v_ids from jsonb_array_elements(p_lineas) x;
--   if v_ids is not null then
--     if (select count(*) from public.productos p where p.id = any (v_ids) and p.clinica_id = v_clinica) <> array_length(v_ids, 1) then
--       raise exception 'PRODUCTO_AJENO';
--     end if;
--     if exists (select 1 from public.productos p where p.id = any (v_ids) and not p.activo) then raise exception 'PRODUCTO_INACTIVO'; end if;
--   end if;
--
--   -- 5. the location the stock comes from
--   v_sede := coalesce(p_sede, v_cita.sede_id);
--   if v_sede is null and (select count(*) from public.sedes s where s.clinica_id = v_clinica and s.activa) = 1 then
--     select s.id into v_sede from public.sedes s where s.clinica_id = v_clinica and s.activa;
--   end if;
--   if v_sede is null then raise exception 'SIN_SEDE'; end if;
--   if not exists (select 1 from public.sedes s where s.id = v_sede and s.clinica_id = v_clinica and s.activa) then raise exception 'SEDE_AJENA'; end if;
--
--   -- 6. the confirmation
--   insert into public.atenciones (clinica_id, cita_id, paciente_id, departamento_id, profesional_id, sede_id, estado_previo, confirmada_por, confirmada_nombre)
--   values (v_clinica, v_cita.id, v_cita.paciente_id, v_cita.departamento_id, v_cita.profesional_id, v_sede, v_cita.estado, v_uid, v_perfil_nombre)
--   returning id into v_atencion;
--
--   -- 7. each product in a fixed order (producto_id): lock the stock row, take what exists, record the rest as pending
--   for r in
--     select (x ->> 'producto_id')::uuid as pid, sum((x ->> 'cantidad')::numeric) as cant
--       from jsonb_array_elements(p_lineas) x group by 1 order by 1
--   loop
--     select e.cantidad into v_hay from public.existencias e where e.sede_id = v_sede and e.producto_id = r.pid for update;
--     v_hay := coalesce(v_hay, 0);                 -- no stock row in that location = nothing there
--     v_desc := least(v_hay, r.cant);
--     v_falt := r.cant - v_desc;
--     v_mov := null;
--     if v_desc > 0 then
--       insert into public.inventario_movimientos (clinica_id, sede_id, producto_id, tipo, delta, paciente_id, cita_id, notas, fecha, creado_por)
--       values (v_clinica, v_sede, r.pid, 'uso', -v_desc, v_cita.paciente_id, v_cita.id, 'Atención confirmada', v_hoy, v_uid)
--       returning id into v_mov;                   -- inv_aplicar applies it to existencias (same locked row)
--     end if;
--     select p.costo into v_costo from public.productos p where p.id = r.pid;
--     insert into public.atencion_insumos (clinica_id, atencion_id, producto_id, cantidad, descontada, faltante, costo_unitario, movimiento_ids)
--     values (v_clinica, v_atencion, r.pid, r.cant, v_desc, v_falt, v_costo, case when v_mov is null then '{}'::uuid[] else array[v_mov] end)
--     returning id into v_linea;
--     if v_falt > 0 then
--       v_faltantes := v_faltantes + 1;
--       insert into public.pendientes_bodega (clinica_id, atencion_insumo_id, cita_id, paciente_id, producto_id, departamento_id, sede_id, cantidad, cantidad_original, creado_por, creado_nombre)
--       values (v_clinica, v_linea, v_cita.id, v_cita.paciente_id, r.pid, v_cita.departamento_id, v_sede, v_falt, v_falt, v_uid, v_perfil_nombre);
--     end if;
--     v_salida := v_salida || jsonb_build_object('producto_id', r.pid, 'cantidad', r.cant, 'descontada', v_desc, 'faltante', v_falt);
--   end loop;
--
--   update public.citas set estado = 'Asistió' where id = v_cita.id;
--   return jsonb_build_object('atencion_id', v_atencion, 'sede_id', v_sede, 'faltantes', v_faltantes, 'lineas', v_salida);
-- end;
-- $function$;
--
-- drop function if exists public.perfil_profesionales(jsonb);
--

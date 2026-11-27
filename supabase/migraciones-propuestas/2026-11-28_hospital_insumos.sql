-- PROPUESTA (NO APLICADA) · 2026-11-28 · Hospital, etapa 4: insumos por especialidad, «Confirmar atención» y Pendientes de bodega
--
-- Qué hace (solo cuentas hospital: clinicas.especialidad = 'hospital'; las clínicas normales no cambian en nada)
--   1. UNA sola bodega: cada producto puede llevar una etiqueta opcional de especialidad (productos.departamento_id). Sin etiqueta = general.
--   2. Los insumos se descuentan SOLO cuando el médico asignado (o la dueña) confirma la atención: RPC atencion_confirmar(). Descuenta lo que
--      hay en la sede de la cita, marca la cita «Asistió» y deja registrado quién, cuándo y qué líneas (tablas atenciones + atencion_insumos).
--   3. Si falta existencia NO se bloquea: se descuenta lo que haya (nunca queda negativo: existencias.cantidad >= 0 y inv_aplicar lanza
--      SIN_EXISTENCIA) y el faltante entra a «Pendientes de bodega» (pendientes_bodega). Bodega lo marca «Resuelto» con pendiente_resolver(),
--      opcionalmente descontando lo que ya llegó.
--   4. «Corregir» (solo la dueña): atencion_corregir() devuelve el stock, borra la confirmación y deja la cita como estaba para rehacerla.
--      Cada movimiento devuelto queda en inventario_eliminados (tipo 'movimiento', motivo «Corrección de atención»), como «Quitar» hoy.
--   5. Finanzas por especialidad: RPC de solo lectura insumos_por_especialidad() (costo de insumos consumidos por especialidad, sede y día).
--      Los ingresos se calculan en el front con los abonos y cobros que ya existen.
--
-- Hechos del esquema vivo en los que se apoya (VERIFICADOS en producción el 2026-11-27 por consulta de catálogo, sin leer filas)
--   * Inventario: productos(id, clinica_id, nombre, categoria, unidad, stock_minimo, costo, activo, …), existencias(sede_id, producto_id, cantidad
--     CHECK >= 0, PK sede+producto), inventario_movimientos(tipo ∈ entrada|uso|salida|ajuste|traslado; uso exige delta < 0 y paciente_id).
--     El trigger inv_aplicar (AFTER INSERT OR DELETE en inventario_movimientos, SECURITY DEFINER) aplica el delta a existencias con
--     SELECT … FOR UPDATE y lanza SIN_EXISTENCIA si quedara negativo. Borrar un movimiento devuelve la cantidad (así ya funciona «Quitar» y cita_eliminar).
--   * Kit por defecto de un servicio: YA EXISTE. paquetes(servicio_id → servicios) + paquete_items(producto_id, cantidad), con la pestaña
--     Inventario → Paquetes. Este SQL NO crea otro; el front usa los paquetes ACTIVOS cuyo servicio_id = citas.servicio_id.
--   * CUÁNDO se descuenta hoy: NINGÚN trigger de citas descuenta stock (los triggers de citas son citas_hospital_ref, citas_quien_agendo y
--     sede_misma_clinica). Hoy el stock solo baja a mano: «Descargar producto» / «Usar paquete» en el expediente, o una salida/ajuste en Inventario.
--     Para cuentas hospital el front oculta «Descargar producto», «Usar paquete» y «Quitar» de los movimientos de una confirmación (la bodega
--     sigue con sus entradas, ajustes y bajas); el servidor no los prohíbe.
--   * citas.estado CHECK ∈ ('Pendiente','Confirmada','Asistió','No asistió','Reagendada','Cancelada'); «atendida» = 'Asistió'.
--     emergencia_estado() ya pone 'Asistió' al cerrar una emergencia. cita_eliminar() borra los movimientos de la cita (devuelve stock) y la cita;
--     las tablas nuevas cuelgan de citas con ON DELETE CASCADE. inventario_eliminar() escribe una fila en inventario_eliminados por movimiento
--     (clinica_id, tipo, nombre, detalle, motivo, eliminado_por, eliminado_por_nombre, datos): atencion_corregir() la imita.
--   * emergencia_identificar() (unir con un paciente existente) mueve la cita (citas.paciente_id) ANTES de borrar al provisional: el trigger
--     citas_paciente_insumos hace que la confirmación y sus pendientes sigan a la cita.
--   * Cobros: cobros(cita_id, precio, descuento, pagado, fecha) y abonos(cobro_id, fecha, monto): Finanzas ya suma ingresos por abono.
--   * Funciones auxiliares (SECURITY DEFINER, search_path = public): mi_clinica(), es_admin() (rol = 'dueno'), es_soporte(), clinica_vencida(),
--     tiene_permiso(text) (llave ausente = false), inventario_habilitado() (plan Max/Ultra o prueba). perfiles.permisos solo lo cambia la dueña.
--
-- QUIÉN CONFIRMA (regla en el servidor, atencion_confirmar)
--   Se rechaza siempre: sin sesión, sin clínica, sesión de soporte, cuenta vencida, clínica que no es hospital, plan sin inventario (SIN_INVENTARIO,
--   incluso sin líneas), cita cancelada / reagendada / sin asistencia, emergencia aún abierta.
--   Puede confirmar la atención de una cita quien:
--     (a) es la dueña (es_admin()), O
--     (b) tiene perfiles.permisos->>'profesional_id' igual al profesional_id de la cita (el médico asignado), O
--     (c) la cita no tiene profesional_id, o NINGÚN perfil de la clínica está vinculado a ese profesional, Y quien llama tiene el permiso
--         'expedientes' = true (llave ausente = false). Sirve mientras los usuarios no están vinculados a sus profesionales (otra rama).
--   Si el profesional de la cita SÍ tiene un usuario vinculado, solo ese usuario (o la dueña) puede. Corregir: solo la dueña.
--   Resolver pendientes de bodega: dueña o permiso 'inventario'. Finanzas por especialidad: permisos 'finanzas' y 'costos' (la dueña los tiene).
--
-- Cómo evita el doble descuento y el doble gasto
--   * Una cita se confirma UNA vez: atenciones.cita_id UNIQUE + la cita se bloquea (FOR UPDATE) antes de revisar; la segunda llamada recibe YA_CONFIRMADA.
--   * Orden de bloqueo de todas las RPC: cita → existencias (por producto_id) → fila de pendiente. Dos confirmaciones que piden el mismo producto
--     leen la cantidad DESPUÉS del bloqueo; el trigger inv_aplicar vuelve a bloquear la misma fila.
--   * Un descuento a mano previo de la misma cita no se cruza en el servidor: el front lo avisa en la ventana de confirmación.
--   * Una cita confirmada no puede salir de 'Asistió' con un UPDATE normal (trigger citas_atencion_guard, solo afecta citas CON confirmación):
--     la dueña usa «Corregir». Consecuencia: reabrir una emergencia ya confirmada exige corregir primero.
--   * Borrar a mano un movimiento de una confirmación (trigger atencion_mov_borrado) resta de atencion_insumos.descontada y lo quita de
--     movimiento_ids, para que el costo por especialidad no cuente lo que ya no salió.
--
-- RIESGOS (revisar ANTES de aplicar)
--   * Cambia lo existente solo en: productos (columna nueva NULLABLE departamento_id + 1 trigger) y 2 triggers nuevos sobre citas
--     (citas_paciente_insumos AFTER UPDATE OF paciente_id; citas_atencion_guard BEFORE UPDATE OF estado, ambos con WHEN) y 1 sobre
--     inventario_movimientos (atencion_mov_borrado AFTER DELETE, WHEN tipo='uso' y cita_id no nulo). Ninguna función, política o trigger existente cambia.
--     Otras ramas que agreguen triggers sobre citas (p. ej. cirugía: citas_cirugia_sync AFTER UPDATE OF estado, citas_cirugia_guardia BEFORE UPDATE OF
--     fecha, hora, duracion, profesional_id, tipo, paciente_id) conviven: los míos no escriben en esas columnas, salvo que citas_paciente_insumos
--     actúa DESPUÉS de un cambio de paciente_id y solo toca las tablas nuevas.
--   * ALTER TABLE ADD COLUMN nullable sin default es cambio de metadatos (no reescribe la tabla).
--   * Tablas nuevas: atenciones, atencion_insumos, pendientes_bodega. RLS activo; los clientes SOLO LEEN. Nada de insert/update/delete directo.
--     atencion_insumos.costo_unitario NO es legible por los clientes (privilegio por columna): el costo solo sale por insumos_por_especialidad().
--     (Consecuencia: en el front se piden las columnas por nombre, nunca select *.) Los paciente_id de las tablas nuevas son ON DELETE CASCADE (se probó
--     NO ACTION y bloquea el borrado de cualquier paciente con confirmaciones): borrar un paciente ya borraba sus citas y, por ellas, estas filas; los
--     movimientos de inventario del paciente se conservan con paciente_id nulo (comportamiento existente).
--   * Las RPC insertan en inventario_movimientos (tipo 'uso', con cita_id y paciente_id) como el dueño de la función; la política mov_crear no aplica.
--   * La hora «de hoy» de los movimientos y los cortes por día usan America/Guatemala (UTC-6 todo el año).
--   * Corregir BORRA los movimientos 'uso' (con su fila en inventario_eliminados) en vez de compensarlos; la dueña puede preferir ajustes positivos.
--   * Si el producto tiene una confirmación, no se puede ELIMINAR (llave foránea; el mensaje existente dice que lo desactive). Un producto inactivo
--     no se acepta en una confirmación (PRODUCTO_INACTIVO).
--   * Sesiones de soporte y cuentas vencidas: solo lectura. Nada para anon ni public.
--   * Orden de despliegue indistinto: sin SQL el front oculta todo («Disponible pronto») sin errores ni reintentos; con SQL y front viejo no cambia nada.
--
-- PRE-CHECKS (solo lectura, correr ANTES)
--   -- 1. Que no exista ya nada con estos nombres
--   select to_regclass('public.atenciones'), to_regclass('public.atencion_insumos'), to_regclass('public.pendientes_bodega');
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('atencion_confirmar','atencion_corregir','pendiente_resolver','insumos_por_especialidad','insumos_misma_clinica','productos_depto_misma_clinica','citas_paciente_insumos','atencion_mov_borrado','atenciones_estado_guard');
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'productos' and column_name = 'departamento_id';
--   -- 2. Triggers vivos de citas, inventario y productos (ninguno debe descontar stock al cambiar el estado de una cita; ver los de otras ramas)
--   select tgrelid::regclass, tgname, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in ('public.citas'::regclass, 'public.inventario_movimientos'::regclass, 'public.productos'::regclass) order by 1, 2;
--   -- 3. Cuerpos de inv_aplicar, inventario_eliminar y emergencia_identificar (deben seguir como se describe arriba)
--   select pg_get_functiondef('public.inv_aplicar()'::regprocedure), pg_get_functiondef('public.inventario_eliminar(text,uuid,text)'::regprocedure), pg_get_functiondef('public.emergencia_identificar(uuid,uuid,text,text)'::regprocedure);
--   -- 4. Valores de citas.estado permitidos
--   select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.citas'::regclass and conname = 'citas_estado_check';
--   -- 5. Cuántas clínicas son hospital y cuántos perfiles ya tienen profesional_id vinculado
--   select count(*) filter (where especialidad = 'hospital') as hospitales, count(*) as total from public.clinicas;
--   select count(*) from public.perfiles where permisos ? 'profesional_id';
--
-- PRUEBA EN TRANSACCIÓN (en una clínica hospital de PRUEBA, nunca una real; todo termina en ROLLBACK)
--   begin;
--     -- (pegar aquí el cuerpo ejecutable de este archivo: líneas 134 a      596 de este archivo, desde «1. Etiqueta de especialidad» hasta el final)
--     -- Simular a la dueña:  select set_config('request.jwt.claim.sub', '<uuid de auth.users>', true);  set local role authenticated;
--     -- D1  confirmar 2 de un producto con 5 → stock 3, cita 'Asistió', un movimiento 'uso' con cita y paciente
--     -- D2  pedir 9 con stock 3 → descontada 3, faltante 6, una fila en pendientes_bodega con cantidad 6, existencias.cantidad = 0
--     -- D3  repetir la confirmación → ERROR YA_CONFIRMADA y el stock no cambia
--     -- D4  cita / producto / sede de OTRA clínica → CITA_AJENA / PRODUCTO_AJENO / SEDE_AJENA; sesión de soporte o cuenta vencida → SIN_PERMISO
--     -- D5  plan básico activo (clinicas.plan_activo = true, plan = 'basico') → SIN_INVENTARIO incluso con p_lineas = '[]'
--     -- D6  emergencia con paciente provisional → finalizar → confirmar (con faltante) → emergencia_identificar hacia un paciente existente:
--     --     atenciones, atencion_insumos y pendientes_bodega siguen existiendo con el paciente_id nuevo y pendiente_resolver funciona
--     -- D7  pendiente_resolver(id, true) parcial (descuenta lo que hay y queda pendiente el resto), luego pendiente_resolver(id, false) → 'resuelto'
--     -- D8  atencion_corregir devuelve el stock, deja las tres tablas sin filas de esa cita y escribe una fila en inventario_eliminados por movimiento
--     -- D9  cita_eliminar sobre una cita confirmada → stock restituido y sin filas huérfanas en las tres tablas
--     -- D10 como 'authenticated': insert into atenciones … o select costo_unitario from atencion_insumos → permission denied
--     -- D11 líneas inválidas: cantidad 0, -1, 1.2345, nula, o 101 líneas → DATOS_INVALIDOS
--     -- D12 usuario vinculado a OTRO profesional que el de la cita (que sí tiene usuario) → NO_AUTORIZADO; sin vínculo ni 'expedientes' = true → NO_AUTORIZADO
--     -- D13 update productos set departamento_id = <especialidad de otra clínica>, o de una clínica que no es hospital → REFERENCIA_AJENA
--     -- extra: borrar a mano un movimiento de la confirmación resta de descontada; cambiar de 'Asistió' a 'Cancelada' una cita confirmada → ATENCION_CONFIRMADA
--   rollback;
--
-- ROLLBACK (deshacer, si ya se aplicó; orden importa)
--   drop function if exists public.insumos_por_especialidad(date, date);
--   drop function if exists public.pendiente_resolver(uuid, boolean);
--   drop function if exists public.atencion_corregir(uuid);
--   drop function if exists public.atencion_confirmar(uuid, jsonb, uuid);
--   drop trigger if exists citas_atencion_guard on public.citas;
--   drop trigger if exists citas_paciente_insumos on public.citas;
--   drop trigger if exists atencion_mov_borrado on public.inventario_movimientos;
--   drop function if exists public.atenciones_estado_guard();
--   drop function if exists public.citas_paciente_insumos();
--   drop function if exists public.atencion_mov_borrado();
--   drop table if exists public.pendientes_bodega;
--   drop table if exists public.atencion_insumos;
--   drop table if exists public.atenciones;
--   drop function if exists public.insumos_misma_clinica();
--   drop trigger if exists productos_depto_ref on public.productos;
--   drop function if exists public.productos_depto_misma_clinica();
--   alter table public.productos drop column if exists departamento_id;
--   -- (los movimientos 'uso' ya hechos por confirmaciones quedan en el historial de inventario; no se tocan)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Etiqueta de especialidad en el producto (opcional, solo hospital)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.productos
  add column if not exists departamento_id uuid references public.departamentos(id) on delete set null;

create index if not exists productos_departamento_idx on public.productos (departamento_id) where departamento_id is not null;

-- The tag must be a specialty of the same clinic, and only a hospital may use it.
create or replace function public.productos_depto_misma_clinica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.departamento_id is not null
     and (tg_op = 'INSERT' or new.departamento_id is distinct from old.departamento_id or new.clinica_id is distinct from old.clinica_id) then
    if not exists (select 1 from public.departamentos d where d.id = new.departamento_id and d.clinica_id = new.clinica_id)
       or not exists (select 1 from public.clinicas c where c.id = new.clinica_id and c.especialidad = 'hospital') then
      raise exception 'REFERENCIA_AJENA' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.productos_depto_misma_clinica() from public, anon, authenticated;

drop trigger if exists productos_depto_ref on public.productos;
create trigger productos_depto_ref before insert or update of departamento_id, clinica_id on public.productos
  for each row execute function public.productos_depto_misma_clinica();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tablas nuevas (RLS: los clientes solo leen)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.atenciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cita_id uuid not null unique references public.citas(id) on delete cascade,          -- one confirmation per cita
  paciente_id uuid not null references public.pacientes(id) on delete cascade,          -- NOT «no action» on purpose: with NO ACTION deleting a patient fails (tested: the check runs before the cita cascade) and the owner could never delete a hospital patient; deleting a patient already removes its citas and, through them, these rows
  departamento_id uuid references public.departamentos(id) on delete set null,          -- specialty of the cita when confirmed (finance)
  profesional_id uuid references public.profesionales(id) on delete set null,
  sede_id uuid not null references public.sedes(id),
  estado_previo text,                                                                    -- estado of the cita before confirming (used by «Corregir»)
  confirmada_por uuid not null,
  confirmada_nombre text,
  confirmada_at timestamptz not null default now()
);
create index atenciones_clinica_idx on public.atenciones (clinica_id, confirmada_at desc);
create index atenciones_depto_idx on public.atenciones (clinica_id, departamento_id);

create table public.atencion_insumos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  atencion_id uuid not null references public.atenciones(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad numeric not null check (cantidad > 0),                                        -- what the doctor listed
  descontada numeric not null default 0 check (descontada >= 0),                         -- what really left the stock
  faltante numeric not null default 0 check (faltante >= 0),                             -- what was missing (also a row in pendientes_bodega)
  costo_unitario numeric check (costo_unitario is null or costo_unitario >= 0),          -- cost snapshot; NOT readable by clients (column privilege)
  movimiento_ids uuid[] not null default '{}',                                           -- inventario_movimientos created for this line
  created_at timestamptz not null default now(),
  unique (atencion_id, producto_id),
  check (descontada + faltante <= cantidad)                                              -- < when a discounted movement was deleted by hand (see atencion_mov_borrado)
);
create index atencion_insumos_clinica_idx on public.atencion_insumos (clinica_id);

create table public.pendientes_bodega (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  atencion_insumo_id uuid not null unique references public.atencion_insumos(id) on delete cascade,
  cita_id uuid not null references public.citas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  departamento_id uuid references public.departamentos(id) on delete set null,
  sede_id uuid not null references public.sedes(id),
  cantidad numeric not null check (cantidad > 0),                                        -- still missing
  cantidad_original numeric not null check (cantidad_original > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelto')),
  creado_por uuid not null,
  creado_nombre text,
  created_at timestamptz not null default now(),
  resuelto_por uuid,
  resuelto_nombre text,
  resuelto_at timestamptz,
  descontado numeric not null default 0 check (descontado >= 0),                         -- discounted later, when it arrived
  check ((estado = 'resuelto') = (resuelto_at is not null))
);
create index pendientes_bodega_clinica_idx on public.pendientes_bodega (clinica_id, estado, created_at desc);

-- Defence in depth: every reference of the three tables belongs to the row's clinic (the RPCs already check it).
create or replace function public.insumos_misma_clinica()
returns trigger language plpgsql security definer set search_path = public as $$
declare ajena boolean := false;
begin
  if tg_table_name = 'atenciones' then
    ajena := not exists (select 1 from public.citas x where x.id = new.cita_id and x.clinica_id = new.clinica_id and x.paciente_id = new.paciente_id)
          or not exists (select 1 from public.sedes x where x.id = new.sede_id and x.clinica_id = new.clinica_id)
          or (new.departamento_id is not null and not exists (select 1 from public.departamentos x where x.id = new.departamento_id and x.clinica_id = new.clinica_id))
          or (new.profesional_id is not null and not exists (select 1 from public.profesionales x where x.id = new.profesional_id and x.clinica_id = new.clinica_id));
  elsif tg_table_name = 'atencion_insumos' then
    ajena := not exists (select 1 from public.atenciones x where x.id = new.atencion_id and x.clinica_id = new.clinica_id)
          or not exists (select 1 from public.productos x where x.id = new.producto_id and x.clinica_id = new.clinica_id);
  elsif tg_table_name = 'pendientes_bodega' then
    ajena := not exists (select 1 from public.atencion_insumos x where x.id = new.atencion_insumo_id and x.clinica_id = new.clinica_id)
          or not exists (select 1 from public.citas x where x.id = new.cita_id and x.clinica_id = new.clinica_id and x.paciente_id = new.paciente_id)
          or not exists (select 1 from public.productos x where x.id = new.producto_id and x.clinica_id = new.clinica_id)
          or not exists (select 1 from public.sedes x where x.id = new.sede_id and x.clinica_id = new.clinica_id)
          or (new.departamento_id is not null and not exists (select 1 from public.departamentos x where x.id = new.departamento_id and x.clinica_id = new.clinica_id));
  end if;
  if ajena then raise exception 'REFERENCIA_AJENA' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function public.insumos_misma_clinica() from public, anon, authenticated;

create trigger atenciones_ref before insert or update on public.atenciones for each row execute function public.insumos_misma_clinica();
create trigger atencion_insumos_ref before insert or update on public.atencion_insumos for each row execute function public.insumos_misma_clinica();
create trigger pendientes_bodega_ref before insert or update on public.pendientes_bodega for each row execute function public.insumos_misma_clinica();

-- B1. A merged patient (emergencia_identificar moves the cita to the destination patient BEFORE deleting the provisional one):
-- the confirmation and its pending rows follow the cita. The integrity trigger above lets it through because the cita already has the new patient.
create or replace function public.citas_paciente_insumos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.atenciones set paciente_id = new.paciente_id where cita_id = new.id and paciente_id is distinct from new.paciente_id;
  update public.pendientes_bodega set paciente_id = new.paciente_id where cita_id = new.id and paciente_id is distinct from new.paciente_id;
  return null;
end;
$$;
revoke all on function public.citas_paciente_insumos() from public, anon, authenticated;
drop trigger if exists citas_paciente_insumos on public.citas;
create trigger citas_paciente_insumos after update of paciente_id on public.citas
  for each row when (old.paciente_id is distinct from new.paciente_id) execute function public.citas_paciente_insumos();

-- S1. A movement of a confirmation deleted by hand (Inventario → Historial): the line stops counting it, so the cost stays right.
-- The RPCs that delete movements on purpose (atencion_corregir) set conception.atencion_rpc = 'on' for the transaction; cita_eliminar deletes
-- the movements first and the cita (and with it the lines) right after, so updating a line that is about to disappear is harmless.
create or replace function public.atencion_mov_borrado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('conception.atencion_rpc', true), '') = 'on' then return null; end if;
  update public.atencion_insumos i
     set descontada = greatest(0, i.descontada + old.delta), movimiento_ids = array_remove(i.movimiento_ids, old.id)
   where i.clinica_id = old.clinica_id and old.id = any (i.movimiento_ids);
  return null;
end;
$$;
revoke all on function public.atencion_mov_borrado() from public, anon, authenticated;
drop trigger if exists atencion_mov_borrado on public.inventario_movimientos;
create trigger atencion_mov_borrado after delete on public.inventario_movimientos
  for each row when (old.tipo = 'uso' and old.cita_id is not null) execute function public.atencion_mov_borrado();

-- A confirmed cita cannot leave «Asistió» by a plain update (cancel, reopen…): the owner uses «Corregir» first. Only citas WITH a confirmation are affected.
create or replace function public.atenciones_estado_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('conception.atencion_rpc', true), '') <> 'on'
     and exists (select 1 from public.atenciones a where a.cita_id = new.id) then
    raise exception 'ATENCION_CONFIRMADA' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.atenciones_estado_guard() from public, anon, authenticated;
drop trigger if exists citas_atencion_guard on public.citas;
create trigger citas_atencion_guard before update of estado on public.citas
  for each row when (old.estado = 'Asistió' and new.estado is distinct from old.estado) execute function public.atenciones_estado_guard();

alter table public.atenciones enable row level security;
alter table public.atencion_insumos enable row level security;
alter table public.pendientes_bodega enable row level security;

create policy atenciones_ver on public.atenciones for select to authenticated using (clinica_id = (select public.mi_clinica()));
create policy atencion_insumos_ver on public.atencion_insumos for select to authenticated using (clinica_id = (select public.mi_clinica()));
create policy pendientes_bodega_ver on public.pendientes_bodega for select to authenticated using (clinica_id = (select public.mi_clinica()));

revoke all on public.atenciones, public.atencion_insumos, public.pendientes_bodega from public, anon, authenticated;
grant select on public.atenciones to authenticated;
grant select (id, clinica_id, atencion_id, producto_id, cantidad, descontada, faltante, movimiento_ids, created_at) on public.atencion_insumos to authenticated; -- no costo_unitario
grant select on public.pendientes_bodega to authenticated;
grant all on public.atenciones, public.atencion_insumos, public.pendientes_bodega to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: confirmar la atención de una cita y descontar sus insumos
--    p_lineas = [{"producto_id": uuid, "cantidad": número > 0}, …] (puede ir vacío: solo marca la cita atendida)
--    p_sede   = sede de la que sale el stock; sin ella: la sede de la cita, o la única sede activa
--    Devuelve {atencion_id, sede_id, faltantes, lineas:[{producto_id, cantidad, descontada, faltante}]}
-- ─────────────────────────────────────────────────────────────────────────────
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
         or not exists (select 1 from public.perfiles q where q.clinica_id = v_clinica and q.permisos ->> 'profesional_id' = v_cita.profesional_id::text))
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: corregir una confirmación (solo la dueña): devuelve el stock, borra la confirmación y deja la cita como estaba
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- an emergency keeps the estado its own module set; any other cita goes back to what it was
  if not exists (select 1 from public.emergencias e where e.cita_id = v_cita.id) and v_atencion.estado_previo is not null then
    update public.citas set estado = v_atencion.estado_previo where id = v_cita.id;
  end if;
  delete from public.atenciones where id = v_atencion.id;   -- cascades to its lines and pending rows
  perform set_config('conception.atencion_rpc', 'off', true);
  return jsonb_build_object('devueltos', v_devueltos);
end;
$$;
revoke all on function public.atencion_corregir(uuid) from public, anon;
grant execute on function public.atencion_corregir(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: bodega marca un pendiente «Resuelto» (opcionalmente descontando lo que ya llegó)
--    Devuelve {estado, descontado, restante}
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.pendiente_resolver(p_id uuid, p_descontar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clinica uuid := public.mi_clinica();
  v_p public.pendientes_bodega%rowtype;
  v_cita_id uuid;
  v_nombre text;
  v_hay numeric;
  v_desc numeric := 0;
  v_mov uuid;
  v_restante numeric;
  v_hoy date := (now() at time zone 'America/Guatemala')::date;
begin
  if v_uid is null or v_clinica is null or public.es_soporte() or public.clinica_vencida() then raise exception 'SIN_PERMISO'; end if;
  if not exists (select 1 from public.clinicas c where c.id = v_clinica and c.especialidad = 'hospital') then raise exception 'NO_HOSPITAL'; end if;
  if not public.inventario_habilitado() then raise exception 'SIN_INVENTARIO'; end if;
  if not (public.es_admin() or public.tiene_permiso('inventario')) then raise exception 'NO_AUTORIZADO'; end if;

  -- same lock order as the other RPCs: cita → existencias → pending row (the cita id is read without a lock first)
  select b.cita_id into v_cita_id from public.pendientes_bodega b where b.id = p_id and b.clinica_id = v_clinica;
  if v_cita_id is null then raise exception 'PENDIENTE_AJENO'; end if;
  perform 1 from public.citas c where c.id = v_cita_id and c.clinica_id = v_clinica for update;
  select * into v_p from public.pendientes_bodega b where b.id = p_id and b.clinica_id = v_clinica for update;
  if not found then raise exception 'PENDIENTE_AJENO'; end if;
  if v_p.estado = 'resuelto' then raise exception 'YA_RESUELTO'; end if;
  select nullif(btrim(p.nombre), '') into v_nombre from public.perfiles p where p.user_id = v_uid;

  if coalesce(p_descontar, false) then
    select e.cantidad into v_hay from public.existencias e where e.sede_id = v_p.sede_id and e.producto_id = v_p.producto_id for update;
    v_desc := least(coalesce(v_hay, 0), v_p.cantidad);
    if v_desc <= 0 then raise exception 'SIN_EXISTENCIA'; end if;
    insert into public.inventario_movimientos (clinica_id, sede_id, producto_id, tipo, delta, paciente_id, cita_id, notas, fecha, creado_por)
    values (v_clinica, v_p.sede_id, v_p.producto_id, 'uso', -v_desc, v_p.paciente_id, v_p.cita_id, 'Pendiente de bodega resuelto', v_hoy, v_uid)
    returning id into v_mov;
    update public.atencion_insumos i
       set descontada = i.descontada + v_desc, faltante = i.faltante - v_desc, movimiento_ids = i.movimiento_ids || v_mov
     where i.id = v_p.atencion_insumo_id and i.clinica_id = v_clinica;
  end if;

  v_restante := v_p.cantidad - v_desc;
  if v_restante > 0 and coalesce(p_descontar, false) then
    -- only part arrived: it stays pending for the rest
    update public.pendientes_bodega set cantidad = v_restante, descontado = descontado + v_desc where id = v_p.id;
    return jsonb_build_object('estado', 'pendiente', 'descontado', v_desc, 'restante', v_restante);
  end if;
  update public.pendientes_bodega
     set estado = 'resuelto', resuelto_por = v_uid, resuelto_nombre = v_nombre, resuelto_at = now(), descontado = descontado + v_desc
   where id = v_p.id;
  return jsonb_build_object('estado', 'resuelto', 'descontado', v_desc, 'restante', 0);
end;
$$;
revoke all on function public.pendiente_resolver(uuid, boolean) from public, anon;
grant execute on function public.pendiente_resolver(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC (solo lectura): costo de los insumos consumidos por especialidad, sede y día (para Finanzas)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.insumos_por_especialidad(p_desde date default null, p_hasta date default null)
returns table (departamento_id uuid, sede_id uuid, fecha date, costo numeric, lineas bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_clinica uuid := public.mi_clinica();
begin
  if auth.uid() is null or v_clinica is null then raise exception 'SIN_PERMISO'; end if;
  if not exists (select 1 from public.clinicas c where c.id = v_clinica and c.especialidad = 'hospital') then raise exception 'NO_HOSPITAL'; end if;
  if not public.inventario_habilitado() then raise exception 'SIN_INVENTARIO'; end if;
  if not (public.tiene_permiso('finanzas') and public.tiene_permiso('costos')) then raise exception 'NO_AUTORIZADO'; end if;
  return query
    select a.departamento_id, a.sede_id, (a.confirmada_at at time zone 'America/Guatemala')::date as fecha,
           coalesce(sum(i.descontada * coalesce(i.costo_unitario, 0)), 0)::numeric as costo, count(i.id)::bigint as lineas
      from public.atenciones a
      join public.atencion_insumos i on i.atencion_id = a.id and i.clinica_id = a.clinica_id
     where a.clinica_id = v_clinica
       and (p_desde is null or (a.confirmada_at at time zone 'America/Guatemala')::date >= p_desde)
       and (p_hasta is null or (a.confirmada_at at time zone 'America/Guatemala')::date <= p_hasta)
     group by a.departamento_id, a.sede_id, (a.confirmada_at at time zone 'America/Guatemala')::date;
end;
$$;
revoke all on function public.insumos_por_especialidad(date, date) from public, anon;
grant execute on function public.insumos_por_especialidad(date, date) to authenticated;

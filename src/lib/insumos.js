import { esAdmin, esSoporte } from './permisos'
import { fmtCant } from '../hooks/useInventario'

// Hospital supplies: «Confirmar atención» (supplies leave the stock when the assigned doctor confirms), pending items for the warehouse
// and the cost per specialty. Server side: supabase/migraciones-propuestas/2026-11-28_hospital_insumos.sql (RPCs atencion_confirmar,
// atencion_corregir, pendiente_resolver, insumos_por_especialidad).

// A missing table / function / column means the SQL has not been applied yet (or is not readable): the feature stays hidden, silently
export const faltaSQL = (e) => !!e && (['42P01', 'PGRST205', 'PGRST202', 'PGRST204', '42883', '42703', '42501'].includes(e.code)
  || /does not exist|schema cache|Could not find the (table|function|column)|permission denied/i.test(e.message || ''))

// cita.estado values (live CHECK): the ones from which an attendance can be confirmed
export const ESTADOS_CONFIRMABLES = ['Pendiente', 'Confirmada', 'Asistió']

// Mirror of the server rule (atencion_confirmar): owner, or the doctor linked to the cita (perfil.permisos.profesional_id),
// or — when the cita has no doctor or the user has no linked doctor yet — anyone with the «expedientes» permission. The database decides.
// `vinculados` = Set of profesional ids that have a user linked (useAtenciones). Like the server, a missing permission key counts as false.
export function puedeConfirmar(perfil, cita, vinculados = new Set()) {
  if (!perfil || !cita || esSoporte(perfil)) return false
  if (esAdmin(perfil)) return true
  const vinculo = perfil.permisos?.profesional_id || null
  if (vinculo && cita.profesional_id && vinculo === cita.profesional_id) return true
  return (!cita.profesional_id || !vinculados.has(cita.profesional_id)) && perfil.permisos?.expedientes === true
}
// «Pendientes de bodega» buttons: owner, or «inventario» = true (a missing key is false on the server)
export const puedeResolver = (perfil) => !!perfil && !esSoporte(perfil) && (esAdmin(perfil) || perfil.permisos?.inventario === true)

// quantities travel with at most 3 decimals (the server rejects more)
export const redondear = (n) => Math.round(Number(n) * 1000) / 1000

// Default kit of a service: the active packages (Inventario → Paquetes) linked to it, quantities added up by product
export function kitDeServicio(inv, servicioId) {
  if (!servicioId || !inv?.paquetes) return []
  const ids = new Set(inv.paquetes.filter(p => p.activo && p.servicio_id === servicioId).map(p => p.id))
  const suma = new Map()
  for (const it of inv.paqueteItems || []) if (ids.has(it.paquete_id)) suma.set(it.producto_id, (suma.get(it.producto_id) || 0) + Number(it.cantidad))
  return [...suma].map(([producto, cantidad]) => ({ producto, cantidad: String(redondear(cantidad)) }))
}

// Spanish messages for the error codes the RPCs raise
const MENSAJES = {
  SIN_PERMISO: 'Su sesión no puede hacer este cambio (cuenta vencida o sesión de soporte)',
  NO_HOSPITAL: 'Esta función es solo para cuentas de hospital',
  NO_AUTORIZADO: 'Solo el médico asignado o la persona administradora puede hacerlo',
  CITA_AJENA: 'No se encontró la cita',
  CITA_NO_VALIDA: 'La cita está cancelada, reagendada o sin asistencia: no se puede confirmar',
  EMERGENCIA_ABIERTA: 'Primero finalice la emergencia',
  YA_CONFIRMADA: 'Esta atención ya fue confirmada',
  NO_CONFIRMADA: 'Esta cita no tiene atención confirmada',
  DATOS_INVALIDOS: 'Revise los insumos y las cantidades',
  PRODUCTO_AJENO: 'Uno de los insumos ya no existe',
  PRODUCTO_INACTIVO: 'Uno de los insumos está desactivado: quítelo de la lista',
  ATENCION_CONFIRMADA: 'Esta cita ya tiene la atención confirmada. Para cambiarla, primero use «Corregir».',
  SEDE_AJENA: 'La sede elegida no existe',
  SIN_SEDE: 'Elija la sede de la que salen los insumos',
  SIN_INVENTARIO: 'Su plan no incluye inventario',
  PENDIENTE_AJENO: 'No se encontró el pendiente',
  YA_RESUELTO: 'Este pendiente ya estaba resuelto',
  SIN_EXISTENCIA: 'Todavía no hay existencia de este insumo en esa sede',
}
export function errorAtencion(error, porDefecto = 'No se pudo completar') {
  const t = `${error?.message || ''} ${error?.hint || ''}`
  const k = Object.keys(MENSAJES).find(c => t.includes(c))
  if (k) return MENSAJES[k]
  if (faltaSQL(error)) return 'Esta función estará disponible pronto'
  return porDefecto
}

// «2 ampollas · 1.5 cajas»
export const textoCantidad = (n, unidad) => `${fmtCant(n)}${unidad ? ` ${unidad}` : ''}`

import { useEffect, useCallback, useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import { esHospital } from '../lib/especialidades'
import { useDatos } from './useDatos'
import { faltaSQL } from '../lib/insumos'
import { profesionalesDe } from '../lib/usuariosHospital'
import { accesos } from '../lib/constantes'

// Confirmed attendances, their supplies and the warehouse pending list of a hospital account. One shared copy for every screen
// (a tiny external store, no context change in App.jsx). While the SQL is not applied (missing table / permission) it reports
// `disponible: false` once, silently, and does not ask again during this page load. No polling: it reloads on mount and after an action.

const VACIO = { disponible: false, cargado: false, atenciones: [], lineas: [], pendientes: [], productos: [], vinculados: new Set(), version: 0 }
const store = { clinica: null, estado: VACIO, enCurso: null, faltante: false, escuchas: new Set() }
const poner = (e) => { store.estado = e; store.escuchas.forEach(f => f()) }
const suscribir = (f) => { store.escuchas.add(f); return () => store.escuchas.delete(f) }
const leer = () => store.estado

const PAGE = 1000
async function todo(tabla, columnas, orden) {
  let desde = 0, filas = []
  for (;;) {
    const { data, error } = await supabase.from(tabla).select(columnas).order(orden, { ascending: false }).range(desde, desde + PAGE - 1)
    if (error) return { error }
    filas = filas.concat(data || [])
    if (!data || data.length < PAGE) return { filas }
    desde += PAGE
  }
}
// atencion_insumos.costo_unitario is not readable by clients (column privilege): the columns are asked for by name
const COLUMNAS_LINEA = 'id, clinica_id, atencion_id, producto_id, cantidad, descontada, faltante, movimiento_ids, created_at'

function cargar(clinicaId) {
  if (store.clinica !== clinicaId) { store.clinica = clinicaId; store.faltante = false; store.enCurso = null; poner(VACIO) }
  if (store.faltante) return Promise.resolve(false)
  if (store.enCurso) return store.enCurso
  store.enCurso = (async () => {
    const [a, l, p, pr, pf] = await Promise.all([
      todo('atenciones', '*', 'confirmada_at'), todo('atencion_insumos', COLUMNAS_LINEA, 'created_at'), todo('pendientes_bodega', '*', 'created_at'),
      supabase.from('productos').select('id, nombre, unidad, departamento_id'),
      supabase.from('perfiles').select('permisos, activo'),
    ])
    // deactivated users do not count as linked; if the activo column is not there yet, ask again without it
    const pfFinal = pf.error ? await supabase.from('perfiles').select('permisos') : pf
    const error = a.error || l.error || p.error
    if (error) {
      if (faltaSQL(error)) { store.faltante = true; poner({ ...VACIO, cargado: true }) } // not applied yet: hidden, no noise
      else console.warn('Insumos: no se pudieron leer', error.message) // a transient error keeps what is on screen
      return false
    }
    // product names are only for labels: without inventory access they simply stay empty
    poner({ disponible: true, cargado: true, atenciones: a.filas, lineas: l.filas, pendientes: p.filas, productos: pr.error ? [] : pr.data || [],
      // doctors that already have a user linked: the «no doctor linked» fallback of puedeConfirmar needs them
      vinculados: new Set(pfFinal.error ? [] : (pfFinal.data || []).filter(x => x.activo !== false).flatMap(x => profesionalesDe(x.permisos))), version: store.estado.version + 1 })
    return true
  })().finally(() => { store.enCurso = null })
  return store.enCurso
}

export function useAtenciones() {
  const { clinica, hospital, planActivo } = useDatos()
  // hospital account with its tables AND a plan that includes inventory (the SQL refuses the others with SIN_INVENTARIO)
  const activo = !!clinica?.id && esHospital(clinica?.especialidad) && !!hospital?.disponible && accesos(clinica, planActivo).inventario
  const estado = useSyncExternalStore(suscribir, leer)
  useEffect(() => { if (activo) cargar(clinica.id) }, [activo, clinica?.id])
  const recargar = useCallback(() => (activo ? cargar(clinica.id) : Promise.resolve(false)), [activo, clinica?.id])
  const delCita = useCallback((citaId) => {
    const atencion = estado.atenciones.find(a => a.cita_id === citaId) || null
    return { atencion, lineas: atencion ? estado.lineas.filter(l => l.atencion_id === atencion.id) : [], pendientes: estado.pendientes.filter(p => p.cita_id === citaId) }
  }, [estado])
  // `activo` = the hospital feature can be used (SQL applied and readable)
  return { ...estado, activo: activo && estado.disponible, recargar, delCita, nPendientes: estado.pendientes.filter(p => p.estado === 'pendiente').length }
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { esHospital } from '../lib/especialidades'
import { citasEmergencia } from '../lib/emergencias'

// Emergencias of a hospital account (table `emergencias`, one row per emergency cita). Loaded for the whole app (menu badge, Inicio card,
// Expedientes) and refreshed every 30 s while the tab is visible and when the window gets focus. No realtime subscription.
// When the table does not exist yet (migration not applied) it reports `disponible: false`, silently.
// `recargarDatos` reloads the shared clinic data (citas, pacientes…): it runs when the poll sees a change made by someone else.

export const EMERGENCIAS_VACIO = { disponible: false, cargado: true, filas: [], porCita: new Map(), abiertas: [], recargar: async () => {} }

const tablaFaltante = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache|Could not find the table/i.test(e.message || ''))
const INTERVALO = 30000

async function leerTodas() {
  const PAGE = 1000
  let desde = 0, filas = []
  for (;;) {
    const { data, error } = await supabase.from('emergencias').select('*').order('llegada_at', { ascending: false }).range(desde, desde + PAGE - 1)
    if (error) return { error }
    filas = filas.concat(data || [])
    if (!data || data.length < PAGE) return { filas }
    desde += PAGE
  }
}

export function useCargarEmergencias(clinica, recargarDatos) {
  const activo = !!clinica?.id && esHospital(clinica?.especialidad)
  const [estado, setEstado] = useState({ disponible: false, cargado: !activo, filas: [] })
  const firma = useRef(null)
  const datosRef = useRef(recargarDatos)
  datosRef.current = recargarDatos

  // `completo`: also reload the shared clinic data (after an action of this user); the poll only does it when something changed
  const recargar = useCallback(async (completo = false) => {
    if (!activo) return
    const r = await leerTodas()
    if (r.error) {
      if (!tablaFaltante(r.error)) console.warn('Emergencias: no se pudieron leer', r.error.message)
      firma.current = null
      setEstado({ disponible: false, cargado: true, filas: [] })
      return
    }
    // what other users can change without this one noticing: the cita's doctor / patient and provisional patients
    const [citasR, pacR] = await Promise.all([
      supabase.from('citas').select('id, profesional_id, paciente_id, estado').eq('tipo', 'Emergencia'),
      supabase.from('pacientes').select('id, nombre, sin_identificar').eq('sin_identificar', true),
    ])
    const nueva = JSON.stringify([
      r.filas.map(e => [e.cita_id, e.estado, e.cerrado_at, e.triage]),
      (citasR.data || []).map(c => [c.id, c.profesional_id, c.paciente_id, c.estado]).sort(),
      (pacR.data || []).map(p => [p.id, p.nombre]).sort(),
    ])
    const cambio = firma.current !== null && firma.current !== nueva
    firma.current = nueva
    setEstado({ disponible: true, cargado: true, filas: r.filas })
    if (completo || cambio) await datosRef.current?.()
  }, [activo])

  useEffect(() => { recargar() }, [recargar])

  // refresh every 30 s while the tab is visible, and when it comes back / the window gets focus
  useEffect(() => {
    if (!activo) return
    const visible = () => document.visibilityState === 'visible'
    const id = setInterval(() => { if (visible()) recargar() }, INTERVALO)
    const alVolver = () => { if (visible()) recargar() }
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(id); window.removeEventListener('focus', alVolver); document.removeEventListener('visibilitychange', alVolver) }
  }, [activo, recargar])

  // emergencies are never mirrored to Google Calendar (see sincronizarCita)
  useEffect(() => {
    citasEmergencia.clear()
    estado.filas.forEach(e => citasEmergencia.add(e.cita_id))
  }, [estado.filas])

  return useMemo(() => {
    if (!activo) return EMERGENCIAS_VACIO
    return {
      ...estado, recargar,
      porCita: new Map(estado.filas.map(e => [e.cita_id, e])),
      abiertas: estado.filas.filter(e => !e.cerrado_at),
    }
  }, [activo, estado, recargar])
}

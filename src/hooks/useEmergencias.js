import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { esHospital } from '../lib/especialidades'
import { citasEmergencia, TIPO_EMERGENCIA } from '../lib/emergencias'

// Emergencias of a hospital account (table `emergencias`, one row per emergency cita). The shared state holds only the OPEN emergencies plus those
// closed in the last 24 h (and the ones of provisional «sin identificar» patients, so they can be completed); the Historial loads its own date range
// on demand with `leerRango`. Refreshed every 30 s while the tab is visible and when the window gets focus. No realtime subscription.
// When the table does not exist yet (migration not applied) it reports `disponible: false` and stops asking (one request per page load).
// A transient error keeps the previous state; the next poll retries. `recargarDatos` reloads the shared clinic data silently (citas, pacientes…).

export const EMERGENCIAS_VACIO = { disponible: false, cargado: true, fallo: false, filas: [], version: 0, porCita: new Map(), abiertas: [], recargar: async () => {} }

export const tablaFaltante = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache|Could not find the table/i.test(e.message || ''))
const INTERVALO = 30000
const PAGE = 1000
const RECIENTE_MS = 24 * 3600 * 1000

// pages through any emergencias query (the builder is rebuilt per page)
async function paginar(armar) {
  let desde = 0, filas = []
  for (;;) {
    const { data, error } = await armar().order('llegada_at', { ascending: false }).order('cita_id').range(desde, desde + PAGE - 1)
    if (error) return { error }
    filas = filas.concat(data || [])
    if (!data || data.length < PAGE) return { filas }
    desde += PAGE
  }
}

// Historial: the emergencies that arrived between two dates (YYYY-MM-DD, Guatemala is UTC-6 all year), paginated beyond 1000 rows
export const leerRango = (desde, hasta) => {
  const ini = new Date(`${desde}T00:00:00-06:00`).toISOString()
  const fin = new Date(new Date(`${hasta}T00:00:00-06:00`).getTime() + 86400000).toISOString()
  return paginar(() => supabase.from('emergencias').select('*').gte('llegada_at', ini).lt('llegada_at', fin))
}

export function useCargarEmergencias(clinica, recargarDatos, citasDatos) {
  const activo = !!clinica?.id && esHospital(clinica?.especialidad)
  const [estado, setEstado] = useState({ disponible: false, cargado: !activo, fallo: false, faltante: false, filas: [], version: 0 })
  const firma = useRef(null)
  const faltante = useRef(false) // table missing: do not ask again during this page load
  const secuencia = useRef(0) // only the answer of the latest reload may win
  const pendienteCompleto = useRef(false) // an action of this user asked for a full reload that has not happened yet
  const datosRef = useRef(recargarDatos)
  datosRef.current = recargarDatos

  useEffect(() => { faltante.current = false; firma.current = null }, [activo, clinica?.id])

  // `completo`: also reload the shared clinic data (after an action of this user); the poll only does it when something changed
  const recargar = useCallback(async (completo = false) => {
    if (!activo || faltante.current) return
    if (completo) pendienteCompleto.current = true
    const mi = ++secuencia.current
    const fallar = () => setEstado(a => ({ ...a, cargado: true, fallo: !a.disponible })) // keep what is on screen; only a first load that never worked shows the retry notice
    const desde = new Date(Date.now() - RECIENTE_MS).toISOString()
    const [r, pacR] = await Promise.all([
      paginar(() => supabase.from('emergencias').select('*').or(`cerrado_at.is.null,cerrado_at.gte.${desde}`)),
      supabase.from('pacientes').select('id, nombre').eq('sin_identificar', true),
    ])
    if (mi !== secuencia.current) return // a newer reload started: its answer is the one that counts
    if (r.error) {
      if (tablaFaltante(r.error)) {
        faltante.current = true; firma.current = null
        setEstado({ disponible: false, cargado: true, fallo: false, faltante: true, filas: [], version: 0 })
      } else { console.warn('Emergencias: no se pudieron leer', r.error.message); fallar() }
      return
    }
    if (pacR.error) { fallar(); return }

    // emergencies of provisional patients older than the window (so they can still be completed)
    let filas = r.filas
    const provisionales = (pacR.data || []).map(p => p.id)
    const ya = new Set(filas.map(e => e.cita_id))
    for (let k = 0; k < provisionales.length; k += 100) {
      const x = await supabase.from('emergencias').select('*').in('paciente_id', provisionales.slice(k, k + 100))
      if (mi !== secuencia.current) return
      if (x.error) { fallar(); return }
      filas = filas.concat((x.data || []).filter(e => !ya.has(e.cita_id) && ya.add(e.cita_id)))
    }

    // what other users can change without this one noticing: the cita's doctor / patient / estado and provisional patients
    const ids = filas.map(e => e.cita_id)
    const citas = []
    for (let k = 0; k < ids.length; k += 100) {
      const c = await supabase.from('citas').select('id, profesional_id, paciente_id, estado').in('id', ids.slice(k, k + 100))
      if (mi !== secuencia.current) return
      if (c.error) { fallar(); return }
      citas.push(...(c.data || []))
    }
    const nueva = JSON.stringify([
      filas.map(e => [e.cita_id, e.estado, e.cerrado_at, e.triage]),
      citas.map(c => [c.id, c.profesional_id, c.paciente_id, c.estado]).sort(),
      (pacR.data || []).map(p => [p.id, p.nombre]).sort(),
    ])
    const cambio = firma.current !== null && firma.current !== nueva
    setEstado(a => ({ disponible: true, cargado: true, fallo: false, faltante: false, filas, version: a.version + 1 }))
    if (pendienteCompleto.current || cambio) {
      pendienteCompleto.current = false
      const ok = await datosRef.current?.()
      if (ok === false) return // the signature stays as it was: the next poll sees the change again and retries
    }
    firma.current = nueva // updated only after everything worked
  }, [activo])

  useEffect(() => { recargar() }, [recargar])

  // refresh every 30 s while the tab is visible, and when it comes back / the window gets focus (none of it while the table is missing)
  useEffect(() => {
    if (!activo || estado.faltante) return
    const visible = () => document.visibilityState === 'visible'
    const id = setInterval(() => { if (visible()) recargar() }, INTERVALO)
    const alVolver = () => { if (visible()) recargar() }
    window.addEventListener('focus', alVolver)
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(id); window.removeEventListener('focus', alVolver); document.removeEventListener('visibilitychange', alVolver) }
  }, [activo, estado.faltante, recargar])

  // emergencies are never mirrored to Google Calendar (see sincronizarCita); the edge function also refuses them by tipo
  useEffect(() => {
    if (!activo) return
    estado.filas.forEach(e => citasEmergencia.add(e.cita_id))
    ;(citasDatos || []).forEach(c => { if (c.tipo === TIPO_EMERGENCIA) citasEmergencia.add(c.id) })
  }, [activo, estado.filas, citasDatos])

  return useMemo(() => {
    if (!activo) return EMERGENCIAS_VACIO
    return {
      ...estado, recargar,
      porCita: new Map(estado.filas.map(e => [e.cita_id, e])),
      abiertas: estado.filas.filter(e => !e.cerrado_at),
    }
  }, [activo, estado, recargar])
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { tablaFaltante } from './useHospital'
import { sumarDias } from '../lib/calendario'
import { inicioDia, normalizarReservas } from '../lib/quirofanos'
import { useRefrescar } from './useRefrescar'

// Operating-room data: the surgeries (cirugias) and the busy time of rooms and doctors (reservas, read through the disponibilidad() function)
// of a window of days. Writes go through the database functions below (the tables are read-only for the app).
// The migration may not be applied yet: that is detected once per page load and remembered (no more requests, no error toasts);
// any other failure is transient (the data on screen stays, a manual reload or the next refresh tries again).
let faltante = false
export const cirugiasDisponibles = () => !faltante

// desde / hasta: 'YYYY-MM-DD' (inclusive). `reservas` / `cirugias`: which of the two to read. `ms`: refresh interval while visible (0 = none).
export function useCirugias({ desde, hasta, reservas = true, cirugias = true, activo = true, ms = 0 }) {
  const [estado, setEstado] = useState({ cirugias: [], reservas: [], listo: false, disponible: !faltante, error: false })
  const enVuelo = useRef(false)
  const pendiente = useRef(false) // a reload was asked while one was running: run it right after
  const secuencia = useRef(0)

  const cargar = useCallback(async () => {
    if (!activo || faltante) { if (faltante) setEstado(e => (e.disponible ? { ...e, disponible: false, listo: true } : e)); return }
    if (enVuelo.current) { pendiente.current = true; return }
    enVuelo.current = true
    const mia = ++secuencia.current
    try {
      // one extra day on each side: tails (cleaning) and surgeries that cross midnight
      const d = inicioDia(sumarDias(desde, -1)), h = inicioDia(sumarDias(hasta, 2))
      const [c, r] = await Promise.all([
        cirugias ? supabase.from('cirugias').select('*').gte('inicio', new Date(d).toISOString()).lt('inicio', new Date(h).toISOString()).order('inicio') : Promise.resolve({ data: [] }),
        reservas ? supabase.rpc('disponibilidad', { p_desde: new Date(d).toISOString(), p_hasta: new Date(h).toISOString() }) : Promise.resolve({ data: [] }),
      ])
      const falla = c.error || r.error
      if (falla) {
        if (tablaFaltante(falla)) { faltante = true; setEstado({ cirugias: [], reservas: [], listo: true, disponible: false, error: false }) }
        else { console.warn('Quirófanos: no se pudieron leer los datos', falla.message); if (mia === secuencia.current) setEstado(e => ({ ...e, error: !e.listo })) }
        return
      }
      if (mia !== secuencia.current) return // an older answer arriving late
      setEstado({ cirugias: c.data || [], reservas: normalizarReservas(r.data), listo: true, disponible: true, error: false })
    } catch (e) {
      console.warn('Quirófanos: no se pudieron leer los datos', e?.message)
      setEstado(prev => ({ ...prev, error: !prev.listo }))
    } finally {
      enVuelo.current = false
      if (pendiente.current) { pendiente.current = false; cargar() }
    }
  }, [activo, desde, hasta, reservas, cirugias])

  useEffect(() => { cargar() }, [cargar])
  useRefrescar(cargar, ms, activo && !faltante)
  return { ...estado, recargar: cargar }
}

// The surgery of one appointment (CitaModal, Expedientes): null when it has none. Same silence rules.
export function useCirugiaDeCita(citaId, activo = true) {
  const [c, setC] = useState(null)
  useEffect(() => {
    if (!citaId || !activo || faltante) { setC(null); return }
    let vivo = true
    supabase.from('cirugias').select('*').eq('cita_id', citaId).maybeSingle().then(({ data, error }) => {
      if (!vivo) return
      if (error) { if (tablaFaltante(error)) faltante = true; setC(null); return }
      setC(data || null)
    })
    return () => { vivo = false }
  }, [citaId, activo])
  return c
}

// ─── writes (database functions) ───
export const programarCirugia = (a) => supabase.rpc('cirugia_programar', {
  p_cita: a.cita || null, p_paciente: a.paciente || null, p_quirofano: a.quirofano, p_cirujano: a.cirujano, p_anestesiologo: a.anestesiologo || null,
  p_inicio: new Date(a.inicio).toISOString(), p_minutos: a.minutos, p_limpieza_min: a.limpieza || 0,
  p_procedimiento: a.procedimiento || null, p_ayudantes: a.ayudantes || null, p_nota: a.nota || null, p_departamento: a.departamento || null, p_sede: a.sede || null,
})
export const estadoCirugia = (cita, estado, nota) => supabase.rpc('cirugia_estado', { p_cita: cita, p_estado: estado, p_nota: nota || null })
export const bloquearReserva = (a) => supabase.rpc('reserva_bloquear', { p_tipo: a.tipo, p_recurso: a.recurso, p_inicio: new Date(a.inicio).toISOString(), p_fin: new Date(a.fin).toISOString(), p_titulo: a.titulo })
export const quitarReserva = (id) => supabase.rpc('reserva_quitar', { p_id: id })

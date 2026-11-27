import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { tablaFaltante } from './useHospital'
import { useRefrescar } from './useRefrescar'

// Hospitalization data: open stays (who is in which bed) and the discharges of the last 30 days.
// Same silence rules as the surgery data: a missing table is detected once per page load and remembered; any other failure is transient
// (the map on screen stays, nothing flips to «Disponible pronto», no toast); overlapping loads are collapsed.
let faltante = false

export const EGRESOS = [
  { value: 'alta', label: 'Alta médica' },
  { value: 'traslado', label: 'Traslado' },
  { value: 'fallecido', label: 'Fallecido' },
  { value: 'voluntario', label: 'Egreso voluntario' },
]
export const TIPOS_NOTA = [
  { value: 'evolucion', label: 'Evolución' },
  { value: 'enfermeria', label: 'Enfermería' },
  { value: 'indicacion', label: 'Indicación' },
  { value: 'signos', label: 'Signos vitales' },
]
export const SIGNOS = [
  { k: 'pa', label: 'Presión arterial', hint: '120/80', unidad: 'mmHg', texto: true },
  { k: 'fc', label: 'Frecuencia cardíaca', hint: '78', unidad: 'lpm' },
  { k: 'fr', label: 'Frecuencia respiratoria', hint: '16', unidad: 'rpm' },
  { k: 'temp', label: 'Temperatura', hint: '36.8', unidad: '°C' },
  { k: 'sat', label: 'Saturación de oxígeno', hint: '97', unidad: '%' },
  { k: 'glu', label: 'Glucosa', hint: '95', unidad: 'mg/dL' },
]

const DIA = 86400000
export const diasIngresado = (e, ahora = Date.now()) => Math.max(0, Math.floor((ahora - new Date(e.ingreso_at).getTime()) / DIA))
export const textoDias = (n) => (n === 0 ? 'Ingresó hoy' : n === 1 ? '1 día' : `${n} días`)

export function useCamas({ activo = true, ms = 0 } = {}) {
  const [estado, setEstado] = useState({ abiertas: [], egresos: [], listo: false, disponible: !faltante, error: false, actualizado: null })
  const enVuelo = useRef(false)
  const pendiente = useRef(false)

  const cargar = useCallback(async () => {
    if (!activo) return
    if (faltante) { setEstado(e => (e.disponible || !e.listo ? { ...e, disponible: false, listo: true } : e)); return }
    if (enVuelo.current) { pendiente.current = true; return }
    enVuelo.current = true
    try {
      const desde = new Date(Date.now() - 30 * DIA).toISOString()
      const [a, e] = await Promise.all([
        supabase.from('estancias').select('*').is('egreso_at', null).order('ingreso_at', { ascending: false }),
        supabase.from('estancias').select('*').gte('egreso_at', desde).order('egreso_at', { ascending: false }).limit(300),
      ])
      const falla = a.error || e.error
      if (falla) {
        if (tablaFaltante(falla)) { faltante = true; setEstado({ abiertas: [], egresos: [], listo: true, disponible: false, error: false, actualizado: null }) }
        else { console.warn('Camas: no se pudieron leer los datos', falla.message); setEstado(prev => ({ ...prev, error: !prev.listo })) }
        return
      }
      const limite = Date.now() - 30 * DIA
      setEstado({
        abiertas: a.data || [],
        egresos: (e.data || []).filter(x => x.egreso_at && new Date(x.egreso_at).getTime() >= limite),
        listo: true, disponible: true, error: false, actualizado: Date.now(),
      })
    } catch (err) {
      console.warn('Camas: no se pudieron leer los datos', err?.message)
      setEstado(prev => ({ ...prev, error: !prev.listo }))
    } finally {
      enVuelo.current = false
      if (pendiente.current) { pendiente.current = false; cargar() }
    }
  }, [activo])

  useEffect(() => { cargar() }, [cargar])
  useRefrescar(cargar, ms, activo && !faltante)
  return { ...estado, recargar: cargar }
}

// The stays of one patient (current + past), for the file (Expedientes): [] when the tables do not exist
export function useEstanciasPaciente(pacienteId, activo = true) {
  const [filas, setFilas] = useState(null)
  const cargar = useCallback(async () => {
    if (!pacienteId || !activo || faltante) { setFilas(faltante ? [] : null); return }
    const { data, error } = await supabase.from('estancias').select('*').eq('paciente_id', pacienteId).order('ingreso_at', { ascending: false })
    if (error) { if (tablaFaltante(error)) faltante = true; setFilas(prev => prev ?? []); return }
    setFilas(data || [])
  }, [pacienteId, activo])
  useEffect(() => { cargar() }, [cargar])
  return { estancias: filas, recargar: cargar }
}

// Notes of one stay, newest first
export function useNotas(estanciaId) {
  const [notas, setNotas] = useState(null)
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('estancia_notas').select('*').eq('estancia_id', estanciaId).order('created_at', { ascending: false })
    if (error) { console.warn('Camas: no se pudieron leer las notas', error.message); setNotas(prev => prev ?? []); return }
    setNotas(data || [])
  }, [estanciaId])
  useEffect(() => { cargar() }, [cargar])
  return { notas, recargar: cargar }
}

// ─── writes (database functions) ───
export const ingresarPaciente = (a) => supabase.rpc('estancia_ingresar', { p_paciente: a.paciente, p_cama: a.cama, p_profesional: a.profesional || null, p_departamento: a.departamento || null, p_motivo: a.motivo })
export const trasladarPaciente = (estancia, cama) => supabase.rpc('estancia_trasladar', { p_estancia: estancia, p_cama: cama })
export const darEgreso = (estancia, tipo, nota) => supabase.rpc('estancia_egresar', { p_estancia: estancia, p_tipo: tipo, p_nota: nota || null })
export const agregarNota = (estancia, tipo, texto, signos) => supabase.rpc('estancia_nota', { p_estancia: estancia, p_tipo: tipo, p_texto: texto || null, p_signos: signos || null })

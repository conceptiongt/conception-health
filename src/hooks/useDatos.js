import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// All clinic data (patients, consultations, charges), loaded once and shared by every page
export const DatosContext = createContext(null)
export const useDatos = () => useContext(DatosContext)

async function todo(tabla, orden) {
  const PAGE = 1000
  let desde = 0, filas = []
  for (;;) {
    const { data, error } = await supabase.from(tabla).select('*').order(orden, { ascending: false }).range(desde, desde + PAGE - 1)
    if (error) throw error
    filas = filas.concat(data || [])
    if (!data || data.length < PAGE) return filas
    desde += PAGE
  }
}

export function useCargarDatos(clinicaId) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const cargado = useRef(false) // true once data is on screen: from then on a failed reload must never blank the app
  // Resolves true when the reload worked. `silencioso`: background reload (poll of another hook); on failure it keeps showing the current data
  // and never sets the global `error`, the caller just retries on its next turn.
  const cargar = useCallback(async (silencioso) => {
    if (!clinicaId) return false
    try {
      const [pacientes, citas, cobros, servicios, sedes] = await Promise.all([
        todo('pacientes', 'created_at'), todo('citas', 'fecha'), todo('cobros', 'fecha'), todo('servicios', 'created_at'), todo('sedes', 'created_at'),
      ])
      setDatos({ pacientes, citas, cobros, servicios, sedes: sedes.filter(s => s.activa).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) })
      cargado.current = true
      setError(null)
      return true
    } catch (e) {
      if (!(silencioso === true && cargado.current)) setError(e.message || 'Error al cargar')
      return false
    }
  }, [clinicaId])
  const recargar = useCallback(() => cargar(false), [cargar])
  const recargarSilencioso = useCallback(() => cargar(true), [cargar])
  useEffect(() => { cargado.current = false; recargar() }, [recargar])
  return { datos, error, recargar, recargarSilencioso }
}

// Friendly message for database errors (trial limit, permissions…)
export function mensajeError(error, porDefecto = 'No se pudo guardar') {
  const t = `${error?.message || ''} ${error?.hint || ''}`
  if (t.includes('LIMITE_PRUEBA')) return 'La versión de prueba permite 3 pacientes. Active su suscripción para registrar más.'
  return porDefecto
}

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
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
  const recargar = useCallback(async () => {
    if (!clinicaId) return
    try {
      const [pacientes, citas, cobros, servicios] = await Promise.all([
        todo('pacientes', 'created_at'), todo('citas', 'fecha'), todo('cobros', 'fecha'), todo('servicios', 'created_at'),
      ])
      setDatos({ pacientes, citas, cobros, servicios })
      setError(null)
    } catch (e) { setError(e.message || 'Error al cargar') }
  }, [clinicaId])
  useEffect(() => { recargar() }, [recargar])
  return { datos, error, recargar }
}

// Friendly message for database errors (trial limit, permissions…)
export function mensajeError(error, porDefecto = 'No se pudo guardar') {
  const t = `${error?.message || ''} ${error?.hint || ''}`
  if (t.includes('LIMITE_PRUEBA')) return 'La versión de prueba permite 3 pacientes. Active su suscripción para registrar más.'
  return porDefecto
}

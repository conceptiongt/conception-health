import { useState, useEffect, useCallback } from 'react'
import { useDatos } from './useDatos'
import { leerBloqueos } from '../lib/bloqueos'

// Agenda blocks of the session's clinic. A failed read leaves an empty list (and `error`), never a crash.
export function useBloqueos() {
  const { clinica } = useDatos()
  const [bloqueos, setBloqueos] = useState([])
  const [error, setError] = useState(false)
  const recargar = useCallback(async () => {
    try { setBloqueos(await leerBloqueos(clinica?.id)); setError(false) } catch { setBloqueos([]); setError(true) }
  }, [clinica?.id])
  useEffect(() => { recargar() }, [recargar])
  return { bloqueos, setBloqueos, recargar, error }
}

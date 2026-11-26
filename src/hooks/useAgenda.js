import { useState, useEffect, useCallback, useMemo } from 'react'
import { useDatos } from './useDatos'
import { leerAgenda, unirAgenda } from '../lib/agenda'

// The clinic's own calendar events of the session's clinic: `agenda` = every entry (`bloquea` tells «no disponible» from flexible),
// `bloqueos` = only the blocking ones (what Registrar, CitaModal and Inicio mark). A failed read leaves empty lists (and `error`), never a crash.
export function useAgenda() {
  const { clinica } = useDatos()
  const [agenda, setAgenda] = useState([])
  const [error, setError] = useState(false)
  const recargar = useCallback(async () => {
    try { setAgenda(unirAgenda(await leerAgenda(clinica?.id))); setError(false) } catch { setAgenda([]); setError(true) }
  }, [clinica?.id])
  useEffect(() => { recargar() }, [recargar])
  const bloqueos = useMemo(() => agenda.filter(e => e.bloquea), [agenda])
  return { agenda, bloqueos, setAgenda, recargar, error }
}

import { useState, useEffect } from 'react'
import { googleEstado, alAvisoGoogle } from '../lib/google'

// true while Google Calendar is connected AND confirmed (and not asking to reconnect): the only state in which anything is sent to Google
export function useGoogleListo() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    let vivo = true
    const leer = () => googleEstado().then(e => { if (vivo) setOk(!!(e?.conectada && e.confirmada && e.estado !== 'error')) })
    leer()
    const quitar = alAvisoGoogle(leer)
    return () => { vivo = false; quitar() }
  }, [])
  return ok
}

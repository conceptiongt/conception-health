import { useEffect, useRef, useState } from 'react'

// Staff accounts (hospital): after `total` seconds without mouse, keyboard or touch input the session ends. `aviso` seconds before, a warning is
// shown (`restante` counts down) and only «Seguir conectado» keeps the session. Uses timestamps (not timers alone), so a sleeping laptop or a
// background tab ends the session as soon as it wakes. The last activity is shared between tabs through localStorage: an active tab keeps the
// others alive (and dismisses their warning). VITE_INACTIVIDAD_SEG is a testing hook (default 900 s = 15 minutes).
const TOTAL = Number(import.meta.env.VITE_INACTIVIDAD_SEG) || 15 * 60
const LS = 'conception.actividad'
const leer = () => { try { return Number(localStorage.getItem(LS)) || 0 } catch { return 0 } }
const escribir = (t) => { try { localStorage.setItem(LS, String(t)) } catch { /* private mode */ } }

export function useInactividad(activo, onExpira, total = TOTAL, aviso = Math.min(60, total / 3)) {
  const ultimo = useRef(Date.now())
  const avisando = useRef(false)
  const escrito = useRef(0)
  const [restante, setRestante] = useState(null) // null = no warning; otherwise whole seconds left
  const salir = useRef(onExpira)
  salir.current = onExpira

  useEffect(() => {
    if (!activo) return
    ultimo.current = Date.now(); escribir(ultimo.current); escrito.current = ultimo.current
    const tocar = () => {
      if (avisando.current) return // during the warning only the button counts
      const ahora = Date.now()
      ultimo.current = ahora
      if (ahora - escrito.current > 2000) { escrito.current = ahora; escribir(ahora) } // shared with the other tabs, at most every 2 s
    }
    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll']
    eventos.forEach(e => window.addEventListener(e, tocar, { passive: true, capture: true }))
    const revisar = () => {
      ultimo.current = Math.max(ultimo.current, leer()) // another tab may have been active
      const quieto = (Date.now() - ultimo.current) / 1000
      if (quieto >= total) { avisando.current = false; setRestante(null); salir.current(); return }
      if (quieto >= total - aviso) { avisando.current = true; setRestante(Math.max(1, Math.ceil(total - quieto))) }
      else if (avisando.current) { avisando.current = false; setRestante(null) } // activity elsewhere: the warning goes away
    }
    const id = setInterval(revisar, 1000)
    document.addEventListener('visibilitychange', revisar)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', revisar); eventos.forEach(e => window.removeEventListener(e, tocar, { capture: true })) }
  }, [activo, total, aviso])

  const seguir = () => { const t = Date.now(); ultimo.current = t; escrito.current = t; escribir(t); avisando.current = false; setRestante(null) }
  return { restante, seguir }
}

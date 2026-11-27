import { useEffect, useRef, useState } from 'react'

// Staff accounts (hospital): after `total` seconds without mouse, keyboard or touch input the session ends. `aviso` seconds before, a warning is
// shown (`restante` counts down) and only «Seguir conectado» keeps the session. Uses timestamps (not timers alone), so a sleeping laptop or a
// background tab ends the session as soon as it wakes. VITE_INACTIVIDAD_SEG is a testing hook (default 900 s = 15 minutes).
const TOTAL = Number(import.meta.env.VITE_INACTIVIDAD_SEG) || 15 * 60
export function useInactividad(activo, onExpira, total = TOTAL, aviso = Math.min(60, total / 3)) {
  const ultimo = useRef(Date.now())
  const avisando = useRef(false)
  const [restante, setRestante] = useState(null) // null = no warning; otherwise whole seconds left
  const salir = useRef(onExpira)
  salir.current = onExpira

  useEffect(() => {
    if (!activo) return
    ultimo.current = Date.now()
    const tocar = () => { if (!avisando.current) ultimo.current = Date.now() } // during the warning only the button counts
    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll']
    eventos.forEach(e => window.addEventListener(e, tocar, { passive: true, capture: true }))
    const revisar = () => {
      const quieto = (Date.now() - ultimo.current) / 1000
      if (quieto >= total) { avisando.current = false; setRestante(null); salir.current(); return }
      if (quieto >= total - aviso) { avisando.current = true; setRestante(Math.max(1, Math.ceil(total - quieto))) }
    }
    const id = setInterval(revisar, 1000)
    document.addEventListener('visibilitychange', revisar)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', revisar); eventos.forEach(e => window.removeEventListener(e, tocar, { capture: true })) }
  }, [activo, total, aviso])

  const seguir = () => { ultimo.current = Date.now(); avisando.current = false; setRestante(null) }
  return { restante, seguir }
}

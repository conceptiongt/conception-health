import { useEffect, useRef } from 'react'

// Calls `fn` every `ms` while the tab is visible, and again when the window gets focus or becomes visible.
// `fn` must guard itself against overlapping calls (the data hooks keep an in-flight flag) and stop asking once a table is known to be missing.
export function useRefrescar(fn, ms, activo = true) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!activo) return
    const tic = () => { if (document.visibilityState === 'visible') ref.current() }
    const id = ms > 0 ? setInterval(tic, ms) : null
    window.addEventListener('focus', tic)
    document.addEventListener('visibilitychange', tic)
    return () => { if (id) clearInterval(id); window.removeEventListener('focus', tic); document.removeEventListener('visibilitychange', tic) }
  }, [ms, activo])
}

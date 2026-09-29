import { useState, useEffect } from 'react'
import { C } from '../../lib/theme'

let push = () => {}
export const toast = {
  success: (m) => push({ m, tipo: 'ok' }),
  error: (m) => push({ m, tipo: 'error' }),
}

export function ToastContainer() {
  const [items, setItems] = useState([])
  useEffect(() => {
    push = (t) => {
      const id = Math.random()
      setItems(p => [...p, { ...t, id }])
      setTimeout(() => setItems(p => p.filter(x => x.id !== id)), 3500)
    }
  }, [])
  return (
    <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: 'min(92vw, 420px)' }}>
      {items.map(t => (
        <div key={t.id} role="status" style={{
          padding: '11px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#fff', width: '100%', textAlign: 'center',
          background: t.tipo === 'error' ? C.red : C.black, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}>{t.m}</div>
      ))}
    </div>
  )
}

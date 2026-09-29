import { useState, useEffect } from 'react'
import { C } from '../../lib/theme'
import { Icon } from './Icon'

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
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: 'min(92vw, 440px)' }}>
      {items.map(t => (
        <div key={t.id} role="status" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600,
          color: '#fff', width: '100%', background: t.tipo === 'error' ? C.red : C.black, boxShadow: '0 12px 32px rgba(11,17,32,0.25)', animation: 'aparecer 0.2s ease',
        }}>
          <Icon name={t.tipo === 'error' ? 'alerta' : 'check'} size={17} />{t.m}
        </div>
      ))}
    </div>
  )
}

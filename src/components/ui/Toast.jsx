import { useState, useEffect } from 'react'
import { C, GLASS } from '../../lib/theme'
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
      {items.map(t => {
        const error = t.tipo === 'error'
        const col = error ? C.red : C.green
        return (
          <div key={t.id} role="status" className="toast-item" style={{
            ...GLASS, background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16, fontSize: 14, fontWeight: 500,
            color: C.black, width: '100%', boxShadow: '0 14px 40px rgba(31,72,160,0.18)',
          }}>
            <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: error ? C.redLight : C.greenLight, color: col }}>
              <Icon name={error ? 'alerta' : 'check'} size={14} />
            </span>
            <span style={{ minWidth: 0, lineHeight: 1.4 }}>{t.m}</span>
          </div>
        )
      })}
    </div>
  )
}

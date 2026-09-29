import { useEffect } from 'react'
import { C } from '../../lib/theme'

export function Modal({ title, subtitle, onClose, children, maxWidth = 600 }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,27,46,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', borderBottom: `1px solid ${C.g100}`, position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.black }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 34, height: 34, borderRadius: 8, border: `1.5px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontSize: 18, color: C.g500 }}>×</button>
        </div>
        <div style={{ padding: '20px 22px' }}>{children}</div>
      </div>
    </div>
  )
}

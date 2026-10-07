import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../../lib/theme'
import { Icon } from './Icon'

// Every window opens above the ones already open (a window opened from another one is never hidden behind it)
let capas = 0

export function Modal({ title, subtitle, onClose, children, maxWidth = 620 }) {
  const [z] = useState(() => 200 + (++capas) * 2)
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape' && z === 200 + capas * 2) onClose?.() } // Escape closes only the top window
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose, z])
  useEffect(() => () => { capas = Math.max(0, capas - 1) }, [])
  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,28,30,0.32)', zIndex: z, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(28,28,30,0.18)', animation: 'aparecer 0.18s ease' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 24px 16px', position: 'sticky', top: 0, background: '#fff', zIndex: 2, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 500, color: C.black, letterSpacing: '-0.01em' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: C.g500, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="btn-ghost" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: C.g500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cerrar" size={17} />
          </button>
        </div>
        <div style={{ padding: '20px 24px 22px' }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

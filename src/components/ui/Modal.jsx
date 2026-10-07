import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { C, SERIF } from '../../lib/theme'
import { Icon } from './Icon'

// Every window opens above the ones already open (a window opened from another one is never hidden behind it)
let capas = 0

export function Modal({ title, subtitle, onClose, children, maxWidth = 600 }) {
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(51,51,51,0.35)', backdropFilter: 'blur(3px)', zIndex: z, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 5px 55px rgba(0,0,0,0.25)', animation: 'aparecer 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '22px 26px 16px', position: 'sticky', top: 0, background: '#fff', zIndex: 2, borderBottom: `1px solid ${C.g100}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 500, color: C.black, letterSpacing: '-0.015em' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: C.g400, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 36, height: 36, borderRadius: 160, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', color: C.g500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cerrar" size={17} />
          </button>
        </div>
        <div style={{ padding: '20px 26px 24px' }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

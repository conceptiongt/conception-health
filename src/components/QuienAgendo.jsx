import { useState } from 'react'
import { C } from '../lib/theme'
import { useDatos } from '../hooks/useDatos'

// "¿Quién agendó?": the signed-in user by default, or another person's name when several people share one user
export const nombreUsuario = (perfil) => (perfil?.nombre || perfil?.email || '').trim()

export function QuienAgendo({ valor, onChange }) {
  const { perfil } = useDatos()
  const yo = nombreUsuario(perfil)
  const [otro, setOtro] = useState(() => !!valor && valor !== yo)
  const pill = (activo) => ({
    height: 34, padding: '0 14px', borderRadius: 160, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500,
    border: `1.5px solid ${activo ? C.purple : C.g200}`, background: activo ? C.purpleMid : '#fff', color: activo ? C.purple : C.g700,
    maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  })
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" style={pill(!otro)} onClick={() => { setOtro(false); onChange(yo) }} title={yo}>{yo || 'Yo'}</button>
        <button type="button" style={pill(otro)} onClick={() => { setOtro(true); onChange(valor && valor !== yo ? valor : '') }}>Otra persona</button>
      </div>
      {otro && (
        <input value={valor || ''} onChange={e => onChange(e.target.value.replace(/[<>]/g, '').slice(0, 80))} autoFocus placeholder="Nombre de quien agendó"
          style={{ marginTop: 8, width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px', borderRadius: 12, border: `1px solid ${C.g200}`, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
      )}
    </div>
  )
}

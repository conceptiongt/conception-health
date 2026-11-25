import { C } from '../../lib/theme'
import { Icon } from './Icon'

// Pill buttons: the clinic accent is the single action color (gradient + soft glow); secondary actions are glass.
// Hover / active / glow live in index.css (.btn, .btn-primary, .btn-ghost) so they can use :hover.
const PRIMARIO = { color: C.onPurple, border: '1px solid transparent' }
const VARIANTS = {
  primary: PRIMARIO,
  brand: PRIMARIO,
  ghost: { background: 'rgba(255,255,255,0.8)', color: C.black, border: `1px solid ${C.g200}` },
  danger: { background: 'rgba(255,255,255,0.8)', color: C.red, border: '1px solid #F4C4CD' },
  soft: { background: C.purpleMid, color: 'var(--acento-fuerte)', border: `1px solid ${C.purpleLight}` },
  texto: { background: 'transparent', color: C.g600, border: '1px solid transparent' },
}
const CLASE = { primary: 'btn btn-primary', brand: 'btn btn-primary', ghost: 'btn btn-ghost', danger: 'btn btn-ghost', soft: 'btn btn-soft', texto: 'btn btn-ghost' }

export function Button({ children, variant = 'primary', size = 'md', icon, disabled, onClick, type = 'button', style = {}, title }) {
  const sm = size === 'sm', lg = size === 'lg'
  return (
    <button
      className={CLASE[variant] || CLASE.primary}
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        borderRadius: 160, fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap', lineHeight: 1.1, letterSpacing: '0.005em',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        padding: sm ? '7px 14px' : lg ? '13px 26px' : '10px 20px',
        fontSize: sm ? 13 : lg ? 15 : 14,
        ...(VARIANTS[variant] || VARIANTS.primary), ...style,
      }}
    >
      {icon && <Icon name={icon} size={sm ? 15 : 16} />}
      {children}
    </button>
  )
}

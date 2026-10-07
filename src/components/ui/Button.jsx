import { C } from '../../lib/theme'
import { Icon } from './Icon'

// Pill buttons: violet is the single action color; secondary actions are outlined
const VARIANTS = {
  primary: { background: C.purple, color: '#fff', border: `1px solid ${C.purple}` },
  brand: { background: C.purple, color: '#fff', border: `1px solid ${C.purple}` },
  ghost: { background: '#fff', color: C.black, border: `1px solid ${C.g300}` },
  danger: { background: '#fff', color: C.red, border: '1px solid #F4C4CD' },
  soft: { background: C.purpleMid, color: C.purple, border: `1px solid ${C.purpleLight}` },
}

export function Button({ children, variant = 'primary', size = 'md', icon, disabled, onClick, type = 'button', style = {}, title }) {
  const sm = size === 'sm', lg = size === 'lg'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        borderRadius: 160, fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap', lineHeight: 1.1, letterSpacing: '0.005em',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'transform 0.08s, box-shadow 0.15s',
        padding: sm ? '7px 14px' : lg ? '13px 26px' : '10px 20px',
        fontSize: sm ? 13 : lg ? 15 : 14,
        ...VARIANTS[variant], ...style,
      }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.98)' }}
      onMouseUp={e => { e.currentTarget.style.transform = '' }}
      onMouseLeave={e => { e.currentTarget.style.transform = '' }}
    >
      {icon && <Icon name={icon} size={sm ? 15 : 16} />}
      {children}
    </button>
  )
}

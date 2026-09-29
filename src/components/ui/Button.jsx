import { C } from '../../lib/theme'
import { Icon } from './Icon'

const VARIANTS = {
  primary: { background: C.black, color: '#fff', border: `1px solid ${C.black}`, boxShadow: '0 1px 2px rgba(15,23,42,0.18)' },
  brand: { background: C.purple, color: '#fff', border: `1px solid ${C.purple}`, boxShadow: '0 1px 2px rgba(109,63,224,0.3)' },
  ghost: { background: '#fff', color: C.g700, border: `1px solid ${C.g200}` },
  danger: { background: '#fff', color: C.red, border: '1px solid #F1CFCF' },
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
        borderRadius: 10, fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.1, letterSpacing: '0.005em',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'transform 0.08s, box-shadow 0.15s',
        padding: sm ? '8px 12px' : lg ? '13px 22px' : '10px 16px',
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

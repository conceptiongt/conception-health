import { C } from '../../lib/theme'
import { Icon } from './Icon'

// Primary = the clinic's accent; secondary actions are outlined; danger is quiet until needed
const VARIANTS = {
  primary: { background: C.purple, color: '#fff', border: `1px solid ${C.purple}` },
  brand: { background: C.purple, color: '#fff', border: `1px solid ${C.purple}` },
  ghost: { background: '#fff', color: C.black, border: `1px solid ${C.g200}` },
  danger: { background: '#fff', color: C.red, border: '1px solid #EBCFCC' },
  soft: { background: C.purpleMid, color: C.purple, border: '1px solid transparent' },
  texto: { background: 'transparent', color: C.g600, border: '1px solid transparent' },
}

export function Button({ children, variant = 'primary', size = 'md', icon, disabled, onClick, type = 'button', style = {}, title }) {
  const sm = size === 'sm', lg = size === 'lg'
  const v = VARIANTS[variant] || VARIANTS.primary
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={variant === 'primary' || variant === 'brand' ? 'btn-primary' : 'btn-ghost'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        borderRadius: 8, fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap', lineHeight: 1.1,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        height: sm ? 32 : lg ? 44 : 38, padding: sm ? '0 11px' : lg ? '0 20px' : '0 14px',
        fontSize: sm ? 13 : lg ? 15 : 13.5,
        ...v, ...style,
      }}
    >
      {icon && <Icon name={icon} size={sm ? 14 : 15} />}
      {children}
    </button>
  )
}

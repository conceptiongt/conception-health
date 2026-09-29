import { C } from '../../lib/theme'

const VARIANTS = {
  primary: { background: C.purple, color: '#fff', border: 'none' },
  ghost: { background: '#fff', color: C.g700, border: `1.5px solid ${C.g200}` },
  danger: { background: '#fff', color: C.red, border: '1.5px solid #F5C2C2' },
  soft: { background: C.purpleLight, color: C.purple, border: `1.5px solid ${C.purpleLight}` },
}

export function Button({ children, variant = 'primary', size = 'md', disabled, onClick, type = 'button', style = {}, title }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: 9, fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.1,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        padding: size === 'sm' ? '7px 12px' : size === 'lg' ? '13px 22px' : '10px 16px',
        fontSize: size === 'sm' ? 13 : size === 'lg' ? 15 : 14,
        ...VARIANTS[variant], ...style,
      }}
    >{children}</button>
  )
}

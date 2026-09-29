import { C } from '../../lib/theme'

const base = {
  width: '100%', padding: '10px 12px', border: `1.5px solid ${C.g200}`, borderRadius: 9,
  fontSize: 14, color: C.black, outline: 'none', background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box',
}

export function Campo({ label, children, full, ayuda }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, minWidth: 0 }}>
      {label && <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.g600, marginBottom: 5 }}>{label}</label>}
      {children}
      {ayuda && <div style={{ fontSize: 11.5, color: C.g400, marginTop: 4 }}>{ayuda}</div>}
    </div>
  )
}

export const Input = ({ value, onChange, ...p }) => (
  <input value={value ?? ''} onChange={e => onChange(e.target.value)} style={base} {...p} />
)
export const Textarea = ({ value, onChange, rows = 3, ...p }) => (
  <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows} style={{ ...base, resize: 'vertical', lineHeight: 1.5 }} {...p} />
)
export const Select = ({ value, onChange, children, ...p }) => (
  <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...base, cursor: 'pointer' }} {...p}>{children}</select>
)

export function Grid({ children, min = 220 }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: 14 }}>{children}</div>
}

import { C } from '../../lib/theme'

const base = {
  width: '100%', padding: '11px 13px', border: `1px solid ${C.g200}`, borderRadius: 10,
  fontSize: 14, color: C.black, background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

export function Campo({ label, children, full, ayuda }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, minWidth: 0 }}>
      {label && <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.g600, marginBottom: 6 }}>{label}</label>}
      {children}
      {ayuda && <div style={{ fontSize: 12, color: C.g400, marginTop: 5 }}>{ayuda}</div>}
    </div>
  )
}

export const Input = ({ value, onChange, ...p }) => (
  <input value={value ?? ''} onChange={e => onChange(e.target.value)} style={base} {...p} />
)
export const Textarea = ({ value, onChange, rows = 3, ...p }) => (
  <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows} style={{ ...base, resize: 'vertical', lineHeight: 1.55 }} {...p} />
)
export const Select = ({ value, onChange, children, ...p }) => (
  <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...base, cursor: 'pointer' }} {...p}>{children}</select>
)

export function Grid({ children, min = 220 }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: 16 }}>{children}</div>
}

// Small select / search input used in filter bars
export const filtroStyle = {
  padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.g200}`, fontSize: 13.5, background: '#fff', color: C.black, fontFamily: 'inherit',
}

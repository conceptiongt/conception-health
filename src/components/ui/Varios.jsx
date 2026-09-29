import { C, SERIF, SHADOW } from '../../lib/theme'
import { Icon } from './Icon'

export function Spinner({ size = 24 }) {
  return <div style={{ width: size, height: size, border: `2px solid ${C.g200}`, borderTopColor: C.purple, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
}
export function Cargando() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 70 }}><Spinner size={28} /></div>
}

export function Badge({ children, color = C.g600, bg = C.g100 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color, background: bg }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />{children}
    </span>
  )
}

export function Card({ title, right, children, style = {} }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, boxShadow: SHADOW, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 15.5, fontWeight: 700, color: C.black, letterSpacing: '-0.01em' }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Vacio({ icono = 'archivo', titulo, texto, children }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 20px', color: C.g500 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Icon name={icono} size={26} />
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: C.black, marginBottom: 6 }}>{titulo}</div>
      {texto && <div style={{ fontSize: 14, marginBottom: 18 }}>{texto}</div>}
      {children}
    </div>
  )
}

export function Stat({ icono, label, valor, sub, color = C.purple, bg = C.purpleMid }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: '18px 20px', boxShadow: SHADOW, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={icono} size={17} />
        </div>
        <div style={{ fontSize: 13, color: C.g500, fontWeight: 600 }}>{label}</div>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600, color: C.black, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export function Encabezado({ titulo, subtitulo, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600, color: C.black, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{titulo}</h1>
        {subtitulo && <div style={{ fontSize: 14, color: C.g500, marginTop: 6 }}>{subtitulo}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

// Responsive table: scrolls sideways on phones
export function Tabla({ columnas, filas, onFila, vacio = 'Sin registros' }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, overflowX: 'auto', boxShadow: SHADOW }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {columnas.map(c => <th key={c} style={{ padding: '14px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.line}` }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr><td colSpan={columnas.length} style={{ padding: 40, textAlign: 'center', color: C.g400 }}>{vacio}</td></tr>
          ) : filas.map((f, i) => (
            <tr key={f.key ?? i} className={onFila ? 'fila' : undefined} onClick={onFila ? () => onFila(f) : undefined}
              style={{ borderTop: i ? `1px solid ${C.g100}` : 'none', cursor: onFila ? 'pointer' : 'default' }}>
              {f.celdas.map((c, j) => <td key={j} style={{ padding: '14px 18px', color: C.black, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Pill-style tab switcher
export function Pestanas({ opciones, valor, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, flexWrap: 'wrap', boxShadow: SHADOW }}>
      {opciones.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
          background: valor === o.value ? C.black : 'transparent', color: valor === o.value ? '#fff' : C.g500,
        }}>{o.icono && <Icon name={o.icono} size={16} />}{o.label}</button>
      ))}
    </div>
  )
}

export function Logo({ variant = 'dark', height = 36 }) {
  return <img src={variant === 'light' ? '/logo-light.png' : '/logo-dark.png'} alt="Conception" style={{ height, width: 'auto', display: 'block' }} />
}

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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', color, background: bg }}>
      {children}
    </span>
  )
}

export function Card({ title, right, children, style = {} }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: 24, boxShadow: SHADOW, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 500, color: C.black, letterSpacing: '-0.015em' }}>{title}</div>
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
      <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: C.black, marginBottom: 6, letterSpacing: '-0.015em' }}>{titulo}</div>
      {texto && <div style={{ fontSize: 14, marginBottom: 18 }}>{texto}</div>}
      {children}
    </div>
  )
}

export function Stat({ icono, label, valor, sub, color = C.purple, bg = C.purpleMid }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: '20px 22px', boxShadow: SHADOW, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {icono && <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={icono} size={17} />
        </div>}
        <div style={{ fontSize: 13, color: C.g500, fontWeight: 600 }}>{label}</div>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 500, color: icono ? C.black : (color || C.black), lineHeight: 1.1, letterSpacing: '-0.03em' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export function Encabezado({ titulo, subtitulo, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 400, color: C.black, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.15 }}>{titulo}</h1>
        {subtitulo && <div style={{ fontSize: 14, color: C.g500, marginTop: 6 }}>{subtitulo}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

// Responsive table: scrolls sideways on phones
export function Tabla({ columnas, filas, onFila, vacio = 'Sin registros' }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, overflowX: 'auto', boxShadow: SHADOW }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {columnas.map((c, i) => <th key={i} style={{ padding: '14px 18px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: C.g500, whiteSpace: 'nowrap', background: C.g50, borderBottom: `1px solid ${C.line}` }}>{c}</th>)}
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
    <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, flexWrap: 'wrap' }}>
      {opciones.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 160, border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 500, fontFamily: 'inherit',
          background: valor === o.value ? C.purple : 'transparent', color: valor === o.value ? '#fff' : C.g600,
        }}>{o.icono && <Icon name={o.icono} size={16} />}{o.label}</button>
      ))}
    </div>
  )
}

export function Logo({ variant = 'dark', height = 36 }) {
  return <img src={variant === 'light' ? '/logo-light.png' : '/logo-dark.png'} alt="Conception" style={{ height, width: 'auto', display: 'block' }} />
}

// Metric cards in a responsive grid (each one a white rounded card)
export function Indicadores({ items, style }) {
  return (
    <div className="indicadores" style={style}>
      {items.filter(Boolean).map((it, i) => (
        <div key={i} onClick={it.onClick} className={it.onClick ? 'fila op-tile' : undefined} style={{ padding: '18px 20px', cursor: it.onClick ? 'pointer' : 'default', minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.g500, display: 'flex', alignItems: 'center', gap: 7 }}>
            {it.punto && <span style={{ width: 8, height: 8, borderRadius: 4, background: it.punto }} />}{it.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 500, color: it.color || C.black, letterSpacing: '-0.03em', marginTop: 6, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.valor}</div>
          {it.sub && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// Pill segmented buttons: "Todas | Guatemala | Petén"
export function Segmentos({ opciones, valor, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, flexWrap: 'wrap' }}>
      {opciones.map(o => {
        const activo = valor === o.value
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            padding: '7px 15px', borderRadius: 160, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
            fontWeight: 500, background: activo ? C.purple : 'transparent', color: activo ? '#fff' : C.g600,
          }}>{o.label}{o.n != null && <span style={{ marginLeft: 6, opacity: 0.7 }}>{o.n}</span>}</button>
        )
      })}
    </div>
  )
}

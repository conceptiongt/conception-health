import { C } from '../../lib/theme'
import { Icon } from './Icon'

export function Spinner({ size = 22 }) {
  return <div style={{ width: size, height: size, border: `2px solid ${C.g200}`, borderTopColor: C.purple, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
}
export function Cargando() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 70 }}><Spinner /></div>
}

// Status label: small, square-ish, tinted
export function Badge({ children, color = C.g600, bg = C.g100 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', color, background: bg, lineHeight: 1.6 }}>
      {children}
    </span>
  )
}

// Flat panel with a hairline border; the title sits on its own row with a divider
export function Card({ title, right, children, style = {} }) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap', minHeight: 56 }}>
          <h3 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 500, color: C.black, letterSpacing: '-0.01em' }}>{title}</h3>
          {right}
        </div>
      )}
      <div style={{ padding: '16px 20px 18px' }}>{children}</div>
    </section>
  )
}

export function Vacio({ icono = 'archivo', titulo, texto, children }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: C.g500 }}>
      <div style={{ color: C.g300, marginBottom: 12, display: 'inline-flex' }}><Icon name={icono} size={30} stroke={1.4} /></div>
      <div style={{ fontSize: 16, fontWeight: 500, color: C.black, marginBottom: 4 }}>{titulo}</div>
      {texto && <div style={{ fontSize: 13.5, marginBottom: 18, maxWidth: 440, marginInline: 'auto', lineHeight: 1.6 }}>{texto}</div>}
      {children}
    </div>
  )
}

// One metric. Several in a row form a strip (see Indicadores)
export function Stat({ label, valor, sub, color }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: C.g500 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500, color: color || C.black, lineHeight: 1.25, letterSpacing: '-0.02em', marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: C.g400, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// A single bordered strip of metrics separated by hairlines
export function Indicadores({ items, style }) {
  return (
    <div className="indicadores" style={style}>
      {items.filter(Boolean).map((it, i) => (
        <div key={i} onClick={it.onClick} style={{ padding: '16px 20px', cursor: it.onClick ? 'pointer' : 'default', minWidth: 0 }} className={it.onClick ? 'fila' : undefined}>
          <div style={{ fontSize: 12.5, color: C.g500, display: 'flex', alignItems: 'center', gap: 6 }}>
            {it.punto && <span style={{ width: 7, height: 7, borderRadius: 4, background: it.punto }} />}{it.label}
          </div>
          <div style={{ fontSize: 23, fontWeight: 500, color: it.color || C.black, letterSpacing: '-0.02em', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.valor}</div>
          {it.sub && <div style={{ fontSize: 12, color: C.g400, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

export function Encabezado({ titulo, subtitulo, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 22, paddingBottom: 18, borderBottom: `1px solid ${C.line}` }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h1 style={{ fontSize: 26, fontWeight: 500, color: C.black, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{titulo}</h1>
        {subtitulo && <div style={{ fontSize: 13.5, color: C.g500, marginTop: 4 }}>{subtitulo}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
    </div>
  )
}

// Dense, readable table; scrolls sideways on phones
export function Tabla({ columnas, filas, onFila, vacio = 'Sin registros' }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr>
            {columnas.map((c, i) => <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: C.g500, whiteSpace: 'nowrap', background: C.g50, borderBottom: `1px solid ${C.line}` }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr><td colSpan={columnas.length} style={{ padding: 36, textAlign: 'center', color: C.g400 }}>{vacio}</td></tr>
          ) : filas.map((f, i) => (
            <tr key={f.key ?? i} className={onFila ? 'fila' : undefined} onClick={onFila ? () => onFila(f) : undefined}
              style={{ borderTop: i ? `1px solid ${C.g100}` : 'none', cursor: onFila ? 'pointer' : 'default' }}>
              {f.celdas.map((c, j) => <td key={j} style={{ padding: '11px 16px', color: C.black, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Underlined tabs
export function Pestanas({ opciones, valor, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.line}`, overflowX: 'auto' }}>
      {opciones.map(o => {
        const activo = valor === o.value
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: activo ? 500 : 400, fontFamily: 'inherit', whiteSpace: 'nowrap', marginBottom: -1,
            color: activo ? C.black : C.g500, borderBottom: `2px solid ${activo ? C.purple : 'transparent'}`,
          }}>{o.icono && <Icon name={o.icono} size={15} style={{ color: activo ? C.purple : C.g400 }} />}{o.label}</button>
        )
      })}
    </div>
  )
}

// Segmented buttons: "Todas | Guatemala | Petén"
export function Segmentos({ opciones, valor, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.g200}`, borderRadius: 8, overflow: 'hidden', background: '#fff', flexWrap: 'wrap' }}>
      {opciones.map((o, i) => {
        const activo = valor === o.value
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            padding: '7px 14px', border: 'none', borderLeft: i ? `1px solid ${C.g200}` : 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
            fontWeight: activo ? 500 : 400, background: activo ? C.purpleMid : '#fff', color: activo ? C.purple : C.g600,
          }}>{o.label}{o.n != null && <span style={{ marginLeft: 6, color: C.g400 }}>{o.n}</span>}</button>
        )
      })}
    </div>
  )
}

// The clinic's logo when it has one, otherwise its initials
export function Logo({ variant = 'dark', height = 36 }) {
  return <img src={variant === 'light' ? '/logo-light.png' : '/logo-dark.png'} alt="Conception" style={{ height, width: 'auto', display: 'block' }} />
}

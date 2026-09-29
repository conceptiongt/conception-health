import { C } from '../../lib/theme'

export function Spinner({ size = 24 }) {
  return <div style={{ width: size, height: size, border: `2.5px solid ${C.g200}`, borderTopColor: C.purple, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
}
export function Cargando() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={30} /></div>
}

export function Badge({ children, color = C.g600, bg = C.g100 }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color, background: bg }}>{children}</span>
}

export function Card({ title, right, children, style = {} }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.g200}`, borderRadius: 14, padding: 18, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C.black }}>{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Vacio({ icono = '📭', titulo, texto, children }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: C.g500 }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>{icono}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.g700, marginBottom: 4 }}>{titulo}</div>
      {texto && <div style={{ fontSize: 13.5, marginBottom: 16 }}>{texto}</div>}
      {children}
    </div>
  )
}

export function Stat({ icono, label, valor, sub, color = C.purple, bg = C.purpleLight }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.g200}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{icono}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.black, lineHeight: 1.1 }}>{valor}</div>
        <div style={{ fontSize: 12, color: C.g500, fontWeight: 600, marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.g400, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

export function Encabezado({ titulo, subtitulo, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.black, margin: 0, letterSpacing: -0.4 }}>{titulo}</h1>
        {subtitulo && <div style={{ fontSize: 13.5, color: C.g500, marginTop: 3 }}>{subtitulo}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

// Simple responsive table: scrolls sideways on phones
export function Tabla({ columnas, filas, onFila, vacio = 'Sin registros' }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.g200}`, borderRadius: 12, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr style={{ background: C.g50 }}>
            {columnas.map(c => <th key={c} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.g500, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr><td colSpan={columnas.length} style={{ padding: 32, textAlign: 'center', color: C.g400 }}>{vacio}</td></tr>
          ) : filas.map((f, i) => (
            <tr key={f.key ?? i} onClick={onFila ? () => onFila(f) : undefined}
              style={{ borderTop: `1px solid ${C.g100}`, cursor: onFila ? 'pointer' : 'default' }}
              onMouseEnter={e => { if (onFila) e.currentTarget.style.background = C.g50 }}
              onMouseLeave={e => { e.currentTarget.style.background = '' }}>
              {f.celdas.map((c, j) => <td key={j} style={{ padding: '11px 14px', color: C.black, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Logo({ variant = 'dark', height = 36 }) {
  return <img src={variant === 'light' ? '/logo-light.png' : '/logo-dark.png'} alt="Conception" style={{ height, width: 'auto', display: 'block' }} />
}

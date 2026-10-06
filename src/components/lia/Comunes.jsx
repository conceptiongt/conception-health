import { C, SERIF } from '../../lib/theme'
import { etapa, partesWhatsApp, ampm } from '../../lib/lia'
import { Badge } from '../ui/Varios'
import { Icon } from '../ui/Icon'

export function EtapaBadge({ v, prueba }) {
  if (prueba) return <Badge color={C.blue} bg={C.blueLight}>Prueba</Badge>
  const e = etapa(v)
  return <Badge color={e.color} bg={e.bg}>{e.label}</Badge>
}

// WhatsApp-style text: *bold*, _italic_ and clickable links
export function TextoWA({ texto }) {
  return partesWhatsApp(texto).map(p =>
    p.tipo === 'link' ? <a key={p.i} href={p.t} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, wordBreak: 'break-all' }}>{p.t}</a>
      : p.tipo === 'b' ? <strong key={p.i}>{p.t}</strong>
      : p.tipo === 'i' ? <em key={p.i}>{p.t}</em>
      : <span key={p.i}>{p.t}</span>)
}

export function Burbuja({ m, mio, fondo, etiqueta, leido }) {
  return (
    <div style={{
      alignSelf: mio ? 'flex-end' : 'flex-start', maxWidth: '82%', background: fondo, borderRadius: 12,
      [mio ? 'borderTopRightRadius' : 'borderTopLeftRadius']: 4, padding: '7px 10px 5px', fontSize: 14.5, lineHeight: 1.42,
      boxShadow: '0 1px 0 rgba(15,23,42,0.08)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: C.black,
    }}>
      {etiqueta && <div style={{ fontSize: 10.5, fontWeight: 700, color: C.purple, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{etiqueta}</div>}
      {m.foto && (String(m.foto).startsWith('data:')
        ? <img src={m.foto} alt="Foto que mandó el paciente" style={{ display: 'block', maxWidth: 220, width: '100%', borderRadius: 8, marginBottom: 5 }} />
        : <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.g500, marginBottom: 4 }}><Icon name="camara" size={15} />Foto</div>)}
      {m.texto && <TextoWA texto={m.texto} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, fontSize: 10.5, color: C.g400, marginTop: 2 }}>
        {m.created_at ? ampm(new Date(m.created_at)) : ''}{leido && <Icon name="check" size={12} stroke={2.4} style={{ color: '#3E97C9' }} />}
      </div>
    </div>
  )
}

export function Escribiendo() {
  return (
    <div className="lia-puntos" role="status" aria-label="Escribiendo" style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, padding: '12px 14px', background: '#fff', borderRadius: 12, borderTopLeftRadius: 4, boxShadow: '0 1px 0 rgba(15,23,42,0.08)' }}>
      <span /><span /><span />
    </div>
  )
}

export const NotaSistema = ({ children }) => (
  <div style={{ alignSelf: 'center', fontSize: 12, color: C.g600, background: 'rgba(255,255,255,0.85)', padding: '4px 10px', borderRadius: 8, margin: '6px 0', textAlign: 'center', maxWidth: '90%' }}>{children}</div>
)

// Section title used inside the Lía tabs
export function Titulo({ children, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', margin: '26px 0 12px' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: C.black, letterSpacing: '-0.01em' }}>{children}</div>
        {sub && <div style={{ fontSize: 13.5, color: C.g500, marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function Interruptor({ checked, onChange, label, id }) {
  return (
    <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: C.g700, fontWeight: 500 }}>
      <input id={id} type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
      <span aria-hidden="true" style={{ width: 38, height: 22, borderRadius: 11, background: checked ? C.purple : C.g300, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 3, left: checked ? 19 : 3, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
      </span>
      {label}
    </label>
  )
}

export function Segmentos({ opciones, valor, onChange }) {
  return (
    <div role="group" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 3, padding: 3, background: C.g50, border: `1px solid ${C.line}`, borderRadius: 12 }}>
      {opciones.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={valor === o.value} style={{
          padding: '8px 13px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit',
          background: valor === o.value ? '#fff' : 'transparent', color: valor === o.value ? C.black : C.g500,
          fontWeight: valor === o.value ? 700 : 500, boxShadow: valor === o.value ? '0 1px 2px rgba(15,23,42,0.12)' : 'none',
        }}>{o.label}</button>
      ))}
    </div>
  )
}

export const botonMini = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 9, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.g700, fontFamily: 'inherit' }

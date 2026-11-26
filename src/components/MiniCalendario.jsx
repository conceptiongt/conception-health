import { useState, useEffect, useId } from 'react'
import { C } from '../lib/theme'
import { MESES } from '../lib/constantes'
import { hoyISO } from '../lib/formato'
import { Icon } from './ui/Icon'
import { DIAS_INICIAL, esISO, fechaLarga, matrizMes, partesISO, sumarMeses } from '../lib/calendario'

const etiquetaStyle = { display: 'block', fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 6 }
const flecha = { width: 34, height: 34, borderRadius: 160, border: `1px solid ${C.g200}`, background: 'rgba(255,255,255,0.9)', cursor: 'pointer', color: C.g600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontSize: 18, lineHeight: 1 }

// A date field whose month calendar opens in place (accordion), so it can never be clipped inside a window.
// Shared by the appointment picker and the agenda-block window. The caller decorates days:
//   marca(iso, sel) → small node at the bottom of the day · etiquetaDia(iso) → extra words for screen readers
//   estiloDia(iso, sel) → extra style for the day button · enRango(iso) → day is inside a highlighted range
//   leyenda → node under the grid · cierraAlElegir (default true)
export function MiniCalendario({ etiqueta, valor, onElegir, vacio = 'Elegir fecha', marca, etiquetaDia, estiloDia, enRango, leyenda, cierraAlElegir = true, minimo }) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const base = esISO(valor) ? valor : (minimo && esISO(minimo) ? minimo : hoyISO())
  const [vista, setVista] = useState(() => base.slice(0, 7) + '-01') // first day of the month being shown
  const hoy = hoyISO()
  useEffect(() => { if (esISO(valor)) setVista(valor.slice(0, 7) + '-01') }, [valor])
  const { y, m } = partesISO(vista)
  const semanas = matrizMes(y, m)
  const elegir = (iso) => { onElegir(iso); if (cierraAlElegir) setAbierto(false) }

  return (
    <div style={{ minWidth: 0 }} onKeyDown={e => { if (e.key === 'Escape' && abierto) { e.stopPropagation(); setAbierto(false) } }}>
      <span style={etiquetaStyle} id={`${id}-fecha`}>{etiqueta}</span>
      <button type="button" aria-expanded={abierto} aria-controls={`${id}-cal`} aria-labelledby={`${id}-fecha ${id}-valor`} onClick={() => setAbierto(a => !a)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        border: `1px solid ${abierto ? C.purple : C.g200}`, background: 'rgba(255,255,255,0.9)', fontFamily: 'inherit', fontSize: 14, color: C.black,
        boxShadow: abierto ? '0 0 0 3px var(--acento-anillo)' : 'none', transition: 'border-color 150ms, box-shadow 150ms', boxSizing: 'border-box',
      }}>
        <Icon name="citas" size={17} style={{ color: C.purple }} />
        <span id={`${id}-valor`} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{esISO(valor) ? fechaLarga(valor) : vacio}</span>
        <span style={{ display: 'inline-flex', color: C.g500, transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><Icon name="abajo" size={16} /></span>
      </button>

      {abierto && (
        <div id={`${id}-cal`} style={{ marginTop: 8, padding: '14px 14px 12px', borderRadius: 18, border: `1px solid ${C.line}`, background: 'rgba(255,255,255,0.95)', maxWidth: 380, animation: 'aparecer 0.2s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div aria-live="polite" style={{ flex: 1, fontWeight: 600, fontSize: 15, color: C.black }}>{MESES[m]} {y}</div>
            <button type="button" style={flecha} aria-label="Mes anterior" onClick={() => setVista(sumarMeses(vista, -1))}>‹</button>
            <button type="button" style={flecha} aria-label="Mes siguiente" onClick={() => setVista(sumarMeses(vista, 1))}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2, textAlign: 'center' }}>
            {DIAS_INICIAL.map((d, i) => <div key={i} aria-hidden="true" style={{ fontSize: 12, color: C.g500, padding: '4px 0', fontWeight: 600 }}>{d}</div>)}
            {semanas.flat().map(d => {
              const sel = d.iso === valor
              const pasado = d.iso < hoy
              const dentro = !sel && enRango?.(d.iso)
              return (
                <button key={d.iso} type="button" onClick={() => elegir(d.iso)} aria-pressed={sel} aria-label={`${fechaLarga(d.iso)}${etiquetaDia ? etiquetaDia(d.iso) : ''}`}
                  style={{
                    position: 'relative', height: 40, borderRadius: 12, border: d.iso === hoy && !sel ? `1.5px solid ${C.purple}` : '1.5px solid transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
                    fontWeight: sel || d.iso === hoy ? 700 : 500, background: sel ? C.purple : dentro ? 'var(--acento-tenue)' : 'transparent',
                    color: sel ? C.onPurple : !d.delMes || pasado ? C.g400 : C.black, opacity: d.delMes ? 1 : 0.6, padding: 0,
                    ...(estiloDia ? estiloDia(d.iso, sel) : null),
                  }}>
                  {d.dia}
                  {marca?.(d.iso, sel)}
                </button>
              )
            })}
          </div>
          {leyenda}
        </div>
      )}
    </div>
  )
}

import { C } from '../lib/theme'
import { MESES } from '../lib/constantes'
import { hoyISO } from '../lib/formato'
import { DIAS_CORTOS, diaSemana, partesISO } from '../lib/calendario'
import { COLOR_BLOQUEO, RAYADO, esTodoElDia, guardarBloqueos, mismoBloqueo, tituloDe } from '../lib/bloqueos'
import { Card } from './ui/Varios'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'

const mes3 = (m) => MESES[m].slice(0, 3).toLowerCase()
const corta = (iso) => { const { d, m } = partesISO(iso); return `${DIAS_CORTOS[diaSemana(iso)]} ${d} ${mes3(m)}` }
// «lun 3 dic» / «lun 3 dic – mié 5 dic»
export const textoFechas = (b) => b.hasta_fecha && b.hasta_fecha > b.fecha ? `${corta(b.fecha)} – ${corta(b.hasta_fecha)}` : corta(b.fecha)
export const textoHoras = (b) => esTodoElDia(b) ? 'Todo el día' : `${b.desde || '00:00'}–${b.hasta || '24:00'}`

// Agenda blocks of the Calendario: hatched slate, with a lock, so they never look like a cita or a Google event.
// `onClick` missing = read-only (support sessions): they are drawn as plain boxes.
const Caja = ({ onClick, children, style, ...p }) => {
  if (!onClick) return <div {...p} style={style}>{children}</div>
  return <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }} {...p} style={{ cursor: 'pointer', ...style }}>{children}</button>
}

// Month view chip: full width, at the top of the day
export function ChipBloqueo({ item, onClick }) {
  const texto = item.todoElDia ? item.titulo : `${item.desde || '00:00'}–${item.hasta || '24:00'} ${item.titulo}`
  return (
    <Caja onClick={onClick} title={`Bloqueo: ${item.titulo} · ${textoHoras(item.bloqueo)}`} style={{
      display: 'flex', alignItems: 'center', gap: 5, width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '3px 7px', borderRadius: 8, border: `1px solid ${C.g300}`,
      background: `${RAYADO(0.14)}, #EEF1F7`, color: C.g700, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, lineHeight: 1.35,
    }}><Icon name="candado" size={11} style={{ flexShrink: 0, color: COLOR_BLOQUEO }} /><span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span></Caja>
  )
}

// Row of the selected-day list (phones and day view)
export function FilaBloqueo({ item, onClick }) {
  return (
    <Caja onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '10px 14px', borderRadius: 16, border: `1px solid ${C.g300}`, borderLeft: `4px solid ${COLOR_BLOQUEO}`,
      background: `${RAYADO(0.12)}, #EEF1F7`, color: C.g700, fontFamily: 'inherit',
    }}>
      <Icon name="candado" size={16} style={{ flexShrink: 0, color: COLOR_BLOQUEO }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.titulo}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: C.g500 }}>Bloqueado · {item.todoElDia ? 'todo el día' : `${item.desde || '00:00'} a ${item.hasta || '24:00'}`}</span>
      </span>
    </Caja>
  )
}

export function ListaBloqueosDia({ lista, onBloqueo }) {
  if (!lista.length) return null
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>{lista.map((it, i) => <FilaBloqueo key={i} item={it} onClick={onBloqueo ? () => onBloqueo(it.bloqueo) : undefined} />)}</div>
}

// Hatched band behind the citas of a time grid column: the blocked hours, or the whole column
export function BandaBloqueo({ item, desdeMin, alto, pxHora, onClick }) {
  const top = item.todoElDia ? 0 : Math.max(0, (item.ini - desdeMin) / 60 * pxHora)
  const bottom = item.todoElDia ? alto : Math.min(alto, (item.fin - desdeMin) / 60 * pxHora)
  if (bottom - top < 4) return null
  return (
    <Caja onClick={onClick} title={`Bloqueo: ${item.titulo} · ${textoHoras(item.bloqueo)}`} aria-label={`Bloqueo: ${item.titulo}, ${textoHoras(item.bloqueo)}${onClick ? '. Editar' : ''}`} style={{
      position: 'absolute', left: 0, right: 0, top, height: bottom - top, zIndex: 1, display: 'flex', alignItems: 'flex-start', boxSizing: 'border-box', padding: '3px 6px', border: 'none', borderTop: `1px solid ${C.g300}`, borderBottom: `1px solid ${C.g300}`,
      background: `${RAYADO(0.13)}, rgba(238,241,247,0.7)`, textAlign: 'left', fontFamily: 'inherit', overflow: 'hidden', color: C.g700,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, fontSize: 11.5, fontWeight: 700, lineHeight: 1.25 }}>
        <Icon name="candado" size={11} style={{ flexShrink: 0, color: COLOR_BLOQUEO }} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.titulo}</span>
      </span>
    </Caja>
  )
}

// «Bloqueos» card under the calendar: what is blocked from today on
export function TarjetaBloqueos({ bloqueos, clinica, editable, onEditar, onCambio }) {
  const hoy = hoyISO()
  const proximos = bloqueos.filter(b => (b.hasta_fecha || b.fecha) >= hoy)
  const quitar = async (b) => {
    if (!await confirmar(`¿Quitar el bloqueo${b.motivo ? ` «${b.motivo}»` : ''}? Esas fechas volverán a quedar libres para agendar.`)) return
    try { onCambio(await guardarBloqueos(clinica, (l) => l.filter(x => !mismoBloqueo(x, b)))); toast.success('Bloqueo quitado') }
    catch (e) { toast.error(e.message || 'No se pudo quitar el bloqueo') }
  }
  const boton = { width: 34, height: 34, borderRadius: 10, border: 'none', background: 'none', cursor: 'pointer', color: C.g500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
  return (
    <Card title="Bloqueos" style={{ marginTop: 18 }}>
      {proximos.length === 0
        ? <div style={{ fontSize: 13.5, color: C.g500 }}>No hay fechas bloqueadas.</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {proximos.map((b, i) => (
              <div key={b.id || `${b.fecha}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${C.g100}` : 'none', minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: COLOR_BLOQUEO, border: `1px solid ${C.g300}`, background: `${RAYADO(0.14)}, #EEF1F7` }}><Icon name="candado" size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tituloDe(b)}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: C.g500 }}>{textoFechas(b)} · {textoHoras(b)}</span>
                </span>
                {editable && (
                  <>
                    <button type="button" style={boton} aria-label={`Editar el bloqueo ${tituloDe(b)}`} title="Editar" onClick={() => onEditar(b)}><Icon name="editar" size={16} /></button>
                    <button type="button" style={boton} aria-label={`Quitar el bloqueo ${tituloDe(b)}`} title="Quitar" onClick={() => quitar(b)}><Icon name="eliminar" size={16} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
    </Card>
  )
}

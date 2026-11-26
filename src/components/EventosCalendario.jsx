import { C } from '../lib/theme'
import { MESES } from '../lib/constantes'
import { hoyISO } from '../lib/formato'
import { DIAS_CORTOS, diaSemana, partesISO } from '../lib/calendario'
import { COLOR_BLOQUEO, RAYADO, esTodoElDia, guardarAgenda, mismaEntrada, tituloDe, esIdValido, esMeetUrl } from '../lib/agenda'
import { sincronizarEvento } from '../lib/google'
import { Card } from './ui/Varios'
import { Icon } from './ui/Icon'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'

const mes3 = (m) => MESES[m].slice(0, 3).toLowerCase()
const corta = (iso) => { const { d, m } = partesISO(iso); return `${DIAS_CORTOS[diaSemana(iso)]} ${d} ${mes3(m)}` }
// «lun 3 dic» / «lun 3 dic – mié 5 dic»
export const textoFechas = (b) => b.hasta_fecha && b.hasta_fecha > b.fecha ? `${corta(b.fecha)} – ${corta(b.hasta_fecha)}` : corta(b.fecha)
export const textoHoras = (b) => esTodoElDia(b) ? 'Todo el día' : `${b.desde || '00:00'}–${b.hasta || '24:00'}`

// Own events of the Calendario. «No disponible» (item.bloquea): hatched slate with a lock, so it never looks like a cita or a Google event.
// Flexible: a lighter accent-tinted box with a dashed outline, a small calendar icon, no hatch and no lock.
// `onClick` missing = read-only (support sessions): they are drawn as plain boxes.
const Caja = ({ onClick, children, style, ...p }) => {
  if (!onClick) return <div {...p} style={style}>{children}</div>
  return <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }} {...p} style={{ cursor: 'pointer', ...style }}>{children}</button>
}
const COLOR_FLEX = 'var(--acento-fuerte)'
const etiquetaTipo = (item) => item.bloquea ? 'No disponible' : 'Evento'
// small camera mark: this event has a Google Meet link
const MarcaMeet = ({ item, size = 11 }) => item.meetUrl ? <Icon name="video" size={size} style={{ flexShrink: 0, color: item.bloquea ? COLOR_BLOQUEO : COLOR_FLEX }} /> : null
const IconoTipo = ({ item, size = 11 }) => item.bloquea
  ? <Icon name="candado" size={size} style={{ flexShrink: 0, color: COLOR_BLOQUEO }} />
  : <Icon name="calendarioMas" size={size} style={{ flexShrink: 0, color: COLOR_FLEX }} />
const estiloChip = (bloquea) => bloquea
  ? { border: `1px solid ${C.g300}`, background: `${RAYADO(0.14)}, #EEF1F7`, color: C.g700 }
  : { border: '1.5px dashed var(--acento)', background: 'var(--acento-tenue)', color: C.g700 }

// Month view chip: full width, at the top of the day
export function ChipEvento({ item, onClick }) {
  const texto = item.todoElDia ? item.titulo : `${item.desde || '00:00'}–${item.hasta || '24:00'} ${item.titulo}`
  return (
    <Caja onClick={onClick} title={`${etiquetaTipo(item)}: ${item.titulo} · ${textoHoras(item.entrada)}`} style={{
      display: 'flex', alignItems: 'center', gap: 5, width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '3px 7px', borderRadius: 8,
      ...estiloChip(item.bloquea), fontFamily: 'inherit', fontSize: 12, fontWeight: 600, lineHeight: 1.35,
    }}><IconoTipo item={item} /><span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span><MarcaMeet item={item} /></Caja>
  )
}

// Row of the selected-day list (phones and day view)
export function FilaEvento({ item, onClick }) {
  return (
    <Caja onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '10px 14px', borderRadius: 16,
      ...estiloChip(item.bloquea), borderLeft: `4px ${item.bloquea ? 'solid' : 'dashed'} ${item.bloquea ? COLOR_BLOQUEO : 'var(--acento)'}`, fontFamily: 'inherit',
    }}>
      <IconoTipo item={item} size={16} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.titulo}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: C.g500 }}>{item.bloquea ? 'No disponible' : 'Evento'} · {item.todoElDia ? 'todo el día' : `${item.desde || '00:00'} a ${item.hasta || '24:00'}`}</span>
      </span>
      <MarcaMeet item={item} size={15} />
    </Caja>
  )
}

export function ListaEventosDia({ lista, onEvento }) {
  if (!lista.length) return null
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>{lista.map((it, i) => <FilaEvento key={i} item={it} onClick={onEvento ? () => onEvento(it.entrada) : undefined} />)}</div>
}

// Time grid column: «no disponible» = hatched band behind the citas (the blocked hours, or the whole column);
// flexible = only a slim left-aligned band (side by side when several overlap: `carril`), so the citas on top stay readable
export function BandaEvento({ item, desdeMin, alto, pxHora, onClick, carril = 0 }) {
  const top = item.todoElDia ? 0 : Math.max(0, (item.ini - desdeMin) / 60 * pxHora)
  const bottom = item.todoElDia ? alto : Math.min(alto, (item.fin - desdeMin) / 60 * pxHora)
  if (bottom - top < 4) return null
  const etiqueta = `${etiquetaTipo(item)}: ${item.titulo}, ${textoHoras(item.entrada)}${item.meetUrl ? ', con enlace de Meet' : ''}${onClick ? '. Editar' : ''}`
  if (!item.bloquea) {
    return (
      <Caja onClick={onClick} title={`${etiquetaTipo(item)}: ${item.titulo} · ${textoHoras(item.entrada)}`} aria-label={etiqueta} style={{
        position: 'absolute', left: Math.min(carril, 3) * 20, width: 18, top, height: bottom - top, zIndex: 1, boxSizing: 'border-box', padding: '3px 1px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        border: 'none', borderLeft: '3px solid var(--acento)', borderTop: '1px dashed var(--acento)', borderBottom: '1px dashed var(--acento)',
        background: 'var(--acento-tenue)', overflow: 'hidden', fontFamily: 'inherit', color: C.g700,
      }}>
        <IconoTipo item={item} size={10} />
        {bottom - top >= 34 && <MarcaMeet item={item} size={10} />}
        {bottom - top >= 48 && <span style={{ writingMode: 'vertical-rl', minHeight: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 700, lineHeight: 1.1 }}>{item.titulo}</span>}
      </Caja>
    )
  }
  return (
    <Caja onClick={onClick} title={`${etiquetaTipo(item)}: ${item.titulo} · ${textoHoras(item.entrada)}`} aria-label={etiqueta} style={{
      position: 'absolute', left: 0, right: 0, top, height: bottom - top, zIndex: 1, display: 'flex', alignItems: 'flex-start', boxSizing: 'border-box', padding: '3px 6px', border: 'none', borderTop: `1px solid ${C.g300}`, borderBottom: `1px solid ${C.g300}`,
      background: `${RAYADO(0.13)}, rgba(238,241,247,0.7)`, textAlign: 'left', fontFamily: 'inherit', overflow: 'hidden', color: C.g700,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, fontSize: 11.5, fontWeight: 700, lineHeight: 1.25 }}>
        <IconoTipo item={item} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.titulo}</span>
        <MarcaMeet item={item} />
      </span>
    </Caja>
  )
}

// What a click on an empty day / hour offers: a cita (the existing flow) or an event of the clinic
export function ElegirNuevo({ fecha, hora, textoFecha, onCita, onEvento, onClose }) {
  const boton = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '14px 16px', borderRadius: 18, border: `1px solid ${C.g200}`, background: 'rgba(255,255,255,0.9)', cursor: 'pointer', fontFamily: 'inherit', color: C.black }
  const icono = { width: 38, height: 38, borderRadius: 12, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
  return (
    <Modal title="¿Qué desea agregar?" subtitle={`${textoFecha}${hora ? ` · ${hora}` : ''}`} onClose={onClose} maxWidth={380}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" style={boton} onClick={() => onCita({ fecha, hora })}>
          <span style={icono}><Icon name="mas" size={18} /></span>
          <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>Nueva cita</span><span style={{ display: 'block', fontSize: 12.5, color: C.g500 }}>Con un paciente</span></span>
        </button>
        <button type="button" style={boton} onClick={() => onEvento({ fecha, hora })}>
          <span style={icono}><Icon name="calendarioMas" size={18} /></span>
          <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>Nuevo evento</span><span style={{ display: 'block', fontSize: 12.5, color: C.g500 }}>Reunión, viaje, capacitación…</span></span>
        </button>
      </div>
    </Modal>
  )
}

// «Eventos propios» card under the calendar: what is coming from today on, both kinds, each with its tag
export function TarjetaEventos({ agenda, clinica, editable, onEditar, onCambio }) {
  const hoy = hoyISO()
  const proximos = agenda.filter(b => (b.hasta_fecha || b.fecha) >= hoy)
  const quitar = async (b) => {
    if (!await confirmar(`¿Quitar el evento${b.motivo ? ` «${b.motivo}»` : ''}?${b.bloquea ? ' Esas fechas volverán a quedar libres para agendar.' : ''}`)) return
    try {
      onCambio(await guardarAgenda(clinica, (l) => l.filter(x => !mismaEntrada(x, b))))
      toast.success('Evento quitado')
      if (esIdValido(b.id)) sincronizarEvento(b.id) // silent: the function deletes the Google event
    } catch (e) { toast.error(e.message || 'No se pudo quitar el evento') }
  }
  const boton = { width: 34, height: 34, borderRadius: 10, border: 'none', background: 'none', cursor: 'pointer', color: C.g500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
  return (
    <Card title="Eventos propios" style={{ marginTop: 18 }}>
      {proximos.length === 0
        ? <div style={{ fontSize: 13.5, color: C.g500 }}>No hay eventos próximos.</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {proximos.map((b, i) => (
              <div key={b.id || `${b.fecha}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${C.g100}` : 'none', minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: b.bloquea ? COLOR_BLOQUEO : COLOR_FLEX, ...estiloChip(b.bloquea) }}><Icon name={b.bloquea ? 'candado' : 'calendarioMas'} size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{tituloDe(b)}</span>
                    {esMeetUrl(b.meet_url) && <Icon name="video" size={13} style={{ flexShrink: 0, color: C.g500 }} />}
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: b.bloquea ? C.g100 : 'var(--acento-tenue)', color: b.bloquea ? C.g600 : COLOR_FLEX }}>{b.bloquea ? 'No disponible' : 'Flexible'}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 12.5, color: C.g500 }}>{textoFechas(b)} · {textoHoras(b)}</span>
                </span>
                {editable && (
                  <>
                    <button type="button" style={boton} aria-label={`Editar el evento ${tituloDe(b)}`} title="Editar" onClick={() => onEditar(b)}><Icon name="editar" size={16} /></button>
                    <button type="button" style={boton} aria-label={`Quitar el evento ${tituloDe(b)}`} title="Quitar" onClick={() => quitar(b)}><Icon name="eliminar" size={16} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
    </Card>
  )
}

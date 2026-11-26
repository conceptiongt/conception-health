import { useState, useMemo } from 'react'
import { C } from '../lib/theme'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import { Input, Select, Textarea } from './ui/Campos'
import { Segmentos } from './ui/Varios'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'
import { MiniCalendario } from './MiniCalendario'
import { EnlaceMeet } from './EnlaceMeet'
import { Interruptor } from './MensajePaciente'
import { hoyISO } from '../lib/formato'
import { NO_OCUPAN, aMinutos, deMinutos, duracionCita, esISO } from '../lib/calendario'
import { MAX_NOTA, MAX_TITULO, TITULOS_RAPIDOS, guardarAgenda, guardarMeetUrl, limpiarNota, limpiarTitulo, mismaEntrada, nuevoId, esIdValido, esMeetUrl, validarEntrada } from '../lib/agenda'
import { sincronizarEvento } from '../lib/google'

// 06:00 … 22:00 every 30 minutes
const HORAS_EVENTO = (() => { const l = []; for (let m = 6 * 60; m <= 22 * 60; m += 30) l.push(deMinutos(m)); return l })()
const etiqueta = { display: 'block', fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 6 }
const chip = (activo) => ({
  padding: '6px 13px', borderRadius: 160, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
  border: `1.5px solid ${activo ? C.purple : C.g200}`, background: activo ? C.purpleMid : 'rgba(255,255,255,0.9)', color: activo ? 'var(--acento-fuerte)' : C.g600,
})

// the hour of the clicked slot snapped into the selectable range, and one hour after it
function horasIniciales(hora) {
  const m = aMinutos(hora)
  if (m == null) return { desde: '09:00', hasta: '12:00' }
  const ini = Math.min(Math.max(Math.floor(m / 30) * 30, 6 * 60), 21 * 60 + 30)
  return { desde: deMinutos(ini), hasta: deMinutos(Math.min(ini + 60, 22 * 60)) }
}

// «Nuevo evento» / «Editar evento»: one day or a range of days, whole day or specific hours, with a title. Per event the clinic decides whether it
// makes the time «no disponible» (stored with the receptionist's blocks) or is flexible. `entrada` = the entry being edited (null = new);
// `horaInicial` = the hour of the grid slot that was clicked. Saves through guardarAgenda (re-reads the clinic's current data), then Google.
export function EventoModal({ entrada, fechaInicial, horaInicial, citas = [], clinica, googleListo = false, onClose, onGuardado }) {
  const editando = !!entrada
  const hIni = horasIniciales(horaInicial)
  const [titulo, setTitulo] = useState(entrada?.motivo || '')
  const [modo, setModo] = useState(entrada?.hasta_fecha ? 'rango' : 'dia')
  const [fecha, setFecha] = useState(entrada?.fecha || (esISO(fechaInicial) ? fechaInicial : hoyISO()))
  const [hastaFecha, setHastaFecha] = useState(entrada?.hasta_fecha || '')
  const [horario, setHorario] = useState(entrada ? (entrada.desde || entrada.hasta ? 'horas' : 'todo') : (horaInicial ? 'horas' : 'todo'))
  const [desde, setDesde] = useState(entrada?.desde || hIni.desde)
  const [hasta, setHasta] = useState(entrada?.hasta || hIni.hasta)
  const [bloquea, setBloquea] = useState(entrada ? entrada.bloquea === true : true)
  const [meet, setMeet] = useState(entrada?.meet === true)
  const [nota, setNota] = useState(entrada?.nota || '')
  const [busy, setBusy] = useState(false)
  const [creado, setCreado] = useState('') // Meet link of the event just saved
  const enlaceActual = esMeetUrl(entrada?.meet_url) ? entrada.meet_url : ''

  const fin = modo === 'rango' ? (hastaFecha || fecha) : fecha
  const meetPosible = googleListo && modo === 'dia' && horario === 'horas'
  const meetAyuda = !googleListo ? 'Conecte Google Calendar para crear enlaces de Meet.' : !meetPosible ? 'El enlace de Meet necesita una hora.' : null
  const quiereMeet = meet && meetPosible && !enlaceActual
  const actual = () => ({
    ...(esIdValido(entrada?.id) ? { id: entrada.id } : { id: nuevoId() }),
    fecha, hasta_fecha: modo === 'rango' && hastaFecha > fecha ? hastaFecha : '',
    desde: horario === 'horas' ? desde : '', hasta: horario === 'horas' ? hasta : '', motivo: limpiarTitulo(titulo), nota: limpiarNota(nota),
    bloquea, ...(enlaceActual ? { meet: true, meet_url: enlaceActual } : quiereMeet ? { meet: true } : {}),
  })

  // appointments (still on the agenda) inside the chosen period; with hours chosen, only those overlapping them
  const citasEnPeriodo = useMemo(() => {
    if (!esISO(fecha) || fin < fecha) return 0
    const a = aMinutos(desde), b = aMinutos(hasta)
    return citas.filter(c => {
      const f = c.fecha?.slice(0, 10)
      if (!f || f < fecha || f > fin || NO_OCUPAN.includes(c.estado)) return false
      if (horario !== 'horas') return true
      if (!c.hora || a == null || b == null) return false
      const i = aMinutos(c.hora)
      return i < b && a < i + duracionCita(c)
    }).length
  }, [citas, fecha, fin, horario, desde, hasta])

  const guardar = async () => {
    const nuevo = actual()
    const fallo = validarEntrada(nuevo)
    if (fallo) { toast.error(fallo); return }
    setBusy(true)
    let lista
    try {
      lista = await guardarAgenda(clinica, (l) => editando ? l.map(x => mismaEntrada(x, entrada) ? nuevo : x) : [...l, nuevo])
    } catch (e) { toast.error(e.message || 'No se pudo guardar el evento'); setBusy(false); return }
    onGuardado(lista)
    if (!quiereMeet) {
      toast.success(editando ? 'Evento actualizado' : 'Evento guardado')
      sincronizarEvento(nuevo.id) // silent: never blocks saving
      onClose()
      return
    }
    // a Meet link was requested: wait for Google, store the link on the entry (second small write) and show it
    const r = await sincronizarEvento(nuevo.id)
    if (r?.meet_url) {
      try { const l2 = await guardarMeetUrl(clinica, nuevo.id, r.meet_url); if (l2) onGuardado(l2) } catch { /* the link is still shown below */ }
      toast.success('Evento guardado con enlace de Meet')
      setCreado(r.meet_url)
      setBusy(false)
      return
    }
    toast.error('Se guardó el evento, pero no se pudo crear el enlace de Meet. Ábralo de nuevo para reintentar.')
    onClose()
  }
  const quitar = async () => {
    if (!await confirmar(`¿Quitar el evento${entrada.motivo ? ` «${entrada.motivo}»` : ''}?${entrada.bloquea ? ' Esas fechas volverán a quedar libres para agendar.' : ''}`)) return
    setBusy(true)
    try {
      const lista = await guardarAgenda(clinica, (l) => l.filter(x => !mismaEntrada(x, entrada)))
      toast.success('Evento quitado')
      onGuardado(lista)
      if (esIdValido(entrada.id)) sincronizarEvento(entrada.id) // the function finds no entry and deletes the Google event
      onClose()
    } catch (e) { toast.error(e.message || 'No se pudo quitar el evento'); setBusy(false) }
  }

  const elegirInicio = (iso) => { setFecha(iso); if (hastaFecha && hastaFecha < iso) setHastaFecha(iso) }
  const enRango = modo === 'rango' ? (iso) => iso >= fecha && iso <= (hastaFecha || fecha) : undefined

  if (creado) {
    return (
      <Modal title="Evento guardado" subtitle="El enlace de Google Meet ya está listo." onClose={onClose} maxWidth={520}>
        <EnlaceMeet url={creado} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}><Button onClick={onClose}>Listo</Button></div>
      </Modal>
    )
  }

  const interruptor = (id, activo, onChange, deshabilitado, texto, ayuda) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', opacity: deshabilitado ? 0.55 : 1 }}>
      <span style={{ pointerEvents: deshabilitado ? 'none' : 'auto', display: 'inline-flex' }}><Interruptor activo={activo && !deshabilitado} onChange={onChange} titulo={texto} /></span>
      <div style={{ minWidth: 0 }}>
        <div id={id} style={{ fontSize: 14, fontWeight: 500, color: C.black }}>{texto}</div>
        {ayuda && <div style={{ fontSize: 12.5, color: C.g500, marginTop: 2, lineHeight: 1.45 }}>{ayuda}</div>}
      </div>
    </div>
  )

  return (
    <Modal title={editando ? 'Editar evento' : 'Nuevo evento'} subtitle="Se marca en el calendario; usted decide si ocupa ese espacio." onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label htmlFor="evento-titulo" style={etiqueta}>Título</label>
          <Input id="evento-titulo" value={titulo} onChange={setTitulo} maxLength={MAX_TITULO} placeholder="Reunión, capacitación, viaje…" autoComplete="off" />
          <div role="group" aria-label="Títulos rápidos" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {TITULOS_RAPIDOS.map(t => <button key={t} type="button" aria-pressed={titulo === t} onClick={() => setTitulo(t)} style={chip(titulo === t)}>{t}</button>)}
          </div>
        </div>

        <div>
          <span style={etiqueta}>Fecha</span>
          <Segmentos valor={modo} onChange={setModo} opciones={[{ value: 'dia', label: 'Un día' }, { value: 'rango', label: 'Varios días' }]} />
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <MiniCalendario etiqueta={modo === 'rango' ? 'Desde' : 'Día'} valor={fecha} onElegir={elegirInicio} enRango={enRango} />
            {modo === 'rango' && <MiniCalendario etiqueta="Hasta" valor={hastaFecha} vacio="Elegir último día" minimo={fecha} onElegir={setHastaFecha} enRango={enRango} />}
          </div>
        </div>

        <div>
          <span style={etiqueta}>Horario</span>
          <Segmentos valor={horario} onChange={setHorario} opciones={[{ value: 'todo', label: 'Todo el día' }, { value: 'horas', label: 'Horas específicas' }]} />
          {horario === 'horas' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, color: C.g600 }}>De</span>
              <div style={{ width: 110 }}><Select aria-label="Hora de inicio" value={desde} onChange={setDesde}>{HORAS_EVENTO.map(h => <option key={h}>{h}</option>)}</Select></div>
              <span style={{ fontSize: 13.5, color: C.g600 }}>a</span>
              <div style={{ width: 110 }}><Select aria-label="Hora de fin" value={hasta} onChange={setHasta}>{HORAS_EVENTO.map(h => <option key={h}>{h}</option>)}</Select></div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {interruptor('evento-bloquea', bloquea, setBloquea, false, 'Marcar como no disponible',
            bloquea ? 'No se podrá agendar encima sin aviso y Lía no ofrecerá ese espacio.' : 'Es solo un recordatorio: se puede agendar encima.')}
          {enlaceActual
            ? <EnlaceMeet url={enlaceActual} />
            : interruptor('evento-meet', meet, setMeet, !meetPosible, 'Agregar enlace de Google Meet', meetAyuda)}
        </div>

        <div>
          <label htmlFor="evento-nota" style={etiqueta}>Nota <span style={{ color: C.g400, fontWeight: 400 }}>(opcional)</span></label>
          <Textarea id="evento-nota" value={nota} onChange={setNota} rows={3} maxLength={MAX_NOTA} placeholder="Algo que quiera recordar de este evento" />
        </div>

        {bloquea && citasEnPeriodo > 0 && (
          <div role="status" style={{ background: C.amberLight, color: C.amber, borderRadius: 18, padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon name="alerta" size={17} style={{ flexShrink: 0 }} />
            <span>Hay {citasEnPeriodo} {citasEnPeriodo === 1 ? 'cita agendada' : 'citas agendadas'} en ese período. El evento no {citasEnPeriodo === 1 ? 'la cancela' : 'las cancela'}.</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 4 }}>
          {editando && <Button variant="danger" icon="eliminar" disabled={busy} onClick={quitar} style={{ marginRight: 'auto' }}>Quitar evento</Button>}
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button icon="calendarioMas" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar evento'}</Button>
        </div>
      </div>
    </Modal>
  )
}

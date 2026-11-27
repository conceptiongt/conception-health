import { useState } from 'react'
import { C } from '../../lib/theme'
import { fechaLarga, mayuscula, sumarDias } from '../../lib/calendario'
import { puede, esSoporte } from '../../lib/permisos'
import { ESTADOS_CIRUGIA, aInstante, fechaDe, horaDe, textoDuracion } from '../../lib/quirofanos'
import { useDatos } from '../../hooks/useDatos'
import { estadoCirugia, bloquearReserva, quitarReserva } from '../../hooks/useCirugias'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Campo, Input } from '../ui/Campos'
import { Desplegable } from '../ui/Desplegable'
import { Badge } from '../ui/Varios'
import { Icon } from '../ui/Icon'
import { toast } from '../ui/Toast'
import { sincronizarCita } from '../../lib/google'
import { confirmar } from '../ui/Confirmar'
import { Segmentos } from '../ui/Varios'
import { Interruptor } from '../MensajePaciente'
import { MiniCalendario } from '../MiniCalendario'
import { CampoHora } from '../CampoHora'
import { useEquipo, textoError } from './comun'

const MOTIVOS_SUSPENDER = ['El paciente no se presentó', 'Paciente descompensado', 'Falta de insumos o equipo', 'Médico no disponible', 'Otro']

const Fila = ({ icono, titulo, children }) => (
  <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: `1px solid ${C.g100}`, fontSize: 14, alignItems: 'flex-start' }}>
    <Icon name={icono} size={16} style={{ color: C.g400, marginTop: 2 }} />
    <div style={{ width: 118, flexShrink: 0, color: C.g500 }}>{titulo}</div>
    <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</div>
  </div>
)

// Click on a surgery: every detail and the actions that make sense for its state
export function DetalleCirugia({ cirugia, onClose, onReprogramar, onEditarCita, onCambio }) {
  const { citas, pacientes, perfil, ir } = useDatos()
  const equipo = useEquipo()
  const cita = citas.find(c => c.id === cirugia.cita_id)
  const paciente = pacientes.find(p => p.id === cita?.paciente_id)
  const [busy, setBusy] = useState(false)
  const lectura = esSoporte(perfil)
  const ini = Date.parse(cirugia.inicio), fin = Date.parse(cirugia.fin)
  const est = ESTADOS_CIRUGIA[cirugia.estado] || ESTADOS_CIRUGIA.programada
  const q = equipo.quirofano(cirugia.quirofano_id), cir = equipo.profesional(cirugia.cirujano_id), an = equipo.profesional(cirugia.anestesiologo_id)

  const cambiar = async (estado, nota, exito) => {
    setBusy(true)
    const { error } = await estadoCirugia(cirugia.cita_id, estado, nota)
    setBusy(false)
    if (error) { toast.error(textoError(error, { quirofano: q?.nombre, cirujano: cir?.nombre, anestesiologo: an?.nombre })); return }
    toast.success(exito)
    sincronizarCita(cirugia.cita_id) // the cita state changed: mirror it to Google (silent)
    await onCambio()
    onClose()
  }
  const suspender = async () => {
    const motivo = await confirmar({
      titulo: '¿Suspender esta cirugía?', subtitulo: `${paciente?.nombre || ''} · ${mayuscula(fechaLarga(fechaDe(ini)))}, ${horaDe(ini)}`,
      mensaje: [`Se libera ${q?.nombre || 'el quirófano'} y a los médicos del equipo. La cita queda cancelada y puede volver a programarla después.`],
      aceptar: 'Suspender cirugía', peligro: true, motivo: { label: '¿Por qué se suspende?', opciones: MOTIVOS_SUSPENDER },
    })
    if (motivo) cambiar('suspendida', motivo, 'Cirugía suspendida; el quirófano y el equipo quedaron libres')
  }

  return (
    <Modal title={paciente?.nombre || 'Cirugía'} subtitle={cirugia.procedimiento || 'Cirugía'} onClose={onClose} maxWidth={600}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Badge color={est.color} bg={est.bg}>{est.label}</Badge>
        {cirugia.estado === 'suspendida' && <Badge color={C.g600} bg={C.g100}>No ocupa quirófano ni médicos</Badge>}
      </div>
      <div>
        <Fila icono="quirofano" titulo="Quirófano">{q?.nombre || '—'}</Fila>
        <Fila icono="reloj" titulo="Fecha y hora">{mayuscula(fechaLarga(fechaDe(ini)))}<br />{horaDe(ini)} a {horaDe(fin)} · {textoDuracion(Math.round((fin - ini) / 60000))}{cirugia.limpieza_min > 0 && ` + ${cirugia.limpieza_min} min de limpieza`}</Fila>
        <Fila icono="estetoscopio" titulo="Cirujano">{cir ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 10, background: equipo.colorDe(cir.id) }} />{cir.nombre}</span> : '—'}</Fila>
        <Fila icono="estetoscopio" titulo="Anestesiólogo">{an ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 10, background: equipo.colorDe(an.id) }} />{an.nombre}</span> : 'Sin anestesiólogo (anestesia local)'}</Fila>
        {cirugia.ayudantes && <Fila icono="usuarios" titulo="Ayudantes">{cirugia.ayudantes}</Fila>}
        {cirugia.nota && <Fila icono="mensaje" titulo="Nota">{cirugia.nota}</Fila>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 20 }}>
        {paciente && puede(perfil, 'expedientes') && <Button variant="ghost" icon="expedientes" onClick={() => { onClose(); ir('expedientes', paciente.id) }}>Abrir expediente</Button>}
        {cita && paciente && <Button variant="ghost" icon="editar" onClick={() => onEditarCita(cita, paciente)}>Editar cita</Button>}
        {!lectura && cirugia.estado === 'programada' && <>
          <Button variant="danger" icon="cerrar" disabled={busy} onClick={suspender}>Suspender</Button>
          <Button variant="ghost" icon="repetir" disabled={busy} onClick={() => onReprogramar(cirugia)}>Reprogramar</Button>
          <Button variant="soft" icon="play" disabled={busy} onClick={() => cambiar('en_curso', null, 'Cirugía iniciada')}>Iniciar</Button>
          <Button icon="check" disabled={busy} onClick={() => cambiar('realizada', null, 'Cirugía marcada como realizada')}>Marcar realizada</Button>
        </>}
        {!lectura && cirugia.estado === 'en_curso' && <>
          <Button variant="danger" icon="cerrar" disabled={busy} onClick={suspender}>Suspender</Button>
          <Button icon="check" disabled={busy} onClick={() => cambiar('realizada', null, 'Cirugía marcada como realizada')}>Marcar realizada</Button>
        </>}
        {!lectura && cirugia.estado === 'suspendida' && <Button icon="repetir" disabled={busy} onClick={() => onReprogramar(cirugia)}>Volver a programar</Button>}
      </div>
    </Modal>
  )
}

// Click on a manual block (vacation, maintenance)
export function DetalleBloqueo({ reserva, onClose, onCambio }) {
  const { perfil } = useDatos()
  const equipo = useEquipo()
  const [busy, setBusy] = useState(false)
  const esQ = reserva.recurso_tipo === 'quirofano'
  const quien = esQ ? equipo.quirofano(reserva.recurso_id)?.nombre : equipo.profesional(reserva.recurso_id)?.nombre
  const quitar = async () => {
    if (!await confirmar({ titulo: '¿Quitar este bloqueo?', mensaje: [`${quien || 'El recurso'} quedará libre de ${horaDe(reserva.ini)} a ${horaDe(reserva.fin)}.`], aceptar: 'Quitar bloqueo', peligro: true })) return
    setBusy(true)
    const { error } = await quitarReserva(reserva.id)
    setBusy(false)
    if (error) { toast.error(textoError(error)); return }
    toast.success('Bloqueo quitado')
    await onCambio()
    onClose()
  }
  return (
    <Modal title={reserva.titulo || 'Bloqueo'} subtitle={quien} onClose={onClose} maxWidth={460}>
      <Badge color={C.g600} bg={C.g100}><Icon name="candado" size={12} />Bloqueo manual</Badge>
      <div style={{ marginTop: 10 }}>
        <Fila icono="reloj" titulo="Desde">{mayuscula(fechaLarga(fechaDe(reserva.ini)))}, {horaDe(reserva.ini)}</Fila>
        <Fila icono="reloj" titulo="Hasta">{mayuscula(fechaLarga(fechaDe(reserva.fin - 1)))}, {horaDe(reserva.fin)}</Fila>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        {!esSoporte(perfil) && <Button variant="danger" icon="eliminar" disabled={busy} onClick={quitar}>Quitar bloqueo</Button>}
      </div>
    </Modal>
  )
}

// «Bloquear»: a room (maintenance) or a doctor (vacation, congress…) for a stretch of time
export function BloquearModal({ inicial, onClose, onGuardado }) {
  const equipo = useEquipo()
  const medicos = [...equipo.cirujanos, ...equipo.anestesiologos]
  const [f, setF] = useState(() => ({
    tipo: inicial?.tipo || 'quirofano', recurso: inicial?.recurso || '', titulo: '', desde: inicial?.fecha, hasta: inicial?.fecha, horaDesde: '08:00', horaHasta: '17:00', todoDia: false,
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => { setError(''); setF(x => ({ ...x, [k]: v })) }
  const opciones = f.tipo === 'quirofano' ? equipo.quirofanos.map(q => ({ value: q.id, label: q.nombre })) : medicos.map(p => ({ value: p.id, label: p.nombre, punto: equipo.colorDe(p.id) }))
  const guardar = async () => {
    if (!f.recurso) { setError(f.tipo === 'quirofano' ? 'Elija el quirófano.' : 'Elija el médico.'); return }
    if (!f.titulo.trim()) { setError('Escriba el motivo (por ejemplo «Mantenimiento» o «Vacaciones»).'); return }
    const ini = aInstante(f.desde, f.todoDia ? '00:00' : f.horaDesde)
    const fin = f.todoDia ? aInstante(sumarDias(f.hasta, 1), '00:00') : aInstante(f.hasta, f.horaHasta)
    if (!(fin > ini)) { setError('El final debe ser después del inicio.'); return }
    setBusy(true)
    const { error: err } = await bloquearReserva({ tipo: f.tipo === 'quirofano' ? 'quirofano' : 'profesional', recurso: f.recurso, inicio: ini, fin, titulo: f.titulo.trim() })
    setBusy(false)
    if (err) { setError(textoError(err, { quirofano: equipo.quirofano(f.recurso)?.nombre, cirujano: equipo.profesional(f.recurso)?.nombre, anestesiologo: equipo.profesional(f.recurso)?.nombre })); return }
    toast.success('Bloqueo guardado')
    await onGuardado()
    onClose()
  }
  return (
    <Modal title="Bloquear" subtitle="Mantenimiento de un quirófano, vacaciones de un médico…" onClose={onClose} maxWidth={560}>
      <div style={{ display: 'grid', gap: 16 }}>
        <Segmentos opciones={[{ value: 'quirofano', label: 'Quirófano' }, { value: 'medico', label: 'Médico' }]} valor={f.tipo} onChange={(v) => { setError(''); setF(x => ({ ...x, tipo: v, recurso: '' })) }} />
        <Campo label={f.tipo === 'quirofano' ? 'Quirófano *' : 'Médico *'}>
          <Desplegable ariaLabel={f.tipo === 'quirofano' ? 'Quirófano' : 'Médico'} value={f.recurso} onChange={set('recurso')} options={opciones} placeholder="Elija…" style={{ width: '100%', justifyContent: 'space-between', padding: '11px 14px' }} />
        </Campo>
        <Campo label="Motivo *"><Input value={f.titulo} onChange={set('titulo')} maxLength={80} placeholder={f.tipo === 'quirofano' ? 'Ej. Mantenimiento' : 'Ej. Vacaciones'} /></Campo>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 14 }}>
          <Interruptor activo={f.todoDia} onChange={set('todoDia')} /> Todo el día (o varios días)
        </label>
        <MiniCalendario etiqueta="Desde el día *" valor={f.desde} onElegir={(v) => setF(x => ({ ...x, desde: v, hasta: x.hasta < v ? v : x.hasta }))} />
        {!f.todoDia && <Campo label="A las"><CampoHora valor={f.horaDesde} onChange={set('horaDesde')} etiqueta="Desde" /></Campo>}
        <MiniCalendario etiqueta="Hasta el día *" valor={f.hasta} onElegir={(v) => setF(x => ({ ...x, hasta: v, desde: x.desde > v ? v : x.desde }))} />
        {!f.todoDia && <Campo label="A las"><CampoHora valor={f.horaHasta} onChange={set('horaHasta')} etiqueta="Hasta" /></Campo>}
      </div>
      {error && <div role="alert" style={{ marginTop: 16, background: C.redLight, color: C.red, borderRadius: 14, padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10 }}><Icon name="alerta" size={16} style={{ marginTop: 2 }} /><span>{error}</span></div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="candado" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar bloqueo'}</Button>
      </div>
    </Modal>
  )
}

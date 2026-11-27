import { useState, useMemo } from 'react'
import { C } from '../../lib/theme'
import { hoyISO } from '../../lib/formato'
import { fechaLarga, mayuscula, sumarDias } from '../../lib/calendario'
import {
  OPCIONES_DURACION, OPCIONES_LIMPIEZA, aInstante, choquesDeCirugia, fechaDe, hayChoque, horaDe, proximoHorarioLibre, textoDuracion,
} from '../../lib/quirofanos'
import { useDatos } from '../../hooks/useDatos'
import { useCirugias, programarCirugia } from '../../hooks/useCirugias'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Campo, Input, Textarea } from '../ui/Campos'
import { Desplegable } from '../ui/Desplegable'
import { Icon } from '../ui/Icon'
import { toast } from '../ui/Toast'
import { sincronizarCita } from '../../lib/google'
import { MiniCalendario } from '../MiniCalendario'
import { PacientePicker } from '../PacientePicker'
import { CampoHora } from '../CampoHora'
import { useEquipo, etiquetaReserva, textoError, esChoque } from './comun'

const caja = { width: '100%', justifyContent: 'space-between', padding: '11px 14px' }
// 06:00 … 21:30 every 30 minutes
const HORAS = Array.from({ length: 32 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` })
const pill = (activo, ocupada) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 64, height: 36, padding: '0 13px', borderRadius: 160, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500,
  border: `1.5px solid ${activo ? C.purple : C.g200}`, background: activo ? C.purple : ocupada ? C.g100 : 'rgba(255,255,255,0.9)', color: activo ? C.onPurple : ocupada ? C.g500 : C.black,
  boxShadow: activo ? '0 4px 14px var(--acento-sombra)' : 'none',
})

// «Programar cirugía»: one screen with the patient, the procedure, the team, the room and the time, with live availability of the three resources.
// `cirugia`: an existing surgery being re-programmed · `inicial`: { quirofano_id, fecha, hora } prefilled from a clicked slot
export function ProgramarCirugia({ cirugia, inicial, onClose, onGuardado }) {
  const { pacientes, citas, servicios, sedes, recargar, ir, hospital } = useDatos()
  const equipo = useEquipo()
  const cita = cirugia ? citas.find(c => c.id === cirugia.cita_id) : null
  const hoy = hoyISO()

  const [f, setF] = useState(() => {
    const fecha = cirugia ? fechaDe(Date.parse(cirugia.inicio)) : inicial?.fecha || hoy
    const ahora = Date.now()
    const mins = cirugia ? Math.round((Date.parse(cirugia.fin) - Date.parse(cirugia.inicio)) / 60000) : 60
    return {
      paciente: cita?.paciente_id || '', procedimiento: cirugia?.procedimiento || '',
      cirujano: cirugia?.cirujano_id || inicial?.cirujano_id || '', anes: cirugia ? cirugia.anestesiologo_id || '' : equipo.anestesiologos.length ? null : '',
      quirofano: cirugia?.quirofano_id || inicial?.quirofano_id || (equipo.quirofanos.filter(q => !q.fuera_de_servicio).length === 1 ? equipo.quirofanos.find(q => !q.fuera_de_servicio).id : ''),
      fecha, hora: cirugia ? horaDe(Date.parse(cirugia.inicio)) : inicial?.hora || (fecha === hoy ? HORAS.find(h => aInstante(fecha, h) > ahora) || '08:00' : '08:00'),
      minutos: mins, limpieza: cirugia?.limpieza_min ?? 15, ayudantes: cirugia?.ayudantes || '', nota: cirugia?.nota || '',
    }
  })
  const [duracionOtra, setDuracionOtra] = useState(() => !OPCIONES_DURACION.includes(f.minutos))
  const [otraHora, setOtraHora] = useState(() => !!f.hora && !HORAS.includes(f.hora))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => { setError(''); setF(x => ({ ...x, [k]: v })) }

  // availability from the loaded reservations (the database stays the authority: the Save button is never blocked)
  const { reservas, listo, recargar: recargarReservas } = useCirugias({ desde: f.fecha, hasta: sumarDias(f.fecha, 15), cirugias: false, reservas: true, ms: 60000 })
  const ini = f.hora ? aInstante(f.fecha, f.hora) : NaN
  const minutos = Number(f.minutos) || 0
  const opcionesQ = equipo.quirofanos.filter(q => !q.fuera_de_servicio || q.id === f.quirofano)
  const params = { quirofano: f.quirofano, cirujano: f.cirujano, anestesiologo: f.anes || null, minutos, limpieza: f.limpieza, ignorarCita: cirugia?.cita_id }
  const choques = useMemo(() => (Number.isFinite(ini) && minutos >= 15 ? choquesDeCirugia(reservas, { ...params, ini }) : null), [reservas, ini, minutos, f.quirofano, f.cirujano, f.anes, f.limpieza]) // eslint-disable-line react-hooks/exhaustive-deps
  const faltaAlgo = !f.quirofano || !f.cirujano
  // 30-minute pills where something of the team is already taken
  const ocupadas = useMemo(() => {
    const m = {}
    if (faltaAlgo || minutos < 15) return m
    for (const h of HORAS) if (hayChoque(choquesDeCirugia(reservas, { ...params, ini: aInstante(f.fecha, h) }))) m[h] = true
    return m
  }, [reservas, f.fecha, f.quirofano, f.cirujano, f.anes, minutos, f.limpieza]) // eslint-disable-line react-hooks/exhaustive-deps
  const sugerido = useMemo(() => {
    if (!choques || !hayChoque(choques) || faltaAlgo) return null
    return { ms: proximoHorarioLibre(reservas, { ...params, desde: ini }) }
  }, [choques, reservas]) // eslint-disable-line react-hooks/exhaustive-deps

  const usarSugerido = () => { setError(''); setF(x => ({ ...x, fecha: fechaDe(sugerido.ms), hora: horaDe(sugerido.ms) })); setOtraHora(!HORAS.includes(horaDe(sugerido.ms))) }

  const sugerenciasProc = useMemo(() => servicios.filter(s => s.categoria === 'Cirugía' && s.activo !== false).map(s => s.nombre).filter((n, i, l) => n && l.indexOf(n) === i).slice(0, 8), [servicios])

  const nombres = { quirofano: equipo.quirofano(f.quirofano)?.nombre, cirujano: equipo.profesional(f.cirujano)?.nombre, anestesiologo: equipo.profesional(f.anes)?.nombre }
  const guardar = async () => {
    if (!cirugia && !f.paciente) { setError('Elija el paciente.'); return }
    if (f.procedimiento.trim().length < 2) { setError('Escriba el procedimiento.'); return }
    if (!f.cirujano) { setError('Elija el cirujano.'); return }
    if (f.anes === null) { setError('Elija el anestesiólogo o «Sin anestesiólogo».'); return }
    if (!f.quirofano) { setError('Elija el quirófano.'); return }
    if (!f.hora || !Number.isFinite(ini)) { setError('Elija la hora de inicio.'); return }
    if (!(minutos >= 15 && minutos <= 960)) { setError('La duración debe ser de 15 minutos a 16 horas.'); return }
    const paciente = pacientes.find(p => p.id === (cita?.paciente_id || f.paciente))
    const cirujano = equipo.profesional(f.cirujano)
    setBusy(true)
    setError('')
    const { data: citaId, error: err } = await programarCirugia({
      cita: cirugia?.cita_id, paciente: f.paciente, quirofano: f.quirofano, cirujano: f.cirujano, anestesiologo: f.anes || null, inicio: ini, minutos, limpieza: f.limpieza,
      procedimiento: f.procedimiento.trim(), ayudantes: f.ayudantes.trim(), nota: f.nota.trim(),
      departamento: hospital.disponible && cirujano?.departamento_id && hospital.departamento(cirujano.departamento_id)?.activo ? cirujano.departamento_id : null,
      sede: paciente?.sede_id || (sedes.length === 1 ? sedes[0].id : null),
    })
    setBusy(false)
    if (err) {
      const texto = textoError(err, nombres)
      setError(texto)
      if (esChoque(err)) recargarReservas() // somebody else may have just taken the slot: show who
      else toast.error(texto)
      return
    }
    toast.success(cirugia ? 'Cirugía reprogramada' : 'Cirugía programada')
    sincronizarCita(citaId || cirugia?.cita_id) // mirror to the clinic's Google Calendar (silent, never blocks)
    await recargar()
    onGuardado()
  }

  const fila = (titulo, lista, nombre) => {
    if (!nombre) return null
    const libre = !choques || lista.length === 0
    const r = lista[0]
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, lineHeight: 1.45 }}>
        <span style={{ width: 112, flexShrink: 0, color: C.g500, fontWeight: 500 }}>{titulo}</span>
        {!choques ? <span style={{ color: C.g400 }}>Elija la hora para ver si está libre</span>
          : libre ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.green, fontWeight: 600 }}><Icon name="check" size={14} />Libre</span>
            : <span style={{ color: C.amber, fontWeight: 600, display: 'inline-flex', alignItems: 'flex-start', gap: 6 }}><Icon name="alerta" size={14} style={{ marginTop: 2 }} /><span>Ocupado de {horaDe(r.ini)} a {horaDe(r.fin)} — <span style={{ fontWeight: 500 }}>{etiquetaReserva(r, equipo)}</span></span></span>}
      </div>
    )
  }

  const sinQuirofanos = equipo.quirofanos.length === 0
  const sinCirujanos = equipo.cirujanos.length === 0
  return (
    <Modal title={cirugia ? 'Reprogramar cirugía' : 'Programar cirugía'} subtitle={cirugia ? `${pacientes.find(p => p.id === cita?.paciente_id)?.nombre || ''}` : 'Quirófano, cirujano y anestesiólogo en un solo paso'} onClose={onClose} maxWidth={760}>
      {(sinQuirofanos || sinCirujanos) && (
        <div role="status" style={{ background: C.amberLight, color: C.amber, borderRadius: 14, padding: '10px 14px', fontSize: 13.5, marginBottom: 14 }}>
          {sinQuirofanos ? 'Todavía no hay quirófanos registrados.' : 'Todavía no hay cirujanos registrados.'} Agréguelos en Configuración y vuelva aquí.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {!cirugia && (
          <div style={{ gridColumn: '1 / -1' }}>
            <Campo label="Paciente *"><PacientePicker valor={f.paciente} onChange={set('paciente')} onNuevo={() => { onClose(); ir('registrar') }} /></Campo>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <Campo label="Procedimiento *">
            <Input value={f.procedimiento} onChange={set('procedimiento')} maxLength={200} placeholder="Ej. Apendicectomía laparoscópica" />
          </Campo>
          {sugerenciasProc.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {sugerenciasProc.map(n => <button key={n} type="button" onClick={() => set('procedimiento')(n)} style={{ ...pill(false), height: 30, minWidth: 0, fontSize: 12.5, padding: '0 11px' }}>{n}</button>)}
            </div>
          )}
        </div>
        <Campo label="Cirujano *">
          <Desplegable ariaLabel="Cirujano" value={f.cirujano} onChange={set('cirujano')} placeholder="Elija el cirujano" style={caja}
            options={equipo.cirujanos.map(p => ({ value: p.id, label: p.nombre, punto: equipo.colorDe(p.id) }))} />
        </Campo>
        <Campo label="Anestesiólogo *">
          <Desplegable ariaLabel="Anestesiólogo" value={f.anes === null ? undefined : f.anes} onChange={set('anes')} placeholder="Elija el anestesiólogo" style={caja}
            options={[{ value: '', label: 'Sin anestesiólogo (anestesia local)' }, ...equipo.anestesiologos.map(p => ({ value: p.id, label: p.nombre, punto: equipo.colorDe(p.id) }))]} />
        </Campo>
        <Campo label="Quirófano *">
          <Desplegable ariaLabel="Quirófano" value={f.quirofano} onChange={set('quirofano')} placeholder="Elija el quirófano" style={caja}
            options={opcionesQ.map(q => ({ value: q.id, label: q.nombre + (q.fuera_de_servicio ? ' (fuera de servicio)' : '') }))} />
        </Campo>
        <div style={{ gridColumn: '1 / -1' }}>
          <MiniCalendario etiqueta="Fecha *" valor={f.fecha} onElegir={set('fecha')} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 6 }}>Hora de inicio *</span>
          <div role="group" aria-label="Hora de inicio" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {HORAS.map(h => (
              <button key={h} type="button" aria-pressed={!otraHora && f.hora === h} onClick={() => { setOtraHora(false); set('hora')(h) }} style={pill(!otraHora && f.hora === h, ocupadas[h])}
                title={ocupadas[h] ? 'Algo del equipo está ocupado a esa hora' : undefined}>
                {ocupadas[h] && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 6, background: !otraHora && f.hora === h ? C.onPurple : '#E0A100' }} />}{h}
              </button>
            ))}
            <button type="button" aria-pressed={otraHora} onClick={() => { setOtraHora(true); if (!f.hora) set('hora')('08:00') }} style={pill(otraHora)}>Otra hora</button>
          </div>
          {otraHora && <div style={{ marginTop: 10 }}><CampoHora valor={f.hora || '08:00'} onChange={set('hora')} etiqueta="Hora de inicio" /></div>}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 6 }}>Duración *</span>
          <div role="group" aria-label="Duración" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {OPCIONES_DURACION.map(m => (
              <button key={m} type="button" aria-pressed={!duracionOtra && minutos === m} onClick={() => { setDuracionOtra(false); set('minutos')(m) }} style={pill(!duracionOtra && minutos === m)}>
                {m === 60 ? '1 h' : m % 60 === 0 ? `${m / 60} h` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60}`}
              </button>
            ))}
            <button type="button" aria-pressed={duracionOtra} onClick={() => setDuracionOtra(true)} style={pill(duracionOtra)}>Otra</button>
            {duracionOtra && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input inputMode="numeric" aria-label="Duración en minutos" value={f.minutos} onChange={e => set('minutos')(e.target.value.replace(/\D/g, '').slice(0, 3))} style={{ width: 72, padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.g200}`, fontFamily: 'inherit', fontSize: 14, textAlign: 'center' }} />
                <span style={{ fontSize: 13, color: C.g500 }}>minutos</span>
              </span>
            )}
          </div>
          {minutos >= 15 && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 6 }}>Termina a las {Number.isFinite(ini) ? horaDe(ini + minutos * 60000) : '—'} · {textoDuracion(minutos)}</div>}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 6 }}>Limpieza posterior del quirófano</span>
          <div role="group" aria-label="Limpieza posterior" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {OPCIONES_LIMPIEZA.map(m => <button key={m} type="button" aria-pressed={f.limpieza === m} onClick={() => set('limpieza')(m)} style={pill(f.limpieza === m)}>{m === 0 ? 'Sin limpieza' : `${m} min`}</button>)}
          </div>
          <div style={{ fontSize: 12.5, color: C.g400, marginTop: 6 }}>Bloquea el quirófano, no a los médicos.</div>
        </div>

        <div style={{ gridColumn: '1 / -1' }} role="status" aria-live="polite">
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: '12px 14px', background: 'rgba(246,248,253,0.8)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.g400 }}>Disponibilidad{!listo && ' · revisando…'}</div>
            {fila('Quirófano', choques?.quirofano || [], nombres.quirofano)}
            {fila('Cirujano', choques?.cirujano || [], nombres.cirujano)}
            {f.anes ? fila('Anestesiólogo', choques?.anestesiologo || [], nombres.anestesiologo) : f.anes === '' && <div style={{ fontSize: 13.5, color: C.g500 }}>Sin anestesiólogo (anestesia local).</div>}
            {!nombres.quirofano && !nombres.cirujano && <div style={{ fontSize: 13.5, color: C.g400 }}>Elija el quirófano y el cirujano para ver su disponibilidad.</div>}
            {choques && !hayChoque(choques) && !faltaAlgo && <div style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Todo el equipo está libre a esa hora.</div>}
            {sugerido && (
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5 }}>
                {sugerido.ms ? <>
                  <span style={{ flex: '1 1 220px' }}>Próximo horario libre para los tres: <strong>{fechaDe(sugerido.ms) === f.fecha ? '' : `${mayuscula(fechaLarga(fechaDe(sugerido.ms)))}, `}{horaDe(sugerido.ms)}</strong></span>
                  <Button size="sm" variant="soft" icon="check" onClick={usarSugerido}>Usar este horario</Button>
                </> : <span style={{ color: C.amber }}>No hay un horario libre para los tres en los próximos 14 días con esta duración.</span>}
              </div>
            )}
          </div>
        </div>

        <Campo label="Ayudantes" ayuda="Opcional"><Input value={f.ayudantes} onChange={set('ayudantes')} maxLength={200} placeholder="Ej. Dr. Pérez, instrumentista Ana" /></Campo>
        <Campo label="Nota" ayuda="Opcional"><Textarea value={f.nota} onChange={set('nota')} rows={2} maxLength={500} placeholder="Indicaciones especiales, equipo necesario…" /></Campo>
      </div>

      {error && <div role="alert" style={{ marginTop: 16, background: C.redLight, color: C.red, borderRadius: 14, padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'flex-start' }}><Icon name="alerta" size={16} style={{ marginTop: 2 }} /><span>{error}</span></div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 20 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="check" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : cirugia ? 'Guardar cambios' : 'Programar cirugía'}</Button>
      </div>
    </Modal>
  )
}

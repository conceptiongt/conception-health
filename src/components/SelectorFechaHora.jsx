import { useState, useMemo, useId } from 'react'
import { C } from '../lib/theme'
import { hoyISO } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Icon } from './ui/Icon'
import { Select } from './ui/Campos'
import {
  DURACION_DEFECTO, HORAS, NIVELES, agruparPorDia, citasQueChocan, citasActivas, esISO, nivelOcupacion,
} from '../lib/calendario'
import { RAYADO, diaBloqueado, horaBloqueada } from '../lib/bloqueos'
import { MiniCalendario } from './MiniCalendario'

const etiqueta = { display: 'block', fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 6 }
const HORAS_SELECT = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTOS_SELECT = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

// Date + hour picker for an appointment.
// The calendar opens in place (accordion), so it can never be clipped inside a window; days show how busy they are,
// hours that overlap another appointment are marked (still selectable, to allow overbooking on purpose).
//   fecha 'YYYY-MM-DD', hora 'HH:MM' or '' · citas: every appointment · sedeId: only that location counts
//   citaId: the appointment being edited (it never conflicts with itself)
//   bloqueos: agenda blocks (see lib/bloqueos.js): blocked days / hours are marked but stay selectable, with a warning
export function SelectorFechaHora({ fecha, hora, onFecha, onHora, citas = [], sedeId, citaId, duracion = DURACION_DEFECTO, bloqueos = [] }) {
  const { pacientes = [] } = useDatos()
  const id = useId()
  const [otra, setOtra] = useState(false)
  const hoy = hoyISO()

  const porDia = useMemo(() => agruparPorDia(citas.filter(c => c.id !== citaId)), [citas, citaId])
  const nombreDe = (c) => pacientes.find(p => p.id === c.paciente_id)?.nombre || 'otro paciente'

  const hora5 = hora ? hora.slice(0, 5) : ''
  const esOtra = otra || (!!hora5 && !HORAS.includes(hora5))
  const choques = (h) => citasQueChocan(citas, { fecha, hora: h, sedeId, citaId, duracion })
  const choqueActual = hora5 ? choques(hora5) : []
  // hours already taken that day (computed once per day, not per pill)
  const tomadas = useMemo(() => {
    const m = {}
    for (const h of HORAS) { const l = citasQueChocan(citas, { fecha, hora: h, sedeId, citaId, duracion }); if (l.length) m[h] = l }
    return m
  }, [citas, fecha, sedeId, citaId, duracion])

  const [hh, mm] = hora5 ? hora5.split(':') : ['08', '00']
  const minutos = MINUTOS_SELECT.includes(mm) ? MINUTOS_SELECT : [...MINUTOS_SELECT, mm].sort()
  const cambiarOtra = (nh, nm) => { if (nh && nm) onHora(`${nh}:${nm}`) }

  // slots overlapping a block (computed once per day)
  const bloqueadas = useMemo(() => {
    const m = {}
    for (const h of HORAS) { const b = horaBloqueada(bloqueos, fecha, h, duracion); if (b) m[h] = b }
    return m
  }, [bloqueos, fecha, duracion])
  const bloqueoActual = esISO(fecha) ? (hora5 ? horaBloqueada(bloqueos, fecha, hora5, duracion) : diaBloqueado(bloqueos, fecha)) : null

  const pill = (activo, tomada, bloqueada) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 64, height: 38, padding: '0 14px', borderRadius: 160, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, transition: 'background 150ms, color 150ms, border-color 150ms',
    border: `1.5px solid ${activo ? C.purple : C.g200}`,
    background: activo ? C.purple : bloqueada ? `${RAYADO(0.18)}, ${C.g100}` : tomada ? C.g100 : 'rgba(255,255,255,0.9)', color: activo ? C.onPurple : tomada || bloqueada ? C.g500 : C.black,
    boxShadow: activo ? '0 4px 14px var(--acento-sombra)' : 'none',
  })

  return (
    <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
      <MiniCalendario etiqueta="Fecha *" valor={fecha} onElegir={onFecha}
        etiquetaDia={(iso) => {
          const n = citasActivas(porDia[iso], sedeId).length
          const bl = diaBloqueado(bloqueos, iso)
          return `, ${n === 0 ? 'sin citas' : n === 1 ? '1 cita' : `${n} citas`}${bl ? `, bloqueado: ${bl.titulo}` : ''}`
        }}
        estiloDia={(iso, sel) => !sel && diaBloqueado(bloqueos, iso) ? { background: RAYADO(0.16) } : null}
        marca={(iso, sel) => {
          const nivel = nivelOcupacion(citasActivas(porDia[iso], sedeId).length)
          const bl = diaBloqueado(bloqueos, iso)
          return (
            <>
              <span aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: 4, width: 5, height: 5, marginLeft: -2.5, borderRadius: 5, background: NIVELES[nivel].color, boxShadow: sel ? '0 0 0 1.5px #fff' : 'none' }} />
              {bl && <span aria-hidden="true" title={bl.titulo} style={{ position: 'absolute', top: 2, right: 3, display: 'inline-flex', color: sel ? C.onPurple : C.g500 }}><Icon name="candado" size={10} /></span>}
            </>
          )
        }}
        leyenda={(
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: C.g500 }}>
            {NIVELES.map(n => <span key={n.nivel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: n.color }} />{n.label}</span>)}
            {bloqueos.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 4, border: `1px solid ${C.g300}`, backgroundImage: RAYADO(0.3) }} />Bloqueado</span>}
          </div>
        )} />

      <span style={{ ...etiqueta, marginTop: 16 }} id={`${id}-hora`}>Hora</span>
      <div role="group" aria-labelledby={`${id}-hora`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" aria-pressed={!hora5} onClick={() => { setOtra(false); onHora('') }} style={pill(!hora5, false)}>Sin hora</button>
        {HORAS.map(h => {
          const activo = !esOtra && hora5 === h
          const t = tomadas[h]
          const bl = bloqueadas[h]
          const aviso = [bl && `Bloqueada: ${bl.titulo}`, t && `Ocupada: ${t.map(nombreDe).join(', ')}`].filter(Boolean).join(' · ')
          return (
            <button key={h} type="button" aria-pressed={activo} onClick={() => { setOtra(false); onHora(h) }}
              title={aviso || undefined}
              aria-label={`${h}${bl ? `, bloqueada: ${bl.titulo}` : ''}${t ? `, ocupada con ${t.map(nombreDe).join(' y ')}` : ''}`}
              style={pill(activo, !!t, !!bl)}>
              {bl && <Icon name="candado" size={11} />}
              {t && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 6, background: activo ? C.onPurple : '#E0A100' }} />}
              {h}
            </button>
          )
        })}
        <button type="button" aria-pressed={esOtra} aria-expanded={esOtra} onClick={() => { setOtra(true); if (!hora5) onHora('08:00') }} style={pill(esOtra, false)}>Otra hora</button>
      </div>

      {esOtra && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <div style={{ width: 84 }}><Select aria-label="Hora (0 a 23)" value={hh} onChange={v => cambiarOtra(v, mm)}>{HORAS_SELECT.map(x => <option key={x}>{x}</option>)}</Select></div>
          <span style={{ fontWeight: 600, color: C.g500 }}>:</span>
          <div style={{ width: 84 }}><Select aria-label="Minutos" value={mm} onChange={v => cambiarOtra(hh, v)}>{minutos.map(x => <option key={x}>{x}</option>)}</Select></div>
        </div>
      )}

      {bloqueoActual && (
        <div role="status" style={{ marginTop: 12, background: C.amberLight, color: C.amber, borderRadius: 18, padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="candado" size={17} />
          <span>Esa {hora5 ? 'hora' : 'fecha'} está bloqueada: <strong>{bloqueoActual.titulo}</strong>. Puede guardar de todas formas.</span>
        </div>
      )}
      {choqueActual.length > 0 && (
        <div role="status" style={{ marginTop: 12, background: C.amberLight, color: C.amber, borderRadius: 18, padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="alerta" size={17} />
          <span>Ya hay una cita a esa hora con <strong>{choqueActual.map(nombreDe).join(' y ')}</strong>. Puede guardar de todas formas.</span>
        </div>
      )}
    </div>
  )
}

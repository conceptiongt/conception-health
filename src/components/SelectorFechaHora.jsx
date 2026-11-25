import { useState, useEffect, useMemo, useId } from 'react'
import { C } from '../lib/theme'
import { MESES } from '../lib/constantes'
import { hoyISO } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Icon } from './ui/Icon'
import { Select } from './ui/Campos'
import {
  DIAS_INICIAL, DURACION_DEFECTO, HORAS, NIVELES, agruparPorDia, citasQueChocan, citasActivas,
  esISO, fechaLarga, matrizMes, nivelOcupacion, partesISO, sumarMeses,
} from '../lib/calendario'

const etiqueta = { display: 'block', fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 6 }
const flecha = { width: 34, height: 34, borderRadius: 160, border: `1px solid ${C.g200}`, background: 'rgba(255,255,255,0.9)', cursor: 'pointer', color: C.g600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontSize: 18, lineHeight: 1 }
const HORAS_SELECT = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTOS_SELECT = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

// Date + hour picker for an appointment.
// The calendar opens in place (accordion), so it can never be clipped inside a window; days show how busy they are,
// hours that overlap another appointment are marked (still selectable, to allow overbooking on purpose).
//   fecha 'YYYY-MM-DD', hora 'HH:MM' or '' · citas: every appointment · sedeId: only that location counts
//   citaId: the appointment being edited (it never conflicts with itself)
export function SelectorFechaHora({ fecha, hora, onFecha, onHora, citas = [], sedeId, citaId, duracion = DURACION_DEFECTO }) {
  const { pacientes = [] } = useDatos()
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const base = esISO(fecha) ? fecha : hoyISO()
  const [vista, setVista] = useState(() => base.slice(0, 7) + '-01') // first day of the month being shown
  const [otra, setOtra] = useState(false)
  const hoy = hoyISO()
  useEffect(() => { if (esISO(fecha)) setVista(fecha.slice(0, 7) + '-01') }, [fecha])

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

  const { y, m } = partesISO(vista)
  const semanas = matrizMes(y, m)
  const elegirDia = (iso) => { onFecha(iso); setAbierto(false) }
  const [hh, mm] = hora5 ? hora5.split(':') : ['08', '00']
  const minutos = MINUTOS_SELECT.includes(mm) ? MINUTOS_SELECT : [...MINUTOS_SELECT, mm].sort()
  const cambiarOtra = (nh, nm) => { if (nh && nm) onHora(`${nh}:${nm}`) }

  const pill = (activo, tomada) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 64, height: 38, padding: '0 14px', borderRadius: 160, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, transition: 'background 150ms, color 150ms, border-color 150ms',
    border: `1.5px solid ${activo ? C.purple : C.g200}`,
    background: activo ? C.purple : tomada ? C.g100 : 'rgba(255,255,255,0.9)', color: activo ? C.onPurple : tomada ? C.g500 : C.black,
    boxShadow: activo ? '0 4px 14px var(--acento-sombra)' : 'none',
  })

  return (
    <div style={{ gridColumn: '1 / -1', minWidth: 0 }} onKeyDown={e => { if (e.key === 'Escape' && abierto) { e.stopPropagation(); setAbierto(false) } }}>
      <span style={etiqueta} id={`${id}-fecha`}>Fecha *</span>
      <button type="button" aria-expanded={abierto} aria-controls={`${id}-cal`} aria-labelledby={`${id}-fecha ${id}-valor`} onClick={() => setAbierto(a => !a)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        border: `1px solid ${abierto ? C.purple : C.g200}`, background: 'rgba(255,255,255,0.9)', fontFamily: 'inherit', fontSize: 14, color: C.black,
        boxShadow: abierto ? '0 0 0 3px var(--acento-anillo)' : 'none', transition: 'border-color 150ms, box-shadow 150ms', boxSizing: 'border-box',
      }}>
        <Icon name="citas" size={17} style={{ color: C.purple }} />
        <span id={`${id}-valor`} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{esISO(fecha) ? fechaLarga(fecha) : 'Elegir fecha'}</span>
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
              const sel = d.iso === fecha
              const n = citasActivas(porDia[d.iso], sedeId).length
              const nivel = nivelOcupacion(n)
              const pasado = d.iso < hoy
              return (
                <button key={d.iso} type="button" onClick={() => elegirDia(d.iso)} aria-pressed={sel}
                  aria-label={`${fechaLarga(d.iso)}, ${n === 0 ? 'sin citas' : n === 1 ? '1 cita' : `${n} citas`}`}
                  style={{
                    position: 'relative', height: 40, borderRadius: 12, border: d.iso === hoy && !sel ? `1.5px solid ${C.purple}` : '1.5px solid transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
                    fontWeight: sel || d.iso === hoy ? 700 : 500, background: sel ? C.purple : 'transparent',
                    color: sel ? C.onPurple : !d.delMes || pasado ? C.g400 : C.black, opacity: d.delMes ? 1 : 0.6, padding: 0,
                  }}>
                  {d.dia}
                  <span aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: 4, width: 5, height: 5, marginLeft: -2.5, borderRadius: 5, background: NIVELES[nivel].color, boxShadow: sel ? '0 0 0 1.5px #fff' : 'none' }} />
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: C.g500 }}>
            {NIVELES.map(n => <span key={n.nivel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: n.color }} />{n.label}</span>)}
          </div>
        </div>
      )}

      <span style={{ ...etiqueta, marginTop: 16 }} id={`${id}-hora`}>Hora</span>
      <div role="group" aria-labelledby={`${id}-hora`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" aria-pressed={!hora5} onClick={() => { setOtra(false); onHora('') }} style={pill(!hora5, false)}>Sin hora</button>
        {HORAS.map(h => {
          const activo = !esOtra && hora5 === h
          const t = tomadas[h]
          return (
            <button key={h} type="button" aria-pressed={activo} onClick={() => { setOtra(false); onHora(h) }}
              title={t ? `Ocupada: ${t.map(nombreDe).join(', ')}` : undefined}
              aria-label={t ? `${h}, ocupada con ${t.map(nombreDe).join(' y ')}` : h}
              style={pill(activo, !!t)}>
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

      {choqueActual.length > 0 && (
        <div role="status" style={{ marginTop: 12, background: C.amberLight, color: C.amber, borderRadius: 18, padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="alerta" size={17} />
          <span>Ya hay una cita a esa hora con <strong>{choqueActual.map(nombreDe).join(' y ')}</strong>. Puede guardar de todas formas.</span>
        </div>
      )}
    </div>
  )
}

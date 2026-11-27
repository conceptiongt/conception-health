import { useState, useMemo, useEffect } from 'react'
import { C, GLASS, SHADOW } from '../../lib/theme'
import { hoyISO } from '../../lib/formato'
import { DIAS_CORTOS, diaSemana, partesISO, sumarDias } from '../../lib/calendario'
import { RAYADO } from '../../lib/agenda'
import { ocupacionDelDia, estadoAhora, horaDe, inicioDia, minutosDelDia, rangoHoras, aHHMM, solapa } from '../../lib/quirofanos'
import { Badge } from '../ui/Varios'
import { Icon } from '../ui/Icon'
import { etiquetaReserva } from './comun'

const PX_HORA = 56
const PX_MIN = PX_HORA / 60
const ANCHO_HORAS = 52

// ─── «Ahora»: which rooms are free right now ───
export function Ahora({ quirofanos, reservas }) {
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(t) }, [])
  if (quirofanos.length === 0) return null
  return (
    <div role="status" aria-label="Quirófanos ahora" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      <span style={{ alignSelf: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.g400, marginRight: 4 }}>Ahora</span>
      {quirofanos.map(q => {
        if (q.fuera_de_servicio) return <Chip key={q.id} color={C.g500} bg={C.g100} punto={C.g300}>{q.nombre} — fuera de servicio</Chip>
        const e = estadoAhora(reservas, q.id, ahora)
        return e.libre
          ? <Chip key={q.id} color={C.green} bg={C.greenLight} punto="#34B36B">{q.nombre} — libre{e.hasta ? ` hasta las ${horaDe(e.hasta)}` : ''}</Chip>
          : <Chip key={q.id} color={C.amber} bg={C.amberLight} punto="#E0A100">{q.nombre} — {e.motivo === 'bloqueo' ? 'bloqueado' : 'ocupado'} hasta las {horaDe(e.hasta)}</Chip>
      })}
    </div>
  )
}
const Chip = ({ children, color, bg, punto }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 13px', borderRadius: 160, background: bg, color, fontSize: 13, fontWeight: 600, maxWidth: '100%' }}>
    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 8, background: punto, flexShrink: 0 }} />{children}
  </span>
)

// ─── Day: one column per room, time grid ───
export function VistaDia({ fecha, quirofanos, cirugias, bloqueos, equipo, movil, lectura, onSlot, onCirugia, onBloqueo }) {
  const hoy = hoyISO()
  const [qSel, setQSel] = useState('')
  const [pasando, setPasando] = useState(null) // { q, min } hovered empty slot
  const elegido = quirofanos.find(q => q.id === qSel) || quirofanos[0]
  const columnas = movil ? (elegido ? [elegido] : []) : quirofanos
  const [h0, h1] = useMemo(() => rangoHoras([...cirugias.map(c => ({ ini: c.ini, fin: c.fin + (c.limpieza_min || 0) * 60000 })), ...bloqueos], fecha), [cirugias, bloqueos, fecha])
  const alto = (h1 - h0) * PX_HORA
  const inicioGrid = inicioDia(fecha) + h0 * 3600000
  const [ahoraMs, setAhoraMs] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setAhoraMs(Date.now()), 30000); return () => clearInterval(t) }, [])
  const lineaAhora = fecha === hoy && ahoraMs >= inicioGrid && ahoraMs < inicioGrid + (h1 - h0) * 3600000 ? (ahoraMs - inicioGrid) / 60000 * PX_MIN : null
  const pos = (ini, fin) => {
    const a = Math.max(ini, inicioGrid), b = Math.min(fin, inicioGrid + (h1 - h0) * 3600000)
    return { top: (a - inicioGrid) / 60000 * PX_MIN, height: Math.max((b - a) / 60000 * PX_MIN, 22) }
  }
  const clic = (e, q) => {
    if (lectura || q.fuera_de_servicio) return
    const r = e.currentTarget.getBoundingClientRect()
    const min = Math.floor(((e.clientY - r.top) / PX_MIN + h0 * 60) / 30) * 30
    onSlot(q.id, aHHMM(Math.max(0, Math.min(min, 1410))))
  }
  const mover = (e, q) => {
    if (lectura || q.fuera_de_servicio) return
    const r = e.currentTarget.getBoundingClientRect()
    const min = Math.floor(((e.clientY - r.top) / PX_MIN + h0 * 60) / 30) * 30
    if (!pasando || pasando.q !== q.id || pasando.min !== min) setPasando({ q: q.id, min })
  }

  return (
    <div>
      {movil && quirofanos.length > 1 && (
        <div role="tablist" aria-label="Quirófano" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {quirofanos.map(q => (
            <button key={q.id} role="tab" aria-selected={elegido?.id === q.id} onClick={() => setQSel(q.id)} style={{ padding: '7px 14px', borderRadius: 160, border: `1.5px solid ${elegido?.id === q.id ? C.purple : C.g200}`, background: elegido?.id === q.id ? C.purple : 'rgba(255,255,255,0.9)', color: elegido?.id === q.id ? C.onPurple : C.g700, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>{q.nombre}</button>
          ))}
        </div>
      )}
      <div style={{ ...GLASS, borderRadius: 24, boxShadow: SHADOW, overflowX: 'auto', maxWidth: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${ANCHO_HORAS}px repeat(${columnas.length}, minmax(${movil ? 0 : 168}px, 1fr))`, minWidth: movil ? 0 : ANCHO_HORAS + columnas.length * 168 }}>
          <div style={{ borderBottom: `1px solid ${C.line}`, position: 'sticky', left: 0, background: 'rgba(255,255,255,0.95)', zIndex: 3 }} />
          {columnas.map(q => (
            <div key={q.id} style={{ padding: '12px 10px', borderBottom: `1px solid ${C.line}`, borderLeft: `1px solid ${C.g100}`, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nombre}</div>
                {q.fuera_de_servicio && <Badge color={C.amber} bg={C.amberLight}>Fuera de servicio</Badge>}
              </div>
              {!lectura && !q.fuera_de_servicio && <button type="button" onClick={() => onSlot(q.id, null)} aria-label={`Programar cirugía en ${q.nombre}`} title="Programar cirugía aquí" className="btn-ghost" style={{ width: 30, height: 30, borderRadius: 15, border: `1px solid ${C.g200}`, background: 'rgba(255,255,255,0.9)', color: C.purple, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="mas" size={15} /></button>}
            </div>
          ))}
          {/* hours */}
          <div style={{ position: 'sticky', left: 0, background: 'rgba(255,255,255,0.95)', zIndex: 2, height: alto }}>
            {Array.from({ length: h1 - h0 }, (_, i) => (
              <div key={i} style={{ position: 'absolute', top: i * PX_HORA - 7, right: 8, fontSize: 11.5, color: C.g400, fontVariantNumeric: 'tabular-nums' }}>{i === 0 ? '' : aHHMM((h0 + i) * 60)}</div>
            ))}
          </div>
          {columnas.map(q => (
            <div key={q.id} onClick={(e) => clic(e, q)} onMouseMove={(e) => mover(e, q)} onMouseLeave={() => setPasando(null)} data-columna={q.nombre}
              title={!lectura && !q.fuera_de_servicio ? 'Clic en un horario libre para programar una cirugía' : undefined}
              style={{
                position: 'relative', height: alto, borderLeft: `1px solid ${C.g100}`, cursor: lectura || q.fuera_de_servicio ? 'default' : 'copy',
                backgroundImage: `${q.fuera_de_servicio ? `${RAYADO(0.07)}, ` : ''}repeating-linear-gradient(to bottom, ${C.line} 0, ${C.line} 1px, transparent 1px, transparent ${PX_HORA / 2}px, rgba(226,232,244,0.45) ${PX_HORA / 2}px, rgba(226,232,244,0.45) ${PX_HORA / 2 + 1}px, transparent ${PX_HORA / 2 + 1}px, transparent ${PX_HORA}px)`,
              }}>
              {pasando?.q === q.id && (
                <div aria-hidden="true" style={{ position: 'absolute', left: 3, right: 3, top: (pasando.min - h0 * 60) * PX_MIN, height: 30 * PX_MIN - 2, borderRadius: 8, background: 'var(--acento-tenue)', border: `1px dashed ${C.purple}`, color: 'var(--acento-fuerte)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', padding: '0 8px', pointerEvents: 'none' }}>+ {aHHMM(pasando.min)}</div>
              )}
              {bloqueos.filter(b => b.recurso_id === q.id).map(b => {
                const p = pos(b.ini, b.fin)
                return (
                  <button key={b.id} type="button" onClick={(e) => { e.stopPropagation(); onBloqueo(b) }} style={{ position: 'absolute', left: 3, right: 3, ...p, borderRadius: 10, border: `1px solid ${C.g300}`, backgroundImage: RAYADO(0.22), backgroundColor: 'rgba(237,241,249,0.9)', color: C.g700, textAlign: 'left', padding: '4px 8px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', overflow: 'hidden' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}><Icon name="candado" size={11} />{b.titulo}</span>
                    <div style={{ fontSize: 11.5, color: C.g500 }}>{horaDe(b.ini)} – {horaDe(b.fin)}</div>
                  </button>
                )
              })}
              {cirugias.filter(c => c.quirofano_id === q.id).map(c => {
                const p = pos(c.ini, c.fin)
                const est = equipo.estilo(c.cirujano_id)
                const pac = equipo.pacPorCita(c.cita_id)
                const an = c.anestesiologo_id ? equipo.corto(c.anestesiologo_id) : null
                const corto = p.height < 52
                const limpieza = (c.limpieza_min || 0) * PX_MIN
                return (
                  <div key={c.cita_id}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onCirugia(c) }} aria-label={`${pac?.nombre || 'Cirugía'}, ${c.procedimiento || ''}, ${horaDe(c.ini)} a ${horaDe(c.fin)}`}
                      style={{ position: 'absolute', left: 3, right: 3, ...p, borderRadius: 10, border: `1px solid ${est.borde}`, borderLeft: `5px solid ${est.base}`, background: est.fondo, color: est.texto, textAlign: 'left', padding: corto ? '2px 8px' : '5px 8px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', overflow: 'hidden', opacity: c.estado === 'realizada' ? 0.72 : 1, boxShadow: c.estado === 'en_curso' ? `0 0 0 2px ${C.amber}` : 'none' }}>
                      {corto
                        ? <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{horaDe(c.ini)} {pac?.nombre || 'Cirugía'}</span>
                        : <>
                          <div style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {horaDe(c.ini)} – {horaDe(c.fin)}
                            {c.estado === 'en_curso' && <span style={{ fontWeight: 700, color: C.amber }}>· En curso</span>}
                            {c.estado === 'realizada' && <Icon name="check" size={11} />}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pac?.nombre || 'Paciente'}</div>
                          {p.height > 72 && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.procedimiento || 'Cirugía'}</div>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 8, background: est.base, flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{equipo.corto(c.cirujano_id)}{an ? ` · Anest. ${an}` : ''}</span>
                          </div>
                        </>}
                    </button>
                    {limpieza > 0 && (
                      <div aria-hidden="true" title={`Limpieza: ${c.limpieza_min} min`} style={{ position: 'absolute', left: 3, right: 3, top: p.top + p.height, height: limpieza, borderRadius: '0 0 8px 8px', backgroundImage: RAYADO(0.2), border: `1px dashed ${C.g300}`, borderTop: 'none', pointerEvents: 'none' }} />
                    )}
                  </div>
                )
              })}
              {lineaAhora != null && <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: lineaAhora, height: 0, borderTop: `2px solid ${C.red}`, zIndex: 2, pointerEvents: 'none' }}><span style={{ position: 'absolute', left: -4, top: -5, width: 8, height: 8, borderRadius: 8, background: C.red }} /></div>}
            </div>
          ))}
        </div>
      </div>
      {cirugias.length === 0 && bloqueos.length === 0 && quirofanos.length > 0 && (
        <div style={{ textAlign: 'center', color: C.g500, fontSize: 13.5, padding: '14px 0 0' }}>No hay cirugías este día{lectura ? '' : '. Haga clic en un horario libre para programar una.'}</div>
      )}
    </div>
  )
}

// ─── Week: rows = rooms, columns = days ───
export function VistaSemana({ inicio, quirofanos, cirugias, reservas, equipo, onDia }) {
  const hoy = hoyISO()
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i))
  const nivel = (f) => (f >= 0.85 ? '#E5484D' : f >= 0.5 ? '#E0A100' : '#34B36B')
  return (
    <div style={{ ...GLASS, borderRadius: 24, boxShadow: SHADOW, overflowX: 'auto', maxWidth: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(7, minmax(112px, 1fr))`, minWidth: 140 + 7 * 112 }}>
        <div style={{ borderBottom: `1px solid ${C.line}` }} />
        {dias.map(d => {
          const { d: n } = partesISO(d)
          return (
            <button key={d} type="button" onClick={() => onDia(d)} style={{ padding: '10px 6px', border: 'none', borderBottom: `1px solid ${C.line}`, borderLeft: `1px solid ${C.g100}`, background: d === hoy ? 'var(--acento-tenue)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', color: d === hoy ? 'var(--acento-fuerte)' : C.g600 }} aria-label={`Ver el día ${d}`}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{DIAS_CORTOS[diaSemana(d)]}</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{n}</div>
            </button>
          )
        })}
        {quirofanos.map(q => (
          <Fragmento key={q.id}>
            <div style={{ padding: '12px 10px', borderTop: `1px solid ${C.g100}`, fontWeight: 600, fontSize: 14, color: C.black, overflowWrap: 'anywhere' }}>
              {q.nombre}{q.fuera_de_servicio && <div><Badge color={C.amber} bg={C.amberLight}>Fuera de servicio</Badge></div>}
            </div>
            {dias.map(d => {
              const a = inicioDia(d), b = a + 86400000
              const del = cirugias.filter(c => c.quirofano_id === q.id && c.estado !== 'suspendida' && solapa(c.ini, c.fin, a, b)).sort((x, y) => x.ini - y.ini)
              const f = ocupacionDelDia(reservas, q.id, d)
              return (
                <button key={d} type="button" onClick={() => onDia(d)} aria-label={`${q.nombre}, ${d}: ${del.length} cirugías`} className="fila"
                  style={{ padding: '8px 7px 10px', borderTop: `1px solid ${C.g100}`, borderLeft: `1px solid ${C.g100}`, borderRight: 'none', borderBottom: 'none', background: d === hoy ? 'rgba(231,236,255,0.35)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, minHeight: 92 }}>
                  {del.slice(0, 3).map(c => {
                    const est = equipo.estilo(c.cirujano_id)
                    return <span key={c.cita_id} style={{ display: 'block', fontSize: 11.5, padding: '2px 6px', borderRadius: 6, background: est.fondo, color: est.texto, borderLeft: `3px solid ${est.base}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{horaDe(c.ini)} {equipo.pacPorCita(c.cita_id)?.nombre || 'Cirugía'}</span>
                  })}
                  {del.length > 3 && <span style={{ fontSize: 11.5, color: C.g500 }}>+{del.length - 3} más</span>}
                  {del.length === 0 && <span style={{ fontSize: 12, color: C.g400 }}>{f > 0 ? 'Bloqueado' : 'Libre'}</span>}
                  <span style={{ marginTop: 'auto', display: 'block', height: 6, borderRadius: 6, background: C.g100, overflow: 'hidden' }} role="img" aria-label={`Ocupado ${Math.round(f * 100)}% de 06:00 a 22:00`}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.round(f * 100)}%`, background: nivel(f), borderRadius: 6 }} />
                  </span>
                </button>
              )
            })}
          </Fragmento>
        ))}
      </div>
    </div>
  )
}
const Fragmento = ({ children }) => <>{children}</>

// ─── Staff: each surgeon / anesthesiologist with their busy stretches of the day ───
export function VistaPersonal({ fecha, equipo, reservas }) {
  const a = inicioDia(fecha), b = a + 86400000
  const gente = [...equipo.cirujanos.map(p => ({ p, rol: 'Cirujano' })), ...equipo.anestesiologos.map(p => ({ p, rol: 'Anestesiólogo' }))]
  const [h0, h1] = [6, 22]
  if (gente.length === 0) return <div style={{ ...GLASS, borderRadius: 24, padding: 24, color: C.g500, fontSize: 14 }}>Todavía no hay cirujanos ni anestesiólogos registrados. Agréguelos en Configuración.</div>
  return (
    <div style={{ ...GLASS, borderRadius: 24, boxShadow: SHADOW, padding: '8px 18px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 210px) minmax(0, 1fr)', gap: 12, padding: '10px 0 4px', color: C.g400, fontSize: 11.5 }}>
        <span />
        <div style={{ position: 'relative', height: 14 }}>{[6, 10, 14, 18, 22].map(h => <span key={h} style={{ position: 'absolute', left: `${(h - h0) / (h1 - h0) * 100}%`, transform: h === 22 ? 'translateX(-100%)' : h === 6 ? 'none' : 'translateX(-50%)' }}>{String(h).padStart(2, '0')}:00</span>)}</div>
      </div>
      {gente.map(({ p, rol }) => {
        const mias = reservas.filter(r => r.recurso_id === p.id && solapa(r.ini, r.fin, a, b)).sort((x, y) => x.ini - y.ini)
        const color = equipo.colorDe(p.id)
        return (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 210px) minmax(0, 1fr)', gap: 12, padding: '12px 0', borderTop: `1px solid ${C.g100}`, alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14.5, overflowWrap: 'anywhere' }}><span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 11, background: color, flexShrink: 0 }} />{p.nombre}</div>
              <div style={{ fontSize: 12.5, color: C.g500, marginLeft: 19 }}>{rol}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ position: 'relative', height: 14, borderRadius: 7, background: '#DDF3E6', overflow: 'hidden' }} role="img" aria-label={mias.length ? `${p.nombre}: ocupado` : `${p.nombre}: libre todo el día`}>
                {mias.map(r => {
                  const i = Math.max(minutosDelDia(r.ini, fecha), h0 * 60), f = Math.min(minutosDelDia(r.fin, fecha), h1 * 60)
                  if (f <= i) return null
                  return <span key={r.id || r.cita_id + r.ini} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i - h0 * 60) / ((h1 - h0) * 60) * 100}%`, width: `${(f - i) / ((h1 - h0) * 60) * 100}%`, background: r.motivo === 'bloqueo' ? C.g300 : color, backgroundImage: r.motivo === 'bloqueo' ? RAYADO(0.3) : 'none' }} />
                })}
              </div>
              {mias.length === 0 ? <div style={{ fontSize: 13, color: C.green, fontWeight: 600, marginTop: 6 }}>Libre todo el día</div> : (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {mias.map(r => (
                    <div key={r.id || r.cita_id + r.ini} style={{ fontSize: 13, color: C.g700 }}>
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{horaDe(r.ini)} – {horaDe(r.fin)}</strong> · {etiquetaReserva(r, equipo)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

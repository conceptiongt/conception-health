import { useState, useEffect, useMemo } from 'react'
import { C, SERIF, SHADOW, GLASS } from '../lib/theme'
import { ESTADOS_CITA, MESES, estadoCita } from '../lib/constantes'
import { tiposDe } from '../lib/especialidades'
import { puede, esSoporte } from '../lib/permisos'
import { hoyISO, fmtHora, linkCalendar, linkWhatsApp, mensajeConfirmacion } from '../lib/formato'
import {
  DIAS_CORTOS, DIAS_INICIAL, PALETA, aMinutos, agruparPorDia, colorDeCita, colorDeClave, duracionCita, esISO,
  fechaLarga, guardarPreferencias, agruparGoogle, leerVerGoogle, guardarVerGoogle, guardarVista, inicioSemana, leerPreferencias, leerVista, matrizMes, mayuscula, partesISO,
  sumarDias, sumarMeses, diaSemana, textoDuracion,
} from '../lib/calendario'
import { useDatos } from '../hooks/useDatos'
import { FiltroSede, nombreSede } from '../components/Filtros'
import { Encabezado, Card, Segmentos, Badge } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Modal } from '../components/ui/Modal'
import { toast } from '../components/ui/Toast'
import { CitaModal } from '../components/CitaModal'
import { SelectorColor } from '../components/SelectorColor'
import { TarjetaGoogle } from '../components/TarjetaGoogle'
import { googleEstado, eventosGoogle, alAvisoGoogle } from '../lib/google'
import { bloqueosDelDia, RAYADO } from '../lib/bloqueos'
import { useBloqueos } from '../hooks/useBloqueos'
import { BloqueoModal } from '../components/BloqueoModal'
import { BandaBloqueo, ChipBloqueo, ListaBloqueosDia, TarjetaBloqueos } from '../components/BloqueosCalendario'

const PX_HORA = 56 // height of one hour in the time grids
const SLATE = '#677188' // neutral colour of Google events that carry none of their own

function useMedia(consulta) {
  const [v, setV] = useState(() => window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const f = () => setV(m.matches)
    m.addEventListener('change', f); f()
    return () => m.removeEventListener('change', f)
  }, [consulta])
  return v
}

const flechaNav = { width: 38, height: 38, borderRadius: 160, border: `1px solid ${C.g200}`, background: 'rgba(255,255,255,0.9)', cursor: 'pointer', color: C.g600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }

// "23 – 29 de noviembre de 2026" / "30 nov – 6 dic 2026"
function tituloSemana(inicio) {
  const a = partesISO(inicio), b = partesISO(sumarDias(inicio, 6))
  if (a.m === b.m) return `${a.d} – ${b.d} de ${MESES[a.m].toLowerCase()} de ${b.y}`
  const corto = (m) => MESES[m].slice(0, 3).toLowerCase()
  return `${a.d} ${corto(a.m)}${a.y !== b.y ? ` ${a.y}` : ''} – ${b.d} ${corto(b.m)} ${b.y}`
}

export function Calendario({ fechaInicial }) {
  const { citas, pacientes, clinica, perfil, recargar, recargarSesion, ir, sedes } = useDatos()
  const [vista, setVista] = useState(() => leerVista().vista)
  const [fecha, setFecha] = useState(() => esISO(fechaInicial) ? fechaInicial : hoyISO())
  const [sede, setSede] = useState('')
  const [prefs, setPrefs] = useState(() => leerPreferencias(clinica))
  const [colorPor, setColorPor] = useState(() => leerVista().colorPor || leerPreferencias(clinica).colorPor)
  const [abierta, setAbierta] = useState(null) // appointment shown in the detail window
  const [editando, setEditando] = useState(null)
  const [personalizando, setPersonalizando] = useState(false)
  // agenda blocks (stored with the receptionist's settings): drawn in every view, edited from here. Support sessions only look.
  const { bloqueos, setBloqueos, error: errorBloqueos } = useBloqueos()
  const [bloqueando, setBloqueando] = useState(null) // { bloqueo | null, fecha } while the block window is open
  const puedeBloquear = !esSoporte(perfil)
  useEffect(() => { if (errorBloqueos) toast.error('No se pudieron cargar los bloqueos') }, [errorBloqueos])
  const compacto = useMedia('(max-width: 640px)')
  const hoy = hoyISO()

  // ---- read-only events of the clinic's Google calendars (shown next to the citas, never counted as citas) ----
  const [estG, setEstG] = useState(null)
  const [verGoogle, setVerGoogle] = useState(leerVerGoogle)
  const [eventosG, setEventosG] = useState([])
  const [googleAbierto, setGoogleAbierto] = useState(null)
  useEffect(() => {
    let vivo = true
    const leer = () => googleEstado().then(e => { if (vivo) setEstG(e) })
    leer()
    const quitar = alAvisoGoogle(leer)
    return () => { vivo = false; quitar() }
  }, [])
  const googleConectado = !!(estG?.conectada && estG.confirmada && estG.estado !== 'error')

  // arriving from Inicio (or back/forward) with a day in the address
  useEffect(() => { if (esISO(fechaInicial)) setFecha(fechaInicial) }, [fechaInicial])
  // the clinic's saved colours changed (after saving or reloading the session)
  useEffect(() => { setPrefs(leerPreferencias(clinica)) }, [clinica])

  const porId = useMemo(() => Object.fromEntries(pacientes.map(p => [p.id, p])), [pacientes])
  const visibles = useMemo(() => citas.filter(c => porId[c.paciente_id] && (!sede || c.sede_id === sede)), [citas, porId, sede])
  const porDia = useMemo(() => agruparPorDia(visibles), [visibles])
  const prefsEf = useMemo(() => ({ ...prefs, colorPor }), [prefs, colorPor])
  const colorDe = (c) => colorDeCita(c, prefsEf)

  // the visible day lives in the address too (replace, so Back does not step through every arrow click)
  const fijarFecha = (iso) => {
    setFecha(iso)
    if (window.location.hash.startsWith('#/calendario')) window.history.replaceState(null, '', `#/calendario/${iso}`)
  }
  const cambiarVista = (v) => { setVista(v); guardarVista({ vista: v, colorPor }) }
  const cambiarColorPor = (v) => { setColorPor(v); guardarVista({ vista, colorPor: v }) }
  const abrirDia = (iso) => { fijarFecha(iso); cambiarVista('dia') }
  const mover = (n) => fijarFecha(vista === 'mes' ? sumarMeses(fecha, n) : sumarDias(fecha, vista === 'semana' ? 7 * n : n))

  const { y, m } = partesISO(fecha)
  // visible range: the whole grid in the month view, 7 days in the week view, one day in the day view
  const { desde, hasta } = useMemo(() => {
    if (vista === 'dia') return { desde: fecha, hasta: fecha }
    if (vista === 'semana') return { desde: inicioSemana(fecha), hasta: sumarDias(inicioSemana(fecha), 6) }
    const sem = matrizMes(partesISO(fecha).y, partesISO(fecha).m)
    return { desde: sem[0][0].iso, hasta: sem[sem.length - 1][6].iso }
  }, [vista, fecha])
  useEffect(() => {
    if (!googleConectado || !verGoogle) { setEventosG([]); return }
    let vivo = true
    eventosGoogle(desde, hasta).then(r => { if (vivo) setEventosG(r.eventos) })
    return () => { vivo = false }
  }, [googleConectado, verGoogle, desde, hasta])
  const gPorDia = useMemo(() => agruparGoogle(eventosG, desde, hasta), [eventosG, desde, hasta])
  // { 'YYYY-MM-DD': [block of that day] } for the visible range
  const bPorDia = useMemo(() => {
    const o = {}
    for (let d = desde, n = 0; d <= hasta && n < 45; d = sumarDias(d, 1), n++) { const l = bloqueosDelDia(bloqueos, d); if (l.length) o[d] = l }
    return o
  }, [bloqueos, desde, hasta])
  const cambiarVerGoogle = () => { const v = !verGoogle; setVerGoogle(v); guardarVerGoogle(v) }
  const titulo = vista === 'mes' ? `${MESES[m]} ${y}` : vista === 'semana' ? tituloSemana(inicioSemana(fecha)) : mayuscula(fechaLarga(fecha))
  const enRango = vista === 'mes' ? visibles.filter(c => c.fecha.slice(0, 7) === fecha.slice(0, 7)).length
    : vista === 'semana' ? Array.from({ length: 7 }, (_, i) => (porDia[sumarDias(inicioSemana(fecha), i)] || []).length).reduce((a, b) => a + b, 0)
    : (porDia[fecha] || []).length
  const nombreCorto = (c) => (porId[c.paciente_id]?.nombre || '').split(' ')[0]

  if (editando) return <CitaModal soloCita cita={editando} paciente={porId[editando.paciente_id]} clinicaId={perfil.clinica_id} onClose={() => setEditando(null)} onGuardado={() => { setEditando(null); recargar() }} />

  const onBloqueo = puedeBloquear ? (bloqueo) => setBloqueando({ bloqueo }) : undefined
  const propsVista = { porDia, gPorDia, bPorDia, onBloqueo, onGoogle: setGoogleAbierto, porId, colorDe, hoy, nombreCorto, onCita: setAbierta, onDia: abrirDia }

  return (
    <>
      <Encabezado titulo="Calendario" subtitulo={`${enRango} ${enRango === 1 ? 'cita' : 'citas'} · ${titulo}`}>
        {puedeBloquear && <Button variant="ghost" icon="candado" onClick={() => setBloqueando({ bloqueo: null, fecha })}>Bloquear agenda</Button>}
        <Button onClick={() => ir('registrar')} icon="mas">Nueva cita</Button>
      </Encabezado>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" style={flechaNav} aria-label={vista === 'mes' ? 'Mes anterior' : vista === 'semana' ? 'Semana anterior' : 'Día anterior'} onClick={() => mover(-1)}><Icon name="atras" size={17} /></button>
        <button type="button" style={flechaNav} aria-label={vista === 'mes' ? 'Mes siguiente' : vista === 'semana' ? 'Semana siguiente' : 'Día siguiente'} onClick={() => mover(1)}><Icon name="flecha" size={17} /></button>
        <Button variant="ghost" size="sm" onClick={() => fijarFecha(hoy)}>Hoy</Button>
        <h2 aria-live="polite" style={{ fontFamily: SERIF, fontSize: 'clamp(18px, 2.2vw, 24px)', fontWeight: 500, margin: '0 6px', letterSpacing: '-0.015em', color: C.black, flex: '1 1 200px', minWidth: 0 }}>{titulo}</h2>
        <Segmentos valor={vista} onChange={cambiarVista} opciones={[{ value: 'mes', label: 'Mes' }, { value: 'semana', label: 'Semana' }, { value: 'dia', label: 'Día' }]} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <FiltroSede valor={sede} onChange={setSede} contar={(id) => citas.filter(c => !id || c.sede_id === id).length} />
        <span style={{ fontSize: 13, color: C.g500 }}>Colorear por:</span>
        <Segmentos valor={colorPor} onChange={cambiarColorPor} opciones={[{ value: 'tipo', label: 'Tipo de consulta' }, { value: 'estado', label: 'Estado' }]} />
        {googleConectado && (
          <button type="button" onClick={cambiarVerGoogle} aria-pressed={verGoogle} title="Mostrar u ocultar los eventos de Google Calendar" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px 6px 10px', borderRadius: 160, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
            border: verGoogle ? `1.5px solid ${C.g600}` : `1.5px solid ${C.g200}`, background: verGoogle ? '#fff' : 'rgba(255,255,255,0.5)', color: verGoogle ? C.g700 : C.g400,
          }}><MarcaG />Google</button>
        )}
        {puede(perfil, 'configuracion') && <Button variant="ghost" size="sm" icon="ajustes" onClick={() => setPersonalizando(true)}>Personalizar colores</Button>}
      </div>

      <Leyenda prefs={prefsEf} clinica={clinica} citas={visibles} conGoogle={googleConectado && verGoogle} conBloqueos={bloqueos.length > 0} />

      {vista === 'mes' && (compacto
        ? <MesCompacto fecha={fecha} {...propsVista} onElegir={fijarFecha} onAbrirDia={abrirDia} />
        : <VistaMes fecha={fecha} {...propsVista} />)}
      {vista === 'semana' && <Grilla dias={Array.from({ length: 7 }, (_, i) => sumarDias(inicioSemana(fecha), i))} {...propsVista} minAncho={760} />}
      {vista === 'dia' && (
        <div className="cal-dia">
          <Grilla dias={[fecha]} {...propsVista} conCabecera={false} />
          <ListaDia iso={fecha} {...propsVista} sedes={sedes} />
        </div>
      )}

      <TarjetaBloqueos bloqueos={bloqueos} clinica={clinica} editable={puedeBloquear} onEditar={(b) => setBloqueando({ bloqueo: b })} onCambio={setBloqueos} />
      <TarjetaGoogle perfil={perfil} />

      {bloqueando && <BloqueoModal bloqueo={bloqueando.bloqueo} fechaInicial={bloqueando.fecha} citas={citas} clinica={clinica} onClose={() => setBloqueando(null)} onGuardado={(l) => { setBloqueos(l); setBloqueando(null) }} />}
      {googleAbierto && <DetalleGoogle g={googleAbierto} onClose={() => setGoogleAbierto(null)} />}
      {abierta && (
        <DetalleCita cita={abierta} paciente={porId[abierta.paciente_id]} sedes={sedes} clinica={clinica} perfil={perfil} onClose={() => setAbierta(null)}
          onEditar={() => { setEditando(abierta); setAbierta(null) }} onExpediente={() => ir('expedientes', abierta.paciente_id)} />
      )}
      {personalizando && (
        <PersonalizarColores clinica={clinica} prefs={prefs} colorPor={colorPor} tipos={tiposUsados(clinica, citas)} onClose={() => setPersonalizando(false)}
          onGuardado={(r) => { setPrefs(r.prefs); if (r.remoto) recargarSesion() }} />
      )}
    </>
  )
}

// consultation types of the specialty plus any other type already used in appointments
function tiposUsados(clinica, citas) {
  return [...new Set([...tiposDe(clinica?.especialidad), ...citas.map(c => c.tipo).filter(Boolean)])]
}

function Leyenda({ prefs, clinica, citas, conGoogle, conBloqueos }) {
  const claves = prefs.colorPor === 'estado'
    ? ESTADOS_CITA.map(e => ({ clave: `estado:${e.value}`, label: e.value }))
    : tiposUsados(clinica, citas).map(t => ({ clave: `tipo:${t}`, label: t }))
  return (
    <div role="list" aria-label="Colores" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {claves.map(k => (
        <span key={k.clave} role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 12px 4px 9px', borderRadius: 160, fontSize: 12.5, fontWeight: 500, color: C.g700, background: 'rgba(255,255,255,0.75)', border: `1px solid ${C.g200}` }}>
          <span style={{ width: 10, height: 10, borderRadius: 10, background: colorDeClave(k.clave, prefs) }} />{k.label}
        </span>
      ))}
 {conBloqueos && (
        <span role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 12px 4px 9px', borderRadius: 160, fontSize: 12.5, fontWeight: 500, color: C.g700, background: 'rgba(255,255,255,0.75)', border: `1px solid ${C.g200}` }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 4, border: `1px solid ${C.g300}`, backgroundImage: RAYADO(0.35) }} />Bloqueos
        </span>
      )}
      {conGoogle && (
        <span role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 12px 4px 9px', borderRadius: 160, fontSize: 12.5, fontWeight: 500, color: C.g700, background: 'rgba(255,255,255,0.75)', border: `1px dashed ${C.g300}` }}>
          <MarcaG />Eventos de Google
        </span>
      )}
    </div>
  )
}

// small "G" mark: this item comes from Google Calendar
function MarcaG({ size = 14 }) {
  return <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: size, background: '#fff', border: `1px solid ${C.g300}`, color: C.g600, fontSize: size - 5, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>G</span>
}

// Google event chip: soft white glass with a bar in the calendar's colour; read-only, so it never looks like a cita
function ChipG({ g, onClick, texto }) {
  const t = texto ?? `${g.hora ? g.hora + ' ' : ''}${g.titulo}`
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }} title={`${g.titulo} · ${g.calendario}`} style={{
      display: 'flex', alignItems: 'center', gap: 5, width: '100%', textAlign: 'left', padding: '3px 7px', borderRadius: 8, border: `1px solid ${C.g200}`, borderLeft: `3px solid ${g.color || SLATE}`, cursor: 'pointer',
      background: 'rgba(255,255,255,0.8)', color: C.g700, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, lineHeight: 1.35, animation: 'aparecer 250ms ease-out',
    }}><MarcaG size={13} /><span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span></button>
  )
}

// a coloured appointment chip (month view)
function Chip({ c, col, texto, onClick }) {
  const apagada = ['Cancelada', 'Reagendada'].includes(c.estado)
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }} title={texto} style={{
      display: 'block', width: '100%', textAlign: 'left', padding: '3px 7px', borderRadius: 8, border: 'none', borderLeft: `3px solid ${col.base}`, cursor: 'pointer',
      background: col.fondo, color: col.texto, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      opacity: apagada ? 0.6 : 1,
    }}>{texto}</button>
  )
}

function VistaMes({ fecha, porDia, gPorDia, bPorDia, onBloqueo, onGoogle, porId, colorDe, hoy, nombreCorto, onCita, onDia }) {
  const { y, m } = partesISO(fecha)
  const semanas = matrizMes(y, m)
  return (
    <div style={{ ...GLASS, borderRadius: 24, boxShadow: SHADOW, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: 'rgba(237,241,249,0.6)', borderBottom: `1px solid ${C.line}` }}>
        {DIAS_CORTOS.map(d => <div key={d} style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: C.g500, textAlign: 'center', textTransform: 'capitalize' }}>{d}</div>)}
      </div>
      {semanas.map((sem, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {sem.map(d => {
            const lista = [...(porDia[d.iso] || []), ...(gPorDia[d.iso] || [])]
            const bl = bPorDia[d.iso] || []
            const esHoy = d.iso === hoy
            const fondoDia = esHoy ? 'var(--acento-tenue)' : d.delMes ? 'transparent' : 'rgba(246,248,253,0.55)'
            return (
              <div key={d.iso} onClick={() => onDia(d.iso)} className="fila" style={{
                minHeight: 112, minWidth: 0, padding: 6, borderTop: i ? `1px solid ${C.g100}` : 'none', borderLeft: `1px solid ${C.g100}`, cursor: 'pointer',
                background: bl.some(b => b.todoElDia) ? `${RAYADO(0.07)}, ${fondoDia}` : fondoDia,
              }}>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDia(d.iso) }} aria-label={`Abrir ${fechaLarga(d.iso)}`} style={{
                  width: 26, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: esHoy ? 700 : 500, marginBottom: 4,
                  background: esHoy ? C.purple : 'transparent', color: esHoy ? C.onPurple : d.delMes ? C.black : C.g400,
                }}>{d.dia}</button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {bl.map((it, k) => <ChipBloqueo key={k} item={it} onClick={onBloqueo && (() => onBloqueo(it.bloqueo))} />)}
                  {lista.slice(0, 3).map(c => c.g
                    ? <ChipG key={c.clave} g={c} onClick={() => onGoogle(c)} />
                    : <Chip key={c.id} c={c} col={colorDe(c)} onClick={() => onCita(c)} texto={`${c.hora ? c.hora.slice(0, 5) + ' ' : ''}${nombreCorto(c)}`} />)}
                  {lista.length > 3 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onDia(d.iso) }} style={{ border: 'none', background: 'none', textAlign: 'left', padding: '1px 4px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--acento-fuerte)', cursor: 'pointer' }}>+{lista.length - 3} más</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Phones: coloured dots per day, and the list of the chosen day below
function MesCompacto({ fecha, porDia, gPorDia, bPorDia, onBloqueo, onGoogle, porId, colorDe, hoy, nombreCorto, onCita, onElegir, onAbrirDia }) {
  const { y, m } = partesISO(fecha)
  const semanas = matrizMes(y, m)
  return (
    <>
      <div style={{ ...GLASS, borderRadius: 20, boxShadow: SHADOW, padding: '8px 6px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {DIAS_INICIAL.map((d, i) => <div key={i} aria-hidden="true" style={{ padding: '6px 0', fontSize: 12, fontWeight: 600, color: C.g500, textAlign: 'center' }}>{d}</div>)}
          {semanas.flat().map(d => {
            const lista = porDia[d.iso] || []
            const nG = (gPorDia[d.iso] || []).length
            const bl = bPorDia[d.iso] || []
            const sel = d.iso === fecha
            const esHoy = d.iso === hoy
            return (
              <button key={d.iso} type="button" onClick={() => onElegir(d.iso)} aria-pressed={sel} aria-label={`${fechaLarga(d.iso)}, ${lista.length === 1 ? '1 cita' : `${lista.length} citas`}${nG ? `, ${nG === 1 ? '1 evento' : `${nG} eventos`} de Google` : ''}${bl.length ? `, bloqueado: ${bl.map(b => b.titulo).join(', ')}` : ''}`} style={{
                height: 48, border: esHoy && !sel ? `1.5px solid ${C.purple}` : '1.5px solid transparent', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, padding: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                position: 'relative', background: sel ? C.purple : bl.some(b => b.todoElDia) ? RAYADO(0.14) : 'transparent', color: sel ? C.onPurple : d.delMes ? C.black : C.g400, fontWeight: sel || esHoy ? 700 : 500,
              }}>
                {bl.length > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: 3, right: 4, display: 'inline-flex', color: sel ? C.onPurple : C.g500 }}><Icon name="candado" size={10} /></span>}
                {d.dia}
                <span style={{ display: 'flex', gap: 2, height: 5 }}>
                  {lista.slice(0, nG ? 2 : 3).map(c => <span key={c.id} style={{ width: 5, height: 5, borderRadius: 5, background: colorDe(c).base, boxShadow: sel ? '0 0 0 1px #fff' : 'none' }} />)}
                  {nG > 0 && <span style={{ width: 5, height: 5, borderRadius: 5, background: SLATE, boxShadow: sel ? '0 0 0 1px #fff' : 'none' }} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, fontWeight: 600, fontSize: 15, color: C.black }}>{mayuscula(fechaLarga(fecha))}</div>
          <Button size="sm" variant="ghost" onClick={() => onAbrirDia(fecha)}>Ver día</Button>
        </div>
        <ListaBloqueosDia lista={bPorDia[fecha] || []} onBloqueo={onBloqueo} />
        <ListaCitas lista={porDia[fecha] || []} porId={porId} colorDe={colorDe} onCita={onCita} />
        <ListaGoogle lista={gPorDia[fecha] || []} onGoogle={onGoogle} />
      </div>
    </>
  )
}

function ListaCitas({ lista, porId, colorDe, onCita, sedes }) {
  if (!lista.length) return <div style={{ ...GLASS, borderRadius: 20, padding: '22px 16px', textAlign: 'center', fontSize: 13.5, color: C.g500 }}>No hay citas este día</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lista.map(c => {
        const col = colorDe(c)
        const e = estadoCita(c.estado)
        return (
          <button key={c.id} type="button" onClick={() => onCita(c)} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 16, border: 'none', borderLeft: `4px solid ${col.base}`,
            background: col.fondo, color: col.texto, cursor: 'pointer', fontFamily: 'inherit', opacity: ['Cancelada', 'Reagendada'].includes(c.estado) ? 0.65 : 1,
          }}>
            <span style={{ width: 48, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{c.hora ? fmtHora(c.hora) : 'Sin hora'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{porId[c.paciente_id]?.nombre}</span>
              <span style={{ display: 'block', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.tipo, c.servicio, sedes && nombreSede(sedes, c.sede_id)].filter(Boolean).join(' · ') || 'Consulta'}</span>
            </span>
            <Badge color={e.color === C.purple ? 'var(--acento-fuerte)' : e.color} bg="#fff">{c.estado}</Badge>
          </button>
        )
      })}
    </div>
  )
}

// Google events of one day, under their own «Google» subheading (nothing is drawn when there are none)
function ListaGoogle({ lista, onGoogle }) {
  if (!lista.length) return null
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: C.g500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}><MarcaG />Google</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lista.map(g => (
          <button key={g.clave} type="button" onClick={() => onGoogle(g)} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 16, border: `1px solid ${C.g200}`, borderLeft: `4px solid ${g.color || SLATE}`,
            background: 'rgba(255,255,255,0.8)', color: C.g700, cursor: 'pointer', fontFamily: 'inherit', animation: 'aparecer 250ms ease-out',
          }}>
            <span style={{ width: 48, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{g.hora ? fmtHora(g.hora) : 'Todo el día'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.titulo}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: C.g500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.calendario}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ListaDia({ iso, porDia, gPorDia, bPorDia, onBloqueo, onGoogle, porId, colorDe, onCita, sedes }) {
  return (
    <div style={{ minWidth: 0 }}>
      <ListaBloqueosDia lista={bPorDia[iso] || []} onBloqueo={onBloqueo} />
      <div style={{ fontSize: 15, fontWeight: 500, color: C.black, marginBottom: 10 }}>Citas del día</div>
      <ListaCitas lista={porDia[iso] || []} porId={porId} colorDe={colorDe} onCita={onCita} sedes={sedes} />
      <ListaGoogle lista={gPorDia[iso] || []} onGoogle={onGoogle} />
    </div>
  )
}

// Side-by-side columns for appointments that overlap in time
function distribuir(lista) {
  const ev = lista.filter(c => c.hora).map(c => { const ini = aMinutos(c.hora); return { c, ini, fin: ini + duracionCita(c) } }).sort((a, b) => a.ini - b.ini || b.fin - a.fin)
  const res = []
  let grupo = [], finGrupo = -1
  const cerrar = () => {
    const cols = []
    for (const e of grupo) { let i = cols.findIndex(f => f <= e.ini); if (i < 0) { i = cols.length; cols.push(0) } cols[i] = e.fin; e.col = i }
    grupo.forEach(e => { e.cols = cols.length; res.push(e) })
    grupo = []; finGrupo = -1
  }
  for (const e of ev) { if (grupo.length && e.ini >= finGrupo) cerrar(); grupo.push(e); finGrupo = Math.max(finGrupo, e.fin) }
  if (grupo.length) cerrar()
  return res
}

// Time grid for one day or a whole week: appointments are placed by their hour and length
function Grilla({ dias, porDia, gPorDia, bPorDia, onBloqueo, onGoogle, porId, colorDe, hoy, nombreCorto, onCita, onDia, conCabecera = true, minAncho = 0 }) {
  const eventos = dias.map(iso => distribuir([...(porDia[iso] || []), ...(gPorDia[iso] || [])]))
  const sinHora = dias.map(iso => [...(porDia[iso] || []), ...(gPorDia[iso] || [])].filter(c => !c.hora))
  const todos = eventos.flat()
  const desde = Math.min(7, ...todos.map(e => Math.floor(e.ini / 60)))
  const hasta = Math.max(20, ...todos.map(e => Math.min(24, Math.ceil(e.fin / 60))))
  const horas = Array.from({ length: hasta - desde }, (_, i) => desde + i)
  const alto = horas.length * PX_HORA
  const cols = `52px repeat(${dias.length}, minmax(0, 1fr))`
  const ahora = new Date()
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes()
  const lineas = `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX_HORA - 1}px, ${C.g100} ${PX_HORA - 1}px, ${C.g100} ${PX_HORA}px)`
  return (
    <div style={{ ...GLASS, borderRadius: 24, boxShadow: SHADOW, overflowX: 'auto', overscrollBehaviorX: 'contain', minWidth: 0 }}>
      <div style={{ minWidth: minAncho }}>
        {conCabecera && (
          <div style={{ display: 'grid', gridTemplateColumns: cols, background: 'rgba(237,241,249,0.6)', borderBottom: `1px solid ${C.line}` }}>
            <div />
            {dias.map(iso => {
              const esHoy = iso === hoy
              return (
                <button key={iso} type="button" onClick={() => onDia(iso)} aria-label={`Abrir ${fechaLarga(iso)}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: '8px 4px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.g500, textTransform: 'capitalize' }}>{DIAS_CORTOS[diaSemana(iso)]}</span>
                  <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600, background: esHoy ? C.purple : 'transparent', color: esHoy ? C.onPurple : C.black }}>{partesISO(iso).d}</span>
                </button>
              )
            })}
          </div>
        )}
        {sinHora.some(l => l.length) && (
          <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 11, color: C.g500, padding: '8px 4px', lineHeight: 1.2 }}>Sin hora</div>
            {sinHora.map((lista, i) => (
              <div key={dias[i]} style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                {lista.map(c => c.g
                  ? <ChipG key={c.clave} g={c} texto={c.titulo} onClick={() => onGoogle(c)} />
                  : <Chip key={c.id} c={c} col={colorDe(c)} texto={porId[c.paciente_id]?.nombre || ''} onClick={() => onCita(c)} />)}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: cols }}>
          <div style={{ position: 'relative', height: alto }}>
            {horas.map((h, i) => <span key={h} style={{ position: 'absolute', top: i * PX_HORA - 7 + (i === 0 ? 7 : 0), right: 8, fontSize: 11.5, color: C.g500 }}>{String(h).padStart(2, '0')}:00</span>)}
          </div>
          {dias.map((iso, di) => (
            <div key={iso} style={{ position: 'relative', height: alto, borderLeft: `1px solid ${C.g100}`, background: `${lineas}${iso === hoy ? ', linear-gradient(var(--acento-tenue), var(--acento-tenue))' : ''}`, minWidth: 0 }}>
              {iso === hoy && minAhora >= desde * 60 && minAhora <= hasta * 60 && (
                <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: (minAhora - desde * 60) / 60 * PX_HORA, height: 2, background: C.red, zIndex: 3, borderRadius: 2 }} />
              )}
              {(bPorDia[iso] || []).map((it, k) => <BandaBloqueo key={k} item={it} desdeMin={desde * 60} alto={alto} pxHora={PX_HORA} onClick={onBloqueo && (() => onBloqueo(it.bloqueo))} />)}
              {eventos[di].map(e => {
                if (e.c.g) {
                  const g = e.c
                  const topeG = alto - ((e.ini - desde * 60) / 60 * PX_HORA + 1)
                  const hG = Math.min(Math.max((e.fin - e.ini) / 60 * PX_HORA - 2, 22), Math.max(topeG, 22))
                  return (
                    <button key={g.clave} type="button" onClick={() => onGoogle(g)} title={`${g.hora} · ${g.titulo} · ${g.calendario}`} style={{
                      position: 'absolute', top: (e.ini - desde * 60) / 60 * PX_HORA + 1, height: hG, left: `calc(${e.col / e.cols * 100}% + 2px)`, width: `calc(${100 / e.cols}% - 4px)`,
                      boxSizing: 'border-box', padding: '3px 7px', borderRadius: 10, border: `1px solid ${C.g200}`, borderLeft: `4px solid ${g.color || SLATE}`, textAlign: 'left', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.88)', color: C.g700, fontFamily: 'inherit', overflow: 'hidden', zIndex: 2, animation: 'aparecer 250ms ease-out',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, lineHeight: 1.25 }}>
                        <MarcaG size={13} /><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hG < 40 ? `${g.hora} ${g.titulo}` : g.titulo}</span>
                      </span>
                      {hG >= 40 && <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.3, color: C.g500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.hora}{g.finFecha === g.fecha && g.finHora ? ` – ${g.finHora}` : ''} · {g.calendario}</span>}
                    </button>
                  )
                }
                const col = colorDe(e.c)
                const tope = alto - ((e.ini - desde * 60) / 60 * PX_HORA + 1) // stay inside the grid (e.g. cita crossing midnight)
                const h = Math.min(Math.max((e.fin - e.ini) / 60 * PX_HORA - 2, 22), Math.max(tope, 22))
                const nombre = porId[e.c.paciente_id]?.nombre || ''
                return (
                  <button key={e.c.id} type="button" onClick={() => onCita(e.c)} title={`${fmtHora(e.c.hora)} · ${nombre}`} style={{
                    position: 'absolute', top: (e.ini - desde * 60) / 60 * PX_HORA + 1, height: h, left: `calc(${e.col / e.cols * 100}% + 2px)`, width: `calc(${100 / e.cols}% - 4px)`,
                    boxSizing: 'border-box', padding: '3px 7px', borderRadius: 10, border: `1px solid ${col.borde}`, borderLeft: `4px solid ${col.base}`, textAlign: 'left', cursor: 'pointer',
                    background: col.fondo, color: col.texto, fontFamily: 'inherit', overflow: 'hidden', boxShadow: '0 4px 14px rgba(31,72,160,0.10)', zIndex: 2,
                    opacity: ['Cancelada', 'Reagendada'].includes(e.c.estado) ? 0.6 : 1,
                  }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h < 40 ? `${fmtHora(e.c.hora)} ${nombre}` : nombre}</span>
                    {h >= 40 && <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtHora(e.c.hora)} · {[e.c.tipo, e.c.servicio].filter(Boolean).join(' · ') || 'Consulta'}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Read-only window for one Google event: it is edited in Google, never here
function DetalleGoogle({ g, onClose }) {
  const dia = (iso) => mayuscula(fechaLarga(iso))
  let cuando
  if (g.todoElDia) cuando = g.finFecha > g.fecha ? `Todo el día, del ${fechaLarga(g.fecha)} al ${fechaLarga(g.finFecha)}` : `${dia(g.fecha)} · Todo el día`
  else if (g.finFecha === g.fecha) cuando = `${dia(g.fecha)} · ${fmtHora(g.hora)}${g.finHora && g.finHora !== g.hora ? ` a ${fmtHora(g.finHora)}` : ''}`
  else cuando = `${dia(g.fecha)}, ${fmtHora(g.hora)} — ${fechaLarga(g.finFecha)}, ${fmtHora(g.finHora)}`
  return (
    <Modal title={g.titulo} subtitle="Evento de Google Calendar" onClose={onClose} maxWidth={480}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Fecha y hora</div><div style={{ fontSize: 14.5, color: C.black, marginTop: 3 }}>{cuando}</div></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Calendario</div>
          <div style={{ fontSize: 14.5, color: C.black, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, overflowWrap: 'anywhere' }}><span style={{ width: 10, height: 10, borderRadius: 10, background: g.color || SLATE, flexShrink: 0 }} />{g.calendario}</div></div>
        <div style={{ fontSize: 13.5, color: C.g500, lineHeight: 1.55 }}>Este evento viene de Google Calendar. Se edita desde Google.</div>
      </div>
      {g.enlace && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.g100}` }}>
          <Button variant="ghost" icon="calendarioMas" onClick={() => window.open(g.enlace, '_blank', 'noopener')}>Abrir en Google Calendar</Button>
        </div>
      )}
    </Modal>
  )
}

// In-platform window with one appointment: same actions and permissions as Citas
function DetalleCita({ cita: c, paciente: p, sedes, clinica, perfil, onClose, onEditar, onExpediente }) {
  if (!p) return null
  const e = estadoCita(c.estado)
  const wa = linkWhatsApp(p.telefono, mensajeConfirmacion(p, c, clinica?.nombre || perfil.nombre))
  const cal = linkCalendar(p, c)
  const agendo = c.agendo_nombre || (c.agendada_por === 'lia' ? 'Lía' : '—')
  const dato = (k, v) => v ? <div><div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{k}</div><div style={{ fontSize: 14.5, color: C.black, marginTop: 3, overflowWrap: 'anywhere' }}>{v}</div></div> : null
  return (
    <Modal title={p.nombre} subtitle={mayuscula(fechaLarga(c.fecha))} onClose={onClose} maxWidth={560}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '16px 22px' }}>
        {dato('Fecha y hora', `${c.fecha.split('-').reverse().join('/')}${c.hora ? ` · ${fmtHora(c.hora)} · ${textoDuracion(duracionCita(c))}` : ' · Sin hora'}`)}
        {dato('Tipo', c.tipo)}
        {dato('Servicio', c.servicio)}
        {dato('Estado', <Badge color={e.color === C.purple ? 'var(--acento-fuerte)' : e.color} bg={e.bg}>{c.estado}</Badge>)}
        {sedes.length > 0 && dato('Sede', nombreSede(sedes, c.sede_id))}
        {dato('Agendó', agendo)}
        {dato('Teléfono', p.telefono)}
      </div>
      {c.notas && <div style={{ marginTop: 16 }}>{dato('Notas', c.notas)}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.g100}` }}>
        <Button icon="editar" onClick={onEditar}>Editar cita</Button>
        <Button variant="ghost" icon="expedientes" onClick={onExpediente}>Ver expediente</Button>
        {wa && <Button variant="ghost" icon="mensaje" onClick={() => window.open(wa, '_blank', 'noopener')}>WhatsApp</Button>}
        {cal && <Button variant="ghost" icon="calendarioMas" onClick={() => window.open(cal, '_blank', 'noopener')}>Agregar a Google Calendar</Button>}
      </div>
    </Modal>
  )
}

// Colours per consultation type and per status; only people with "Cambiar la configuración" can open it
function PersonalizarColores({ clinica, prefs, colorPor, tipos, onClose, onGuardado }) {
  const [borrador, setBorrador] = useState(() => ({ ...prefs.colores }))
  const [abierto, setAbierto] = useState(null) // key whose full colour picker is open
  const [busy, setBusy] = useState(false)
  const efectivo = (clave) => borrador[clave] || colorDeClave(clave, { colorPor, colores: {} })
  const poner = (clave, hex) => setBorrador(b => ({ ...b, [clave]: hex.toUpperCase() }))

  const fila = (clave, label) => (
    <div key={clave} style={{ padding: '10px 0', borderTop: `1px solid ${C.g100}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 22, height: 22, borderRadius: 8, background: efectivo(clave), border: `1px solid ${C.line}`, flexShrink: 0 }} />
        <span style={{ flex: '1 1 150px', minWidth: 0, fontSize: 14, fontWeight: 500, color: C.black }}>{label}</span>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {PALETA.map(hex => (
            <button key={hex} type="button" onClick={() => poner(clave, hex)} aria-label={`${label}: usar ${hex}`} aria-pressed={efectivo(clave).toUpperCase() === hex}
              style={{ width: 24, height: 24, borderRadius: 8, background: hex, cursor: 'pointer', padding: 0, border: efectivo(clave).toUpperCase() === hex ? `2px solid ${C.black}` : '2px solid #fff', boxShadow: `0 0 0 1px ${C.line}` }} />
          ))}
        </span>
        <button type="button" onClick={() => setAbierto(abierto === clave ? null : clave)} aria-expanded={abierto === clave} style={{ border: 'none', background: 'none', color: 'var(--acento-fuerte)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>Otro color</button>
      </div>
      {abierto === clave && <div style={{ marginTop: 12 }}><SelectorColor valor={efectivo(clave)} onChange={(hex) => poner(clave, hex)} /></div>}
    </div>
  )

  const guardar = async () => {
    setBusy(true)
    const r = await guardarPreferencias(clinica, { colorPor, colores: borrador })
    setBusy(false)
    if (!r.fallo) toast.success(r.remoto ? 'Colores guardados para toda la clínica' : 'Colores guardados en este equipo')
    onGuardado(r); onClose()
  }

  return (
    <Modal title="Personalizar colores" subtitle="Elija el color de cada tipo de consulta y de cada estado" onClose={onClose} maxWidth={660}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.g500, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Tipo de consulta</div>
      {tipos.map(t => fila(`tipo:${t}`, t))}
      <div style={{ fontSize: 13, fontWeight: 700, color: C.g500, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '20px 0 2px' }}>Estado</div>
      {ESTADOS_CITA.map(e => fila(`estado:${e.value}`, e.value))}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 20 }}>
        <Button variant="ghost" onClick={() => setBorrador({})}>Restablecer</Button>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy} icon="check">{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

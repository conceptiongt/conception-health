import { useState, useMemo, useEffect } from 'react'
import { C, GLASS, SHADOW } from '../lib/theme'
import { hoyISO } from '../lib/formato'
import { esISO, fechaLarga, inicioSemana, mayuscula, partesISO, sumarDias } from '../lib/calendario'
import { MESES } from '../lib/constantes'
import { esSoporte } from '../lib/permisos'
import { esHospital } from '../lib/especialidades'
import { fechaDe } from '../lib/quirofanos'
import { useDatos } from '../hooks/useDatos'
import { useCirugias } from '../hooks/useCirugias'
import { Encabezado, Segmentos, Badge } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Icon } from '../components/ui/Icon'
import { Cargando } from '../components/ui/Varios'
import { MiniCalendario } from '../components/MiniCalendario'
import { CitaModal } from '../components/CitaModal'
import { ProgramarCirugia } from '../components/quirofanos/ProgramarCirugia'
import { DetalleCirugia, DetalleBloqueo, BloquearModal } from '../components/quirofanos/Detalles'
import { Ahora, VistaDia, VistaSemana, VistaPersonal } from '../components/quirofanos/Vistas'
import { useEquipo, useMedia } from '../components/quirofanos/comun'

const flechaNav = { width: 38, height: 38, borderRadius: 160, border: `1px solid ${C.g200}`, background: 'rgba(255,255,255,0.9)', cursor: 'pointer', color: C.g600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit', fontSize: 18, lineHeight: 1 }
const LLAVE_VISTA = 'ch-quirofanos-vista'
const leerVista = () => { try { const v = localStorage.getItem(LLAVE_VISTA); return ['dia', 'semana', 'personal'].includes(v) ? v : 'dia' } catch { return 'dia' } }

function tituloSemana(inicio) {
  const a = partesISO(inicio), b = partesISO(sumarDias(inicio, 6))
  if (a.m === b.m) return `${a.d} – ${b.d} de ${MESES[a.m].toLowerCase()} de ${b.y}`
  const corto = (m) => MESES[m].slice(0, 3).toLowerCase()
  return `${a.d} ${corto(a.m)}${a.y !== b.y ? ` ${a.y}` : ''} – ${b.d} ${corto(b.m)} ${b.y}`
}

// Shared calendar of the operating rooms: who is operating, in which room, and when a room (or a surgeon, or an anesthesiologist) is free
export function Quirofanos({ fechaInicial }) {
  const { perfil, clinica, hospital, ir, recargar } = useDatos()
  const equipo = useEquipo()
  const lectura = esSoporte(perfil)
  const compacto = useMedia('(max-width: 860px)')
  const hoy = hoyISO()
  const [vista, setVista] = useState(leerVista)
  const [fecha, setFecha] = useState(() => (esISO(fechaInicial) ? fechaInicial : hoy))
  const [ir_, setIr] = useState(false) // «go to a date» window
  const [programar, setProgramar] = useState(null) // { cirugia?, inicial? }
  const [detalle, setDetalle] = useState(null)
  const [bloqueo, setBloqueo] = useState(null)
  const [bloquear, setBloquear] = useState(false)
  const [editando, setEditando] = useState(null) // { cita, paciente }
  useEffect(() => { if (esISO(fechaInicial)) setFecha(fechaInicial) }, [fechaInicial])

  const desde = vista === 'semana' ? inicioSemana(fecha) : fecha
  const hasta = vista === 'semana' ? sumarDias(inicioSemana(fecha), 6) : fecha
  const datos = useCirugias({ desde, hasta, ms: 60000 })
  const ahora = useCirugias({ desde: hoy, hasta: hoy, cirugias: false, ms: 60000 }) // «Ahora» strip, always today

  const cirugias = useMemo(() => datos.cirugias.map(c => ({ ...c, ini: Date.parse(c.inicio), fin: Date.parse(c.fin) })), [datos.cirugias])
  const activas = useMemo(() => cirugias.filter(c => c.estado !== 'suspendida'), [cirugias])
  const bloqueos = useMemo(() => datos.reservas.filter(r => r.motivo === 'bloqueo'), [datos.reservas])
  const suspendidas = useMemo(() => cirugias.filter(c => c.estado === 'suspendida' && fechaDe(c.ini) === fecha), [cirugias, fecha])

  // the visible day lives in the address (replace, so Back does not step through every arrow click)
  const fijarFecha = (iso) => {
    setFecha(iso)
    if (window.location.hash.startsWith('#/quirofanos')) window.history.replaceState(null, '', `#/quirofanos/${iso}`)
  }
  const cambiarVista = (v) => { setVista(v); try { localStorage.setItem(LLAVE_VISTA, v) } catch { /* private window */ } }
  const mover = (n) => fijarFecha(sumarDias(fecha, vista === 'semana' ? 7 * n : n))
  const titulo = vista === 'semana' ? tituloSemana(inicioSemana(fecha)) : mayuscula(fechaLarga(fecha))

  // the grid works with enriched rows (numeric ini / fin); the windows get the original row of the database
  const original = (c) => datos.cirugias.find(x => x.cita_id === c.cita_id) || c
  const refrescar = async () => { await Promise.all([datos.recargar(), ahora.recargar()]) }
  const abrirProgramar = (extra) => setProgramar(extra || {})
  const alGuardar = async () => { setProgramar(null); await refrescar() }

  const sinEstructura = hospital.cargado && (hospital.tablas && equipo.quirofanos.length === 0)
  // before the migration: nothing to show but a quiet note (no errors, no polling)
  if (!hospital.cargado || (!datos.listo && datos.disponible && !datos.error)) return <><Encabezado titulo="Quirófanos" /><Cargando /></>
  if (!hospital.tablas || !datos.disponible) {
    return (
      <>
        <Encabezado titulo="Quirófanos" subtitulo="Calendario de cirugías" />
        <div style={{ ...GLASS, borderRadius: 24, padding: '40px 24px', textAlign: 'center', boxShadow: SHADOW }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="quirofano" size={26} /></div>
          <div style={{ marginBottom: 10 }}><Badge color={C.purpleDark} bg={C.purpleMid}>Disponible pronto</Badge></div>
          <div style={{ fontSize: 14, color: C.g500, maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>Aquí verá qué quirófano, cirujano y anestesiólogo están libres, y podrá programar cirugías sin empalmes. Le avisaremos en cuanto esté listo.</div>
        </div>
      </>
    )
  }
  if (editando) {
    return <CitaModal cita={editando.cita} paciente={editando.paciente} clinicaId={perfil.clinica_id} soloCita onClose={() => setEditando(null)} onGuardado={async () => { setEditando(null); await recargar(); await refrescar() }} />
  }

  return (
    <>
      <Encabezado titulo="Quirófanos" subtitulo="Qué quirófano, cirujano y anestesiólogo están libres, y quién opera hoy">
        {!lectura && <Button variant="ghost" icon="candado" onClick={() => setBloquear(true)}>Bloquear</Button>}
        {!lectura && <Button icon="mas" onClick={() => abrirProgramar({ inicial: { fecha } })}>Programar cirugía</Button>}
      </Encabezado>

      {datos.error && <div role="alert" style={{ background: C.amberLight, color: C.amber, borderRadius: 14, padding: '10px 14px', fontSize: 13.5, marginBottom: 14 }}>No se pudo actualizar el calendario. <button type="button" onClick={refrescar} style={{ border: 'none', background: 'none', color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Reintentar</button></div>}
      {sinEstructura && (
        <div style={{ ...GLASS, borderRadius: 24, padding: '28px 24px', textAlign: 'center', boxShadow: SHADOW, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Aún no hay quirófanos registrados</div>
          <div style={{ fontSize: 14, color: C.g500, maxWidth: 480, margin: '0 auto 14px', lineHeight: 1.6 }}>
            {esHospital(clinica?.especialidad) ? 'Agregue sus quirófanos, cirujanos y anestesiólogos en Configuración → Mi hospital.' : 'Agregue sus quirófanos, cirujanos y anestesiólogos en Configuración → Calendario de cirugías.'}
          </div>
          <Button icon="ajustes" onClick={() => ir('configuracion')}>Ir a Configuración</Button>
        </div>
      )}

      <Ahora quirofanos={equipo.quirofanos} reservas={ahora.reservas} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" style={flechaNav} aria-label={vista === 'semana' ? 'Semana anterior' : 'Día anterior'} onClick={() => mover(-1)}>‹</button>
        <button type="button" style={flechaNav} aria-label={vista === 'semana' ? 'Semana siguiente' : 'Día siguiente'} onClick={() => mover(1)}>›</button>
        <Button variant="ghost" size="sm" onClick={() => fijarFecha(hoy)} disabled={fecha === hoy && vista !== 'semana'}>Hoy</Button>
        <button type="button" onClick={() => setIr(true)} aria-label="Elegir otra fecha" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'clamp(15px, 2vw, 18px)', fontWeight: 600, color: C.black, padding: '4px 6px', borderRadius: 10, textAlign: 'left' }}>
          <Icon name="citas" size={17} style={{ color: C.purple }} />{titulo}<Icon name="abajo" size={14} style={{ color: C.g500 }} />
        </button>
        <div style={{ flex: 1 }} />
        <Segmentos opciones={[{ value: 'dia', label: 'Día' }, { value: 'semana', label: 'Semana' }, { value: 'personal', label: 'Personal' }]} valor={vista} onChange={cambiarVista} />
      </div>

      {vista === 'dia' && (
        <VistaDia fecha={fecha} quirofanos={equipo.quirofanos} cirugias={activas} bloqueos={bloqueos} equipo={equipo} movil={compacto} lectura={lectura}
          onSlot={(q, hora) => abrirProgramar({ inicial: { fecha, quirofano_id: q, hora: hora || undefined } })} onCirugia={(c) => setDetalle(original(c))} onBloqueo={setBloqueo} />
      )}
      {vista === 'semana' && (
        <VistaSemana inicio={inicioSemana(fecha)} quirofanos={equipo.quirofanos} cirugias={cirugias} reservas={datos.reservas} equipo={equipo} onDia={(d) => { fijarFecha(d); cambiarVista('dia') }} />
      )}
      {vista === 'personal' && <VistaPersonal fecha={fecha} equipo={equipo} reservas={datos.reservas} />}

      {vista === 'dia' && suspendidas.length > 0 && (
        <div style={{ marginTop: 16, ...GLASS, borderRadius: 20, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.g400, marginBottom: 6 }}>Suspendidas este día</div>
          {suspendidas.map(c => (
            <button key={c.cita_id} type="button" onClick={() => setDetalle(original(c))} className="fila" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, border: 'none', background: 'transparent', padding: '7px 4px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, textAlign: 'left', color: C.g500 }}>
              <Icon name="cerrar" size={14} /><span style={{ textDecoration: 'line-through', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{equipo.pacPorCita(c.cita_id)?.nombre} · {c.procedimiento || 'Cirugía'}</span>
              <span style={{ color: 'var(--acento-fuerte)', fontWeight: 600 }}>Ver</span>
            </button>
          ))}
        </div>
      )}

      {ir_ && (
        <Modal title="Ir a una fecha" onClose={() => setIr(false)} maxWidth={420}>
          <MiniCalendario etiqueta="Fecha" valor={fecha} abiertoInicial cierraAlElegir={false} onElegir={(iso) => { fijarFecha(iso); setIr(false) }} />
        </Modal>
      )}
      {programar && <ProgramarCirugia cirugia={programar.cirugia} inicial={programar.inicial} onClose={() => setProgramar(null)} onGuardado={alGuardar} />}
      {detalle && (
        <DetalleCirugia cirugia={detalle} onClose={() => setDetalle(null)} onCambio={async () => { await recargar(); await refrescar() }}
          onReprogramar={(c) => { setDetalle(null); abrirProgramar({ cirugia: c }) }}
          onEditarCita={(cita, paciente) => { setDetalle(null); setEditando({ cita, paciente }) }} />
      )}
      {bloqueo && <DetalleBloqueo reserva={bloqueo} onClose={() => setBloqueo(null)} onCambio={refrescar} />}
      {bloquear && <BloquearModal inicial={{ fecha }} onClose={() => setBloquear(false)} onGuardado={refrescar} />}
    </>
  )
}

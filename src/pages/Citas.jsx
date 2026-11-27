import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { C, SHADOW } from '../lib/theme'
import { TIPOS_CITA, ESTADOS_CITA, ORIGENES, estadoCita, origenLabel } from '../lib/constantes'
import { fmtFechaCorta, fmtHora, linkWhatsApp, mensajeConfirmacion } from '../lib/formato'
import { SelectorPeriodo, RangoFechas, AgregarAnio, FiltroSede, enPeriodo, textoPeriodo, nombreSede } from '../components/Filtros'
import { slug } from '../lib/excel'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Tabla } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Exportar } from '../components/Documento'
import { prepararCitas } from '../lib/exportar'
import { CitaModal } from '../components/CitaModal'
import { toast } from '../components/ui/Toast'
import { Icon } from '../components/ui/Icon'
import { filtroStyle } from '../components/ui/Campos'
import { Desplegable } from '../components/ui/Desplegable'
import { sincronizarCita } from '../lib/google'
import { MeetCita } from '../components/EnlaceMeet'
import { colorProfesional } from '../hooks/useHospital'

// Inicio → a status box opens Citas already filtered (status, month, location)
let filtroPendiente = null
export const abrirCitasCon = (f) => { filtroPendiente = f }

const ELIMINADAS = '__eliminadas' // the "Eliminadas" button: shows the deleted appointments history as the list
const PLURAL_ESTADO = { Pendiente: 'Pendientes', Confirmada: 'Confirmadas', 'Asistió': 'Asistieron', 'No asistió': 'No asistieron', Reagendada: 'Reagendadas', Cancelada: 'Canceladas' }

export function Citas() {
  const [inicial] = useState(() => { const f = filtroPendiente; filtroPendiente = null; return f || {} })
  const { citas, pacientes, clinica, perfil, recargar, ir, sedes, hospital } = useDatos()
  const hosp = hospital.disponible // hospital: Especialidad and Médico columns and filters
  const [buscar, setBuscar] = useState('')
  const [periodo, setPeriodo] = useState(inicial.periodo || { mes: '', anio: '', desde: '', hasta: '' })
  const [sede, setSede] = useState(inicial.sede || '')
  const [estado, setEstado] = useState(inicial.eliminadas ? ELIMINADAS : inicial.estado || '')
  const [tipo, setTipo] = useState('')
  const [origen, setOrigen] = useState('')
  const [dep, setDep] = useState(inicial.departamento || '')
  const [med, setMed] = useState(inicial.profesional || '')
  const [editando, setEditando] = useState(null)
  const [abierta, setAbierta] = useState(null) // appointment whose row is open
  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))

  const q = buscar.trim().toLowerCase()
  // every filter except the status: the status buttons show how many there are of each
  const sinEstado = citas.filter(c => {
    const p = porId[c.paciente_id]
    if (!p) return false
    if (q && !p.nombre.toLowerCase().includes(q) && !(p.telefono || '').includes(q)) return false
    if (!enPeriodo(c.fecha, periodo)) return false
    if (sede && c.sede_id !== sede) return false
    if (tipo && c.tipo !== tipo) return false
    if (origen && p.origen !== origen) return false
    if (hosp && dep && c.departamento_id !== dep) return false
    if (hosp && med && c.profesional_id !== med) return false
    return true
  })
  // deleted appointments (who deleted each one and why), with the same month / location / type / search filters
  const [eliminadas, setEliminadas] = useState([])
  useEffect(() => {
    supabase.from('citas_eliminadas').select('id, paciente_nombre, fecha, hora, tipo, motivo, eliminado_por_nombre, eliminado_at, sede:datos->>sede_id')
      .order('eliminado_at', { ascending: false }).limit(1000)
      .then(({ data }) => setEliminadas(data || []))
  }, [citas])
  const eliminadasVisibles = eliminadas.filter(r => enPeriodo(r.fecha, periodo) && (!sede || r.sede === sede) && (!tipo || r.tipo === tipo)
    && (!q || [r.paciente_nombre, r.motivo, r.eliminado_por_nombre].some(x => (x || '').toLowerCase().includes(q))))
  const verEliminadas = estado === ELIMINADAS

  const visibles = sinEstado.filter(c => !estado || c.estado === estado)
    .sort((a, b) => (b.fecha + (b.hora || '')).localeCompare(a.fecha + (a.hora || '')))

  const cambiarEstado = async (c, nuevo) => {
    const { error } = await supabase.from('citas').update({ estado: nuevo }).eq('id', c.id)
    if (error) { toast.error('No se pudo cambiar el estado'); return }
    sincronizarCita(c.id)
    recargar()
  }

  const conPeriodo = periodo.mes !== '' || periodo.anio !== '' || periodo.desde || periodo.hasta
  const filtroTexto = [conPeriodo && textoPeriodo(periodo), sede && nombreSede(sedes, sede), verEliminadas ? 'Eliminadas' : estado, tipo, origen && origenLabel(origen), hosp && dep && hospital.departamento(dep)?.nombre, hosp && med && hospital.profesional(med)?.nombre, q && `"${buscar}"`].filter(Boolean).join(' · ') || 'Todas las citas'
  const deSede = (id) => citas.filter(c => (!id || c.sede_id === id) && enPeriodo(c.fecha, periodo)).length

  const cuandoEliminada = (t) => new Date(t).toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  const prepararEliminadas = () => ({
    titulo: 'Citas eliminadas', subtitulo: filtroTexto,
    secciones: [{ tabla: { headers: ['Fecha de la cita', 'Paciente', 'Tipo', 'Motivo', 'Eliminada por', 'Eliminada el'],
      filas: eliminadasVisibles.map(r => [fmtFechaCorta(r.fecha), r.paciente_nombre || '—', r.tipo || '—', r.motivo, r.eliminado_por_nombre || '—', cuandoEliminada(r.eliminado_at)]) } }],
    excel: { archivo: `citas_eliminadas_${slug(filtroTexto)}`, hojas: [{ nombre: 'Eliminadas', columnas: [
      { header: 'Fecha de la cita', key: 'f', width: 14 }, { header: 'Paciente', key: 'p', width: 28 }, { header: 'Tipo', key: 't', width: 18 },
      { header: 'Motivo', key: 'm', width: 40 }, { header: 'Eliminada por', key: 'u', width: 22 }, { header: 'Eliminada el', key: 'e', width: 20 },
    ], filas: eliminadasVisibles.map(r => ({ f: r.fecha, p: r.paciente_nombre, t: r.tipo, m: r.motivo, u: r.eliminado_por_nombre, e: cuandoEliminada(r.eliminado_at) })) }] },
  })

  const preparar = () => verEliminadas ? prepararEliminadas() : prepararCitas({ visibles, porId, sedes, filtroTexto, hospital: hosp ? hospital : undefined })

  const sel = filtroStyle

  if (editando) return <CitaModal soloCita cita={editando} paciente={porId[editando.paciente_id]} clinicaId={perfil.clinica_id} onClose={() => setEditando(null)} onGuardado={() => { setEditando(null); recargar() }} />

  return (
    <>
      <Encabezado titulo="Citas" subtitulo={`${verEliminadas ? eliminadasVisibles.length : visibles.length} ${(verEliminadas ? eliminadasVisibles.length : visibles.length) === 1 ? 'cita' : 'citas'} · ${filtroTexto}`}>
        <AgregarAnio />
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
        <Button onClick={() => ir('registrar')} icon="mas">Registrar paciente</Button>
      </Encabezado>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar paciente o teléfono…" style={{ ...sel, flex: '1 1 260px' }} />
      </div>
      <div style={{ marginBottom: 10 }}><FiltroSede valor={sede} onChange={setSede} contar={deSede} /></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <SelectorPeriodo valor={periodo} onChange={setPeriodo} todosAnios desplegable />
        <Desplegable ariaLabel="Tipo" value={tipo} onChange={setTipo} options={[{ value: '', label: 'Todo tipo' }, ...TIPOS_CITA.map(t => ({ value: t, label: t }))]} />
        <Desplegable ariaLabel="Origen" value={origen} onChange={setOrigen} options={[{ value: '', label: 'Todo origen' }, ...ORIGENES]} />
        {hosp && <Desplegable ariaLabel="Especialidad" value={dep} onChange={setDep} options={[{ value: '', label: 'Toda especialidad' }, ...hospital.departamentos.map(d => ({ value: d.id, label: d.nombre }))]} />}
        {hosp && <Desplegable ariaLabel="Médico" value={med} onChange={setMed} options={[{ value: '', label: 'Todo médico' }, ...hospital.profesionales.filter(p => p.activo || p.id === med).map(p => ({ value: p.id, label: p.nombre, punto: colorProfesional(p, hospital.profesionales.indexOf(p)) }))]} />}
        <RangoFechas valor={periodo} onChange={setPeriodo} />
      </div>

      <BotonesEstado citas={sinEstado} valor={estado} onChange={setEstado} eliminadas={eliminadasVisibles.length} />

      {verEliminadas ? (
        <Tabla
          columnas={['Fecha de la cita', 'Paciente', 'Tipo', 'Motivo', 'Eliminada por', 'Fecha y hora de eliminación']}
          vacio="No hay citas eliminadas con estos filtros"
          filas={eliminadasVisibles.map(r => ({ key: r.id, celdas: [
            `${fmtFechaCorta(r.fecha)}${r.hora ? ` · ${fmtHora(r.hora)}` : ''}`,
            <span style={{ fontWeight: 500, color: C.black }}>{r.paciente_nombre || '—'}</span>,
            r.tipo || '—',
            <span style={{ whiteSpace: 'normal', display: 'inline-block', minWidth: 180, maxWidth: 320 }}>{r.motivo}</span>,
            r.eliminado_por_nombre || '—',
            cuandoEliminada(r.eliminado_at),
          ] }))}
        />
      ) : <ListaCitas citas={visibles} porId={porId} sedes={sedes} hospital={hosp ? hospital : null} abierta={abierta} setAbierta={setAbierta} perfil={perfil}
        onEstado={cambiarEstado} onEditar={setEditando} onExpediente={(p) => ir('expedientes', p.id)}
        mensaje={(p, c) => mensajeConfirmacion(p, c, clinica?.nombre || perfil.nombre)} />}
    </>
  )
}

// Status buttons above the list: one tap shows only that status; "Eliminadas" shows the deleted appointments history
function BotonesEstado({ citas, valor, onChange, eliminadas }) {
  const boton = (activo, color, bg, label, n, onClick, key) => (
    <button key={key} onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: 160, cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', transition: 'background 0.15s, border-color 0.15s',
      border: `1.5px solid ${activo ? color : C.g200}`, background: activo ? bg : '#fff', color: activo ? color : C.g700,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 8, background: color }} />
      {label}
      {n != null && <span style={{ minWidth: 20, padding: '1px 7px', borderRadius: 160, fontSize: 12, fontWeight: 600, background: activo ? '#fff' : C.g100, color: activo ? color : C.g500 }}>{n}</span>}
    </button>
  )
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {boton(!valor, C.purple, C.purpleMid, 'Todas', citas.length, () => onChange(''), 'todas')}
      {ESTADOS_CITA.map(e => boton(valor === e.value, e.color, e.bg, PLURAL_ESTADO[e.value] || e.value, citas.filter(c => c.estado === e.value).length, () => onChange(valor === e.value ? '' : e.value), e.value))}
      {boton(valor === ELIMINADAS, C.red, C.redLight, 'Eliminadas', eliminadas, () => onChange(valor === ELIMINADAS ? '' : ELIMINADAS), 'eliminadas')}
    </div>
  )
}

// Appointments list: tapping a row opens it downwards with its details and actions (file, edit, WhatsApp, Calendar)
function ListaCitas({ citas, porId, sedes, hospital, abierta, setAbierta, perfil, onEstado, onEditar, onExpediente, mensaje }) {
  const conSede = sedes.length > 0
  // the open panel always fits the visible width, even when the table scrolls sideways
  const caja = useRef(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const medir = () => setAncho(caja.current?.clientWidth || 0)
    medir(); window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  // hospital: Especialidad and Médico come in, and «Agendó» steps aside on narrow widths (it stays in the open row)
  const verAgendo = !hospital || !ancho || ancho >= 1100
  const columnas = ['Fecha', 'Hora', 'Paciente', 'Tipo', ...(hospital ? ['Especialidad', 'Médico'] : []), 'Estado', ...(conSede ? ['Sede'] : []), 'Origen', ...(verAgendo ? ['Agendó'] : []), '']
  const th = { padding: '14px 18px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: C.g500, whiteSpace: 'nowrap', background: C.g50, borderBottom: `1px solid ${C.line}` }
  const td = { padding: '14px 18px', color: C.black, whiteSpace: 'nowrap', verticalAlign: 'middle' }
  const accion = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 160, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: C.g700, fontFamily: 'inherit' }
  const dato = (k, v) => v ? <div><div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{k}</div><div style={{ fontSize: 14, color: C.black, marginTop: 3, whiteSpace: 'normal' }}>{v}</div></div> : null
  return (
    <div ref={caja} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, overflowX: 'auto', boxShadow: SHADOW }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead><tr>{columnas.map((c, i) => <th key={i} style={th}>{c}</th>)}</tr></thead>
        <tbody>
          {citas.length === 0 && <tr><td colSpan={columnas.length} style={{ padding: 40, textAlign: 'center', color: C.g400 }}>No hay citas con estos filtros</td></tr>}
          {citas.map((c, i) => {
            const p = porId[c.paciente_id]
            const e = estadoCita(c.estado)
            const abiertaEsta = abierta === c.id
            const wa = linkWhatsApp(p.telefono, mensaje(p, c))
            const agendo = c.agendo_nombre || (c.agendada_por === 'lia' ? 'Lía' : '—')
            return [
              <tr key={c.id} className="fila" onClick={() => setAbierta(abiertaEsta ? null : c.id)}
                style={{ borderTop: i ? `1px solid ${C.g100}` : 'none', cursor: 'pointer', background: abiertaEsta ? C.g50 : undefined }}>
                <td style={td}>{fmtFechaCorta(c.fecha)}</td>
                <td style={td}>{fmtHora(c.hora)}</td>
                <td style={{ ...td, fontWeight: 500 }}>{p.nombre}</td>
                <td style={td}>{[c.tipo, c.servicio].filter(Boolean).join(' · ') || '—'}</td>
                {hospital && <td style={td}>{hospital.departamento(c.departamento_id)?.nombre || <span style={{ color: C.g300 }}>—</span>}</td>}
                {hospital && <td style={td}>{(() => { const m = hospital.profesional(c.profesional_id); return m ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, background: colorProfesional(m, hospital.profesionales.indexOf(m)), flexShrink: 0 }} />{m.nombre}</span> : <span style={{ color: C.g300 }}>—</span> })()}</td>}
                <td style={td} onClick={ev => ev.stopPropagation()}>
                  <select value={c.estado} onChange={ev => onEstado(c, ev.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', fontWeight: 500, fontSize: 12.5, fontFamily: 'inherit', color: e.color, background: e.bg, cursor: 'pointer' }}>
                    {ESTADOS_CITA.map(x => <option key={x.value}>{x.value}</option>)}
                  </select>
                </td>
                {conSede && <td style={td}>{nombreSede(sedes, c.sede_id) || <span style={{ color: C.g300 }}>—</span>}</td>}
                <td style={td}>{p.origen === 'redes' && p.red ? p.red : origenLabel(p.origen)}</td>
                {verAgendo && <td style={{ ...td, color: C.g600 }}>{agendo}</td>}
                <td style={{ ...td, color: C.g400, width: 30 }}><span style={{ display: 'inline-flex', transform: abiertaEsta ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><Icon name="abajo" size={16} /></span></td>
              </tr>,
              abiertaEsta && (
                <tr key={c.id + '-detalle'} style={{ background: C.g50 }}>
                  <td colSpan={columnas.length} style={{ padding: '4px 0 20px' }}>
                    <div style={{ position: 'sticky', left: 18, width: ancho ? ancho - 36 : undefined, boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.g100}`, borderRadius: 18, padding: '18px 20px', animation: 'aparecer 0.2s ease' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '14px 24px' }}>
                        {dato('Paciente', p.nombre)}
                        {dato('Teléfono', p.telefono)}
                        {dato('Fecha y hora', `${fmtFechaCorta(c.fecha)}${c.hora ? ` · ${fmtHora(c.hora)}` : ''}`)}
                        {dato('Tipo y servicio', [c.tipo, c.servicio].filter(Boolean).join(' · '))}
                        {hospital && dato('Especialidad', hospital.departamento(c.departamento_id)?.nombre)}
                        {hospital && dato('Médico', hospital.profesional(c.profesional_id)?.nombre)}
                        {conSede && dato('Sede', nombreSede(sedes, c.sede_id))}
                        {dato('Agendó', agendo)}
                        {dato('Registrada el', c.created_at && new Date(c.created_at).toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}
                        {p.alergias && dato('Alergias', <span style={{ color: C.red }}>{p.alergias}</span>)}
                      </div>
                      {c.notas && <div style={{ marginTop: 14 }}>{dato('Notas', c.notas)}</div>}
                      <MeetCita cita={c} telefono={p.telefono} perfil={perfil} arriba={14} />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.g100}` }}>
                        <button style={accion} onClick={() => onExpediente(p)}><Icon name="expedientes" size={15} />Ver expediente</button>
                        <button style={accion} onClick={() => onEditar(c)}><Icon name="editar" size={15} />Editar cita</button>
                        {wa && <button style={accion} onClick={() => window.open(wa, '_blank', 'noopener')}><Icon name="mensaje" size={15} />WhatsApp</button>}
                      </div>
                    </div>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

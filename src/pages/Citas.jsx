import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { C, SHADOW } from '../lib/theme'
import { TIPOS_CITA, ESTADOS_CITA, ORIGENES, estadoCita, origenLabel } from '../lib/constantes'
import { fmtFechaCorta, fmtHora, linkCalendar, linkWhatsApp, mensajeConfirmacion } from '../lib/formato'
import { SelectorPeriodo, RangoFechas, AgregarAnio, FiltroSede, enPeriodo, textoPeriodo, nombreSede } from '../components/Filtros'
import { slug } from '../lib/excel'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Tabla } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Exportar } from '../components/Documento'
import { CitaModal } from '../components/CitaModal'
import { toast } from '../components/ui/Toast'
import { Icon } from '../components/ui/Icon'
import { filtroStyle } from '../components/ui/Campos'

// Inicio → a status box opens Citas already filtered (status, month, location)
let filtroPendiente = null
export const abrirCitasCon = (f) => { filtroPendiente = f }

const ELIMINADAS = '__eliminadas' // the "Eliminadas" button: shows the deleted appointments history as the list
const PLURAL_ESTADO = { Pendiente: 'Pendientes', Confirmada: 'Confirmadas', 'Asistió': 'Asistieron', 'No asistió': 'No asistieron', Reagendada: 'Reagendadas', Cancelada: 'Canceladas' }

export function Citas() {
  const [inicial] = useState(() => { const f = filtroPendiente; filtroPendiente = null; return f || {} })
  const { citas, pacientes, clinica, perfil, recargar, ir, sedes } = useDatos()
  const [buscar, setBuscar] = useState('')
  const [periodo, setPeriodo] = useState(inicial.periodo || { mes: '', anio: '', desde: '', hasta: '' })
  const [sede, setSede] = useState(inicial.sede || '')
  const [estado, setEstado] = useState(inicial.eliminadas ? ELIMINADAS : inicial.estado || '')
  const [tipo, setTipo] = useState('')
  const [origen, setOrigen] = useState('')
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
    recargar()
  }

  const conPeriodo = periodo.mes !== '' || periodo.anio !== '' || periodo.desde || periodo.hasta
  const filtroTexto = [conPeriodo && textoPeriodo(periodo), sede && nombreSede(sedes, sede), verEliminadas ? 'Eliminadas' : estado, tipo, origen && origenLabel(origen), q && `"${buscar}"`].filter(Boolean).join(' · ') || 'Todas las citas'
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

  const preparar = () => verEliminadas ? prepararEliminadas() : ({
    titulo: 'Citas',
    subtitulo: filtroTexto,
    secciones: [{ tabla: {
      headers: ['Fecha', 'Hora', 'Paciente', 'Teléfono', 'Tipo', 'Estado', ...(sedes.length ? ['Sede'] : []), 'Origen', 'Agendó'],
      filas: visibles.map(c => { const p = porId[c.paciente_id]; return [fmtFechaCorta(c.fecha), fmtHora(c.hora), p.nombre, p.telefono || '—', [c.tipo, c.servicio].filter(Boolean).join(' · ') || '—', c.estado, ...(sedes.length ? [nombreSede(sedes, c.sede_id) || '—'] : []), p.origen === 'redes' && p.red ? `Redes (${p.red})` : origenLabel(p.origen), c.agendo_nombre || (c.agendada_por === 'lia' ? 'Lía' : '—')] }),
    } }],
    excel: { archivo: `citas_${slug(filtroTexto)}`, hojas: [{ nombre: 'Citas', columnas: [
      { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Hora', key: 'hora', width: 8 }, { header: 'Paciente', key: 'paciente', width: 30 },
      { header: 'Teléfono', key: 'tel', width: 14 }, { header: 'Tipo', key: 'tipo', width: 18 }, { header: 'Estado', key: 'estado', width: 13 },
      { header: 'Origen', key: 'origen', width: 16 }, { header: 'Red social', key: 'red', width: 12 }, { header: 'Referido por', key: 'ref', width: 20 },
      { header: 'Agendó', key: 'agendo', width: 20 }, { header: 'Procedimiento', key: 'proc', width: 26 }, { header: 'Sede', key: 'sede', width: 16 }, { header: 'Notas', key: 'notas', width: 40 },
    ], filas: visibles.map(c => { const p = porId[c.paciente_id]; return {
      sede: nombreSede(sedes, c.sede_id), fecha: c.fecha, hora: fmtHora(c.hora), paciente: p.nombre, tel: p.telefono, tipo: c.tipo, estado: c.estado,
      origen: origenLabel(p.origen), red: p.red, ref: p.referido_por, agendo: c.agendo_nombre || (c.agendada_por === 'lia' ? 'Lía' : ''), proc: c.procedimiento, notas: c.notas,
    } }) }] },
  })

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
        <SelectorPeriodo valor={periodo} onChange={setPeriodo} todosAnios />
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={sel}><option value="">Todo tipo</option>{TIPOS_CITA.map(t => <option key={t}>{t}</option>)}</select>
        <select value={origen} onChange={e => setOrigen(e.target.value)} style={sel}><option value="">Todo origen</option>{ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
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
      ) : <ListaCitas citas={visibles} porId={porId} sedes={sedes} abierta={abierta} setAbierta={setAbierta}
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
function ListaCitas({ citas, porId, sedes, abierta, setAbierta, onEstado, onEditar, onExpediente, mensaje }) {
  const conSede = sedes.length > 0
  // the open panel always fits the visible width, even when the table scrolls sideways
  const caja = useRef(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const medir = () => setAncho(caja.current?.clientWidth || 0)
    medir(); window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  const columnas = ['Fecha', 'Hora', 'Paciente', 'Tipo', 'Estado', ...(conSede ? ['Sede'] : []), 'Origen', 'Agendó', '']
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
            const cal = linkCalendar(p, c)
            const agendo = c.agendo_nombre || (c.agendada_por === 'lia' ? 'Lía' : '—')
            return [
              <tr key={c.id} className="fila" onClick={() => setAbierta(abiertaEsta ? null : c.id)}
                style={{ borderTop: i ? `1px solid ${C.g100}` : 'none', cursor: 'pointer', background: abiertaEsta ? C.g50 : undefined }}>
                <td style={td}>{fmtFechaCorta(c.fecha)}</td>
                <td style={td}>{fmtHora(c.hora)}</td>
                <td style={{ ...td, fontWeight: 500 }}>{p.nombre}</td>
                <td style={td}>{[c.tipo, c.servicio].filter(Boolean).join(' · ') || '—'}</td>
                <td style={td} onClick={ev => ev.stopPropagation()}>
                  <select value={c.estado} onChange={ev => onEstado(c, ev.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', fontWeight: 500, fontSize: 12.5, fontFamily: 'inherit', color: e.color, background: e.bg, cursor: 'pointer' }}>
                    {ESTADOS_CITA.map(x => <option key={x.value}>{x.value}</option>)}
                  </select>
                </td>
                {conSede && <td style={td}>{nombreSede(sedes, c.sede_id) || <span style={{ color: C.g300 }}>—</span>}</td>}
                <td style={td}>{p.origen === 'redes' && p.red ? p.red : origenLabel(p.origen)}</td>
                <td style={{ ...td, color: C.g600 }}>{agendo}</td>
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
                        {conSede && dato('Sede', nombreSede(sedes, c.sede_id))}
                        {dato('Agendó', agendo)}
                        {dato('Registrada el', c.created_at && new Date(c.created_at).toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}
                        {p.alergias && dato('Alergias', <span style={{ color: C.red }}>{p.alergias}</span>)}
                      </div>
                      {c.notas && <div style={{ marginTop: 14 }}>{dato('Notas', c.notas)}</div>}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.g100}` }}>
                        <button style={accion} onClick={() => onExpediente(p)}><Icon name="expedientes" size={15} />Ver expediente</button>
                        <button style={accion} onClick={() => onEditar(c)}><Icon name="editar" size={15} />Editar cita</button>
                        {wa && <button style={accion} onClick={() => window.open(wa, '_blank', 'noopener')}><Icon name="mensaje" size={15} />WhatsApp</button>}
                        {cal && <button style={accion} onClick={() => window.open(cal, '_blank', 'noopener')}><Icon name="calendarioMas" size={15} />Google Calendar</button>}
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

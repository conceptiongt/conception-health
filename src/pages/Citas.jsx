import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
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
import { Modal } from '../components/ui/Modal'

export function Citas() {
  const { citas, pacientes, clinica, perfil, recargar, ir, sedes } = useDatos()
  const [buscar, setBuscar] = useState('')
  const [periodo, setPeriodo] = useState({ mes: '', anio: '', desde: '', hasta: '' })
  const [sede, setSede] = useState('')
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')
  const [origen, setOrigen] = useState('')
  const [editando, setEditando] = useState(null)
  const [historial, setHistorial] = useState(false)
  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))

  const q = buscar.trim().toLowerCase()
  const visibles = citas.filter(c => {
    const p = porId[c.paciente_id]
    if (!p) return false
    if (q && !p.nombre.toLowerCase().includes(q) && !(p.telefono || '').includes(q)) return false
    if (!enPeriodo(c.fecha, periodo)) return false
    if (sede && c.sede_id !== sede) return false
    if (estado && c.estado !== estado) return false
    if (tipo && c.tipo !== tipo) return false
    if (origen && p.origen !== origen) return false
    return true
  }).sort((a, b) => (b.fecha + (b.hora || '')).localeCompare(a.fecha + (a.hora || '')))

  const cambiarEstado = async (c, nuevo) => {
    const { error } = await supabase.from('citas').update({ estado: nuevo }).eq('id', c.id)
    if (error) { toast.error('No se pudo cambiar el estado'); return }
    recargar()
  }

  const conPeriodo = periodo.mes !== '' || periodo.anio !== '' || periodo.desde || periodo.hasta
  const filtroTexto = [conPeriodo && textoPeriodo(periodo), sede && nombreSede(sedes, sede), estado, tipo, origen && origenLabel(origen), q && `"${buscar}"`].filter(Boolean).join(' · ') || 'Todas las citas'
  const deSede = (id) => citas.filter(c => (!id || c.sede_id === id) && enPeriodo(c.fecha, periodo)).length

  const preparar = () => ({
    titulo: 'Citas',
    subtitulo: filtroTexto,
    secciones: [{ tabla: {
      headers: ['Fecha', 'Hora', 'Paciente', 'Teléfono', 'Tipo', 'Estado', ...(sedes.length ? ['Sede'] : []), 'Origen'],
      filas: visibles.map(c => { const p = porId[c.paciente_id]; return [fmtFechaCorta(c.fecha), fmtHora(c.hora), p.nombre, p.telefono || '—', [c.tipo, c.servicio].filter(Boolean).join(' · ') || '—', c.estado, ...(sedes.length ? [nombreSede(sedes, c.sede_id) || '—'] : []), p.origen === 'redes' && p.red ? `Redes (${p.red})` : origenLabel(p.origen)] }),
    } }],
    excel: { archivo: `citas_${slug(filtroTexto)}`, hojas: [{ nombre: 'Citas', columnas: [
      { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Hora', key: 'hora', width: 8 }, { header: 'Paciente', key: 'paciente', width: 30 },
      { header: 'Teléfono', key: 'tel', width: 14 }, { header: 'Tipo', key: 'tipo', width: 18 }, { header: 'Estado', key: 'estado', width: 13 },
      { header: 'Origen', key: 'origen', width: 16 }, { header: 'Red social', key: 'red', width: 12 }, { header: 'Referido por', key: 'ref', width: 20 },
      { header: 'Procedimiento', key: 'proc', width: 26 }, { header: 'Sede', key: 'sede', width: 16 }, { header: 'Notas', key: 'notas', width: 40 },
    ], filas: visibles.map(c => { const p = porId[c.paciente_id]; return {
      sede: nombreSede(sedes, c.sede_id), fecha: c.fecha, hora: fmtHora(c.hora), paciente: p.nombre, tel: p.telefono, tipo: c.tipo, estado: c.estado,
      origen: origenLabel(p.origen), red: p.red, ref: p.referido_por, proc: c.procedimiento, notas: c.notas,
    } }) }] },
  })

  const sel = filtroStyle
  const btnMini = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 30, borderRadius: 7, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 400, color: C.g700, fontFamily: 'inherit' }

  if (editando) return <CitaModal soloCita cita={editando} paciente={porId[editando.paciente_id]} clinicaId={perfil.clinica_id} onClose={() => setEditando(null)} onGuardado={() => { setEditando(null); recargar() }} />

  return (
    <>
      <Encabezado titulo="Citas" subtitulo={`${visibles.length} ${visibles.length === 1 ? 'cita' : 'citas'} · ${filtroTexto}`}>
        <AgregarAnio />
        <Button variant="ghost" icon="reloj" onClick={() => setHistorial(true)}>Citas eliminadas</Button>
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
        <Button onClick={() => ir('registrar')} icon="mas">Registrar paciente</Button>
      </Encabezado>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar paciente o teléfono…" style={{ ...sel, flex: '1 1 260px' }} />
      </div>
      <div style={{ marginBottom: 10 }}><FiltroSede valor={sede} onChange={setSede} contar={deSede} /></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <SelectorPeriodo valor={periodo} onChange={setPeriodo} todosAnios />
        <select value={estado} onChange={e => setEstado(e.target.value)} style={sel}><option value="">Todo estado</option>{ESTADOS_CITA.map(e => <option key={e.value}>{e.value}</option>)}</select>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={sel}><option value="">Todo tipo</option>{TIPOS_CITA.map(t => <option key={t}>{t}</option>)}</select>
        <select value={origen} onChange={e => setOrigen(e.target.value)} style={sel}><option value="">Todo origen</option>{ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <RangoFechas valor={periodo} onChange={setPeriodo} />
      </div>

      <Tabla
        columnas={['Fecha', 'Hora', 'Paciente', 'Tipo', 'Estado', ...(sedes.length ? ['Sede'] : []), 'Origen', '']}
        vacio="No hay citas con estos filtros"
        filas={visibles.map(c => {
          const p = porId[c.paciente_id]
          const e = estadoCita(c.estado)
          const wa = linkWhatsApp(p.telefono, mensajeConfirmacion(p, c, clinica?.nombre || perfil.nombre))
          const cal = linkCalendar(p, c)
          return { key: c.id, celdas: [
            fmtFechaCorta(c.fecha), fmtHora(c.hora),
            <button onClick={() => ir('expedientes', p.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 500, color: C.black, fontSize: 13.5, fontFamily: 'inherit' }}>{p.nombre}</button>,
            [c.tipo, c.servicio].filter(Boolean).join(' · ') || '—',
            <select value={c.estado} onChange={ev => cambiarEstado(c, ev.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', fontWeight: 500, fontSize: 12.5, fontFamily: 'inherit', color: e.color, background: e.bg, cursor: 'pointer' }}>
              {ESTADOS_CITA.map(x => <option key={x.value}>{x.value}</option>)}
            </select>,
            ...(sedes.length ? [nombreSede(sedes, c.sede_id) || <span style={{ color: C.g300 }}>—</span>] : []),
            p.origen === 'redes' && p.red ? p.red : origenLabel(p.origen),
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={btnMini} onClick={() => setEditando(c)}><Icon name="editar" size={14} />Editar</button>
              {wa && <button style={btnMini} onClick={() => window.open(wa, '_blank', 'noopener')}><Icon name="mensaje" size={14} />WhatsApp</button>}
              {cal && <button style={btnMini} onClick={() => window.open(cal, '_blank', 'noopener')}><Icon name="calendarioMas" size={14} />Calendar</button>}
            </div>,
          ] }
        })}
      />
      {historial && <CitasEliminadas onClose={() => setHistorial(false)} />}
    </>
  )
}

// Every deleted appointment with who deleted it and why; the whole clinic (admin and assistants) sees the same list
function CitasEliminadas({ onClose }) {
  const [filas, setFilas] = useState(null)
  const [buscar, setBuscar] = useState('')
  useEffect(() => {
    supabase.from('citas_eliminadas').select('id, paciente_nombre, fecha, hora, tipo, estado, sede_nombre, motivo, eliminado_por_nombre, eliminado_at')
      .order('eliminado_at', { ascending: false }).limit(500)
      .then(({ data, error }) => { if (error) toast.error('No se pudo cargar el historial'); setFilas(data || []) })
  }, [])
  const q = buscar.trim().toLowerCase()
  const visibles = (filas || []).filter(r => !q || [r.paciente_nombre, r.motivo, r.eliminado_por_nombre].some(x => (x || '').toLowerCase().includes(q)))
  const cuando = (t) => new Date(t).toLocaleString('es-GT', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <Modal title="Citas eliminadas" subtitle="Quién eliminó cada cita y por qué" onClose={onClose} maxWidth={720}>
      {filas === null ? <div style={{ color: C.g400, fontSize: 14 }}>Cargando…</div>
        : !filas.length ? <div style={{ color: C.g500, fontSize: 14, lineHeight: 1.6 }}>Aún no se ha eliminado ninguna cita. Cuando alguien elimine una, aquí verá la fecha de la cita, el paciente, quién la eliminó y el motivo.</div>
        : <>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar paciente, motivo o usuario…" style={{ ...filtroStyle, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibles.map(r => (
              <div key={r.id} style={{ border: `1px solid ${C.g200}`, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <strong style={{ fontWeight: 500, fontSize: 14.5 }}>{r.paciente_nombre || 'Paciente'}</strong>
                  <span style={{ fontSize: 13, color: C.g500 }}>Cita del {fmtFechaCorta(r.fecha)}{r.hora ? ` · ${fmtHora(r.hora)}` : ''}{r.tipo ? ` · ${r.tipo}` : ''}{r.sede_nombre ? ` · ${r.sede_nombre}` : ''}</span>
                </div>
                <div style={{ fontSize: 14, color: C.g700, marginTop: 6, lineHeight: 1.5 }}><span style={{ color: C.g500 }}>Motivo:</span> {r.motivo}</div>
                <div style={{ fontSize: 12.5, color: C.g400, marginTop: 6 }}>
                  Eliminada por <strong style={{ fontWeight: 500, color: C.g600 }}>{r.eliminado_por_nombre || 'usuario'}</strong> el {cuando(r.eliminado_at)}
                </div>
              </div>
            ))}
            {!visibles.length && <div style={{ color: C.g500, fontSize: 14 }}>Nada coincide con la búsqueda.</div>}
          </div>
        </>}
    </Modal>
  )
}

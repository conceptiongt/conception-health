import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { MESES, TIPOS_CITA, ESTADOS_CITA, ORIGENES, estadoCita, origenLabel } from '../lib/constantes'
import { fmtFechaCorta, fmtHora, enMes, linkCalendar, linkWhatsApp, mensajeConfirmacion } from '../lib/formato'
import { slug } from '../lib/excel'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Tabla } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Exportar } from '../components/Documento'
import { CitaModal } from '../components/CitaModal'
import { toast } from '../components/ui/Toast'
import { Icon } from '../components/ui/Icon'
import { filtroStyle } from '../components/ui/Campos'

const hoy = new Date()

export function Citas() {
  const { citas, pacientes, clinica, perfil, recargar, ir } = useDatos()
  const [buscar, setBuscar] = useState('')
  const [mes, setMes] = useState('todos') // 'todos' | 'YYYY-M'
  const [estado, setEstado] = useState('')
  const [tipo, setTipo] = useState('')
  const [origen, setOrigen] = useState('')
  const [editando, setEditando] = useState(null)
  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))

  const q = buscar.trim().toLowerCase()
  const visibles = citas.filter(c => {
    const p = porId[c.paciente_id]
    if (!p) return false
    if (q && !p.nombre.toLowerCase().includes(q) && !(p.telefono || '').includes(q)) return false
    if (mes !== 'todos') { const [y, m] = mes.split('-').map(Number); if (!enMes(c.fecha, { year: y, mes: m })) return false }
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

  const meses = Array.from({ length: 18 }, (_, i) => { const d = new Date(hoy.getFullYear(), hoy.getMonth() + 3 - i, 1); return { mes: d.getMonth(), year: d.getFullYear() } })
  const filtroTexto = [mes !== 'todos' && (() => { const [y, m] = mes.split('-').map(Number); return `${MESES[m]} ${y}` })(), estado, tipo, origen && origenLabel(origen), q && `"${buscar}"`].filter(Boolean).join(' · ') || 'Todas las citas'

  const preparar = () => ({
    titulo: 'Citas',
    subtitulo: filtroTexto,
    secciones: [{ tabla: {
      headers: ['Fecha', 'Hora', 'Paciente', 'Teléfono', 'Tipo', 'Estado', 'Origen'],
      filas: visibles.map(c => { const p = porId[c.paciente_id]; return [fmtFechaCorta(c.fecha), fmtHora(c.hora), p.nombre, p.telefono || '—', c.tipo || '—', c.estado, p.origen === 'redes' && p.red ? `Redes (${p.red})` : origenLabel(p.origen)] }),
    } }],
    excel: { archivo: `citas_${slug(filtroTexto)}`, hojas: [{ nombre: 'Citas', columnas: [
      { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Hora', key: 'hora', width: 8 }, { header: 'Paciente', key: 'paciente', width: 30 },
      { header: 'Teléfono', key: 'tel', width: 14 }, { header: 'Tipo', key: 'tipo', width: 18 }, { header: 'Estado', key: 'estado', width: 13 },
      { header: 'Origen', key: 'origen', width: 16 }, { header: 'Red social', key: 'red', width: 12 }, { header: 'Referido por', key: 'ref', width: 20 },
      { header: 'Procedimiento', key: 'proc', width: 26 }, { header: 'Notas', key: 'notas', width: 40 },
    ], filas: visibles.map(c => { const p = porId[c.paciente_id]; return {
      fecha: c.fecha, hora: fmtHora(c.hora), paciente: p.nombre, tel: p.telefono, tipo: c.tipo, estado: c.estado,
      origen: origenLabel(p.origen), red: p.red, ref: p.referido_por, proc: c.procedimiento, notas: c.notas,
    } }) }] },
  })

  const sel = filtroStyle
  const btnMini = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 9, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: C.g700 }

  return (
    <>
      <Encabezado titulo="Citas" subtitulo={`${visibles.length} ${visibles.length === 1 ? 'cita' : 'citas'} · ${filtroTexto}`}>
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
        <Button onClick={() => ir('registrar')} icon="mas">Registrar paciente</Button>
      </Encabezado>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar paciente o teléfono…" style={{ ...sel, flex: '1 1 220px' }} />
        <select value={mes} onChange={e => setMes(e.target.value)} style={sel}>
          <option value="todos">Todos los meses</option>
          {meses.map(m => <option key={`${m.year}-${m.mes}`} value={`${m.year}-${m.mes}`}>{MESES[m.mes]} {m.year}</option>)}
        </select>
        <select value={estado} onChange={e => setEstado(e.target.value)} style={sel}><option value="">Todo estado</option>{ESTADOS_CITA.map(e => <option key={e.value}>{e.value}</option>)}</select>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={sel}><option value="">Todo tipo</option>{TIPOS_CITA.map(t => <option key={t}>{t}</option>)}</select>
        <select value={origen} onChange={e => setOrigen(e.target.value)} style={sel}><option value="">Todo origen</option>{ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      </div>

      <Tabla
        columnas={['Fecha', 'Hora', 'Paciente', 'Tipo', 'Estado', 'Origen', '']}
        vacio="No hay citas con estos filtros"
        filas={visibles.map(c => {
          const p = porId[c.paciente_id]
          const e = estadoCita(c.estado)
          const wa = linkWhatsApp(p.telefono, mensajeConfirmacion(p, c, clinica?.nombre || perfil.nombre))
          const cal = linkCalendar(p, c)
          return { key: c.id, celdas: [
            fmtFechaCorta(c.fecha), fmtHora(c.hora),
            <button onClick={() => ir('expedientes', p.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: C.black, fontSize: 13.5 }}>{p.nombre}</button>,
            [c.tipo, c.servicio].filter(Boolean).join(' · ') || '—',
            <select value={c.estado} onChange={ev => cambiarEstado(c, ev.target.value)} style={{ padding: '5px 8px', borderRadius: 20, border: 'none', fontWeight: 700, fontSize: 12.5, color: e.color, background: e.bg, cursor: 'pointer' }}>
              {ESTADOS_CITA.map(x => <option key={x.value}>{x.value}</option>)}
            </select>,
            p.origen === 'redes' && p.red ? p.red : origenLabel(p.origen),
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={btnMini} onClick={() => setEditando(c)}><Icon name="editar" size={14} />Editar</button>
              {wa && <button style={btnMini} onClick={() => window.open(wa, '_blank', 'noopener')}><Icon name="mensaje" size={14} />WhatsApp</button>}
              {cal && <button style={btnMini} onClick={() => window.open(cal, '_blank', 'noopener')}><Icon name="calendarioMas" size={14} />Calendar</button>}
            </div>,
          ] }
        })}
      />

      {editando && (
        <CitaModal cita={editando} paciente={porId[editando.paciente_id]} clinicaId={perfil.clinica_id}
          onClose={() => setEditando(null)} onGuardado={() => { setEditando(null); recargar() }} />
      )}
    </>
  )
}

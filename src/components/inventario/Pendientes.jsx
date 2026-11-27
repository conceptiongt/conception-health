import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { C } from '../../lib/theme'
import { fmtFechaCorta } from '../../lib/formato'
import { useDatos } from '../../hooks/useDatos'
import { useAtenciones } from '../../hooks/useAtenciones'
import { existencia, fmtCant } from '../../hooks/useInventario'
import { errorAtencion, puedeResolver } from '../../lib/insumos'
import { Tabla, Badge } from '../ui/Varios'
import { Button } from '../ui/Button'
import { Desplegable } from '../ui/Desplegable'
import { toast } from '../ui/Toast'
import { confirmar } from '../ui/Confirmar'

// «Pendientes de bodega»: supplies that were missing when an attendance was confirmed. Bodega marks each one «Resuelto»,
// optionally discounting what has arrived since. (Hospital accounts; the tab only exists when the migration is applied.)
export function PendientesBodega({ inv, onCambio }) {
  const { pacientes, citas, hospital, perfil } = useDatos()
  const { pendientes } = useAtenciones()
  const [ver, setVer] = useState('pendiente')
  const [esp, setEsp] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const puedeAccionar = puedeResolver(perfil)

  const producto = (id) => inv.productos.find(p => p.id === id)
  const sede = (id) => inv.sedes.find(s => s.id === id)
  const baseLista = pendientes.filter(p => !esp || (esp === '__general' ? !p.departamento_id : p.departamento_id === esp))
  const lista = baseLista.filter(p => p.estado === ver).sort((a, b) => ver === 'pendiente' ? a.created_at.localeCompare(b.created_at) : (b.resuelto_at || '').localeCompare(a.resuelto_at || ''))
  const n = (estado) => baseLista.filter(p => p.estado === estado).length

  const resolver = async (p, descontar) => {
    if (ocupado) return
    if (!descontar && !await confirmar({
      titulo: '¿Marcar como resuelto?', subtitulo: producto(p.producto_id)?.nombre,
      mensaje: ['No se descuenta nada del inventario: úselo cuando el insumo ya se entregó por fuera del sistema o ya no se necesita.'], aceptar: 'Marcar resuelto',
    })) return
    setOcupado(p.id)
    const { data, error } = await supabase.rpc('pendiente_resolver', { p_id: p.id, p_descontar: descontar })
    setOcupado(null)
    if (error) { toast.error(errorAtencion(error, 'No se pudo resolver')); return }
    toast.success(data?.estado === 'pendiente' ? `Se descontaron ${fmtCant(data.descontado)}; quedan ${fmtCant(data.restante)} pendientes` : descontar ? 'Resuelto: se descontó del inventario' : 'Marcado como resuelto')
    onCambio?.()
  }

  const chip = (valor, label) => (
    <button key={valor} onClick={() => setVer(valor)} style={{ padding: '7px 13px', borderRadius: 20, border: `1px solid ${ver === valor ? C.black : C.g200}`, background: ver === valor ? C.black : '#fff', color: ver === valor ? '#fff' : C.g600, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
      {label}<span style={{ opacity: 0.6, marginLeft: 5 }}>{n(valor)}</span>
    </button>
  )

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ flex: '1 1 260px', minWidth: 0, fontSize: 13.5, color: C.g500, lineHeight: 1.5 }}>
          Insumos que faltaban cuando el médico confirmó una atención. Cuando lleguen, use «Descontar y resolver».
        </div>
        {chip('pendiente', 'Pendientes')}{chip('resuelto', 'Resueltos')}
        {hospital?.departamentos?.length > 0 && <Desplegable ariaLabel="Especialidad" value={esp} onChange={setEsp} options={[{ value: '', label: 'Toda especialidad' }, { value: '__general', label: 'General' }, ...hospital.departamentos.map(d => ({ value: d.id, label: d.nombre }))]} />}
      </div>
      <Tabla
          columnas={['Insumo', 'Falta', 'Paciente y cita', ver === 'pendiente' ? 'Pidió' : 'Resuelto', '']}
          vacio={ver === 'pendiente' ? 'No hay insumos pendientes de bodega' : 'Aún no hay pendientes resueltos'}
          filas={lista.map(p => {
            const pr = producto(p.producto_id), pac = pacientes.find(x => x.id === p.paciente_id), c = citas.find(x => x.id === p.cita_id)
            const hay = existencia(inv, p.sede_id, p.producto_id)
            return { key: p.id, celdas: [
              <div><strong style={{ fontWeight: 600 }}>{pr?.nombre || 'Insumo'}</strong><div style={{ fontSize: 12, color: C.g400 }}>{[sede(p.sede_id)?.nombre, hospital?.departamento(p.departamento_id)?.nombre].filter(Boolean).join(' · ')}</div></div>,
              <strong style={{ color: p.estado === 'pendiente' ? C.amber : C.g600 }}>{fmtCant(p.estado === 'pendiente' ? p.cantidad : p.cantidad_original)} {pr?.unidad}</strong>,
              <div style={{ whiteSpace: 'normal', minWidth: 150 }}>{pac?.nombre || '—'}<div style={{ fontSize: 12, color: C.g400 }}>{c ? `${fmtFechaCorta(c.fecha)} · ${c.servicio || c.tipo || 'Consulta'}` : '—'}</div></div>,
              p.estado === 'pendiente'
                ? <div style={{ whiteSpace: 'normal' }}>{p.creado_nombre || '—'}<div style={{ fontSize: 12, color: C.g400 }}>{fmtFechaCorta(p.created_at)}</div></div>
                : <div style={{ whiteSpace: 'normal' }}>{fmtFechaCorta(p.resuelto_at)}<div style={{ fontSize: 12, color: C.g400 }}>{p.resuelto_nombre || ''}{Number(p.descontado) > 0 ? ` · descontó ${fmtCant(p.descontado)}` : ''}</div></div>,
              p.estado === 'pendiente' && puedeAccionar ? (
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  {hay > 0 && <Button size="sm" icon="check" onClick={() => resolver(p, true)} disabled={ocupado === p.id} title={`Hay ${fmtCant(hay)} en ${sede(p.sede_id)?.nombre}`}>Descontar y resolver</Button>}
                  <Button size="sm" variant="ghost" onClick={() => resolver(p, false)} disabled={ocupado === p.id}>Resuelto</Button>
                </span>
              ) : p.estado === 'resuelto' ? <Badge color={C.green} bg={C.greenLight}>Resuelto</Badge> : null,
            ] }
          })} />
    </>
  )
}

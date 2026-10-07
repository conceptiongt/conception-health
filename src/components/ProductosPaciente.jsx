import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { fmtQ, fmtFechaCorta, hoyISO } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { useInventario, existencia, fmtCant, errorInventario } from '../hooks/useInventario'
import { Card, Tabla, Cargando } from './ui/Varios'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Campo, Input, Select, Textarea, Grid } from './ui/Campos'
import { toast } from './ui/Toast'
import { BuscadorProducto } from './inventario/Selectores'
import { UsarPaqueteModal } from './inventario/Paquetes'

// Products used on a patient: each one is taken out of a location's stock, only if there is enough
export function ProductosPaciente({ paciente, citas }) {
  const { ir } = useDatos()
  const { inv, recargar } = useInventario()
  const [usos, setUsos] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  const [paquete, setPaquete] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('inventario_movimientos').select('*').eq('paciente_id', paciente.id).eq('tipo', 'uso').order('fecha', { ascending: false })
    setUsos(data || [])
  }, [paciente.id])
  useEffect(() => { cargar() }, [cargar])

  if (!inv || !usos) return <Cargando />
  if (inv.error) return <div style={{ color: C.red }}>No se pudo cargar el inventario</div>

  const sedes = inv.sedes.filter(s => s.activa), productos = inv.productos.filter(p => p.activo)
  const producto = (id) => inv.productos.find(p => p.id === id)
  const sede = (id) => inv.sedes.find(s => s.id === id)
  const cita = (id) => citas.find(c => c.id === id)
  const hayExistencia = sedes.some(s => productos.some(p => existencia(inv, s.id, p.id) > 0))
  const costo = usos.reduce((n, u) => n + Math.abs(u.delta) * (Number(producto(u.producto_id)?.costo) || 0), 0)

  const devolver = async (u) => {
    if (!confirm('¿Quitar este registro? La cantidad regresa al inventario de la sede.')) return
    const { error } = await supabase.from('inventario_movimientos').delete().eq('id', u.id)
    if (error) { toast.error(errorInventario(error, 'No se pudo quitar')); return }
    toast.success('Registro quitado; la cantidad regresó al inventario')
    cargar(); recargar()
  }

  return (
    <Card title={`Productos usados (${usos.length})`} right={hayExistencia && <div style={{ display: 'flex', gap: 8 }}>{(inv.paquetes || []).some(p => p.activo) && <Button size="sm" variant="ghost" icon="caja" onClick={() => setPaquete(true)}>Usar paquete</Button>}<Button size="sm" icon="mas" onClick={() => setNuevo(true)}>Descargar producto</Button></div>}>
      {!hayExistencia && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: C.amberLight, color: C.amber, fontSize: 13.5, marginBottom: usos.length ? 14 : 0, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>{!sedes.length || !productos.length ? 'Para descargar productos, primero cree sus sedes y productos en Inventario.' : 'No hay existencia en ninguna sede. Registre una entrada en Inventario para poder descargar productos.'}</span>
          <Button size="sm" variant="ghost" icon="caja" onClick={() => ir('inventario')}>Ir a Inventario</Button>
        </div>
      )}
      {usos.length === 0 ? (hayExistencia && <div style={{ color: C.g400 }}>Aún no se han descargado productos para este paciente</div>) : (
        <Tabla
          columnas={['Fecha', 'Producto', 'Cantidad', 'Sede', 'Consulta', 'Notas', '']}
          filas={[...usos.map(u => {
            const p = producto(u.producto_id), c = cita(u.cita_id)
            return { key: u.id, celdas: [fmtFechaCorta(u.fecha), <strong>{p?.nombre || '—'}</strong>, `${fmtCant(Math.abs(u.delta))} ${p?.unidad || ''}`, sede(u.sede_id)?.nombre || '—',
              c ? `${fmtFechaCorta(c.fecha)} · ${c.tipo || 'Consulta'}` : '—', <span style={{ whiteSpace: 'normal' }}>{u.notas || '—'}</span>,
              <Button variant="ghost" size="sm" onClick={() => devolver(u)}>Quitar</Button>] }
          }), ...(costo > 0 ? [{ key: 'costo', celdas: [<strong>Costo de insumos</strong>, '', <strong>{fmtQ(costo)}</strong>, '', '', '', ''] }] : [])]}
        />
      )}
      {paquete && <UsarPaqueteModal inv={inv} paciente={paciente} citas={citas} sedeInicial={paciente.sede_id || usos[0]?.sede_id}
        onClose={() => setPaquete(false)} onGuardado={() => { setPaquete(false); cargar(); recargar() }} />}
      {nuevo && <DescargaModal inv={inv} paciente={paciente} citas={citas} ultimaSede={paciente.sede_id || usos[0]?.sede_id}
        onClose={() => setNuevo(false)} onGuardado={() => { setNuevo(false); cargar(); recargar() }} />}
    </Card>
  )
}

function DescargaModal({ inv, paciente, citas, ultimaSede, onClose, onGuardado }) {
  const sedes = inv.sedes.filter(s => s.activa), productos = inv.productos.filter(p => p.activo)
  const sedeInicial = (sedes.find(s => s.id === ultimaSede) || sedes.find(s => productos.some(p => existencia(inv, s.id, p.id) > 0)) || sedes[0])?.id || ''
  const hoy = hoyISO()
  const citaHoy = citas.find(c => c.fecha === hoy)
  const [f, setF] = useState({ sede: sedeInicial, producto: '', cantidad: '1', cita: citaHoy?.id || '', notas: '', fecha: hoy })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const conExistencia = productos.filter(p => existencia(inv, f.sede, p.id) > 0)
  const prod = productos.find(p => p.id === f.producto)
  const disponible = existencia(inv, f.sede, f.producto)
  const n = Number(f.cantidad)
  const falta = !!f.producto && n > disponible

  useEffect(() => { if (f.producto && !conExistencia.some(p => p.id === f.producto)) setF(p => ({ ...p, producto: '' })) }, [f.sede]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    if (!f.producto) { toast.error('Elija el producto'); return }
    if (!(n > 0)) { toast.error('Escriba una cantidad válida'); return }
    if (falta) { toast.error(`Solo hay ${fmtCant(disponible)} en esa sede`); return }
    setBusy(true)
    const { error } = await supabase.from('inventario_movimientos').insert({
      tipo: 'uso', sede_id: f.sede, producto_id: f.producto, delta: -n, paciente_id: paciente.id, cita_id: f.cita || null, fecha: f.fecha, notas: f.notas.trim() || null,
    })
    setBusy(false)
    if (error) { toast.error(errorInventario(error)); return }
    toast.success(`${prod.nombre}: se descontaron ${fmtCant(n)} ${prod.unidad} de ${sedes.find(s => s.id === f.sede)?.nombre}`)
    onGuardado()
  }

  return (
    <Modal title="Descargar producto" subtitle={paciente.nombre} onClose={onClose}>
      <Grid min={200}>
        <Campo label="Sede"><Select value={f.sede} onChange={set('sede')}>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
        <Campo label="Producto" full ayuda={conExistencia.length ? 'Escriba el nombre o filtre por categoría; solo se pueden elegir los que hay en esta sede' : undefined}>
          {conExistencia.length
            ? <BuscadorProducto productos={productos} valor={f.producto} onChange={set('producto')} inv={inv} sedeId={f.sede} soloConExistencia />
            : <div style={{ padding: '11px 13px', borderRadius: 10, background: C.g50, border: `1px solid ${C.g200}`, color: C.g500, fontSize: 14 }}>No hay existencia de ningún producto en esta sede</div>}
        </Campo>
        <Campo label={`Cantidad${prod ? ` (${prod.unidad})` : ''}`} ayuda={prod ? `Disponible: ${fmtCant(disponible)}` : undefined}><Input type="number" min="0" step="any" value={f.cantidad} onChange={set('cantidad')} /></Campo>
        <Campo label="Consulta (opcional)"><Select value={f.cita} onChange={set('cita')}><option value="">—</option>{citas.map(c => <option key={c.id} value={c.id}>{fmtFechaCorta(c.fecha)} · {c.tipo || 'Consulta'}</option>)}</Select></Campo>
        <Campo label="Notas (opcional)" full><Textarea value={f.notas} onChange={set('notas')} rows={2} placeholder="Ej. zona aplicada, lote…" /></Campo>
      </Grid>
      {falta && <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: C.redLight, color: C.red, fontSize: 13.5, fontWeight: 600 }}>No hay suficiente existencia: en esta sede solo hay {fmtCant(disponible)} {prod?.unidad}.</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy || falta || !f.producto}>{busy ? 'Guardando…' : 'Descargar del inventario'}</Button>
      </div>
    </Modal>
  )
}

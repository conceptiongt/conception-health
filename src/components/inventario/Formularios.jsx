import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { C } from '../../lib/theme'
import { DEPARTAMENTOS, TIPOS_SEDE, UNIDADES } from '../../lib/constantes'
import { hoyISO } from '../../lib/formato'
import { existencia, fmtCant, errorInventario } from '../../hooks/useInventario'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { Campo, Input, Select, Textarea, Grid } from '../ui/Campos'
import { toast } from '../ui/Toast'

// The four everyday operations, in plain words
export const OPERACIONES = [
  { tipo: 'entrada', titulo: 'Recibir', texto: 'Llegó mercadería o una compra', icono: 'descargar', color: C.green, bg: C.greenLight },
  { tipo: 'salida', titulo: 'Sacar', texto: 'Vencido, dañado o regalado', icono: 'subir', color: C.red, bg: C.redLight },
  { tipo: 'traslado', titulo: 'Trasladar', texto: 'Mover de una sede a otra', icono: 'repetir', color: C.blue, bg: C.blueLight },
  { tipo: 'ajuste', titulo: 'Contar', texto: 'Corregir con lo que hay en físico', icono: 'check', color: C.amber, bg: C.amberLight },
]
export const operacion = (tipo) => OPERACIONES.find(o => o.tipo === tipo)

// Receive / take out / transfer / count. `inicial` can pre-fill sede, producto, cantidad.
export function MovimientoModal({ inv, inicial, onClose, onGuardado }) {
  const sedes = inv.sedes.filter(s => s.activa), productos = inv.productos.filter(p => p.activo)
  const [f, setF] = useState({
    tipo: inicial.tipo, sede: inicial.sede || sedes[0]?.id || '', producto: inicial.producto || productos[0]?.id || '',
    cantidad: inicial.cantidad != null ? String(inicial.cantidad) : '', lote: '', vence: '', notas: '', fecha: hoyISO(),
  })
  const [destino, setDestino] = useState(sedes.find(s => s.id !== f.sede)?.id || '')
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const op = operacion(f.tipo)
  const prod = productos.find(p => p.id === f.producto)
  const disponible = existencia(inv, f.sede, f.producto)
  const n = Number(f.cantidad)
  const sale = f.tipo === 'salida' || f.tipo === 'traslado'
  const falta = sale && n > disponible
  const destinoOk = destino && destino !== f.sede ? destino : sedes.find(s => s.id !== f.sede)?.id

  const guardar = async () => {
    if (!f.sede || !f.producto) { toast.error('Elija la sede y el producto'); return }
    if (f.cantidad === '' || isNaN(n) || n < 0 || (f.tipo !== 'ajuste' && n === 0)) { toast.error('Escriba una cantidad válida'); return }
    if (falta) { toast.error(`Solo hay ${fmtCant(disponible)} en esa sede`); return }
    const delta = f.tipo === 'entrada' ? n : f.tipo === 'ajuste' ? n - disponible : -n
    if (f.tipo === 'ajuste' && delta === 0) { toast.success('El conteo coincide, no hay nada que corregir'); onClose(); return }
    const comun = { producto_id: f.producto, fecha: f.fecha, notas: f.notas.trim() || null }
    let filas
    if (f.tipo === 'traslado') {
      const traslado_id = crypto.randomUUID()
      filas = [{ ...comun, tipo: 'traslado', sede_id: f.sede, delta: -n, traslado_id }, { ...comun, tipo: 'traslado', sede_id: destinoOk, delta: n, traslado_id }]
    } else {
      filas = [{ ...comun, tipo: f.tipo, sede_id: f.sede, delta, lote: f.tipo === 'entrada' ? f.lote.trim() || null : null, vence: f.tipo === 'entrada' ? f.vence || null : null }]
    }
    setBusy(true)
    const { error } = await supabase.from('inventario_movimientos').insert(filas) // one request: all rows or none
    setBusy(false)
    if (error) { toast.error(errorInventario(error)); return }
    toast.success('Inventario actualizado')
    onGuardado()
  }

  const tipos = OPERACIONES.filter(o => o.tipo !== 'traslado' || sedes.length > 1)
  return (
    <Modal title={op.titulo} subtitle={op.texto} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tipos.length},1fr)`, gap: 6, marginBottom: 18 }}>
        {tipos.map(o => {
          const activo = o.tipo === f.tipo
          return (
            <button key={o.tipo} onClick={() => set('tipo')(o.tipo)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${activo ? o.color : C.g200}`, background: activo ? o.bg : '#fff', color: activo ? o.color : C.g500, fontWeight: 700, fontSize: 13,
            }}><Icon name={o.icono} size={18} />{o.titulo}</button>
          )
        })}
      </div>
      <Grid min={200}>
        <Campo label={f.tipo === 'traslado' ? 'Desde la sede' : 'Sede'}><Select value={f.sede} onChange={set('sede')}>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>
        {f.tipo === 'traslado'
          ? <Campo label="Hacia la sede"><Select value={destinoOk} onChange={setDestino}>{sedes.filter(s => s.id !== f.sede).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>
          : <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>}
        <Campo label="Producto" full><Select value={f.producto} onChange={set('producto')}>{productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Campo>
      </Grid>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 150px', padding: '12px 16px', borderRadius: 14, background: C.g50, border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.g400, letterSpacing: '0.06em' }}>HAY AHORA EN ESTA SEDE</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{fmtCant(disponible)} <span style={{ fontSize: 14, fontWeight: 600, color: C.g500 }}>{prod?.unidad}</span></div>
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <Campo label={f.tipo === 'ajuste' ? '¿Cuántos contó en físico?' : f.tipo === 'entrada' ? '¿Cuántos llegaron?' : f.tipo === 'traslado' ? '¿Cuántos va a mover?' : '¿Cuántos va a sacar?'}>
            <Input type="number" min="0" step="any" value={f.cantidad} onChange={set('cantidad')} placeholder="0" />
          </Campo>
        </div>
      </div>
      {f.cantidad !== '' && !isNaN(n) && !falta && prod && (
        <div style={{ fontSize: 13.5, color: C.g600, marginTop: 10 }}>
          Quedará{f.tipo === 'traslado' ? 'n' : ''}: <strong>{fmtCant(f.tipo === 'entrada' ? disponible + n : f.tipo === 'ajuste' ? n : disponible - n)} {prod.unidad}</strong>
          {f.tipo === 'traslado' ? ` en ${sedes.find(s => s.id === f.sede)?.nombre} y ${fmtCant(existencia(inv, destinoOk, f.producto) + n)} en ${sedes.find(s => s.id === destinoOk)?.nombre}` : ''}
        </div>
      )}
      {falta && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: C.redLight, color: C.red, fontSize: 13.5, fontWeight: 600 }}>No hay suficiente: en esta sede solo hay {fmtCant(disponible)} {prod?.unidad}.</div>}

      <div style={{ marginTop: 16 }}>
        <Grid min={200}>
          {f.tipo === 'entrada' && <>
            <Campo label="Lote (opcional)"><Input value={f.lote} onChange={set('lote')} /></Campo>
            <Campo label="Fecha de vencimiento (opcional)" ayuda="Le avisaremos antes de que venza"><Input type="date" value={f.vence} onChange={set('vence')} /></Campo>
          </>}
          {f.tipo === 'traslado' && <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>}
          <Campo label="Nota (opcional)" full><Textarea value={f.notas} onChange={set('notas')} rows={2} placeholder={f.tipo === 'entrada' ? 'Proveedor, número de factura…' : 'Motivo'} /></Campo>
        </Grid>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy || falta}>{busy ? 'Guardando…' : `Guardar · ${op.titulo.toLowerCase()}`}</Button>
      </div>
    </Modal>
  )
}

export function ProductoModal({ producto, onClose, onGuardado }) {
  const [f, setF] = useState({ nombre: producto?.nombre || '', categoria: producto?.categoria || '', unidad: producto?.unidad || 'unidad', stock_minimo: producto ? String(producto.stock_minimo) : '', costo: producto?.costo ?? '', activo: producto?.activo ?? true })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const guardar = async () => {
    if (!f.nombre.trim()) { toast.error('Escriba el nombre'); return }
    const fila = { nombre: f.nombre.trim(), categoria: f.categoria.trim() || null, unidad: f.unidad.trim() || 'unidad', stock_minimo: Number(f.stock_minimo) || 0, costo: f.costo === '' ? null : Number(f.costo), activo: f.activo }
    setBusy(true)
    const { error } = producto ? await supabase.from('productos').update(fila).eq('id', producto.id) : await supabase.from('productos').insert(fila)
    setBusy(false)
    if (error) { toast.error(errorInventario(error)); return }
    toast.success('Producto guardado')
    onGuardado()
  }
  return (
    <Modal title={producto ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <Grid min={200}>
        <Campo label="Nombre *" full><Input value={f.nombre} onChange={set('nombre')} placeholder="Ej. Toxina botulínica 100U" /></Campo>
        <Campo label="Categoría" ayuda="Para agrupar: Inyectables, Insumos…"><Input value={f.categoria} onChange={set('categoria')} /></Campo>
        <Campo label="Se cuenta por"><Input value={f.unidad} onChange={set('unidad')} list="unidades" /><datalist id="unidades">{UNIDADES.map(u => <option key={u} value={u} />)}</datalist></Campo>
        <Campo label="Mínimo por sede" ayuda="Si una sede baja de aquí, le avisamos para reabastecer"><Input type="number" min="0" step="any" value={f.stock_minimo} onChange={set('stock_minimo')} placeholder="0" /></Campo>
        <Campo label="Costo por unidad (Q)" ayuda="Para saber cuánto vale su inventario"><Input type="number" min="0" step="0.01" value={f.costo} onChange={set('costo')} /></Campo>
        {producto && <Campo full><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.activo} onChange={e => set('activo')(e.target.checked)} />Producto activo (desactívelo si ya no lo usa; su historial se conserva)</label></Campo>}
      </Grid>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

export function SedeModal({ sede, onClose, onGuardado }) {
  const [f, setF] = useState({ nombre: sede?.nombre || '', tipo: sede?.tipo || 'ciudad', departamento: sede?.departamento || 'Guatemala', municipio: sede?.municipio || '', direccion: sede?.direccion || '', activa: sede?.activa ?? true })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const guardar = async () => {
    if (!f.nombre.trim()) { toast.error('Escriba el nombre de la sede'); return }
    const fila = { nombre: f.nombre.trim(), tipo: f.tipo, departamento: f.departamento || null, municipio: f.municipio.trim() || null, direccion: f.direccion.trim() || null, activa: f.activa }
    setBusy(true)
    const { error } = sede ? await supabase.from('sedes').update(fila).eq('id', sede.id) : await supabase.from('sedes').insert(fila)
    setBusy(false)
    if (error) { toast.error(errorInventario(error)); return }
    toast.success('Sede guardada')
    onGuardado()
  }
  return (
    <Modal title={sede ? 'Editar sede' : 'Nueva sede'} onClose={onClose}>
      <Grid min={200}>
        <Campo label="Nombre de la sede *" full><Input value={f.nombre} onChange={set('nombre')} placeholder="Ej. Zona 10, Zona 15, Quetzaltenango" /></Campo>
        <Campo label="Tipo"><Select value={f.tipo} onChange={set('tipo')}>{TIPOS_SEDE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Campo>
        <Campo label="Departamento"><Select value={f.departamento} onChange={set('departamento')}><option value="">—</option>{DEPARTAMENTOS.map(d => <option key={d}>{d}</option>)}</Select></Campo>
        <Campo label="Ciudad o municipio"><Input value={f.municipio} onChange={set('municipio')} placeholder="Ej. Guatemala, Mixco" /></Campo>
        <Campo label="Dirección (opcional)" full><Input value={f.direccion} onChange={set('direccion')} /></Campo>
        {sede && <Campo full><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.activa} onChange={e => set('activa')(e.target.checked)} />Sede activa (desactívela si cerró; su historial se conserva)</label></Campo>}
      </Grid>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

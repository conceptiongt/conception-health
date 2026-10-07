import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { C } from '../../lib/theme'
import { fmtQ, hoyISO } from '../../lib/formato'
import { useDatos } from '../../hooks/useDatos'
import { existencia, fmtCant, errorInventario } from '../../hooks/useInventario'
import { Card, Vacio, Badge } from '../ui/Varios'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { Campo, Input, Select, Textarea, Grid } from '../ui/Campos'
import { toast } from '../ui/Toast'
import { BuscadorProducto } from './Selectores'

const itemsDe = (inv, paqueteId) => (inv.paqueteItems || []).filter(i => i.paquete_id === paqueteId)

// ─── Packages tab: supplies always used together in a procedure ───
export function Paquetes({ inv, onCambio }) {
  const { servicios } = useDatos()
  const [editando, setEditando] = useState(undefined)
  const prod = (id) => inv.productos.find(p => p.id === id)
  const lista = inv.paquetes || []
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, fontSize: 13.5, color: C.g500 }}>Arme los insumos que siempre lleva un procedimiento. Al usarlo en un paciente se descuentan todos juntos, y puede cambiar las cantidades en ese momento.</div>
        <Button icon="mas" onClick={() => setEditando(null)}>Nuevo paquete</Button>
      </div>
      {lista.length === 0 ? (
        <Card><Vacio icono="caja" titulo="Aún no hay paquetes" texto="Ej. «Aplicación de toxina»: 1 vial de toxina, 2 jeringas de insulina, 3 gasas.">
          <Button icon="mas" onClick={() => setEditando(null)}>Nuevo paquete</Button>
        </Vacio></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
          {lista.map(p => {
            const items = itemsDe(inv, p.id)
            const servicio = servicios.find(s => s.id === p.servicio_id)
            const costo = items.reduce((n, i) => n + Number(i.cantidad) * (Number(prod(i.producto_id)?.costo) || 0), 0)
            return (
              <div key={p.id} className="op-tile" onClick={() => setEditando(p)} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: 18, cursor: 'pointer', opacity: p.activo ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{p.nombre}</div>
                    <div style={{ fontSize: 12.5, color: C.g500 }}>{servicio ? `${servicio.categoria} · ${servicio.nombre}` : 'Sin tarifa vinculada'}</div>
                  </div>
                  {!p.activo && <Badge>Desactivado</Badge>}
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map(i => (
                    <div key={i.id} style={{ display: 'flex', fontSize: 13, color: C.g600 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod(i.producto_id)?.nombre}</span>
                      <span style={{ color: C.black }}>{fmtCant(i.cantidad)} {prod(i.producto_id)?.unidad}</span>
                    </div>
                  ))}
                </div>
                {costo > 0 && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.g100}` }}>Costo de insumos: {fmtQ(costo)}</div>}
              </div>
            )
          })}
        </div>
      )}
      {editando !== undefined && <PaqueteModal inv={inv} paquete={editando} onClose={() => setEditando(undefined)} onGuardado={() => { setEditando(undefined); onCambio() }} />}
    </>
  )
}

function PaqueteModal({ inv, paquete, onClose, onGuardado }) {
  const { servicios } = useDatos()
  const [nombre, setNombre] = useState(paquete?.nombre || '')
  const [servicio, setServicio] = useState(paquete?.servicio_id || '')
  const [activo, setActivo] = useState(paquete?.activo ?? true)
  const [items, setItems] = useState(() => (paquete ? itemsDe(inv, paquete.id) : []).map(i => ({ producto: i.producto_id, cantidad: String(i.cantidad) })))
  const [agregar, setAgregar] = useState('')
  const [busy, setBusy] = useState(false)
  const prod = (id) => inv.productos.find(p => p.id === id)
  const opciones = servicios.filter(s => s.activo).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre, 'es'))

  const sumar = (id) => { setAgregar(''); if (items.some(i => i.producto === id)) return; setItems(l => [...l, { producto: id, cantidad: '1' }]) }
  const guardar = async () => {
    if (!nombre.trim()) { toast.error('Escriba el nombre del paquete'); return }
    if (!items.length) { toast.error('Agregue al menos un insumo'); return }
    if (items.some(i => !(Number(i.cantidad) > 0))) { toast.error('Revise las cantidades'); return }
    setBusy(true)
    const fila = { nombre: nombre.trim(), servicio_id: servicio || null, activo }
    let id = paquete?.id
    if (paquete) {
      const { error } = await supabase.from('paquetes').update(fila).eq('id', id)
      if (error) { setBusy(false); toast.error(errorInventario(error)); return }
      await supabase.from('paquete_items').delete().eq('paquete_id', id)
    } else {
      const { data, error } = await supabase.from('paquetes').insert(fila).select().single()
      if (error) { setBusy(false); toast.error(errorInventario(error)); return }
      id = data.id
    }
    const { error } = await supabase.from('paquete_items').insert(items.map(i => ({ paquete_id: id, producto_id: i.producto, cantidad: Number(i.cantidad) })))
    setBusy(false)
    if (error) { toast.error('No se pudieron guardar los insumos'); return }
    toast.success('Paquete guardado'); onGuardado()
  }
  const eliminar = async () => {
    if (!confirm(`¿Eliminar el paquete «${paquete.nombre}»? Los usos ya registrados se conservan.`)) return
    const { error } = await supabase.from('paquetes').delete().eq('id', paquete.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Paquete eliminado'); onGuardado()
  }

  return (
    <Modal title={paquete ? 'Editar paquete' : 'Nuevo paquete'} subtitle="Insumos que se usan juntos en un procedimiento" onClose={onClose} maxWidth={680}>
      <Grid min={220}>
        <Campo label="Nombre *"><Input value={nombre} onChange={setNombre} placeholder="Ej. Aplicación de toxina" /></Campo>
        <Campo label="Tarifa vinculada (opcional)" ayuda="Para crear el cobro al usarlo">
          <Select value={servicio} onChange={setServicio}><option value="">—</option>{opciones.map(s => <option key={s.id} value={s.id}>{s.categoria} · {s.nombre} — {fmtQ(s.precio)}</option>)}</Select>
        </Campo>
      </Grid>
      <div style={{ fontSize: 13.5, fontWeight: 500, margin: '18px 0 8px' }}>Insumos</div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 16 }}>
        {items.length === 0 && <div style={{ padding: '12px 14px', color: C.g400, fontSize: 13.5 }}>Busque abajo los insumos del procedimiento</div>}
        {items.map((it, i) => (
          <div key={it.producto} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? `1px solid ${C.g100}` : 'none' }}>
            <span style={{ flex: 1, minWidth: 0 }}>{prod(it.producto)?.nombre}</span>
            <div style={{ width: 100 }}><Input type="number" min="0" step="any" value={it.cantidad} onChange={(v) => setItems(l => l.map((x, j) => j === i ? { ...x, cantidad: v } : x))} /></div>
            <span style={{ width: 70, fontSize: 13, color: C.g500 }}>{prod(it.producto)?.unidad}</span>
            <button onClick={() => setItems(l => l.filter((_, j) => j !== i))} aria-label="Quitar" className="btn-ghost" style={{ border: 'none', background: 'none', color: C.g400, cursor: 'pointer', width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="eliminar" size={15} /></button>
          </div>
        ))}
        <div style={{ padding: 10, borderTop: `1px solid ${C.g100}` }}>
          <BuscadorProducto productos={inv.productos.filter(p => p.activo && !items.some(i => i.producto === p.id))} valor={agregar} onChange={sumar} placeholder="+ Agregar insumo: escriba el nombre…" />
        </div>
      </div>
      {paquete && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginTop: 14, cursor: 'pointer' }}><input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />Paquete activo</label>}
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {paquete && <Button variant="danger" icon="eliminar" onClick={eliminar}>Eliminar</Button>}
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar paquete'}</Button>
      </div>
    </Modal>
  )
}

// ─── Use a package on a patient: quantities can be changed before discounting ───
export function UsarPaqueteModal({ inv, paciente, citas, sedeInicial, onClose, onGuardado }) {
  const { servicios, perfil } = useDatos()
  const paquetes = (inv.paquetes || []).filter(p => p.activo)
  const sedes = inv.sedes.filter(s => s.activa)
  const [paqueteId, setPaqueteId] = useState(paquetes[0]?.id || '')
  const [sede, setSede] = useState(sedeInicial || sedes[0]?.id || '')
  const hoy = hoyISO()
  const [cita, setCita] = useState(citas.find(c => c.fecha === hoy)?.id || '')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState(() => itemsDe(inv, paquetes[0]?.id).map(i => ({ producto: i.producto_id, cantidad: String(i.cantidad) })))
  const [cobrar, setCobrar] = useState(false)
  const [agregar, setAgregar] = useState('')
  const [busy, setBusy] = useState(false)
  const prod = (id) => inv.productos.find(p => p.id === id)
  const paquete = paquetes.find(p => p.id === paqueteId)
  const servicio = servicios.find(s => s.id === paquete?.servicio_id)

  const elegir = (id) => { setPaqueteId(id); setItems(itemsDe(inv, id).map(i => ({ producto: i.producto_id, cantidad: String(i.cantidad) }))) }
  const faltan = items.filter(i => Number(i.cantidad) > existencia(inv, sede, i.producto))

  const guardar = async () => {
    const usar = items.filter(i => Number(i.cantidad) > 0)
    if (!usar.length) { toast.error('No hay cantidades para descontar'); return }
    if (faltan.length) { toast.error(`No hay suficiente de ${prod(faltan[0].producto)?.nombre} en esta sede`); return }
    setBusy(true)
    const { error } = await supabase.from('inventario_movimientos').insert(usar.map(i => ({
      tipo: 'uso', sede_id: sede, producto_id: i.producto, delta: -Number(i.cantidad), paciente_id: paciente.id, cita_id: cita || null,
      paquete_id: paquete?.id || null, fecha: hoy, notas: [paquete?.nombre, notas.trim()].filter(Boolean).join(' · ') || null,
    })))
    if (!error && cobrar && servicio) {
      await supabase.from('cobros').insert({ clinica_id: perfil.clinica_id, paciente_id: paciente.id, cita_id: cita || null, servicio_id: servicio.id, concepto: servicio.nombre, precio: servicio.precio, fecha: hoy })
    }
    setBusy(false)
    if (error) { toast.error(errorInventario(error)); return }
    toast.success(`${paquete?.nombre || 'Paquete'}: se descontaron ${usar.length} insumos${cobrar && servicio ? ' y se creó el cobro' : ''}`)
    onGuardado()
  }

  if (!paquetes.length) return (
    <Modal title="Usar paquete" onClose={onClose} maxWidth={460}>
      <div style={{ color: C.g500, fontSize: 14 }}>Aún no hay paquetes. Créelos en Inventario → Paquetes.</div>
    </Modal>
  )

  return (
    <Modal title="Usar paquete" subtitle={paciente.nombre} onClose={onClose} maxWidth={680}>
      <Grid min={200}>
        <Campo label="Paquete"><Select value={paqueteId} onChange={elegir}>{paquetes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Campo>
        <Campo label="Sede"><Select value={sede} onChange={setSede}>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>
        <Campo label="Consulta (opcional)"><Select value={cita} onChange={setCita}><option value="">—</option>{citas.map(c => <option key={c.id} value={c.id}>{c.fecha.split('-').reverse().join('/')} · {c.tipo || 'Consulta'}</option>)}</Select></Campo>
      </Grid>
      <div style={{ fontSize: 13.5, fontWeight: 500, margin: '18px 0 4px' }}>Insumos a descontar</div>
      <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 8 }}>Puede cambiar las cantidades solo para este paciente; el paquete no cambia.</div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 16 }}>
        {items.map((it, i) => {
          const hay = existencia(inv, sede, it.producto), falta = Number(it.cantidad) > hay
          return (
            <div key={it.producto} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? `1px solid ${C.g100}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{prod(it.producto)?.nombre}</div>
                <div style={{ fontSize: 12, color: falta ? C.red : C.g400 }}>{falta ? `Solo hay ${fmtCant(hay)}` : `Hay ${fmtCant(hay)} ${prod(it.producto)?.unidad}`}</div>
              </div>
              <div style={{ width: 96 }}><Input type="number" min="0" step="any" value={it.cantidad} onChange={(v) => setItems(l => l.map((x, j) => j === i ? { ...x, cantidad: v } : x))} /></div>
              <button onClick={() => setItems(l => l.filter((_, j) => j !== i))} aria-label="Quitar" className="btn-ghost" style={{ border: 'none', background: 'none', color: C.g400, cursor: 'pointer', width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cerrar" size={15} /></button>
            </div>
          )
        })}
        <div style={{ padding: 10, borderTop: `1px solid ${C.g100}` }}>
          <BuscadorProducto productos={inv.productos.filter(p => p.activo && !items.some(i => i.producto === p.id))} valor={agregar} inv={inv} sedeId={sede} soloConExistencia
            onChange={(id) => { setAgregar(''); setItems(l => [...l, { producto: id, cantidad: '1' }]) }} placeholder="+ Agregar otro insumo…" />
        </div>
      </div>
      <div style={{ marginTop: 14 }}><Campo label="Nota (opcional)"><Textarea value={notas} onChange={setNotas} rows={2} /></Campo></div>
      {servicio && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={cobrar} onChange={e => setCobrar(e.target.checked)} />
          Crear también el cobro de «{servicio.nombre}» por {fmtQ(servicio.precio)}
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy || faltan.length > 0} icon="check">{busy ? 'Guardando…' : 'Descontar del inventario'}</Button>
      </div>
    </Modal>
  )
}

// ─── Physical count of a whole location (like Odoo's inventory adjustment) ───
export function ConteoModal({ inv, sedeInicial, onClose, onGuardado }) {
  const sedes = inv.sedes.filter(s => s.activa)
  const [sede, setSede] = useState(sedeInicial || sedes[0]?.id || '')
  const [contado, setContado] = useState({})
  const [buscar, setBuscar] = useState('')
  const [categoria, setCategoria] = useState('')
  const [busy, setBusy] = useState(false)
  const productos = inv.productos.filter(p => p.activo)
  const categorias = [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort()
  const q = buscar.trim().toLowerCase()
  const lista = productos.filter(p => (!categoria || p.categoria === categoria) && (!q || p.nombre.toLowerCase().includes(q)))
  const diferencias = productos.filter(p => contado[p.id] !== undefined && contado[p.id] !== '' && Number(contado[p.id]) !== existencia(inv, sede, p.id))

  const guardar = async () => {
    if (!diferencias.length) { toast.success('Todo coincide; no hay nada que corregir'); onClose(); return }
    if (!confirm(`Se corregirán ${diferencias.length} productos en ${sedes.find(s => s.id === sede)?.nombre}. ¿Continuar?`)) return
    setBusy(true)
    const { error } = await supabase.from('inventario_movimientos').insert(diferencias.map(p => ({
      tipo: 'ajuste', sede_id: sede, producto_id: p.id, delta: Number(contado[p.id]) - existencia(inv, sede, p.id), fecha: hoyISO(), notas: 'Conteo físico',
    })))
    setBusy(false)
    if (error) { toast.error(errorInventario(error)); return }
    toast.success(`Conteo guardado: ${diferencias.length} productos corregidos`); onGuardado()
  }

  return (
    <Modal title="Conteo físico" subtitle="Escriba lo que contó de cada producto; lo que deje vacío no cambia" onClose={onClose} maxWidth={760}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ width: 220 }}><Select value={sede} onChange={(v) => { setSede(v); setContado({}) }}>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></div>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto…" style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.g200}`, fontFamily: 'inherit', fontSize: 13.5 }} />
        {categorias.length > 0 && <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.g200}`, fontFamily: 'inherit', fontSize: 13.5 }}><option value="">Toda categoría</option>{categorias.map(c => <option key={c}>{c}</option>)}</select>}
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, maxHeight: '48vh', overflowY: 'auto' }}>
        <div className="conteo-fila conteo-cab"><span>Producto</span><span>En sistema</span><span>Contado</span><span>Diferencia</span></div>
        {lista.map(p => {
          const sis = existencia(inv, sede, p.id), v = contado[p.id] ?? '', dif = v === '' ? null : Number(v) - sis
          return (
            <div key={p.id} className="conteo-fila">
              <span style={{ minWidth: 0 }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span><span style={{ fontSize: 12, color: C.g400 }}>{p.unidad}</span></span>
              <span style={{ color: C.g600 }}>{fmtCant(sis)}</span>
              <input type="number" min="0" step="any" value={v} onChange={e => setContado(c => ({ ...c, [p.id]: e.target.value }))} placeholder="—"
                style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: `1px solid ${C.g200}`, fontFamily: 'inherit', fontSize: 13.5 }} />
              <span style={{ fontWeight: 500, color: dif == null || dif === 0 ? C.g400 : dif > 0 ? C.green : C.red }}>{dif == null ? '' : dif === 0 ? 'Coincide' : `${dif > 0 ? '+' : '−'}${fmtCant(Math.abs(dif))}`}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, color: C.g500 }}>{diferencias.length ? `${diferencias.length} ${diferencias.length === 1 ? 'producto se corregirá' : 'productos se corregirán'}` : 'Sin diferencias todavía'}</span>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy} icon="check">{busy ? 'Guardando…' : 'Guardar conteo'}</Button>
      </div>
    </Modal>
  )
}

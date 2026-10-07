import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { C, SERIF, SHADOW } from '../../lib/theme'
import { fmtQ, fmtFecha, fmtFechaCorta, hoyISO, linkWhatsApp } from '../../lib/formato'
import { useDatos } from '../../hooks/useDatos'
import { fmtCant, errorInventario } from '../../hooks/useInventario'
import { Card, Badge, Vacio, Tabla } from '../ui/Varios'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Icon } from '../ui/Icon'
import { Campo, Input, Select, Textarea, Grid, filtroStyle } from '../ui/Campos'
import { Exportar } from '../Documento'
import { toast } from '../ui/Toast'
import { BuscadorProducto } from './Selectores'

// Purchase order life cycle (like Odoo: request → sent → confirmed → received)
export const ESTADOS_OC = {
  borrador: { label: 'Borrador', color: C.g600, bg: C.g100 },
  enviada: { label: 'Enviada al proveedor', color: C.blue, bg: C.blueLight },
  confirmada: { label: 'Por recibir', color: C.purple, bg: C.purpleLight },
  parcial: { label: 'Recibida en parte', color: C.amber, bg: C.amberLight },
  recibida: { label: 'Recibida', color: C.green, bg: C.greenLight },
  cancelada: { label: 'Cancelada', color: C.red, bg: C.redLight },
}
export const numeroOC = (o) => `OC-${String(o.numero).padStart(4, '0')}`
export const totalOC = (lineas) => lineas.reduce((n, l) => n + Number(l.cantidad) * Number(l.costo_unitario), 0)
const pendienteLinea = (l) => Math.max(0, Number(l.cantidad) - Number(l.recibido))

// Quantities ordered and not yet received, per "sede|producto" (used by restocking)
export function enCamino(ordenes, lineas) {
  const abiertas = new Set(ordenes.filter(o => ['enviada', 'confirmada', 'parcial'].includes(o.estado)).map(o => o.id))
  const sedeDe = Object.fromEntries(ordenes.map(o => [o.id, o.sede_id]))
  const r = {}
  for (const l of lineas) if (abiertas.has(l.orden_id)) {
    const k = sedeDe[l.orden_id] + '|' + l.producto_id
    r[k] = (r[k] || 0) + pendienteLinea(l)
  }
  return r
}

// ─── Purchases tab: pipeline of orders ───
export function Compras({ inv, compras, onNueva, onAbrir }) {
  const [estado, setEstado] = useState('abiertas')
  const [buscar, setBuscar] = useState('')
  const { ordenes, lineas } = compras
  const proveedor = (id) => inv.proveedores.find(p => p.id === id)
  const sede = (id) => inv.sedes.find(s => s.id === id)
  const hoy = hoyISO()
  const atrasada = (o) => ['enviada', 'confirmada', 'parcial'].includes(o.estado) && o.fecha_esperada && o.fecha_esperada < hoy
  const q = buscar.trim().toLowerCase()
  const lista = ordenes.filter(o =>
    (estado === 'todas' || (estado === 'abiertas' ? !['recibida', 'cancelada'].includes(o.estado) : estado === 'atrasadas' ? atrasada(o) : o.estado === estado))
    && (!q || numeroOC(o).toLowerCase().includes(q) || (proveedor(o.proveedor_id)?.nombre || '').toLowerCase().includes(q)))
  const cuenta = (fn) => ordenes.filter(fn).length
  const porRecibir = ordenes.filter(o => ['confirmada', 'parcial'].includes(o.estado))
  const valorPorRecibir = porRecibir.reduce((n, o) => n + lineas.filter(l => l.orden_id === o.id).reduce((m, l) => m + pendienteLinea(l) * Number(l.costo_unitario), 0), 0)

  const tarjeta = (titulo, valor, sub, superficie, onClick) => (
    <button onClick={onClick} className="op-tile" style={{ textAlign: 'left', fontFamily: 'inherit', border: 'none', borderRadius: 24, padding: '18px 22px', background: superficie, cursor: 'pointer' }}>
      <div style={{ fontSize: 13, color: C.g600 }}>{titulo}</div>
      <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 500, letterSpacing: '-0.03em', marginTop: 4 }}>{valor}</div>
      <div style={{ fontSize: 12.5, color: C.g600 }}>{sub}</div>
    </button>
  )

  const chip = (valor, label, n) => (
    <button key={valor} onClick={() => setEstado(valor)} style={{ padding: '7px 14px', borderRadius: 160, border: `1px solid ${estado === valor ? C.purple : C.g200}`, background: estado === valor ? C.purple : '#fff', color: estado === valor ? '#fff' : C.g600, fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
      {label}{n != null && <span style={{ opacity: 0.7, marginLeft: 6 }}>{n}</span>}
    </button>
  )

  return (
    <>
      <div className="inv-cuatro" style={{ marginBottom: 16 }}>
        {tarjeta('Borradores', cuenta(o => o.estado === 'borrador'), 'Pedidos por enviar', C.lavender, () => setEstado('borrador'))}
        {tarjeta('Enviadas', cuenta(o => o.estado === 'enviada'), 'Esperando confirmación', C.sky, () => setEstado('enviada'))}
        {tarjeta('Por recibir', porRecibir.length, fmtQ(valorPorRecibir) + ' en camino', C.mint, () => setEstado('confirmada'))}
        {tarjeta('Atrasadas', cuenta(atrasada), 'Pasó la fecha esperada', C.peach, () => setEstado('atrasadas'))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Icon name="buscar" size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.g400 }} />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por número o proveedor…" style={{ ...filtroStyle, width: '100%', paddingLeft: 36 }} />
        </div>
        <Button icon="mas" onClick={() => onNueva()}>Nueva orden de compra</Button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {chip('abiertas', 'Abiertas', cuenta(o => !['recibida', 'cancelada'].includes(o.estado)))}
        {Object.entries(ESTADOS_OC).map(([k, e]) => chip(k, e.label, cuenta(o => o.estado === k)))}
        {chip('todas', 'Todas')}
      </div>

      {ordenes.length === 0 ? (
        <Card><Vacio icono="archivo" titulo="Aún no hay órdenes de compra" texto="Cree una orden para pedir productos a un proveedor. Al recibirla, la mercadería entra sola al inventario de la sede.">
          <Button icon="mas" onClick={() => onNueva()}>Nueva orden de compra</Button>
        </Vacio></Card>
      ) : (
        <Tabla columnas={['Orden', 'Proveedor', 'Para la sede', 'Esperada', 'Total', 'Estado']} onFila={(f) => onAbrir(f.orden)} vacio="Ninguna orden en este filtro"
          filas={lista.map(o => {
            const e = ESTADOS_OC[o.estado], ls = lineas.filter(l => l.orden_id === o.id)
            return { key: o.id, orden: o, celdas: [
              <div><strong>{numeroOC(o)}</strong><div style={{ fontSize: 12, color: C.g400 }}>{fmtFechaCorta(o.fecha)} · {ls.length} {ls.length === 1 ? 'producto' : 'productos'}</div></div>,
              proveedor(o.proveedor_id)?.nombre || <span style={{ color: C.g400 }}>Sin proveedor</span>, sede(o.sede_id)?.nombre || '—',
              o.fecha_esperada ? <span style={{ color: atrasada(o) ? C.red : C.black, fontWeight: atrasada(o) ? 600 : 400 }}>{fmtFechaCorta(o.fecha_esperada)}{atrasada(o) ? ' · atrasada' : ''}</span> : '—',
              <strong>{fmtQ(totalOC(ls))}</strong>, <Badge color={e.color} bg={e.bg}>{e.label}</Badge>,
            ] }
          })} />
      )}
    </>
  )
}

// ─── Create / edit an order (draft or sent) ───
export function OrdenModal({ inv, orden, lineasIniciales = [], inicial = {}, onClose, onGuardado, onNuevoProveedor }) {
  const productos = inv.productos.filter(p => p.activo)
  const sedes = inv.sedes.filter(s => s.activa)
  const [f, setF] = useState({
    proveedor: orden?.proveedor_id || inicial.proveedor || '', sede: orden?.sede_id || inicial.sede || sedes[0]?.id || '',
    esperada: orden?.fecha_esperada || '', notas: orden?.notas || '',
  })
  const [lineas, setLineas] = useState(() => (lineasIniciales.length ? lineasIniciales : inicial.lineas || []).map(l => ({ producto: l.producto_id, cantidad: String(l.cantidad), costo: String(l.costo_unitario ?? '') })))
  const [agregar, setAgregar] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const prod = (id) => inv.productos.find(p => p.id === id)
  const total = lineas.reduce((n, l) => n + (Number(l.cantidad) || 0) * (Number(l.costo) || 0), 0)

  const elegirProveedor = (v) => { if (v === '__nuevo') onNuevoProveedor((id) => set('proveedor')(id)); else set('proveedor')(v) }
  const agregarLinea = (id) => {
    setAgregar('')
    if (lineas.some(l => l.producto === id)) { toast.error('Ese producto ya está en la orden'); return }
    const p = prod(id)
    setLineas(ls => [...ls, { producto: id, cantidad: '1', costo: p?.costo != null ? String(p.costo) : '' }])
  }
  const cambiar = (i, k, v) => setLineas(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l))

  const guardar = async () => {
    if (!f.sede) { toast.error('Elija la sede que recibe'); return }
    if (!lineas.length) { toast.error('Agregue al menos un producto'); return }
    if (lineas.some(l => !(Number(l.cantidad) > 0))) { toast.error('Revise las cantidades'); return }
    setBusy(true)
    const cab = { proveedor_id: f.proveedor || null, sede_id: f.sede, fecha_esperada: f.esperada || null, notas: f.notas.trim() || null }
    let id = orden?.id
    if (orden) {
      const { error } = await supabase.from('ordenes_compra').update(cab).eq('id', orden.id)
      if (!error) await supabase.from('ordenes_compra_lineas').delete().eq('orden_id', orden.id)
      if (error) { setBusy(false); toast.error(errorInventario(error)); return }
    } else {
      const { data, error } = await supabase.from('ordenes_compra').insert(cab).select().single()
      if (error) { setBusy(false); toast.error(errorInventario(error)); return }
      id = data.id
    }
    const { error } = await supabase.from('ordenes_compra_lineas').insert(lineas.map(l => ({ orden_id: id, producto_id: l.producto, cantidad: Number(l.cantidad), costo_unitario: Number(l.costo) || 0 })))
    setBusy(false)
    if (error) { toast.error(errorInventario(error)); return }
    toast.success(orden ? 'Orden actualizada' : 'Orden de compra creada')
    onGuardado(id)
  }

  return (
    <Modal title={orden ? `Editar ${numeroOC(orden)}` : 'Nueva orden de compra'} subtitle="Pedido de productos a un proveedor" onClose={onClose} maxWidth={820}>
      <Grid min={200}>
        <Campo label="Proveedor">
          <Select value={f.proveedor} onChange={elegirProveedor}>
            <option value="">— Sin proveedor —</option>
            {inv.proveedores.filter(p => p.activo || p.id === f.proveedor).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            <option value="__nuevo">+ Nuevo proveedor…</option>
          </Select>
        </Campo>
        <Campo label="Se recibe en la sede"><Select value={f.sede} onChange={set('sede')}>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>
        <Campo label="Fecha esperada de entrega"><Input type="date" value={f.esperada} onChange={set('esperada')} /></Campo>
      </Grid>

      <div style={{ marginTop: 20, fontWeight: 500, fontSize: 15 }}>Productos</div>
      <div style={{ marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'visible' }}>
        <div className="oc-fila oc-cab">
          <span>Producto</span><span>Cantidad</span><span>Costo unitario (Q)</span><span style={{ textAlign: 'right' }}>Subtotal</span><span />
        </div>
        {lineas.length === 0 && <div style={{ padding: '14px 16px', color: C.g400, fontSize: 13.5 }}>Busque abajo los productos que va a pedir</div>}
        {lineas.map((l, i) => {
          const p = prod(l.producto)
          return (
            <div key={l.producto} className="oc-fila">
              <span style={{ minWidth: 0 }}><strong style={{ fontWeight: 500 }}>{p?.nombre}</strong><span style={{ display: 'block', fontSize: 12, color: C.g400 }}>{p?.unidad}{p?.codigo ? ` · ${p.codigo}` : ''}</span></span>
              <Input type="number" min="0" step="any" value={l.cantidad} onChange={(v) => cambiar(i, 'cantidad', v)} />
              <Input type="number" min="0" step="0.01" value={l.costo} onChange={(v) => cambiar(i, 'costo', v)} placeholder="0.00" />
              <strong style={{ textAlign: 'right', fontWeight: 500 }}>{fmtQ((Number(l.cantidad) || 0) * (Number(l.costo) || 0))}</strong>
              <button onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))} aria-label="Quitar" style={{ border: 'none', background: 'none', color: C.g400, cursor: 'pointer', display: 'flex', justifyContent: 'center' }}><Icon name="eliminar" size={16} /></button>
            </div>
          )
        })}
        <div style={{ padding: 12, borderTop: `1px solid ${C.g100}` }}>
          <BuscadorProducto productos={productos.filter(p => !lineas.some(l => l.producto === p.id))} valor={agregar} onChange={agregarLinea} inv={inv} sedeId={f.sede} placeholder="+ Agregar producto: escriba el nombre…" />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
        <span style={{ color: C.g500 }}>Total</span><span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, letterSpacing: '-0.03em' }}>{fmtQ(total)}</span>
      </div>
      <div style={{ marginTop: 10 }}><Campo label="Notas para el proveedor (opcional)"><Textarea value={f.notas} onChange={set('notas')} rows={2} placeholder="Condiciones de pago, dirección de entrega…" /></Campo></div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : orden ? 'Guardar cambios' : 'Crear orden'}</Button>
      </div>
    </Modal>
  )
}

// ─── One order: status bar, lines with received quantities, actions ───
export function OrdenDetalle({ inv, orden: o, lineas, onClose, onCambio, onEditar }) {
  const { clinica } = useDatos()
  const [recibir, setRecibir] = useState(false)
  const [busy, setBusy] = useState(false)
  const prov = inv.proveedores.find(p => p.id === o.proveedor_id)
  const sede = inv.sedes.find(s => s.id === o.sede_id)
  const prod = (id) => inv.productos.find(p => p.id === id)
  const e = ESTADOS_OC[o.estado]
  const total = totalOC(lineas)
  const recibidoAlgo = lineas.some(l => Number(l.recibido) > 0)

  const pasos = ['borrador', 'enviada', 'confirmada', 'recibida']
  const indice = o.estado === 'parcial' ? 2.5 : pasos.indexOf(o.estado)

  const cambiarEstado = async (estado, msg) => {
    setBusy(true)
    const { error } = await supabase.from('ordenes_compra').update({ estado }).eq('id', o.id)
    setBusy(false)
    if (error) { toast.error('No se pudo actualizar'); return }
    toast.success(msg); onCambio()
  }
  const eliminar = async () => {
    if (!confirm(`¿Eliminar el borrador ${numeroOC(o)}?`)) return
    const { error } = await supabase.from('ordenes_compra').delete().eq('id', o.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Borrador eliminado'); onCambio(); onClose()
  }
  const cancelar = () => { if (confirm(`¿Cancelar ${numeroOC(o)}? Lo ya recibido se queda en el inventario.`)) cambiarEstado('cancelada', 'Orden cancelada') }

  const texto = [
    `Hola${prov?.contacto ? ` ${prov.contacto}` : ''}, le comparto nuestra orden de compra ${numeroOC(o)} de ${clinica?.nombre || 'nuestra clínica'}:`, '',
    ...lineas.map(l => `• ${fmtCant(l.cantidad)} ${prod(l.producto_id)?.unidad || ''} de ${prod(l.producto_id)?.nombre}${Number(l.costo_unitario) ? ` a ${fmtQ(l.costo_unitario)}` : ''}`),
    '', `Total: ${fmtQ(total)}`, `Entregar en: ${sede?.nombre}${sede?.direccion ? `, ${sede.direccion}` : ''}`,
    o.fecha_esperada ? `Fecha esperada: ${fmtFecha(o.fecha_esperada)}` : null, o.notas ? `Notas: ${o.notas}` : null, '', 'Muchas gracias.',
  ].filter(v => v != null).join('\n')
  const whatsapp = prov?.telefono ? linkWhatsApp(prov.telefono, texto) : null

  const preparar = () => ({
    titulo: `Orden de compra ${numeroOC(o)}`, subtitulo: prov?.nombre || 'Sin proveedor',
    secciones: [
      { titulo: 'Datos de la orden', pares: [['Proveedor', prov?.nombre], ['NIT', prov?.nit], ['Contacto', [prov?.contacto, prov?.telefono, prov?.email].filter(Boolean).join(' · ')],
        ['Fecha', fmtFecha(o.fecha)], ['Fecha esperada', o.fecha_esperada ? fmtFecha(o.fecha_esperada) : null], ['Entregar en', [sede?.nombre, sede?.direccion].filter(Boolean).join(', ')], ['Estado', e.label]] },
      { titulo: 'Productos', tabla: { headers: ['Producto', 'Cantidad', 'Costo unitario', 'Subtotal'],
        filas: [...lineas.map(l => [prod(l.producto_id)?.nombre, `${fmtCant(l.cantidad)} ${prod(l.producto_id)?.unidad || ''}`, fmtQ(l.costo_unitario), fmtQ(Number(l.cantidad) * Number(l.costo_unitario))]),
          { _total: true, celdas: ['Total', '', '', fmtQ(total)] }] } },
      o.notas && { titulo: 'Notas', texto: o.notas },
    ],
    excel: { archivo: numeroOC(o), hojas: [{ nombre: numeroOC(o), columnas: [{ header: 'Producto', key: 'p', width: 32 }, { header: 'Cantidad', key: 'c', width: 10 }, { header: 'Unidad', key: 'u', width: 10 }, { header: 'Costo unitario', key: 'cu', width: 14, moneda: true }, { header: 'Subtotal', key: 's', width: 14, moneda: true }, { header: 'Recibido', key: 'r', width: 10 }],
      filas: lineas.map(l => ({ p: prod(l.producto_id)?.nombre, c: Number(l.cantidad), u: prod(l.producto_id)?.unidad, cu: Number(l.costo_unitario), s: Number(l.cantidad) * Number(l.costo_unitario), r: Number(l.recibido) })) }] },
  })

  return (
    <Modal title={numeroOC(o)} subtitle={`${prov?.nombre || 'Sin proveedor'} · para ${sede?.nombre || '—'}`} onClose={onClose} maxWidth={820}>
      {o.estado !== 'cancelada' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {['Borrador', 'Enviada', 'Confirmada', 'Recibida'].map((t, i) => {
            const hecho = i < indice || (i === 3 && o.estado === 'recibida'), actual = Math.floor(indice) === i && o.estado !== 'recibida'
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ width: 22, height: 2, borderRadius: 2, background: hecho || actual ? C.purple : C.g200 }} />}
                <span style={{ padding: '5px 12px', borderRadius: 160, fontSize: 12.5, fontWeight: 500, background: actual ? C.purple : hecho ? C.purpleLight : C.g100, color: actual ? '#fff' : hecho ? C.purple : C.g400 }}>
                  {t}{actual && o.estado === 'parcial' ? ' · en parte' : ''}
                </span>
              </div>
            )
          })}
        </div>
      ) : <div style={{ marginBottom: 16 }}><Badge color={e.color} bg={e.bg}>{e.label}</Badge></div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {o.estado === 'borrador' && <Button onClick={() => cambiarEstado('enviada', 'Marcada como enviada')} disabled={busy} icon="enviar">Marcar como enviada</Button>}
        {['borrador', 'enviada'].includes(o.estado) && <Button variant={o.estado === 'enviada' ? 'primary' : 'ghost'} onClick={() => cambiarEstado('confirmada', 'Pedido confirmado: ya puede recibirlo')} disabled={busy} icon="check">Confirmar pedido</Button>}
        {['confirmada', 'parcial'].includes(o.estado) && <Button onClick={() => setRecibir(true)} icon="descargar">Recibir productos</Button>}
        {whatsapp && o.estado !== 'cancelada' && <Button variant="ghost" icon="mensaje" onClick={() => window.open(whatsapp, '_blank', 'noopener')}>Enviar por WhatsApp</Button>}
        {!whatsapp && o.estado !== 'cancelada' && <Button variant="ghost" icon="copiar" onClick={() => navigator.clipboard?.writeText(texto).then(() => toast.success('Texto copiado'))}>Copiar texto</Button>}
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
        <div style={{ flex: 1 }} />
        {['borrador', 'enviada'].includes(o.estado) && <Button variant="ghost" icon="editar" onClick={() => onEditar(o)}>Editar</Button>}
        {o.estado === 'borrador' && <Button variant="danger" icon="eliminar" onClick={eliminar}>Eliminar</Button>}
        {['enviada', 'confirmada', 'parcial'].includes(o.estado) && <Button variant="danger" onClick={cancelar}>Cancelar orden</Button>}
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        {lineas.map((l, i) => {
          const p = prod(l.producto_id), rec = Number(l.recibido), pct = Math.min(100, (rec / Number(l.cantidad)) * 100)
          return (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderTop: i ? `1px solid ${C.g100}` : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{p?.nombre}</div>
                <div style={{ fontSize: 12.5, color: C.g500 }}>{fmtCant(l.cantidad)} {p?.unidad} × {fmtQ(l.costo_unitario)}</div>
              </div>
              {['confirmada', 'parcial', 'recibida'].includes(o.estado) && (
                <div style={{ width: 150 }}>
                  <div style={{ fontSize: 12, color: C.g500, marginBottom: 3 }}>Recibido {fmtCant(rec)} de {fmtCant(l.cantidad)}</div>
                  <div style={{ height: 6, borderRadius: 3, background: C.g100 }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct >= 100 ? C.green : C.purple }} /></div>
                </div>
              )}
              <strong style={{ width: 110, textAlign: 'right', fontWeight: 500 }}>{fmtQ(Number(l.cantidad) * Number(l.costo_unitario))}</strong>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '12px 16px', background: C.g50, borderTop: `1px solid ${C.g100}`, alignItems: 'baseline' }}>
          <span style={{ color: C.g500 }}>Total</span><span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500 }}>{fmtQ(total)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: C.g500, marginTop: 14 }}>
        <span>Creada el {fmtFecha(o.fecha)}</span>
        {o.fecha_esperada && <span>Entrega esperada: {fmtFecha(o.fecha_esperada)}</span>}
        {recibidoAlgo && o.estado !== 'recibida' && <span>Lo recibido ya está en el inventario de {sede?.nombre}</span>}
      </div>
      {o.notas && <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, background: C.g50, fontSize: 13.5, color: C.g600, whiteSpace: 'pre-wrap' }}>{o.notas}</div>}

      {recibir && <RecibirModal orden={o} lineas={lineas} inv={inv} onClose={() => setRecibir(false)} onListo={() => { setRecibir(false); onCambio() }} />}
    </Modal>
  )
}

// ─── Receive all or part of an order ───
function RecibirModal({ orden, lineas, inv, onClose, onListo }) {
  const prod = (id) => inv.productos.find(p => p.id === id)
  const abiertas = lineas.filter(l => pendienteLinea(l) > 0)
  const [filas, setFilas] = useState(() => Object.fromEntries(abiertas.map(l => [l.id, { cantidad: String(pendienteLinea(l)), lote: '', vence: '' }])))
  const [fecha, setFecha] = useState(hoyISO())
  const [busy, setBusy] = useState(false)
  const set = (id, k, v) => setFilas(f => ({ ...f, [id]: { ...f[id], [k]: v } }))

  const guardar = async () => {
    const lista = abiertas.map(l => ({ linea: l.id, cantidad: Number(filas[l.id].cantidad) || 0, lote: filas[l.id].lote.trim(), vence: filas[l.id].vence }))
    if (!lista.some(x => x.cantidad > 0)) { toast.error('Escriba cuánto llegó'); return }
    const demas = abiertas.find(l => Number(filas[l.id].cantidad) > pendienteLinea(l))
    if (demas && !confirm(`Llegó más de lo pedido de ${prod(demas.producto_id)?.nombre}. ¿Registrarlo de todas formas?`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('orden_recibir', { p_orden: orden.id, p_lineas: lista, p_fecha: fecha })
    setBusy(false)
    if (error) { toast.error('No se pudo recibir: ' + (error.message.includes('NO_CONFIRMADA') ? 'confirme el pedido primero' : 'intente de nuevo')); return }
    toast.success(data === 'recibida' ? 'Orden recibida completa; ya está en el inventario' : 'Recepción parcial guardada; el resto queda pendiente')
    onListo()
  }

  return (
    <Modal title={`Recibir ${numeroOC(orden)}`} subtitle="Anote cuánto llegó de cada producto. Si llegó una parte, el resto queda pendiente." onClose={onClose} maxWidth={760}>
      <div style={{ maxWidth: 220, marginBottom: 14 }}><Campo label="Fecha de recepción"><Input type="date" value={fecha} onChange={setFecha} /></Campo></div>
      {abiertas.map((l, i) => {
        const p = prod(l.producto_id)
        return (
          <div key={l.id} style={{ padding: '12px 0', borderTop: i ? `1px solid ${C.g100}` : 'none' }}>
            <div style={{ fontWeight: 500 }}>{p?.nombre} <span style={{ color: C.g500, fontWeight: 400, fontSize: 13 }}>· faltan {fmtCant(pendienteLinea(l))} {p?.unidad}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 8 }}>
              <Campo label="Llegaron"><Input type="number" min="0" step="any" value={filas[l.id].cantidad} onChange={(v) => set(l.id, 'cantidad', v)} /></Campo>
              <Campo label="Lote (opcional)"><Input value={filas[l.id].lote} onChange={(v) => set(l.id, 'lote', v)} /></Campo>
              <Campo label="Vence (opcional)"><Input type="date" value={filas[l.id].vence} onChange={(v) => set(l.id, 'vence', v)} /></Campo>
            </div>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy} icon="descargar">{busy ? 'Guardando…' : 'Recibir en el inventario'}</Button>
      </div>
    </Modal>
  )
}

// ─── Suppliers ───
export function Proveedores({ inv, compras, onEditar, onNuevaOrden }) {
  const lista = inv.proveedores
  if (!lista.length) return <Card><Vacio icono="usuarios" titulo="Aún no hay proveedores" texto="Guarde a quién le compra: contacto, teléfono, correo y NIT. Así puede mandarle la orden por WhatsApp."><Button icon="mas" onClick={() => onEditar(null)}>Nuevo proveedor</Button></Vacio></Card>
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}><Button icon="mas" onClick={() => onEditar(null)}>Nuevo proveedor</Button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {lista.map(p => {
          const suyas = compras.ordenes.filter(o => o.proveedor_id === p.id && o.estado !== 'cancelada')
          const comprado = suyas.reduce((n, o) => n + totalOC(compras.lineas.filter(l => l.orden_id === o.id)), 0)
          const productos = inv.productos.filter(x => x.proveedor_id === p.id).length
          return (
            <div key={p.id} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: 22, boxShadow: SHADOW, opacity: p.activo ? 1 : 0.55, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 42, height: 42, borderRadius: 21, background: C.periwinkle, color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{p.nombre.slice(0, 1).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.015em' }}>{p.nombre}</div>
                  <div style={{ fontSize: 12.5, color: C.g500 }}>{[p.contacto, p.nit && `NIT ${p.nit}`].filter(Boolean).join(' · ') || 'Sin contacto'}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: C.g600, marginTop: 10 }}>{[p.telefono, p.email].filter(Boolean).join(' · ')}</div>
              <div style={{ display: 'flex', gap: 18, margin: '14px 0' }}>
                <div><div style={{ fontSize: 11.5, color: C.g400 }}>Órdenes</div><div style={{ fontWeight: 500 }}>{suyas.length}</div></div>
                <div><div style={{ fontSize: 11.5, color: C.g400 }}>Comprado</div><div style={{ fontWeight: 500 }}>{fmtQ(comprado)}</div></div>
                <div><div style={{ fontSize: 11.5, color: C.g400 }}>Productos</div><div style={{ fontWeight: 500 }}>{productos}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                {p.activo && <Button size="sm" style={{ flex: 1 }} onClick={() => onNuevaOrden({ proveedor: p.id })}>Nueva orden</Button>}
                <Button size="sm" variant="ghost" icon="editar" onClick={() => onEditar(p)}>Editar</Button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

export function ProveedorModal({ proveedor, onClose, onGuardado }) {
  const [f, setF] = useState({ nombre: proveedor?.nombre || '', contacto: proveedor?.contacto || '', telefono: proveedor?.telefono || '', email: proveedor?.email || '', nit: proveedor?.nit || '', notas: proveedor?.notas || '', activo: proveedor?.activo ?? true })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const guardar = async () => {
    if (!f.nombre.trim()) { toast.error('Escriba el nombre'); return }
    const fila = { nombre: f.nombre.trim(), contacto: f.contacto.trim() || null, telefono: f.telefono.trim() || null, email: f.email.trim() || null, nit: f.nit.trim() || null, notas: f.notas.trim() || null, activo: f.activo }
    setBusy(true)
    const { data, error } = proveedor ? await supabase.from('proveedores').update(fila).eq('id', proveedor.id).select().single() : await supabase.from('proveedores').insert(fila).select().single()
    setBusy(false)
    if (error) { toast.error(errorInventario(error)); return }
    toast.success('Proveedor guardado')
    onGuardado(data)
  }
  return (
    <Modal title={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={onClose}>
      <Grid min={200}>
        <Campo label="Nombre o empresa *" full><Input value={f.nombre} onChange={set('nombre')} placeholder="Ej. Distribuidora Médica S.A." /></Campo>
        <Campo label="Persona de contacto"><Input value={f.contacto} onChange={set('contacto')} /></Campo>
        <Campo label="Teléfono / WhatsApp"><Input value={f.telefono} onChange={set('telefono')} placeholder="5555-1234" /></Campo>
        <Campo label="Correo"><Input type="email" value={f.email} onChange={set('email')} /></Campo>
        <Campo label="NIT"><Input value={f.nit} onChange={set('nit')} /></Campo>
        <Campo label="Notas" full><Textarea value={f.notas} onChange={set('notas')} rows={2} placeholder="Días de entrega, condiciones de pago…" /></Campo>
        {proveedor && <Campo full><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.activo} onChange={e => set('activo')(e.target.checked)} />Proveedor activo</label></Campo>}
      </Grid>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

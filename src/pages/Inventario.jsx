import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C, SERIF } from '../lib/theme'
import { DEPARTAMENTOS, TIPOS_SEDE, UNIDADES, TIPOS_MOVIMIENTO } from '../lib/constantes'
import { fmtQ, fmtFechaCorta, hoyISO } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { useInventario, existencia, bajoMinimo, totalProducto, fmtCant, errorInventario } from '../hooks/useInventario'
import { Encabezado, Tabla, Card, Badge, Vacio, Stat, Cargando, Pestanas } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Campo, Input, Select, Textarea, Grid, filtroStyle } from '../components/ui/Campos'
import { Exportar } from '../components/Documento'
import { toast } from '../components/ui/Toast'

const TABS = [
  { value: 'existencias', label: 'Existencias', icono: 'caja' },
  { value: 'movimientos', label: 'Movimientos', icono: 'actividad' },
  { value: 'productos', label: 'Productos', icono: 'archivo' },
  { value: 'sedes', label: 'Sedes', icono: 'sede' },
]

export const tipoSedeLabel = (v) => TIPOS_SEDE.find(t => t.value === v)?.label || v
export const lugarSede = (s) => [s.municipio, s.departamento].filter(Boolean).join(', ')

export function Inventario() {
  const { inv, recargar } = useInventario()
  const [tab, setTab] = useState('existencias')
  const [mov, setMov] = useState(null) // movement modal: { tipo }

  if (!inv) return <Cargando />
  if (inv.error) return <div style={{ color: C.red, padding: 30 }}>No se pudo cargar el inventario: {inv.error}</div>

  const sedes = inv.sedes.filter(s => s.activa)
  const productos = inv.productos.filter(p => p.activo)
  const bajos = productos.filter(p => sedes.some(s => bajoMinimo(inv, s.id, p)))
  const listo = sedes.length > 0 && productos.length > 0

  return (
    <>
      <Encabezado titulo="Inventario" subtitulo={`${sedes.length} ${sedes.length === 1 ? 'sede' : 'sedes'} · ${productos.length} ${productos.length === 1 ? 'producto' : 'productos'}`}>
        {listo && <>
          <Button variant="ghost" icon="repetir" onClick={() => setMov({ tipo: 'traslado' })} disabled={sedes.length < 2} title={sedes.length < 2 ? 'Necesita al menos dos sedes' : undefined}>Traslado</Button>
          <Button variant="ghost" icon="editar" onClick={() => setMov({ tipo: 'salida' })}>Salida o ajuste</Button>
          <Button icon="mas" onClick={() => setMov({ tipo: 'entrada' })}>Registrar entrada</Button>
        </>}
      </Encabezado>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        <Stat icono="sede" label="Sedes" valor={sedes.length} color={C.blue} bg={C.blueLight} />
        <Stat icono="caja" label="Productos" valor={productos.length} />
        <Stat icono="alerta" label="Bajo el mínimo" valor={bajos.length} color={bajos.length ? C.red : C.green} bg={bajos.length ? C.redLight : C.greenLight}
          sub={bajos.length ? bajos.slice(0, 3).map(p => p.nombre).join(', ') + (bajos.length > 3 ? '…' : '') : 'Todo en orden'} />
      </div>

      <div style={{ marginBottom: 16 }}><Pestanas opciones={TABS} valor={tab} onChange={setTab} /></div>

      {tab === 'existencias' && (
        !sedes.length ? <PrimerPaso icono="sede" titulo="Cree su primera sede" texto="Cada sede (de ciudad o departamental) lleva su propio inventario." boton="Crear sede" onClick={() => setTab('sedes')} />
        : !productos.length ? <PrimerPaso icono="caja" titulo="Agregue sus productos" texto="Insumos, medicamentos o materiales que usa en sus pacientes." boton="Agregar producto" onClick={() => setTab('productos')} />
        : <Existencias inv={inv} sedes={sedes} productos={productos} />
      )}
      {tab === 'movimientos' && <Movimientos inv={inv} onCambio={recargar} />}
      {tab === 'productos' && <Productos inv={inv} onCambio={recargar} />}
      {tab === 'sedes' && <Sedes inv={inv} onCambio={recargar} />}

      {mov && <MovimientoModal inv={inv} tipoInicial={mov.tipo} onClose={() => setMov(null)} onGuardado={() => { setMov(null); recargar() }} />}
    </>
  )
}

function PrimerPaso({ icono, titulo, texto, boton, onClick }) {
  return (
    <Card><Vacio icono={icono} titulo={titulo} texto={texto}><Button icon="mas" onClick={onClick}>{boton}</Button></Vacio></Card>
  )
}

// ─── Stock table: one column per location ───
function Existencias({ inv, sedes, productos }) {
  const { clinica } = useDatos()
  const [sedeId, setSedeId] = useState('')
  const [buscar, setBuscar] = useState('')
  const [soloBajos, setSoloBajos] = useState(false)
  const visibles = sedeId ? sedes.filter(s => s.id === sedeId) : sedes
  const q = buscar.trim().toLowerCase()
  const bajo = (p, s) => bajoMinimo(inv, s.id, p)
  const lista = productos.filter(p => (!q || p.nombre.toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q)) && (!soloBajos || visibles.some(s => bajo(p, s))))

  const preparar = () => ({
    titulo: 'Inventario', subtitulo: sedeId ? visibles[0].nombre : 'Todas las sedes',
    secciones: [{ tabla: { headers: ['Producto', 'Unidad', ...visibles.map(s => s.nombre), ...(visibles.length > 1 ? ['Total'] : []), 'Mínimo'],
      filas: lista.map(p => [p.nombre, p.unidad, ...visibles.map(s => fmtCant(existencia(inv, s.id, p.id))), ...(visibles.length > 1 ? [fmtCant(visibles.reduce((n, s) => n + existencia(inv, s.id, p.id), 0))] : []), fmtCant(p.stock_minimo)]) } }],
    excel: { archivo: 'inventario', hojas: [{ nombre: 'Existencias', columnas: [
      { header: 'Producto', key: 'p', width: 30 }, { header: 'Categoría', key: 'c', width: 16 }, { header: 'Unidad', key: 'u', width: 10 },
      ...visibles.map((s, i) => ({ header: s.nombre, key: 's' + i, width: 14 })), { header: 'Total', key: 't', width: 10 }, { header: 'Mínimo por sede', key: 'm', width: 14 },
    ], filas: lista.map(p => ({ p: p.nombre, c: p.categoria, u: p.unidad, ...Object.fromEntries(visibles.map((s, i) => ['s' + i, existencia(inv, s.id, p.id)])),
      t: visibles.reduce((n, s) => n + existencia(inv, s.id, p.id), 0), m: Number(p.stock_minimo) })) }] },
  })

  const sel = filtroStyle
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto…" style={{ ...sel, flex: '1 1 220px' }} />
        <select value={sedeId} onChange={e => setSedeId(e.target.value)} style={sel}>
          <option value="">Todas las sedes</option>
          {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: C.g600, cursor: 'pointer' }}>
          <input type="checkbox" checked={soloBajos} onChange={e => setSoloBajos(e.target.checked)} />Solo bajo el mínimo
        </label>
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
      </div>
      <Tabla
        columnas={['Producto', ...visibles.map(s => s.nombre), ...(visibles.length > 1 ? ['Total'] : [])]}
        vacio="Ningún producto coincide"
        filas={lista.map(p => ({ key: p.id, celdas: [
          <div><strong>{p.nombre}</strong><div style={{ fontSize: 12, color: C.g400 }}>{[p.categoria, p.unidad, Number(p.stock_minimo) ? `mínimo ${fmtCant(p.stock_minimo)}` : null].filter(Boolean).join(' · ')}</div></div>,
          ...visibles.map(s => {
            const n = existencia(inv, s.id, p.id)
            return <span style={{ fontWeight: 700, color: n === 0 ? C.g300 : bajo(p, s) ? C.red : C.black }}>{fmtCant(n)}{bajo(p, s) && <span style={{ fontSize: 11.5, fontWeight: 600 }}> · bajo</span>}</span>
          }),
          ...(visibles.length > 1 ? [<strong>{fmtCant(visibles.reduce((n, s) => n + existencia(inv, s.id, p.id), 0))}</strong>] : []),
        ] }))}
      />
    </>
  )
}

// ─── Movements history ───
function Movimientos({ inv, onCambio }) {
  const { pacientes } = useDatos()
  const [movs, setMovs] = useState(null)
  const [sedeId, setSedeId] = useState('')
  const [tipo, setTipo] = useState('')
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('inventario_movimientos').select('*').order('created_at', { ascending: false }).limit(500)
    setMovs(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!movs) return <Cargando />

  const sede = (id) => inv.sedes.find(s => s.id === id)
  const producto = (id) => inv.productos.find(p => p.id === id)
  const paciente = (id) => pacientes.find(p => p.id === id)
  const lista = movs.filter(m => (!sedeId || m.sede_id === sedeId) && (!tipo || m.tipo === tipo))

  const deshacer = async (m) => {
    const p = producto(m.producto_id)
    if (!confirm(`¿Deshacer este movimiento (${TIPOS_MOVIMIENTO[m.tipo].label}, ${fmtCant(Math.abs(m.delta))} ${p?.unidad || ''} de ${p?.nombre || 'producto'})? La existencia vuelve a como estaba.`)) return
    const q = supabase.from('inventario_movimientos').delete()
    const { error } = await (m.traslado_id ? q.eq('traslado_id', m.traslado_id) : q.eq('id', m.id))
    if (error) { toast.error(errorInventario(error, 'No se pudo deshacer')); return }
    toast.success('Movimiento deshecho')
    cargar(); onCambio()
  }

  const sel = filtroStyle
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select value={sedeId} onChange={e => setSedeId(e.target.value)} style={sel}><option value="">Todas las sedes</option>{inv.sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={sel}><option value="">Todo movimiento</option>{Object.entries(TIPOS_MOVIMIENTO).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select>
      </div>
      <Tabla
        columnas={['Fecha', 'Movimiento', 'Producto', 'Sede', 'Cantidad', 'Detalle', '']}
        vacio="Aún no hay movimientos"
        filas={lista.map(m => {
          const t = TIPOS_MOVIMIENTO[m.tipo], p = producto(m.producto_id), pac = paciente(m.paciente_id)
          return { key: m.id, celdas: [
            fmtFechaCorta(m.fecha), <Badge color={t.color} bg={t.bg}>{t.label}</Badge>, p?.nombre || '—', sede(m.sede_id)?.nombre || '—',
            <strong style={{ color: m.delta > 0 ? C.green : C.red }}>{m.delta > 0 ? '+' : '−'}{fmtCant(Math.abs(m.delta))} <span style={{ fontWeight: 500, color: C.g400 }}>{p?.unidad}</span></strong>,
            <span style={{ color: C.g600, whiteSpace: 'normal' }}>{[pac && `Paciente: ${pac.nombre}`, m.lote && `Lote ${m.lote}`, m.vence && `Vence ${fmtFechaCorta(m.vence)}`, m.notas].filter(Boolean).join(' · ') || '—'}</span>,
            <Button variant="ghost" size="sm" onClick={() => deshacer(m)}>Deshacer</Button>,
          ] }
        })}
      />
    </>
  )
}

// ─── Entry / exit / adjustment / transfer ───
function MovimientoModal({ inv, tipoInicial, onClose, onGuardado }) {
  const sedes = inv.sedes.filter(s => s.activa), productos = inv.productos.filter(p => p.activo)
  const [f, setF] = useState({ tipo: tipoInicial, sede: sedes[0]?.id || '', destino: sedes[1]?.id || '', producto: productos[0]?.id || '', cantidad: '', lote: '', vence: '', notas: '', fecha: hoyISO() })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const prod = productos.find(p => p.id === f.producto)
  const disponible = existencia(inv, f.sede, f.producto)
  const n = Number(f.cantidad)
  const delta = f.tipo === 'entrada' ? n : f.tipo === 'ajuste' ? n - disponible : -n
  const falta = f.tipo !== 'entrada' && f.tipo !== 'ajuste' && n > disponible

  const guardar = async () => {
    if (!f.sede || !f.producto) { toast.error('Elija la sede y el producto'); return }
    if (f.cantidad === '' || isNaN(n) || n < 0 || (f.tipo !== 'ajuste' && n === 0)) { toast.error('Escriba una cantidad válida'); return }
    if (falta) { toast.error(`Solo hay ${fmtCant(disponible)} en esa sede`); return }
    if (f.tipo === 'traslado' && f.destino === f.sede) { toast.error('Elija una sede de destino distinta'); return }
    if (f.tipo === 'ajuste' && delta === 0) { toast.error('La cantidad contada es igual a la existencia'); return }
    const comun = { producto_id: f.producto, fecha: f.fecha, notas: f.notas.trim() || null }
    let filas
    if (f.tipo === 'traslado') {
      const traslado_id = crypto.randomUUID()
      filas = [{ ...comun, tipo: 'traslado', sede_id: f.sede, delta: -n, traslado_id }, { ...comun, tipo: 'traslado', sede_id: f.destino, delta: n, traslado_id }]
    } else {
      filas = [{ ...comun, tipo: f.tipo, sede_id: f.sede, delta, lote: f.tipo === 'entrada' ? f.lote.trim() || null : null, vence: f.tipo === 'entrada' ? f.vence || null : null }]
    }
    setBusy(true)
    const { error } = await supabase.from('inventario_movimientos').insert(filas) // one request = all rows or none
    setBusy(false)
    if (error) { toast.error(errorInventario(error)); return }
    toast.success('Inventario actualizado')
    onGuardado()
  }

  const opcionesTipo = [['entrada', 'Entrada (compra o donación)'], ['salida', 'Salida / merma (vencido, dañado…)'], ['ajuste', 'Ajuste por conteo'], ...(sedes.length > 1 ? [['traslado', 'Traslado entre sedes']] : [])]
  return (
    <Modal title="Movimiento de inventario" subtitle={TIPOS_MOVIMIENTO[f.tipo].label} onClose={onClose}>
      <Grid min={200}>
        <Campo label="Tipo" full><Select value={f.tipo} onChange={set('tipo')}>{opcionesTipo.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Campo>
        <Campo label={f.tipo === 'traslado' ? 'Sede de origen' : 'Sede'}><Select value={f.sede} onChange={set('sede')}>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>
        {f.tipo === 'traslado' && <Campo label="Sede de destino"><Select value={f.destino} onChange={set('destino')}>{sedes.filter(s => s.id !== f.sede).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>}
        <Campo label="Producto" full><Select value={f.producto} onChange={set('producto')}>{productos.map(p => <option key={p.id} value={p.id}>{p.nombre} — hay {fmtCant(existencia(inv, f.sede, p.id))} {p.unidad}</option>)}</Select></Campo>
        <Campo label={f.tipo === 'ajuste' ? `Cantidad contada (${prod?.unidad || ''})` : `Cantidad (${prod?.unidad || ''})`}
          ayuda={f.tipo === 'ajuste' ? `El sistema tiene ${fmtCant(disponible)}; se ajusta a lo que usted contó` : f.tipo !== 'entrada' ? `Disponible en esta sede: ${fmtCant(disponible)}` : undefined}>
          <Input type="number" min="0" step="any" value={f.cantidad} onChange={set('cantidad')} />
        </Campo>
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
        {f.tipo === 'entrada' && <>
          <Campo label="Lote (opcional)"><Input value={f.lote} onChange={set('lote')} /></Campo>
          <Campo label="Vence (opcional)"><Input type="date" value={f.vence} onChange={set('vence')} /></Campo>
        </>}
        <Campo label="Notas (opcional)" full><Textarea value={f.notas} onChange={set('notas')} rows={2} placeholder={f.tipo === 'entrada' ? 'Proveedor, factura…' : 'Motivo'} /></Campo>
      </Grid>
      {falta && <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: C.redLight, color: C.red, fontSize: 13.5, fontWeight: 600 }}>No hay suficiente existencia: en esta sede solo hay {fmtCant(disponible)}.</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy || falta}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

// ─── Products catalogue ───
function Productos({ inv, onCambio }) {
  const [editando, setEditando] = useState(undefined)
  const [verInactivos, setVerInactivos] = useState(false)
  const lista = inv.productos.filter(p => verInactivos || p.activo)
  return (
    <Card title={`Productos (${inv.productos.filter(p => p.activo).length})`} right={<>
      {inv.productos.some(p => !p.activo) && <label style={{ fontSize: 13, color: C.g500, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />Ver desactivados</label>}
      <Button size="sm" icon="mas" onClick={() => setEditando(null)}>Agregar producto</Button>
    </>}>
      {lista.length === 0 ? <div style={{ color: C.g400 }}>Aún no hay productos</div> : (
        <Tabla
          columnas={['Producto', 'Categoría', 'Unidad', 'Mínimo por sede', 'Costo', 'Existencia total', '']}
          filas={lista.map(p => ({ key: p.id, celdas: [
            <span style={{ fontWeight: 700, color: p.activo ? C.black : C.g400 }}>{p.nombre}{!p.activo && ' (desactivado)'}</span>, p.categoria || '—', p.unidad,
            Number(p.stock_minimo) ? fmtCant(p.stock_minimo) : '—', p.costo != null ? fmtQ(p.costo) : '—', <strong>{fmtCant(totalProducto(inv, p.id))}</strong>,
            <Button variant="ghost" size="sm" icon="editar" onClick={() => setEditando(p)}>Editar</Button>,
          ] }))}
        />
      )}
      {editando !== undefined && <ProductoModal producto={editando} onClose={() => setEditando(undefined)} onGuardado={() => { setEditando(undefined); onCambio() }} />}
    </Card>
  )
}

function ProductoModal({ producto, onClose, onGuardado }) {
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
        <Campo label="Nombre *" full><Input value={f.nombre} onChange={set('nombre')} placeholder="Ej. Toxina botulínica 100U, Ácido hialurónico 1 ml…" /></Campo>
        <Campo label="Categoría (opcional)"><Input value={f.categoria} onChange={set('categoria')} placeholder="Ej. Inyectables, Insumos" /></Campo>
        <Campo label="Unidad"><Input value={f.unidad} onChange={set('unidad')} list="unidades" /><datalist id="unidades">{UNIDADES.map(u => <option key={u} value={u} />)}</datalist></Campo>
        <Campo label="Existencia mínima por sede" ayuda="Avisa cuando una sede queda por debajo"><Input type="number" min="0" step="any" value={f.stock_minimo} onChange={set('stock_minimo')} placeholder="0" /></Campo>
        <Campo label="Costo por unidad (Q, opcional)"><Input type="number" min="0" step="0.01" value={f.costo} onChange={set('costo')} /></Campo>
        {producto && <Campo full><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={f.activo} onChange={e => set('activo')(e.target.checked)} />Producto activo (desactívelo si ya no lo usa; su historial se conserva)</label></Campo>}
      </Grid>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

// ─── Locations (city / departmental) ───
function Sedes({ inv, onCambio }) {
  const [editando, setEditando] = useState(undefined)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, fontSize: 13.5, color: C.g500, minWidth: 220 }}>Puede tener varias sedes en la misma ciudad con distinto nombre, y sedes departamentales. Cada una lleva su propio inventario.</div>
        <Button icon="mas" onClick={() => setEditando(null)}>Nueva sede</Button>
      </div>
      {inv.sedes.length === 0 ? <PrimerPaso icono="sede" titulo="Aún no hay sedes" texto="Ej. «Zona 10» y «Zona 15» (sedes ciudad) y «Quetzaltenango» (sede departamental)." boton="Crear sede" onClick={() => setEditando(null)} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {inv.sedes.map(s => {
            const items = (inv.existencias || []).filter(e => e.sede_id === s.id && Number(e.cantidad) > 0).length
            return (
              <Card key={s.id} style={{ opacity: s.activa ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700 }}>{s.nombre}</div>
                    <div style={{ fontSize: 13, color: C.g500, marginTop: 2 }}>{lugarSede(s) || 'Sin ubicación'}</div>
                  </div>
                  <Badge color={s.tipo === 'departamental' ? C.blue : C.purple} bg={s.tipo === 'departamental' ? C.blueLight : C.purpleLight}>{s.tipo === 'departamental' ? 'Departamental' : 'Ciudad'}</Badge>
                </div>
                {s.direccion && <div style={{ fontSize: 13, color: C.g600, marginTop: 10 }}>{s.direccion}</div>}
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 14, gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, color: C.g500 }}>{s.activa ? `${items} ${items === 1 ? 'producto' : 'productos'} con existencia` : 'Sede desactivada'}</span>
                  <Button variant="ghost" size="sm" icon="editar" onClick={() => setEditando(s)}>Editar</Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {editando !== undefined && <SedeModal sede={editando} onClose={() => setEditando(undefined)} onGuardado={() => { setEditando(undefined); onCambio() }} />}
    </>
  )
}

function SedeModal({ sede, onClose, onGuardado }) {
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
        <Campo label="Ciudad o municipio"><Input value={f.municipio} onChange={set('municipio')} placeholder="Ej. Guatemala, Mixco, Xela" /></Campo>
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

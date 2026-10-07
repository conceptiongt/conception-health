import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C, SERIF, SHADOW } from '../lib/theme'
import { TIPOS_MOVIMIENTO } from '../lib/constantes'
import { fmtQ, fmtFechaCorta } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { useInventario, existencia, bajoMinimo, estadoProducto, valorInventario, porReabastecer, porVencer, fmtCant, errorInventario } from '../hooks/useInventario'
import { Encabezado, Tabla, Card, Badge, Vacio, Cargando, Pestanas } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Icon } from '../components/ui/Icon'
import { filtroStyle } from '../components/ui/Campos'
import { Exportar } from '../components/Documento'
import { toast } from '../components/ui/Toast'
import { OPERACIONES, MovimientoModal, ProductoModal, SedeModal } from '../components/inventario/Formularios'
import { categoriasDe } from '../components/inventario/Selectores'
import { Compras, OrdenModal, OrdenDetalle, Proveedores, ProveedorModal, enCamino, numeroOC } from '../components/inventario/Compras'

export const lugarSede = (s) => [s.municipio, s.departamento].filter(Boolean).join(', ')
const mesActual = () => new Date().toISOString().slice(0, 7)

export function Inventario() {
  const { inv, recargar: recargarInv } = useInventario()
  const [movs, setMovs] = useState(null)
  const [tab, setTab] = useState('resumen')
  const [sedeFiltro, setSedeFiltro] = useState('')
  const [mov, setMov] = useState(null)          // movement form: { tipo, sede?, producto?, cantidad? }
  const [producto, setProducto] = useState(undefined) // product form: undefined closed, null new, object edit
  const [sede, setSede] = useState(undefined)
  const [detalle, setDetalle] = useState(null)  // product detail
  const [compras, setCompras] = useState(null)  // { ordenes, lineas }
  const [orden, setOrden] = useState(undefined) // order form: undefined closed, { orden?, inicial? }
  const [ordenAbierta, setOrdenAbierta] = useState(null)
  const [proveedor, setProveedor] = useState(undefined) // supplier form, with optional callback

  const cargarMovs = useCallback(async () => {
    const { data } = await supabase.from('inventario_movimientos').select('*').order('created_at', { ascending: false }).limit(1000)
    setMovs(data || [])
  }, [])
  const cargarCompras = useCallback(async () => {
    const [o, l] = await Promise.all([
      supabase.from('ordenes_compra').select('*').order('numero', { ascending: false }),
      supabase.from('ordenes_compra_lineas').select('*'),
    ])
    setCompras({ ordenes: o.data || [], lineas: l.data || [] })
  }, [])
  useEffect(() => { cargarMovs(); cargarCompras() }, [cargarMovs, cargarCompras])
  const recargar = () => { recargarInv(); cargarMovs(); cargarCompras() }

  if (!inv || !movs || !compras) return <Cargando />
  if (inv.error) return <div style={{ color: C.red, padding: 30 }}>No se pudo cargar el inventario: {inv.error}</div>

  const sedes = inv.sedes.filter(s => s.activa)
  const productos = inv.productos.filter(p => p.activo)
  const reabastecer = porReabastecer(inv, sedes, productos, enCamino(compras.ordenes, compras.lineas))
  const abiertas = compras.ordenes.filter(o => ['borrador', 'enviada', 'confirmada', 'parcial'].includes(o.estado)).length
  const vencen = porVencer(inv, movs)
  const listo = sedes.length > 0 && productos.length > 0
  const operar = (inicial) => {
    if (!listo) { toast.error(!sedes.length ? 'Primero cree una sede' : 'Primero agregue un producto'); return }
    setMov(inicial)
  }
  const verSede = (id) => { setSedeFiltro(id); setTab('productos') }
  const nuevaOrden = (inicial = {}) => {
    if (!sedes.length || !productos.length) { toast.error(!sedes.length ? 'Primero cree una sede' : 'Primero agregue un producto'); return }
    setOrden({ inicial })
  }
  // From restocking: one draft order per location and usual supplier, like Odoo's replenishment
  const crearOrdenes = async (filas) => {
    const grupos = {}
    for (const f of filas) {
      const k = f.sede.id + '|' + (f.producto.proveedor_id || '')
      ;(grupos[k] ||= { sede: f.sede.id, proveedor: f.producto.proveedor_id || null, lineas: [] }).lineas.push(f)
    }
    let creadas = 0
    for (const g of Object.values(grupos)) {
      const { data, error } = await supabase.from('ordenes_compra').insert({ sede_id: g.sede, proveedor_id: g.proveedor }).select().single()
      if (error) continue
      const { error: e2 } = await supabase.from('ordenes_compra_lineas').insert(g.lineas.map(f => ({ orden_id: data.id, producto_id: f.producto.id, cantidad: f.sugerido, costo_unitario: Number(f.producto.costo) || 0 })))
      if (!e2) creadas++
    }
    if (!creadas) { toast.error('No se pudieron crear las órdenes'); return }
    toast.success(creadas === 1 ? 'Se creó 1 orden de compra en borrador' : `Se crearon ${creadas} órdenes de compra en borrador (una por sede y proveedor)`)
    await cargarCompras(); setTab('compras')
  }

  const TABS = [
    { value: 'resumen', label: 'Resumen', icono: 'inicio' },
    { value: 'productos', label: 'Productos', icono: 'caja' },
    { value: 'reabastecer', label: `Reabastecer${reabastecer.length ? ` (${reabastecer.length})` : ''}`, icono: 'alerta' },
    { value: 'compras', label: `Compras${abiertas ? ` (${abiertas})` : ''}`, icono: 'cartera' },
    { value: 'proveedores', label: 'Proveedores', icono: 'usuarios' },
    { value: 'sedes', label: 'Sedes', icono: 'sede' },
    { value: 'historial', label: 'Historial', icono: 'actividad' },
  ]

  return (
    <>
      <Encabezado titulo="Inventario" subtitulo={`${sedes.length} ${sedes.length === 1 ? 'sede' : 'sedes'} · ${productos.length} ${productos.length === 1 ? 'producto' : 'productos'} · vale ${fmtQ(valorInventario(inv))}`}>
        <Button variant="ghost" icon="sede" onClick={() => setSede(null)}>Nueva sede</Button>
        <Button variant="ghost" icon="mas" onClick={() => setProducto(null)}>Nuevo producto</Button>
        <Button icon="cartera" onClick={() => nuevaOrden()}>Nueva compra</Button>
      </Encabezado>

      {/* Everyday operations, like a warehouse dashboard */}
      <div className="inv-ops" style={{ marginBottom: 22 }}>
        <button className="op-tile" onClick={() => compras.ordenes.length ? setTab('compras') : nuevaOrden()} style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '20px 22px', borderRadius: 24, border: 'none', background: C.lavender, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}>
          <div style={{ width: 46, height: 46, borderRadius: 23, background: '#fff', color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="cartera" size={21} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 500, color: C.black, letterSpacing: '-0.015em' }}>Comprar</div>
            <div style={{ fontSize: 12.5, color: C.g600, lineHeight: 1.35 }}>Órdenes a proveedores</div>
            {abiertas > 0 && <div style={{ fontSize: 11.5, fontWeight: 600, color: C.purple, marginTop: 3 }}>{abiertas} abiertas</div>}
          </div>
        </button>
        {OPERACIONES.map(o => {
          const n = movs.filter(m => m.tipo === o.tipo && m.fecha?.startsWith(mesActual()) && (o.tipo !== 'traslado' || m.delta > 0)).length
          const off = o.tipo === 'traslado' && sedes.length < 2
          return (
            <button key={o.tipo} className="op-tile" onClick={() => off ? toast.error('Necesita al menos dos sedes para trasladar') : operar({ tipo: o.tipo })} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '20px 22px', borderRadius: 24, border: 'none', background: o.superficie,
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', opacity: off ? 0.55 : 1,
            }}>
              <div style={{ width: 46, height: 46, borderRadius: 23, background: '#fff', color: o.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={o.icono} size={21} /></div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 500, color: C.black, letterSpacing: '-0.015em' }}>{o.titulo}</div>
                <div style={{ fontSize: 12.5, color: C.g600, lineHeight: 1.35 }}>{o.texto}</div>
                {n > 0 && <div style={{ fontSize: 11.5, fontWeight: 700, color: o.color, marginTop: 3 }}>{n} este mes</div>}
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ marginBottom: 18 }}><Pestanas opciones={TABS} valor={tab} onChange={setTab} /></div>

      {tab === 'resumen' && (listo
        ? <Resumen inv={inv} movs={movs} sedes={sedes} productos={productos} reabastecer={reabastecer} vencen={vencen} operar={operar} verSede={verSede} irA={setTab} abrir={setDetalle} />
        : <Configurar sedes={sedes} productos={productos} onSede={() => setSede(null)} onProducto={() => setProducto(null)} />)}
      {tab === 'productos' && <Productos inv={inv} sedes={sedes} sedeFiltro={sedeFiltro} setSedeFiltro={setSedeFiltro} abrir={setDetalle} onNuevo={() => setProducto(null)} />}
      {tab === 'reabastecer' && <Reabastecer filas={reabastecer} vencen={vencen} inv={inv} operar={operar} crearOrdenes={crearOrdenes} />}
      {tab === 'compras' && <Compras inv={inv} compras={compras} onNueva={nuevaOrden} onAbrir={(o) => setOrdenAbierta(o.id)} />}
      {tab === 'proveedores' && <Proveedores inv={inv} compras={compras} onEditar={(p) => setProveedor({ p })} onNuevaOrden={nuevaOrden} />}
      {tab === 'sedes' && <Sedes inv={inv} verSede={verSede} onEditar={setSede} />}
      {tab === 'historial' && <Historial inv={inv} movs={movs} onCambio={recargar} />}

      {detalle && <ProductoDetalle inv={inv} movs={movs} sedes={sedes} producto={inv.productos.find(p => p.id === detalle.id) || detalle}
        onClose={() => setDetalle(null)} operar={(i) => { setDetalle(null); operar(i) }} editar={(p) => { setDetalle(null); setProducto(p) }} />}
      {mov && <MovimientoModal inv={inv} inicial={mov} onClose={() => setMov(null)} onGuardado={() => { setMov(null); recargar() }} />}
      {orden !== undefined && <OrdenModal inv={inv} orden={orden.orden} lineasIniciales={orden.orden ? compras.lineas.filter(l => l.orden_id === orden.orden.id) : []} inicial={orden.inicial}
        onNuevoProveedor={(cb) => setProveedor({ p: null, cb })}
        onClose={() => setOrden(undefined)} onGuardado={async (id) => { setOrden(undefined); await cargarCompras(); setTab('compras'); setOrdenAbierta(id) }} />}
      {ordenAbierta && compras.ordenes.find(o => o.id === ordenAbierta) && <OrdenDetalle inv={inv} orden={compras.ordenes.find(o => o.id === ordenAbierta)} lineas={compras.lineas.filter(l => l.orden_id === ordenAbierta)}
        onClose={() => setOrdenAbierta(null)} onCambio={recargar} onEditar={(o) => { setOrdenAbierta(null); setOrden({ orden: o }) }} />}
      {proveedor !== undefined && <ProveedorModal proveedor={proveedor.p} onClose={() => setProveedor(undefined)}
        onGuardado={(data) => { const cb = proveedor.cb; setProveedor(undefined); recargarInv(); cb?.(data.id) }} />}
      {producto !== undefined && <ProductoModal producto={producto} categorias={categoriasDe(inv.productos)} proveedores={inv.proveedores} onClose={() => setProducto(undefined)} onGuardado={() => { setProducto(undefined); recargar() }} />}
      {sede !== undefined && <SedeModal sede={sede} onClose={() => setSede(undefined)} onGuardado={() => { setSede(undefined); recargar() }} />}
    </>
  )
}

// ─── First use: three clear steps ───
function Configurar({ sedes, productos, onSede, onProducto }) {
  const pasos = [
    { hecho: sedes.length > 0, titulo: 'Cree sus sedes', texto: 'De ciudad (ej. «Zona 10», «Zona 15») o departamentales (ej. «Quetzaltenango»). Cada una lleva su propio inventario.', boton: 'Crear sede', accion: onSede },
    { hecho: productos.length > 0, titulo: 'Agregue sus productos', texto: 'Insumos, medicamentos o materiales que usa con sus pacientes, con su mínimo y costo.', boton: 'Agregar producto', accion: onProducto },
    { hecho: false, titulo: 'Registre lo que tiene', texto: 'Con «Recibir» anote lo que hay en cada sede. Desde ahí, cada uso en un paciente se descuenta solo.' },
  ]
  const actual = pasos.findIndex(p => !p.hecho)
  return (
    <Card title="Configure su inventario en 3 pasos">
      {pasos.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 0', borderTop: i ? `1px solid ${C.g100}` : 'none', alignItems: 'center', opacity: i > actual ? 0.5 : 1 }}>
          <div style={{ width: 34, height: 34, borderRadius: 17, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600,
            background: p.hecho ? C.greenLight : i === actual ? C.purple : C.g100, color: p.hecho ? C.green : i === actual ? '#fff' : C.g400 }}>
            {p.hecho ? <Icon name="check" size={16} stroke={2.6} /> : i + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{p.titulo}</div>
            <div style={{ fontSize: 13.5, color: C.g500 }}>{p.texto}</div>
          </div>
          {i === actual && p.accion && <Button icon="mas" onClick={p.accion}>{p.boton}</Button>}
        </div>
      ))}
    </Card>
  )
}

function Kpi({ icono, label, valor, sub, color = C.purple, bg = C.purpleMid, onClick }) {
  return (
    <div onClick={onClick} className={onClick ? 'op-tile' : undefined} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: '16px 18px', boxShadow: SHADOW, cursor: onClick ? 'pointer' : 'default', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.g500, fontSize: 13, fontWeight: 600 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: bg, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icono} size={15} /></span>{label}
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, marginTop: 8, letterSpacing: '-0.02em' }}>{valor}</div>
      {sub && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ─── Overview ───
function Resumen({ inv, movs, sedes, productos, reabastecer, vencen, operar, verSede, irA, abrir }) {
  const { pacientes } = useDatos()
  const conExistencia = productos.filter(p => sedes.some(s => existencia(inv, s.id, p.id) > 0)).length
  const usosMes = movs.filter(m => m.tipo === 'uso' && m.fecha?.startsWith(mesActual()))
  const atencion = [
    ...vencen.slice(0, 4).map(v => ({ key: 'v' + v.id, tipo: 'vence', ...v })),
    ...reabastecer.slice(0, 6).map(r => ({ key: 'r' + r.sede.id + r.producto.id, tipo: 'bajo', ...r })),
  ]
  const nombre = (id) => inv.productos.find(p => p.id === id)
  const sedeDe = (id) => inv.sedes.find(s => s.id === id)
  return (
    <>
      <div className="inv-cuatro" style={{ marginBottom: 16 }}>
        <Kpi icono="cartera" label="Valor del inventario" valor={fmtQ(valorInventario(inv))} sub="Según el costo de cada producto" />
        <Kpi icono="caja" label="Con existencia" valor={`${conExistencia} de ${productos.length}`} sub="productos" color={C.green} bg={C.greenLight} onClick={() => irA('productos')} />
        <Kpi icono="alerta" label="Por reabastecer" valor={reabastecer.length} sub={reabastecer.length ? 'Bajo el mínimo' : 'Todo en orden'} color={reabastecer.length ? C.amber : C.green} bg={reabastecer.length ? C.amberLight : C.greenLight} onClick={() => irA('reabastecer')} />
        <Kpi icono="reloj" label="Por vencer" valor={vencen.length} sub="En los próximos 60 días" color={vencen.length ? C.red : C.green} bg={vencen.length ? C.redLight : C.greenLight} onClick={() => irA('reabastecer')} />
      </div>

      <div className="inv-dos">
        <Card title="Necesita atención" right={reabastecer.length > 6 && <Button variant="ghost" size="sm" onClick={() => irA('reabastecer')}>Ver todo</Button>}>
          {atencion.length === 0 ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: C.greenLight, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={20} stroke={2.4} /></div>
              <div><div style={{ fontWeight: 700 }}>Todo en orden</div><div style={{ fontSize: 13.5, color: C.g500 }}>Ninguna sede está bajo el mínimo y nada vence pronto.</div></div>
            </div>
          ) : atencion.map((a, i) => (
            <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? `1px solid ${C.g100}` : 'none' }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: a.tipo === 'vence' ? C.red : C.amber }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {a.tipo === 'bajo' ? <>
                  <div style={{ fontWeight: 700 }}>{a.producto.nombre}</div>
                  <div style={{ fontSize: 13, color: C.g500 }}>{a.sede.nombre}: quedan <strong style={{ color: a.hay ? C.amber : C.red }}>{fmtCant(a.hay)}</strong> de un mínimo de {fmtCant(a.min)} {a.producto.unidad}</div>
                </> : <>
                  <div style={{ fontWeight: 700 }}>{nombre(a.producto_id)?.nombre}{a.lote ? ` · lote ${a.lote}` : ''}</div>
                  <div style={{ fontSize: 13, color: C.g500 }}>{sedeDe(a.sede_id)?.nombre}: <strong style={{ color: C.red }}>{a.dias < 0 ? `venció hace ${-a.dias} días` : a.dias === 0 ? 'vence hoy' : `vence en ${a.dias} días`}</strong> ({fmtFechaCorta(a.vence)})</div>
                </>}
              </div>
              {a.tipo === 'bajo'
                ? <Button size="sm" variant="ghost" icon="descargar" onClick={() => operar({ tipo: 'entrada', sede: a.sede.id, producto: a.producto.id, cantidad: a.sugerido })}>Recibir</Button>
                : <Button size="sm" variant="ghost" icon="subir" onClick={() => operar({ tipo: 'salida', sede: a.sede_id, producto: a.producto_id })}>Sacar</Button>}
            </div>
          ))}
        </Card>

        <Card title="Por sede">
          {sedes.map((s, i) => {
            const items = productos.filter(p => existencia(inv, s.id, p.id) > 0).length
            const bajos = productos.filter(p => bajoMinimo(inv, s.id, p)).length
            return (
              <button key={s.id} onClick={() => verSede(s.id)} className="fila" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '11px 6px', border: 'none', borderTop: i ? `1px solid ${C.g100}` : 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', borderRadius: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: s.tipo === 'departamental' ? C.blueLight : C.purpleMid, color: s.tipo === 'departamental' ? C.blue : C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="sede" size={17} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.nombre}</div>
                  <div style={{ fontSize: 12.5, color: C.g500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{items} {items === 1 ? 'producto' : 'productos'}{bajos ? <span style={{ color: C.amber, fontWeight: 600 }}> · {bajos} por reabastecer</span> : ''}</div>
                </div>
                <div style={{ fontWeight: 700, color: C.black, whiteSpace: 'nowrap' }}>{fmtQ(valorInventario(inv, s.id))}</div>
                <Icon name="flecha" size={15} style={{ color: C.g300 }} />
              </button>
            )
          })}
        </Card>
      </div>

      <Card title="Últimos movimientos" style={{ marginTop: 16 }} right={<Button variant="ghost" size="sm" onClick={() => irA('historial')}>Ver historial</Button>}>
        {movs.length === 0 ? <div style={{ color: C.g400 }}>Aún no hay movimientos. Empiece con «Recibir».</div>
          : movs.filter(m => m.tipo !== 'traslado' || m.delta > 0).slice(0, 6).map((m, i) => {
            const t = TIPOS_MOVIMIENTO[m.tipo], p = nombre(m.producto_id), pac = pacientes.find(x => x.id === m.paciente_id)
            return (
              <div key={m.id} onClick={() => p && abrir(p)} className="fila" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: i ? `1px solid ${C.g100}` : 'none', cursor: 'pointer', borderRadius: 8 }}>
                <Badge color={t.color} bg={t.bg}>{t.label}</Badge>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong>{p?.nombre}</strong> <span style={{ color: C.g500 }}>· {m.tipo === 'traslado' ? `hacia ${sedeDe(m.sede_id)?.nombre}` : sedeDe(m.sede_id)?.nombre}{pac ? ` · ${pac.nombre}` : ''}</span>
                </div>
                <strong style={{ color: m.delta > 0 ? C.green : C.red, whiteSpace: 'nowrap' }}>{m.delta > 0 ? '+' : '−'}{fmtCant(Math.abs(m.delta))}</strong>
                <span style={{ fontSize: 12.5, color: C.g400, whiteSpace: 'nowrap', width: 70, textAlign: 'right' }}>{fmtFechaCorta(m.fecha)}</span>
              </div>
            )
          })}
        {usosMes.length > 0 && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 10 }}>Este mes se descargaron productos en {new Set(usosMes.map(u => u.paciente_id)).size} pacientes.</div>}
      </Card>
    </>
  )
}

// ─── Products: cards (or list) with status and stock per location ───
function Productos({ inv, sedes, sedeFiltro, setSedeFiltro, abrir, onNuevo }) {
  const { clinica } = useDatos()
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState('')
  const [categoria, setCategoria] = useState('')
  const [vista, setVista] = useState(() => { try { return localStorage.getItem('inv_vista') || 'tarjetas' } catch { return 'tarjetas' } })
  const cambiarVista = (v) => { setVista(v); try { localStorage.setItem('inv_vista', v) } catch { /* private mode */ } }
  const visibles = sedeFiltro ? sedes.filter(s => s.id === sedeFiltro) : sedes
  const categorias = [...new Set(inv.productos.filter(p => p.activo && p.categoria).map(p => p.categoria))].sort()
  const q = buscar.trim().toLowerCase()
  const lista = inv.productos
    .filter(p => p.activo || estado === 'inactivo')
    .map(p => ({ p, e: estadoProducto(inv, visibles, p) }))
    .filter(({ p, e }) => (!q || p.nombre.toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q))
      && (!categoria || p.categoria === categoria)
      && (estado === 'inactivo' ? !p.activo : !estado || e.clave === estado))
  const conteo = (clave) => inv.productos.filter(p => p.activo && estadoProducto(inv, visibles, p).clave === clave).length

  const preparar = () => ({
    titulo: 'Inventario', subtitulo: sedeFiltro ? visibles[0]?.nombre : 'Todas las sedes',
    secciones: [{ tabla: { headers: ['Producto', 'Unidad', ...visibles.map(s => s.nombre), ...(visibles.length > 1 ? ['Total'] : []), 'Mínimo', 'Estado'],
      filas: lista.map(({ p, e }) => [p.nombre, p.unidad, ...visibles.map(s => fmtCant(existencia(inv, s.id, p.id))), ...(visibles.length > 1 ? [fmtCant(e.total)] : []), fmtCant(p.stock_minimo), e.label]) } }],
    excel: { archivo: 'inventario', hojas: [{ nombre: 'Existencias', columnas: [
      { header: 'Producto', key: 'p', width: 30 }, { header: 'Categoría', key: 'c', width: 16 }, { header: 'Unidad', key: 'u', width: 10 },
      ...visibles.map((s, i) => ({ header: s.nombre, key: 's' + i, width: 14 })), { header: 'Total', key: 't', width: 10 },
      { header: 'Mínimo por sede', key: 'm', width: 14 }, { header: 'Costo', key: 'co', width: 12, moneda: true }, { header: 'Valor', key: 'v', width: 14, moneda: true }, { header: 'Estado', key: 'e', width: 14 },
    ], filas: lista.map(({ p, e }) => ({ p: p.nombre, c: p.categoria, u: p.unidad, ...Object.fromEntries(visibles.map((s, i) => ['s' + i, existencia(inv, s.id, p.id)])),
      t: e.total, m: Number(p.stock_minimo), co: p.costo != null ? Number(p.costo) : null, v: e.total * (Number(p.costo) || 0), e: e.label })) }] },
  })

  const chip = (valor, label, n) => (
    <button key={valor} onClick={() => setEstado(valor)} style={{ padding: '7px 13px', borderRadius: 20, border: `1px solid ${estado === valor ? C.black : C.g200}`, background: estado === valor ? C.black : '#fff', color: estado === valor ? '#fff' : C.g600, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
      {label}{n != null && <span style={{ opacity: 0.6, marginLeft: 5 }}>{n}</span>}
    </button>
  )
  const sel = filtroStyle
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Icon name="buscar" size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.g400 }} />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto o categoría…" style={{ ...sel, width: '100%', paddingLeft: 36 }} />
        </div>
        <select value={sedeFiltro} onChange={e => setSedeFiltro(e.target.value)} style={sel}><option value="">Todas las sedes</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
        {categorias.length > 0 && <select value={categoria} onChange={e => setCategoria(e.target.value)} style={sel}><option value="">Toda categoría</option>{categorias.map(c => <option key={c}>{c}</option>)}</select>}
        <div style={{ display: 'inline-flex', border: `1px solid ${C.g200}`, borderRadius: 10, overflow: 'hidden' }}>
          {[['tarjetas', 'Tarjetas'], ['lista', 'Lista']].map(([v, l]) => <button key={v} onClick={() => cambiarVista(v)} style={{ padding: '9px 12px', border: 'none', background: vista === v ? C.g100 : '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: vista === v ? C.black : C.g500, fontFamily: 'inherit' }}>{l}</button>)}
        </div>
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {chip('', 'Todos')}{chip('ok', 'En existencia', conteo('ok'))}{chip('bajo', 'Reabastecer', conteo('bajo'))}{chip('agotado', 'Agotados', conteo('agotado'))}
        {inv.productos.some(p => !p.activo) && chip('inactivo', 'Desactivados')}
      </div>

      {inv.productos.length === 0 ? <Card><Vacio icono="caja" titulo="Aún no hay productos" texto="Agregue los insumos y medicamentos que usa con sus pacientes."><Button icon="mas" onClick={onNuevo}>Nuevo producto</Button></Vacio></Card>
        : lista.length === 0 ? <Card><div style={{ color: C.g400, textAlign: 'center', padding: 20 }}>Ningún producto coincide</div></Card>
        : vista === 'lista' ? (
          <Tabla columnas={['Producto', ...visibles.map(s => s.nombre), ...(visibles.length > 1 ? ['Total'] : []), 'Estado']} onFila={(f) => abrir(f.p)}
            filas={lista.map(({ p, e }) => ({ key: p.id, p, celdas: [
              <div><strong>{p.nombre}</strong><div style={{ fontSize: 12, color: C.g400 }}>{[p.categoria, p.unidad].filter(Boolean).join(' · ')}</div></div>,
              ...visibles.map(s => { const n = existencia(inv, s.id, p.id); return <span style={{ fontWeight: 700, color: n === 0 ? C.g300 : bajoMinimo(inv, s.id, p) ? C.amber : C.black }}>{fmtCant(n)}</span> }),
              ...(visibles.length > 1 ? [<strong>{fmtCant(e.total)}</strong>] : []),
              <Badge color={e.color} bg={e.bg}>{e.label}</Badge>,
            ] }))} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 }}>
            {lista.map(({ p, e }) => {
              const filas = visibles.filter(s => inv.existencias.some(x => x.sede_id === s.id && x.producto_id === p.id))
              return (
                <button key={p.id} onClick={() => abrir(p)} className="op-tile" style={{ textAlign: 'left', fontFamily: 'inherit', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: 18, boxShadow: SHADOW, cursor: 'pointer', display: 'flex', flexDirection: 'column', opacity: p.activo ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: C.black, lineHeight: 1.3 }}>{p.nombre}</div>
                      <div style={{ fontSize: 12.5, color: C.g400, marginTop: 2 }}>{p.categoria || 'Sin categoría'}</div>
                    </div>
                    <Badge color={e.color} bg={e.bg}>{e.label}</Badge>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '14px 0 10px' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600, color: C.black, letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtCant(e.total)}</span>
                    <span style={{ fontSize: 13, color: C.g500 }}>{p.unidad}{visibles.length > 1 ? ' en total' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 'auto' }}>
                    {filas.length === 0 ? <div style={{ fontSize: 12.5, color: C.g400 }}>Aún no se ha recibido en {sedeFiltro ? 'esta sede' : 'ninguna sede'}</div> : filas.map(s => {
                      const n = existencia(inv, s.id, p.id), min = Number(p.stock_minimo), bajo = bajoMinimo(inv, s.id, p)
                      const pct = Math.min(100, min > 0 ? (n / (min * 2)) * 100 : n > 0 ? 100 : 0)
                      return (
                        <div key={s.id}>
                          <div style={{ display: 'flex', fontSize: 12.5, marginBottom: 3 }}>
                            <span style={{ flex: 1, color: C.g600 }}>{s.nombre}</span>
                            <strong style={{ color: n === 0 ? C.red : bajo ? C.amber : C.black }}>{fmtCant(n)}</strong>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, background: C.g100, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: n === 0 ? C.red : bajo ? '#E0A526' : C.green }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>
        )}
    </>
  )
}

// ─── One product: stock per location, lots and its history ───
function ProductoDetalle({ inv, movs, sedes, producto: p, onClose, operar, editar }) {
  const { pacientes } = useDatos()
  const e = estadoProducto(inv, sedes, p)
  const suyos = movs.filter(m => m.producto_id === p.id && (m.tipo !== 'traslado' || m.delta > 0))
  const lotes = movs.filter(m => m.producto_id === p.id && m.tipo === 'entrada' && (m.lote || m.vence) && existencia(inv, m.sede_id, p.id) > 0)
  const usado = movs.filter(m => m.producto_id === p.id && m.tipo === 'uso' && m.fecha?.startsWith(mesActual())).reduce((n, m) => n - m.delta, 0)
  const sede = (id) => inv.sedes.find(s => s.id === id)
  const dato = (label, valor) => (
    <div style={{ flex: '1 1 120px', padding: '12px 14px', borderRadius: 14, background: C.g50, border: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 600, marginTop: 2 }}>{valor}</div>
    </div>
  )
  return (
    <Modal title={p.nombre} subtitle={[p.categoria, `se cuenta por ${p.unidad}`].filter(Boolean).join(' · ')} onClose={onClose} maxWidth={760}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Badge color={e.color} bg={e.bg}>{e.label}</Badge>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" icon="editar" onClick={() => editar(p)}>Editar producto</Button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {dato('EN TOTAL', `${fmtCant(e.total)} ${p.unidad}`)}
        {dato('VALOR', p.costo != null ? fmtQ(e.total * Number(p.costo)) : '—')}
        {dato('USADO ESTE MES', fmtCant(usado))}
        {dato('MÍNIMO POR SEDE', Number(p.stock_minimo) ? fmtCant(p.stock_minimo) : '—')}
      </div>

      <div style={{ fontWeight: 700, marginBottom: 8 }}>Por sede</div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
        {sedes.map((s, i) => {
          const n = existencia(inv, s.id, p.id), bajo = bajoMinimo(inv, s.id, p)
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${C.g100}` : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}><strong>{s.nombre}</strong>{bajo && <span style={{ color: C.amber, fontSize: 12.5, fontWeight: 600 }}> · bajo el mínimo</span>}</div>
              <strong style={{ width: 70, textAlign: 'right', color: n === 0 ? C.g300 : bajo ? C.amber : C.black }}>{fmtCant(n)}</strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size="sm" variant="ghost" onClick={() => operar({ tipo: 'entrada', sede: s.id, producto: p.id })}>Recibir</Button>
                <Button size="sm" variant="ghost" onClick={() => operar({ tipo: 'ajuste', sede: s.id, producto: p.id })}>Contar</Button>
              </div>
            </div>
          )
        })}
      </div>

      {lotes.length > 0 && <>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Lotes recibidos</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {lotes.map(l => {
            const dias = l.vence ? Math.round((new Date(l.vence + 'T00:00') - new Date(new Date().toDateString())) / 86400000) : null
            const pronto = dias != null && dias <= 60
            return <span key={l.id} style={{ padding: '6px 11px', borderRadius: 10, fontSize: 12.5, background: pronto ? C.redLight : C.g50, color: pronto ? C.red : C.g600, border: `1px solid ${pronto ? '#F1CFCF' : C.line}` }}>
              {sede(l.sede_id)?.nombre}{l.lote ? ` · lote ${l.lote}` : ''}{l.vence ? ` · vence ${fmtFechaCorta(l.vence)}` : ''}
            </span>
          })}
        </div>
      </>}

      <div style={{ fontWeight: 700, marginBottom: 8 }}>Movimientos recientes</div>
      {suyos.length === 0 ? <div style={{ color: C.g400, fontSize: 13.5 }}>Sin movimientos</div> : suyos.slice(0, 12).map((m, i) => {
        const t = TIPOS_MOVIMIENTO[m.tipo], pac = pacientes.find(x => x.id === m.paciente_id)
        return (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${C.g100}` : 'none', fontSize: 13.5 }}>
            <span style={{ width: 84, flexShrink: 0, color: C.g400 }}>{fmtFechaCorta(m.fecha)}</span>
            <Badge color={t.color} bg={t.bg}>{t.label}</Badge>
            <span style={{ flex: 1, minWidth: 0, color: C.g600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.tipo === 'traslado' ? `hacia ${sede(m.sede_id)?.nombre}` : sede(m.sede_id)?.nombre}{pac ? ` · ${pac.nombre}` : ''}{m.notas ? ` · ${m.notas}` : ''}</span>
            <strong style={{ color: m.delta > 0 ? C.green : C.red }}>{m.delta > 0 ? '+' : '−'}{fmtCant(Math.abs(m.delta))}</strong>
          </div>
        )
      })}
    </Modal>
  )
}

// ─── Restock suggestions and expiring lots ───
function Reabastecer({ filas, vencen, inv, operar, crearOrdenes }) {
  const sede = (id) => inv.sedes.find(s => s.id === id)
  const producto = (id) => inv.productos.find(p => p.id === id)
  const proveedor = (id) => inv.proveedores.find(p => p.id === id)
  const clave = (f) => f.sede.id + '|' + f.producto.id
  const pedibles = filas.filter(f => f.sugerido > 0)
  const [marcadas, setMarcadas] = useState(() => new Set(pedibles.map(clave)))
  const [busy, setBusy] = useState(false)
  const alternar = (k) => setMarcadas(m => { const n = new Set(m); n.has(k) ? n.delete(k) : n.add(k); return n })
  const elegidas = pedibles.filter(f => marcadas.has(clave(f)))
  const crear = async () => { setBusy(true); await crearOrdenes(elegidas); setBusy(false) }
  return (
    <>
      <Card title="Productos por reabastecer" right={pedibles.length > 0 && <Button icon="cartera" onClick={crear} disabled={busy || !elegidas.length}>{busy ? 'Creando…' : `Crear orden de compra (${elegidas.length})`}</Button>}>
        <div style={{ fontSize: 13, color: C.g500, marginTop: -6, marginBottom: 14 }}>Se sugiere pedir lo necesario para llegar al máximo de cada producto (o al doble del mínimo si no tiene máximo), descontando lo que ya viene en camino. Se crea un borrador por sede y proveedor.</div>
        {filas.length === 0
          ? <Vacio icono="check" titulo="Nada por reabastecer" texto="Todas las sedes están sobre el mínimo de cada producto." />
          : <Tabla columnas={['', 'Producto', 'Sede', 'Hay', 'Mín. / máx.', 'En camino', 'Pedir', 'Proveedor', '']}
              filas={filas.map(f => ({ key: clave(f), celdas: [
                f.sugerido > 0 ? <input type="checkbox" checked={marcadas.has(clave(f))} onChange={() => alternar(clave(f))} style={{ width: 16, height: 16, accentColor: C.purple }} /> : '',
                <strong style={{ fontWeight: 500 }}>{f.producto.nombre}</strong>, f.sede.nombre,
                <strong style={{ color: f.hay ? C.amber : C.red, fontWeight: 600 }}>{fmtCant(f.hay)}</strong>, `${fmtCant(f.min)} / ${fmtCant(f.tope)}`,
                f.pedido ? <span style={{ color: C.purple }}>{fmtCant(f.pedido)}</span> : '—',
                f.sugerido > 0 ? <span style={{ fontWeight: 600 }}>{fmtCant(f.sugerido)} {f.producto.unidad}</span> : <span style={{ color: C.g400 }}>Ya pedido</span>,
                proveedor(f.producto.proveedor_id)?.nombre || <span style={{ color: C.g400 }}>—</span>,
                <Button size="sm" variant="ghost" icon="descargar" onClick={() => operar({ tipo: 'entrada', sede: f.sede.id, producto: f.producto.id, cantidad: f.sugerido || undefined })}>Ya llegó</Button>,
              ] }))} />}
      </Card>
      <Card title="Por vencer (próximos 60 días)" style={{ marginTop: 16 }}>
        {vencen.length === 0
          ? <div style={{ color: C.g400 }}>Nada vence pronto. Anote la fecha de vencimiento al «Recibir» para que le avisemos.</div>
          : <Tabla columnas={['Producto', 'Sede', 'Lote', 'Vence', '']}
              filas={vencen.map(v => ({ key: v.id, celdas: [
                <strong>{producto(v.producto_id)?.nombre}</strong>, sede(v.sede_id)?.nombre, v.lote || '—',
                <span style={{ color: C.red, fontWeight: 700 }}>{fmtFechaCorta(v.vence)} · {v.dias < 0 ? 'vencido' : v.dias === 0 ? 'hoy' : `en ${v.dias} días`}</span>,
                <Button size="sm" variant="ghost" icon="subir" onClick={() => operar({ tipo: 'salida', sede: v.sede_id, producto: v.producto_id })}>Sacar</Button>,
              ] }))} />}
      </Card>
    </>
  )
}

// ─── Locations ───
function Sedes({ inv, verSede, onEditar }) {
  if (inv.sedes.length === 0) return <Card><Vacio icono="sede" titulo="Aún no hay sedes" texto="Ej. «Zona 10» y «Zona 15» (de ciudad) y «Quetzaltenango» (departamental)."><Button icon="mas" onClick={() => onEditar(null)}>Nueva sede</Button></Vacio></Card>
  const productos = inv.productos.filter(p => p.activo)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 12 }}>
      {inv.sedes.map(s => {
        const items = productos.filter(p => existencia(inv, s.id, p.id) > 0).length
        const bajos = productos.filter(p => bajoMinimo(inv, s.id, p)).length
        const dep = s.tipo === 'departamental'
        return (
          <Card key={s.id} style={{ opacity: s.activa ? 1 : 0.55, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: dep ? C.blueLight : C.purpleMid, color: dep ? C.blue : C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="sede" size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600 }}>{s.nombre}</div>
                <div style={{ fontSize: 13, color: C.g500 }}>{dep ? 'Sede departamental' : 'Sede ciudad'}{lugarSede(s) ? ` · ${lugarSede(s)}` : ''}</div>
              </div>
            </div>
            {s.direccion && <div style={{ fontSize: 13, color: C.g600, marginTop: 10 }}>{s.direccion}</div>}
            <div style={{ display: 'flex', gap: 18, margin: '16px 0 14px' }}>
              <div><div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.06em' }}>VALOR</div><div style={{ fontWeight: 600, fontSize: 16 }}>{fmtQ(valorInventario(inv, s.id))}</div></div>
              <div><div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.06em' }}>PRODUCTOS</div><div style={{ fontWeight: 600, fontSize: 16 }}>{items}</div></div>
              <div><div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.06em' }}>REABASTECER</div><div style={{ fontWeight: 600, fontSize: 16, color: bajos ? C.amber : C.green }}>{bajos}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
              {s.activa && <Button size="sm" onClick={() => verSede(s.id)} style={{ flex: 1 }}>Ver productos</Button>}
              <Button size="sm" variant="ghost" icon="editar" onClick={() => onEditar(s)}>Editar</Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ─── Full history ───
function Historial({ inv, movs, onCambio }) {
  const { pacientes } = useDatos()
  const [sedeId, setSedeId] = useState('')
  const [tipo, setTipo] = useState('')
  const sede = (id) => inv.sedes.find(s => s.id === id)
  const producto = (id) => inv.productos.find(p => p.id === id)
  const lista = movs.filter(m => (!sedeId || m.sede_id === sedeId) && (!tipo || m.tipo === tipo))

  const deshacer = async (m) => {
    const p = producto(m.producto_id)
    if (!confirm(`¿Deshacer este movimiento (${TIPOS_MOVIMIENTO[m.tipo].label}, ${fmtCant(Math.abs(m.delta))} ${p?.unidad || ''} de ${p?.nombre || 'producto'})? La existencia vuelve a como estaba.`)) return
    const q = supabase.from('inventario_movimientos').delete()
    const { error } = await (m.traslado_id ? q.eq('traslado_id', m.traslado_id) : q.eq('id', m.id))
    if (error) { toast.error(errorInventario(error, 'No se pudo deshacer')); return }
    toast.success('Movimiento deshecho')
    onCambio()
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
          const t = TIPOS_MOVIMIENTO[m.tipo], p = producto(m.producto_id), pac = pacientes.find(x => x.id === m.paciente_id)
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

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C, SHADOW } from '../lib/theme'
import { MESES, METODOS_PAGO } from '../lib/constantes'
import { fmtQ, fmtFechaCorta, hoyISO, totalCobro, saldo } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Card, Indicadores, Tabla, Cargando, Badge } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Campo, Input, Select, Textarea, Grid } from '../components/ui/Campos'
import { toast } from '../components/ui/Toast'
import { Exportar } from '../components/Documento'
import { SelectorPeriodo, RangoFechas, FiltroSede, enPeriodo, textoPeriodo, nombreSede } from '../components/Filtros'
import { sedeCobro } from '../components/Pagos'
import { BotonesSubir, tipoArchivo } from '../components/SubirArchivos'
import { totalOC } from '../components/inventario/Compras'

export const CATEGORIAS_GASTO = ['Renta', 'Sueldos y planilla', 'Insumos médicos', 'Servicios (luz, agua, internet)', 'Publicidad', 'Mantenimiento', 'Impuestos', 'Honorarios', 'Otros']
const hoy = new Date()

// Administrator only: the clinic's money in one place — what came in, what went out, what is still owed
export function Finanzas() {
  const { cobros, citas, pacientes, clinica, sedes } = useDatos()
  const [periodo, setPeriodo] = useState({ mes: hoy.getMonth(), anio: hoy.getFullYear(), desde: '', hasta: '' })
  const [sede, setSede] = useState('')
  const [d, setD] = useState(null) // { abonos, gastos, ordenes, lineas }
  const [gasto, setGasto] = useState(undefined) // undefined: closed, null: new, object: edit

  const cargar = useCallback(async () => {
    const [a, g, o, l] = await Promise.all([
      supabase.from('abonos').select('*'), supabase.from('gastos').select('*').order('fecha', { ascending: false }),
      supabase.from('ordenes_compra').select('*'), supabase.from('ordenes_compra_lineas').select('*'),
    ])
    setD({ abonos: a.data || [], gastos: g.data || [], ordenes: o.data || [], lineas: l.data || [] })
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!d) return <Cargando />

  // everything follows the chosen location
  const cobroPorId = Object.fromEntries(cobros.map(c => [c.id, c]))
  const deSede = (id) => !sede || id === sede
  const cobrosS = cobros.filter(c => deSede(sedeCobro(c, citas, pacientes)))
  const abonosS = d.abonos.filter(a => cobroPorId[a.cobro_id] && deSede(sedeCobro(cobroPorId[a.cobro_id], citas, pacientes)))
  const gastosS = d.gastos.filter(g => deSede(g.sede_id))
  // inventory purchases received count as expenses (by order date)
  const compras = d.ordenes.filter(o => ['recibida', 'parcial'].includes(o.estado) && deSede(o.sede_id))
    .map(o => ({ id: 'oc' + o.id, fecha: o.fecha, categoria: 'Compras de inventario', concepto: `Orden de compra OC-${String(o.numero).padStart(4, '0')}`, monto: totalOC(d.lineas.filter(l => l.orden_id === o.id), o), sede_id: o.sede_id, automatico: true }))
    .filter(g => g.monto > 0)
  const salidas = [...gastosS, ...compras]

  const enP = (iso) => enPeriodo(iso, periodo)
  const ingresos = abonosS.filter(a => enP(a.fecha)).reduce((n, a) => n + Number(a.monto), 0)
  const egresos = salidas.filter(g => enP(g.fecha)).reduce((n, g) => n + Number(g.monto), 0)
  const facturado = cobrosS.filter(c => enP(c.fecha)).reduce((n, c) => n + totalCobro(c), 0)
  const porCobrar = cobrosS.reduce((n, c) => n + saldo(c), 0)
  const utilidad = ingresos - egresos

  // last 12 months up to the chosen one
  const fin = periodo.anio !== '' && periodo.mes !== '' ? new Date(periodo.anio, periodo.mes, 1) : new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const meses = Array.from({ length: 12 }, (_, i) => { const x = new Date(fin.getFullYear(), fin.getMonth() - 11 + i, 1); return { y: x.getFullYear(), m: x.getMonth() } })
  const delMes = (iso, { y, m }) => !!iso && Number(iso.slice(0, 4)) === y && Number(iso.slice(5, 7)) - 1 === m
  const serie = meses.map(mm => ({ ...mm,
    ingresos: abonosS.filter(a => delMes(a.fecha, mm)).reduce((n, a) => n + Number(a.monto), 0),
    gastos: salidas.filter(g => delMes(g.fecha, mm)).reduce((n, g) => n + Number(g.monto), 0) }))
  const tope = Math.max(1, ...serie.flatMap(s => [s.ingresos, s.gastos]))

  // where the money comes from and where it goes
  const porConcepto = Object.entries(abonosS.filter(a => enP(a.fecha)).reduce((acc, a) => { const k = cobroPorId[a.cobro_id]?.concepto || 'Otros'; acc[k] = (acc[k] || 0) + Number(a.monto); return acc }, {})).sort((a, b) => b[1] - a[1])
  const porCategoria = Object.entries(salidas.filter(g => enP(g.fecha)).reduce((acc, g) => { acc[g.categoria] = (acc[g.categoria] || 0) + Number(g.monto); return acc }, {})).sort((a, b) => b[1] - a[1])
  const lista = salidas.filter(g => enP(g.fecha)).sort((a, b) => b.fecha.localeCompare(a.fecha))

  const titulo = `${textoPeriodo(periodo)}${sede ? ` · ${nombreSede(sedes, sede)}` : ''}`
  const preparar = () => ({
    titulo: `Finanzas ${titulo}`, subtitulo: clinica?.nombre,
    secciones: [
      { resumen: [['Ingresos cobrados', fmtQ(ingresos)], ['Gastos', fmtQ(egresos)], ['Utilidad', fmtQ(utilidad)], ['Por cobrar', fmtQ(porCobrar)]] },
      { titulo: 'Ingresos por servicio', tabla: { headers: ['Servicio', 'Cobrado'], filas: porConcepto.map(([k, v]) => [k, fmtQ(v)]) } },
      { titulo: 'Gastos por categoría', tabla: { headers: ['Categoría', 'Monto'], filas: porCategoria.map(([k, v]) => [k, fmtQ(v)]) } },
      { titulo: 'Detalle de gastos', tabla: { headers: ['Fecha', 'Categoría', 'Concepto', 'Sede', 'Monto'], filas: lista.map(g => [fmtFechaCorta(g.fecha), g.categoria, g.concepto, nombreSede(sedes, g.sede_id) || '—', fmtQ(g.monto)]) } },
      { titulo: 'Últimos 12 meses', tabla: { headers: ['Mes', 'Ingresos', 'Gastos', 'Utilidad'], filas: serie.map(s => [`${MESES[s.m]} ${s.y}`, fmtQ(s.ingresos), fmtQ(s.gastos), fmtQ(s.ingresos - s.gastos)]) } },
    ],
    excel: { archivo: 'finanzas', hojas: [
      { nombre: 'Resumen', columnas: [{ header: 'Indicador', key: 'k', width: 28 }, { header: 'Monto', key: 'v', width: 16, moneda: true }],
        filas: [['Ingresos cobrados', ingresos], ['Gastos', egresos], ['Utilidad', utilidad], ['Facturado', facturado], ['Por cobrar (total)', porCobrar]].map(([k, v]) => ({ k, v })) },
      { nombre: 'Gastos', columnas: [{ header: 'Fecha', key: 'f', width: 12 }, { header: 'Categoría', key: 'c', width: 24 }, { header: 'Concepto', key: 'co', width: 36 }, { header: 'Proveedor', key: 'p', width: 22 }, { header: 'Sede', key: 's', width: 16 }, { header: 'Método', key: 'm', width: 14 }, { header: 'Monto', key: 'v', width: 14, moneda: true }],
        filas: lista.map(g => ({ f: g.fecha, c: g.categoria, co: g.concepto, p: g.proveedor, s: nombreSede(sedes, g.sede_id), m: g.metodo, v: Number(g.monto) })) },
      { nombre: '12 meses', columnas: [{ header: 'Mes', key: 'm', width: 16 }, { header: 'Ingresos', key: 'i', width: 14, moneda: true }, { header: 'Gastos', key: 'g', width: 14, moneda: true }, { header: 'Utilidad', key: 'u', width: 14, moneda: true }],
        filas: serie.map(s => ({ m: `${MESES[s.m]} ${s.y}`, i: s.ingresos, g: s.gastos, u: s.ingresos - s.gastos })) },
    ] },
  })

  const barraLista = (items, total, color) => items.length === 0 ? <div style={{ color: C.g400, fontSize: 13.5 }}>Sin movimientos en este período</div> : items.slice(0, 8).map(([k, v]) => (
    <div key={k} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', fontSize: 13.5, marginBottom: 4 }}><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span><strong style={{ fontWeight: 600 }}>{fmtQ(v)}</strong></div>
      <div style={{ height: 7, borderRadius: 4, background: C.g100 }}><div style={{ width: `${total ? (v / total) * 100 : 0}%`, height: '100%', borderRadius: 4, background: color }} /></div>
    </div>
  ))

  return (
    <>
      <Encabezado titulo="Finanzas" subtitulo="Solo usted, como administrador, ve esta sección">
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
        <Button icon="mas" onClick={() => setGasto(null)}>Registrar gasto</Button>
      </Encabezado>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, color: C.g500 }}>Período:</span>
        <SelectorPeriodo valor={periodo} onChange={setPeriodo} todosAnios />
        <RangoFechas valor={periodo} onChange={setPeriodo} />
      </div>
      {sedes.length > 0 && <div style={{ marginBottom: 16 }}><FiltroSede valor={sede} onChange={setSede} /></div>}

      <Indicadores style={{ marginBottom: 16 }} items={[
        { label: 'Ingresos cobrados', valor: fmtQ(ingresos), color: C.green, sub: `Facturado ${fmtQ(facturado)}` },
        { label: 'Gastos', valor: fmtQ(egresos), color: C.red, sub: `${lista.length} ${lista.length === 1 ? 'gasto' : 'gastos'}` },
        { label: 'Utilidad', valor: fmtQ(utilidad), color: utilidad >= 0 ? C.black : C.red, sub: ingresos ? `Margen ${Math.round((utilidad / ingresos) * 100)}%` : '—' },
        { label: 'Por cobrar', valor: fmtQ(porCobrar), color: porCobrar > 0 ? C.amber : C.black, sub: 'Saldo pendiente de pacientes' },
      ]} />

      <Card title="Ingresos y gastos · últimos 12 meses" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: C.g500, marginBottom: 10 }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: C.green, marginRight: 6 }} />Ingresos</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#F08A8A', marginRight: 6 }} />Gastos</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 6, alignItems: 'end', height: 180 }}>
          {serie.map(s => (
            <div key={`${s.y}-${s.m}`} title={`${MESES[s.m]} ${s.y}\nIngresos ${fmtQ(s.ingresos)}\nGastos ${fmtQ(s.gastos)}`} style={{ display: 'flex', gap: 2, alignItems: 'end', height: '100%' }}>
              <div style={{ flex: 1, height: `${(s.ingresos / tope) * 100}%`, minHeight: s.ingresos ? 3 : 0, background: C.green, borderRadius: '4px 4px 0 0' }} />
              <div style={{ flex: 1, height: `${(s.gastos / tope) * 100}%`, minHeight: s.gastos ? 3 : 0, background: '#F08A8A', borderRadius: '4px 4px 0 0' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 6, marginTop: 6 }}>
          {serie.map(s => <div key={`${s.y}-${s.m}`} style={{ fontSize: 11, color: C.g500, textAlign: 'center' }}>{MESES[s.m].slice(0, 3)}</div>)}
        </div>
      </Card>

      <div className="inv-dos" style={{ marginBottom: 16 }}>
        <Card title="De dónde vienen los ingresos">{barraLista(porConcepto, ingresos, C.green)}</Card>
        <Card title="En qué se va el dinero">{barraLista(porCategoria, egresos, '#F08A8A')}</Card>
      </div>

      <Card title={`Gastos · ${titulo}`} right={<Button size="sm" variant="ghost" icon="mas" onClick={() => setGasto(null)}>Registrar gasto</Button>}>
        <Tabla columnas={['Fecha', 'Categoría', 'Concepto', ...(sedes.length ? ['Sede'] : []), 'Monto']} vacio="Sin gastos en este período"
          onFila={(f) => !f.g.automatico && setGasto(f.g)}
          filas={lista.map(g => ({ key: g.id, g, celdas: [
            fmtFechaCorta(g.fecha), <Badge>{g.categoria}</Badge>,
            <div>{g.concepto}{g.automatico && <div style={{ fontSize: 12, color: C.g400 }}>Desde Inventario → Compras</div>}{g.comprobante_path && <span title="Tiene comprobante"> 📎</span>}</div>,
            ...(sedes.length ? [nombreSede(sedes, g.sede_id) || '—'] : []), <strong style={{ fontWeight: 600 }}>{fmtQ(g.monto)}</strong>,
          ] }))} />
      </Card>

      {gasto !== undefined && <GastoModal gasto={gasto} onClose={() => setGasto(undefined)} onGuardado={() => { setGasto(undefined); cargar() }} />}
    </>
  )
}

function GastoModal({ gasto, onClose, onGuardado }) {
  const { sedes, clinica } = useDatos()
  const [f, setF] = useState({
    fecha: gasto?.fecha || hoyISO(), categoria: gasto?.categoria || '', concepto: gasto?.concepto || '', monto: gasto?.monto ?? '',
    metodo: gasto?.metodo || '', sede: gasto?.sede_id || '', proveedor: gasto?.proveedor || '', notas: gasto?.notas || '',
  })
  const [otra, setOtra] = useState(gasto && !CATEGORIAS_GASTO.includes(gasto.categoria) ? gasto.categoria : '')
  const [archivo, setArchivo] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const categoria = f.categoria === '__otra' ? otra.trim() : f.categoria

  const guardar = async () => {
    if (!categoria) { toast.error('Elija la categoría'); return }
    if (!f.concepto.trim()) { toast.error('Escriba en qué se gastó'); return }
    if (!(Number(f.monto) > 0)) { toast.error('Escriba el monto'); return }
    if ([f.concepto, f.proveedor, f.notas, otra].some(t => /[<>]/.test(t))) { toast.error('Quite los signos < >'); return }
    setBusy(true)
    let comprobante = {}
    if (archivo) {
      const tipo = tipoArchivo(archivo)
      const path = `${clinica.id}/gastos/${crypto.randomUUID()}.${tipo === 'application/pdf' ? 'pdf' : 'jpg'}`
      const { error } = await supabase.storage.from('expedientes').upload(path, archivo, { contentType: tipo })
      if (error) { setBusy(false); toast.error('No se pudo subir el comprobante'); return }
      comprobante = { comprobante_path: path, comprobante_nombre: archivo.name.slice(0, 200), comprobante_mime: tipo }
      if (gasto?.comprobante_path) supabase.storage.from('expedientes').remove([gasto.comprobante_path])
    }
    const fila = { fecha: f.fecha, categoria: categoria.slice(0, 60), concepto: f.concepto.trim(), monto: Number(f.monto), metodo: f.metodo || null,
      sede_id: f.sede || null, proveedor: f.proveedor.trim() || null, notas: f.notas.trim() || null, ...comprobante }
    const { error } = gasto ? await supabase.from('gastos').update(fila).eq('id', gasto.id) : await supabase.from('gastos').insert(fila)
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Gasto guardado'); onGuardado()
  }
  const eliminar = async () => {
    if (!confirm('¿Eliminar este gasto?')) return
    if (gasto.comprobante_path) await supabase.storage.from('expedientes').remove([gasto.comprobante_path])
    const { error } = await supabase.from('gastos').delete().eq('id', gasto.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Gasto eliminado'); onGuardado()
  }
  const verComprobante = async () => {
    const w = window.open('', '_blank')
    const { data } = await supabase.storage.from('expedientes').createSignedUrl(gasto.comprobante_path, 600)
    if (data?.signedUrl && w) w.location.href = data.signedUrl; else w?.close()
  }

  return (
    <Modal title={gasto ? 'Editar gasto' : 'Registrar gasto'} onClose={onClose} maxWidth={640}>
      <Grid min={200}>
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
        <Campo label="Categoría *"><Select value={CATEGORIAS_GASTO.includes(f.categoria) || f.categoria === '' ? f.categoria : '__otra'} onChange={set('categoria')}>
          <option value="">Seleccione…</option>{CATEGORIAS_GASTO.map(c => <option key={c}>{c}</option>)}<option value="__otra">Otra (escribir)…</option>
        </Select></Campo>
        {(f.categoria === '__otra' || (f.categoria && !CATEGORIAS_GASTO.includes(f.categoria))) && <Campo label="Nombre de la categoría"><Input value={otra} onChange={(v) => { setOtra(v); set('categoria')('__otra') }} maxLength={60} /></Campo>}
        <Campo label="Monto (Q) *"><Input type="number" min="0" step="0.01" value={f.monto} onChange={set('monto')} placeholder="0.00" /></Campo>
        <Campo label="Concepto *" full><Input value={f.concepto} onChange={set('concepto')} maxLength={200} placeholder="Ej. Renta de octubre, sueldo de asistente…" /></Campo>
        <Campo label="Proveedor o a quién se pagó"><Input value={f.proveedor} onChange={set('proveedor')} maxLength={120} /></Campo>
        <Campo label="Método de pago"><Select value={f.metodo} onChange={set('metodo')}><option value="">—</option>{METODOS_PAGO.map(m => <option key={m}>{m}</option>)}</Select></Campo>
        {sedes.length > 0 && <Campo label="Sede"><Select value={f.sede} onChange={set('sede')}><option value="">General (todas)</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>}
        <Campo label="Notas" full><Textarea value={f.notas} onChange={set('notas')} rows={2} maxLength={1000} /></Campo>
      </Grid>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.g600, margin: '16px 0 8px' }}>Comprobante o factura (opcional)</div>
      <BotonesSubir onArchivos={(fs) => setArchivo(fs[0])} texto={archivo ? `📎 ${archivo.name} (cambiar)` : gasto?.comprobante_path ? `📎 ${gasto.comprobante_nombre || 'Comprobante'} (cambiar)` : 'Elegir foto o PDF'} />
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {gasto && <Button variant="danger" icon="eliminar" onClick={eliminar}>Eliminar</Button>}
        {gasto?.comprobante_path && <Button variant="ghost" icon="pdf" onClick={verComprobante}>Ver comprobante</Button>}
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

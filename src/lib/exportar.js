// Export builders (Excel / PDF) shared by the pages and by the «Su período terminó» screen (CuentaVencida).
// Each `preparar*` returns { titulo, subtitulo, secciones, excel: { hojas, archivo } }, the shape that <Exportar> expects.
import { supabase } from './supabase'
import { MESES, origenLabel } from './constantes'
import { fmtQ, fmtFechaCorta, fmtHora, saldo, totalCobro, hoyISO } from './formato'
import { slug } from './excel'
import { enPeriodo, nombreSede } from '../components/Filtros'
import { estadoCobro, tipoCobro, sedeCobro, ESTADOS_COBRO } from '../components/Pagos'
import { totalOC } from '../components/inventario/Compras'
import { estadoProducto, existencia, fmtCant } from '../hooks/useInventario'
import { seccionesDe, textoPlano } from './ficha'
import { resumenDatos } from './especialidades'

// ─── Patients ───
// last / next appointment, number of appointments and balance owed of one patient
export function infoPaciente(p, citas, cobros) {
  const hoy = hoyISO()
  const cs = citas.filter(c => c.paciente_id === p.id)
  const ultima = cs.filter(c => c.fecha <= hoy).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  const proxima = cs.filter(c => c.fecha > hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
  const deuda = cobros.filter(c => c.paciente_id === p.id).reduce((n, c) => n + saldo(c), 0)
  return { consultas: cs.length, ultima, proxima, deuda }
}

export function prepararPacientes({ lista, citas, cobros, finanzas, filtroTexto, atencion }) {
  const info = (p) => infoPaciente(p, citas, cobros)
  return ({
    titulo: 'Pacientes', subtitulo: filtroTexto,
    secciones: [{ tabla: { headers: ['Paciente', 'Teléfono', 'Correo', 'Origen', 'Consultas', 'Última cita', 'Próxima cita', ...(finanzas ? ['Saldo'] : [])],
      filas: lista.map(p => { const i = info(p); return [p.nombre, p.telefono || '—', p.email || '—', p.origen === 'redes' && p.red ? `Redes (${p.red})` : origenLabel(p.origen), i.consultas, i.ultima ? fmtFechaCorta(i.ultima.fecha) : '—', i.proxima ? fmtFechaCorta(i.proxima.fecha) : '—', ...(finanzas ? [fmtQ(i.deuda)] : [])] }) } }],
    excel: { archivo: atencion ? `pacientes_${slug(atencion)}` : 'pacientes', hojas: [{ nombre: 'Pacientes', columnas: [
      { header: 'Paciente', key: 'n', width: 30 }, { header: 'Teléfono', key: 't', width: 14 }, { header: 'Correo', key: 'e', width: 28 }, { header: 'DPI', key: 'dpi', width: 16 }, { header: 'Origen', key: 'o', width: 15 },
      { header: 'Red social', key: 'r', width: 12 }, { header: 'Referido por', key: 'ref', width: 20 }, { header: 'Registrado', key: 'reg', width: 12 },
      { header: 'Consultas', key: 'c', width: 10 }, { header: 'Última cita', key: 'u', width: 12 }, { header: 'Próxima cita', key: 'px', width: 12 },
      ...(finanzas ? [{ header: 'Saldo pendiente', key: 's', width: 15, moneda: true }] : []), { header: 'Tipo de sangre', key: 'sg', width: 12 },
      { header: 'Contacto de emergencia', key: 'ce', width: 24 }, { header: 'Tel. emergencia', key: 'te', width: 15 },
      { header: 'Alergias', key: 'al', width: 25 }, { header: 'Enfermedades', key: 'en', width: 25 }, { header: 'Medicamentos', key: 'me', width: 25 },
    ], filas: lista.map(p => { const i = info(p); return {
      n: p.nombre, t: p.telefono, e: p.email, dpi: p.dpi, ce: p.contacto_emergencia, te: p.telefono_emergencia, o: origenLabel(p.origen), r: p.red, ref: p.referido_por, reg: p.created_at.slice(0, 10), c: i.consultas,
      u: i.ultima?.fecha, px: i.proxima?.fecha, s: i.deuda, sg: p.tipo_sangre, al: p.alergias, en: p.enfermedades, me: p.medicamentos,
    } }) }] },
  })
}

// ─── Appointments ───
export function prepararCitas({ visibles, porId, sedes, filtroTexto }) {
  return ({
    titulo: 'Citas',
    subtitulo: filtroTexto,
    secciones: [{ tabla: {
      headers: ['Fecha', 'Hora', 'Paciente', 'Teléfono', 'Tipo', 'Estado', ...(sedes.length ? ['Sede'] : []), 'Origen', 'Agendó'],
      filas: visibles.map(c => { const p = porId[c.paciente_id]; return [fmtFechaCorta(c.fecha), fmtHora(c.hora), p.nombre, p.telefono || '—', [c.tipo, c.servicio].filter(Boolean).join(' · ') || '—', c.estado, ...(sedes.length ? [nombreSede(sedes, c.sede_id) || '—'] : []), p.origen === 'redes' && p.red ? `Redes (${p.red})` : origenLabel(p.origen), c.agendo_nombre || (c.agendada_por === 'lia' ? 'Lía' : '—')] }),
    } }],
    excel: { archivo: `citas_${slug(filtroTexto)}`, hojas: [{ nombre: 'Citas', columnas: [
      { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Hora', key: 'hora', width: 8 }, { header: 'Paciente', key: 'paciente', width: 30 },
      { header: 'Teléfono', key: 'tel', width: 14 }, { header: 'Tipo', key: 'tipo', width: 18 }, { header: 'Estado', key: 'estado', width: 13 },
      { header: 'Origen', key: 'origen', width: 16 }, { header: 'Red social', key: 'red', width: 12 }, { header: 'Referido por', key: 'ref', width: 20 },
      { header: 'Agendó', key: 'agendo', width: 20 }, { header: 'Procedimiento', key: 'proc', width: 26 }, { header: 'Sede', key: 'sede', width: 16 }, { header: 'Notas', key: 'notas', width: 40 },
    ], filas: visibles.map(c => { const p = porId[c.paciente_id]; return {
      sede: nombreSede(sedes, c.sede_id), fecha: c.fecha, hora: fmtHora(c.hora), paciente: p.nombre, tel: p.telefono, tipo: c.tipo, estado: c.estado,
      origen: origenLabel(p.origen), red: p.red, ref: p.referido_por, agendo: c.agendo_nombre || (c.agendada_por === 'lia' ? 'Lía' : ''), proc: c.procedimiento, notas: c.notas,
    } }) }] },
  })
}

// ─── Clinical records: one row per appointment with its clinical fields (photos are not included) ───
export function prepararExpedientes({ pacientes, citas, clinica }) {
  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))
  const filas = citas.filter(c => porId[c.paciente_id]).sort((a, b) => porId[a.paciente_id].nombre.localeCompare(porId[b.paciente_id].nombre, 'es') || b.fecha.localeCompare(a.fecha))
    .map(c => {
      const p = porId[c.paciente_id]
      const ficha = seccionesDe(c, clinica).map(s => `${s.titulo}: ${textoPlano(s.html)}`).join('\n')
      return { c, p, ficha, datos: resumenDatos(c.datos, clinica?.especialidad) || '' }
    })
  return {
    titulo: 'Expedientes clínicos', subtitulo: `${pacientes.length} ${pacientes.length === 1 ? 'paciente' : 'pacientes'} · ${filas.length} ${filas.length === 1 ? 'consulta' : 'consultas'}`,
    secciones: [
      { titulo: 'Pacientes', tabla: { headers: ['Paciente', 'Teléfono', 'Correo', 'Tipo de sangre', 'Alergias', 'Enfermedades', 'Medicamentos'],
        filas: [...pacientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => [p.nombre, p.telefono || '—', p.email || '—', p.tipo_sangre || '—', p.alergias || '—', p.enfermedades || '—', p.medicamentos || '—']) } },
      { titulo: 'Consultas y notas clínicas', tabla: { headers: ['Fecha', 'Paciente', 'Tipo', 'Datos clínicos', 'Ficha clínica', 'Procedimiento', 'Notas'],
        filas: filas.map(({ c, p, ficha, datos }) => [fmtFechaCorta(c.fecha), p.nombre, [c.tipo, c.servicio].filter(Boolean).join(' · ') || '—', datos || '—', ficha || '—', c.procedimiento || '—', c.notas || '—']) } },
    ],
    excel: { archivo: 'expedientes', hojas: [
      { nombre: 'Pacientes', columnas: [
        { header: 'Paciente', key: 'n', width: 30 }, { header: 'Teléfono', key: 't', width: 14 }, { header: 'Correo', key: 'e', width: 28 }, { header: 'DPI', key: 'dpi', width: 16 },
        { header: 'Fecha de nacimiento', key: 'fn', width: 14 }, { header: 'Sexo', key: 'sx', width: 10 }, { header: 'Tipo de sangre', key: 'sg', width: 12 },
        { header: 'Alergias', key: 'al', width: 28 }, { header: 'Enfermedades', key: 'en', width: 28 }, { header: 'Medicamentos', key: 'me', width: 28 },
        { header: 'Antecedentes quirúrgicos', key: 'aq', width: 28 }, { header: 'Antecedentes familiares', key: 'af', width: 28 },
        { header: 'Contacto de emergencia', key: 'ce', width: 24 }, { header: 'Tel. emergencia', key: 'te', width: 15 },
      ], filas: [...pacientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => ({
        n: p.nombre, t: p.telefono, e: p.email, dpi: p.dpi, fn: p.fecha_nacimiento, sx: p.sexo, sg: p.tipo_sangre, al: p.alergias, en: p.enfermedades, me: p.medicamentos,
        aq: p.antecedentes_quirurgicos, af: p.antecedentes_familiares, ce: p.contacto_emergencia, te: p.telefono_emergencia })) },
      { nombre: 'Consultas', columnas: [
        { header: 'Fecha', key: 'f', width: 12 }, { header: 'Hora', key: 'h', width: 8 }, { header: 'Paciente', key: 'p', width: 30 }, { header: 'Tipo', key: 't', width: 18 }, { header: 'Servicio', key: 's', width: 22 },
        { header: 'Estado', key: 'e', width: 13 }, { header: 'Peso', key: 'pe', width: 8 }, { header: 'Talla', key: 'ta', width: 8 }, { header: 'Datos clínicos', key: 'd', width: 36 },
        { header: 'Ficha clínica', key: 'fi', width: 60 }, { header: 'Procedimiento', key: 'pr', width: 30 }, { header: 'Notas', key: 'n', width: 40 },
      ], filas: filas.map(({ c, p, ficha, datos }) => ({ f: c.fecha, h: fmtHora(c.hora), p: p.nombre, t: c.tipo, s: c.servicio, e: c.estado, pe: c.peso, ta: c.talla, d: datos, fi: ficha, pr: c.procedimiento, n: c.notas })) },
    ] },
  }
}

// ─── Payments and balances ───
// charges grouped by patient with totals, plus the overall figures shown on the Pagos page
export const agruparPorPaciente = (arr, porId) => Object.values(arr.reduce((g, c) => { (g[c.paciente_id] ||= { p: porId[c.paciente_id], cobros: [] }).cobros.push(c); return g }, {}))
export function resumenPagos(lista, porId, hoy = hoyISO()) {
  const total = lista.reduce((n, c) => n + totalCobro(c), 0)
  const pagado = lista.reduce((n, c) => n + Number(c.pagado || 0), 0)
  const vencidos = lista.filter(c => estadoCobro(c, hoy) === 'vencido')
  const grupos = agruparPorPaciente(lista, porId)
    .map(g => ({ ...g, total: g.cobros.reduce((n, c) => n + totalCobro(c), 0), pagado: g.cobros.reduce((n, c) => n + Number(c.pagado || 0), 0), vencido: g.cobros.some(c => estadoCobro(c, hoy) === 'vencido') }))
    .map(g => ({ ...g, saldo: Math.max(0, g.total - g.pagado) }))
    .sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo || a.p.nombre.localeCompare(b.p.nombre, 'es'))
  const alDia = grupos.filter(g => g.saldo <= 0).length
  return { total, pagado, vencidos, grupos, alDia }
}

// the charges of every patient with a record, newest first and overdue ones on top (what the Pagos page lists with no filter)
export function cobrosOrdenados(cobros, porId, hoy = hoyISO()) {
  return cobros.filter(c => porId[c.paciente_id]).sort((a, b) => (estadoCobro(b, hoy) === 'vencido') - (estadoCobro(a, hoy) === 'vencido') || b.fecha.localeCompare(a.fecha))
}

export function prepararPagos({ lista, pacientes, citas, servicios, sedes, filtroTexto }) {
  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))
  const { total, pagado, grupos, alDia } = resumenPagos(lista, porId)
  return ({
    titulo: 'Pagos y saldos', subtitulo: filtroTexto,
    secciones: [
      { resumen: [['Total cobrado', fmtQ(total)], ['Pagado', fmtQ(pagado)], ['Saldo pendiente', fmtQ(total - pagado)], ['Pacientes al día', `${alDia} de ${grupos.length}`]] },
      { titulo: 'Por paciente', tabla: { headers: ['Paciente', 'Cobros', 'Total', 'Pagado', 'Saldo', 'Estado'],
        filas: grupos.map(g => [g.p.nombre, g.cobros.length, fmtQ(g.total), fmtQ(g.pagado), fmtQ(g.saldo), g.saldo <= 0 ? 'Al día' : g.vencido ? 'Vencido' : 'Con saldo']) } },
    ],
    excel: { archivo: 'pagos-y-saldos', hojas: [{ nombre: 'Cobros', columnas: [
      { header: 'Fecha', key: 'f', width: 12 }, { header: 'Paciente', key: 'p', width: 30 }, { header: 'Concepto', key: 'c', width: 30 }, { header: 'Tipo', key: 't', width: 16 },
      { header: 'Sede', key: 's', width: 14 }, { header: 'Total', key: 'tot', width: 13, moneda: true }, { header: 'Pagado', key: 'pag', width: 13, moneda: true },
      { header: 'Saldo', key: 'sal', width: 13, moneda: true }, { header: 'Fecha límite', key: 'v', width: 12 }, { header: 'Estado', key: 'e', width: 12 },
    ], filas: lista.map(c => ({ f: c.fecha, p: porId[c.paciente_id]?.nombre, c: c.concepto, t: tipoCobro(c, citas, servicios), s: nombreSede(sedes, sedeCobro(c, citas, pacientes)),
      tot: totalCobro(c), pag: Number(c.pagado || 0), sal: saldo(c), v: c.vence, e: ESTADOS_COBRO[estadoCobro(c)].label })) }] },
  })
}

// ─── Inventory: stock per location (+ the movements history when `movimientos` is given) ───
export function prepararInventario({ inv, lista, visibles, sedeFiltro, costos, movimientos }) {
  const base = ({
    titulo: 'Inventario', subtitulo: sedeFiltro ? visibles[0]?.nombre : 'Todas las sedes',
    secciones: [{ tabla: { headers: ['Producto', 'Unidad', ...visibles.map(s => s.nombre), ...(visibles.length > 1 ? ['Total'] : []), 'Mínimo', 'Estado'],
      filas: lista.map(({ p, e }) => [p.nombre, p.unidad, ...visibles.map(s => fmtCant(existencia(inv, s.id, p.id))), ...(visibles.length > 1 ? [fmtCant(e.total)] : []), fmtCant(p.stock_minimo), e.label]) } }],
    excel: { archivo: 'inventario', hojas: [{ nombre: 'Existencias', columnas: [
      { header: 'Producto', key: 'p', width: 30 }, { header: 'Categoría', key: 'c', width: 16 }, { header: 'Unidad', key: 'u', width: 10 },
      ...visibles.map((s, i) => ({ header: s.nombre, key: 's' + i, width: 14 })), { header: 'Total', key: 't', width: 10 },
      { header: 'Mínimo por sede', key: 'm', width: 14 }, ...(costos ? [{ header: 'Costo', key: 'co', width: 12, moneda: true }, { header: 'Valor', key: 'v', width: 14, moneda: true }] : []), { header: 'Estado', key: 'e', width: 14 },
    ], filas: lista.map(({ p, e }) => ({ p: p.nombre, c: p.categoria, u: p.unidad, ...Object.fromEntries(visibles.map((s, i) => ['s' + i, existencia(inv, s.id, p.id)])),
      t: e.total, m: Number(p.stock_minimo), co: p.costo != null ? Number(p.costo) : null, v: e.total * (Number(p.costo) || 0), e: e.label })) }] },
  })
  if (!movimientos) return base
  const prod = Object.fromEntries(inv.productos.map(p => [p.id, p.nombre])), sede = Object.fromEntries(inv.sedes.map(s => [s.id, s.nombre]))
  base.excel.hojas.push({ nombre: 'Movimientos', columnas: [
    { header: 'Fecha', key: 'f', width: 12 }, { header: 'Producto', key: 'p', width: 30 }, { header: 'Sede', key: 's', width: 16 }, { header: 'Tipo', key: 't', width: 14 },
    { header: 'Cantidad', key: 'c', width: 10 }, { header: 'Lote', key: 'l', width: 14 }, { header: 'Vence', key: 'v', width: 12 }, { header: 'Notas', key: 'n', width: 36 },
  ], filas: movimientos.map(m => ({ f: m.fecha, p: prod[m.producto_id], s: sede[m.sede_id], t: m.tipo, c: Number(m.delta), l: m.lote, v: m.vence, n: m.notas })) })
  base.secciones.push({ titulo: 'Movimientos', tabla: { headers: ['Fecha', 'Producto', 'Sede', 'Tipo', 'Cantidad', 'Notas'],
    filas: movimientos.map(m => [fmtFechaCorta(m.fecha), prod[m.producto_id] || '—', sede[m.sede_id] || '—', m.tipo, fmtCant(m.delta), m.notas || '—']) } })
  return base
}
// every active product with its stock in every active location (what the screen exports, no filters)
export function listaInventario(inv) {
  const visibles = inv.sedes
  const lista = inv.productos.filter(p => p.activo).map(p => ({ p, e: estadoProducto(inv, visibles, p) }))
  return { visibles, lista }
}
export async function cargarMovimientos() {
  const PAGE = 1000
  let desde = 0, filas = []
  for (;;) {
    const { data, error } = await supabase.from('inventario_movimientos').select('*').order('fecha', { ascending: false }).range(desde, desde + PAGE - 1)
    if (error) throw error
    filas = filas.concat(data || [])
    if (!data || data.length < PAGE) return filas
    desde += PAGE
  }
}

// ─── Finances (administrator) ───
// abonos, gastos and purchase orders of the clinic
export async function cargarFinanzas() {
  const [a, g, o, l] = await Promise.all([
    supabase.from('abonos').select('*'), supabase.from('gastos').select('*').order('fecha', { ascending: false }),
    supabase.from('ordenes_compra').select('*'), supabase.from('ordenes_compra_lineas').select('*'),
  ])
  return { abonos: a.data || [], gastos: g.data || [], ordenes: o.data || [], lineas: l.data || [] }
}

export function calcularFinanzas({ cobros, citas, pacientes, d, sede, periodo }) {
  const hoy = new Date()
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


  return { cobroPorId, cobrosS, abonosS, gastosS, salidas, ingresos, egresos, facturado, porCobrar, utilidad, serie, tope, porConcepto, porCategoria, lista }
}

export function prepararFinanzas({ ingresos, egresos, utilidad, porCobrar, facturado, porConcepto, porCategoria, lista, serie, titulo, clinica, sedes }) {
  return ({
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
}

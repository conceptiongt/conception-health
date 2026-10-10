// Demo mode (VITE_MODO_DEMO=true): the platform runs without login on an in-memory copy of a fictional clinic.
// Nothing is sent to the database; every change lives only until the page is reloaded.
// It mimics the parts of the Supabase client the app uses (tables, rpc, storage, auth).

const q = new URLSearchParams(location.search)
const uid = 'demo-usuario', cid = 'demo-clinica'
const id = () => crypto.randomUUID()
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
const hoy = dias(0)
let semilla = 7
const azar = () => { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280 } // same sample data on every load
const elegir = (l) => l[Math.floor(azar() * l.length)]

const sedes = [
  { id: 'demo-s1', clinica_id: cid, nombre: 'Zona 10', tipo: 'ciudad', departamento: 'Guatemala', municipio: 'Guatemala', activa: true, created_at: '2026-01-01' },
  { id: 'demo-s2', clinica_id: cid, nombre: 'Quetzaltenango', tipo: 'departamental', departamento: 'Quetzaltenango', municipio: 'Quetzaltenango', activa: true, created_at: '2026-01-01' },
]
const servicios = [
  ['sv1', 'Primera consulta', 'Consulta y valoración vascular', 350],
  ['sv2', 'Seguimiento', 'Control', 250],
  ['sv3', 'Evaluación', 'Ultrasonido Doppler venoso', 600],
  ['sv4', 'Procedimiento', 'Escleroterapia', 1200],
  ['sv5', 'Procedimiento', 'Escleroterapia con espuma', 1500],
  ['sv6', 'Cirugía', 'Ablación láser endovenosa', 14000],
].map(([i, categoria, nombre, precio]) => ({ id: 'demo-' + i, clinica_id: cid, categoria, nombre, precio, activo: true, created_at: '2026-01-01' }))

// fictional patients (names made up for the demo)
const NOMBRES = ['Lucía Hernández', 'Carlos Méndez', 'Ana Sofía Ramírez', 'Jorge Castillo', 'María José Estrada', 'Roberto Pineda', 'Gabriela Morales', 'Fernando Ortiz', 'Patricia Lemus', 'Diego Arriaza', 'Silvia Contreras', 'Mario Barrios']
const ORIG = [['redes', 'Instagram'], ['redes', 'Facebook'], ['referido', null], ['google', null], ['redes', 'TikTok'], ['otro', null]]
const pacientes = NOMBRES.map((nombre, i) => {
  const [origen, red] = ORIG[i % ORIG.length]
  const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')
  return {
    id: `demo-p${i + 1}`, clinica_id: cid, nombre, telefono: `5${String(5500000 + i * 1371).slice(0, 7)}`, email: i % 3 ? null : `${slug.split('-')[0]}@correo.com`,
    origen, red, referido_por: origen === 'referido' ? 'Dra. Paola Ruiz' : null, sede_id: i % 3 === 2 ? 'demo-s2' : 'demo-s1',
    fecha_nacimiento: `${1955 + (i * 4) % 40}-0${1 + (i % 9)}-1${i % 9}`, sexo: i % 2 ? 'Masculino' : 'Femenino', tipo_sangre: elegir(['O+', 'A+', 'B+', 'O-', 'No lo sé']),
    alergias: i % 4 === 0 ? 'Penicilina' : null, enfermedades: i % 3 === 0 ? 'Hipertensión' : null, medicamentos: i % 3 === 0 ? 'Losartán 50 mg' : null,
    extra: {}, portal_token: id(), portal_codigo: `${slug}-demo${i}`, portal_activo: i < 3, portal_datos: true, portal_costos: false,
    created_at: `${dias(-170 + i * 15)}T10:00:00Z`,
  }
})

const FICHAS = [
  { motivo: 'Dolor y pesadez en ambas piernas al final del día.', diagnostico: '<b>Insuficiencia venosa crónica</b> C2 en pierna izquierda', receta: '<ul><li>Diosmina 500 mg, 1 cada 12 horas por 30 días</li><li>Medias de compresión <span style="color: rgb(200, 48, 74);">20-30 mmHg</span></li></ul>', indicaciones: 'Caminar 30 minutos diarios. <span style="background-color: rgb(255, 243, 163);">Evitar estar de pie mucho tiempo.</span>', seguimiento: 'Control en 4 semanas con ultrasonido Doppler.' },
  { diagnostico: 'Arañitas vasculares (telangiectasias) en muslos', tratamiento: 'Tres sesiones de escleroterapia, una cada 3 semanas.', indicaciones: 'Usar medias 48 horas después de cada sesión. No exponerse al sol 2 semanas.' },
  { diagnostico: 'Insuficiencia de safena mayor derecha', tratamiento: '<b>Ablación láser endovenosa</b> programada.', indicaciones: 'Ayuno de 8 horas el día de la cirugía. Traer medias de compresión.', seguimiento: 'Revisión a los 7 días de la cirugía.' },
]
const citas = [], cobros = [], abonos = [], archivos = []
pacientes.forEach((p, i) => {
  const n = 1 + (i % 3)
  for (let k = 0; k < n; k++) {
    const futura = i < 4 && k === n - 1
    const fecha = futura ? dias(2 + i * 3) : dias(-160 + i * 13 + k * 25)
    const s = k === 0 ? servicios[0] : elegir(servicios.slice(1))
    const cita = {
      id: `demo-c${i}-${k}`, clinica_id: cid, paciente_id: p.id, fecha, hora: `${String(8 + ((i + k) % 9)).padStart(2, '0')}:00`, tipo: s.categoria, servicio: s.nombre, servicio_id: s.id,
      estado: futura ? elegir(['Pendiente', 'Confirmada']) : elegir(['Asistió', 'Asistió', 'Asistió', 'No asistió']), sede_id: p.sede_id,
      ficha: futura ? {} : FICHAS[(i + k) % FICHAS.length], datos: futura ? {} : { pierna: elegir(['Derecha', 'Izquierda', 'Ambas']), ceap: elegir(['C1', 'C2', 'C3']) },
      notas: futura ? null : 'Paciente refiere mejoría parcial.', portal: !futura && i < 3, portal_ocultar: [], peso: futura ? null : 60 + (i * 3) % 25, talla: futura ? null : 155 + (i * 2) % 25,
      created_at: `${fecha}T09:00:00Z`,
    }
    citas.push(cita)
    const cobro = { id: `demo-co${i}-${k}`, clinica_id: cid, paciente_id: p.id, cita_id: cita.id, servicio_id: s.id, concepto: s.nombre, precio: s.precio, descuento: s.precio > 5000 ? 1000 : 0, pagado: 0, fecha, vence: s.precio > 5000 ? dias(30) : null, created_at: cita.created_at }
    cobros.push(cobro)
    const total = cobro.precio - cobro.descuento
    const pagar = futura ? 0 : total > 5000 ? Math.round(total * 0.5) : (i + k) % 5 === 0 ? 0 : total
    if (pagar) abonos.push({ id: id(), clinica_id: cid, cobro_id: cobro.id, fecha, monto: pagar, metodo: elegir(['Efectivo', 'Tarjeta', 'Transferencia']), creado_por: uid, created_at: cita.created_at })
  }
})

const productos = [
  ['pr1', 'Polidocanol 3% (espuma)', 'Medicamentos', 'ampolla', 10, 85],
  ['pr2', 'Medias de compresión 20-30 mmHg', 'Insumos', 'par', 6, 260],
  ['pr3', 'Gasas estériles', 'Insumos', 'paquete', 20, 15],
  ['pr4', 'Fibra láser endovenosa', 'Equipo', 'unidad', 2, 2400],
  ['pr5', 'Lidocaína 2%', 'Medicamentos', 'frasco', 4, 45],
].map(([i, nombre, categoria, unidad, stock_minimo, costo]) => ({ id: 'demo-' + i, clinica_id: cid, nombre, categoria, unidad, stock_minimo, costo, activo: true, created_at: '2026-01-01' }))
const existencias = [], movimientos = []
for (const [s, p, cant] of [['demo-s1', 'demo-pr1', 24], ['demo-s1', 'demo-pr2', 4], ['demo-s1', 'demo-pr3', 60], ['demo-s1', 'demo-pr4', 3], ['demo-s1', 'demo-pr5', 2], ['demo-s2', 'demo-pr1', 8], ['demo-s2', 'demo-pr3', 25]]) {
  existencias.push({ clinica_id: cid, sede_id: s, producto_id: p, cantidad: cant })
  movimientos.push({ id: id(), clinica_id: cid, sede_id: s, producto_id: p, tipo: 'entrada', delta: cant, fecha: dias(-40), created_at: `${dias(-40)}T10:00:00Z`, notas: 'Inventario inicial' })
}

const gastos = []
for (let m = 0; m < 6; m++) {
  const f = (d) => { const x = new Date(); x.setMonth(x.getMonth() - m, d); return iso(x) }
  gastos.push(
    { id: id(), clinica_id: cid, fecha: f(1), categoria: 'Renta', concepto: 'Renta del local Zona 10', monto: 6500, metodo: 'Transferencia', sede_id: 'demo-s1', created_at: f(1) },
    { id: id(), clinica_id: cid, fecha: f(28), categoria: 'Sueldos y planilla', concepto: 'Sueldo de asistente', monto: 4800, metodo: 'Transferencia', sede_id: null, created_at: f(28) },
    { id: id(), clinica_id: cid, fecha: f(10), categoria: 'Publicidad', concepto: 'Campaña en Instagram', monto: 900 + m * 120, metodo: 'Tarjeta', sede_id: null, created_at: f(10) },
    { id: id(), clinica_id: cid, fecha: f(15), categoria: 'Servicios (luz, agua, internet)', concepto: 'Luz e internet', monto: 1150, metodo: 'Débito', sede_id: 'demo-s1', created_at: f(15) },
  )
}

const DB = {
  perfiles: [
    { user_id: uid, clinica_id: cid, nombre: 'Dra. Andrea Molina', email: 'demo@conception-gt.com', rol: q.get('rol') === 'asistente' ? 'asistente' : 'dueno', permisos: { expedientes: true, inventario: true }, password_creada: true, created_at: '2026-01-01' },
    { user_id: 'demo-u2', clinica_id: cid, nombre: 'Karla Pérez', email: 'asistente@clinicademo.com', rol: 'asistente', permisos: { expedientes: true, inventario: true }, password_creada: true, created_at: '2026-02-01' },
  ],
  clinicas: [{ id: cid, nombre: 'Clínica Demo de Venas', plan: 'max', plan_activo: true, plan_hasta: null, anios: [], color: '#2091DC', especialidad: 'flebologia', sugeridos_cargados: true, logo_path: null, registro_token: id(), registro_codigo: 'registro-clinica-demo', anticipo_pct: 50, campos_paciente: [], created_at: '2026-01-01' }],
  pacientes, citas, cobros, abonos, servicios, sedes, archivos, gastos, productos, existencias,
  inventario_movimientos: movimientos, invitaciones: [], documentos_compartidos: [],
  categorias_inventario: ['Medicamentos', 'Insumos', 'Equipo'].map(nombre => ({ id: id(), clinica_id: cid, nombre })),
  proveedores: [{ id: 'demo-pv1', clinica_id: cid, nombre: 'Distribuidora Médica Ejemplo', contacto: 'Luis', telefono: '55550000', activo: true }],
  ordenes_compra: [], ordenes_compra_lineas: [], paquetes: [], paquete_items: [],
}
const recalcular = () => DB.cobros.forEach(c => { c.pagado = DB.abonos.filter(a => a.cobro_id === c.id).reduce((n, a) => n + Number(a.monto), 0) })
recalcular()

function aplicar(r, d) {
  let e = DB.existencias.find(x => x.sede_id === r.sede_id && x.producto_id === r.producto_id)
  const actual = e ? Number(e.cantidad) : 0
  if (actual + d < 0) return { message: 'SIN_EXISTENCIA', hint: 'disponible=' + actual }
  if (!e) DB.existencias.push(e = { clinica_id: cid, sede_id: r.sede_id, producto_id: r.producto_id, cantidad: 0 })
  e.cantidad = actual + d
}

function from(t) {
  let op = 'select', payload, one = false, maybe = false, ord = null, cols = null
  const filt = []
  const b = {
    select(c) { if (op === 'select') cols = c; return b }, order(k, o) { ord = [k, o?.ascending]; return b }, range() { return b }, limit() { return b },
    eq(k, v) { filt.push([k, v]); return b }, is(k, v) { filt.push([k, v, 'is']); return b }, in(k, arr) { filt.push([k, arr, 'in']); return b },
    lt() { return b }, gte() { return b }, single() { one = true; return b }, maybeSingle() { maybe = true; return b },
    insert(x) { op = 'insert'; payload = x; return b }, update(x) { op = 'update'; payload = x; return b }, delete() { op = 'delete'; return b },
    then(res, rej) { return Promise.resolve(correr()).then(res, rej) },
  }
  const coincide = r => filt.every(([k, v, o]) => o === 'in' ? v.includes(r[k]) : o === 'is' ? (r[k] ?? null) === v : r[k] === v)
  const sinPermiso = ['cobros', 'abonos'].includes(t) && DB.perfiles[0].rol !== 'dueno'
  function correr() {
    const filas = DB[t] || (DB[t] = [])
    if (op === 'select') {
      if (sinPermiso || (t === 'gastos' && DB.perfiles[0].rol !== 'dueno')) return { data: one || maybe ? null : [], error: null }
      let d = filas.filter(coincide).map(r => ({ ...r }))
      if (ord) d.sort((a, x) => String(a[ord[0]] ?? '').localeCompare(String(x[ord[0]] ?? '')) * (ord[1] === false ? -1 : 1))
      return { data: one || maybe ? d[0] || null : d, count: d.length, error: null }
    }
    if (op === 'insert') {
      const lista = [].concat(payload).map(x => ({ id: id(), clinica_id: cid, created_at: new Date().toISOString(), ...x }))
      if (['citas', 'cobros', 'abonos', 'gastos', 'archivos', 'ordenes_compra', 'inventario_movimientos'].includes(t)) lista.forEach(x => { x.fecha = x.fecha || hoy })
      if (t === 'pacientes') lista.forEach(x => { x.portal_token = id(); x.portal_codigo = `${(x.nombre || 'paciente').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-demo`; x.extra = x.extra || {}; x.portal_datos = true })
      if (t === 'inventario_movimientos') {
        const copia = JSON.stringify(DB.existencias)
        for (const r of lista) { const err = aplicar(r, r.delta); if (err) { DB.existencias = JSON.parse(copia); return { data: null, error: err } } }
      }
      if (t === 'ordenes_compra') lista.forEach(x => { x.numero = filas.reduce((n, r) => Math.max(n, r.numero), 0) + 1; x.estado = x.estado || 'borrador' })
      if (t === 'ordenes_compra_lineas') lista.forEach(x => { x.recibido = 0 })
      if (t === 'cobros') lista.forEach(x => { x.pagado = 0; x.descuento = x.descuento || 0 })
      if (t === 'documentos_compartidos') lista.forEach(x => { x.codigo = 'documento-demo'; x.token = id() })
      filas.push(...lista)
      if (t === 'abonos') recalcular()
      return { data: one ? lista[0] : lista, error: null }
    }
    if (op === 'update') {
      const cambiadas = filas.filter(coincide)
      cambiadas.forEach(r => { Object.assign(r, payload); if (t === 'pacientes' && payload.registro_token) r.registro_codigo = `datos-${r.id}` })
      return { data: one ? (cambiadas[0] ? { ...cambiadas[0] } : null) : null, error: null }
    }
    if (op === 'delete') {
      const quitar = filas.filter(coincide)
      if (t === 'inventario_movimientos') {
        const copia = JSON.stringify(DB.existencias)
        for (const r of quitar) { const err = aplicar(r, -r.delta); if (err) { DB.existencias = JSON.parse(copia); return { error: err } } }
      }
      if (t === 'pacientes') quitar.forEach(p => ['citas', 'cobros', 'archivos'].forEach(k => { DB[k] = DB[k].filter(x => x.paciente_id !== p.id) }))
      DB[t] = filas.filter(r => !coincide(r))
      if (t === 'abonos' || t === 'cobros') { DB.abonos = DB.abonos.filter(a => DB.cobros.some(c => c.id === a.cobro_id)); recalcular() }
      return { data: null, error: null }
    }
  }
  return b
}

// files uploaded during the demo stay in the browser memory
const archivosMemoria = new Map()
const almacen = () => ({
  upload: async (path, file) => { archivosMemoria.set(path, URL.createObjectURL(file)); return { data: { path }, error: null } },
  createSignedUrl: async (path) => ({ data: { signedUrl: archivosMemoria.get(path) || null }, error: null }),
  createSignedUrls: async (paths) => ({ data: paths.map(path => ({ path, signedUrl: archivosMemoria.get(path) || null })), error: null }),
  remove: async (paths) => { paths.forEach(p => archivosMemoria.delete(p)); return { data: null, error: null } },
  getPublicUrl: (path) => ({ data: { publicUrl: archivosMemoria.get(path) || '' } }),
})

async function rpc(fn, a) {
  if (fn === 'cita_eliminar') {
    const c = DB.citas.find(x => x.id === a.p_cita)
    const otros = DB.citas.some(x => x.paciente_id === c.paciente_id && x.id !== c.id) || DB.cobros.some(x => x.paciente_id === c.paciente_id && x.cita_id !== c.id)
    const n = DB.cobros.filter(x => x.cita_id === c.id).length
    DB.cobros = DB.cobros.filter(x => x.cita_id !== c.id); DB.citas = DB.citas.filter(x => x.id !== c.id)
    if (!otros) DB.pacientes = DB.pacientes.filter(x => x.id !== c.paciente_id)
    DB.abonos = DB.abonos.filter(x => DB.cobros.some(co => co.id === x.cobro_id))
    return { data: { cobros: n, paciente_eliminado: !otros }, error: null }
  }
  if (fn === 'categoria_renombrar') {
    const c = DB.categorias_inventario.find(x => x.id === a.p_id), d = DB.categorias_inventario.find(x => x.id !== a.p_id && x.nombre.toLowerCase() === a.p_nombre.toLowerCase())
    DB.productos.filter(p => p.categoria === c.nombre).forEach(p => { p.categoria = d ? d.nombre : a.p_nombre })
    if (d) { DB.categorias_inventario = DB.categorias_inventario.filter(x => x.id !== c.id); return { data: 'unida', error: null } }
    c.nombre = a.p_nombre; return { data: 'renombrada', error: null }
  }
  if (fn === 'categoria_eliminar') {
    const c = DB.categorias_inventario.find(x => x.id === a.p_id)
    DB.productos.filter(p => p.categoria === c.nombre).forEach(p => { p.categoria = null })
    DB.categorias_inventario = DB.categorias_inventario.filter(x => x.id !== c.id); return { data: null, error: null }
  }
  if (fn === 'orden_recibir') {
    const o = DB.ordenes_compra.find(x => x.id === a.p_orden)
    if (!['confirmada', 'parcial'].includes(o.estado)) return { data: null, error: { message: 'ORDEN_NO_CONFIRMADA' } }
    for (const l of a.p_lineas) {
      if (!(l.cantidad > 0)) continue
      const li = DB.ordenes_compra_lineas.find(x => x.id === l.linea)
      const m = { id: id(), clinica_id: cid, sede_id: o.sede_id, producto_id: li.producto_id, tipo: 'entrada', delta: l.cantidad, lote: l.lote || null, vence: l.vence || null, fecha: a.p_fecha || hoy, created_at: new Date().toISOString(), notas: 'Orden de compra' }
      DB.inventario_movimientos.push(m); aplicar(m, l.cantidad); li.recibido += l.cantidad
      if (Number(li.costo_unitario) > 0) DB.productos.find(p => p.id === li.producto_id).costo = li.costo_unitario
    }
    const pendiente = DB.ordenes_compra_lineas.filter(x => x.orden_id === o.id).reduce((n, x) => n + Math.max(0, x.cantidad - x.recibido), 0)
    o.estado = pendiente ? 'parcial' : 'recibida'
    return { data: o.estado, error: null }
  }
  return { data: null, error: null }
}

const session = { user: { id: uid, email: 'demo@conception-gt.com' } }
export const supabaseDemo = {
  from, rpc,
  storage: { from: almacen },
  functions: { invoke: async () => ({ data: null, error: null }) },
  channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }),
  removeChannel: () => {},
  auth: {
    getSession: async () => ({ data: { session } }),
    getUser: async () => ({ data: { user: session.user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => { location.reload(); return {} }, // "Cerrar sesión" restarts the demo
    signInWithOtp: async () => ({ error: null }),
    signInWithPassword: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
  },
}

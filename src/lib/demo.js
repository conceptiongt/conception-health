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
    sin_identificar: false, extra: {}, portal_token: id(), portal_codigo: `${slug}-demo${i}`, portal_activo: i < 3, portal_datos: true, portal_costos: false,
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
  citas_eliminadas: [],
  // hospital structure (empty until the demo clinic is switched to «Hospital» in Configuración → Marca and the owner builds it)
  departamentos: [], profesionales: [], areas: [], recursos: [],
  // Emergencias (hospital): one row per emergency cita, written only through the emergencia_* functions below
  emergencias: [],
  perfiles: [
    { user_id: uid, clinica_id: cid, nombre: 'Dra. Andrea Molina', email: 'demo@conception-gt.com', rol: q.get('personal') === '1' || q.get('rol') === 'asistente' ? 'asistente' : q.get('rol') === 'soporte' ? 'soporte' : 'dueno', permisos: { expedientes: true, inventario: true }, password_creada: true, created_at: '2026-01-01',
      // ?personal=1 previews a hospital staff user (no e-mail): inactivity logout, «Cambiar de usuario», list limited to the linked doctor
      ...(q.get('personal') === '1' ? { email: null, usuario: 'ana.lopez', puesto: 'Médico', activo: q.get('desactivado') !== '1', password_creada: q.get('clave') !== '1', permisos: { expedientes: true, registrar: true, ver_todos_pacientes: q.get('todos') !== '0', profesional_id: q.get('medico') || undefined } } : {}) },
    { user_id: 'demo-u2', clinica_id: cid, nombre: 'Karla Pérez', email: 'asistente@clinicademo.com', rol: 'asistente', permisos: { expedientes: true, inventario: true }, password_creada: true, created_at: '2026-02-01' },
  ],
  clinicas: [{ id: cid, nombre: 'Clínica Demo de Venas', plan: 'ultra', plan_activo: true, plan_hasta: null, promo_hasta: null, promo_codigo_id: null, recurrente_suscripcion_id: null, anios: [], color: '#2091DC', especialidad: q.get('hospital') === '1' ? 'hospital' : 'flebologia', sugeridos_cargados: true, logo_path: null, registro_token: id(), registro_codigo: 'registro-clinica-demo', anticipo_pct: 50, campos_paciente: [], created_at: '2026-01-01' }],
  pacientes, citas, cobros, abonos, servicios, sedes, archivos, gastos, productos, existencias,
  inventario_movimientos: movimientos, invitaciones: [], documentos_compartidos: [],
  // fictional support-code history (the real database never exposes the hash column)
  soporte_accesos: [{ id: 'demo-sa1', clinica_id: cid, creado_por: uid, creado_nombre: 'Dra. Andrea Molina', creado_at: `${dias(-9)}T15:20:00Z`, vence_at: `${dias(-8)}T15:20:00Z`, usado_at: `${dias(-9)}T15:42:00Z`, usado_por: 'demo-agente', usado_nombre: 'Soporte Demo', revocado_at: null, terminado_at: `${dias(-9)}T16:30:00Z` }],
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
    lt(k, v) { filt.push([k, v, 'lt']); return b }, gte(k, v) { filt.push([k, v, 'gte']); return b }, or(txt) { filt.push([null, txt, 'or']); return b }, single() { one = true; return b }, maybeSingle() { maybe = true; return b },
    insert(x) { op = 'insert'; payload = x; return b }, upsert(x) { op = 'upsert'; payload = x; return b }, update(x) { op = 'update'; payload = x; return b }, delete() { op = 'delete'; return b },
    then(res, rej) { return Promise.resolve(correr()).then(res, rej) },
  }
  // PostgREST-like conditions used by the app: «col.is.null», «col.gte.X», «col.neq.X» joined by commas (OR)
  const condicion = (r, c) => {
    const [k, op, ...resto] = c.split('.'), v = resto.join('.')
    if (op === 'is') return (r[k] ?? null) === (v === 'null' ? null : v)
    if (op === 'gte') return r[k] != null && String(r[k]) >= v
    if (op === 'neq') return r[k] !== v
    return r[k] === v
  }
  const coincide = r => filt.every(([k, v, o]) => o === 'in' ? v.includes(r[k]) : o === 'is' ? (r[k] ?? null) === v : o === 'gte' ? r[k] != null && String(r[k]) >= v : o === 'lt' ? r[k] != null && String(r[k]) < v
    : o === 'or' ? v.split(',').some(c => condicion(r, c)) : r[k] === v)
  const sinPermiso = ['cobros', 'abonos'].includes(t) && DB.perfiles[0].rol !== 'dueno'
  function correr() {
    const filas = DB[t] || (DB[t] = [])
    // test switches (demo only): ?em_tabla=falta simulates the missing emergencias table; window.__demoFalla = { tabla, veces } fails the next reads
    if (t === 'emergencias') {
      const m = (window.__demoCuenta ||= { emergencias: 0 }); if (op === 'select') m.emergencias++
      if (op !== 'select') return { data: null, error: { code: '42501', message: 'permission denied for table emergencias' } } // clients only read; writes go through the RPCs
      if (q.get('em_tabla') === 'falta') return { data: null, error: { code: '42P01', message: 'relation "public.emergencias" does not exist' } }
    }
    const f = window.__demoFalla
    if (op === 'select' && f && f.veces > 0 && (f.tabla === t || f.tabla === '*')) { f.veces--; return { data: null, error: { message: 'Failed to fetch' } } }
    if (t === 'pacientes' && op === 'update' && payload.sin_identificar === true && filas.some(r => coincide(r) && !r.sin_identificar)) return { data: null, error: { code: '23514', message: 'CAMPO_INMUTABLE' } }
    if (op === 'select') {
      if (sinPermiso || (t === 'gastos' && DB.perfiles[0].rol !== 'dueno')) return { data: one || maybe ? null : [], error: null }
      let d = filas.filter(coincide).map(r => ({ ...r }))
      if (ord) d.sort((a, x) => String(a[ord[0]] ?? '').localeCompare(String(x[ord[0]] ?? '')) * (ord[1] === false ? -1 : 1))
      return { data: one || maybe ? d[0] || null : d, count: d.length, error: null }
    }
    if (op === 'insert') {
      const lista = [].concat(payload).map(x => ({ id: id(), clinica_id: cid, created_at: new Date().toISOString(), ...x }))
      if (['citas', 'cobros', 'abonos', 'gastos', 'archivos', 'ordenes_compra', 'inventario_movimientos'].includes(t)) lista.forEach(x => { x.fecha = x.fecha || hoy })
      if (t === 'pacientes') lista.forEach(x => { x.sin_identificar = false; x.portal_token = id(); x.portal_codigo = `${(x.nombre || 'paciente').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-demo`; x.extra = x.extra || {}; x.portal_datos = true })
      if (t === 'inventario_movimientos') {
        const copia = JSON.stringify(DB.existencias)
        for (const r of lista) { const err = aplicar(r, r.delta); if (err) { DB.existencias = JSON.parse(copia); return { data: null, error: err } } }
      }
      if (t === 'ordenes_compra') lista.forEach(x => { x.numero = filas.reduce((n, r) => Math.max(n, r.numero), 0) + 1; x.estado = x.estado || 'borrador' })
      if (t === 'ordenes_compra_lineas') lista.forEach(x => { x.recibido = 0 })
      if (t === 'cobros') lista.forEach(x => { x.pagado = 0; x.descuento = x.descuento || 0 })
      if (t === 'documentos_compartidos') lista.forEach(x => { x.codigo = 'documento-demo'; x.token = id() })
      if (t === 'departamentos' || t === 'recursos') { // unique (clinica, name) / (area, name), case-insensitive, like the real indexes
        const clave = (r) => `${t === 'departamentos' ? r.clinica_id : r.area_id}|${String(r.nombre).trim().toLowerCase()}`
        const vistos = new Set(filas.map(clave))
        for (const x of lista) { if (vistos.has(clave(x))) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }; vistos.add(clave(x)) }
      }
      filas.push(...lista)
      if (t === 'abonos') recalcular()
      return { data: one ? lista[0] : lista, error: null }
    }
    if (op === 'upsert') { // only lia_config uses it: one row per clinic
      for (const x of [].concat(payload)) { const r = filas.find(f => f.clinica_id === (x.clinica_id || cid)); if (r) Object.assign(r, x); else filas.push({ clinica_id: cid, ...x }) }
      return { data: null, error: null }
    }
    if (op === 'update') {
      const cambiadas = filas.filter(coincide)
      if ((t === 'departamentos' || t === 'recursos') && payload.nombre && filas.some(r => !cambiadas.includes(r) && (t === 'departamentos' || r.area_id === cambiadas[0]?.area_id) && r.nombre.trim().toLowerCase() === payload.nombre.trim().toLowerCase())) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
      }
      cambiadas.forEach(r => { Object.assign(r, payload); if (t === 'pacientes' && payload.registro_token) r.registro_codigo = `datos-${r.id}` })
      return { data: one ? (cambiadas[0] ? { ...cambiadas[0] } : null) : cambiadas.map(r => ({ ...r })), error: null }
    }
    if (op === 'delete') {
      const quitar = filas.filter(coincide)
      if (t === 'inventario_movimientos') {
        const copia = JSON.stringify(DB.existencias)
        for (const r of quitar) { const err = aplicar(r, -r.delta); if (err) { DB.existencias = JSON.parse(copia); return { error: err } } }
      }
      if (t === 'pacientes') quitar.forEach(p => ['citas', 'cobros', 'archivos', 'emergencias'].forEach(k => { DB[k] = DB[k].filter(x => x.paciente_id !== p.id) }))
      // same effect as the foreign keys of the hospital tables: citas.departamento_id / profesional_id are NO ACTION (23503 when referenced),
      // servicios.departamento_id and profesionales.departamento_id are SET NULL
      const ids = new Set(quitar.map(r => r.id))
      const enUso = (t === 'departamentos' && DB.citas.some(c => ids.has(c.departamento_id))) || (t === 'profesionales' && DB.citas.some(c => ids.has(c.profesional_id)))
      if (enUso) return { data: null, error: { code: '23503', message: `update or delete on table "${t}" violates foreign key constraint on table "citas"` } }
      if (t === 'departamentos') { DB.servicios.forEach(s => { if (ids.has(s.departamento_id)) s.departamento_id = null }); DB.profesionales.forEach(p => { if (ids.has(p.departamento_id)) p.departamento_id = null }) }
      if (t === 'areas') DB.recursos = DB.recursos.filter(r => !ids.has(r.area_id))
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

// ── Emergencias: the three functions of supabase/migraciones-propuestas/2026-11-27_hospital_emergencias.sql, in memory ──
const falla = (message) => ({ data: null, error: { message } })
const ESTADOS_EMERGENCIA = ['espera', 'atencion', 'observacion', 'alta', 'hospitalizado', 'trasladado', 'fallecido', 'retirado']
const CIERRAN = ['alta', 'hospitalizado', 'trasladado', 'fallecido', 'retirado']
function horaGuatemala() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, corta: `${p.day}/${p.month} ${p.hour}:${p.minute}` }
}
function emergenciaRpc(fn, a) {
  const clinica = DB.clinicas[0]
  if (clinica.especialidad !== 'hospital' || DB.perfiles[0].rol === 'soporte') return falla('SIN_PERMISO')
  const ahora = new Date().toISOString()
  if (fn === 'emergencia_registrar') {
    const motivo = String(a.p_motivo || '').trim()
    if (!(a.p_triage >= 1 && a.p_triage <= 5) || motivo.length < 2 || motivo.length > 500) return falla('DATOS_INVALIDOS')
    const prof = a.p_profesional ? DB.profesionales.find(x => x.id === a.p_profesional && x.activo) : null
    if (a.p_profesional && !prof) return falla('REFERENCIA_AJENA')
    const sede = a.p_sede ? DB.sedes.find(x => x.id === a.p_sede) : null
    if (a.p_sede && !sede) return falla('REFERENCIA_AJENA')
    const t = horaGuatemala()
    let pac, sin = false
    if (a.p_paciente) {
      pac = DB.pacientes.find(x => x.id === a.p_paciente)
      if (!pac) return falla('REFERENCIA_AJENA')
    } else {
      let nombre = String(a.p_nombre || '').trim().slice(0, 120)
      const sexo = ['Masculino', 'Femenino', 'Otro'].includes(a.p_sexo) ? a.p_sexo : null
      const edad = String(a.p_edad || '').trim().slice(0, 20)
      if (!nombre) { sin = true; nombre = `Sin identificar — ${t.corta}${sexo ? ' · ' + sexo : ''}${edad ? ' · ' + edad : ''}` }
      pac = { id: id(), clinica_id: cid, nombre, telefono: String(a.p_telefono || '').trim() || null, email: null, origen: 'otro', red: null, referido_por: null, sede_id: sede?.id || null, sexo, sin_identificar: sin,
        extra: {}, portal_token: id(), portal_codigo: `emergencia-demo-${id().slice(0, 6)}`, portal_activo: false, portal_datos: true, created_at: ahora }
      DB.pacientes.push(pac)
    }
    const dep = DB.departamentos.find(d => d.es_emergencia && d.activo)
    const cita = { id: id(), clinica_id: cid, paciente_id: pac.id, fecha: t.fecha, hora: t.hora, tipo: 'Emergencia', estado: 'Pendiente', notas: null, departamento_id: dep?.id || null, profesional_id: prof?.id || null,
      sede_id: sede?.id || null, agendo_nombre: DB.perfiles[0].nombre, ficha: {}, datos: {}, portal: false, portal_ocultar: [], created_at: ahora }
    DB.citas.push(cita)
    DB.emergencias.push({ cita_id: cita.id, clinica_id: cid, paciente_id: pac.id, llegada_at: ahora, triage: a.p_triage, motivo, acompanante: String(a.p_acompanante || '').trim().slice(0, 120) || null,
      estado: 'espera', atendido_at: null, cerrado_at: null, destino_nota: null, registrado_por: uid, registrado_nombre: DB.perfiles[0].nombre, created_at: ahora })
    return { data: { cita_id: cita.id, paciente_id: pac.id, sin_identificar: sin }, error: null }
  }
  const em = DB.emergencias.find(x => x.cita_id === a.p_cita)
  if (!em) return falla('NO_ENCONTRADO')
  if (fn === 'emergencia_estado') {
    if (!ESTADOS_EMERGENCIA.includes(a.p_estado)) return falla('DATOS_INVALIDOS')
    const cierra = CIERRAN.includes(a.p_estado), antes = em.cerrado_at
    em.estado = a.p_estado
    if (!['espera', 'retirado'].includes(a.p_estado)) em.atendido_at = em.atendido_at || ahora
    em.cerrado_at = cierra ? em.cerrado_at || ahora : null
    em.destino_nota = cierra ? String(a.p_nota || '').trim().slice(0, 300) || null : null
    const cita = DB.citas.find(x => x.id === em.cita_id)
    if (cierra) cita.estado = a.p_estado === 'retirado' ? 'No asistió' : 'Asistió'
    else if (antes) cita.estado = 'Pendiente'
    return { data: null, error: null }
  }
  if (fn === 'emergencia_identificar') {
    const actual = DB.pacientes.find(x => x.id === em.paciente_id)
    if (!actual?.sin_identificar) return falla('NO_APLICA')
    if (!a.p_paciente) {
      const nombre = String(a.p_nombre || '').trim().slice(0, 120)
      if (nombre.length < 2) return falla('DATOS_INVALIDOS')
      Object.assign(actual, { nombre, telefono: String(a.p_telefono || '').trim() || actual.telefono, sin_identificar: false })
      return { data: null, error: null }
    }
    const destino = DB.pacientes.find(x => x.id === a.p_paciente)
    if (!destino) return falla('REFERENCIA_AJENA')
    if (destino.sin_identificar || destino.id === actual.id) return falla('DATOS_INVALIDOS')
    // a provisional patient with data typed in its ficha is never merged away
    const CAMPOS = ['alergias', 'enfermedades', 'medicamentos', 'notas_medicas', 'tipo_sangre', 'fecha_nacimiento', 'dpi', 'direccion', 'contacto_emergencia', 'telefono_emergencia', 'email', 'ocupacion', 'estado_civil', 'habitos', 'extra']
    const hayDatos = Object.entries(actual).some(([k, v]) => (CAMPOS.includes(k) || k.startsWith('antecedentes')) && v != null && !(typeof v === 'string' && !v.trim()) && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length))
    if (hayDatos) return falla('PROVISIONAL_CON_DATOS')
    DB.citas.find(x => x.id === em.cita_id).paciente_id = destino.id
    em.paciente_id = destino.id
    DB.archivos.filter(x => x.cita_id === em.cita_id).forEach(x => { x.paciente_id = destino.id })
    DB.cobros.filter(x => x.cita_id === em.cita_id).forEach(x => { x.paciente_id = destino.id })
    DB.inventario_movimientos.filter(x => x.cita_id === em.cita_id).forEach(x => { x.paciente_id = destino.id })
    if (!DB.citas.some(x => x.paciente_id === actual.id)) {
      DB.archivos.filter(x => x.paciente_id === actual.id).forEach(x => { x.paciente_id = destino.id })
      DB.cobros.filter(x => x.paciente_id === actual.id).forEach(x => { x.paciente_id = destino.id })
      DB.inventario_movimientos.filter(x => x.paciente_id === actual.id).forEach(x => { x.paciente_id = destino.id })
      DB.documentos_compartidos.filter(x => x.paciente_id === actual.id).forEach(x => { x.paciente_id = destino.id })
      DB.pacientes = DB.pacientes.filter(x => x.id !== actual.id)
    }
    return { data: null, error: null }
  }
  return { data: null, error: null }
}

// ── Hospital staff users without e-mail (edge functions usuarios-hospital / cambiar-clave and two RPCs), in memory ──
let codigoDemo = 'DEMO-4821'
const cuposDemo = () => ({ ocupados: DB.perfiles.filter(p => p.rol !== 'soporte').length + DB.invitaciones.filter(i => !i.aceptada_at).length, permitidos: Number(q.get('cupos')) || 8 })
const responde = (error, data = {}) => ({ data: error ? { error } : { ok: true, ...data }, error: null })
function funcionDemo(nombre, b) {
  if (nombre === 'cambiar-clave') {
    const claveOk = typeof b.password === 'string' && b.password.length >= 10 && /[A-Za-z]/.test(b.password) && /\d/.test(b.password)
    if (!claveOk) return responde('CLAVE_DEBIL')
    Object.assign(DB.perfiles[0], { password_creada: true, clave_temporal_at: null })
    return responde(null)
  }
  if (nombre !== 'usuarios-hospital') return { data: null, error: null }
  if (DB.clinicas[0].especialidad !== 'hospital') return responde('NO_HOSPITAL')
  const claveOk = typeof b.password === 'string' && b.password.length >= 10 && /[A-Za-z]/.test(b.password) && /\d/.test(b.password)
  const col = ['expedientes', 'finanzas', 'inventario', 'costos', 'compras', 'emergencias', 'exportar', 'eliminar_citas', 'eliminar_inventario', 'eliminar', 'configuracion', 'registrar', 'ver_todos_pacientes', 'quirofano', 'camas']
  const permisosOk = (p) => p && typeof p === 'object' && Object.entries(p).every(([k, v]) => (k === 'profesional_id' ? typeof v === 'string' : col.includes(k) && typeof v === 'boolean'))
  if (b.accion === 'crear') {
    const usuario = String(b.usuario || '').trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,30}$/.test(usuario) || String(b.nombre || '').trim().length < 2 || !permisosOk(b.permisos)) return responde('DATOS_INVALIDOS')
    if (!claveOk) return responde('CLAVE_DEBIL')
    const c = cuposDemo()
    if (c.ocupados >= c.permitidos) return responde('LIMITE_USUARIOS')
    if (DB.perfiles.some(p => p.usuario === usuario)) return responde('USUARIO_OCUPADO')
    const perfil = { user_id: id(), clinica_id: cid, nombre: String(b.nombre).trim(), email: null, rol: 'asistente', permisos: b.permisos, password_creada: false, usuario, puesto: b.puesto || null, activo: true, clave_temporal_at: new Date().toISOString(), created_at: new Date().toISOString() }
    DB.perfiles.push(perfil)
    return responde(null, { perfil: { ...perfil } })
  }
  const u = DB.perfiles.find(p => p.user_id === b.user_id && p.rol === 'asistente' && p.usuario)
  if (!u) return responde('NO_ENCONTRADO')
  if (b.accion === 'restablecer') { if (!claveOk) return responde('CLAVE_DEBIL'); Object.assign(u, { password_creada: false, clave_temporal_at: new Date().toISOString() }); return responde(null, { sesiones: true }) }
  if (b.accion === 'actualizar') {
    if ('permisos' in b && !permisosOk(b.permisos)) return responde('DATOS_INVALIDOS')
    for (const k of ['nombre', 'puesto', 'permisos']) if (k in b) u[k] = b[k]
    return responde(null, { perfil: { ...u } })
  }
  if (b.accion === 'desactivar') { u.activo = false; return responde(null, { sesiones: true, bloqueado: true }) }
  if (b.accion === 'activar') { u.activo = true; return responde(null) }
  if (b.accion === 'eliminar') { DB.perfiles = DB.perfiles.filter(p => p !== u); return responde(null) }
  return responde('ACCION')
}

async function rpc(fn, a) {
  if (fn === 'hospital_usuarios_cupos') return { data: cuposDemo(), error: null }
  if (fn === 'hospital_codigo_acceso') {
    if (DB.clinicas[0].especialidad !== 'hospital') return falla('NO_HOSPITAL')
    if (a?.p_codigo == null) return { data: codigoDemo, error: null }
    const v = String(a.p_codigo).trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/.test(v)) return falla('CODIGO_INVALIDO')
    if (v === 'OCUP-0001') return falla('CODIGO_OCUPADO') // demo of a code another hospital already uses
    codigoDemo = v; return { data: v, error: null }
  }
  if (fn === 'google_estado') return { data: null, error: null } // Google Calendar is not available in the demo (card shows «Disponible pronto»)
  if (fn === 'cita_eliminar') {
    const c = DB.citas.find(x => x.id === a.p_cita)
    const pac = DB.pacientes.find(x => x.id === c.paciente_id)
    DB.citas_eliminadas.unshift({ id: crypto.randomUUID(), cita_id: c.id, paciente_nombre: pac?.nombre, fecha: c.fecha, hora: c.hora, tipo: c.tipo, motivo: a.p_motivo, eliminado_por_nombre: DB.perfiles[0].nombre, eliminado_at: new Date().toISOString() })
    const n = DB.cobros.filter(x => x.cita_id === c.id).length
    DB.cobros = DB.cobros.filter(x => x.cita_id !== c.id); DB.citas = DB.citas.filter(x => x.id !== c.id)
    DB.emergencias = DB.emergencias.filter(x => x.cita_id !== c.id) // cascade of emergencias.cita_id
    DB.abonos = DB.abonos.filter(x => DB.cobros.some(co => co.id === x.cobro_id))
    return { data: { cobros: n, productos: 0 }, error: null }
  }
  if (fn.startsWith('emergencia_')) return emergenciaRpc(fn, a)
  if (fn === 'inventario_eliminar') {
    const tabla = { producto: 'productos', sede: 'sedes', proveedor: 'proveedores', paquete: 'paquetes', categoria: 'categorias_inventario', orden: 'ordenes_compra', movimiento: 'inventario_movimientos' }[a.p_tipo]
    const fila = (DB[tabla] || []).find(x => x.id === a.p_id)
    if (!fila) return { data: null, error: { message: 'NO_ENCONTRADO' } }
    ;(DB.inventario_eliminados ||= []).unshift({ id: crypto.randomUUID(), tipo: a.p_tipo, nombre: fila.nombre || 'Movimiento', motivo: a.p_motivo, eliminado_por_nombre: DB.perfiles[0].nombre, eliminado_at: new Date().toISOString() })
    DB[tabla] = DB[tabla].filter(x => x.id !== a.p_id)
    return { data: { eliminados: 1 }, error: null }
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
  if (fn === 'soporte_generar') {
    const ahora = Date.now()
    DB.soporte_accesos.forEach(x => { if (!x.revocado_at && !x.terminado_at && new Date(x.vence_at).getTime() > ahora) x.revocado_at = new Date(ahora).toISOString() })
    DB.soporte_accesos.unshift({ id: id(), clinica_id: cid, creado_por: uid, creado_nombre: DB.perfiles[0].nombre, creado_at: new Date(ahora).toISOString(), vence_at: new Date(ahora + 24 * 3600 * 1000).toISOString(), usado_at: null, usado_por: null, usado_nombre: null, revocado_at: null, terminado_at: null })
    return { data: 'DEMO7-K2M9Q', error: null }
  }
  if (fn === 'soporte_revocar') {
    DB.soporte_accesos.forEach(x => { if (!x.revocado_at && !x.terminado_at) x.revocado_at = new Date().toISOString() })
    return { data: null, error: null }
  }
  if (fn === 'soporte_estado') { // ?rol=soporte in the address previews the support session
    const soporte = DB.perfiles[0].rol === 'soporte'
    return { data: { agente: soporte, sesion: soporte ? { clinica_id: cid, clinica_nombre: DB.clinicas[0].nombre, vence_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString() } : null }, error: null }
  }
  return { data: null, error: null }
}

const session = { user: { id: uid, email: 'demo@conception-gt.com' } }
export const supabaseDemo = {
  from, rpc,
  storage: { from: almacen },
  functions: { invoke: async (nombre, o) => funcionDemo(nombre, o?.body || {}) },
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

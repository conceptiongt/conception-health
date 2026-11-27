import { C } from './theme'
import { MODO_DEMO } from './config'
import { esHospital } from './especialidades'

export const APP_NOMBRE = 'Conception Health'

export const TIPOS_CITA = ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía']

export const ESTADOS_CITA = [
  { value: 'Pendiente', color: C.amber, bg: C.amberLight },
  { value: 'Confirmada', color: C.blue, bg: C.blueLight },
  { value: 'Asistió', color: C.green, bg: C.greenLight },
  { value: 'No asistió', color: C.red, bg: C.redLight },
  { value: 'Reagendada', color: C.purple, bg: C.purpleLight },
  { value: 'Cancelada', color: C.g500, bg: C.g100 },
]
export const estadoCita = (v) => ESTADOS_CITA.find(e => e.value === v) || ESTADOS_CITA[0]

export const ORIGENES = [
  { value: 'redes', label: 'Redes sociales' },
  { value: 'referido', label: 'Referido' },
  { value: 'google', label: 'Google' },
  { value: 'otro', label: 'Otro' },
]
export const origenLabel = (v) => ORIGENES.find(o => o.value === v)?.label || '—'

export const REDES = ['Instagram', 'Facebook', 'TikTok', 'WhatsApp', 'LinkedIn']

// Blood types offered in every form (patients often do not know theirs)
export const TIPOS_SANGRE = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'No lo sé']

export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'Depósito', 'Otro']

export const ETAPAS_FOTO = [
  { value: 'estudio', label: 'Estudios y documentos' },
  { value: 'antes', label: 'Antes' },
  { value: 'proceso', label: 'Proceso' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'otro', label: 'Otro' },
]

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Trial accounts can register this many patients (also enforced by the database)
export const LIMITE_PRUEBA = 3

// Subscription plans (checkout handled by Recurrente). A priced plan with a Recurrente `link` shows its subscribe button.
// `proximamente: true` plans (Ultra, Lía) show "Próximamente" and no button. `precio: null` without it shows "Precio por anunciar".
// Básico = Health; Max = Básico + inventory per location; Ultra = Max + Lía; Lía = only the receptionist.
// Online checkout is off during the launch trial: prices show, but nobody can pay yet. Set to true to show «Suscribirme».
export const COBRO_ACTIVO = false
export const PLANES = [
  {
    value: 'basico',
    nombre: 'Básico',
    precio: 'Q275',
    link: 'https://app.recurrente.com/s/conception/healt',
    incluye: ['Pacientes ilimitados', 'Citas y seguimiento', 'Expedientes con fotos', 'Cobros y saldos', 'Reportes en Excel y PDF'],
  },
  {
    value: 'max',
    nombre: 'Max',
    precio: 'Q375',
    link: 'https://app.recurrente.com/s/conception/conception-healt-max',
    incluye: ['Todo lo del plan Básico', 'Inventario por sede', 'Descarga de productos desde el expediente', 'Avisos de existencia baja'],
  },
  {
    value: 'ultra',
    nombre: 'Ultra',
    precio: null,
    proximamente: true,
    link: null, // Recurrente link pending
    incluye: ['Todo lo del plan Max', 'Lía, su recepcionista virtual en WhatsApp', 'Agenda y seguimiento automáticos', 'Cada paciente que agenda Lía llega con su expediente'],
  },
  {
    value: 'lia',
    nombre: 'Lía',
    precio: null, // price and Recurrente link pending
    proximamente: true,
    link: null,
    incluye: ['Recepcionista virtual en su WhatsApp', 'Contesta y agenda las 24 horas', 'Recontacta, confirma y recuerda citas', 'Agenda de citas (sin expedientes ni cobros)'],
  },
]
// Hospital accounts (clinicas.especialidad = 'hospital') see ONLY these two plans, never Ultra or Lía. The DB plan values stay 'basico' / 'max'
// (the same `accesos` rules apply). No Recurrente product exists yet (`link: null`; online checkout stays off through COBRO_ACTIVO).
// An `incluye` item can be { texto, pronto: true } for a feature that is not built yet: it shows «(próximamente)» next to it.
export const USUARIOS_EXTRA_HOSPITAL = 'Q50' // per extra user per month (UI text only, see USUARIOS_HOSPITAL)
export const PLANES_HOSPITAL = [
  {
    value: 'basico',
    nombre: 'Hospital Básico',
    sub: 'Conception Health para su hospital',
    precio: 'Q500',
    link: null,
    usuarios: 8,
    incluye: ['Especialidades y médicos a su medida', 'Citas y calendario por médico', 'Expedientes por especialidad', { texto: 'Emergencias 24/7', pronto: true }, 'Cobros y saldos'],
  },
  {
    value: 'max',
    nombre: 'Hospital Max',
    sub: 'Hospital Básico + operación del hospital',
    precio: 'Q750',
    link: null,
    usuarios: 15,
    destacado: true,
    incluye: ['Todo lo del Hospital Básico', { texto: 'Quirófanos', pronto: true }, { texto: 'Camas y hospitalización', pronto: true }, { texto: 'Inventario por especialidad', pronto: true }, { texto: 'Finanzas por especialidad', pronto: true }],
  },
]
// The plans an account can see: hospitals their two, clinics the four of PLANES
export const planesDe = (clinica) => (esHospital(clinica?.especialidad) ? PLANES_HOSPITAL : PLANES)
// Users shown in the UI texts of a hospital plan (8 / 15). The database still enforces USUARIOS_INCLUIDOS + clinicas.usuarios_extra.
export const usuariosIncluidosUI = (clinica) => (esHospital(clinica?.especialidad) ? (PLANES_HOSPITAL.find(p => p.value === clinica?.plan)?.usuarios ?? PLANES_HOSPITAL[0].usuarios) : USUARIOS_INCLUIDOS)
export const precioUsuarioExtraUI = (clinica) => (esHospital(clinica?.especialidad) ? USUARIOS_EXTRA_HOSPITAL : PRECIO_USUARIO_EXTRA)

// Users: every plan includes the administrator + 1 assistant; more users are an extra monthly charge.
// The database enforces the limit (invitaciones_limite); clinicas.usuarios_extra counts the ones bought.
export const USUARIOS_INCLUIDOS = 2
export const PRECIO_USUARIO_EXTRA = 'Q75' // per extra user per month
export const LINK_USUARIO_EXTRA = null // Recurrente link for the "Usuario adicional" product (pending)

// An account is «vencida» (read-only: the owner can only download data, activate a plan or delete the account) when it has had a plan
// ('prueba' = never had one, keeps the 3-patient trial) and that plan is no longer active/paid. Same definition as clinica_vencida() in the database.
export const cuentaVencida = (clinica) => {
  if (MODO_DEMO || !clinica) return false
  const activo = !!clinica.plan_activo && (!clinica.plan_hasta || new Date(clinica.plan_hasta) > new Date())
  return (clinica.plan || 'prueba') !== 'prueba' && !activo
}

export const nombrePlan = (v, clinica) => planesDe(clinica).find(p => p.value === v)?.nombre

// Lía is being finished on its own; until then the menu shows a "coming soon" page
export const LIA_DISPONIBLE = false
// Accounts that already see Lía while it is being finished (Conception's own test clinic)
const LIA_PREVIA = ['5a6ec316-ad70-4468-8812-539eebc5a4e6']
// in the demo everyone sees Lía (her tests stay paused, see LIA_PRUEBAS_PAUSADAS)
export const liaVisible = (clinica) => LIA_DISPONIBLE || MODO_DEMO || LIA_PREVIA.includes(clinica?.id)
// Tests ("Probar") are paused so they do not use AI credits; the server is paused too (secret LIA_IA_ACTIVA)
export const LIA_PRUEBAS_PAUSADAS = false

// What each account can open: Health (patients, files, charges, reports), inventory and/or Lía
// (inventory is also enforced by the database: `inventario_habilitado()`)
export function accesos(clinica, planActivo) {
  const plan = planActivo ? clinica?.plan : null
  return {
    prueba: !planActivo,
    health: !planActivo || plan !== 'lia',
    inventario: !planActivo || plan === 'max' || plan === 'ultra',
    lia: liaVisible(clinica) && (plan === 'ultra' || plan === 'lia'),
  }
}

export const DEPARTAMENTOS = ['Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla', 'Guatemala', 'Huehuetenango', 'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu', 'Sacatepéquez', 'San Marcos', 'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa']

export const TIPOS_SEDE = [
  { value: 'ciudad', label: 'Sede ciudad' },
  { value: 'departamental', label: 'Sede departamental' },
]

export const UNIDADES = ['unidad', 'caja', 'vial', 'ampolla', 'frasco', 'jeringa', 'ml', 'g', 'par', 'paquete']

// Stock movements: sign of the quantity and how they read on screen
export const TIPOS_MOVIMIENTO = {
  entrada: { label: 'Entrada', color: C.green, bg: C.greenLight },
  uso: { label: 'Uso en paciente', color: C.purple, bg: C.purpleLight },
  salida: { label: 'Salida / merma', color: C.red, bg: C.redLight },
  ajuste: { label: 'Ajuste', color: C.amber, bg: C.amberLight },
  traslado: { label: 'Traslado', color: C.blue, bg: C.blueLight },
}

// Reasons offered when deleting an appointment ("Otro" is added automatically)
export const MOTIVOS_ELIMINAR_CITA = ['El paciente canceló', 'Se agendó por error', 'Cita duplicada', 'Se reprogramó en otra cita', 'El paciente no se presentó']

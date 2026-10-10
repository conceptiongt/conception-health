import { C } from './theme'
import { MODO_DEMO } from './config'

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

// Subscription plans (checkout handled by Recurrente). Prices are not announced yet: `precio: null`
// shows "Precio por anunciar" and hides the subscribe button.
// Básico = Health; Max = Básico + inventory per location; Ultra = Max + Lía; Lía = only the receptionist.
export const PLANES = [
  {
    value: 'basico',
    nombre: 'Básico',
    precio: null, // was Q275 / mes
    link: 'https://app.recurrente.com/s/conception/healt',
    incluye: ['Pacientes ilimitados', 'Citas y seguimiento', 'Expedientes con fotos', 'Cobros y saldos', 'Reportes en Excel y PDF'],
  },
  {
    value: 'max',
    nombre: 'Max',
    precio: null, // was Q375 / mes
    link: 'https://app.recurrente.com/s/conception/conception-healt-max',
    incluye: ['Todo lo del plan Básico', 'Inventario por sede', 'Descarga de productos desde el expediente', 'Avisos de existencia baja'],
  },
  {
    value: 'ultra',
    nombre: 'Ultra',
    precio: null,
    link: null, // Recurrente link pending
    incluye: ['Todo lo del plan Max', 'Lía, su recepcionista virtual en WhatsApp', 'Agenda y seguimiento automáticos', 'Cada paciente que agenda Lía llega con su expediente'],
  },
  {
    value: 'lia',
    nombre: 'Lía',
    precio: null, // price and Recurrente link pending
    link: null,
    incluye: ['Recepcionista virtual en su WhatsApp', 'Contesta y agenda las 24 horas', 'Recontacta, confirma y recuerda citas', 'Agenda de citas (sin expedientes ni cobros)'],
  },
]
export const nombrePlan = (v) => PLANES.find(p => p.value === v)?.nombre

// Lía is being finished on its own; until then the menu shows a "coming soon" page
export const LIA_DISPONIBLE = false
// Accounts that already see Lía while it is being finished (Conception's own test clinic)
const LIA_PREVIA = ['5a6ec316-ad70-4468-8812-539eebc5a4e6']
// in the demo everyone sees Lía (her tests stay paused, see LIA_PRUEBAS_PAUSADAS)
export const liaVisible = (clinica) => LIA_DISPONIBLE || MODO_DEMO || LIA_PREVIA.includes(clinica?.id)
// Tests ("Probar") are paused so they do not use AI credits; the server is paused too (secret LIA_IA_ACTIVA)
export const LIA_PRUEBAS_PAUSADAS = true

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

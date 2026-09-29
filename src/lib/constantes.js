import { C } from './theme'

export const APP_NOMBRE = 'Conception Health'

export const TIPOS_CITA = ['Primera consulta', 'Seguimiento', 'Evaluación', 'Procedimiento', 'Cirugía']

export const ESTADOS_CITA = [
  { value: 'Pendiente', color: C.amber, bg: C.amberLight },
  { value: 'Confirmada', color: C.blue, bg: C.blueLight },
  { value: 'Asistió', color: C.green, bg: C.greenLight },
  { value: 'No asistió', color: C.red, bg: C.redLight },
  { value: 'Reagendada', color: C.purple, bg: C.purpleLight },
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

export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'Depósito', 'Otro']

export const ETAPAS_FOTO = [
  { value: 'antes', label: 'Antes' },
  { value: 'proceso', label: 'Proceso' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'otro', label: 'Otro' },
]

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Trial accounts can register this many patients (also enforced by the database)
export const LIMITE_PRUEBA = 3

// Subscription plans (checkout handled by Recurrente)
export const PLANES = [
  {
    value: 'basico',
    nombre: 'Básico',
    precio: 'Q250 / mes',
    link: 'https://app.recurrente.com/s/conception/patienttrack',
    incluye: ['Pacientes ilimitados', 'Citas y seguimiento', 'Expedientes con fotos', 'Cobros y saldos', 'Reportes en Excel y PDF'],
  },
  {
    value: 'max',
    nombre: 'Max',
    precio: 'Precio por definir',
    link: null, // TODO: link de Recurrente del plan Max
    incluye: ['Todo lo del plan Básico', 'Inventario por sede', 'Entradas, salidas y traslados', 'Alertas de producto bajo'],
  },
]

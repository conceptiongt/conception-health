import { C } from './theme'

// Emergencias (hospital accounts). An emergency is a `citas` row (tipo «Emergencia») plus a 1:1 row in `emergencias`.
export const TIPO_EMERGENCIA = 'Emergencia'
export const ZONA = 'America/Guatemala'

// Cita ids that are emergencies: filled by useEmergencias and read by google.js so an emergency is never mirrored to Google Calendar
export const citasEmergencia = new Set()

// Triage: the number and the name are always shown, never the colour alone. color = bar, bg = pale fill, texto = dark readable text (AA on bg).
// `meta` = minutes the patient should wait at most (1 → immediate); amber from half of it, red from all of it, only while «En espera».
export const TRIAGES = [
  { n: 1, label: 'Reanimación', color: '#D1273F', bg: '#FFE0E5', texto: '#8F1329', meta: 0 },
  { n: 2, label: 'Emergencia', color: '#E8710A', bg: '#FFE6D5', texto: '#8A3A00', meta: 10 },
  { n: 3, label: 'Urgencia', color: '#E5A800', bg: '#FFF1C2', texto: '#6B4C00', meta: 30 },
  { n: 4, label: 'Menor', color: '#2E9E5B', bg: '#DDF7CE', texto: '#14582F', meta: 60 },
  { n: 5, label: 'No urgente', color: '#2F6BFF', bg: '#DCE8FF', texto: '#1A3F94', meta: 120 },
]
export const triageDe = (n) => TRIAGES.find(t => t.n === Number(n)) || TRIAGES[2]

// estado → label, colours and whether it closes the emergency
export const ESTADOS_EM = [
  { value: 'espera', label: 'En espera', color: C.amber, bg: C.amberLight, cierra: false },
  { value: 'atencion', label: 'En atención', color: C.blue, bg: C.blueLight, cierra: false },
  { value: 'observacion', label: 'En observación', color: '#5B3FB5', bg: '#EFE3F8', cierra: false },
  { value: 'alta', label: 'Alta', color: C.green, bg: C.greenLight, cierra: true },
  { value: 'hospitalizado', label: 'Hospitalizado', color: '#1A3F94', bg: '#DCE8FF', cierra: true },
  { value: 'trasladado', label: 'Trasladado', color: '#6B4C00', bg: '#FFF1C2', cierra: true },
  { value: 'fallecido', label: 'Falleció', color: '#343B50', bg: '#E4E8F0', cierra: true },
  { value: 'retirado', label: 'Se retiró sin atención', color: C.red, bg: C.redLight, cierra: true },
]
export const estadoEm = (v) => ESTADOS_EM.find(e => e.value === v) || ESTADOS_EM[0]
export const EN_CURSO = ESTADOS_EM.filter(e => !e.cierra)
export const RESULTADOS = ESTADOS_EM.filter(e => e.cierra)

// Quick reasons for the arrival form: a chip prefixes the text
export const MOTIVOS_RAPIDOS = ['Dolor', 'Trauma/golpe', 'Dificultad para respirar', 'Fiebre', 'Herida', 'Accidente', 'Embarazo', 'Otro']

export const SEXOS_EM = [
  { value: 'Masculino', label: 'Masculino' },
  { value: 'Femenino', label: 'Femenino' },
  { value: 'Otro', label: 'No determinado' },
]

export const esSinIdentificar = (p) => !!p?.sin_identificar

// ── time ──
const ms = (t) => (t ? new Date(t).getTime() : NaN)
export const minutosEntre = (a, b) => (Number.isFinite(ms(a)) && Number.isFinite(ms(b)) ? Math.max(0, Math.round((ms(b) - ms(a)) / 60000)) : null)

// «hace 12 min» · «hace 2 h 5 min» · «hace 1 día»
export function haceTexto(desde, ahora = Date.now()) {
  const min = Math.max(0, Math.floor((ahora - ms(desde)) / 60000))
  if (!Number.isFinite(min)) return '—'
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  if (min < 1440) { const h = Math.floor(min / 60), r = min % 60; return `hace ${h} h${r ? ` ${r} min` : ''}` }
  const d = Math.floor(min / 1440)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}
// «12 min» · «2 h 5 min» for durations
export function duracionTexto(min) {
  if (min == null || !Number.isFinite(min)) return '—'
  if (min < 1) return '< 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), r = min % 60
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h${r ? ` ${r} min` : ''}`
}
// How late is a patient still waiting: 'ok' | 'ambar' | 'rojo' (only while «En espera»)
export function demora(em, ahora = Date.now()) {
  if (!em || em.estado !== 'espera') return 'ok'
  const min = (ahora - ms(em.llegada_at)) / 60000
  const meta = triageDe(em.triage).meta
  if (min >= meta) return 'rojo'
  return min >= meta / 2 ? 'ambar' : 'ok'
}
export const COLOR_DEMORA = {
  ok: { color: C.g600, bg: C.g100 },
  ambar: { color: C.amber, bg: C.amberLight },
  rojo: { color: C.red, bg: C.redLight },
}

const fmt = (t, opts) => new Date(t).toLocaleString('es-GT', { timeZone: ZONA, ...opts })
export const horaGT = (t) => (t ? fmt(t, { hour: '2-digit', minute: '2-digit', hour12: false }) : '—')
export const fechaHoraGT = (t) => (t ? fmt(t, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—')
// today and N days ago as YYYY-MM-DD in Guatemala (the hospital's clock, not the browser's)
export const hoyGT = (dias = 0) => {
  const d = new Date(Date.now() - dias * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
// date (YYYY-MM-DD, Guatemala) of an arrival
export const fechaLlegada = (em) => em?.llegada_at ? hoyGTDe(em.llegada_at) : ''
export const hoyGTDe = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))

// error → plain Spanish for the toast
export function mensajeEmergencia(error, porDefecto = 'No se pudo guardar') {
  const t = `${error?.message || ''} ${error?.hint || ''}`
  if (t.includes('LIMITE_PRUEBA')) return 'La versión de prueba permite 3 pacientes. Active su suscripción para registrar más.'
  if (t.includes('SIN_PERMISO')) return 'Su usuario no puede registrar emergencias en este momento'
  if (t.includes('NO_ENCONTRADO')) return 'No se encontró la emergencia. Actualice la lista'
  if (t.includes('NO_APLICA')) return 'Este paciente ya está identificado. Actualice la lista'
  if (t.includes('REFERENCIA_AJENA')) return 'Ese dato no pertenece a su hospital'
  return porDefecto
}

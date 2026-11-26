// Pure helpers for the calendar views, the date/time picker and the colour preferences (no React here).
// Dates are always 'YYYY-MM-DD' strings and hours 'HH:MM' strings, so there are no timezone shifts.
import { supabase } from './supabase'
import { MESES, ESTADOS_CITA } from './constantes'
import { valido, mezclar, contraste } from './theme'
import { toast } from '../components/ui/Toast'

export const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
export const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
export const DIAS_INICIAL = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
export const DURACION_DEFECTO = 60
// appointments in these states do not take up the agenda
export const NO_OCUPAN = ['Cancelada', 'No asistió', 'Reagendada']

const pad = (n) => String(n).padStart(2, '0')
export const isoDe = (y, mes0, d) => `${y}-${pad(mes0 + 1)}-${pad(d)}`
export const partesISO = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return { y, m: m - 1, d } }
// Round-trip check rejects impossible dates such as 2026-02-31
export const esISO = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false
  const f = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(f.getTime()) && f.toISOString().slice(0, 10) === s
}

// Add days with UTC math (no daylight-saving surprises)
export function sumarDias(iso, n) {
  const { y, m, d } = partesISO(iso)
  const f = new Date(Date.UTC(y, m, d + n))
  return isoDe(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate())
}
// Monday = 0 … Sunday = 6
export const diaSemana = (iso) => { const { y, m, d } = partesISO(iso); return (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7 }
export const inicioSemana = (iso) => sumarDias(iso, -diaSemana(iso))
export const sumarMeses = (iso, n) => {
  const { y, m } = partesISO(iso)
  const t = y * 12 + m + n
  return isoDe(Math.floor(t / 12), ((t % 12) + 12) % 12, 1)
}

// 'jueves 26 de noviembre de 2026'
export function fechaLarga(iso) {
  if (!esISO(iso)) return ''
  const { y, m, d } = partesISO(iso)
  return `${DIAS_LARGOS[diaSemana(iso)]} ${d} de ${MESES[m].toLowerCase()} de ${y}`
}
export const mayuscula = (s) => s ? s[0].toUpperCase() + s.slice(1) : s

// Weeks (Monday first) of a month: [[{ iso, dia, delMes }]] — always full weeks
export function matrizMes(y, mes0) {
  const primero = isoDe(y, mes0, 1)
  let dia = inicioSemana(primero)
  const semanas = []
  for (let s = 0; s < 6; s++) {
    const fila = []
    for (let i = 0; i < 7; i++) { fila.push({ iso: dia, dia: partesISO(dia).d, delMes: partesISO(dia).m === mes0 }); dia = sumarDias(dia, 1) }
    if (s >= 4 && !fila.some(x => x.delMes)) break // do not add an empty last week
    semanas.push(fila)
  }
  return semanas
}

// time helpers
export const aMinutos = (h) => { if (!h) return null; const [a, b] = h.slice(0, 5).split(':').map(Number); return a * 60 + (b || 0) }
export const deMinutos = (n) => `${pad(Math.floor(n / 60) % 24)}:${pad(n % 60)}`
export const duracionCita = (c) => Number(c?.duracion) > 0 ? Number(c.duracion) : DURACION_DEFECTO
export function textoDuracion(min) {
  if (min === 60) return '1 hora'
  if (min % 60 === 0) return `${min / 60} horas`
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

// 07:00 … 20:00 every 30 minutes
export const HORAS = (() => { const l = []; for (let m = 7 * 60; m <= 20 * 60; m += 30) l.push(deMinutos(m)); return l })()

// { 'YYYY-MM-DD': [cita sorted by hour] }
export function agruparPorDia(citas) {
  const g = {}
  for (const c of citas) { if (c.fecha) (g[c.fecha.slice(0, 10)] ||= []).push(c) }
  for (const k in g) g[k].sort((a, b) => (a.hora || '').localeCompare(b.hora || ''))
  return g
}

// Read-only Google events → { 'YYYY-MM-DD': [event] } for the days inside [desde, hasta]. All-day events (end already inclusive) are
// repeated on every day they cover; timed ones sit on their start day with a `duracion` (until midnight when they run past it).
// They carry `g: true` so the views can tell them apart from citas.
export function agruparGoogle(eventos, desde, hasta) {
  const g = {}
  for (const ev of eventos || []) {
    if (!esISO(ev?.fecha)) continue
    if (ev.todoElDia) {
      const fin = esISO(ev.finFecha) && ev.finFecha > ev.fecha ? ev.finFecha : ev.fecha
      let d = ev.fecha < desde ? desde : ev.fecha
      for (let n = 0; d <= fin && d <= hasta && n < 70; n++, d = sumarDias(d, 1)) (g[d] ||= []).push({ ...ev, g: true, hora: null, clave: `${ev.id}|${d}` })
    } else if (ev.fecha >= desde && ev.fecha <= hasta) {
      const ini = aMinutos(ev.hora) ?? 0
      const fin = ev.finFecha === ev.fecha && ev.finHora ? aMinutos(ev.finHora) : 1440
      ;(g[ev.fecha] ||= []).push({ ...ev, g: true, duracion: Math.max(fin - ini, 15), clave: `${ev.id}|${ev.fecha}` })
    }
  }
  for (const k in g) g[k].sort((a, b) => (a.hora || '').localeCompare(b.hora || ''))
  return g
}

// 0 libre, 1 ocupado (1–4 citas), 2 muy ocupado (5 or more)
export const nivelOcupacion = (n) => n >= 5 ? 2 : n >= 1 ? 1 : 0
export const NIVELES = [
  { nivel: 0, label: 'Libre', color: '#34B36B' },
  { nivel: 1, label: 'Ocupado', color: '#E0A100' },
  { nivel: 2, label: 'Muy ocupado', color: '#E5484D' },
]
// appointments of a day that take up the agenda, optionally for one location only
export const citasActivas = (lista, sedeId) => (lista || []).filter(c => !NO_OCUPAN.includes(c.estado) && (!sedeId || c.sede_id === sedeId))
export const ocupacionDelDia = (porDia, iso, sedeId) => citasActivas(porDia[iso], sedeId).length

// Appointments of the same day (and location, if given) that overlap [hora, hora + duracion)
export function citasQueChocan(citas, { fecha, hora, sedeId, citaId, duracion = DURACION_DEFECTO }) {
  const ini = aMinutos(hora)
  if (!fecha || ini == null) return []
  const fin = ini + duracion
  return citasActivas(citas.filter(c => c.fecha?.slice(0, 10) === fecha && c.id !== citaId && c.hora), sedeId).filter(c => {
    const a = aMinutos(c.hora)
    return a < fin && ini < a + duracionCita(c)
  })
}

// ─── colours ───
// A calm medical palette: blue, sky, teal, indigo, violet, amber. Each consultation type gets one by its name.
export const PALETA = ['#2F6BFF', '#0E9AC4', '#14998A', '#5B5BD6', '#8B5CF6', '#D98A00']
const hash = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }
// ESTADOS_CITA colours are text colours (one is a CSS variable): use the hex ones, a violet for the variable
export const colorBaseEstado = (estado) => {
  const c = ESTADOS_CITA.find(e => e.value === estado)?.color
  return valido(c) ? c : '#6B5BD6'
}
export const colorBaseTipo = (tipo) => PALETA[hash(tipo || 'Consulta') % PALETA.length]

// { base, fondo, texto, borde } from one hex: a pale card with dark text that always passes AA (4.5:1)
export function estiloColor(hex) {
  const base = valido(hex) ? hex : PALETA[0]
  const fondo = mezclar(base, '#FFFFFF', 0.86)
  let texto = mezclar(base, '#000000', 0.5)
  for (let t = 0.6; contraste(texto, fondo) < 4.5 && t < 1.01; t += 0.1) texto = mezclar(base, '#000000', t)
  return { base, fondo, texto, borde: mezclar(base, '#FFFFFF', 0.55) }
}

// prefs = { colorPor: 'tipo' | 'estado', colores: { 'tipo:Cirugía': '#RRGGBB', 'estado:Pendiente': '#RRGGBB' } }
export const PREFS_DEFECTO = { colorPor: 'tipo', colores: {} }
export function normalizarPrefs(p) {
  const colores = {}
  const entradas = Object.entries(p?.colores && typeof p.colores === 'object' ? p.colores : {})
    .filter(([k, v]) => typeof k === 'string' && k.length <= 80 && valido(v)).slice(0, 40)
  for (const [k, v] of entradas) colores[k] = v.toUpperCase()
  return { colorPor: p?.colorPor === 'estado' ? 'estado' : 'tipo', colores }
}
export const colorDeCita = (cita, prefs) => {
  const por = prefs.colorPor
  const clave = por === 'estado' ? `estado:${cita.estado}` : `tipo:${cita.tipo || 'Consulta'}`
  return estiloColor(prefs.colores[clave] || (por === 'estado' ? colorBaseEstado(cita.estado) : colorBaseTipo(cita.tipo)))
}
export const colorDeClave = (clave, prefs) => {
  const [por, nombre] = [clave.split(':')[0], clave.slice(clave.indexOf(':') + 1)]
  return prefs.colores[clave] || (por === 'estado' ? colorBaseEstado(nombre) : colorBaseTipo(nombre))
}

// ─── preferences: the clinic row when it has the `calendario` column, otherwise this device ───
const llaveLocal = (clinica) => `ch-calendario-${clinica?.id || 'x'}`
const leerLocal = (clinica) => {
  try { const t = localStorage.getItem(llaveLocal(clinica)); return t ? JSON.parse(t) : null } catch { return null }
}
const guardarLocal = (clinica, prefs) => { try { localStorage.setItem(llaveLocal(clinica), JSON.stringify(prefs)) } catch { /* private window */ } }

export function leerPreferencias(clinica) {
  const remoto = clinica && 'calendario' in clinica ? clinica.calendario : null
  // an empty {} means "nothing saved yet" (that is the column default)
  if (remoto && typeof remoto === 'object' && !Array.isArray(remoto) && Object.keys(remoto).length) return normalizarPrefs(remoto)
  const local = leerLocal(clinica)
  return local && typeof local === 'object' ? normalizarPrefs(local) : { ...PREFS_DEFECTO }
}

// Returns { remoto, fallo, prefs } — when remoto is true the caller refreshes the session so `clinica` carries the new value
export async function guardarPreferencias(clinica, prefs) {
  const limpio = normalizarPrefs(prefs)
  if (clinica && 'calendario' in clinica) {
    // .select('id') so we can tell when RLS let 0 rows through (update silently ignored)
    const { data, error } = await supabase.from('clinicas').update({ calendario: limpio }).eq('id', clinica.id).select('id')
    if (!error && data && data.length > 0) return { remoto: true, fallo: false, prefs: limpio }
    guardarLocal(clinica, limpio)
    toast.error('No se pudo guardar para toda la clínica; los colores quedaron guardados en este equipo')
    return { remoto: false, fallo: true, prefs: limpio }
  }
  guardarLocal(clinica, limpio)
  return { remoto: false, fallo: false, prefs: limpio }
}

// per-device view settings
const LLAVE_VISTA = 'ch-calendario-vista'
export function leerVista() {
  try { const v = JSON.parse(localStorage.getItem(LLAVE_VISTA) || '{}'); return { vista: ['mes', 'semana', 'dia'].includes(v.vista) ? v.vista : 'mes', colorPor: ['tipo', 'estado'].includes(v.colorPor) ? v.colorPor : null } } catch { return { vista: 'mes', colorPor: null } }
}
// «Google» toggle of the Calendario (on by default), remembered per device
const LLAVE_GOOGLE = 'ch-calendario-google'
export const leerVerGoogle = () => { try { return localStorage.getItem(LLAVE_GOOGLE) !== '0' } catch { return true } }
export const guardarVerGoogle = (v) => { try { localStorage.setItem(LLAVE_GOOGLE, v ? '1' : '0') } catch { /* private window */ } }
export function guardarVista(v) { try { localStorage.setItem(LLAVE_VISTA, JSON.stringify(v)) } catch { /* private window */ } }

// «Nueva cita» chosen from a clicked day / hour in the Calendario: Registrar opens with that date (and hour) already filled in.
// Kept in sessionStorage for one minute and read without consuming it (React may run an initialiser twice); Registrar clears it once mounted.
const LLAVE_PRE = 'ch-registrar-pre'
export function guardarPrefillCita({ fecha, hora }) {
  try { sessionStorage.setItem(LLAVE_PRE, JSON.stringify({ fecha, hora: hora || '', t: Date.now() })) } catch { /* private window */ }
}
export function leerPrefillCita() {
  try {
    const o = JSON.parse(sessionStorage.getItem(LLAVE_PRE) || 'null')
    if (!o || Date.now() - Number(o.t) > 60000 || !esISO(o.fecha)) return null
    return { fecha: o.fecha, hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(o.hora) ? o.hora : '' }
  } catch { return null }
}
export function limpiarPrefillCita() { try { sessionStorage.removeItem(LLAVE_PRE) } catch { /* private window */ } }

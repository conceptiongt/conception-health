// The clinic's own calendar events («Nuevo evento» in the Calendario), stored in lia_config.config (one row per clinic) in TWO arrays:
//   config.bloqueos → events that make the time «no disponible». The receptionist (Lía, supabase/functions/lia-responder) treats EVERY entry of
//                      this array as unavailable time, so a blocking event made here is respected by her too.
//   config.eventos  → flexible events (reminders): bookings are allowed over them. Lía ignores this key.
// Both arrays share the same entry shape (the server ignores unknown keys):
//   { id, fecha: 'YYYY-MM-DD', hasta_fecha: 'YYYY-MM-DD' | '', desde: 'HH:MM' | '', hasta: 'HH:MM' | '', motivo: string (the title),
//     nota?: string, meet?: true (a Google Meet link was requested), meet_url?: 'https://meet.google.com/…' (only ever set from the server answer) }
// `id` = 32 lowercase hex chars (older blocks made in Lía's settings have none: they get one the first time they are edited).
// Interpretation (identical to the server's `ocupados()` for blocking entries):
//   · it covers a day when fecha <= day <= (hasta_fecha || fecha)
//   · no desde and no hasta = the whole day; a lone desde/hasta is open on the other side (00:00 / 24:00)
//   · a slot [m, m + dur) is blocked when m < fin && m + dur > ini
// In memory the UI uses ONE list of `{ ...entry, bloquea: boolean }` (bloquea = lives in config.bloqueos).
import { supabase } from './supabase'
import { configBase } from './lia'
import { aMinutos, esISO, sumarDias } from './calendario'
import { hoyISO } from './formato'

export const MAX_DIAS_EVENTO = 366
export const MAX_TITULO = 60
export const MAX_NOTA = 300
export const MAX_ENTRADAS = 400 // per array
export const DIAS_ATRAS_MAX = 180 // entries that ended earlier than this are dropped when saving
export const TITULOS_RAPIDOS = ['Reunión de equipo', 'Capacitación', 'Viaje', 'Vacaciones', 'Personal', 'Teleconsulta']
// hatched look shared by every view (calendar, pickers)
export const RAYADO = (alfa = 0.16) => `repeating-linear-gradient(45deg, rgba(72,80,104,${alfa}) 0, rgba(72,80,104,${alfa}) 5px, rgba(72,80,104,0) 5px, rgba(72,80,104,0) 10px)`
export const COLOR_BLOQUEO = '#485068'

const ID_RE = /^[0-9a-f]{32}$/
const URL_MEET = 'https://meet.google.com/'
export const esIdValido = (id) => typeof id === 'string' && ID_RE.test(id)
export const esMeetUrl = (u) => typeof u === 'string' && u.startsWith(URL_MEET) && u.length <= 200 && !/\s/.test(u)
export const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')

export const tituloDe = (e) => (e?.motivo || '').trim() || (e?.bloquea === false ? 'Evento' : 'Bloqueo')
const claveEntrada = (b) => [b.fecha, b.hasta_fecha || '', b.desde || '', b.hasta || '', b.motivo || ''].join('|')
// same entry: by id when both have one, otherwise by content (blocks made in Lía's settings have no id)
// First entry matching `b` (by id, or by content when a legacy entry has no id). Used to touch ONLY that one when several identical legacy entries exist.
export const indiceEntrada = (l, b) => l.findIndex(x => mismaEntrada(x, b))
export const mismaEntrada = (a, b) => !!a && !!b && (a.id && b.id ? a.id === b.id : claveEntrada(a) === claveEntrada(b))

const finDe = (b) => (b.hasta_fecha || b.fecha)
export const cubreFecha = (b, iso) => esISO(b?.fecha) && iso >= b.fecha && iso <= finDe(b)
export const esTodoElDia = (b) => !b.desde && !b.hasta

// Every entry that covers one date, whole-day first, then by start hour. Each carries the original entry in `entrada`.
export function entradasDelDia(lista, fechaISO) {
  const out = []
  for (const b of lista || []) {
    if (!cubreFecha(b, fechaISO)) continue
    const ini = b.desde ? aMinutos(b.desde) : 0
    const fin = b.hasta ? aMinutos(b.hasta) : 1440
    out.push({ titulo: tituloDe(b), todoElDia: esTodoElDia(b), desde: b.desde || '', hasta: b.hasta || '', ini, fin, bloquea: b.bloquea === true, meetUrl: esMeetUrl(b.meet_url) ? b.meet_url : '', entrada: b })
  }
  return out.sort((a, c) => Number(c.todoElDia) - Number(a.todoElDia) || a.ini - c.ini)
}
// «No disponible» helpers: ONLY entries with bloquea === true count (flexible events never mark a day or a slot as taken)
export const bloqueosDelDia = (lista, fechaISO) => entradasDelDia((lista || []).filter(b => b.bloquea === true), fechaISO)
export const diaBloqueado = (lista, fecha) => bloqueosDelDia(lista, fecha).find(b => b.todoElDia) || null
// the blocking entry overlapping [hora, hora + duracionMin) on that date, or null
export function horaBloqueada(lista, fecha, hora, duracionMin = 60) {
  const m = aMinutos(hora)
  if (!esISO(fecha) || m == null) return null
  return bloqueosDelDia(lista, fecha).find(b => m < b.fin && m + duracionMin > b.ini) || null
}

export const limpiarTitulo = (t) => String(t || '').replace(/[<>]/g, '').trim().slice(0, MAX_TITULO)
export const limpiarNota = (t) => String(t || '').replace(/[<>]/g, '').trim().slice(0, MAX_NOTA)
// the entry as it is stored: no `bloquea` flag (the array it sits in says it), only known keys, `id` always present
export function limpiarEntrada(b) {
  const hasta_fecha = b.hasta_fecha && b.hasta_fecha > b.fecha ? b.hasta_fecha : ''
  const nota = limpiarNota(b.nota)
  return {
    id: esIdValido(b.id) ? b.id : nuevoId(),
    fecha: b.fecha, hasta_fecha, desde: b.desde || '', hasta: b.hasta || '', motivo: limpiarTitulo(b.motivo),
    ...(nota ? { nota } : {}),
    ...(b.meet === true ? { meet: true } : {}),
    ...(esMeetUrl(b.meet_url) ? { meet_url: b.meet_url } : {}),
  }
}
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)

// null when valid, otherwise the message for the user
export function validarEntrada(b) {
  if (!limpiarTitulo(b?.motivo)) return 'Escriba el título del evento'
  if (!esISO(b?.fecha)) return 'Elija la fecha del evento'
  if (b.hasta_fecha) {
    if (!esISO(b.hasta_fecha)) return 'La fecha final no es válida'
    if (b.hasta_fecha < b.fecha) return 'La fecha final debe ser igual o posterior a la inicial'
    if (diasEntre(b.fecha, b.hasta_fecha) + 1 > MAX_DIAS_EVENTO) return `El evento no puede pasar de ${MAX_DIAS_EVENTO} días`
  }
  if (!!b.desde !== !!b.hasta) return 'Elija la hora de inicio y la de fin, o marque todo el día'
  if (b.desde && (aMinutos(b.desde) == null || aMinutos(b.hasta) == null || aMinutos(b.hasta) <= aMinutos(b.desde))) return 'La hora final debe ser después de la inicial'
  if (String(b.motivo || '').length > MAX_TITULO) return `El título no puede pasar de ${MAX_TITULO} caracteres`
  if (String(b.nota || '').length > MAX_NOTA) return `La nota no puede pasar de ${MAX_NOTA} caracteres`
  return null
}

// ---- data access ----
const lista = (arr) => (Array.isArray(arr) ? arr.filter(b => b && typeof b === 'object' && esISO(b.fecha)) : [])
const orden = (l) => [...l].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.desde || '').localeCompare(b.desde || ''))
const separar = (config) => ({
  bloqueos: orden(lista(config?.bloqueos).map(e => ({ ...e, bloquea: true }))),
  eventos: orden(lista(config?.eventos).map(e => ({ ...e, bloquea: false }))),
})
// both arrays as ONE sorted list for the UI
export const unirAgenda = ({ bloqueos, eventos }) => orden([...bloqueos, ...eventos])

export async function leerAgenda(clinicaId) {
  if (!clinicaId) return { bloqueos: [], eventos: [] }
  const { data, error } = await supabase.from('lia_config').select('config').eq('clinica_id', clinicaId).maybeSingle()
  if (error) throw new Error('No se pudieron cargar los eventos')
  return separar(data?.config)
}

// Re-reads the CURRENT config, applies fn(currentList) (the unified list, `bloquea` included; fn returns the next one) and writes back only the
// `bloqueos` and `eventos` keys merged into the existing config, so other receptionist settings changed meanwhile are kept. The row is always the
// session clinic's. Moving an entry between «no disponible» and flexible = returning it with another `bloquea`: both arrays change in ONE write.
// With no row yet it is created with the same defaults the receptionist's settings use. Returns the saved unified list.
export async function guardarAgenda(clinica, fn) {
  const clinicaId = clinica?.id
  if (!clinicaId) throw new Error('No se pudo guardar el evento')
  const { data, error } = await supabase.from('lia_config').select('config').eq('clinica_id', clinicaId).maybeSingle()
  if (error) throw new Error('No se pudo guardar el evento')
  const { bloqueos, eventos } = separar(data?.config)
  const actuales = [...bloqueos, ...eventos]
  // entries fn leaves untouched (same object) are written back exactly as stored; only new or edited ones are cleaned and validated
  const siguiente = (fn(actuales) || []).map(b => actuales.includes(b) ? b : { ...limpiarEntrada(b), bloquea: b.bloquea === true })
  if (siguiente.some(b => !actuales.includes(b) && validarEntrada(b))) throw new Error('El evento no es válido')
  const limite = sumarDias(hoyISO(), -DIAS_ATRAS_MAX)
  const aGuardar = (esBloqueo) => siguiente
    .filter(b => (b.bloquea === true) === esBloqueo && finDe(b) >= limite) // entries that ended long ago are dropped silently
    .map(({ bloquea, ...resto }) => resto)
  const nb = aGuardar(true), ne = aGuardar(false)
  if ((nb.length > MAX_ENTRADAS && nb.length > bloqueos.length) || (ne.length > MAX_ENTRADAS && ne.length > eventos.length)) throw new Error(`Se llegó al máximo de ${MAX_ENTRADAS} eventos. Quite algunos para agregar más.`)
  if (data) {
    const nueva = { ...(data.config || {}), bloqueos: nb, eventos: ne }
    const { data: filas, error: e } = await supabase.from('lia_config').update({ config: nueva, updated_at: new Date().toISOString() }).eq('clinica_id', clinicaId).select('clinica_id')
    if (e || !filas?.length) throw new Error('No se pudo guardar el evento')
  } else {
    const { error: e } = await supabase.from('lia_config').insert({ clinica_id: clinicaId, config: { ...configBase(clinica), bloqueos: nb, eventos: ne } })
    if (e) {
      // someone created the row in between: apply the change on top of theirs
      if (e.code === '23505') return guardarAgenda(clinica, fn)
      throw new Error('No se pudo guardar el evento')
    }
  }
  return unirAgenda({ bloqueos: nb.map(e => ({ ...e, bloquea: true })), eventos: ne.map(e => ({ ...e, bloquea: false })) })
}

// second small write after Google answered: stores the Meet link on the entry (only a real Meet URL is accepted)
export async function guardarMeetUrl(clinica, id, url) {
  if (!esIdValido(id) || !esMeetUrl(url)) return null
  return guardarAgenda(clinica, (l) => l.map(e => e.id === id ? { ...e, meet_url: url } : e))
}

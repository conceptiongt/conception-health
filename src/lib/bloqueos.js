// Agenda blocks (days, date ranges or hours the clinic is not available).
// Stored in lia_config.config.bloqueos (one row per clinic) — the SAME list the receptionist (Lía) reads in
// supabase/functions/lia-responder when it offers hours, so a block made in the Calendario is respected by both.
//   { id?, fecha: 'YYYY-MM-DD', hasta_fecha: 'YYYY-MM-DD' | '', desde: 'HH:MM' | '', hasta: 'HH:MM' | '', motivo: string }
// Interpretation (identical to the server's `ocupados()`):
//   · it covers a day when fecha <= day <= (hasta_fecha || fecha)
//   · no desde and no hasta = the whole day; a lone desde/hasta is open on the other side (00:00 / 24:00)
//   · a slot [m, m + dur) is blocked when m < fin && m + dur > ini
// `id` is optional (older blocks made in Lía's settings have none); the server ignores unknown keys.
import { supabase } from './supabase'
import { configBase } from './lia'
import { aMinutos, esISO, sumarDias } from './calendario'

export const MAX_DIAS_BLOQUEO = 366
export const MAX_TITULO = 60
export const TITULOS_RAPIDOS = ['Viaje', 'Capacitación', 'Congreso', 'Vacaciones', 'Personal']
// hatched look shared by every view (calendar, pickers)
export const RAYADO = (alfa = 0.16) => `repeating-linear-gradient(45deg, rgba(72,80,104,${alfa}) 0, rgba(72,80,104,${alfa}) 5px, rgba(72,80,104,0) 5px, rgba(72,80,104,0) 10px)`
export const COLOR_BLOQUEO = '#485068'

export const tituloDe = (b) => (b?.motivo || '').trim() || 'Bloqueo'
export const claveBloqueo = (b) => [b.fecha, b.hasta_fecha || '', b.desde || '', b.hasta || '', b.motivo || ''].join('|')
// same block: by id when both have one, otherwise by content (blocks made in Lía's settings have no id)
export const mismoBloqueo = (a, b) => !!a && !!b && (a.id && b.id ? a.id === b.id : claveBloqueo(a) === claveBloqueo(b))
export const nuevoId = () => `b_${(crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/-/g, '').slice(0, 12)}`

const finDe = (b) => (b.hasta_fecha || b.fecha)
export const cubreFecha = (b, iso) => esISO(b?.fecha) && iso >= b.fecha && iso <= finDe(b)
export const esTodoElDia = (b) => !b.desde && !b.hasta

// Blocks that cover one date, whole-day first, then by start hour. Each carries the original block in `bloqueo`.
export function bloqueosDelDia(bloqueos, fechaISO) {
  const out = []
  for (const b of bloqueos || []) {
    if (!cubreFecha(b, fechaISO)) continue
    const ini = b.desde ? aMinutos(b.desde) : 0
    const fin = b.hasta ? aMinutos(b.hasta) : 1440
    out.push({ titulo: tituloDe(b), todoElDia: esTodoElDia(b), desde: b.desde || '', hasta: b.hasta || '', ini, fin, bloqueo: b })
  }
  return out.sort((a, c) => Number(c.todoElDia) - Number(a.todoElDia) || a.ini - c.ini)
}
export const diaBloqueado = (bloqueos, fecha) => bloqueosDelDia(bloqueos, fecha).find(b => b.todoElDia) || null
// the block overlapping [hora, hora + duracionMin) on that date, or null
export function horaBloqueada(bloqueos, fecha, hora, duracionMin = 60) {
  const m = aMinutos(hora)
  if (!esISO(fecha) || m == null) return null
  return bloqueosDelDia(bloqueos, fecha).find(b => m < b.fin && m + duracionMin > b.ini) || null
}

export const limpiarTitulo = (t) => String(t || '').replace(/[<>]/g, '').trim().slice(0, MAX_TITULO)
export function limpiarBloqueo(b) {
  const hasta_fecha = b.hasta_fecha && b.hasta_fecha > b.fecha ? b.hasta_fecha : ''
  const out = { fecha: b.fecha, hasta_fecha, desde: b.desde || '', hasta: b.hasta || '', motivo: limpiarTitulo(b.motivo) }
  return b.id ? { id: b.id, ...out } : out
}
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)

// null when valid, otherwise the message for the user
export function validarBloqueo(b) {
  if (!esISO(b?.fecha)) return 'Elija la fecha del bloqueo'
  if (b.hasta_fecha) {
    if (!esISO(b.hasta_fecha)) return 'La fecha final no es válida'
    if (b.hasta_fecha < b.fecha) return 'La fecha final debe ser igual o posterior a la inicial'
    if (diasEntre(b.fecha, b.hasta_fecha) + 1 > MAX_DIAS_BLOQUEO) return `El bloqueo no puede pasar de ${MAX_DIAS_BLOQUEO} días`
  }
  if (!!b.desde !== !!b.hasta) return 'Elija la hora de inicio y la de fin, o bloquee todo el día'
  if (b.desde && (aMinutos(b.desde) == null || aMinutos(b.hasta) == null || aMinutos(b.hasta) <= aMinutos(b.desde))) return 'La hora final debe ser después de la inicial'
  if (String(b.motivo || '').length > MAX_TITULO) return `El título no puede pasar de ${MAX_TITULO} caracteres`
  return null
}

// ---- data access ----
const lista = (config) => (Array.isArray(config?.bloqueos) ? config.bloqueos.filter(b => b && typeof b === 'object' && esISO(b.fecha)) : [])
const orden = (l) => [...l].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.desde || '').localeCompare(b.desde || ''))

export async function leerBloqueos(clinicaId) {
  if (!clinicaId) return []
  const { data, error } = await supabase.from('lia_config').select('config').eq('clinica_id', clinicaId).maybeSingle()
  if (error) throw new Error('No se pudieron cargar los bloqueos')
  return orden(lista(data?.config))
}

// Re-reads the CURRENT config, applies fn(currentBlocks) and writes back only the `bloqueos` key merged into the
// existing config, so other receptionist settings changed meanwhile are kept. The row is always the session clinic's.
// With no row yet it is created with the same defaults the receptionist's settings use.
export async function guardarBloqueos(clinica, fn) {
  const clinicaId = clinica?.id
  if (!clinicaId) throw new Error('No se pudo guardar el bloqueo')
  const { data, error } = await supabase.from('lia_config').select('config').eq('clinica_id', clinicaId).maybeSingle()
  if (error) throw new Error('No se pudo guardar el bloqueo')
  const actuales = lista(data?.config)
  // blocks fn leaves untouched are kept exactly as stored; only new or edited ones are cleaned and validated
  const siguiente = (fn(actuales) || []).map(b => actuales.includes(b) ? b : limpiarBloqueo(b))
  if (siguiente.some(b => !actuales.includes(b) && validarBloqueo(b))) throw new Error('El bloqueo no es válido')
  if (data) {
    const nueva = { ...(data.config || {}), bloqueos: siguiente }
    const { data: filas, error: e } = await supabase.from('lia_config').update({ config: nueva, updated_at: new Date().toISOString() }).eq('clinica_id', clinicaId).select('clinica_id')
    if (e || !filas?.length) throw new Error('No se pudo guardar el bloqueo')
  } else {
    const { error: e } = await supabase.from('lia_config').insert({ clinica_id: clinicaId, config: { ...configBase(clinica), bloqueos: siguiente } })
    if (e) {
      // someone created the row in between: apply the change on top of theirs
      if (e.code === '23505') return guardarBloqueos(clinica, fn)
      throw new Error('No se pudo guardar el bloqueo')
    }
  }
  return orden(siguiente)
}

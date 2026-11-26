import { supabase } from './supabase'
import { MODO_DEMO } from './config'

// Google Calendar mirror (see supabase/functions/google-calendar). The refresh token never reaches the browser:
// everything goes through the edge function; the status comes from the google_estado() RPC.
// Nothing here may block or break saving an appointment: every failure is silent.
const TTL = 5 * 60 * 1000
let cache = null // { t, valor }

// → { conectada, google_email, ocultar_nombre, estado, ultimo_error, ultimo_sync_at } or null when the feature is not available yet
export async function googleEstado({ forzar = false } = {}) {
  if (MODO_DEMO) return null
  if (!forzar && cache && Date.now() - cache.t < TTL) return cache.valor
  let valor = null
  try {
    const { data, error } = await supabase.rpc('google_estado')
    if (!error && data && typeof data === 'object') valor = data
  } catch { /* migration not applied yet */ }
  cache = { t: Date.now(), valor }
  return valor
}

const llamar = async (ruta, body) => {
  const { data, error } = await supabase.functions.invoke(`google-calendar/${ruta}`, { body: body || {} })
  if (error) throw error
  return data
}

// Sends the owner to Google's consent screen
export async function conectarGoogle() {
  const d = await llamar('start')
  if (!d?.url || !d.url.startsWith('https://accounts.google.com/')) throw new Error('Respuesta inválida')
  window.location.href = d.url
}

// Clears the module cache: called when the session ends so the next user never sees the previous clinic's status
export function limpiarGoogle() { cache = null; cacheEventos.clear(); avisos = {} }

// ---- read-only Google events shown inside the Calendario (nothing is stored; short in-memory cache only) ----
const TTL_EVENTOS = 60 * 1000
const cacheEventos = new Map() // 'desde|hasta' → { t, valor }
let avisos = {} // { faltaPermiso } of the last answer, read by the Google card
export const avisosGoogle = () => avisos
const AVISO = 'ch-google-aviso'
export const alAvisoGoogle = (fn) => { window.addEventListener(AVISO, fn); return () => window.removeEventListener(AVISO, fn) }

// → { eventos: [{ id, titulo, fecha, hora, finFecha, finHora, todoElDia, calendario, color, enlace }], faltaPermiso? } — never throws
export async function eventosGoogle(desde, hasta) {
  const vacio = { eventos: [] }
  if (MODO_DEMO) return vacio
  try {
    const e = await googleEstado()
    if (!e?.conectada || !e.confirmada) return vacio
    const llave = `${desde}|${hasta}`
    const previo = cacheEventos.get(llave)
    if (previo && Date.now() - previo.t < TTL_EVENTOS) return previo.valor
    const d = await llamar('eventos', { desde, hasta })
    const valor = { eventos: Array.isArray(d?.eventos) ? d.eventos : [], faltaPermiso: !!d?.faltaPermiso }
    cacheEventos.set(llave, { t: Date.now(), valor })
    if (cacheEventos.size > 12) cacheEventos.delete(cacheEventos.keys().next().value)
    const nuevo = { faltaPermiso: valor.faltaPermiso }
    if (nuevo.faltaPermiso !== !!avisos.faltaPermiso) { avisos = nuevo; window.dispatchEvent(new CustomEvent(AVISO)) }
    if (d?.reconectar) { cache = null; window.dispatchEvent(new CustomEvent(AVISO)) } // the card re-reads the status and shows the amber state
    return valor
  } catch { return vacio }
}

// Fire-and-forget after every successful write of an appointment (or its deletion)
export function sincronizarCita(citaId) {
  if (MODO_DEMO || !citaId) return
  googleEstado().then(e => {
    if (!e?.conectada || !e.confirmada || e.estado === 'error') return
    return llamar('sync', { cita_id: citaId }).then(r => { if (r?.reconectar) cache = null })
  }).catch(() => {})
}

// Runs the whole-clinic sync in rounds (the function stops after ~100 s and reports `pendientes`); max 5 rounds.
// alProgreso({ sincronizadas, total, pendientes }) is called after every round. Resolves with the last answer.
export async function sincronizarTodas(alProgreso) {
  let d = null, inicio
  for (let ronda = 0; ronda < 5; ronda++) {
    d = await llamar('sync-todas', inicio ? { inicio } : {})
    if (d?.inicio) inicio = d.inicio
    if (d?.sincronizado && alProgreso) alProgreso(d)
    if (!d?.sincronizado || !(d.pendientes > 0)) break // pendientes already includes the failed ones, so the next round retries them
  }
  cache = null
  return d
}

// Confirms the account shown on screen; throws { cuentaCambio: true } when the connected account is no longer that one (409)
export async function confirmarGoogle(google_email) {
  try { await llamar('confirmar', { google_email }) }
  catch (e) {
    cache = null
    if (e?.context?.status === 409) { const x = new Error('CUENTA_CAMBIO'); x.cuentaCambio = true; throw x }
    throw e
  }
  cache = null
}

export async function desconectarGoogle() {
  await llamar('desconectar')
  cache = null
}

export async function opcionesGoogle(opciones) {
  await llamar('opciones', opciones)
  cache = null
}

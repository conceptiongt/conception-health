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

// Fire-and-forget after every successful write of an appointment (or its deletion)
export function sincronizarCita(citaId) {
  if (MODO_DEMO || !citaId) return
  googleEstado().then(e => {
    if (!e?.conectada) return
    return llamar('sync', { cita_id: citaId }).then(r => { if (r?.reconectar) cache = null })
  }).catch(() => {})
}

export async function sincronizarTodas() {
  const d = await llamar('sync-todas')
  cache = null
  return d
}

export async function desconectarGoogle() {
  await llamar('desconectar')
  cache = null
}

export async function opcionesGoogle(opciones) {
  await llamar('opciones', opciones)
  cache = null
}

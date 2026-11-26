// Google Calendar for Conception Health: each clinic connects ITS OWN Google account once and its appointments (`citas`)
// are mirrored one-way to that calendar (create / update / delete), so Google sends the reminders.
//
// Deploy with verify_jwt = false: /callback is opened by Google's redirect (no Supabase session). Every other route
// validates the caller's JWT itself, loads `perfiles` with the service role, and never trusts a clinic id from the client.
//
// Routes
//   POST /start          (dueno)           → { url } Google consent URL
//   GET  /callback       (Google redirect) → 302 to the app (?google=ok | ?google=error), stores the encrypted refresh token
//   POST /sync           (dueno/asistente/miembro) { cita_id } → mirrors one appointment (or removes its event)
//   POST /sync-todas     (dueno)           → mirrors the clinic's future appointments in rounds ({ sincronizadas, pendientes, total }:
//                                            the client repeats while pendientes > 0) and then reconciles (removes events of deleted/cancelled citas)
//   POST /confirmar      (dueno)           → the owner confirms the connected Google account; until then NOTHING is sent to Google
//   POST /opciones       (dueno) { ocultar_nombre }
//   POST /desconectar    (dueno)           → revokes the token and forgets the connection
//
// Deploy order: set the secrets and deploy this function BEFORE applying the SQL (the SQL is what makes the button appear).
//
// Secrets (Supabase → Edge Functions → Secrets): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY (base64 of 32 random
// bytes, AES-256-GCM key for the refresh tokens), optional APP_URL. SUPABASE_* are provided by the platform.
// Known limits (Fase 2): citas created/changed by Lía server-side and patient deletions are mirrored only at the next
// «Sincronizar ahora» (sync-todas also reconciles); revoking the token when a clinic account is deleted still has to be added to eliminar-cuenta.
// Tokens are never logged, never returned to the browser and never put in a URL.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { decodeBase64, encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { encodeBase64Url } from 'jsr:@std/encoding@1/base64url'

const APP_URL = (Deno.env.get('APP_URL') || 'https://health.conception-gt.com').replace(/\/+$/, '')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Registered in Google Cloud. It lives on the app's own domain (Vercel proxies /google/callback to this function) so Google's
// consent screen shows the Conception Health domain instead of the Supabase project host. Constant: never taken from the request.
const REDIRECT_URI = `${APP_URL}/google/callback`
const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const CAL_API = 'https://www.googleapis.com/calendar/v3'
const TZ = 'America/Guatemala' // UTC-6 all year, no DST
const OFFSET_GT = -6
const ESTADO_VALIDO_MS = 15 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// ---------- HTTP helpers ----------
// CORS: only the app (and localhost for development). /callback is a plain navigation and needs none.
function cors(req: Request) {
  const o = req.headers.get('Origin') || ''
  const ok = o === APP_URL || /^http:\/\/localhost(:\d+)?$/.test(o)
  return {
    'Access-Control-Allow-Origin': ok ? o : APP_URL,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  }
}
const json = (req: Request, b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
// The redirect target is always built from the constant APP_URL: nothing from the request ends up in it.
const volver = (resultado: 'ok' | 'error') =>
  new Response(null, { status: 302, headers: { Location: `${APP_URL}/#/calendario?google=${resultado}`, 'Cache-Control': 'no-store' } })

// every call to Google has a hard timeout so a slow Google can never hang the function
const gfetch = (url: string, init: RequestInit = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) })

class Reconectar extends Error {} // Google refused the stored token (revoked / expired): the clinic must connect again

// ---------- encryption of the refresh token (AES-256-GCM, WebCrypto) ----------
// Fails closed: a missing or wrongly sized key throws, so nothing is ever stored or decrypted without a proper key.
async function llave(): Promise<CryptoKey> {
  const b64 = Deno.env.get('GOOGLE_TOKEN_KEY') || ''
  let raw: Uint8Array
  try { raw = decodeBase64(b64) } catch { throw new Error('LLAVE_INVALIDA') }
  if (raw.length !== 32) throw new Error('LLAVE_INVALIDA')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
// the clinic id is bound to the ciphertext (AAD): a token copied to another clinic's row cannot be decrypted
async function cifrar(texto: string, clinicaId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)) // fresh random IV for every encryption
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(clinicaId) }, await llave(), new TextEncoder().encode(texto)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv, 0); out.set(ct, iv.length)
  return encodeBase64(out)
}
async function descifrar(b64: string, clinicaId: string): Promise<string> {
  const k = await llave() // a missing key is a configuration error, not a "reconnect" case
  try {
    const raw = decodeBase64(b64)
    if (raw.length < 13) throw new Error('CIFRADO_INVALIDO')
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: new TextEncoder().encode(clinicaId) }, k, raw.slice(12))
    return new TextDecoder().decode(pt)
  } catch { throw new Reconectar() } // unreadable token: same as a revoked one, the clinic connects again
}

// payload of a JWT (no signature check: the id_token is received directly from Google's token endpoint over TLS)
function payloadJwt(jwt: string): any {
  const parte = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parte.padEnd(Math.ceil(parte.length / 4) * 4, '=')), c => c.charCodeAt(0))))
}

// ---------- caller ----------
type Perfil = { user_id: string, clinica_id: string, rol: string }
async function quien(req: Request): Promise<Perfil | null> {
  const auth = req.headers.get('Authorization') || ''
  if (!auth) return null
  const usuario = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await usuario.auth.getUser()
  if (!user) return null
  const { data: perfil } = await db.from('perfiles').select('user_id, clinica_id, rol').eq('user_id', user.id).maybeSingle()
  return perfil ? perfil as Perfil : null
}

// ---------- Google ----------
async function tokenPorRefresh(refresh: string): Promise<string> {
  const r = await gfetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, refresh_token: refresh, grant_type: 'refresh_token' }),
  })
  const d = await r.json().catch(() => ({}))
  if (r.ok && d.access_token) return d.access_token
  if (d.error === 'invalid_grant') throw new Reconectar()
  throw new Error(`TOKEN_${r.status}`) // status only: never the body
}
async function gcal(token: string, method: string, path: string, body?: unknown): Promise<{ status: number, ok: boolean, data: any }> {
  const r = await gfetch(`${CAL_API}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (r.status === 401) throw new Reconectar()
  const data = r.status === 204 ? null : await r.json().catch(() => null)
  return { status: r.status, ok: r.ok, data }
}

// best effort: never throws, never logs the token
async function revocar(token: string | null | undefined) {
  if (!token) return
  try { await gfetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }) } catch { /* ignore */ }
}

// ---------- dates as plain strings (the Google event carries timeZone, so no UTC conversion is needed) ----------
const pad = (n: number) => String(n).padStart(2, '0')
const hoyGT = () => new Date(Date.now() + OFFSET_GT * 3600e3).toISOString().slice(0, 10)
const sumarDias = (f: string, n: number) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
// start + duration may cross midnight: the end is computed on the wall clock (date + minutes of the day)
function finDe(fecha: string, hora: string, dur: number) {
  const [h, m] = hora.split(':').map(Number)
  const total = h * 60 + m + dur
  const t = total % 1440
  return { fecha: sumarDias(fecha, Math.floor(total / 1440)), hora: `${pad(Math.floor(t / 60))}:${pad(t % 60)}` }
}
const limpiar = (s: unknown, max = 200) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max)
// deterministic Google event id from the cita id (base32hex alphabet allows 0-9a-v: a uuid without dashes is hex, so valid).
// Google rejects a second insert with the same id (409), which is what makes concurrent syncs idempotent.
const idEvento = (citaId: string) => citaId.replace(/-/g, '').toLowerCase()

function construirEvento(cita: any, nombrePaciente: string, nombreSede: string, ocultar: boolean) {
  const tipo = limpiar(cita.tipo, 80)
  const titulo = ocultar ? `Cita — ${tipo || 'Consulta'}` : `Cita: ${limpiar(nombrePaciente, 120) || 'Paciente'}${tipo ? ' — ' + tipo : ''}`
  // data minimisation: no clinical notes, phone, diagnosis or service ever go to Google (only name unless hidden, tipo, sede, estado, date/time)
  const lineas = [
    nombreSede ? `Sede: ${limpiar(nombreSede, 120)}` : '',
    cita.estado ? `Estado: ${limpiar(cita.estado, 40)}` : '',
    'Creado desde Conception Health',
  ].filter(Boolean)
  const horaOk = typeof cita.hora === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(cita.hora)
  let tiempo: Record<string, unknown>
  if (horaOk) {
    const ini = cita.hora.slice(0, 5)
    const d = Number(cita.duracion)
    const dur = Number.isFinite(d) && d >= 5 && d <= 1440 ? Math.round(d) : 60
    const fin = finDe(cita.fecha, ini, dur)
    tiempo = {
      start: { dateTime: `${cita.fecha}T${ini}:00`, timeZone: TZ },
      end: { dateTime: `${fin.fecha}T${fin.hora}:00`, timeZone: TZ },
    }
  } else {
    // all-day event: Google's end date is exclusive
    tiempo = { start: { date: cita.fecha }, end: { date: sumarDias(cita.fecha, 1) } }
  }
  return {
    summary: titulo, description: lineas.join('\n'), status: 'confirmed', ...tiempo,
    reminders: { useDefault: true },
    extendedProperties: { private: { cita_id: cita.id } },
  }
}

// ---------- mirror one appointment ----------
type Conexion = { clinica_id: string, calendar_id: string, ocultar_nombre: boolean, confirmada: boolean }
type Contexto = { token: string, conn: Conexion, pacientes: Map<string, string>, sedes: Map<string, string> }
const ruta = (conn: Conexion) => `/calendars/${encodeURIComponent(conn.calendar_id)}/events`

// conocido: event id already loaded by the caller (string), known to be absent (null) or not loaded (undefined → query it)
async function quitarEvento(ctx: Contexto, citaId: string, conocido?: string | null) {
  const fila = conocido === undefined
    ? (await db.from('google_eventos').select('event_id').eq('cita_id', citaId).eq('clinica_id', ctx.conn.clinica_id).maybeSingle()).data
    : (conocido ? { event_id: conocido } : null)
  // also try the deterministic id: covers an event created whose row was never saved
  for (const id of new Set([idEvento(citaId), fila?.event_id].filter(Boolean) as string[])) {
    const r = await gcal(ctx.token, 'DELETE', `${ruta(ctx.conn)}/${encodeURIComponent(id)}`)
    if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`GCAL_${r.status}`)
  }
  await db.from('google_eventos').delete().eq('cita_id', citaId).eq('clinica_id', ctx.conn.clinica_id)
}

async function reflejarEvento(ctx: Contexto, cita: any, conocido?: string | null) {
  const evento = construirEvento(cita, ctx.pacientes.get(cita.paciente_id) || '', ctx.sedes.get(cita.sede_id) || '', ctx.conn.ocultar_nombre)
  const base = ruta(ctx.conn)
  const det = idEvento(cita.id)
  const fila = conocido === undefined
    ? (await db.from('google_eventos').select('event_id').eq('cita_id', cita.id).eq('clinica_id', ctx.conn.clinica_id).maybeSingle()).data
    : (conocido ? { event_id: conocido } : null)
  // 1. update the known event; 2. if Google no longer has it, create it with the deterministic id;
  // 3. a concurrent request may have created it first (409) → update that one; 4. last resort: let Google pick the id
  let r = await gcal(ctx.token, 'PUT', `${base}/${encodeURIComponent(fila?.event_id || det)}`, evento)
  if (r.status === 404 || r.status === 410) {
    r = await gcal(ctx.token, 'POST', base, { ...evento, id: det })
    if (r.status === 409) {
      r = await gcal(ctx.token, 'PUT', `${base}/${det}`, evento)
      if (r.status === 404 || r.status === 410) r = await gcal(ctx.token, 'POST', base, evento)
    }
  }
  if (!r.ok || !r.data?.id) throw new Error(`GCAL_${r.status}`)
  const { error: eUp } = await db.from('google_eventos').upsert({ cita_id: cita.id, clinica_id: ctx.conn.clinica_id, event_id: String(r.data.id), actualizado_at: new Date().toISOString() })
  if (eUp) throw new Error('DB_EVENTO')
}

const SIN_CONFIRMAR = 'SIN_CONFIRMAR' as const
// null → no connection; SIN_CONFIRMAR → connected but the owner has not confirmed the account yet (no token is even used)
async function conectarCtx(clinicaId: string, citas: any[]): Promise<Contexto | null | typeof SIN_CONFIRMAR> {
  const { data: conn, error } = await db.from('google_conexiones').select('clinica_id, calendar_id, ocultar_nombre, confirmada, refresh_token_cifrado').eq('clinica_id', clinicaId).maybeSingle()
  if (error) throw new Error('DB_CONEXION')
  if (!conn) return null
  if (conn.confirmada !== true) return SIN_CONFIRMAR
  const token = await tokenPorRefresh(await descifrar(conn.refresh_token_cifrado, clinicaId))
  const pids = [...new Set(citas.map(c => c.paciente_id).filter(Boolean))]
  const sids = [...new Set(citas.map(c => c.sede_id).filter(Boolean))]
  // always filtered by the clinic: a cita can never pull in another clinic's patient or branch name
  // ids go in chunks of 100 (a long list would overflow the URL); a failed read aborts instead of sending events with a wrong name
  const ps: any[] = []
  for (let k = 0; k < pids.length; k += 100) {
    const { data, error } = await db.from('pacientes').select('id, nombre').eq('clinica_id', clinicaId).in('id', pids.slice(k, k + 100))
    if (error) throw new Error('DB_PACIENTES')
    ps.push(...(data || []))
  }
  const { data: ss, error: eSedes } = sids.length ? await db.from('sedes').select('id, nombre').eq('clinica_id', clinicaId).in('id', sids) : { data: [], error: null }
  if (eSedes) throw new Error('DB_SEDES')
  return {
    token, conn: { clinica_id: conn.clinica_id, calendar_id: conn.calendar_id, ocultar_nombre: conn.ocultar_nombre, confirmada: true },
    pacientes: new Map((ps || []).map((p: any) => [p.id, p.nombre])),
    sedes: new Map((ss || []).map((s: any) => [s.id, s.nombre])),
  }
}

async function marcarError(clinicaId: string) {
  await db.from('google_conexiones').update({ estado: 'error', ultimo_error: 'reconectar' }).eq('clinica_id', clinicaId)
}
async function marcarBien(clinicaId: string) {
  await db.from('google_conexiones').update({ estado: 'activa', ultimo_error: null, ultimo_sync_at: new Date().toISOString() }).eq('clinica_id', clinicaId)
}

const COLS_CITA = 'id, clinica_id, paciente_id, fecha, hora, duracion, tipo, estado, sede_id'
const SELECT_ERR = { error: 'ERROR' }

// ---------- routes ----------
async function iniciar(req: Request, p: Perfil) {
  if (p.rol !== 'dueno') return json(req, { error: 'SOLO_ADMIN' }, 403)
  if (!Deno.env.get('GOOGLE_CLIENT_ID') || !Deno.env.get('GOOGLE_CLIENT_SECRET')) return json(req, SELECT_ERR, 500)
  await llave() // fail early if the encryption key is missing: better than a connection that cannot be stored
  const state = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  // housekeeping: expired states and this user's earlier unused ones
  await db.from('google_oauth_estados').delete().lt('creado_at', new Date(Date.now() - 3600e3).toISOString())
  await db.from('google_oauth_estados').delete().eq('user_id', p.user_id)
  const { error } = await db.from('google_oauth_estados').insert({ state, clinica_id: p.clinica_id, user_id: p.user_id })
  if (error) return json(req, SELECT_ERR, 500)
  const q = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state,
  })
  return json(req, { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` })
}

async function regreso(url: URL) {
  let aRevocar: string | null = null
  try {
    const code = url.searchParams.get('code') || '', state = url.searchParams.get('state') || ''
    if (url.searchParams.get('error') || !code || code.length > 2048 || !/^[A-Za-z0-9_-]{43}$/.test(state)) return volver('error')
    // single use: the delete returns the row only to the first request that presents this state
    const { data: filas } = await db.from('google_oauth_estados').delete().eq('state', state).select('clinica_id, user_id, creado_at')
    const est = filas?.[0]
    if (!est || Date.now() - new Date(est.creado_at).getTime() > ESTADO_VALIDO_MS) return volver('error')
    // the user who started the flow must still be the owner of that clinic
    const { data: perfil } = await db.from('perfiles').select('clinica_id, rol').eq('user_id', est.user_id).maybeSingle()
    if (!perfil || perfil.rol !== 'dueno' || perfil.clinica_id !== est.clinica_id) return volver('error')

    const r = await gfetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
    })
    const t = await r.json().catch(() => ({}))
    if (!r.ok || !t.access_token) return volver('error')
    // from here on a token has been issued: any early exit revokes it (best effort) so nothing stays authorised without being stored
    aRevocar = String(t.refresh_token || t.access_token)
    if (!t.refresh_token) { await revocar(aRevocar); return volver('error') }
    // the user may untick the calendar permission on Google's consent screen
    if (!String(t.scope || '').split(' ').includes('https://www.googleapis.com/auth/calendar.events')) { await revocar(aRevocar); return volver('error') }

    // account email: the id_token comes straight from Google's token endpoint over TLS; userinfo is the fallback
    let email = ''
    try { email = String(payloadJwt(String(t.id_token)).email || '') } catch { /* fall through to userinfo */ }
    if (!email) {
      const u = await gfetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } })
      email = String((await u.json().catch(() => ({}))).email || '')
    }

    if (!email) { await revocar(aRevocar); return volver('error') } // fail closed: an account we cannot identify is never stored

    const cifrado = await cifrar(t.refresh_token, est.clinica_id)
    const { data: previa } = await db.from('google_conexiones').select('google_email, refresh_token_cifrado').eq('clinica_id', est.clinica_id).maybeSingle()
    if (previa && previa.google_email !== email) {
      await db.from('google_eventos').delete().eq('clinica_id', est.clinica_id) // another calendar: old links are meaningless
      // the previous account's token is revoked. Only when the account differs: revoking a token of the SAME Google account
      // can invalidate the grant that the new token belongs to.
      try { await revocar(await descifrar(previa.refresh_token_cifrado, est.clinica_id)) } catch { /* unreadable: nothing to revoke */ }
    }
    // always unconfirmed: the owner must see which account got connected and confirm it before any appointment is sent
    const { error } = await db.from('google_conexiones').upsert({
      clinica_id: est.clinica_id, google_email: email || null, calendar_id: 'primary', refresh_token_cifrado: cifrado,
      conectado_por: est.user_id, conectado_at: new Date().toISOString(), estado: 'activa', ultimo_error: null, confirmada: false,
    })
    if (error) { await revocar(aRevocar); return volver('error') }
    return volver('ok')
  } catch (e) {
    console.error('google-calendar callback', e instanceof Error ? e.name : 'error')
    await revocar(aRevocar)
    return volver('error')
  }
}

async function sincronizar(req: Request, p: Perfil) {
  if (!['dueno', 'asistente', 'miembro'].includes(p.rol)) return json(req, { error: 'SIN_PERMISO' }, 403)
  const b = await req.json().catch(() => ({}))
  const citaId = String(b?.cita_id || '')
  if (!UUID.test(citaId)) return json(req, { error: 'DATOS' }, 400)
  const { data: leida, error: eLeer } = await db.from('citas').select(COLS_CITA).eq('id', citaId).maybeSingle()
  if (eLeer) return json(req, SELECT_ERR, 502) // a failed read is never a deletion
  // a cita of another clinic is treated exactly like a missing one ("deleted"): identical response, and only THIS clinic's connection/events are touched
  const cita = leida && leida.clinica_id === p.clinica_id ? leida : null
  try {
    const ctx = await conectarCtx(p.clinica_id, cita ? [cita] : [])
    if (!ctx) return json(req, { sincronizado: false })
    if (ctx === SIN_CONFIRMAR) return json(req, { sincronizado: false, confirmar: true })
    if (!cita || cita.estado === 'Cancelada') await quitarEvento(ctx, citaId)
    else await reflejarEvento(ctx, cita)
    await marcarBien(p.clinica_id)
    return json(req, { sincronizado: true })
  } catch (e) {
    if (e instanceof Reconectar) { await marcarError(p.clinica_id); return json(req, { sincronizado: false, reconectar: true }) }
    console.error('google-calendar sync', e instanceof Error ? e.message : 'error')
    return json(req, SELECT_ERR, 502)
  }
}

const PRESUPUESTO_MS = 100_000 // stop starting new chunks after ~100 s (the platform kills the function at ~150 s)
const LOTE = 5
const TECHO_CITAS = 5000

// whole-clinic pages of 1000 rows (PostgREST caps a single select)
async function leerTodo(q: (desde: number, hasta: number) => any, max: number): Promise<any[] | null> {
  const out: any[] = []
  for (let d = 0; d < max; d += 1000) {
    const { data, error } = await q(d, d + 999)
    if (error) return null
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

async function sincronizarTodas(req: Request, p: Perfil) {
  if (p.rol !== 'dueno') return json(req, { error: 'SOLO_ADMIN' }, 403)
  const b = await req.json().catch(() => ({}))
  const t0 = Date.now()
  // `inicio`: when the first round of this run started (echoed by the client). Citas whose event was written at/after it are done: that is
  // how the next round continues instead of starting over.
  let inicio = String(b?.inicio || '')
  const ini = Date.parse(inicio)
  if (!inicio || !Number.isFinite(ini) || ini > t0 + 60e3 || t0 - ini > 2 * 3600e3) inicio = new Date(t0).toISOString()
  const hoy = hoyGT(), cid = p.clinica_id
  // M4: a failed read must never look like "no citas" (which would trigger deletions below)
  const lista = await leerTodo((d, h) => db.from('citas').select(COLS_CITA).eq('clinica_id', cid).gte('fecha', hoy).neq('estado', 'Cancelada')
    .order('fecha').order('hora').order('id').range(d, h), TECHO_CITAS)
  if (!lista) return json(req, SELECT_ERR, 502)
  const filas = await leerTodo((d, h) => db.from('google_eventos').select('cita_id, event_id, actualizado_at').eq('clinica_id', cid).order('cita_id').range(d, h), 100000)
  if (!filas) return json(req, SELECT_ERR, 502)
  const eventos = new Map<string, { event_id: string, actualizado_at: string }>(filas.map((f: any) => [f.cita_id, f]))
  try {
    const ctx = await conectarCtx(cid, lista)
    if (!ctx) return json(req, { sincronizado: false })
    if (ctx === SIN_CONFIRMAR) return json(req, { sincronizado: false, confirmar: true })

    const hechas = lista.filter(c => { const e = eventos.get(c.id); return e && Date.parse(e.actualizado_at) >= Date.parse(inicio) })
    const porHacer = lista.filter(c => { const e = eventos.get(c.id); return !(e && Date.parse(e.actualizado_at) >= Date.parse(inicio)) })
    let ok = 0, fallidas = 0, i = 0
    while (i < porHacer.length && Date.now() - t0 < PRESUPUESTO_MS) {
      const lote = porHacer.slice(i, i + LOTE); i += lote.length
      const res = await Promise.all(lote.map(async (c) => {
        try { await reflejarEvento(ctx, c, eventos.get(c.id)?.event_id ?? null); return 'ok' } catch (e) { return e instanceof Reconectar ? 'reconectar' : 'fallo' }
      }))
      if (res.includes('reconectar')) throw new Reconectar()
      ok += res.filter(x => x === 'ok').length; fallidas += res.filter(x => x === 'fallo').length
    }
    const pendientes = porHacer.length - i

    // M3 reconcile: remove the events of citas that no longer exist or were cancelled. Only when every cita was visited, and only
    // when the reads succeed. Not mirrored here (Fase 2): changes by Lía server-side and patient deletions show up at the next run.
    let retiradas = 0
    if (pendientes === 0 && fallidas === 0) {
      const enLista = new Set(lista.map(c => c.id))
      const dudosas = [...eventos.keys()].filter(id => !enLista.has(id))
      let leidas: Map<string, string> | null = new Map()
      for (let k = 0; k < dudosas.length && leidas; k += 100) {
        const { data, error } = await db.from('citas').select('id, estado').eq('clinica_id', cid).in('id', dudosas.slice(k, k + 100))
        if (error) leidas = null
        else for (const c of data || []) leidas.set(c.id, c.estado)
      }
      if (leidas) {
        const sobran = dudosas.filter(id => !leidas!.has(id) || leidas!.get(id) === 'Cancelada') // past citas still existing are kept
        let j = 0
        while (j < sobran.length && Date.now() - t0 < PRESUPUESTO_MS + 10_000) {
          const lote = sobran.slice(j, j + LOTE); j += lote.length
          const res = await Promise.all(lote.map(async (id) => {
            try { await quitarEvento(ctx, id, eventos.get(id)?.event_id ?? null); return 'ok' } catch (e) { return e instanceof Reconectar ? 'reconectar' : 'fallo' }
          }))
          if (res.includes('reconectar')) throw new Reconectar()
          retiradas += res.filter(x => x === 'ok').length
        }
      }
    }
    await marcarBien(cid)
    return json(req, { sincronizado: true, total: lista.length, sincronizadas: hechas.length + ok, fallidas, pendientes: pendientes + fallidas, retiradas, inicio })
  } catch (e) {
    if (e instanceof Reconectar) { await marcarError(cid); return json(req, { sincronizado: false, reconectar: true }) }
    console.error('google-calendar sync-todas', e instanceof Error ? e.message : 'error')
    return json(req, SELECT_ERR, 502)
  }
}

async function confirmar(req: Request, p: Perfil) {
  if (p.rol !== 'dueno') return json(req, { error: 'SOLO_ADMIN' }, 403)
  const b = await req.json().catch(() => ({}))
  const google_email = b?.google_email
  if (typeof google_email !== 'string' || !google_email || google_email.length > 320) return json(req, { error: 'DATOS' }, 400)
  const { data, error } = await db.from('google_conexiones').update({ confirmada: true }).eq('clinica_id', p.clinica_id).eq('estado', 'activa').eq('google_email', google_email).select('clinica_id')
  if (error) return json(req, SELECT_ERR, 500)
  if (!data?.length) return json(req, { error: 'CUENTA_CAMBIO' }, 409)
  return json(req, { ok: true })
}

async function opciones(req: Request, p: Perfil) {
  if (p.rol !== 'dueno') return json(req, { error: 'SOLO_ADMIN' }, 403)
  const b = await req.json().catch(() => ({}))
  if (typeof b?.ocultar_nombre !== 'boolean') return json(req, { error: 'DATOS' }, 400)
  const { error } = await db.from('google_conexiones').update({ ocultar_nombre: b.ocultar_nombre }).eq('clinica_id', p.clinica_id)
  return error ? json(req, SELECT_ERR, 500) : json(req, { ok: true })
}

async function desconectar(req: Request, p: Perfil) {
  if (p.rol !== 'dueno') return json(req, { error: 'SOLO_ADMIN' }, 403)
  const { data: conn } = await db.from('google_conexiones').select('refresh_token_cifrado').eq('clinica_id', p.clinica_id).maybeSingle()
  if (conn) {
    // best effort: even if the revoke fails (or the token cannot be decrypted) the clinic is disconnected on our side; works whether confirmed or not
    try { await revocar(await descifrar(conn.refresh_token_cifrado, p.clinica_id)) } catch { /* ignore */ }
  }
  await db.from('google_eventos').delete().eq('clinica_id', p.clinica_id)
  const { error } = await db.from('google_conexiones').delete().eq('clinica_id', p.clinica_id)
  return error ? json(req, SELECT_ERR, 500) : json(req, { ok: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  const url = new URL(req.url)
  const r = url.pathname.replace(/^.*\/google-calendar/, '').replace(/\/+$/, '') || '/'
  try {
    if (r === '/callback') return req.method === 'GET' ? await regreso(url) : json(req, { error: 'METODO' }, 405)
    if (req.method !== 'POST') return json(req, { error: 'METODO' }, 405)
    const p = await quien(req)
    if (!p) return json(req, { error: 'SESION' }, 401)
    if (p.rol === 'soporte') return json(req, { error: 'SIN_PERMISO' }, 403)
    if (r === '/start') return await iniciar(req, p)
    if (r === '/sync') return await sincronizar(req, p)
    if (r === '/sync-todas') return await sincronizarTodas(req, p)
    if (r === '/confirmar') return await confirmar(req, p)
    if (r === '/opciones') return await opciones(req, p)
    if (r === '/desconectar') return await desconectar(req, p)
    return json(req, { error: 'RUTA' }, 404)
  } catch (e) {
    console.error('google-calendar', r, e instanceof Error ? e.message : 'error')
    return json(req, SELECT_ERR, 500)
  }
})

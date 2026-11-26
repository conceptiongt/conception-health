// Google Calendar for Conception Health: each clinic connects ITS OWN Google account once and its appointments (`citas`)
// are mirrored one-way to that calendar (create / update / delete), so Google sends the reminders.
//
// Deploy with verify_jwt = false: /callback is opened by Google's redirect (no Supabase session). Every other route
// validates the caller's JWT itself, loads `perfiles` with the service role, and never trusts a clinic id from the client.
//
// Routes
//   POST /start          (dueno)           → { url } Google consent URL
//   GET  /callback       (Google redirect, reached through the Vercel proxy at ${APP_URL}/google/callback) → 302 to the app (?google=ok | ?google=error), stores the encrypted refresh token
//   POST /eventos        (dueno/asistente/miembro) { desde, hasta } → READ-ONLY list of the events of the connected account's calendars
//                                            in that range (≤ 62 days), minimal fields only, never stored; citas mirrored by us are left out
//   POST /sync           (dueno/asistente/miembro) { cita_id } → mirrors one appointment (or removes its event)
//   POST /evento         (dueno/asistente/miembro) { id } → mirrors one of the clinic's OWN calendar events (lia_config.config.bloqueos /
//                                            .eventos, looked up by id with the service role: no event field is ever taken from the client);
//                                            not found = the Google event is deleted. → { sincronizado, meet_url? } (Meet link only if requested)
//   POST /meet           (dueno/asistente/miembro) { cita_id, crear? } → { meet_url | null }: reads (default) or creates the Google Meet link of a cita
//   POST /sync-todas     (dueno)           → mirrors the clinic's future appointments in rounds ({ sincronizadas, pendientes, total }:
//                                            the client repeats while pendientes > 0) and then reconciles (removes events of deleted/cancelled citas).
//                                            Once every cita was visited it also upserts the clinic's own events that end today or later ({ eventos }).
//                                            Remote reconciliation of own events is NOT done: Google cannot list «every event that has ch_evento»
//                                            (privateExtendedProperty filters by key=value), and deleting an event in the platform already calls /evento,
//                                            which deletes it in Google.
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
// Meet links: created with conferenceData.createRequest (conferenceDataVersion=1). PUT replaces the whole event, so an update of an event that
// ALREADY has a link is sent as PATCH (omitted fields untouched, conferenceDataVersion=0) and never carries conferenceData: the link is kept.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { decodeBase64, encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { encodeBase64Url } from 'jsr:@std/encoding@1/base64url'

const APP_URL = (Deno.env.get('APP_URL') || 'https://health.conception-gt.com').replace(/\/+$/, '')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Registered in Google Cloud. It lives on the app's own domain (Vercel proxies /google/callback to this function) so Google's
// consent screen shows the Conception Health domain instead of the Supabase project host. Constant: never taken from the request.
// Until the owner registers the app-domain URI in Google Cloud and sets the secret GOOGLE_REDIRECT_URI
// (= https://health.conception-gt.com/google/callback), the original Supabase URI keeps working. Server-side value only.
const REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') || `${SUPABASE_URL}/functions/v1/google-calendar/callback`
// calendar.events also allows reading events; calendarlist.readonly only lists the calendars (ids, names, colours) of the account
const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly'
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

// Sets start/end to null on the other representation: PATCH merges objects, so a timed → all-day change would otherwise keep both
// PATCH never carries `reminders` (the user's own reminder edits in Google are kept). `recurrence` is sent as-is when the event has the key:
// null clears a previous recurrence (a range-with-hours entry that became a single one); events without the key (citas) are untouched.
const paraPatch = (ev: any) => {
  const t = (x: any) => x?.date ? { ...x, dateTime: null, timeZone: null } : { ...x, date: null }
  const { reminders: _r, ...resto } = ev
  return { ...resto, start: t(ev.start), end: t(ev.end) }
}
// PUT/POST replace or create the whole event: a null recurrence is simply omitted (nothing to clear)
const paraPut = (ev: any) => {
  if (ev && 'recurrence' in ev && !(Array.isArray(ev.recurrence) && ev.recurrence.length)) { const { recurrence: _x, ...resto } = ev; return resto }
  return ev
}
const URL_MEET = /^https:\/\/meet\.google\.com\//
const enlaceMeet = (d: any): string | null => typeof d?.hangoutLink === 'string' && URL_MEET.test(d.hangoutLink) ? d.hangoutLink : null
// the requestId carries a time suffix: Google ignores a createRequest whose requestId it has already seen, so a reused id could never create a new link
const crearMeet = (requestId: string) => ({ createRequest: { requestId: `${requestId}-${Date.now().toString(36)}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } })

// Shared create-or-update ladder (cita events and own events). `conocido`: event id stored for it, `det`: the deterministic id.
//  0. read the event (only id/status/link): it tells whether a Meet link exists and whether Google still has it
//  1. exists with a link → PATCH without conferenceData (keeps the link); exists without → PUT (+ createRequest when `meetId` is given)
//  2. Google no longer has it (404/410) → create it with the deterministic id
//  3. a concurrent request may have created it first (409) → update that one; 4. last resort: let Google pick the id
async function subirEvento(ctx: Contexto, evento: any, conocido: string | undefined, det: string, meetId?: string): Promise<any> {
  const base = ruta(ctx.conn)
  const objetivo = encodeURIComponent(conocido || det)
  const conMeet = meetId ? { conferenceData: crearMeet(meetId) } : {}
  const qMeet = meetId ? '?conferenceDataVersion=1' : ''
  const ver = await gcal(ctx.token, 'GET', `${base}/${objetivo}?fields=id,status,hangoutLink`)
  if (!ver.ok && ver.status !== 404 && ver.status !== 410) throw new Error(`GCAL_${ver.status}`)
  let r: { status: number, ok: boolean, data: any } | null = null
  if (ver.ok) {
    r = enlaceMeet(ver.data)
      ? await gcal(ctx.token, 'PATCH', `${base}/${objetivo}?conferenceDataVersion=0`, paraPatch(evento))
      : await gcal(ctx.token, 'PUT', `${base}/${objetivo}${qMeet}`, { ...paraPut(evento), ...conMeet })
  }
  if (!r || r.status === 404 || r.status === 410) {
    r = await gcal(ctx.token, 'POST', `${base}${qMeet}`, { ...paraPut(evento), ...conMeet, id: det })
    if (r.status === 409) {
      r = await gcal(ctx.token, 'PUT', `${base}/${det}${qMeet}`, { ...paraPut(evento), ...conMeet })
      if (r.status === 404 || r.status === 410) r = await gcal(ctx.token, 'POST', `${base}${qMeet}`, { ...paraPut(evento), ...conMeet })
    }
  }
  if (!r.ok || !r.data?.id) throw new Error(`GCAL_${r.status}`)
  return r.data
}

async function reflejarEvento(ctx: Contexto, cita: any, conocido?: string | null): Promise<any> {
  const evento = construirEvento(cita, ctx.pacientes.get(cita.paciente_id) || '', ctx.sedes.get(cita.sede_id) || '', ctx.conn.ocultar_nombre)
  const det = idEvento(cita.id)
  const fila = conocido === undefined
    ? (await db.from('google_eventos').select('event_id').eq('cita_id', cita.id).eq('clinica_id', ctx.conn.clinica_id).maybeSingle()).data
    : (conocido ? { event_id: conocido } : null)
  const data = await subirEvento(ctx, evento, fila?.event_id || undefined, det)
  const { error: eUp } = await db.from('google_eventos').upsert({ cita_id: cita.id, clinica_id: ctx.conn.clinica_id, event_id: String(data.id), actualizado_at: new Date().toISOString() })
  if (eUp) throw new Error('DB_EVENTO')
  return data
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

// ---------- the clinic's own calendar events (lia_config.config.bloqueos = «no disponible», .eventos = flexible) ----------
const ID_PROPIO = /^[0-9a-f]{32}$/
const HORA_OK = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_ENTRADAS = 400
// the '0e' tag keeps these ids apart from the cita ids (32 hex chars too); '0e' + 32 hex = 34 chars of the base32hex alphabet (0-9a-v)
const idGooglePropio = (id: string) => `0e${id}`
type Entrada = { id: string, fecha: string, hasta_fecha: string, desde: string, hasta: string, motivo: string, nota: string, meet: boolean, bloquea: boolean }

// both arrays of the clinic's config, read with the service role for the clinic of the caller. null = the read failed (never treated as «empty»)
async function leerAgendaPropia(clinicaId: string): Promise<Entrada[] | null> {
  const { data, error } = await db.from('lia_config').select('config').eq('clinica_id', clinicaId).maybeSingle()
  if (error) return null
  const cfg = data?.config && typeof data.config === 'object' ? data.config : {}
  const out: Entrada[] = []
  for (const [clave, bloquea] of [['bloqueos', true], ['eventos', false]] as const) {
    const l = Array.isArray(cfg[clave]) ? cfg[clave].slice(0, MAX_ENTRADAS) : []
    for (const e of l) {
      if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !ID_PROPIO.test(e.id) || !esFechaISO(e.fecha)) continue
      out.push({
        id: e.id, fecha: e.fecha, hasta_fecha: esFechaISO(e.hasta_fecha) && e.hasta_fecha > e.fecha ? e.hasta_fecha : '',
        desde: HORA_OK.test(String(e.desde)) ? e.desde : '', hasta: HORA_OK.test(String(e.hasta)) ? e.hasta : '',
        motivo: String(e.motivo ?? ''), nota: String(e.nota ?? ''), meet: e.meet === true, bloquea,
      })
    }
  }
  return out
}

function construirEventoPropio(e: Entrada) {
  const ultimo = e.hasta_fecha || e.fecha
  const resumen = limpiar(String(e.motivo).replace(/[<>]/g, ''), 120) || 'Evento'
  const nota = String(e.nota).replace(/[<>]/g, '').replace(/\r/g, '').trim().slice(0, 300)
  let tiempo: Record<string, unknown>
  const ini = e.desde || (e.hasta ? '00:00' : ''), fin = e.hasta || (e.desde ? '23:59' : '')
  // Hours + a date range mean «those hours on EACH day» (same as Lía and src/lib/agenda.js): first day's start/end plus a daily recurrence
  // (COUNT = days of the range, max 366). A whole-day range stays ONE multi-day all-day event. `recurrence` is always present (null = single)
  // so a PATCH clears a recurrence that no longer applies.
  let recurrence: string[] | null = null
  if (ini && fin && fin > ini) {
    tiempo = { start: { dateTime: `${e.fecha}T${ini}:00`, timeZone: TZ }, end: { dateTime: `${e.fecha}T${fin}:00`, timeZone: TZ } }
    if (ultimo > e.fecha) recurrence = [`RRULE:FREQ=DAILY;COUNT=${Math.min(366, dias(e.fecha, ultimo) + 1)}`]
  } else {
    tiempo = { start: { date: e.fecha }, end: { date: sumarDias(ultimo, 1) } }
  }
  return {
    summary: resumen, description: [nota, 'Creado desde Conception Health'].filter(Boolean).join('\n'), status: 'confirmed', ...tiempo,
    transparency: e.bloquea ? 'opaque' : 'transparent',
    recurrence,
    reminders: { useDefault: true },
    extendedProperties: { private: { ch_evento: e.id } },
  }
}

async function quitarEventoPropio(ctx: Contexto, id: string) {
  const r = await gcal(ctx.token, 'DELETE', `${ruta(ctx.conn)}/${encodeURIComponent(idGooglePropio(id))}`)
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`GCAL_${r.status}`)
}

// → the Meet link when one was requested and Google has it
async function reflejarEventoPropio(ctx: Contexto, e: Entrada): Promise<string | null> {
  const det = idGooglePropio(e.id)
  const data = await subirEvento(ctx, construirEventoPropio(e), undefined, det, e.meet ? e.id : undefined)
  if (!e.meet) return null
  let url = enlaceMeet(data)
  if (!url) { // the conference can still be pending in the answer: read it once more
    const r = await gcal(ctx.token, 'GET', `${ruta(ctx.conn)}/${encodeURIComponent(det)}?fields=hangoutLink`)
    if (r.ok) url = enlaceMeet(r.data)
  }
  return url
}

async function sincronizarEvento(req: Request, p: Perfil) {
  if (!['dueno', 'asistente', 'miembro'].includes(p.rol)) return json(req, { error: 'SIN_PERMISO' }, 403)
  const b = await req.json().catch(() => ({}))
  const id = String(b?.id || '')
  if (!ID_PROPIO.test(id)) return json(req, { error: 'DATOS' }, 400)
  // the event is read here, from the caller's clinic only: nothing but the id comes from the client
  const agenda = await leerAgendaPropia(p.clinica_id)
  if (!agenda) return json(req, SELECT_ERR, 502) // a failed read is never a deletion
  const entrada = agenda.find(x => x.id === id) || null
  try {
    const ctx = await conectarCtx(p.clinica_id, [])
    if (!ctx) return json(req, { sincronizado: false })
    if (ctx === SIN_CONFIRMAR) return json(req, { sincronizado: false, confirmar: true })
    if (!entrada) {
      await quitarEventoPropio(ctx, id)
      await marcarBien(p.clinica_id)
      return json(req, { sincronizado: true, eliminado: true })
    }
    const meet_url = await reflejarEventoPropio(ctx, entrada)
    await marcarBien(p.clinica_id)
    return json(req, { sincronizado: true, meet_url })
  } catch (e) {
    if (e instanceof Reconectar) { await marcarError(p.clinica_id); return json(req, { sincronizado: false, reconectar: true }) }
    console.error('google-calendar evento', e instanceof Error ? e.message : 'error')
    return json(req, SELECT_ERR, 502)
  }
}

// ---------- Meet link of a cita ----------
async function meetCita(req: Request, p: Perfil) {
  if (!['dueno', 'asistente', 'miembro'].includes(p.rol)) return json(req, { error: 'SIN_PERMISO' }, 403)
  const b = await req.json().catch(() => ({}))
  const citaId = String(b?.cita_id || '')
  if (!UUID.test(citaId)) return json(req, { error: 'DATOS' }, 400)
  const crear = b?.crear === true
  const { data: leida, error: eLeer } = await db.from('citas').select(COLS_CITA).eq('id', citaId).maybeSingle()
  if (eLeer) return json(req, SELECT_ERR, 502)
  // a cita of another clinic answers exactly like a missing one, and only THIS clinic's connection is used
  const cita = leida && leida.clinica_id === p.clinica_id ? leida : null
  try {
    const ctx = await conectarCtx(p.clinica_id, cita && crear ? [cita] : [])
    if (!ctx) return json(req, { meet_url: null, sincronizado: false })
    if (ctx === SIN_CONFIRMAR) return json(req, { meet_url: null, sincronizado: false, confirmar: true })
    if (!cita || cita.estado === 'Cancelada') return json(req, { meet_url: null, sincronizado: true })
    const det = idEvento(citaId)
    let data: any
    if (!crear) {
      const { data: fila } = await db.from('google_eventos').select('event_id').eq('cita_id', citaId).eq('clinica_id', p.clinica_id).maybeSingle()
      const r = await gcal(ctx.token, 'GET', `${ruta(ctx.conn)}/${encodeURIComponent(fila?.event_id || det)}?fields=hangoutLink`)
      if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`GCAL_${r.status}`)
      data = r.ok ? r.data : null
    } else {
      const ev = await reflejarEvento(ctx, cita) // makes sure the event exists (keeps a link it already has)
      data = ev
      if (!enlaceMeet(data)) {
        const r = await gcal(ctx.token, 'PATCH', `${ruta(ctx.conn)}/${encodeURIComponent(String(ev.id))}?conferenceDataVersion=1`, { conferenceData: crearMeet(det) })
        if (!r.ok) throw new Error(`GCAL_${r.status}`)
        data = r.data
        if (!enlaceMeet(data)) {
          const g = await gcal(ctx.token, 'GET', `${ruta(ctx.conn)}/${encodeURIComponent(String(ev.id))}?fields=hangoutLink`)
          if (g.ok) data = g.data
        }
      }
    }
    if (crear) await marcarBien(p.clinica_id) // a plain read changes nothing in the connection state
    return json(req, { meet_url: enlaceMeet(data), sincronizado: true })
  } catch (e) {
    if (e instanceof Reconectar) { await marcarError(p.clinica_id); return json(req, { meet_url: null, sincronizado: false, reconectar: true }) }
    console.error('google-calendar meet', e instanceof Error ? e.message : 'error')
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

    // own events that end today or later, only once every cita was visited (so the client's extra rounds do not repeat them). Counted apart: a failed
    // own event never keeps the citas rounds going. No remote reconciliation (see the header).
    let propiosOk = 0, propiosFallidos = 0, propiosPendientes = 0
    if (pendientes === 0) {
      const agenda = await leerAgendaPropia(cid)
      const vigentes = (agenda || []).filter(x => (x.hasta_fecha || x.fecha) >= hoy)
      let k = 0
      while (k < vigentes.length && Date.now() - t0 < PRESUPUESTO_MS + 10_000) {
        const lote = vigentes.slice(k, k + LOTE); k += lote.length
        const res = await Promise.all(lote.map(async (x) => {
          try { await reflejarEventoPropio(ctx, x); return 'ok' } catch (e) { return e instanceof Reconectar ? 'reconectar' : 'fallo' }
        }))
        if (res.includes('reconectar')) throw new Reconectar()
        propiosOk += res.filter(x => x === 'ok').length; propiosFallidos += res.filter(x => x === 'fallo').length
      }
      propiosPendientes = vigentes.length - k // the time budget ended first: the client asks for another round
    }
    await marcarBien(cid)
    return json(req, { sincronizado: true, total: lista.length, sincronizadas: hechas.length + ok, fallidas, pendientes: pendientes + fallidas, retiradas, eventos: propiosOk, eventosFallidos: propiosFallidos, ...(propiosPendientes > 0 ? { eventosPendientes: propiosPendientes } : {}), inicio })
  } catch (e) {
    if (e instanceof Reconectar) { await marcarError(cid); return json(req, { sincronizado: false, reconectar: true }) }
    console.error('google-calendar sync-todas', e instanceof Error ? e.message : 'error')
    return json(req, SELECT_ERR, 502)
  }
}

// ---------- read-only view of the account's events (/eventos) ----------
const MAX_DIAS = 62, MAX_CALENDARIOS = 12, MAX_EVENTOS = 600, PRESUPUESTO_EVENTOS_MS = 20_000
const esFechaISO = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const f = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(f.getTime()) && f.toISOString().slice(0, 10) === s
}
const dias = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3)
// RFC3339 instant → Guatemala wall clock (UTC-6, no DST) by plain arithmetic
function aGT(dateTime: unknown): { fecha: string, hora: string } | null {
  const ms = Date.parse(String(dateTime))
  if (!Number.isFinite(ms)) return null
  const iso = new Date(ms + OFFSET_GT * 3600e3).toISOString()
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) }
}
// instances of one of the clinic's own recurring events (range with hours): '0e' + 32 hex, the parent's id
const ID_RECURRENTE_PROPIO = /^0e[0-9a-f]{32}$/
const HEX = /^#[0-9a-fA-F]{6}$/
const ENLACE_OK = /^https:\/\/(www\.google\.com\/calendar\/|calendar\.google\.com\/)/

// Minimal projection of one Google event: no description, attendees, location or emails ever leave this function.
function proyectar(ev: any, cal: { nombre: string, color: string | null, primary: boolean }, idx: number) {
  let fecha: string, hora: string | null = null, finFecha: string, finHora: string | null = null, todoElDia = false
  if (ev?.start?.date && esFechaISO(ev.start.date)) {
    todoElDia = true
    fecha = ev.start.date
    // Google's all-day end is exclusive: make it inclusive, never before the start
    const fin = esFechaISO(ev?.end?.date) ? sumarDias(ev.end.date, -1) : fecha
    finFecha = fin < fecha ? fecha : fin
  } else {
    const a = aGT(ev?.start?.dateTime)
    if (!a) return null
    const b = aGT(ev?.end?.dateTime) || a
    fecha = a.fecha; hora = a.hora; finFecha = b.fecha; finHora = b.hora
  }
  const titulo = limpiar(ev?.summary, 140) || 'Sin título'
  // htmlLink of a non-primary calendar encodes that calendar's address (often an email): only the primary calendar's link is sent
  const enlace = cal.primary && typeof ev?.htmlLink === 'string' && ENLACE_OK.test(ev.htmlLink) ? ev.htmlLink : null
  return { id: `${idx}-${String(ev?.id || '').slice(0, 200)}`, titulo, fecha, hora, finFecha, finHora, todoElDia, calendario: cal.nombre, color: cal.color, enlace }
}

async function eventosGoogle(req: Request, p: Perfil) {
  if (!['dueno', 'asistente', 'miembro'].includes(p.rol)) return json(req, { error: 'SIN_PERMISO' }, 403)
  const b = await req.json().catch(() => ({}))
  const desde = b?.desde, hasta = b?.hasta
  if (!esFechaISO(desde) || !esFechaISO(hasta) || hasta < desde || dias(desde, hasta) + 1 > MAX_DIAS) return json(req, { error: 'DATOS' }, 400)
  const cid = p.clinica_id // always from the session profile, never from the body
  const t0 = Date.now()
  try {
    const ctx = await conectarCtx(cid, []) // no patients are loaded
    if (!ctx) return json(req, { conectada: false, eventos: [] })
    if (ctx === SIN_CONFIRMAR) return json(req, { conectada: true, confirmar: true, eventos: [] })

    // events created by the platform itself are left out (they are the citas): by private property and by this clinic's known event ids
    const filas = await leerTodo((d, h) => db.from('google_eventos').select('event_id').eq('clinica_id', cid).order('event_id').range(d, h), 100000)
    const propios = new Set<string>((filas || []).map((f: any) => String(f.event_id)))

    // calendars: the owner's visible ones; without the calendar-list permission fall back to the primary calendar only
    let faltaPermiso = false
    let cals: { id: string, nombre: string, color: string | null, primary: boolean }[] = []
    const lista = await gcal(ctx.token, 'GET', '/users/me/calendarList?minAccessRole=reader&maxResults=50')
    if (lista.ok && Array.isArray(lista.data?.items)) {
      cals = lista.data.items
        .filter((c: any) => c && typeof c.id === 'string' && c.selected !== false && !c.hidden && !c.deleted)
        .slice(0, MAX_CALENDARIOS)
        .map((c: any) => ({
          id: c.id,
          // the primary calendar is named after the account email: never send an email to the screen
          nombre: c.primary || String(c.summaryOverride || c.summary || '').includes('@') ? 'Principal' : limpiar(c.summaryOverride || c.summary, 60) || 'Calendario',
          color: HEX.test(String(c.backgroundColor || '')) ? c.backgroundColor : null,
          primary: c.primary === true,
        }))
    } else if (lista.status === 403 || lista.status === 404 || lista.status === 429 || lista.status >= 500) {
      // «missing permission» ONLY when Google says the scope is insufficient; any other 403/429/5xx is a transient or unrelated failure:
      // fall back to the primary calendar without telling the user to reconnect
      const err = lista.data?.error
      const motivo = String(err?.errors?.[0]?.reason || '')
      if (lista.status === 403 && motivo === 'insufficientPermissions') faltaPermiso = true
      cals = [{ id: 'primary', nombre: 'Principal', color: null, primary: true }]
    } else throw new Error(`GCAL_${lista.status}`)
    // a list without any primary entry (filtered out) still shows events with links only for the real primary calendar


    const timeMin = `${desde}T00:00:00-06:00`, timeMax = `${sumarDias(hasta, 1)}T00:00:00-06:00`
    const q = new URLSearchParams({
      singleEvents: 'true', orderBy: 'startTime', timeMin, timeMax, maxResults: '250',
      fields: 'nextPageToken,items(id,status,summary,start,end,htmlLink,extendedProperties/private,eventType,recurringEventId)',
    })
    const eventos: any[] = []
    let omitidos = 0, truncado = false
    for (let k = 0; k < cals.length; k += 4) {
      if (Date.now() - t0 > PRESUPUESTO_EVENTOS_MS) { omitidos += cals.length - k; break }
      const lote = cals.slice(k, k + 4)
      const res = await Promise.all(lote.map(async (cal, j) => {
        try {
          const r = await gcal(ctx.token, 'GET', `/calendars/${encodeURIComponent(cal.id)}/events?${q}`)
          return r.ok && Array.isArray(r.data?.items) ? { cal, idx: k + j, items: r.data.items, mas: !!r.data.nextPageToken } : null
        } catch (e) { if (e instanceof Reconectar) throw e; return null } // a failing calendar is skipped
      }))
      for (const x of res) {
        if (!x) { omitidos++; continue }
        if (x.mas) truncado = true
        for (const ev of x.items) {
          if (!ev || ev.status === 'cancelled' || ev.eventType === 'workingLocation') continue
          // the platform's own events (citas and the clinic's own events) are already drawn locally
          if (ev.extendedProperties?.private?.cita_id || ev.extendedProperties?.private?.ch_evento || propios.has(String(ev.id)) || ID_RECURRENTE_PROPIO.test(String(ev.recurringEventId || ''))) continue
          const e = proyectar(ev, x.cal, x.idx)
          if (!e || e.finFecha < desde || e.fecha > hasta) continue
          eventos.push(e)
        }
      }
    }
    eventos.sort((a, c) => a.fecha.localeCompare(c.fecha) || (a.hora || '').localeCompare(c.hora || ''))
    if (eventos.length > MAX_EVENTOS) { eventos.length = MAX_EVENTOS; truncado = true }
    return json(req, { conectada: true, eventos, ...(faltaPermiso ? { faltaPermiso: true } : {}), ...(omitidos ? { omitidos } : {}), ...(truncado ? { truncado: true } : {}) })
  } catch (e) {
    if (e instanceof Reconectar) { await marcarError(cid); return json(req, { conectada: true, reconectar: true, eventos: [] }) }
    console.error('google-calendar eventos', e instanceof Error ? e.message : 'error')
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
    if (r === '/evento') return await sincronizarEvento(req, p)
    if (r === '/meet') return await meetCita(req, p)
    if (r === '/sync-todas') return await sincronizarTodas(req, p)
    if (r === '/eventos') return await eventosGoogle(req, p)
    if (r === '/confirmar') return await confirmar(req, p)
    if (r === '/opciones') return await opciones(req, p)
    if (r === '/desconectar') return await desconectar(req, p)
    return json(req, { error: 'RUTA' }, 404)
  } catch (e) {
    console.error('google-calendar', r, e instanceof Error ? e.message : 'error')
    return json(req, SELECT_ERR, 500)
  }
})

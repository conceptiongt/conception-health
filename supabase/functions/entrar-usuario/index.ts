// Login of hospital staff WITHOUT e-mail: hospital code + usuario + password → session tokens. PUBLIC (deployed with verify_jwt = false).
// The accounts use a random synthetic e-mail that is never sent to the browser, so GoTrue cannot be called directly with a guessable address
// and this function is the only way in: it enforces the lockout (5 failed attempts per hospital+usuario in 15 min) and a per-IP limit (30/hour).
// EVERY failure (unknown hospital, unknown user, wrong password, locked, deactivated, temporary password older than 72 h) returns the same
// 401 {error:'CREDENCIALES'} after a fixed time floor, so nothing tells a valid code or user from an invalid one. Only the per-IP limit answers 429.
// Nothing sensitive is logged (no passwords, users or codes).
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const URL_ = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const db = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const HOSPITAL = /^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/
const USUARIO = /^[a-z0-9._-]{3,30}$/
const LIMITE_IP = 30 // attempts per IP every hour (accion 'entrar' in limite_publico)
const FALLOS = 5 // failed attempts that lock a hospital+usuario…
const VENTANA_MS = 15 * 60 * 1000 // …for the next 15 minutes
const CLAVE_TEMPORAL_MS = 72 * 3600 * 1000
const PISO_MS = 1200 // every failure takes at least this long (+ jitter): hides every difference between the failure paths
const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
// `sb-forwarded-for` lets GoTrue see the real client IP for its own rate limits (harmless if IP forwarding is off)
const nuevoCliente = (ip: string) => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { 'sb-forwarded-for': ip } } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405)
  const t0 = Date.now()
  const fallar = async () => {
    const falta = PISO_MS + Math.random() * 150 - (Date.now() - t0)
    if (falta > 0) await dormir(falta)
    return json({ error: 'CREDENCIALES' }, 401)
  }

  const b = await req.json().catch(() => ({}))
  const hospital = String(b?.hospital ?? '').trim().toUpperCase()
  const usuario = String(b?.usuario ?? '').trim().toLowerCase()
  const password = typeof b?.password === 'string' ? b.password : ''

  // per-IP limit: counts every attempt (valid or not)
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida'
  const desdeIp = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await db.from('limite_publico').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('accion', 'entrar').gte('at', desdeIp)
  if ((count ?? 0) >= LIMITE_IP) return json({ error: 'DEMASIADOS_INTENTOS' }, 429)
  await db.from('limite_publico').insert({ ip, accion: 'entrar' })

  // housekeeping: ~5 % of the calls remove attempts older than 30 days
  if (Math.random() < 0.05) await db.from('acceso_intentos').delete().lt('at', new Date(Date.now() - 30 * 86400000).toISOString())

  if (!HOSPITAL.test(hospital) || !USUARIO.test(usuario) || !password || password.length > 200) return fallar()

  const { data: clinica } = await db.from('clinicas').select('id').eq('codigo_acceso', hospital).maybeSingle()
  const { data: perfil } = clinica
    ? await db.from('perfiles').select('user_id, rol, usuario, activo, password_creada, clave_temporal_at').eq('clinica_id', clinica.id).eq('usuario', usuario).maybeSingle()
    : { data: null }
  if (!clinica || !perfil || perfil.rol !== 'asistente') {
    return fallar() // unknown hospital or user: same answer after the same time floor
  }
  if (perfil.activo === false) return fallar()
  if (!perfil.password_creada && perfil.clave_temporal_at && Date.now() - new Date(perfil.clave_temporal_at).getTime() > CLAVE_TEMPORAL_MS) return fallar() // temporary password expired

  // lockout: consecutive failures since the last success, inside the window. While locked nothing is attempted and nothing new is recorded
  // (recording would let anyone extend the lock of somebody else's account forever)
  const { data: previos } = await db.from('acceso_intentos').select('ok, at').eq('clinica_id', clinica.id).eq('usuario', usuario)
    .gte('at', new Date(Date.now() - VENTANA_MS).toISOString()).order('at', { ascending: false }).limit(FALLOS)
  let seguidos = 0
  for (const p of previos || []) { if (p.ok) break; seguidos++ }
  if (seguidos >= FALLOS) return fallar()

  const { data: u } = await db.auth.admin.getUserById(perfil.user_id)
  const correo = u?.user?.email
  if (!correo) return fallar()

  // a FRESH anonymous client (never the service client): the session that comes back belongs to the user
  // the attempt is recorded as failed BEFORE trying, so parallel requests cannot get past the lockout; a success flips it to ok
  const { data: intento } = await db.from('acceso_intentos').insert({ clinica_id: clinica.id, usuario, ip, ok: false }).select('id').single()
  const { data: sesion, error } = await nuevoCliente(ip).auth.signInWithPassword({ email: correo, password })
  const ok = !error && !!sesion?.session
  if (!ok) return fallar()
  if (intento?.id) await db.from('acceso_intentos').update({ ok: true }).eq('id', intento.id)
  return json({ access_token: sesion!.session!.access_token, refresh_token: sesion!.session!.refresh_token })
})

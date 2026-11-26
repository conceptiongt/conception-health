// Redeems an invitation code for the signed-in clinic owner (Suscripción → «¿Tiene un código de invitación?»).
// Only the owner (rol 'dueno') of an account can redeem, and only for their own clinic: the clinic id comes from their profile, never from the body.
// The real work is the promo_canjear() database function (service role only): one use per clinic, atomic claim of the code.
// Deployed with verify_jwt = true.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const CODIGO = /^[A-Za-z0-9-]{1,40}$/
const LIMITE_CODIGO = 8 // attempts per IP every hour (shared with crear-cuenta)

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function permitido(ip: string) {
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await db.from('limite_publico').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('accion', 'codigo').gte('at', desde)
  if ((count ?? 0) >= LIMITE_CODIGO) return false
  await db.from('limite_publico').insert({ ip, accion: 'codigo' })
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  })
  const { data: { user } } = await usuario.auth.getUser()
  if (!user) return json({ error: 'Sesión no válida' }, 401)

  const { data: perfil } = await db.from('perfiles').select('clinica_id, rol').eq('user_id', user.id).maybeSingle()
  if (!perfil) return json({ error: 'Cuenta no encontrada' }, 404)
  // Only the clinic owner; assistants and temporary Conception support sessions cannot redeem
  if (perfil.rol !== 'dueno') return json({ error: 'Solo quien administra la cuenta puede aplicar un código.' }, 403)

  const body = await req.json().catch(() => ({}))
  const codigo = String(body?.codigo || '').replace(/\s+/g, '')
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida'
  if (!(await permitido(ip))) return json({ error: 'DEMASIADOS_INTENTOS' }, 429)
  if (!CODIGO.test(codigo)) return json({ ok: false })

  const { data, error } = await db.rpc('promo_canjear', { p_clinica: perfil.clinica_id, p_codigo: codigo, p_ip: ip })
  if (error || !data) return json({ error: 'No se pudo aplicar el código. Intente de nuevo.' }, 500)
  return json(data.ok ? { ok: true, hasta: data.hasta } : { ok: false, motivo: data.motivo === 'ya_activa' ? 'ya_activa' : undefined })
})

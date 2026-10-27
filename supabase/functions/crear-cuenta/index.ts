// Public sign-up without waiting for an email: the doctor (or an invited assistant) chooses a password and enters right away.
// The account is created already confirmed; the al_crear_usuario trigger creates the clinic, or joins the clinic that invited that email.
// Protections: per-IP limit (limite_publico), honeypot, minimum fill time and server-side validation.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const EMAIL = /^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/i
const LIMITE = 5 // accounts per IP every 10 minutes

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function permitido(ip: string) {
  const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count } = await db.from('limite_publico').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('accion', 'crear_cuenta').gte('at', desde)
  if ((count ?? 0) >= LIMITE) return false
  await db.from('limite_publico').insert({ ip, accion: 'crear_cuenta' })
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405)
  const b = await req.json().catch(() => ({}))

  // bots: hidden field filled in, or the form sent in under 3 seconds
  if (b.sitio || (Number(b.t) && Number(b.t) < 3000)) return json({ error: 'MUY_RAPIDO' }, 400)

  const email = String(b.email || '').trim().toLowerCase()
  const password = String(b.password || '')
  const nombre = String(b.nombre || '').trim().slice(0, 120)
  const especialidad = String(b.especialidad || '').trim()
  if (!EMAIL.test(email) || email.length > 120) return json({ error: 'CORREO_INVALIDO' }, 400)
  if (password.length < 8 || password.length > 72) return json({ error: 'PASSWORD_CORTA' }, 400)
  if (/[<>]|javascript:/i.test(nombre)) return json({ error: 'DATO_INVALIDO' }, 400)
  if (especialidad && !/^[a-z_]{2,40}$/.test(especialidad)) return json({ error: 'DATO_INVALIDO' }, 400)

  // an invited assistant does not need clinic name or specialty
  const { data: inv } = await db.from('invitaciones').select('id').ilike('email', email).is('aceptada_at', null).limit(1).maybeSingle()
  if (!inv && (!nombre || !especialidad)) return json({ error: 'FALTAN_DATOS' }, 400)

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida'
  if (!(await permitido(ip))) return json({ error: 'DEMASIADOS_INTENTOS' }, 429)

  const { data, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: inv ? { nombre } : { nombre, especialidad },
  })
  if (error) {
    const ya = /already|registered|exists/i.test(error.message)
    return json({ error: ya ? 'YA_EXISTE' : 'NO_SE_PUDO' }, ya ? 409 : 500)
  }
  // they already chose their password: skip the "create your password" screen
  await db.from('perfiles').update({ password_creada: true }).eq('user_id', data.user.id)
  return json({ ok: true, asistente: !!inv })
})

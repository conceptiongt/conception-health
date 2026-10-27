// Sends the invitation email to an assistant (Configuración → Usuarios → Invitar asistente).
// The administrator first saves the row in `invitaciones`; this function checks it belongs to their clinic and asks Supabase Auth
// to email the invite (template "Invite user"). Opening the link signs the assistant in and shows "Cree su contraseña";
// the al_crear_usuario trigger joins them to the clinic with the permissions chosen.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SITIO = 'https://health.conception-gt.com'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405)

  const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  })
  const { data: { user } } = await usuario.auth.getUser()
  if (!user) return json({ error: 'SESION' }, 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: perfil } = await db.from('perfiles').select('clinica_id, rol').eq('user_id', user.id).maybeSingle()
  if (perfil?.rol !== 'dueno') return json({ error: 'SOLO_ADMIN' }, 403)

  const { email: e } = await req.json().catch(() => ({}))
  const email = String(e || '').trim().toLowerCase()
  const { data: clinica } = await db.from('clinicas').select('nombre').eq('id', perfil.clinica_id).single()

  // Resend: the invite already created the user but they have not set a password yet → a "create your password" email
  const { data: yaEsta } = await db.from('perfiles').select('user_id, clinica_id, password_creada').ilike('email', email).maybeSingle()
  if (yaEsta) {
    if (yaEsta.clinica_id !== perfil.clinica_id) return json({ error: 'OTRA_CLINICA' }, 409)
    if (yaEsta.password_creada) return json({ error: 'YA_ENTRA' }, 409)
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: SITIO })
    return error ? json({ error: 'NO_SE_ENVIO', detalle: error.message }, 502) : json({ ok: true, reenvio: true })
  }

  const { data: inv } = await db.from('invitaciones').select('id, nombre').eq('clinica_id', perfil.clinica_id).ilike('email', email).is('aceptada_at', null).maybeSingle()
  if (!inv) return json({ error: 'NO_ENCONTRADA' }, 404)

  const { error } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: SITIO,
    data: { nombre: inv.nombre || '', clinica: clinica?.nombre || '' }, // {{ .Data.clinica }} in the email template
  })
  if (error) return json({ error: 'NO_SE_ENVIO', detalle: error.message }, 502)
  return json({ ok: true })
})

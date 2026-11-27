// Forced first password change of a hospital staff user (created by the administrator with a temporary password).
// The caller must be a staff user (perfiles.usuario not null) with an active profile. The new password follows the same rules as usuarios-hospital.
// It sets the password with the admin API, then password_creada = true and clave_temporal_at = null: for staff users the database trigger
// perfil_campos_hospital blocks those two columns for clients, so this function (service role) is the only way to flip them.
// The new password cannot equal the temporary one (checked by trying it against the user's own account with a throwaway client).
// Deployed with verify_jwt = true. Passwords are never logged.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const claveValida = (p: unknown) => typeof p === 'string' && p.length >= 10 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p)

const URL_ = Deno.env.get('SUPABASE_URL')!
const db = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405)

  const usuario = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
  const { data: { user } } = await usuario.auth.getUser()
  if (!user) return json({ error: 'SESION' }, 401)

  const { data: perfil } = await db.from('perfiles').select('usuario, activo, rol').eq('user_id', user.id).maybeSingle()
  if (!perfil?.usuario || perfil.activo === false || perfil.rol !== 'asistente') return json({ error: 'NO_APLICA' }, 403)

  const b = await req.json().catch(() => ({}))
  if (!claveValida(b?.password)) return json({ error: 'CLAVE_DEBIL' }, 400)

  // a "new" password equal to the current (temporary) one is rejected
  if (user.email) {
    const prueba = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { data: igual } = await prueba.auth.signInWithPassword({ email: user.email, password: b.password })
    if (igual?.session) { await prueba.auth.signOut({ scope: 'local' }).catch(() => {}); return json({ error: 'CLAVE_IGUAL' }, 400) }
  }

  const { error } = await db.auth.admin.updateUserById(user.id, { password: b.password })
  if (error) { console.error('cambiar-clave: updateUserById falló', error.status, error.code); return json({ error: 'NO_SE_PUDO' }, 500) }
  const { error: e2 } = await db.from('perfiles').update({ password_creada: true, clave_temporal_at: null }).eq('user_id', user.id)
  if (e2) return json({ error: 'NO_SE_PUDO' }, 500)
  return json({ ok: true })
})

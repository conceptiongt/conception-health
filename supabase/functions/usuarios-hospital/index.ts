// Staff accounts WITHOUT e-mail for hospital clinics (Configuración → Usuarios → «Crear usuario»).
// Only the administrator (rol 'dueno') of a clinic whose especialidad is 'hospital', never an expired account and never a support session.
// Actions in the JSON body: crear, restablecer, desactivar, activar, eliminar. (Editing name, position and permissions is NOT here: it goes through the perfil_admin_actualizar RPC, which runs as the owner.) Targets are ALWAYS staff users (perfiles.usuario not null)
// of the caller's own clinic: never the owner, never support, never another clinic. The clinic id comes from the caller's profile, never from the body.
// Auth: the staff user is created with a RANDOM synthetic e-mail (never returned, never derived from the username), so nobody can sign in through GoTrue
// directly with a guessable address and skip the lockout of entrar-usuario. The al_crear_usuario_hospital trigger creates the perfil from app_metadata
// and enforces the seat limit inside the same transaction (a failure there cancels the auth user: nothing is left half-created).
// Deployed with verify_jwt = true. Passwords are never logged.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const USUARIO = /^[a-z0-9._-]{3,30}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Keep in sync with PERMISOS in src/lib/permisos.js (+ the two UI-only keys). Boolean values; `profesional_id` is the only string key.
const PERMISOS_BOOL = ['expedientes', 'finanzas', 'inventario', 'costos', 'compras', 'emergencias', 'exportar', 'eliminar_citas', 'eliminar_inventario', 'eliminar', 'configuracion', 'registrar', 'ver_todos_pacientes', 'quirofano', 'camas']
const COLUMNAS = 'user_id, nombre, usuario, puesto, permisos, activo, password_creada, clave_temporal_at, created_at' // never email

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const claveValida = (p: unknown) => typeof p === 'string' && p.length >= 10 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p)
const textoLimpio = (v: unknown, min: number, max: number) => {
  const t = String(v ?? '').trim().replace(/\s+/g, ' ')
  return t.length >= min && t.length <= max && !/[<>]/.test(t) ? t : null
}
function sintetico() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return `u-${[...b].map(x => x.toString(16).padStart(2, '0')).join('')}@usuarios.conception-gt.com`
}

// Validates the permissions object; returns the clean object or null. profesional_id must be a doctor of THIS clinic ('' = none).
async function permisosLimpios(p: unknown, clinicaId: string) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  const salida: Record<string, boolean | string> = {}
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (k === 'profesional_id') {
      if (v === '' || v == null) continue
      if (typeof v !== 'string' || !UUID.test(v)) return null
      const { data } = await db.from('profesionales').select('id').eq('id', v).eq('clinica_id', clinicaId).maybeSingle()
      if (!data) return null
      salida[k] = v
    } else if (PERMISOS_BOOL.includes(k)) {
      if (typeof v !== 'boolean') return null
      salida[k] = v
    } // unknown keys are dropped
  }
  return salida
}

// A staff user of the caller's clinic: rol 'asistente' with a usuario. Anything else (owner, support, other clinic, e-mail assistant) is "not found".
async function personal(clinicaId: string, id: unknown) {
  if (typeof id !== 'string' || !UUID.test(id)) return null
  const { data } = await db.from('perfiles').select(`${COLUMNAS}, rol, clinica_id`).eq('user_id', id).eq('clinica_id', clinicaId).maybeSingle()
  if (!data || data.rol !== 'asistente' || !data.usuario) return null
  return data
}
// best effort: the hospital_cerrar_sesiones function ends the user's sessions (supabase-js admin.signOut needs the user's own JWT, not an id)
const cerrarSesiones = async (id: string) => { try { return !(await db.rpc('hospital_cerrar_sesiones', { p_user: id })).error } catch { return false } }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405)

  const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  })
  const { data: { user } } = await usuario.auth.getUser()
  if (!user) return json({ error: 'SESION' }, 401)

  const { data: yo } = await db.from('perfiles').select('clinica_id, rol, activo').eq('user_id', user.id).maybeSingle()
  if (!yo || yo.rol !== 'dueno' || yo.activo === false) return json({ error: 'SOLO_ADMIN' }, 403) // support sessions have rol 'soporte'
  const clinicaId: string = yo.clinica_id
  const { data: clinica } = await db.from('clinicas').select('especialidad').eq('id', clinicaId).maybeSingle()
  if (clinica?.especialidad !== 'hospital') return json({ error: 'NO_HOSPITAL' }, 403)
  const { data: vencida } = await db.rpc('clinica_vencida_de', { p_clinica: clinicaId })
  if (vencida === true) return json({ error: 'CUENTA_VENCIDA' }, 403)

  const b = await req.json().catch(() => ({}))
  const accion = String(b?.accion || '')

  // ─── crear ───
  if (accion === 'crear') {
    const usr = String(b.usuario ?? '').trim().toLowerCase()
    const nombre = textoLimpio(b.nombre, 2, 80)
    const puestoCrudo = String(b.puesto ?? '').trim()
    const puesto = puestoCrudo ? textoLimpio(puestoCrudo, 1, 40) : ''
    if (!USUARIO.test(usr) || !nombre || puesto === null) return json({ error: 'DATOS_INVALIDOS' }, 400)
    if (!claveValida(b.password)) return json({ error: 'CLAVE_DEBIL' }, 400)
    const permisos = await permisosLimpios(b.permisos, clinicaId)
    if (!permisos) return json({ error: 'DATOS_INVALIDOS' }, 400)

    const { data: cupos } = await db.rpc('hospital_cupos_de', { p_clinica: clinicaId })
    if (!cupos || Number(cupos.ocupados) >= Number(cupos.permitidos)) return json({ error: 'LIMITE_USUARIOS' }, 409)
    const { data: repetido } = await db.from('perfiles').select('user_id').eq('clinica_id', clinicaId).eq('usuario', usr).maybeSingle()
    if (repetido) return json({ error: 'USUARIO_OCUPADO' }, 409)

    // The trigger runs in the same transaction as the insert into auth.users: if it raises (limit, duplicate user, bad data) the auth user is NOT created.
    const { data, error } = await db.auth.admin.createUser({
      email: sintetico(), password: b.password, email_confirm: true,
      app_metadata: { alta: 'hospital', clinica_id: clinicaId, usuario: usr, nombre, puesto: puesto || null, permisos },
    })
    if (error || !data?.user) {
      console.error('crear: createUser falló', error?.status, error?.code)
      // GoTrue hides the cause of a trigger failure: look again to give a useful answer
      const { data: c2 } = await db.rpc('hospital_cupos_de', { p_clinica: clinicaId })
      if (c2 && Number(c2.ocupados) >= Number(c2.permitidos)) return json({ error: 'LIMITE_USUARIOS' }, 409)
      const { data: r2 } = await db.from('perfiles').select('user_id').eq('clinica_id', clinicaId).eq('usuario', usr).maybeSingle()
      if (r2) return json({ error: 'USUARIO_OCUPADO' }, 409)
      return json({ error: 'NO_SE_PUDO' }, 500)
    }
    // (clave_temporal_at, the 72 h clock of the temporary password, is stamped by the database trigger in the same insert)
    // keep only alta + clinica_id in app_metadata (it travels inside the JWT); null removes a key
    await db.auth.admin.updateUserById(data.user.id, { app_metadata: { usuario: null, nombre: null, puesto: null, permisos: null } })
    const { data: perfil } = await db.from('perfiles').select(COLUMNAS).eq('user_id', data.user.id).maybeSingle()
    return json({ ok: true, perfil })
  }

  // every other action works on one existing staff user
  const objetivo = await personal(clinicaId, b.user_id)
  if (!objetivo) return json({ error: 'NO_ENCONTRADO' }, 404)
  const id: string = objetivo.user_id

  if (accion === 'restablecer') {
    if (!claveValida(b.password)) return json({ error: 'CLAVE_DEBIL' }, 400)
    // flags first: if the password change then fails, the old password simply keeps working (never a new password without the forced change)
    const { error: e1 } = await db.from('perfiles').update({ password_creada: false, clave_temporal_at: new Date().toISOString() }).eq('user_id', id)
    if (e1) return json({ error: 'NO_SE_PUDO' }, 500)
    const { error: e2 } = await db.auth.admin.updateUserById(id, { password: b.password })
    if (e2) { console.error('restablecer: updateUserById falló', e2.status, e2.code); return json({ error: 'NO_SE_PUDO' }, 500) }
    const sesiones = await cerrarSesiones(id)
    return json({ ok: true, sesiones })
  }

  if (accion === 'desactivar') {
    // mi_clinica() turns NULL as soon as activo = false: the data is closed first, then the login is banned and the sessions ended
    const { error: e1 } = await db.from('perfiles').update({ activo: false }).eq('user_id', id)
    if (e1) return json({ error: 'NO_SE_PUDO' }, 500)
    const { error: e2 } = await db.auth.admin.updateUserById(id, { ban_duration: '876000h' })
    const sesiones = await cerrarSesiones(id)
    if (e2) console.error('desactivar: ban falló', e2.status, e2.code)
    return json({ ok: true, sesiones, bloqueado: !e2 })
  }

  if (accion === 'activar') {
    const { error: e2 } = await db.auth.admin.updateUserById(id, { ban_duration: 'none' })
    if (e2) { console.error('activar: unban falló', e2.status, e2.code); return json({ error: 'NO_SE_PUDO' }, 500) }
    const { error: e1 } = await db.from('perfiles').update({ activo: true }).eq('user_id', id)
    if (e1) return json({ error: 'NO_SE_PUDO' }, 500)
    return json({ ok: true })
  }

  if (accion === 'eliminar') {
    // same preparation as eliminar-cuenta for an assistant: the FK from pacientes.created_by must not block the deletion
    await db.from('pacientes').update({ created_by: null }).eq('created_by', id)
    const { error } = await db.auth.admin.deleteUser(id)
    if (error) { console.error('eliminar: deleteUser falló', error.status, error.code); return json({ error: 'NO_SE_PUDO' }, 500) }
    await db.from('perfiles').delete().eq('user_id', id).eq('clinica_id', clinicaId) // no-op when perfiles.user_id cascades from auth.users
    return json({ ok: true })
  }

  return json({ error: 'ACCION' }, 400)
})

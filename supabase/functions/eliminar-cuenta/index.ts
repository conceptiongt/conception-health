// Deletes the signed-in account (Configuración → Eliminar cuenta).
// Admin (rol 'dueno'): cancels the Recurrente subscription, then deletes the clinic's files, every row of the clinic and every user of the clinic.
// Assistant: deletes only their own user; the clinic's data stays.
// The reason is kept in cuentas_eliminadas (no personal or clinical data) to learn why clinics leave.
// Secrets: RECURRENTE_SECRET_KEY (only needed when the clinic has an active subscription)
import { createClient } from 'npm:@supabase/supabase-js@2'

const API = 'https://app.recurrente.com/api'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const BUCKETS = ['expedientes', 'logos', 'compartidos']

async function buscarSuscripcion(email: string, key: string) {
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${API}/subscriptions?page=${page}&items=50`, { headers: { 'X-SECRET-KEY': key } })
    if (!r.ok) throw new Error('recurrente')
    const data = await r.json()
    const lista = Array.isArray(data) ? data : (data.subscriptions || data.data || [])
    const s = lista.find((x: any) => String(x?.subscriber?.email || '').toLowerCase() === email && ['active', 'past_due', 'paused'].includes(x?.status))
    if (s) return s.id
    if (lista.length < 50) return null
  }
  return null
}

// Every file under "<clinica_id>/" in a bucket, walking sub-folders
async function listar(db: any, bucket: string, carpeta: string): Promise<string[]> {
  const rutas: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(carpeta, { limit: 1000, offset })
    if (error || !data?.length) break
    for (const x of data) {
      const ruta = `${carpeta}/${x.name}`
      if (x.id) rutas.push(ruta)
      else rutas.push(...await listar(db, bucket, ruta))
    }
    if (data.length < 1000) break
  }
  return rutas
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  })
  const { data: { user } } = await usuario.auth.getUser()
  if (!user) return json({ error: 'Sesión no válida' }, 401)

  const body = await req.json().catch(() => ({}))
  if (String(body?.confirmacion || '').trim().toLowerCase() !== 'eliminar') return json({ error: 'Escriba "eliminar" para confirmar' }, 400)
  const motivo = String(body?.motivo || '').slice(0, 200)
  const detalle = String(body?.detalle || '').slice(0, 1000)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: perfil } = await db.from('perfiles').select('clinica_id, rol, email').eq('user_id', user.id).maybeSingle()
  if (!perfil) return json({ error: 'Cuenta no encontrada' }, 404)
  const { data: clinica } = await db.from('clinicas').select('*').eq('id', perfil.clinica_id).single()

  // ─── Assistant: only their own user ───
  if (perfil.rol !== 'dueno') {
    await db.from('cuentas_eliminadas').insert({ tipo: 'usuario', clinica_nombre: clinica?.nombre, email: perfil.email, motivo, detalle })
    await db.from('pacientes').update({ created_by: null }).eq('created_by', user.id)
    const { error } = await db.auth.admin.deleteUser(user.id)
    if (error) return json({ error: 'No se pudo eliminar el usuario. Intente de nuevo.' }, 500)
    return json({ ok: true })
  }

  // ─── Admin: the whole clinic ───
  // 1. Stop charging first; never delete an account that would keep being charged
  if (clinica.plan_activo && !clinica.cancelada_at) {
    const key = Deno.env.get('RECURRENTE_SECRET_KEY')
    try {
      const email = String(clinica.recurrente_email || perfil.email).toLowerCase()
      const subId = clinica.recurrente_suscripcion_id || (key ? await buscarSuscripcion(email, key) : null)
      if (subId) {
        if (!key) throw new Error('sin llave')
        const r = await fetch(`${API}/subscriptions/${subId}`, { method: 'DELETE', headers: { 'X-SECRET-KEY': key } })
        if (!r.ok && r.status !== 404) throw new Error('recurrente')
      }
    } catch {
      return json({ error: 'No pudimos cancelar su suscripción en Recurrente, así que su cuenta no se eliminó. Intente de nuevo o escríbanos.' }, 502)
    }
  }

  const { count: pacientes } = await db.from('pacientes').select('id', { count: 'exact', head: true }).eq('clinica_id', clinica.id)
  await db.from('cuentas_eliminadas').insert({ tipo: 'clinica', clinica_nombre: clinica.nombre, email: perfil.email, plan: clinica.plan, motivo, detalle, pacientes: pacientes ?? 0 })
  const { data: usuarios } = await db.from('perfiles').select('user_id').eq('clinica_id', clinica.id)

  // 2. Files (photos, PDFs, logo, shared documents)
  for (const bucket of BUCKETS) {
    const rutas = await listar(db, bucket, clinica.id)
    for (let i = 0; i < rutas.length; i += 100) await db.storage.from(bucket).remove(rutas.slice(i, i + 100))
  }

  // 3. Rows: tables that block the cascade go first, then the clinic (everything else cascades)
  for (const tabla of ['inventario_movimientos', 'ordenes_compra_lineas', 'ordenes_compra']) {
    const { error } = await db.from(tabla).delete().eq('clinica_id', clinica.id)
    if (error) return json({ error: 'No se pudo terminar de eliminar la cuenta. Escríbanos para completarlo.' }, 500)
  }
  const { error: errClinica } = await db.from('clinicas').delete().eq('id', clinica.id)
  if (errClinica) return json({ error: 'No se pudo terminar de eliminar la cuenta. Escríbanos para completarlo.' }, 500)

  // 4. Users (the admin and every assistant)
  for (const u of usuarios || []) await db.auth.admin.deleteUser(u.user_id)
  return json({ ok: true })
})

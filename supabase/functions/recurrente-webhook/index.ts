// Receives Recurrente webhooks (signed with Svix) and keeps each clinic's plan in sync.
// Secrets (Supabase > Edge Functions > Secrets): RECURRENTE_WEBHOOK_SECRET (whsec_...), RECURRENTE_SECRET_KEY,
// optional RECURRENTE_PRODUCTO_MAX / RECURRENTE_PRODUCTO_BASICO / RECURRENTE_PRODUCTO_LIA (product ids).
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const API = 'https://app.recurrente.com/api'
const DIA = 24 * 60 * 60 * 1000

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

// Svix signature: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)), header may hold several "v1,<sig>"
async function firmaValida(req: Request, body: string) {
  const secret = Deno.env.get('RECURRENTE_WEBHOOK_SECRET')
  const id = req.headers.get('svix-id'), ts = req.headers.get('svix-timestamp'), sig = req.headers.get('svix-signature')
  if (!secret || !id || !ts || !sig) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false
  const key = await crypto.subtle.importKey('raw', fromB64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const esperada = b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)))
  return sig.split(' ').some(p => {
    const s = p.split(',')[1] || ''
    if (s.length !== esperada.length) return false
    let diff = 0
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ esperada.charCodeAt(i)
    return diff === 0
  })
}

async function obtenerSuscripcion(id: string) {
  const key = Deno.env.get('RECURRENTE_SECRET_KEY')
  if (!key || !id) return null
  const r = await fetch(`${API}/subscriptions/${id}`, { headers: { 'X-SECRET-KEY': key } })
  return r.ok ? await r.json() : null
}

// Básico, Max or Lía, from product id (if configured), product name, or amount (Max = Q375)
function detectarPlan(p: any): 'basico' | 'max' | 'lia' | null {
  const prodId = p?.product?.id || p?.product_id
  if (prodId && prodId === Deno.env.get('RECURRENTE_PRODUCTO_MAX')) return 'max'
  if (prodId && prodId === Deno.env.get('RECURRENTE_PRODUCTO_BASICO')) return 'basico'
  if (prodId && prodId === Deno.env.get('RECURRENTE_PRODUCTO_LIA')) return 'lia'
  const nombre = JSON.stringify(p?.product?.name || p?.product?.title || p?.checkout?.items || '').toLowerCase()
  if (nombre.includes('max')) return 'max'
  if (/\bl[ií]a\b/.test(nombre)) return 'lia'
  if (nombre.includes('básico') || nombre.includes('basico')) return 'basico'
  const cents = Number(p?.amount_in_cents ?? p?.price?.amount_in_cents ?? p?.product?.prices?.[0]?.amount_in_cents)
  if (cents >= 37500) return 'max'
  if (cents > 0) return 'basico'
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  const body = await req.text()
  if (!(await firmaValida(req, body))) return new Response('firma inválida', { status: 401 })

  const p = JSON.parse(body)
  const tipo: string = p.event_type || p.type || p.event || ''
  const email = String(p.customer?.email || p.subscriber?.email || p.customer_email || p.email || '').trim().toLowerCase()
  const svixId = req.headers.get('svix-id')

  const { data: perfil } = email
    ? await db.from('perfiles').select('clinica_id').ilike('email', email).order('created_at').limit(1).maybeSingle()
    : { data: null }
  const clinicaId = perfil?.clinica_id || null

  let resultado = 'ignorado'
  if (!clinicaId) {
    resultado = 'sin_cuenta_con_ese_correo'
  } else if (['subscription.create', 'subscription.reactivate', 'subscription.unpause', 'intent.succeeded', 'payment_intent.succeeded'].includes(tipo)) {
    const subId = tipo.startsWith('subscription.') ? p.id : (p.subscription_id || p.subscription?.id || null)
    const sub = subId ? await obtenerSuscripcion(subId) : null
    const plan = detectarPlan(p) || detectarPlan(sub)
    const fin = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : Date.now() + 31 * DIA
    const cambios: Record<string, unknown> = {
      plan_activo: true,
      plan_hasta: new Date(fin + 3 * DIA).toISOString(), // 3 days of grace for the next charge
      recurrente_email: email,
      cancelada_at: null,
    }
    if (plan) cambios.plan = plan
    if (subId) cambios.recurrente_suscripcion_id = subId
    const { error } = await db.from('clinicas').update(cambios).eq('id', clinicaId)
    resultado = error ? `error: ${error.message}` : `activado${plan ? ' ' + plan : ' (plan sin identificar)'}`
  } else if (tipo === 'subscription.cancel') {
    // keeps access until the paid period ends (plan_hasta)
    const { error } = await db.from('clinicas').update({ cancelada_at: new Date().toISOString() }).eq('id', clinicaId)
    resultado = error ? `error: ${error.message}` : 'cancelada'
  } else if (['subscription.past_due', 'subscription.pause', 'intent.failed'].includes(tipo)) {
    resultado = 'aviso (acceso hasta plan_hasta)'
  }

  await db.from('recurrente_eventos').upsert({ svix_id: svixId, tipo, email, clinica_id: clinicaId, payload: p, resultado }, { onConflict: 'svix_id' })
  return new Response(JSON.stringify({ ok: true, resultado }), { headers: { 'Content-Type': 'application/json' } })
})

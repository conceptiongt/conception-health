import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { enMes } from './formato'

// Conception Studio (the agency platform) — public endpoint; only the functions below are reachable without login
const studio = createClient('https://otyoaxnkqlrjjwfxymwf.supabase.co', 'sb_publishable__uColSB_x66wQWY2qygkEA_3jxbvftJ', {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'studio-vinculo' },
})

// Accepts the full portal link (…/portal?t=<uuid>) or just the code
export function tokenDeLink(texto) {
  const m = String(texto || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return m ? m[0].toLowerCase() : null
}

export async function solicitarVinculo(link, clinica, email) {
  const token = tokenDeLink(link)
  if (!token) return { error: 'Pegue el link completo que le envió Conception.' }
  const { data, error } = await studio.rpc('health_solicitar_vinculo', {
    p_portal_token: token, p_health_clinica_id: clinica.id, p_nombre: clinica.nombre, p_email: email,
  })
  if (error || data?.error) return { error: data?.error === 'link_invalido' ? 'El link no es válido o fue desactivado. Pida uno nuevo a Conception.' : 'No se pudo conectar con Conception Studio.' }
  const cambios = { studio_clave: data.clave, studio_estado: data.estado, studio_cliente: data.cliente }
  await supabase.from('clinicas').update(cambios).eq('id', clinica.id)
  return { ok: true, ...cambios }
}

export async function estadoVinculo(clave) {
  const { data, error } = await studio.rpc('health_estado_vinculo', { p_clave: clave })
  return error ? null : data
}

export async function desvincular(clinica) {
  if (clinica.studio_clave) await studio.rpc('health_desvincular', { p_clave: clinica.studio_clave })
  await supabase.from('clinicas').update({ studio_clave: null, studio_estado: null, studio_cliente: null, studio_ultimo_envio: null }).eq('id', clinica.id)
}

const CANAL = { Instagram: 'instagram', Facebook: 'facebook', TikTok: 'tiktok', WhatsApp: 'whatsapp', LinkedIn: 'linkedin' }

const TIPO_KEY = { 'Primera consulta': 'consultas', 'Seguimiento': 'consultas', 'Evaluación': 'consultas', 'Procedimiento': 'procedimientos', 'Cirugía': 'cirugias' }

// Monthly totals only — never names, phones or medical records.
// "Why they came" = the first appointment of each patient registered that month (whatever its date),
// with the exact service, e.g. "Cirugía · Rinoplastía".
export function totalesDelMes({ pacientes, citas, cobros }, m, conIngresos) {
  const nuevos = pacientes.filter(p => enMes(p.created_at, m))
  const canales = {}, tipos = { consultas: 0, cirugias: 0, procedimientos: 0, otros: 0 }, servicios = {}
  nuevos.forEach(p => {
    const k = p.origen === 'redes' ? CANAL[p.red] || 'otro' : p.origen === 'referido' ? 'referido' : p.origen === 'google' ? 'google' : 'otro'
    canales[k] = (canales[k] || 0) + 1
    const primera = citas.filter(c => c.paciente_id === p.id).sort((a, b) => (a.created_at || a.fecha).localeCompare(b.created_at || b.fecha))[0]
    if (!primera) return
    tipos[TIPO_KEY[primera.tipo] || 'otros'] += 1
    const detalle = [primera.tipo || 'Consulta', primera.servicio && primera.servicio !== primera.tipo ? primera.servicio : null].filter(Boolean).join(' · ')
    servicios[detalle] = (servicios[detalle] || 0) + 1
  })
  const datos = { cerrados: nuevos.length, canales, tipos, servicios }
  if (conIngresos) datos.ingreso_aprox = cobros.filter(c => enMes(c.fecha, m)).reduce((n, c) => n + (Number(c.pagado) || 0), 0)
  return datos
}

// Sends the current month and the two before it (so late edits also reach Studio)
export async function sincronizar(clinica, datos) {
  const hoy = new Date()
  for (let i = 0; i < 3; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const m = { mes: d.getMonth(), year: d.getFullYear() }
    const { data, error } = await studio.rpc('health_sincronizar', {
      p_clave: clinica.studio_clave, p_mes: m.mes, p_year: m.year, p_data: totalesDelMes(datos, m, clinica.studio_compartir_ingresos),
    })
    if (error || data?.error) return { error: data?.error || 'error' }
  }
  const ahora = new Date().toISOString()
  await supabase.from('clinicas').update({ studio_ultimo_envio: ahora }).eq('id', clinica.id)
  return { ok: true, ahora }
}

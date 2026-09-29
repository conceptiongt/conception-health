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

// Monthly totals only — never names, phones or medical records
export function totalesDelMes({ pacientes, citas, cobros }, m, conIngresos) {
  const nuevos = pacientes.filter(p => enMes(p.created_at, m))
  const canales = {}
  nuevos.forEach(p => {
    const k = p.origen === 'redes' ? CANAL[p.red] || 'otro' : p.origen === 'referido' ? 'referido' : p.origen === 'google' ? 'google' : 'otro'
    canales[k] = (canales[k] || 0) + 1
  })
  const realizadas = citas.filter(c => enMes(c.fecha, m) && !['No asistió', 'Reagendada'].includes(c.estado))
  const tipos = {
    consultas: realizadas.filter(c => ['Primera consulta', 'Seguimiento', 'Evaluación'].includes(c.tipo)).length,
    cirugias: realizadas.filter(c => c.tipo === 'Cirugía').length,
    procedimientos: realizadas.filter(c => c.tipo === 'Procedimiento').length,
  }
  const datos = { cerrados: nuevos.length, canales, tipos }
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

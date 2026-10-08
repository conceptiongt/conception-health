// Public endpoints (no login) for patients:
//  - portal: the patient's portal (/p/<token>) with only what the doctor authorized
//  - documento: a PDF shared by WhatsApp (/d/<token>) → short-lived signed link
//  - registro_ver / registro_guardar: the form a patient fills before the appointment (/r/<token>)
// Deploy with verify_jwt = false. Limits requests per IP and rejects code disguised as text.
import { createClient } from 'npm:@supabase/supabase-js@2'

const URL_BASE = Deno.env.get('SUPABASE_URL')!
const db = createClient(URL_BASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIMITES: Record<string, number> = { portal: 60, documento: 60, registro_ver: 60, registro_guardar: 6 } // per 10 minutes

async function permitido(ip: string, accion: string) {
  const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count } = await db.from('limite_publico').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('accion', accion).gte('at', desde)
  if ((count ?? 0) >= (LIMITES[accion] ?? 30)) return false
  await db.from('limite_publico').insert({ ip, accion })
  if (Math.random() < 0.02) await db.from('limite_publico').delete().lt('at', new Date(Date.now() - 86400000).toISOString())
  return true
}

const marca = (c: any) => c && ({
  nombre: c.nombre, color: c.color, especialidad: c.especialidad,
  logo: c.logo_path ? `${URL_BASE}/storage/v1/object/public/logos/${c.logo_path}` : null,
})

// ─── patient intake form ───
const CAMPOS: Record<string, number> = {
  nombre: 120, telefono: 30, email: 120, fecha_nacimiento: 10, sexo: 20, dpi: 30, direccion: 300, ocupacion: 120, estado_civil: 30,
  tipo_sangre: 10, alergias: 500, enfermedades: 500, medicamentos: 500, antecedentes_quirurgicos: 500, antecedentes_familiares: 500,
  contacto_emergencia: 120, telefono_emergencia: 30, origen: 20, motivo: 500,
}
const PELIGROSO = /[<>]|javascript:|data:text\/html|\bon\w+\s*=|<\s*\/?\s*(script|iframe|object|embed|svg)/i
function limpiar(d: Record<string, unknown>) {
  const out: Record<string, string | null> = {}
  for (const [k, max] of Object.entries(CAMPOS)) {
    const v = d?.[k]
    if (v == null || v === '') continue
    if (typeof v !== 'string') throw new Error('DATO_INVALIDO')
    const t = v.trim()
    if (t.length > max || PELIGROSO.test(t)) throw new Error('DATO_INVALIDO')
    out[k] = t || null
  }
  if (out.fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(out.fecha_nacimiento)) throw new Error('DATO_INVALIDO')
  if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new Error('DATO_INVALIDO')
  if (out.origen && !['redes', 'referido', 'google', 'otro'].includes(out.origen)) out.origen = 'otro'
  return out
}

// token is either a patient's own form or the clinic's general link
async function destinoRegistro(token: string) {
  const { data: p } = await db.from('pacientes').select('id, nombre, telefono, email, clinica_id, registro_completado_at').eq('registro_token', token).maybeSingle()
  if (p) {
    const { data: c } = await db.from('clinicas').select('*').eq('id', p.clinica_id).single()
    return { paciente: p, clinica: c }
  }
  const { data: c } = await db.from('clinicas').select('*').eq('registro_token', token).maybeSingle()
  return c ? { paciente: null, clinica: c } : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'METODO' }, 405)
  let body: any
  try { body = await req.json() } catch { return json({ error: 'JSON' }, 400) }
  const { accion, token } = body || {}
  if (!LIMITES[accion] || typeof token !== 'string' || !UUID.test(token)) return json({ error: 'SOLICITUD' }, 400)
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida'
  if (!(await permitido(ip, accion))) return json({ error: 'DEMASIADOS_INTENTOS' }, 429)

  // ─── shared PDF ───
  if (accion === 'documento') {
    const { data: d } = await db.from('documentos_compartidos').select('path, titulo, expira, clinica_id').eq('token', token).maybeSingle()
    if (!d) return json({ error: 'NO_ENCONTRADO' }, 404)
    if (new Date(d.expira) < new Date()) return json({ error: 'VENCIDO' }, 410)
    const { data: s } = await db.storage.from('compartidos').createSignedUrl(d.path, 3600)
    const { data: c } = await db.from('clinicas').select('*').eq('id', d.clinica_id).single()
    return json({ url: s?.signedUrl, titulo: d.titulo, clinica: marca(c) })
  }

  // ─── patient portal ───
  if (accion === 'portal') {
    const { data: p } = await db.from('pacientes').select('*').eq('portal_token', token).maybeSingle()
    if (!p) return json({ error: 'NO_ENCONTRADO' }, 404)
    const { data: c } = await db.from('clinicas').select('*').eq('id', p.clinica_id).single()
    if (!p.portal_activo) return json({ inactivo: true, clinica: marca(c) })
    const [{ data: citas }, { data: archivos }, { data: cobros }] = await Promise.all([
      db.from('citas').select('id, fecha, hora, tipo, servicio, estado, peso, talla, datos, ficha, procedimiento, portal_ocultar').eq('paciente_id', p.id).eq('portal', true).order('fecha', { ascending: false }),
      db.from('archivos').select('id, cita_id, etapa, fecha, notas, path, mime').eq('paciente_id', p.id).eq('portal', true).order('fecha', { ascending: false }),
      p.portal_costos ? db.from('cobros').select('id, fecha, concepto, precio, descuento, pagado, vence').eq('paciente_id', p.id).order('fecha', { ascending: false }) : Promise.resolve({ data: [] }),
    ])
    let firmados: Record<string, string> = {}
    if (archivos?.length) {
      const { data: urls } = await db.storage.from('expedientes').createSignedUrls(archivos.map(a => a.path), 3600)
      firmados = Object.fromEntries((urls || []).map(u => [u.path, u.signedUrl]))
    }
    const datos = p.portal_datos ? {
      fecha_nacimiento: p.fecha_nacimiento, sexo: p.sexo, telefono: p.telefono, email: p.email, tipo_sangre: p.tipo_sangre,
      alergias: p.alergias, enfermedades: p.enfermedades, medicamentos: p.medicamentos,
      antecedentes_quirurgicos: p.antecedentes_quirurgicos, antecedentes_familiares: p.antecedentes_familiares,
      contacto_emergencia: p.contacto_emergencia, telefono_emergencia: p.telefono_emergencia,
    } : null
    return json({
      clinica: { ...marca(c), plantilla: c.plantilla_ficha },
      paciente: { nombre: p.nombre, datos },
      // each consultation without the parts the doctor chose to hide
      citas: (citas || []).map(({ portal_ocultar, ...c }) => {
        const ocultas: string[] = portal_ocultar || []
        return {
          ...c,
          ficha: Object.fromEntries(Object.entries(c.ficha || {}).filter(([k]) => !ocultas.includes(k))),
          datos: ocultas.includes('_datos') ? {} : c.datos,
          peso: ocultas.includes('_datos') ? null : c.peso, talla: ocultas.includes('_datos') ? null : c.talla,
          procedimiento: ocultas.includes('_procedimiento') ? null : c.procedimiento,
        }
      }),
      archivos: (archivos || []).map(({ path, ...a }) => ({ ...a, url: firmados[path] })),
      cobros: cobros || [],
    })
  }

  // ─── intake form ───
  const destino = await destinoRegistro(token)
  if (!destino) return json({ error: 'NO_ENCONTRADO' }, 404)
  if (accion === 'registro_ver') {
    return json({ clinica: marca(destino.clinica), paciente: destino.paciente && { nombre: destino.paciente.nombre, telefono: destino.paciente.telefono, email: destino.paciente.email }, completado: !!destino.paciente?.registro_completado_at })
  }

  // registro_guardar: honeypot + minimum time on the page, then strict field validation
  if (body.sitio_web) return json({ ok: true }) // bots fill the hidden field
  if (typeof body.ms === 'number' && body.ms < 3000) return json({ error: 'MUY_RAPIDO' }, 400)
  let d
  try { d = limpiar(body.datos) } catch { return json({ error: 'DATO_INVALIDO' }, 400) }
  const { motivo, origen, ...campos } = d
  if (destino.paciente) {
    const { nombre, ...resto } = campos
    const { error } = await db.from('pacientes').update({ ...resto, ...(nombre ? { nombre } : {}), registro_completado_at: new Date().toISOString() }).eq('id', destino.paciente.id)
    if (error) return json({ error: 'NO_GUARDADO' }, 500)
    return json({ ok: true })
  }
  if (!campos.nombre || !campos.telefono) return json({ error: 'FALTAN_DATOS' }, 400)
  const { error } = await db.from('pacientes').insert({
    ...campos, clinica_id: destino.clinica.id, origen: origen || 'otro', extra: motivo ? { motivo_registro: motivo } : {},
    registro_completado_at: new Date().toISOString(),
  })
  if (error) return json({ error: error.message.includes('LIMITE_PRUEBA') ? 'LIMITE' : 'NO_GUARDADO' }, 400)
  return json({ ok: true })
})

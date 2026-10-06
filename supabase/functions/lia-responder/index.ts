// Lía, the virtual receptionist: answers a patient message with the Claude API using the clinic's own
// data, price list and agenda (Conception Health tables). Today it serves "Probar a Lía" (the test chat
// inside the app); the WhatsApp webhook will reuse responder() for real conversations.
// Secrets (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY (required), LIA_MODELO (optional).
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const MODELO = Deno.env.get('LIA_MODELO') || 'claude-opus-5-5'
const LIMITE_PRUEBAS_DIA = 80 // test replies per clinic and day (each one costs API usage)
const OFFSET_GT = -6 // Guatemala is UTC-6 all year
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ---------- local dates as plain strings (YYYY-MM-DD, minutes of the day) ----------
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const pad = (n: number) => String(n).padStart(2, '0')
function ahora() {
  const d = new Date(Date.now() + OFFSET_GT * 3600e3)
  return { fecha: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), iso: d.toISOString() }
}
const sumarDias = (f: string, n: number) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const diaSemana = (f: string) => new Date(f + 'T00:00:00Z').getUTCDay()
const aMin = (h: string) => { const [a, b] = String(h || '').split(':').map(Number); return a * 60 + (b || 0) }
const aHora = (m: number) => pad(Math.floor(m / 60)) + ':' + pad(m % 60)
const fechaLarga = (f: string) => { const d = new Date(f + 'T00:00:00Z'); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}` }
const fmtQ = (n: number) => n > 0 ? 'Q' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'precio a confirmar con el consultorio'
const norm = (s: unknown) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// ---------- settings ----------
const HORARIO_BASE = { 0: [], 1: [['08:00', '13:00'], ['14:30', '18:00']], 2: [['08:00', '13:00'], ['14:30', '18:00']], 3: [['08:00', '13:00'], ['14:30', '18:00']], 4: [['08:00', '13:00'], ['14:30', '18:00']], 5: [['08:00', '13:00'], ['14:30', '18:00']], 6: [['08:00', '12:00']] }
function configuracion(guardada: any, clinica: any) {
  const g = guardada || {}
  return {
    nombre: 'Lía', trato: 'usted', emojis: 'pocos', modo: 'siempre', duracion_base: 30,
    presentacion: `Soy ${g.nombre || 'Lía'}, asistente de ${clinica.nombre}.`,
    horario: HORARIO_BASE, servicios: {}, faq: [], bloqueos: [],
    ...g,
    datos: { doctor: clinica.nombre, ...(g.datos || {}) },
    metodo: { tipos: [], cierre: [], pasar: [], nunca: [], ...(g.metodo || {}), insistir: { no: '', ...(g.metodo?.insistir || {}) } },
  }
}
function serviciosLia(cfg: any, servicios: any[]) {
  const lista = servicios
    .filter(s => s.activo !== false && cfg.servicios?.[s.id]?.ofrece !== false)
    .map(s => ({ id: s.id, nombre: s.nombre, categoria: s.categoria, precio: Number(s.precio) || 0, dur: Number(cfg.servicios?.[s.id]?.dur) || cfg.duracion_base || 30, nota: cfg.servicios?.[s.id]?.nota || '' }))
  if (!lista.length) lista.push({ id: null, nombre: 'Consulta', categoria: 'Primera consulta', precio: 0, dur: cfg.duracion_base || 30, nota: '' })
  return lista
}
function buscarServicio(ctx: Ctx, nombre: unknown) {
  const k = norm(nombre)
  if (!k) return null
  return ctx.servicios.find(s => norm(s.nombre) === k) || ctx.servicios.find(s => norm(s.nombre).includes(k) || k.includes(norm(s.nombre))) || null
}

// ---------- agenda ----------
type Ctx = { clinica: any, cfg: any, servicios: any[], citas: any[], conv: any, prueba: boolean, actividad: { tipo: string, texto: string }[], avisos: any[] }
const NO_OCUPA = ['Cancelada', 'No asistió', 'Reagendada']
function ocupados(ctx: Ctx, fecha: string, excl?: string) {
  const out: { a: number, b: number }[] = []
  for (const c of ctx.citas) {
    if (c.fecha !== fecha || !c.hora || c.id === excl || NO_OCUPA.includes(c.estado)) continue
    const a = aMin(c.hora)
    const dur = c.duracion || ctx.servicios.find(s => s.id === c.servicio_id)?.dur || ctx.cfg.duracion_base || 30
    out.push({ a, b: a + dur })
  }
  for (const b of ctx.cfg.bloqueos || []) {
    if (!b.fecha || fecha < b.fecha || fecha > (b.hasta_fecha || b.fecha)) continue
    out.push({ a: b.desde ? aMin(b.desde) : 0, b: b.hasta ? aMin(b.hasta) : 24 * 60 })
  }
  return out
}
function libres(ctx: Ctx, fecha: string, dur: number, excl?: string) {
  const oc = ocupados(ctx, fecha, excl), out: number[] = []
  for (const [i, f] of (ctx.cfg.horario?.[diaSemana(fecha)] || [])) {
    for (let m = aMin(i); m + dur <= aMin(f); m += 30) if (!oc.some(o => m < o.b && m + dur > o.a)) out.push(m)
  }
  return out
}
function proximos(ctx: Ctx, dur: number, desde: string, o: { max?: number, porDia?: number, parte?: string | null, excl?: string } = {}) {
  const res: { fecha: string, hora: string }[] = [], h = ahora(), max = o.max || 8
  for (let i = 0, f = desde < h.fecha ? h.fecha : desde; i < 40 && res.length < max; i++, f = sumarDias(f, 1)) {
    let n = 0, last = -1e9
    for (const m of libres(ctx, f, dur, o.excl)) {
      if (f === h.fecha && m < h.min + 60) continue
      if (o.parte === 'mañana' && m >= 720) continue
      if (o.parte === 'tarde' && m < 720) continue
      if (m - last < 150) continue
      res.push({ fecha: f, hora: aHora(m) }); n++; last = m
      if (n >= (o.porDia || 2) || res.length >= max) break
    }
  }
  return res
}
function estaLibre(ctx: Ctx, fecha: string, hora: string, dur: number, excl?: string) {
  const h = ahora()
  if (fecha < h.fecha || (fecha === h.fecha && aMin(hora) < h.min)) return false
  return libres(ctx, fecha, dur, excl).includes(aMin(hora))
}
const fechaHora = (f: unknown, h: unknown) => {
  const fecha = String(f || '').trim(), hora = String(h || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{1,2}:\d{2}$/.test(hora)) return null
  return { fecha, hora: hora.padStart(5, '0') }
}
const opciones = (ctx: Ctx, dur: number, desde: string, excl?: string) =>
  proximos(ctx, dur, desde, { max: 3, porDia: 2, excl }).map(x => `${fechaLarga(x.fecha)} a las ${x.hora} (${x.fecha} ${x.hora})`).join('; ') || 'ninguna en las próximas semanas'

// Keyword mode: Lía only answers conversations where the patient wrote the keyword (accents and case ignored)
const dicePalabra = (texto: unknown, palabra: string) => {
  const k = norm(palabra).replace(/[^a-z0-9 ]/g, '')
  return !!k && new RegExp(`(^|[^a-z0-9])${k}($|[^a-z0-9])`).test(norm(texto))
}
function activada(cfg: any, mensajes: any[]) {
  if (cfg.activacion?.modo !== 'palabra' || !norm(cfg.activacion.palabra)) return true
  return mensajes.some(m => m.de === 'l' || (m.de === 'p' && dicePalabra(m.texto, cfg.activacion.palabra)))
}

// The appointment this conversation holds: a real one in `citas`, or the simulated one of a test chat
function citaDeConversacion(ctx: Ctx) {
  if (ctx.prueba) return ctx.conv.prueba_cita || null
  return ctx.conv.cita_id ? ctx.citas.find(c => c.id === ctx.conv.cita_id && !NO_OCUPA.includes(c.estado)) || null : null
}

// ---------- tools ----------
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'ver_horarios_libres',
    description: 'Revisa la agenda real del consultorio y devuelve horarios libres para un servicio. Ya descuenta las citas, los bloqueos y las horas fuera de horario. Úsela antes de ofrecer horarios.',
    input_schema: { type: 'object', properties: {
      servicio: { type: 'string', description: 'Nombre del servicio tal como aparece en la lista de servicios' },
      desde: { type: 'string', description: 'Fecha YYYY-MM-DD desde la cual buscar (opcional)' },
      parte_del_dia: { type: 'string', enum: ['mañana', 'tarde', 'cualquiera'] },
    }, required: ['servicio'] },
  },
  {
    name: 'agendar_cita',
    description: 'Aparta la cita en la agenda del consultorio. Úsela solo cuando el paciente ya eligió un horario y dio su nombre completo. Si el horario ya no está libre devuelve un error con otras opciones.',
    input_schema: { type: 'object', properties: {
      nombre_completo: { type: 'string' },
      servicio: { type: 'string' },
      fecha: { type: 'string', description: 'YYYY-MM-DD' },
      hora: { type: 'string', description: 'HH:MM en formato de 24 horas' },
      motivo: { type: 'string', description: 'Motivo de consulta en pocas palabras' },
    }, required: ['nombre_completo', 'servicio', 'fecha', 'hora'] },
  },
  {
    name: 'cambiar_cita',
    description: 'Mueve o cancela la cita que este paciente ya apartó en esta conversación.',
    input_schema: { type: 'object', properties: {
      accion: { type: 'string', enum: ['mover', 'cancelar'] },
      fecha: { type: 'string', description: 'Nueva fecha YYYY-MM-DD (solo para mover)' },
      hora: { type: 'string', description: 'Nueva hora HH:MM (solo para mover)' },
    }, required: ['accion'] },
  },
  {
    name: 'pasar_al_doctor',
    description: 'Avisa de inmediato al médico y le pasa esta conversación. Úsela en los casos de la lista de cuándo pasar la conversación.',
    input_schema: { type: 'object', properties: {
      motivo: { type: 'string', description: 'Qué pasa, en una frase para el médico' },
      urgente: { type: 'boolean' },
    }, required: ['motivo'] },
  },
]

async function ejecutar(nombre: string, inp: any, ctx: Ctx) {
  const log = (tipo: string, texto: string) => ctx.actividad.push({ tipo, texto })
  if (nombre === 'ver_horarios_libres') {
    const sv = buscarServicio(ctx, inp.servicio) || ctx.servicios[0]
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(inp.desde || '')) ? inp.desde : ahora().fecha
    const parte = ['mañana', 'tarde'].includes(inp.parte_del_dia) ? inp.parte_del_dia : null
    const lista = proximos(ctx, sv.dur, desde, { max: 8, porDia: 2, parte })
    log('agenda', `Revisó su agenda: ${lista.length} horarios libres para ${sv.nombre.toLowerCase()}${parte ? ' en la ' + parte : ''}`)
    return { servicio: sv.nombre, precio: fmtQ(sv.precio), duracion_min: sv.dur, horarios: lista.map(x => ({ ...x, texto: `${fechaLarga(x.fecha)} a las ${x.hora}` })) }
  }
  if (nombre === 'agendar_cita') {
    const sv = buscarServicio(ctx, inp.servicio)
    if (!sv) throw new Error('No existe ese servicio. Servicios: ' + ctx.servicios.map(s => s.nombre).join(', '))
    if (citaDeConversacion(ctx)) throw new Error('Este paciente ya tiene una cita apartada en esta conversación. Para cambiarla use cambiar_cita.')
    const fh = fechaHora(inp.fecha, inp.hora)
    if (!fh) throw new Error('Fecha u hora con formato incorrecto. Use YYYY-MM-DD y HH:MM.')
    if (!estaLibre(ctx, fh.fecha, fh.hora, sv.dur)) {
      log('warn', 'Ese horario ya no estaba libre: evitó una doble reserva')
      throw new Error('Ese horario no está libre. Opciones libres cercanas: ' + opciones(ctx, sv.dur, fh.fecha))
    }
    const nombreP = String(inp.nombre_completo || ctx.conv.nombre).trim().slice(0, 80)
    const motivo = String(inp.motivo || ctx.conv.motivo || '').slice(0, 160)
    if (ctx.prueba) {
      ctx.conv.prueba_cita = { servicio_id: sv.id, servicio: sv.nombre, fecha: fh.fecha, hora: fh.hora, dur: sv.dur, precio: sv.precio, nombre: nombreP }
      ctx.citas.push({ id: 'prueba', fecha: fh.fecha, hora: fh.hora, duracion: sv.dur, estado: 'Pendiente' })
      log('ok', `Apartaría el ${fechaLarga(fh.fecha)} a las ${fh.hora} en su agenda (en la prueba no se guarda)`)
    } else {
      await reservar(ctx, sv, fh, nombreP, motivo)
      log('ok', `Apartó el ${fechaLarga(fh.fecha)} a las ${fh.hora} en su agenda`)
    }
    ctx.conv.nombre = nombreP
    if (motivo && !ctx.conv.motivo) ctx.conv.motivo = motivo
    if (ctx.conv.etapa !== 'doctor') ctx.conv.etapa = 'agendado'
    const d = ctx.cfg.datos || {}
    return { ok: true, cita: `${sv.nombre}, ${fechaLarga(fh.fecha)} a las ${fh.hora}`, precio: fmtQ(sv.precio), direccion: d.direccion || '', mapa: d.mapa || '', indicaciones: d.indicaciones || '' }
  }
  if (nombre === 'cambiar_cita') {
    const c = citaDeConversacion(ctx)
    if (!c) throw new Error('Este paciente no tiene una cita apartada en esta conversación.')
    if (inp.accion === 'cancelar') {
      if (ctx.prueba) ctx.conv.prueba_cita = null
      else {
        await db.from('citas').update({ estado: 'Cancelada' }).eq('id', c.id)
        c.estado = 'Cancelada'
        ctx.avisos.push({ tipo: 'cancelo', cita_id: c.id, texto: 'Canceló por WhatsApp. El espacio quedó libre.' })
      }
      if (ctx.conv.etapa === 'agendado') ctx.conv.etapa = 'calificando'
      log('warn', 'Canceló la cita y liberó el espacio en su agenda')
      return { ok: true }
    }
    const fh = fechaHora(inp.fecha, inp.hora)
    if (!fh) throw new Error('Para mover necesito fecha YYYY-MM-DD y hora HH:MM.')
    const dur = c.dur || c.duracion || ctx.cfg.duracion_base || 30
    const excl = ctx.prueba ? 'prueba' : c.id
    if (!estaLibre(ctx, fh.fecha, fh.hora, dur, excl)) throw new Error('Ese horario no está libre. Opciones: ' + opciones(ctx, dur, fh.fecha, excl))
    const antes = `${fechaLarga(c.fecha)} a las ${String(c.hora).slice(0, 5)}`
    if (ctx.prueba) {
      ctx.conv.prueba_cita = { ...c, fecha: fh.fecha, hora: fh.hora }
      const p = ctx.citas.find(x => x.id === 'prueba'); if (p) { p.fecha = fh.fecha; p.hora = fh.hora }
    } else {
      await db.from('citas').update({ fecha: fh.fecha, hora: fh.hora, estado: 'Pendiente' }).eq('id', c.id)
      c.fecha = fh.fecha; c.hora = fh.hora
      ctx.avisos.push({ tipo: 'movida', cita_id: c.id, texto: `Antes era el ${antes}.` })
    }
    log('ok', `Movió la cita al ${fechaLarga(fh.fecha)} a las ${fh.hora}`)
    return { ok: true, cita: `${fechaLarga(fh.fecha)} a las ${fh.hora}` }
  }
  if (nombre === 'pasar_al_doctor') {
    ctx.conv.etapa = 'doctor'
    ctx.conv.alerta = String(inp.motivo || 'Necesita su atención').slice(0, 200)
    if (!ctx.prueba) ctx.avisos.push({ tipo: 'doctor', texto: ctx.conv.alerta })
    log('hot', `Le avisó a usted: ${ctx.conv.alerta}`)
    return { ok: true, nota: 'El médico ya fue avisado.' }
  }
  throw new Error('Herramienta desconocida')
}

// Real booking (WhatsApp conversations): find or create the patient, create the appointment and its charge
async function reservar(ctx: Ctx, sv: any, fh: { fecha: string, hora: string }, nombre: string, motivo: string) {
  const cid = ctx.clinica.id
  let pacienteId = ctx.conv.paciente_id
  if (!pacienteId && ctx.conv.telefono) {
    const { data } = await db.from('pacientes').select('id').eq('clinica_id', cid).eq('telefono', ctx.conv.telefono).limit(1).maybeSingle()
    pacienteId = data?.id
  }
  if (!pacienteId) {
    const { data, error } = await db.from('pacientes').insert({ clinica_id: cid, nombre, telefono: ctx.conv.telefono, origen: 'redes', red: 'WhatsApp' }).select('id').single()
    if (error) throw new Error('No se pudo registrar al paciente en la agenda. Dígale que el consultorio le confirmará la cita.')
    pacienteId = data.id
  }
  const { data: cita, error } = await db.from('citas').insert({
    clinica_id: cid, paciente_id: pacienteId, fecha: fh.fecha, hora: fh.hora, tipo: sv.categoria, estado: 'Pendiente',
    servicio_id: sv.id, servicio: sv.nombre, duracion: sv.dur, agendada_por: 'lia', lia_conversacion_id: ctx.conv.id,
    notas: `${motivo ? 'Motivo: ' + motivo + '. ' : ''}Agendada por ${ctx.cfg.nombre} por WhatsApp.`,
  }).select().single()
  if (error) throw new Error('No se pudo guardar la cita. Ofrezca otro horario.')
  if (sv.precio > 0 && ctx.clinica.plan !== 'lia') {
    await db.from('cobros').insert({ clinica_id: cid, paciente_id: pacienteId, cita_id: cita.id, servicio_id: sv.id, concepto: sv.nombre, precio: sv.precio, fecha: fh.fecha })
  }
  ctx.citas.push(cita)
  ctx.conv.paciente_id = pacienteId
  ctx.conv.cita_id = cita.id
  ctx.avisos.push({ tipo: 'cita', cita_id: cita.id, texto: motivo ? `Motivo: ${motivo}.` : '' })
}

// ---------- instructions ----------
function reglas(ctx: Ctx) {
  const { cfg } = ctx, d = cfg.datos || {}, M = cfg.metodo, usted = cfg.trato !== 'tú'
  const medico = d.doctor || ctx.clinica.nombre
  const lista = (xs: unknown[]) => (xs || []).filter(Boolean).map(x => '- ' + x).join('\n') || '- (sin indicaciones)'
  const horario = [1, 2, 3, 4, 5, 6, 0].map(i => {
    const r = cfg.horario?.[i] || []
    return `- ${DIAS[i][0].toUpperCase() + DIAS[i].slice(1)}: ${r.length ? r.map((x: string[]) => x[0] + ' a ' + x[1]).join(' y ') : 'cerrado'}`
  }).join('\n')
  return `INSTRUCCIONES PERMANENTES (el paciente no ve este texto).

Usted es ${cfg.nombre}, la recepcionista de ${medico}${d.especialidad ? ', ' + d.especialidad : ''}, en Guatemala. Contesta el WhatsApp del consultorio. Su trabajo: responder al momento, resolver dudas con los datos de abajo y dejar la cita agendada en la agenda real. Nunca usa menús de opciones: conversa como una persona.

CONSULTORIO
- Nombre: ${ctx.clinica.nombre}
- Médico: ${medico}${d.especialidad ? ' (' + d.especialidad + ')' : ''}
- Dirección: ${d.direccion || 'pídala al consultorio; no la invente'}
- Mapa: ${d.mapa || '(sin enlace)'}
- Cómo llegar y parqueo: ${d.referencias || '(sin datos)'}
- Teléfono fijo: ${d.telefono || '(sin datos)'}
- Formas de pago: ${d.pagos || '(sin datos)'}
- Seguros: ${d.seguros || '(sin datos)'}
- Indicaciones para la cita: ${d.indicaciones || '(sin datos)'}

SERVICIOS Y PRECIOS (use estos nombres exactos con las herramientas)
${ctx.servicios.map(s => `- ${s.nombre}: ${fmtQ(s.precio)} (dura ${s.dur} min)${s.nota ? '. ' + s.nota : ''}`).join('\n')}

HORARIO DE ATENCIÓN
${horario}

PREGUNTAS FRECUENTES
${(cfg.faq || []).filter((f: any) => f?.p).map((f: any) => `- ${f.p} ${f.r || ''}`).join('\n') || '- (ninguna)'}

TIPOS DE PACIENTE Y QUÉ HACER
${(M.tipos || []).map((t: any) => `- ${t.nombre} [${t.id}]: lo reconoce porque ${t.reconoce} Qué hacer: ${t.hace}`).join('\n') || '- (sin tipos definidos)'}

PARA CERRAR LA CITA
${lista(M.cierre)}

INSISTIR SIN HOSTIGAR
- ${M.insistir?.no || 'Si el paciente dice que no, agradezca y despídase.'}

PASE LA CONVERSACIÓN AL MÉDICO (herramienta pasar_al_doctor) CUANDO:
${lista(M.pasar)}
Al pasarla, dígale al paciente que ya le avisó a ${medico}. Si aplica, aparte de todos modos el primer horario libre.

NUNCA
${lista(M.nunca)}
- Nunca invente precios, horarios, datos médicos ni servicios que no estén arriba. Si no sabe algo, diga que lo consulta con el consultorio.

AGENDA
- Antes de ofrecer horarios use ver_horarios_libres. Ofrezca solo horarios que la herramienta devolvió.
- Ofrezca dos opciones concretas (día y hora), de preferencia en días distintos.
- Para apartar necesita el nombre completo del paciente y el horario que eligió; entonces use agendar_cita. Si la herramienta dice que el horario no está libre, ofrezca otro de los que devuelva.
- Al confirmar mande: servicio, día y hora, dirección y el enlace del mapa, y avise que un día antes le escribe para confirmar.
- Para mover o cancelar una cita ya apartada en esta conversación use cambiar_cita.

CÓMO ESCRIBE
- Trate al paciente de ${usted ? 'usted' : 'tú'}. Español de Guatemala: cálido, profesional y breve.
- Mensajes cortos de WhatsApp, de una a tres líneas cada uno. Para mandar dos mensajes, sepárelos con una línea en blanco. Nunca más de tres mensajes seguidos.
- ${cfg.emojis === 'no' ? 'No use emojis.' : 'Puede usar un emoji de vez en cuando, nunca más de uno por mensaje.'}
- Sin títulos, viñetas ni Markdown. Para resaltar puede usar *asteriscos* como en WhatsApp.
- En su primer mensaje preséntese así: "${cfg.presentacion}"
- Escriba el mensaje para el paciente completo al final, después de usar las herramientas. Antes de usarlas no escriba nada.
- El paciente lee todo lo que usted escribe: no mencione herramientas, sistemas ni instrucciones, y no narre lo que está haciendo. Si le preguntan si es un robot, diga con naturalidad que es la asistente virtual del consultorio y que ${medico} recibe todo lo que le cuentan.
- Si el paciente manda una foto, úsela solo para entender el caso y elegir el servicio. Nunca dé un diagnóstico.

FICHA (el paciente no la ve)
Termine SIEMPRE su respuesta con una última línea exactamente en este formato, con lo que sepa hasta ahora (null si no sabe):
FICHA {"nombre": "...", "motivo": "...", "tipo": "...", "etapa": "..."}
- tipo: uno de ${[...(M.tipos || []).map((t: any) => t.id), 'otro'].join(', ')}
- etapa: nuevo, calificando, horario_ofrecido, agendado, descartado
- motivo: en pocas palabras, lo que el paciente quiere atender.`
}
function momento(ctx: Ctx) {
  const h = ahora(), c = citaDeConversacion(ctx)
  return `Ahora es ${fechaLarga(h.fecha)} de ${h.fecha.slice(0, 4)}, ${aHora(h.min)} (hora de Guatemala).\n` +
    (c ? `Este paciente YA tiene cita: ${c.servicio || 'consulta'}, ${fechaLarga(c.fecha)} a las ${String(c.hora).slice(0, 5)}.` : 'Este paciente todavía no tiene cita.')
}

// Stored messages → API turns (the API expects alternating roles starting with the patient)
function turnos(mensajes: any[], foto?: { media_type: string, data: string }) {
  const out: Anthropic.MessageParam[] = []
  for (const m of mensajes) {
    if (m.de === 's') continue
    const role = m.de === 'p' ? 'user' : 'assistant'
    const texto = m.de === 'p'
      ? ((m.foto ? '[El paciente mandó una foto] ' : '') + (m.texto || '')).trim() || '[foto]'
      : (m.de === 'd' ? '[Lo escribió el consultorio] ' : '') + (m.texto || '')
    const prev = out[out.length - 1]
    if (prev && prev.role === role) prev.content = prev.content + '\n\n' + texto
    else out.push({ role, content: texto })
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '[El consultorio escribió primero]' })
  const ultimo = out[out.length - 1]
  if (foto && ultimo?.role === 'user') {
    ultimo.content = [{ type: 'image', source: { type: 'base64', media_type: foto.media_type as any, data: foto.data } }, { type: 'text', text: String(ultimo.content) }]
  }
  return out
}

async function correr(ctx: Ctx, mensajes: any[], foto?: { media_type: string, data: string }) {
  const client = new Anthropic()
  const messages: any[] = turnos(mensajes, foto)
  const textos: string[] = []
  let final: string[] = [], entrada = 0, salida = 0
  for (let ronda = 0; ronda < 6; ronda++) {
    const r: any = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: reglas(ctx), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: momento(ctx) },
      ],
      tools: TOOLS,
      messages,
    } as any)
    entrada += (r.usage?.input_tokens || 0) + (r.usage?.cache_read_input_tokens || 0) + (r.usage?.cache_creation_input_tokens || 0)
    salida += r.usage?.output_tokens || 0
    const deRonda = r.content.filter((b: any) => b.type === 'text' && b.text).map((b: any) => b.text)
    // text written before a tool call is usually narration ("let me check…"); the patient gets the final round
    if (r.stop_reason !== 'tool_use') { final = deRonda; break }
    textos.push(...deRonda)
    messages.push({ role: 'assistant', content: r.content })
    const resultados = []
    for (const b of r.content) {
      if (b.type !== 'tool_use') continue
      try {
        const out = await ejecutar(b.name, b.input || {}, ctx)
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) })
      } catch (e) {
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: String((e as Error)?.message || e), is_error: true })
      }
    }
    messages.push({ role: 'user', content: resultados })
  }
  return { texto: (final.length ? final : textos).join('\n\n'), entrada, salida }
}

// The reply ends with a hidden "FICHA {...}" line (patient card); the rest is split into WhatsApp bubbles
function separar(texto: string) {
  let ficha: any = null
  const limpio = texto
    .replace(/`{0,3}[ \t]*FICHA[ \t]*:?[ \t]*(\{[^{}]*\})[ \t]*`{0,3}/gi, (_m, j) => { try { ficha = JSON.parse(j) } catch { /* ignore */ } return '' })
    .replace(/^[ \t]*FICHA\b.*$/gim, '')
  let partes = limpio.split(/\n[ \t]*\n/).map(s => s.replace(/^[ \t]*-{3,}[ \t]*$/gm, '').trim()).filter(Boolean)
  if (partes.length > 4) partes = [...partes.slice(0, 3), partes.slice(3).join('\n\n')]
  return { partes, ficha }
}
function aplicarFicha(ctx: Ctx, f: any) {
  if (!f || typeof f !== 'object') return
  const ok = (v: unknown) => typeof v === 'string' && v.trim() && v !== 'null'
  const conv = ctx.conv
  if (ok(f.nombre)) conv.nombre = f.nombre.trim().slice(0, 80)
  if (ok(f.motivo)) conv.motivo = f.motivo.trim().slice(0, 160)
  if (ok(f.tipo) && (f.tipo === 'otro' || (ctx.cfg.metodo.tipos || []).some((t: any) => t.id === f.tipo))) conv.tipo = f.tipo
  if (ok(f.etapa) && ['nuevo', 'calificando', 'horario_ofrecido', 'agendado', 'descartado'].includes(f.etapa)) {
    const tieneCita = !!citaDeConversacion(ctx)
    if (f.etapa === 'agendado' && !tieneCita) return
    if (conv.etapa === 'doctor' || (conv.etapa === 'agendado' && tieneCita)) { if (f.etapa !== 'descartado') return }
    conv.etapa = f.etapa
  }
}

// Answers the last patient message(s) of a conversation and stores everything
async function responder(clinica: any, conv: any, prueba: boolean, foto?: { media_type: string, data: string }): Promise<{ ctx: Ctx, nuevos: any[], callada?: boolean }> {
  const hoy = ahora().fecha
  const [cfgR, servR, citasR, msgR] = await Promise.all([
    db.from('lia_config').select('config').eq('clinica_id', clinica.id).maybeSingle(),
    db.from('servicios').select('*').eq('clinica_id', clinica.id),
    db.from('citas').select('id, fecha, hora, estado, servicio_id, servicio, duracion').eq('clinica_id', clinica.id).gte('fecha', hoy).lte('fecha', sumarDias(hoy, 60)),
    db.from('lia_mensajes').select('*').eq('conversacion_id', conv.id).order('created_at', { ascending: false }).limit(40),
  ])
  const cfg = configuracion(cfgR.data?.config, clinica)
  const ctx: Ctx = { clinica, cfg, servicios: serviciosLia(cfg, servR.data || []), citas: citasR.data || [], conv: { ...conv }, prueba, actividad: [], avisos: [] }
  if (prueba && conv.prueba_cita) ctx.citas.push({ id: 'prueba', fecha: conv.prueba_cita.fecha, hora: conv.prueba_cita.hora, duracion: conv.prueba_cita.dur, estado: 'Pendiente' })
  const mensajes = (msgR.data || []).reverse()

  if (cfg.modo === 'pausa' && !prueba) return { ctx, nuevos: [] }
  if (!activada(cfg, mensajes)) return { ctx, nuevos: [], callada: true }
  const r = await correr(ctx, mensajes, foto)
  const { partes, ficha } = separar(r.texto)
  aplicarFicha(ctx, ficha)

  const t0 = Date.now()
  const nuevos = partes.map((texto, i) => ({ clinica_id: clinica.id, conversacion_id: conv.id, de: 'l', texto, created_at: new Date(t0 + i).toISOString() }))
  if (nuevos.length) await db.from('lia_mensajes').insert(nuevos)
  const c = ctx.conv
  await db.from('lia_conversaciones').update({
    nombre: c.nombre, motivo: c.motivo, tipo: c.tipo, etapa: c.etapa, alerta: c.alerta, paciente_id: c.paciente_id, cita_id: c.cita_id,
    prueba_cita: prueba ? c.prueba_cita ?? null : null, ultimo_at: new Date().toISOString(),
  }).eq('id', conv.id)
  if (ctx.avisos.length) await db.from('lia_avisos').insert(ctx.avisos.map(a => ({ clinica_id: clinica.id, conversacion_id: conv.id, ...a })))

  const { data: uso } = await db.from('lia_uso').select('*').eq('clinica_id', clinica.id).eq('dia', hoy).maybeSingle()
  await db.from('lia_uso').upsert({
    clinica_id: clinica.id, dia: hoy, respuestas: (uso?.respuestas || 0) + 1,
    tokens_entrada: (uso?.tokens_entrada || 0) + r.entrada, tokens_salida: (uso?.tokens_salida || 0) + r.salida,
  })
  return { ctx, nuevos }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405)
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: u } = await db.auth.getUser(jwt)
    if (!u?.user) return json({ error: 'sin_sesion' }, 401)
    const { data: perfil } = await db.from('perfiles').select('clinica_id').eq('user_id', u.user.id).maybeSingle()
    if (!perfil) return json({ error: 'sin_sesion' }, 401)
    const { data: clinica } = await db.from('clinicas').select('*').eq('id', perfil.clinica_id).single()
    const body = await req.json().catch(() => ({}))

    if (body.accion === 'reiniciar') {
      await db.from('lia_conversaciones').delete().eq('clinica_id', clinica.id).eq('prueba', true)
      return json({ ok: true })
    }
    if (body.accion !== 'probar') return json({ error: 'accion' }, 400)
    if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'sin_llave' }, 503)

    const texto = String(body.texto || '').trim().slice(0, 2000)
    const tipos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    const foto = body.foto && tipos.includes(body.foto.media_type) && typeof body.foto.data === 'string' && body.foto.data.length < 7_000_000
      ? { media_type: body.foto.media_type, data: body.foto.data } : undefined
    if (!texto && !foto) return json({ error: 'vacio' }, 400)

    const { data: uso } = await db.from('lia_uso').select('respuestas').eq('clinica_id', clinica.id).eq('dia', ahora().fecha).maybeSingle()
    if ((uso?.respuestas || 0) >= LIMITE_PRUEBAS_DIA) return json({ error: 'limite' }, 429)

    let { data: conv } = await db.from('lia_conversaciones').select('*').eq('clinica_id', clinica.id).eq('prueba', true).maybeSingle()
    if (!conv) {
      const r = await db.from('lia_conversaciones').insert({ clinica_id: clinica.id, prueba: true, nombre: 'Paciente de prueba', origen: 'Prueba desde Conception Health' }).select().single()
      conv = r.data
    }
    const miniatura = typeof body.miniatura === 'string' && body.miniatura.startsWith('data:image/') && body.miniatura.length < 120_000 ? body.miniatura : null
    await db.from('lia_mensajes').insert({ clinica_id: clinica.id, conversacion_id: conv.id, de: 'p', texto: texto || null, foto: miniatura || (foto ? 'foto' : null) })

    let actividad: { tipo: string, texto: string }[] = [], error = null
    try {
      const r = await responder(clinica, conv, true, foto)
      actividad = r.ctx.actividad
      if (r.callada) {
        const palabra = r.ctx.cfg.activacion.palabra
        await db.from('lia_mensajes').insert({ clinica_id: clinica.id, conversacion_id: conv.id, de: 's', texto: `${r.ctx.cfg.nombre} no contestó: el mensaje no dice “${palabra}”. Así se comportará en WhatsApp con quien no la llame.` })
        actividad = [{ tipo: 'warn', texto: `No contestó: está configurada para atender solo a quien escriba “${palabra}”` }]
      } else if (!r.nuevos.length) error = 'sin_respuesta'
    } catch (e) {
      console.error('lia-responder', e)
      error = e instanceof Anthropic.RateLimitError ? 'ocupado' : e instanceof Anthropic.APIError ? 'ia' : 'fallo'
    }
    const [{ data: c2 }, { data: msgs }] = await Promise.all([
      db.from('lia_conversaciones').select('*').eq('id', conv.id).single(),
      db.from('lia_mensajes').select('*').eq('conversacion_id', conv.id).order('created_at'),
    ])
    return json({ conversacion: c2, mensajes: msgs || [], actividad, error })
  } catch (e) {
    console.error('lia-responder', e)
    return json({ error: 'fallo' }, 500)
  }
})

import DOMPurify from 'dompurify'

// Sections of each consultation's clinical file. The clinic can rename, reorder, hide or add them
// (Configuración → Ficha clínica); the text of each one is saved in citas.ficha = { [id]: html }.
export const PLANTILLA_BASE = [
  { id: 'motivo', titulo: 'Motivo de consulta', activo: true },
  { id: 'hallazgos', titulo: 'Evaluación y hallazgos', activo: true },
  { id: 'diagnostico', titulo: 'Diagnóstico', activo: true },
  { id: 'receta', titulo: 'Receta y medicamentos', activo: true },
  { id: 'tratamiento', titulo: 'Plan de tratamiento', activo: true },
  { id: 'indicaciones', titulo: 'Cuidados e indicaciones', activo: true },
  { id: 'seguimiento', titulo: 'Próximos pasos', activo: true },
]

export const plantillaDe = (clinica) => (Array.isArray(clinica?.plantilla_ficha) && clinica.plantilla_ficha.length ? clinica.plantilla_ficha : PLANTILLA_BASE)
export const seccionesActivas = (clinica) => plantillaDe(clinica).filter(s => s.activo !== false)

// Rich text kept safe: only formatting tags and a few style properties (color, highlight, size, font)
const ESTILOS = ['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-align']
let configurado = false
function configurar() {
  if (configurado) return
  configurado = true
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName !== 'style') return
    data.attrValue = data.attrValue.split(';').map(s => s.trim()).filter(s => {
      const [prop, ...val] = s.split(':')
      const v = val.join(':').toLowerCase()
      return ESTILOS.includes(prop?.trim().toLowerCase()) && !/url\(|expression|javascript:/.test(v)
    }).join('; ')
  })
}
export function limpiarHtml(html) {
  if (!html) return ''
  configurar()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'span', 'font', 'p', 'div', 'br', 'ul', 'ol', 'li', 'h3', 'h4', 'mark', 'blockquote'],
    ALLOWED_ATTR: ['style', 'color', 'face', 'size'],
  })
}
export const textoPlano = (html) => {
  if (!html) return ''
  const d = document.createElement('div')
  d.innerHTML = limpiarHtml(html.replace(/<(br|\/p|\/div|\/li|\/h3|\/h4)\s*\/?>/gi, '\n$&'))
  return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}
export const tieneTexto = (html) => !!textoPlano(html)

// Saved sections of a consultation, in the clinic's order (also shows sections no longer in the template if they have text)
export function seccionesDe(cita, clinica) {
  const ficha = cita?.ficha || {}
  const plantilla = plantillaDe(clinica)
  const lista = plantilla.filter(s => tieneTexto(ficha[s.id])).map(s => ({ id: s.id, titulo: s.titulo, html: limpiarHtml(ficha[s.id]) }))
  for (const [id, html] of Object.entries(ficha)) if (!plantilla.some(s => s.id === id) && tieneTexto(html)) lista.push({ id, titulo: 'Otros', html: limpiarHtml(html) })
  return lista
}

// Extra fields for every patient file (Configuración → Ficha clínica), saved in pacientes.extra
export const camposPaciente = (clinica) => (Array.isArray(clinica?.campos_paciente) ? clinica.campos_paciente : [])

export const edad = (iso) => {
  if (!iso) return null
  const n = new Date(iso + 'T12:00'), h = new Date()
  let a = h.getFullYear() - n.getFullYear()
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--
  return a >= 0 && a < 130 ? a : null
}

// Public links for patients
export const urlPortal = (p) => `${location.origin}/p/${p.portal_token}`
export const urlRegistro = (token) => `${location.origin}/r/${token}`
export const urlDocumento = (token) => `${location.origin}/d/${token}`

// Payment link (sample link until the clinic sets its own in Configuración → Pagos en línea)
export const LINK_PAGO_EJEMPLO = 'https://pagos.conception-gt.com/ejemplo'
export function linkPago(clinica, monto, concepto) {
  const base = clinica?.link_pago || LINK_PAGO_EJEMPLO
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}monto=${Number(monto || 0).toFixed(2)}&concepto=${encodeURIComponent(concepto || 'Anticipo de cita')}`
}

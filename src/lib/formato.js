import { MESES } from './constantes'

export const fmtQ = (n) => n == null || isNaN(n) ? '—' : `Q${Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const fmtNum = (n) => n == null ? '—' : Number(n).toLocaleString('es-GT')

// 'YYYY-MM-DD' → '5 de septiembre de 2026' (no timezone shifts)
export function fmtFecha(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} de ${MESES[m - 1].toLowerCase()} de ${y}`
}
export function fmtFechaCorta(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
export const fmtHora = (h) => h ? h.slice(0, 5) : '—'

export const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// { mes: 0-11, year } of an ISO date
export const mesDe = (iso) => ({ mes: Number(iso.slice(5, 7)) - 1, year: Number(iso.slice(0, 4)) })
export const enMes = (iso, m) => !!iso && Number(iso.slice(0, 4)) === m.year && Number(iso.slice(5, 7)) - 1 === m.mes
export const saldo = (c) => Math.max(0, (Number(c.precio) || 0) - (Number(c.pagado) || 0))

// Google Calendar "add event" link for a consultation (1 hour long)
export function linkCalendar(paciente, cita) {
  if (!cita.fecha) return null
  const d = cita.fecha.replace(/-/g, '')
  const [h, m] = (cita.hora || '09:00').slice(0, 5).split(':').map(Number)
  const pad = (n) => String(n).padStart(2, '0')
  const inicio = `${d}T${pad(h)}${pad(m)}00`
  const fin = `${d}T${pad((h + 1) % 24)}${pad(m)}00`
  const texto = `Cita: ${paciente.nombre}${cita.tipo ? ' — ' + cita.tipo : ''}`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(texto)}&dates=${inicio}/${fin}&ctz=America/Guatemala`
}

export function mensajeConfirmacion(paciente, cita, clinica) {
  return `¡Hola ${paciente.nombre}! 👋\n\nSu cita con ${clinica} está confirmada. ✅\n📅 Fecha: ${fmtFecha(cita.fecha)}\n⏰ Hora: ${fmtHora(cita.hora)}${cita.tipo ? `\n🩺 ${cita.tipo}` : ''}\n\nSi necesita reprogramar, por favor avísenos con anticipación. ¡Le esperamos!`
}

// wa.me link; Guatemala numbers without country code get +502
export function linkWhatsApp(telefono, texto) {
  const digitos = (telefono || '').replace(/\D/g, '')
  if (!digitos) return null
  const numero = digitos.length === 8 ? `502${digitos}` : digitos
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

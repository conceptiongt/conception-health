// Pure helpers for the operating-room calendar (no React, no imports: unit-testable with plain node).
// Instants are epoch milliseconds. The clinics work in America/Guatemala (UTC-6, no daylight saving), so «a day» and «an hour» are always
// read in that zone, whatever the browser's own zone is.
const ZONA_MS = -6 * 3600 * 1000
const MIN = 60000
const pad = (n) => String(n).padStart(2, '0')

export const inicioDia = (iso) => Date.parse(`${iso}T00:00:00-06:00`)
export const aInstante = (iso, hhmm) => Date.parse(`${iso}T${hhmm}:00-06:00`)
// 'YYYY-MM-DD' of an instant in Guatemala
export const fechaDe = (ms) => new Date(ms + ZONA_MS).toISOString().slice(0, 10)
// 'HH:MM' of an instant in Guatemala
export const horaDe = (ms) => { const d = new Date(ms + ZONA_MS); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
// minutes since 00:00 of the day `iso` (can be < 0 or > 1440 for instants of other days)
export const minutosDelDia = (ms, iso) => Math.round((ms - inicioDia(iso)) / MIN)
export const aHHMM = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`
export const solapa = (a0, a1, b0, b1) => a0 < b1 && b0 < a1

// Postgres timestamptz text («2026-12-01 14:00:00+00») or an ISO string → epoch ms (NaN when it cannot be read)
export function leerInstante(t) {
  if (t == null) return NaN
  if (typeof t === 'number') return t
  let s = String(t).trim().replace(' ', 'T')
  if (/[+-]\d\d$/.test(s)) s += ':00'
  return Date.parse(s)
}

export const textoDuracion = (min) => {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h} h ${m} min` : h === 1 ? '1 hora' : `${h} horas`
}

// { desdeMs, hastaMs } → reservas rows ({ recurso_id, inicio, fin, cita_id, motivo, titulo }) as { id, ini, fin, ... } with numeric instants
export const normalizarReservas = (filas) => (filas || []).map(r => ({
  recurso_id: r.recurso_id, recurso_tipo: r.recurso_tipo, cita_id: r.cita_id || null, motivo: r.motivo, titulo: r.titulo || '',
  id: r.id, ini: leerInstante(r.inicio), fin: leerInstante(r.fin),
})).filter(r => Number.isFinite(r.ini) && Number.isFinite(r.fin))

// reservations of one resource that overlap [ini, fin), ignoring those of the surgery being edited
export const choquesDe = (reservas, recursoId, ini, fin, ignorarCita) =>
  reservas.filter(r => r.recurso_id === recursoId && r.cita_id !== (ignorarCita || '\0') && solapa(r.ini, r.fin, ini, fin)).sort((a, b) => a.ini - b.ini)

// The three resources of a surgery for a start and a duration: the room is busy until the cleaning ends, the doctors only until `fin`.
// → { quirofano: [...], cirujano: [...], anestesiologo: [...] } with the conflicting reservations of each
export function choquesDeCirugia(reservas, { quirofano, cirujano, anestesiologo, ini, minutos, limpieza = 0, ignorarCita }) {
  const fin = ini + minutos * MIN
  return {
    quirofano: quirofano ? choquesDe(reservas, quirofano, ini, fin + limpieza * MIN, ignorarCita) : [],
    cirujano: cirujano ? choquesDe(reservas, cirujano, ini, fin, ignorarCita) : [],
    anestesiologo: anestesiologo ? choquesDe(reservas, anestesiologo, ini, fin, ignorarCita) : [],
  }
}
export const hayChoque = (c) => c.quirofano.length + c.cirujano.length + c.anestesiologo.length > 0

// Next start time (on a 30-minute grid, from `desde` on) at which the room, the surgeon and the anesthesiologist are all free for the duration.
// Looks at the rest of `desde`'s day first, then the following days (up to `dias` days). The surgery must end by `horaFin` (minutes).
// → epoch ms of the start, or null
export function proximoHorarioLibre(reservas, { quirofano, cirujano, anestesiologo, desde, minutos, limpieza = 0, ignorarCita, dias = 14, paso = 30, horaIni = 6 * 60, horaFin = 22 * 60 }) {
  if (!quirofano || !cirujano || !Number.isFinite(desde)) return null
  const dia0 = fechaDe(desde)
  for (let d = 0; d <= dias; d++) {
    const inicio = inicioDia(dia0) + d * 86400000 // days are 24 h long here (no daylight saving)
    const iso = fechaDe(inicio)
    let m = horaIni
    if (d === 0) m = Math.max(horaIni, Math.ceil(minutosDelDia(desde, iso) / paso) * paso)
    for (; m + minutos <= horaFin; m += paso) {
      const ini = inicio + m * MIN
      if (!hayChoque(choquesDeCirugia(reservas, { quirofano, cirujano, anestesiologo, ini, minutos, limpieza, ignorarCita }))) return ini
    }
  }
  return null
}

// «ocupado de 10:00 a 12:00» for the first conflicting reservation
export const textoChoque = (r) => `de ${horaDe(r.ini)} a ${horaDe(r.fin)}`

// Hour range shown by the day grid: 06:00–22:00, widened (to whole hours) to hold anything that falls outside it
export function rangoHoras(items, iso, base = [6, 22]) {
  let min = base[0] * 60, max = base[1] * 60
  const a = inicioDia(iso)
  for (const it of items) {
    if (!(it.fin > a && it.ini < a + 86400000)) continue
    min = Math.min(min, Math.max(0, minutosDelDia(it.ini, iso)))
    max = Math.max(max, Math.min(1440, minutosDelDia(it.fin, iso)))
  }
  return [Math.floor(min / 60), Math.ceil(max / 60)]
}

// Free / busy right now for one room: { libre, hasta (ms | null), motivo } — «libre hasta las 14:00» / «ocupado hasta las 12:30»
export function estadoAhora(reservas, quirofanoId, ahora) {
  const mias = reservas.filter(r => r.recurso_id === quirofanoId).sort((a, b) => a.ini - b.ini)
  const actual = mias.find(r => r.ini <= ahora && ahora < r.fin)
  if (actual) {
    // contiguous reservations (a block right after a surgery) are one busy stretch
    let fin = actual.fin
    for (const r of mias) if (r.ini <= fin && r.fin > fin) fin = r.fin
    return { libre: false, hasta: fin, motivo: actual.motivo, titulo: actual.titulo }
  }
  const sig = mias.find(r => r.ini > ahora)
  return { libre: true, hasta: sig ? sig.ini : null, motivo: null, titulo: '' }
}

// Busy fraction (0–1) of a resource between 06:00 and 22:00 of a day (for the week bars)
export function ocupacionDelDia(reservas, recursoId, iso, [h0, h1] = [6, 22]) {
  const a = inicioDia(iso) + h0 * 3600000, b = inicioDia(iso) + h1 * 3600000
  let total = 0
  const mias = reservas.filter(r => r.recurso_id === recursoId && solapa(r.ini, r.fin, a, b)).sort((x, y) => x.ini - y.ini)
  let hasta = a
  for (const r of mias) {
    const i = Math.max(r.ini, hasta, a), f = Math.min(r.fin, b)
    if (f > i) { total += f - i; hasta = f }
  }
  return total / (b - a)
}

// Cirugía → short labels
export const ESTADOS_CIRUGIA = {
  programada: { label: 'Programada', color: '#1F4FD0', bg: '#E6EDFF' },
  en_curso: { label: 'En curso', color: '#8A5A00', bg: '#FFF1CF' },
  realizada: { label: 'Realizada', color: '#127A3E', bg: '#E2F6EA' },
  suspendida: { label: 'Suspendida', color: '#9B2335', bg: '#FDE7EA' },
}
export const OPCIONES_DURACION = [30, 60, 90, 120, 180, 240]
export const OPCIONES_LIMPIEZA = [0, 15, 30]

// Server error → { codigo, detalle: { titulo, ini, fin } | null }. The message of a database error carries the short code.
export const CODIGOS_CIRUGIA = ['SIN_PERMISO', 'NO_ENCONTRADO', 'REFERENCIA_AJENA', 'DATOS_INVALIDOS', 'CHOQUE_QUIROFANO', 'CHOQUE_CIRUJANO', 'CHOQUE_ANESTESIOLOGO', 'CAMA_OCUPADA', 'PACIENTE_INGRESADO', 'FUERA_DE_SERVICIO', 'CIRUGIA_USAR_QUIROFANOS']
export function leerError(error) {
  const texto = `${error?.message || ''}`
  const codigo = CODIGOS_CIRUGIA.find(c => texto.includes(c)) || null
  let detalle = null
  const partes = String(error?.details || '').split('|')
  if (partes.length === 3) {
    const ini = leerInstante(partes[1]), fin = leerInstante(partes[2])
    if (Number.isFinite(ini) && Number.isFinite(fin)) detalle = { titulo: partes[0], ini, fin }
  }
  return { codigo, detalle }
}

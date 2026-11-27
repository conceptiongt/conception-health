// Hospital staff accounts WITHOUT e-mail: the administrator creates each user with a user name and a temporary password (edge function
// usuarios-hospital). Helpers shared by Configuración → Usuarios, the staff login and the app shell.
import { supabase } from './supabase'
import { PERMISOS } from './permisos'

// A staff user has a login name (perfiles.usuario); normal e-mail accounts never do
export const esPersonal = (perfil) => !!perfil?.usuario
export const CLAVE_TEMPORAL_HORAS = 72
export const CLAVE_MINIMO = 10

// Remembered on this device (never the user name or the password): the hospital code and that the last login was a staff login
export const LS_HOSPITAL = 'conception.hospital'
export const LS_MODO = 'conception.modo'
export const codigoGuardado = () => { try { return localStorage.getItem(LS_HOSPITAL) || '' } catch { return '' } }
export const marcarPersonal = (codigo) => { try { if (codigo) localStorage.setItem(LS_HOSPITAL, codigo); localStorage.setItem(LS_MODO, 'personal') } catch { /* private mode */ } }
export const modoGuardado = () => { try { return localStorage.getItem(LS_MODO) } catch { return null } }
export const olvidarModo = () => { try { localStorage.removeItem(LS_MODO) } catch { /* private mode */ } }
export const limpiarCodigoHospital = (v) => String(v || '').replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 20)

// ─── User name ───
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
export const USUARIO_RE = /^[a-z0-9._-]{3,30}$/
// «Ana María López Pérez» → ana.lopez; «Juan Pérez» → juan.perez
export function sugerirUsuario(nombre) {
  const t = sinTildes(nombre).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
  if (!t.length) return ''
  const apellido = t.length >= 3 ? t[t.length - 2] : t.length === 2 ? t[1] : ''
  return (apellido ? `${t[0]}.${apellido}` : t[0]).slice(0, 30)
}
export function errorUsuario(u, existentes = []) {
  if (!u) return 'Escriba el usuario.'
  if (u.length < 3) return 'Mínimo 3 caracteres.'
  if (u.length > 30) return 'Máximo 30 caracteres.'
  if (!USUARIO_RE.test(u)) return 'Solo minúsculas, números, punto, guion y guion bajo.'
  if (existentes.includes(u)) return 'Ese usuario ya existe en su hospital.'
  return ''
}
export const limpiarUsuario = (v) => sinTildes(v).toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '').slice(0, 30)

// ─── Password ───
export const claveValida = (p) => typeof p === 'string' && p.length >= CLAVE_MINIMO && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p)
export const REGLA_CLAVE = 'Mínimo 10 caracteres, con letras y números.'
const PALABRAS = ['Cielo', 'Mesa', 'Nube', 'Lago', 'Rio', 'Sol', 'Luna', 'Pino', 'Roble', 'Trigo', 'Cafe', 'Miel', 'Arena', 'Playa', 'Monte', 'Valle',
  'Campo', 'Brisa', 'Coral', 'Perla', 'Plata', 'Jade', 'Ambar', 'Flor', 'Rosa', 'Lirio', 'Cedro', 'Maiz', 'Nopal', 'Ceiba', 'Quetzal', 'Tucan',
  'Delfin', 'Halcon', 'Lince', 'Zorro', 'Oso', 'Panda', 'Koala', 'Tigre', 'Naranja', 'Limon', 'Mango', 'Papaya', 'Fresa', 'Uva', 'Menta', 'Salvia',
  'Faro', 'Puente', 'Torre', 'Barco', 'Vela', 'Ancla', 'Isla', 'Bahia', 'Cometa', 'Aurora', 'Trueno', 'Rayo', 'Nieve', 'Alba', 'Marea', 'Duna']
const azar = (n) => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % n }
// Readable and strong: three words + four digits, e.g. «Mesa-Nube-Lago-4821» (19 characters, letters and numbers)
export const generarClave = () => `${PALABRAS[azar(PALABRAS.length)]}-${PALABRAS[azar(PALABRAS.length)]}-${PALABRAS[azar(PALABRAS.length)]}-${1000 + azar(9000)}`

// ─── Positions and their permission templates ───
export const PUESTOS = ['Médico', 'Enfermería', 'Recepción', 'Caja', 'Bodega', 'Administración', 'Otro']
const PLANTILLAS = {
  'Médico': ['registrar', 'expedientes', 'emergencias', 'exportar', 'ver_todos_pacientes'],
  'Enfermería': ['registrar', 'expedientes', 'emergencias', 'inventario', 'camas', 'quirofano', 'ver_todos_pacientes'],
  'Recepción': ['registrar', 'ver_todos_pacientes'],
  'Caja': ['finanzas', 'exportar', 'ver_todos_pacientes'],
  'Bodega': ['inventario', 'compras'],
  'Administración': ['registrar', 'finanzas', 'exportar', 'inventario', 'costos', 'compras', 'ver_todos_pacientes'],
  'Otro': [],
}
// Every key the UI knows (PERMISOS at this moment: other stages add theirs there) as a full object of booleans, true only for the template's keys
export function plantillaPermisos(puesto, claves = clavesVisibles()) {
  const activas = PLANTILLAS[puesto] || []
  return Object.fromEntries(claves.map(k => [k, activas.includes(k)]))
}
// Keys that exist in permisos.js for a hospital (code defensively: «quirofano»/«camas» appear only once their stage is merged)
export const clavesVisibles = () => PERMISOS.map(p => p.k)
export const GRUPOS = [
  { titulo: 'Pacientes y citas', claves: ['registrar', 'expedientes', 'ver_todos_pacientes'] },
  { titulo: 'Hospital', claves: ['emergencias', 'quirofano', 'camas'] },
  { titulo: 'Dinero', claves: ['finanzas', 'exportar'] },
  { titulo: 'Inventario', claves: ['inventario', 'costos', 'compras', 'eliminar_inventario'] },
  { titulo: 'Eliminar', claves: ['eliminar', 'eliminar_citas'] },
  { titulo: 'Configuración', claves: ['configuracion'] },
]
// the groups with only the keys that exist; any key not in a group goes to «Otros»
export function gruposVisibles() {
  const todas = clavesVisibles()
  const usadas = new Set(GRUPOS.flatMap(g => g.claves))
  const g = GRUPOS.map(x => ({ titulo: x.titulo, items: x.claves.filter(k => todas.includes(k)).map(k => PERMISOS.find(p => p.k === k)) })).filter(x => x.items.length)
  const otros = todas.filter(k => !usadas.has(k)).map(k => PERMISOS.find(p => p.k === k))
  return otros.length ? [...g, { titulo: 'Otros', items: otros }] : g
}

// ─── Calling the edge functions ───
// Returns { data } or { error: 'CODIGO' } (the code the function answered, or 'RED' when it could not be reached)
async function invocar(nombre, body) {
  const { data, error } = await supabase.functions.invoke(nombre, { body })
  if (!error && data && !data.error) return { data }
  let codigo = data?.error
  if (!codigo && error) { try { codigo = (await error.context?.json())?.error } catch { /* sin detalle */ } }
  if (!codigo && error) codigo = error.name === 'FunctionsFetchError' ? 'RED' : 'NO_SE_PUDO'
  return { error: codigo || 'NO_SE_PUDO' }
}
export const llamarUsuarios = (accion, datos = {}) => invocar('usuarios-hospital', { accion, ...datos })
export const cambiarClave = (password) => invocar('cambiar-clave', { password })

export const ERRORES_USUARIOS = {
  LIMITE_USUARIOS: 'Ya usa todos los usuarios de su plan. Agregue un usuario adicional o desactive y elimine uno que ya no use.',
  USUARIO_OCUPADO: 'Ese usuario ya existe en su hospital. Elija otro.',
  CLAVE_DEBIL: `La contraseña no es válida. ${REGLA_CLAVE}`,
  DATOS_INVALIDOS: 'Revise los datos: nombre, usuario, puesto y permisos.',
  NO_ENCONTRADO: 'Ese usuario ya no existe. Se actualizó la lista.',
  CUENTA_VENCIDA: 'Su cuenta está vencida: no se pueden crear ni cambiar usuarios hasta reactivarla.',
  NO_HOSPITAL: 'Esta función es solo para cuentas de hospital.',
  SOLO_ADMIN: 'Solo el administrador puede hacerlo.',
  RED: 'No se pudo conectar. Revise su internet e intente de nuevo.',
}
export const mensajeUsuarios = (codigo, porDefecto = 'No se pudo completar. Intente de nuevo.') => ERRORES_USUARIOS[codigo] || porDefecto

// Text ready to send to the person (WhatsApp, paper…)
export function textoAcceso({ hospital, codigoHospital, usuario, password }) {
  return [
    `Acceso a Conception Health${hospital ? ` · ${hospital}` : ''}`,
    `Entre en: ${location.origin}/?hospital=${codigoHospital}`,
    `Código del hospital: ${codigoHospital}`,
    `Usuario: ${usuario}`,
    `Contraseña temporal: ${password}`,
    `La contraseña es temporal: se le pedirá cambiarla al entrar. Vence en ${CLAVE_TEMPORAL_HORAS} horas.`,
  ].join('\n')
}

// ─── «Ver los expedientes de todos los pacientes» (UI-only in this stage, NOT enforced by the database) ───
// When a staff user has ver_todos_pacientes = false, the lists show only their linked doctor's patients and citas (permisos.profesional_id),
// plus the patients they registered themselves. It limits what is shown on screen; a direct call to the API is not blocked by this.
export function filtrarPorMedico(datos, perfil) {
  if (!datos || !esPersonal(perfil) || perfil.permisos?.ver_todos_pacientes !== false) return datos
  const prof = perfil.permisos?.profesional_id || null
  const citas = prof ? datos.citas.filter(c => c.profesional_id === prof) : []
  const ids = new Set(citas.map(c => c.paciente_id))
  const pacientes = datos.pacientes.filter(p => ids.has(p.id) || p.created_by === perfil.user_id)
  const propios = new Set(pacientes.map(p => p.id))
  return { ...datos, citas: datos.citas.filter(c => (prof && c.profesional_id === prof) || (propios.has(c.paciente_id) && !c.profesional_id)), pacientes }
}

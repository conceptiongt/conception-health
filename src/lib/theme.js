// Conception Health design tokens — light workspace in the style of monday.com:
// white cards on a soft gray canvas, one action color, pastel surfaces, pill buttons.
// The action color is the clinic's own (Configuración → Marca), exposed as CSS variables by aplicarMarca().
export const COLOR_BASE = '#6161FF'

export const C = {
  // brand: a single color for actions and active states (clinic color, violet by default)
  purple: 'var(--acento)', onPurple: 'var(--acento-texto)', purpleDark: 'var(--acento-oscuro)', purpleLight: 'var(--acento-claro)', purpleMid: 'var(--acento-tenue)',
  cyan: '#3AC9FF',
  grad: 'linear-gradient(135deg, var(--acento) 0%, #3AC9FF 100%)',
  prism: 'conic-gradient(from 270deg, #8181FF 15%, #33DBDB 40%, #33D58E 55%, #FFD633 65%, #FC527D 85%, #8181FF 100%)',

  // sidebar (light, like the product UI)
  sidebar: '#FFFFFF', sidebar2: '#FFFFFF',
  sidebarActive: 'var(--acento-tenue)', sidebarHover: '#F5F6F8',

  // ink & neutrals (g400+ meet WCAG AA on white for small text)
  black: '#333333', bgApp: '#F5F6F8', line: '#E3E5EE',
  g50: '#F8F9FB', g100: '#F0F1F5', g200: '#DDDFEB', g300: '#B9BCCB', g400: '#6F7282',
  g500: '#5F6172', g600: '#535768', g700: '#3B3E4C',

  // status pills: soft pastel fill, dark readable text
  green: '#1E7B45', greenLight: '#DDF7CE', amber: '#8A5200', amberLight: '#FFEACC',
  red: '#C8304A', redLight: '#FFE0E5', blue: '#1F63C6', blueLight: '#DCF4FF',
  orange: '#A8490D', orangeLight: '#FFE6D5',

  // pastel surfaces for feature tiles (never for text)
  mint: '#E3FBD3', sky: '#DCF7FF', peach: '#FFEBDD', lavender: '#EFE3F8', periwinkle: '#E7ECFF', peony: '#FDE3FA',
}

export const SANS = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
export const SERIF = SANS // headings use the same family
export const SHADOW = '0 2px 48px rgba(205, 208, 223, 0.40)'
export const SHADOW_HOVER = '0 5px 45px rgba(0, 0, 0, 0.12)'
export const RADIO = { card: 24, input: 6, badge: 6, boton: 160, imagen: 12 }

// ─── Clinic accent color → CSS variables ───
const aRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const aHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
export const mezclar = (hex, con, t) => { const a = aRgb(hex), b = aRgb(con); return aHex(...a.map((v, i) => v + (b[i] - v) * t)) }
export const valido = (hex) => /^#[0-9a-fA-F]{6}$/.test(hex || '')

export function aplicarMarca(color) {
  const c = valido(color) ? color : COLOR_BASE
  const r = document.documentElement.style
  r.setProperty('--acento', c)
  r.setProperty('--acento-oscuro', mezclar(c, '#000000', 0.2))
  r.setProperty('--acento-claro', mezclar(c, '#FFFFFF', 0.78))
  r.setProperty('--acento-tenue', mezclar(c, '#FFFFFF', 0.9))
  const [R, G, B] = aRgb(c)
  r.setProperty('--acento-anillo', `rgba(${R},${G},${B},0.14)`)

  // Side menu painted with the clinic color; white letters on dark colors, dark letters on light ones
  const oscuro = contraste(c, '#FFFFFF') >= 3
  r.setProperty('--acento-texto', oscuro ? '#FFFFFF' : '#1F2230')
  r.setProperty('--menu-fondo', c)
  r.setProperty('--menu-fondo2', mezclar(c, '#000000', oscuro ? 0.16 : 0.06))
  r.setProperty('--menu-texto', oscuro ? '#FFFFFF' : '#1F2230')
  r.setProperty('--menu-suave', oscuro ? 'rgba(255,255,255,0.78)' : 'rgba(31,34,48,0.70)')
  r.setProperty('--menu-titulo', oscuro ? 'rgba(255,255,255,0.60)' : 'rgba(31,34,48,0.55)')
  r.setProperty('--menu-activo', oscuro ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.60)')
  r.setProperty('--menu-hover', oscuro ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.35)')
  r.setProperty('--menu-tarjeta', oscuro ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.50)')
  r.setProperty('--menu-linea', oscuro ? 'rgba(255,255,255,0.24)' : 'rgba(31,34,48,0.14)')
}

// WCAG contrast ratio between two hex colors
function luz(hex) { return aRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0) }
export function contraste(a, b) { const x = luz(a), y = luz(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
aplicarMarca(COLOR_BASE)

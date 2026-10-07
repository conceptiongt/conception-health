// Conception Health design tokens — quiet, editorial clinic workspace.
// The accent is the clinic's own color (Configuración → Marca), exposed as CSS variables by aplicarMarca().
export const COLOR_BASE = '#1F5F5B'

export const C = {
  // accent (clinic color): solid, darker, light tint and very light tint
  purple: 'var(--acento)', purpleDark: 'var(--acento-oscuro)', purpleLight: 'var(--acento-claro)', purpleMid: 'var(--acento-tenue)',
  cyan: 'var(--acento)',
  grad: 'var(--acento)',
  prism: 'var(--acento)',

  sidebar: '#FFFFFF', sidebar2: '#FFFFFF',
  sidebarActive: 'var(--acento-tenue)', sidebarHover: '#F4F3F0',

  // ink & warm neutrals
  black: '#1C1C1E', bgApp: '#F7F7F5', line: '#E7E5E0',
  g50: '#FAFAF8', g100: '#F2F1EE', g200: '#E1DFD9', g300: '#C8C5BD', g400: '#8F8C85',
  g500: '#6B6963', g600: '#55534E', g700: '#3A3936',

  // status: muted, readable
  green: '#2E6B47', greenLight: '#EAF3EC', amber: '#8A5A12', amberLight: '#F8F0E1',
  red: '#B23A3A', redLight: '#F9ECEB', blue: '#2F5D8C', blueLight: '#EBF1F7',
  orange: '#9A4E1C', orangeLight: '#F8EEE6',

  // very soft surfaces for tiles
  mint: '#F1F6F2', sky: '#EFF4F8', peach: '#FAF3EC', lavender: '#F4F2F7', periwinkle: '#F1F2F7', peony: '#F9F1F3',
}

export const SANS = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
export const SERIF = SANS
export const SHADOW = 'none'
export const SHADOW_HOVER = '0 6px 20px rgba(28, 28, 30, 0.06)'
export const RADIO = { card: 12, input: 8, badge: 4, boton: 8, imagen: 8 }

// ─── Clinic accent color → CSS variables ───
const aRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const aHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
export const mezclar = (hex, con, t) => { const a = aRgb(hex), b = aRgb(con); return aHex(...a.map((v, i) => v + (b[i] - v) * t)) }
export const valido = (hex) => /^#[0-9a-fA-F]{6}$/.test(hex || '')

export function aplicarMarca(color) {
  const c = valido(color) ? color : COLOR_BASE
  const r = document.documentElement.style
  r.setProperty('--acento', c)
  r.setProperty('--acento-oscuro', mezclar(c, '#000000', 0.25))
  r.setProperty('--acento-claro', mezclar(c, '#FFFFFF', 0.82))
  r.setProperty('--acento-tenue', mezclar(c, '#FFFFFF', 0.92))
  const [R, G, B] = aRgb(c)
  r.setProperty('--acento-anillo', `rgba(${R},${G},${B},0.14)`)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#F7F7F5')
}
aplicarMarca(COLOR_BASE)

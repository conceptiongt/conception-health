// Conception Health design tokens — light, airy medical workspace:
// glass cards on a soft blue mesh, one action color, pastel surfaces, pill buttons.
// The action color is the clinic's own (Configuración → Marca), exposed as CSS variables by aplicarMarca().
export const COLOR_BASE = '#2F6BFF'
// the old default violet counts as "never chosen": those clinics get the new medical blue
const COLOR_ANTIGUO = '#6161ff'
export const colorMarca = (c) => (valido(c) && c.toLowerCase() !== COLOR_ANTIGUO ? c : COLOR_BASE)

export const C = {
  // brand: a single color for actions and active states (clinic color, violet by default)
  purple: 'var(--acento)', onPurple: 'var(--acento-texto)', purpleDark: 'var(--acento-oscuro)', purpleLight: 'var(--acento-claro)', purpleMid: 'var(--acento-tenue)',
  cyan: '#38BDF8',
  grad: 'linear-gradient(135deg, var(--acento) 0%, #38BDF8 100%)',
  prism: 'conic-gradient(from 270deg, #8181FF 15%, #33DBDB 40%, #33D58E 55%, #FFD633 65%, #FC527D 85%, #8181FF 100%)',

  // sidebar (light, like the product UI)
  sidebar: '#FFFFFF', sidebar2: '#FFFFFF',
  sidebarActive: 'var(--acento-tenue)', sidebarHover: '#EEF3FC',

  // ink & neutrals (g400+ meet WCAG AA on white for small text)
  black: '#1E2433', bgApp: '#F3F6FC', line: '#E2E8F4',
  g50: '#F6F8FD', g100: '#EDF1F9', g200: '#DCE3F0', g300: '#B5BFD3', g400: '#677188',
  g500: '#566079', g600: '#485068', g700: '#343B50',

  // status pills: soft pastel fill, dark readable text
  green: '#1E7B45', greenLight: '#DDF7CE', amber: '#8A5200', amberLight: '#FFEACC',
  red: '#C8304A', redLight: '#FFE0E5', blue: '#1F63C6', blueLight: '#DCF4FF',
  orange: '#A8490D', orangeLight: '#FFE6D5',

  // pastel surfaces for feature tiles (never for text)
  mint: '#E3FBD3', sky: '#DCF7FF', peach: '#FFEBDD', lavender: '#EFE3F8', periwinkle: '#E7ECFF', peony: '#FDE3FA',
}

export const SANS = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
export const SERIF = "'Outfit', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" // headings
export const SHADOW = '0 10px 40px rgba(31, 72, 160, 0.08)'
export const SHADOW_HOVER = '0 16px 50px rgba(31, 72, 160, 0.14)'
// Frosted-glass surface for cards, panels and the sidebar
export const GLASS = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(18px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
  border: '1px solid rgba(255,255,255,0.85)',
}
export const RADIO = { card: 24, input: 12, badge: 6, boton: 160, imagen: 12 }

// ─── Clinic accent color → CSS variables ───
const aRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const aHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
export const mezclar = (hex, con, t) => { const a = aRgb(hex), b = aRgb(con); return aHex(...a.map((v, i) => v + (b[i] - v) * t)) }
export const valido = (hex) => /^#[0-9a-fA-F]{6}$/.test(hex || '')

export function aplicarMarca(color) {
  const c = colorMarca(color)
  // remembered so the next reload paints the clinic color right away (main.jsx), with no flash of the default color
  try { localStorage.setItem('ch-color', c) } catch { /* private window */ }
  const r = document.documentElement.style
  r.setProperty('--acento', c)
  r.setProperty('--acento-oscuro', mezclar(c, '#000000', 0.2))
  r.setProperty('--acento-claro', mezclar(c, '#FFFFFF', 0.78))
  r.setProperty('--acento-tenue', mezclar(c, '#FFFFFF', 0.9))
  const [R, G, B] = aRgb(c)
  r.setProperty('--acento-anillo', `rgba(${R},${G},${B},0.14)`)

  // Accent used as TEXT on light surfaces: the clinic color itself when it reads well on white, otherwise a darker shade
  r.setProperty('--acento-fuerte', contraste(c, '#FFFFFF') >= 4.5 ? c : mezclar(c, '#000000', 0.45))
  r.setProperty('--acento-texto', contraste(c, '#FFFFFF') >= 3 ? '#FFFFFF' : '#1F2230')
  r.setProperty('--acento-sombra', `rgba(${R},${G},${B},0.30)`)
  r.setProperty('--acento-sombra-fuerte', `rgba(${R},${G},${B},0.42)`)

  // Side menu is a glass panel: dark letters, accent-tinted active pill
  r.setProperty('--menu-fondo', 'rgba(255,255,255,0.72)')
  r.setProperty('--menu-texto', '#1E2433')
  r.setProperty('--menu-suave', '#4A526A')
  r.setProperty('--menu-titulo', '#68728A')
  r.setProperty('--menu-activo', `rgba(${R},${G},${B},0.13)`)
  r.setProperty('--menu-hover', `rgba(${R},${G},${B},0.07)`)
  r.setProperty('--menu-tarjeta', 'rgba(255,255,255,0.65)')
  r.setProperty('--menu-linea', 'rgba(30,36,51,0.10)')
}

// WCAG contrast ratio between two hex colors
function luz(hex) { return aRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0) }
export function contraste(a, b) { const x = luz(a), y = luz(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
aplicarMarca(COLOR_BASE)

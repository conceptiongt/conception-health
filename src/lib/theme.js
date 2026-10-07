// Conception Health design tokens — light workspace in the style of monday.com:
// white cards on a soft gray canvas, one violet action color, pastel surfaces, pill buttons.
export const C = {
  // brand: a single violet for actions and active states
  purple: '#6161FF', purpleDark: '#4B4BD6', purpleLight: '#DBDBFF', purpleMid: '#EEF0FF',
  cyan: '#3AC9FF',
  grad: 'linear-gradient(135deg, #8181FF 0%, #3AC9FF 100%)',
  prism: 'conic-gradient(from 270deg, #8181FF 15%, #33DBDB 40%, #33D58E 55%, #FFD633 65%, #FC527D 85%, #8181FF 100%)',

  // sidebar (light, like the product UI)
  sidebar: '#FFFFFF', sidebar2: '#FFFFFF',
  sidebarActive: '#EEF0FF', sidebarHover: '#F5F6F8',

  // ink & neutrals
  black: '#333333', bgApp: '#F5F6F8', line: '#E3E5EE',
  g50: '#F8F9FB', g100: '#F0F1F5', g200: '#DDDFEB', g300: '#C3C6D4', g400: '#8A8D9C',
  g500: '#676879', g600: '#535768', g700: '#3B3E4C',

  // status pills: soft pastel fill, dark readable text
  green: '#1E7B45', greenLight: '#DDF7CE', amber: '#9A5B00', amberLight: '#FFEACC',
  red: '#C8304A', redLight: '#FFE0E5', blue: '#1F63C6', blueLight: '#DCF4FF',
  orange: '#B4500F', orangeLight: '#FFE6D5',

  // pastel surfaces for feature tiles (never for text)
  mint: '#E3FBD3', sky: '#DCF7FF', peach: '#FFEBDD', lavender: '#EFE3F8', periwinkle: '#E7ECFF', peony: '#FDE3FA',
}

export const SANS = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
export const SERIF = SANS // headings use the same family
export const SHADOW = '0 2px 48px rgba(205, 208, 223, 0.40)'
export const SHADOW_HOVER = '0 5px 45px rgba(0, 0, 0, 0.12)'
export const RADIO = { card: 24, input: 6, badge: 6, boton: 160, imagen: 12 }

// Conception Health design tokens — calm, premium, medical
export const C = {
  // brand (from the logo: violet → cyan)
  purple: '#6D3FE0', purpleDark: '#4C1D95', purpleLight: '#EFEAFD', purpleMid: '#F7F4FE',
  cyan: '#0FB8E6',
  grad: 'linear-gradient(135deg, #8B5CF6 0%, #0FB8E6 100%)',

  // navy sidebar
  sidebar: '#0B1120', sidebar2: '#111A2E',
  sidebarActive: 'rgba(255,255,255,0.07)', sidebarHover: 'rgba(255,255,255,0.04)',

  // ink & neutrals (slightly warm)
  black: '#0F172A', bgApp: '#F6F6F9', line: '#E8E6EF',
  g50: '#FAFAFC', g100: '#F1F0F5', g200: '#E4E2EB', g300: '#C9C6D4', g400: '#8E8A9E',
  g500: '#6B6780', g600: '#4E4A61', g700: '#2F2B40',

  // status (muted, not neon)
  green: '#1F7A4D', greenLight: '#E9F6EF', amber: '#9A6200', amberLight: '#FDF5E4',
  red: '#C23B3B', redLight: '#FCEDED', blue: '#2458B8', blueLight: '#EAF1FC',
  orange: '#B45309', orangeLight: '#FDF1E6',
}

// System font (San Francisco on Apple devices), like the original PatientTrack
export const SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
export const SERIF = SANS // headings use the same family, heavier weight
export const SHADOW = '0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04)'

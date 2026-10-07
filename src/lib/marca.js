// Clinic branding: logo (public "logos" bucket) and initials fallback
import { SUPABASE_URL } from './config'

const BASE = `${SUPABASE_URL}/storage/v1/object/public/logos/`
export const urlLogo = (clinica) => clinica?.logo_path ? BASE + clinica.logo_path : null
export const iniciales = (t = '') => t.replace(/^(dr|dra)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'C'

// Every URL and key comes from environment variables (Vercel → Settings → Environment Variables, or .env files).
// Only PUBLIC values belong here (VITE_* ends up in the browser). Secret keys live in Supabase → Edge Functions → Secrets.
const env = import.meta.env

function requerida(nombre) {
  const v = env[nombre]
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}. Revise .env.example`)
  return v
}

export const SUPABASE_URL = requerida('VITE_SUPABASE_URL')
export const SUPABASE_ANON_KEY = requerida('VITE_SUPABASE_ANON_KEY')
export const STUDIO_URL = requerida('VITE_STUDIO_URL')
export const STUDIO_ANON_KEY = requerida('VITE_STUDIO_ANON_KEY')
export const WHATSAPP_SOPORTE = env.VITE_WHATSAPP_SOPORTE || ''
export const SITIO_URL = env.VITE_SITIO_URL || 'https://health.conception-gt.com'

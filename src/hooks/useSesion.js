import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Current session + the user's profile and clinic.
// `recuperando` is true after opening a "restablecer contraseña" email link.
export function useSesion() {
  const [session, setSession] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [clinica, setClinica] = useState(null)
  const [recuperando, setRecuperando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  const cargar = useCallback(async () => {
    if (!session) { setPerfil(null); setClinica(null); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('user_id', session.user.id).maybeSingle()
    setPerfil(p || null)
    if (p) {
      const { data: c } = await supabase.from('clinicas').select('*').eq('id', p.clinica_id).maybeSingle()
      setClinica(c || null)
    }
  }, [session])

  useEffect(() => { cargar() }, [cargar])

  const cargando = session === undefined || (session && !perfil)
  const planActivo = !!clinica?.plan_activo && (!clinica.plan_hasta || new Date(clinica.plan_hasta) > new Date())
  return { session, perfil, clinica, cargando, recuperando, setRecuperando, recargar: cargar, planActivo }
}

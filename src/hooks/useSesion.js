import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Current session + the user's profile and clinic.
// `recuperando` is true after opening a "restablecer contraseña" email link.
export function useSesion() {
  const [session, setSession] = useState(undefined)
  const [perfil, setPerfil] = useState(undefined) // undefined: loading, null: the account has no clinic access
  const [clinica, setClinica] = useState(undefined) // undefined: loading
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
    if (!session) { setPerfil(undefined); setClinica(undefined); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('user_id', session.user.id).maybeSingle()
    // the clinic is read before the profile is set, so the screen never shows a moment without the clinic's name, logo and plan
    const c = p ? (await supabase.from('clinicas').select('*').eq('id', p.clinica_id).maybeSingle()).data : null
    setClinica(c || null)
    setPerfil(p || null)
  }, [session])

  useEffect(() => { cargar() }, [cargar])

  const cargando = session === undefined || (session && (perfil === undefined || clinica === undefined))
  const planActivo = !!clinica?.plan_activo && (!clinica.plan_hasta || new Date(clinica.plan_hasta) > new Date())
  return { session, perfil, clinica, cargando, recuperando, setRecuperando, recargar: cargar, planActivo }
}

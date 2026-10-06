import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { configBase, combinar } from '../lib/lia'

// Lía's settings (editable copy + saved copy), conversations and notices of the clinic
export const LiaContext = createContext(null)
export const useLia = () => useContext(LiaContext)

// sets a value at "a.b.0.c" without mutating
function fijar(obj, [k, ...resto], v) {
  const copia = Array.isArray(obj) ? [...obj] : { ...obj }
  copia[k] = resto.length ? fijar(obj?.[k] ?? (/^\d+$/.test(resto[0]) ? [] : {}), resto, v) : v
  return copia
}

export function useCargarLia(clinica) {
  const [guardada, setGuardada] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [convs, setConvs] = useState([])
  const [avisos, setAvisos] = useState([])
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const cargarListas = useCallback(async () => {
    const [v, a] = await Promise.all([
      supabase.from('lia_conversaciones').select('*').order('ultimo_at', { ascending: false }).limit(300),
      supabase.from('lia_avisos').select('*').order('created_at', { ascending: false }).limit(60),
    ])
    if (v.error || a.error) { setError('No se pudieron cargar las conversaciones'); return }
    setConvs(v.data || [])
    setAvisos(a.data || [])
  }, [])

  useEffect(() => {
    if (!clinica?.id) return
    let vivo = true
    ;(async () => {
      const { data, error: e } = await supabase.from('lia_config').select('config').eq('clinica_id', clinica.id).maybeSingle()
      if (!vivo) return
      if (e) { setError('No se pudo cargar la configuración de Lía'); return }
      const completa = combinar(configBase(clinica), data?.config)
      // first visit: store the starting settings so the receptionist always reads a complete guide
      if (!data) await supabase.from('lia_config').upsert({ clinica_id: clinica.id, config: completa })
      setGuardada(completa)
      setCfg(completa)
      cargarListas()
    })()
    return () => { vivo = false }
  }, [clinica?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((ruta, valor) => setCfg(prev => fijar(prev, String(ruta).split('.'), valor)), [])

  const guardar = useCallback(async (nueva) => {
    const datos = nueva || cfg
    setGuardando(true)
    const { error: e } = await supabase.from('lia_config').upsert({ clinica_id: clinica.id, config: datos, updated_at: new Date().toISOString() })
    setGuardando(false)
    if (e) return false
    setGuardada(datos)
    setCfg(datos)
    return true
  }, [cfg, clinica?.id])

  const descartar = useCallback(() => setCfg(guardada), [guardada])
  const cambios = !!cfg && JSON.stringify(cfg) !== JSON.stringify(guardada)

  return { cfg, set, guardar, descartar, cambios, guardando, convs, avisos, recargar: cargarListas, error, cargando: !cfg }
}

// Conversations waiting for the doctor (badge in the menu)
export function usePendientesLia(activo) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!activo) { setN(0); return }
    let vivo = true
    const contar = async () => {
      const { count } = await supabase.from('lia_conversaciones').select('id', { count: 'exact', head: true }).eq('etapa', 'doctor').eq('tomado', false).eq('prueba', false)
      if (vivo) setN(count || 0)
    }
    contar()
    const t = setInterval(contar, 60000)
    return () => { vivo = false; clearInterval(t) }
  }, [activo])
  return n
}

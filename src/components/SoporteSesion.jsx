import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { C, SERIF, SHADOW, GLASS } from '../lib/theme'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'
import { fmtMomento } from './SoporteAcceso'

// 'ABCDE12345' (any case, with or without dashes) → 'ABCDE-12345'
const formatearCodigo = (v) => {
  const limpio = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
  return limpio.length > 5 ? `${limpio.slice(0, 5)}-${limpio.slice(5)}` : limpio
}

// Asks the database whether the signed-in account is a support agent. `null` while loading; false when the database part
// is not installed yet (the function does not exist), so the regular "sin acceso" screen is shown as before.
export function useEsAgente() {
  const [agente, setAgente] = useState(null)
  useEffect(() => {
    let vivo = true
    Promise.resolve(supabase.rpc('soporte_estado')).then(({ data, error }) => { if (vivo) setAgente(!error && !!data?.agente) }, () => { if (vivo) setAgente(false) })
    return () => { vivo = false }
  }, [])
  return agente
}

// «Soporte Conception»: an agent without a clinic types the code the clinic generated
export function SoporteEntrada({ onListo }) {
  const [codigo, setCodigo] = useState('')
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')

  const entrar = async () => {
    if (codigo.replace('-', '').length !== 10) { setAviso('El código tiene 10 caracteres, por ejemplo ABCDE-12345.'); return }
    setBusy(true); setAviso('')
    const { data, error } = await supabase.rpc('soporte_entrar', { p_codigo: codigo })
    setBusy(false)
    const msg = String(error?.message || '')
    if (msg.includes('DEMASIADOS_INTENTOS')) setAviso('Demasiados intentos fallidos. Espere una hora e intente de nuevo.')
    else if (msg.includes('AGENTE_CON_CLINICA')) setAviso('Esta cuenta pertenece a una clínica y no se puede usar para soporte.')
    else if (msg.includes('NO_AGENTE')) setAviso('Esta cuenta no está autorizada para dar soporte.')
    else if (error) setAviso('No se pudo entrar. Revise su conexión e intente de nuevo.')
    else if (!data) setAviso('El código no es válido, ya venció o la clínica lo canceló. Pida uno nuevo.')
    else { toast.success('Entró a la clínica'); onListo() }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...GLASS, borderRadius: 24, padding: '36px 28px', width: '100%', maxWidth: 420, textAlign: 'center', boxShadow: SHADOW }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon name="escudo" size={24} /></div>
        <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.black, marginBottom: 6 }}>Soporte Conception</div>
        <div style={{ fontSize: 14, color: C.g500, lineHeight: 1.6, marginBottom: 18 }}>Escriba el código que la clínica le generó en Configuración → Acceso de soporte.</div>
        <input value={codigo} onChange={e => { setCodigo(formatearCodigo(e.target.value)); setAviso('') }}
          onKeyDown={e => { if (e.key === 'Enter' && !busy) entrar() }}
          placeholder="XXXXX-XXXXX" aria-label="Código de soporte" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus
          style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 24, fontWeight: 700, letterSpacing: '0.1em', padding: '14px 10px', borderRadius: 16, border: `1px solid ${C.g200}`, background: 'rgba(255,255,255,0.9)', color: C.black, outline: 'none' }} />
        <div role="alert" style={{ minHeight: 22, fontSize: 13.5, color: C.red, margin: '10px 0 6px', lineHeight: 1.45 }}>{aviso}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button onClick={entrar} disabled={busy || !codigo}>{busy ? 'Verificando…' : 'Entrar a la clínica'}</Button>
          <Button variant="ghost" icon="salir" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
        </div>
      </div>
    </div>
  )
}

// Persistent banner while the signed-in profile is a temporary support one. It keeps checking that the code is still valid
// and sends the agent back to the code screen the moment it expires or the clinic cancels it.
export function BannerSoporte({ clinica, onSalir }) {
  const [vence, setVence] = useState(null)

  useEffect(() => {
    let vivo = true
    const revisar = async () => {
      const { data, error } = await supabase.rpc('soporte_estado')
      if (!vivo || error) return
      if (data?.sesion?.vence_at) setVence(data.sesion.vence_at)
      else { await supabase.rpc('soporte_salir'); if (vivo) onSalir() } // the server says there is no session: expired, cancelled or finished elsewhere
    }
    revisar()
    const t = setInterval(revisar, 30000)
    return () => { vivo = false; clearInterval(t) }
  }, [onSalir])

  useEffect(() => {
    if (!vence) return
    const ms = new Date(vence).getTime() - Date.now()
    if (ms <= 0 || ms > 2147483000) return
    // The local clock may be wrong: when it says «expired», ask the server and leave only if it confirms there is no session
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('soporte_estado')
      if (error) return
      if (data?.sesion?.vence_at) { if (data.sesion.vence_at !== vence) setVence(data.sesion.vence_at); return } // server still has a session: the 30 s check keeps watching
      await supabase.rpc('soporte_salir'); onSalir()
    }, ms + 500)
    return () => clearTimeout(t)
  }, [vence, onSalir])

  const salir = async () => {
    await supabase.rpc('soporte_salir')
    onSalir()
  }

  return (
    <div className="banner-soporte" role="status">
      <Icon name="escudo" size={16} />
      <span style={{ flex: 1, minWidth: 200 }}>Sesión de soporte en <strong>{clinica?.nombre || 'la clínica'}</strong>{vence ? ` · vence ${fmtMomento(vence)}` : ''}</span>
      <Button size="sm" variant="ghost" icon="salir" onClick={salir}>Salir</Button>
    </div>
  )
}

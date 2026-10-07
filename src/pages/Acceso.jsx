import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { APP_NOMBRE } from '../lib/constantes'
import { Button } from '../components/ui/Button'
import { Campo, Input } from '../components/ui/Campos'
import { Logo } from '../components/ui/Varios'

const redirect = () => window.location.origin

function Marco({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: `linear-gradient(135deg, #0D1B2E 0%, #1a0a3c 100%)` }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><Logo height={56} /></div>
        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: C.purple, letterSpacing: '0.12em', marginBottom: 22 }}>HEALTH</div>
        {children}
      </div>
    </div>
  )
}

function Aviso({ tipo = 'info', children }) {
  const s = tipo === 'error' ? { bg: C.redLight, c: C.red } : tipo === 'ok' ? { bg: C.greenLight, c: C.green } : { bg: C.purpleMid, c: C.purpleDark }
  return <div style={{ background: s.bg, color: s.c, borderRadius: 10, padding: '10px 14px', fontSize: 13.5, marginBottom: 14, lineHeight: 1.5 }}>{children}</div>
}

// Login / sign-up / forgot password
export function Acceso() {
  const [modo, setModo] = useState('entrar') // entrar | crear | olvido
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const cambiar = (m) => { setModo(m); setMsg(null) }

  const entrar = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setMsg({ tipo: 'error', t: 'Correo o contraseña incorrectos. Si es su primera vez, use "Crear cuenta"; si no recuerda su contraseña, use "¿Olvidó su contraseña?".' })
  }

  const crear = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) { setMsg({ tipo: 'error', t: 'Escriba el nombre del doctor o de la clínica.' }); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, data: { nombre: nombre.trim() }, emailRedirectTo: redirect() },
    })
    setBusy(false)
    if (error) setMsg({ tipo: 'error', t: 'No se pudo enviar el correo. Revise la dirección e intente de nuevo en unos minutos.' })
    else setMsg({ tipo: 'ok', t: `Le enviamos un enlace a ${email.trim()}. Ábralo desde este dispositivo para entrar y crear su contraseña.` })
  }

  const olvido = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect() })
    setBusy(false)
    if (error) setMsg({ tipo: 'error', t: 'No se pudo enviar el correo. Intente de nuevo en unos minutos.' })
    else setMsg({ tipo: 'ok', t: `Si ${email.trim()} tiene una cuenta, le llegará un enlace para crear una contraseña nueva.` })
  }

  const link = (t, m) => <button type="button" onClick={() => cambiar(m)} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 600, cursor: 'pointer', fontSize: 13.5, padding: 0 }}>{t}</button>
  const campos = { display: 'flex', flexDirection: 'column', gap: 14 }

  return (
    <Marco>
      {msg && <Aviso tipo={msg.tipo}>{msg.t}</Aviso>}

      {modo === 'entrar' && (
        <form onSubmit={entrar} style={campos}>
          <Campo label="Correo electrónico"><Input type="email" value={email} onChange={setEmail} required autoComplete="email" placeholder="doctor@correo.com" /></Campo>
          <Campo label="Contraseña"><Input type="password" value={password} onChange={setPassword} required autoComplete="current-password" /></Campo>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</Button>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {link('¿Olvidó su contraseña?', 'olvido')}
            {link('Crear cuenta', 'crear')}
          </div>
        </form>
      )}

      {modo === 'crear' && (
        <form onSubmit={crear} style={campos}>
          <div style={{ fontSize: 13.5, color: C.g600, lineHeight: 1.5 }}>
            Cree su cuenta con su nombre y correo. Le enviaremos un enlace para entrar y crear su contraseña.
            Puede probar {APP_NOMBRE} gratis con hasta 3 pacientes.
          </div>
          <Campo label="Nombre del doctor o clínica"><Input value={nombre} onChange={setNombre} required placeholder="Ej. Dr. Juan Pérez" /></Campo>
          <Campo label="Correo electrónico"><Input type="email" value={email} onChange={setEmail} required autoComplete="email" /></Campo>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Enviando…' : 'Crear cuenta'}</Button>
          <div>{link('Ya tengo cuenta', 'entrar')}</div>
        </form>
      )}

      {modo === 'olvido' && (
        <form onSubmit={olvido} style={campos}>
          <div style={{ fontSize: 13.5, color: C.g600 }}>Escriba su correo y le enviaremos un enlace para crear una contraseña nueva.</div>
          <Campo label="Correo electrónico"><Input type="email" value={email} onChange={setEmail} required autoComplete="email" /></Campo>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</Button>
          <div>{link('Volver a iniciar sesión', 'entrar')}</div>
        </form>
      )}
    </Marco>
  )
}

// Shown on first entry (account created by email link) and after a password-reset link
export function CrearPassword({ perfil, onListo }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    if (p1.length < 8) { setMsg('La contraseña debe tener al menos 8 caracteres.'); return }
    if (p1 !== p2) { setMsg('Las contraseñas no coinciden.'); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: p1 })
    if (!error && perfil) await supabase.from('perfiles').update({ password_creada: true }).eq('user_id', perfil.user_id)
    setBusy(false)
    if (error) setMsg('No se pudo guardar la contraseña. Intente con otra.')
    else onListo()
  }

  return (
    <Marco>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.black, marginBottom: 6 }}>Cree su contraseña</div>
      <div style={{ fontSize: 13.5, color: C.g600, marginBottom: 16 }}>
        {perfil ? <>Hola, <strong>{perfil.nombre}</strong>. </> : null}La usará junto con su correo para entrar desde cualquier computadora o teléfono.
      </div>
      {msg && <Aviso tipo="error">{msg}</Aviso>}
      <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Campo label="Nueva contraseña" ayuda="Mínimo 8 caracteres"><Input type="password" value={p1} onChange={setP1} required autoComplete="new-password" /></Campo>
        <Campo label="Repita la contraseña"><Input type="password" value={p2} onChange={setP2} required autoComplete="new-password" /></Campo>
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</Button>
      </form>
    </Marco>
  )
}

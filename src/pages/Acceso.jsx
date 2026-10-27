import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { APP_NOMBRE } from '../lib/constantes'
import { Button } from '../components/ui/Button'
import { Campo, Input, Select } from '../components/ui/Campos'
import { ESPECIALIDADES } from '../lib/especialidades'
import { Logo } from '../components/ui/Varios'

const redirect = () => window.location.origin

function Marco({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: `linear-gradient(135deg, #0D1B2E 0%, #1a0a3c 100%)` }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><Logo height={56} /></div>
        <div style={{ textAlign: 'center', fontSize: 12.5, color: C.g500, marginBottom: 22 }}>Expedientes, citas y cobros de su clínica</div>
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
// Links from an invitation open "Crear cuenta" already filled in: ?crear=1&correo=ana@x.com&asistente=1
const params = new URLSearchParams(window.location.search)
const ERRORES_CREAR = {
  YA_EXISTE: 'Ese correo ya tiene una cuenta. Use "Iniciar sesión" o "¿Olvidó su contraseña?".',
  CORREO_INVALIDO: 'Revise el correo electrónico.',
  PASSWORD_CORTA: 'La contraseña debe tener al menos 8 caracteres.',
  FALTAN_DATOS: 'Escriba el nombre y elija su especialidad.',
  DATO_INVALIDO: 'El nombre no puede tener los signos < >.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos desde esta conexión. Espere 10 minutos e intente de nuevo.',
  MUY_RAPIDO: 'Revise sus datos e intente de nuevo.',
}

export function Acceso() {
  const [modo, setModo] = useState(params.get('crear') ? 'crear' : 'entrar') // entrar | crear | olvido
  const asistente = params.get('asistente') === '1'
  const [nombre, setNombre] = useState('')
  const [esp, setEsp] = useState('')
  const [email, setEmail] = useState(params.get('correo') || '')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [sitio, setSitio] = useState('') // honeypot: people never see it
  const [abierto] = useState(() => Date.now())
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
    if (!asistente && !nombre.trim()) { setMsg({ tipo: 'error', t: 'Escriba el nombre del doctor o de la clínica.' }); return }
    if (!asistente && !esp) { setMsg({ tipo: 'error', t: 'Elija su especialidad.' }); return }
    if (password.length < 8) { setMsg({ tipo: 'error', t: 'La contraseña debe tener al menos 8 caracteres.' }); return }
    if (password !== password2) { setMsg({ tipo: 'error', t: 'Las contraseñas no coinciden.' }); return }
    setBusy(true); setMsg(null)
    const correo = email.trim().toLowerCase()
    const { data, error } = await supabase.functions.invoke('crear-cuenta', {
      body: { nombre: nombre.trim(), especialidad: esp, email: correo, password, sitio, t: Date.now() - abierto },
    })
    let codigo = data?.error
    if (error) { try { codigo = (await error.context?.json())?.error } catch { /* sin detalle */ } }
    if (error || !data?.ok) {
      setBusy(false)
      // an invited assistant without a clinic name: the server asks for the missing data
      setMsg({ tipo: 'error', t: ERRORES_CREAR[codigo] || 'No se pudo crear la cuenta. Intente de nuevo en unos minutos.' })
      return
    }
    const { error: e2 } = await supabase.auth.signInWithPassword({ email: correo, password })
    setBusy(false)
    if (e2) { cambiar('entrar'); setMsg({ tipo: 'ok', t: 'Su cuenta está lista. Inicie sesión con su correo y contraseña.' }) }
    else if (params.get('crear')) window.history.replaceState(null, '', window.location.pathname)
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
            {asistente
              ? <>Le invitaron a trabajar en una clínica. Cree su contraseña para entrar.</>
              : <>Cree su cuenta y entre de inmediato. Puede probar {APP_NOMBRE} gratis con hasta 3 pacientes y suscribirse cuando quiera.</>}
          </div>
          {!asistente && <>
            <Campo label="Nombre del doctor o clínica"><Input value={nombre} onChange={setNombre} required maxLength={120} placeholder="Ej. Dr. Juan Pérez" /></Campo>
            <Campo label="Especialidad" ayuda="La plataforma se adapta a su especialidad; puede cambiarla después">
              <Select value={esp} onChange={setEsp} required><option value="">Seleccione…</option>{ESPECIALIDADES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</Select>
            </Campo>
          </>}
          <Campo label="Correo electrónico"><Input type="email" value={email} onChange={setEmail} required maxLength={120} autoComplete="email" /></Campo>
          <Campo label="Contraseña" ayuda="Mínimo 8 caracteres"><Input type="password" value={password} onChange={setPassword} required autoComplete="new-password" /></Campo>
          <Campo label="Repita la contraseña"><Input type="password" value={password2} onChange={setPassword2} required autoComplete="new-password" /></Campo>
          <input value={sitio} onChange={e => setSitio(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Creando su cuenta…' : 'Crear cuenta y entrar'}</Button>
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

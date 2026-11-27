import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C, SERIF, GLASS, SHADOW } from '../lib/theme'
import { APP_NOMBRE } from '../lib/constantes'
import { Button } from '../components/ui/Button'
import { Campo, Input } from '../components/ui/Campos'
import { TipoCuenta } from '../components/ui/TipoCuenta'
import { Logo } from '../components/ui/Varios'
import { Icon } from '../components/ui/Icon'
import { toast } from '../components/ui/Toast'
import { fmtFechaLocal } from '../lib/formato'

const redirect = () => window.location.origin
const CORREO_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
//-field checks use the platform's own toast (no browser validation bubbles)
const falta = (t) => { toast.error(t); return false }
const revisarCorreo = (v) => (!v.trim() ? falta('Escriba su correo electrónico.') : !CORREO_OK.test(v.trim()) ? falta('Revise el correo electrónico.') : true)

// Cover: soft blue mesh (from the body), brand message on the left (desktop only) and the glass form card on the right
const CHIPS = [['citas', 'Citas y calendario'], ['expedientes', 'Expedientes clínicos'], ['cartera', 'Pagos y saldos']]
const SIN_LEMA = 'polygon(0 0, 50.5% 0, 50.5% 50%, 100% 50%, 100% 100%, 0 100%)' // hides the agency tagline of the logo image

function Marco({ children }) {
  return (
    <div className="acceso">
      <div className="acceso-cuerpo">
        <div className="acceso-hero">
          <Logo height={54} />
          <div style={{ ...GLASS, display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 36, padding: '7px 14px', borderRadius: 160, fontSize: 13, fontWeight: 600, color: 'var(--acento-fuerte)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: 'var(--acento)' }} />Plataforma para clínicas y consultorios
          </div>
          <h1 className="acceso-titular">Su clínica, <span style={{ color: 'var(--acento)' }}>en orden</span> y en un solo lugar</h1>
          <p style={{ fontSize: 16, color: C.g500, lineHeight: 1.6, maxWidth: 480, margin: '0 0 34px' }}>Expedientes, citas, cobros e inventario, con la información de sus pacientes protegida.</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {CHIPS.map(([icono, texto]) => (
              <span key={texto} className="acceso-chip">
                <span style={{ width: 30, height: 30, borderRadius: 10, background: C.purpleMid, color: 'var(--acento-fuerte)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icono} size={16} /></span>
                {texto}
              </span>
            ))}
          </div>
        </div>
        <div className="acceso-tarjeta" style={{ ...GLASS, background: 'rgba(255,255,255,0.8)', borderRadius: 28, padding: '32px 28px', boxShadow: SHADOW }}>
          <div className="acceso-logo-movil" style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}><Logo height={56} /></div>
          <div style={{ textAlign: 'center', fontFamily: SERIF, fontSize: 13.5, color: C.g500, marginBottom: 22, letterSpacing: '0.01em' }}>Expedientes, citas y cobros de su clínica</div>
          {children}
        </div>
      </div>
      <div className="acceso-pie">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Desarrollado por
          <img src="/logo-dark.png" alt="Conception" style={{ height: 24, width: 'auto', display: 'block', clipPath: SIN_LEMA }} />
        </span>
        <a href="/privacidad">Política de privacidad</a>
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
  const [modo, setModo] = useState(params.get('crear') ? 'crear' : 'enlace') // enlace (sin contraseña) | entrar | crear | olvido
  const asistente = params.get('asistente') === '1'
  const [nombre, setNombre] = useState('')
  const [esp, setEsp] = useState('')
  const [email, setEmail] = useState(params.get('correo') || '')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  // invitation code (owner sign-up only); ?codigo=XXXX prefills it
  const limpiarCodigo = (v) => String(v || '').replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 40)
  const [codigo, setCodigo] = useState(() => limpiarCodigo(params.get('codigo')))
  const [sitio, setSitio] = useState('') // honeypot: people never see it
  const [abierto] = useState(() => Date.now())
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const cambiar = (m) => { setModo(m); setMsg(null) }

  const entrar = async (e) => {
    e.preventDefault()
    if (!revisarCorreo(email)) return
    if (!password) { falta('Escriba su contraseña.'); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setMsg({ tipo: 'error', t: 'Correo o contraseña incorrectos. Si es su primera vez, use "Crear cuenta"; si no recuerda su contraseña, use "¿Olvidó su contraseña?".' })
  }

  const crear = async (e) => {
    e.preventDefault()
    if (!asistente && !nombre.trim()) { setMsg({ tipo: 'error', t: 'Escriba el nombre del doctor, la clínica o el hospital.' }); return }
    if (!asistente && !esp) { setMsg({ tipo: 'error', t: 'Elija su especialidad.' }); return }
    if (!revisarCorreo(email)) return
    if (password.length < 8) { setMsg({ tipo: 'error', t: 'La contraseña debe tener al menos 8 caracteres.' }); return }
    if (password !== password2) { setMsg({ tipo: 'error', t: 'Las contraseñas no coinciden.' }); return }
    setBusy(true); setMsg(null)
    const correo = email.trim().toLowerCase()
    const { data, error } = await supabase.functions.invoke('crear-cuenta', {
      body: { nombre: nombre.trim(), especialidad: esp, email: correo, password, sitio, t: Date.now() - abierto, ...(!asistente && codigo ? { codigo } : {}) },
    })
    let codigoError = data?.error
    if (error) { try { codigoError = (await error.context?.json())?.error } catch { /* sin detalle */ } }
    if (error || !data?.ok) {
      setBusy(false)
      // an invited assistant without a clinic name: the server asks for the missing data
      setMsg({ tipo: 'error', t: ERRORES_CREAR[codigoError] || 'No se pudo crear la cuenta. Intente de nuevo en unos minutos.' })
      return
    }
    const { error: e2 } = await supabase.auth.signInWithPassword({ email: correo, password })
    setBusy(false)
    if (e2) { cambiar('entrar'); setMsg({ tipo: 'ok', t: 'Su cuenta está lista. Inicie sesión con su correo y contraseña.' }) }
    else {
      if (params.get('crear')) window.history.replaceState(null, '', window.location.pathname)
      // the session starts right after; the toast container is always mounted
      if (data.promo === 'ok') toast.success(`Código aplicado: su cuenta está activa gratis hasta el ${fmtFechaLocal(data.promo_hasta)}.`)
      else if (data.promo === 'invalido') toast.error('El código no es válido o ya venció. Su cuenta se creó en modo de prueba; puede intentar de nuevo en Suscripción.')
      else if (data.promo === 'ya_activa') toast.error('Su cuenta ya tenía un plan activo, por eso no se aplicó el código.')
    }
  }

  // sign in without a password: a one-time link to the email (only for accounts that already exist)
  const enlace = async (e) => {
    e.preventDefault()
    if (!revisarCorreo(email)) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: redirect() } })
    setBusy(false)
    if (error && /not found|signups not allowed|Signups/i.test(error.message)) setMsg({ tipo: 'error', t: 'Ese correo no tiene cuenta. Use "Crear cuenta".' })
    else if (error) setMsg({ tipo: 'error', t: 'No se pudo enviar el enlace. Espere un minuto e intente de nuevo.' })
    else setMsg({ tipo: 'ok', t: `Listo. Revise ${email.trim()} (también spam) y toque el botón del correo para entrar.` })
  }

  const olvido = async (e) => {
    e.preventDefault()
    if (!revisarCorreo(email)) return
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

      {modo === 'enlace' && (
        <form noValidate onSubmit={enlace} style={campos}>
          <div style={{ fontSize: 13.5, color: C.g600, lineHeight: 1.5 }}>Escriba su correo y le enviaremos un enlace para entrar, sin contraseña.</div>
          <Campo label="Correo electrónico"><Input type="email" value={email} onChange={setEmail} required autoComplete="email" placeholder="doctor@correo.com" /></Campo>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Enviando…' : 'Enviarme el enlace para entrar'}</Button>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {link('Entrar con contraseña', 'entrar')}
            {link('Crear cuenta', 'crear')}
          </div>
        </form>
      )}

      {modo === 'entrar' && (
        <form noValidate onSubmit={entrar} style={campos}>
          <Campo label="Correo electrónico"><Input type="email" value={email} onChange={setEmail} required autoComplete="email" placeholder="doctor@correo.com" /></Campo>
          <Campo label="Contraseña"><Input type="password" value={password} onChange={setPassword} required autoComplete="current-password" /></Campo>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</Button>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {link('Entrar sin contraseña', 'enlace')}
            {link('¿Olvidó su contraseña?', 'olvido')}
          </div>
        </form>
      )}

      {modo === 'crear' && (
        <form noValidate onSubmit={crear} style={campos}>
          <div style={{ fontSize: 13.5, color: C.g600, lineHeight: 1.5 }}>
            {asistente
              ? <>Le invitaron a trabajar en una clínica. Cree su contraseña para entrar.</>
              : <>Cree su cuenta y entre de inmediato. Puede probar {APP_NOMBRE} gratis con hasta 3 pacientes y suscribirse cuando quiera.</>}
          </div>
          {!asistente && <>
            <Campo label="Nombre del doctor, clínica u hospital"><Input value={nombre} onChange={setNombre} required maxLength={120} placeholder="Ej. Dr. Juan Pérez" /></Campo>
            <TipoCuenta value={esp} onChange={v => { setEsp(v); setMsg(null) }} ayuda="La plataforma se adapta a su especialidad; puede cambiarla después" />
          </>}
          <Campo label="Correo electrónico"><Input type="email" value={email} onChange={setEmail} required maxLength={120} autoComplete="email" /></Campo>
          <Campo label="Contraseña" ayuda="Mínimo 8 caracteres"><Input type="password" value={password} onChange={setPassword} required autoComplete="new-password" /></Campo>
          <Campo label="Repita la contraseña"><Input type="password" value={password2} onChange={setPassword2} required autoComplete="new-password" /></Campo>
          {!asistente && (
            <Campo label="Código de invitación (opcional)" ayuda="Si tiene un código, su cuenta queda activa gratis por el tiempo indicado.">
              <Input value={codigo} onChange={v => setCodigo(limpiarCodigo(v))} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            </Campo>
          )}
          <input value={sitio} onChange={e => setSitio(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Creando su cuenta…' : 'Crear cuenta y entrar'}</Button>
          <div>{link('Ya tengo cuenta', 'enlace')}</div>
        </form>
      )}

      {modo === 'olvido' && (
        <form noValidate onSubmit={olvido} style={campos}>
          <div style={{ fontSize: 13.5, color: C.g600 }}>Escriba su correo y le enviaremos un enlace para crear una contraseña nueva.</div>
          <Campo label="Correo electrónico"><Input type="email" value={email} onChange={setEmail} required autoComplete="email" /></Campo>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</Button>
          <div>{link('Volver a iniciar sesión', 'enlace')}</div>
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
      <form noValidate onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Campo label="Nueva contraseña" ayuda="Mínimo 8 caracteres"><Input type="password" value={p1} onChange={setP1} required autoComplete="new-password" /></Campo>
        <Campo label="Repita la contraseña"><Input type="password" value={p2} onChange={setP2} required autoComplete="new-password" /></Campo>
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y entrar'}</Button>
      </form>
    </Marco>
  )
}

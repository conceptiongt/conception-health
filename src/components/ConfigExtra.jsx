import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { plantillaDe, camposPaciente, urlRegistro, codigoRegistro, LINK_PAGO_EJEMPLO } from '../lib/ficha'
import { PERMISOS, permisosIniciales, esAdmin, puede } from '../lib/permisos'
import { fmtFecha, linkWhatsAppSinNumero } from '../lib/formato'
import { USUARIOS_INCLUIDOS, PRECIO_USUARIO_EXTRA, LINK_USUARIO_EXTRA } from '../lib/constantes'
import { useDatos } from '../hooks/useDatos'
import { Card, Badge } from './ui/Varios'
import { Button } from './ui/Button'
import { Campo, Input, Grid } from './ui/Campos'
import { Icon } from './ui/Icon'
import { Modal } from './ui/Modal'
import { toast } from './ui/Toast'
import { Interruptor } from './MensajePaciente'

// Invitation email (edge function invitar-asistente). Returns null when sent, or the reason it was not
export async function enviarCorreoInvitacion(email) {
  const { data, error } = await supabase.functions.invoke('invitar-asistente', { body: { email } })
  if (!error && data?.ok) return null
  let codigo = data?.error
  try { codigo = codigo || (await error?.context?.json())?.error } catch { /* sin detalle */ }
  return codigo || 'NO_SE_ENVIO'
}
const avisoCorreo = (email, motivo) => motivo === 'YA_ENTRA' ? `${email} ya tiene contraseña y puede entrar.`
  : motivo === 'OTRA_CLINICA' ? `${email} ya tiene su propia cuenta en Conception Health. Invite otro correo.`
  : `No se pudo enviar el correo a ${email}. Envíele el enlace por WhatsApp.`

// Link that opens "Crear cuenta" already filled in for an invited assistant
export const linkInvitacion = (email) => `${location.origin}/?crear=1&asistente=1&correo=${encodeURIComponent(email)}`
const mensajeInvitacion = (i, clinica) => `¡Hola${i.nombre ? ' ' + i.nombre.split(' ')[0] : ''}! 👋 Le invité a trabajar en ${clinica.nombre} con Conception Health.\n\nCree su contraseña aquí (con el correo ${i.email}):\n${linkInvitacion(i.email)}`

const nuevoId = () => 'c' + Math.random().toString(36).slice(2, 9)
const iconoBtn = { width: 30, height: 30, borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: C.g500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }

// ─── Sections of each consultation + extra fields of the patient record ───
export function FichaClinica() {
  const { clinica, recargarSesion } = useDatos()
  const [secs, setSecs] = useState(() => plantillaDe(clinica).map(s => ({ ...s })))
  const [campos, setCampos] = useState(() => camposPaciente(clinica).map(c => ({ ...c })))
  const [busy, setBusy] = useState(false)
  const cambiado = JSON.stringify(secs) !== JSON.stringify(plantillaDe(clinica)) || JSON.stringify(campos) !== JSON.stringify(camposPaciente(clinica))

  const mover = (lista, set, i, d) => { const n = [...lista]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; set(n) }
  const guardar = async () => {
    const limpio = (t) => t.replace(/[<>]/g, '').trim().slice(0, 60)
    if (secs.some(s => !limpio(s.titulo)) || campos.some(c => !limpio(c.label))) { toast.error('Cada sección y campo necesita un nombre'); return }
    setBusy(true)
    const { error } = await supabase.from('clinicas').update({
      plantilla_ficha: secs.map(s => ({ id: s.id, titulo: limpio(s.titulo), activo: s.activo !== false })),
      campos_paciente: campos.map(c => ({ id: c.id, label: limpio(c.label) })),
    }).eq('id', clinica.id)
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Ficha clínica actualizada')
    recargarSesion()
  }

  return (
    <Card title="Ficha clínica" right={cambiado && <div style={{ display: 'flex', gap: 8 }}><Button variant="ghost" size="sm" onClick={() => { setSecs(plantillaDe(clinica)); setCampos(camposPaciente(clinica)) }}>Descartar</Button><Button size="sm" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button></div>}>
      <div style={{ fontSize: 13.5, color: C.g500, marginBottom: 16 }}>Ordene, cambie el nombre u oculte las secciones que se llenan en cada consulta, y agregue las suyas. También puede agregar campos propios a la ficha de cada paciente.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 28 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.g600, marginBottom: 8 }}>Secciones de cada consulta</div>
          {secs.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderTop: i ? `1px solid ${C.g100}` : 'none', opacity: s.activo === false ? 0.55 : 1 }}>
              <span style={{ width: 20, fontSize: 12, color: C.g400, textAlign: 'right' }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}><Input value={s.titulo} onChange={v => setSecs(secs.map((x, j) => j === i ? { ...x, titulo: v } : x))} maxLength={60} /></div>
              <button type="button" title="Subir" style={iconoBtn} onClick={() => mover(secs, setSecs, i, -1)}><Icon name="arriba" size={16} /></button>
              <button type="button" title="Bajar" style={iconoBtn} onClick={() => mover(secs, setSecs, i, 1)}><Icon name="abajo" size={16} /></button>
              <Interruptor titulo={s.activo === false ? 'Oculta' : 'Visible'} activo={s.activo !== false} onChange={v => setSecs(secs.map((x, j) => j === i ? { ...x, activo: v } : x))} />
              {s.id.startsWith('c') && <button type="button" title="Quitar" style={iconoBtn} onClick={() => setSecs(secs.filter((_, j) => j !== i))}><Icon name="eliminar" size={15} /></button>}
            </div>
          ))}
          <Button size="sm" variant="ghost" icon="mas" onClick={() => setSecs([...secs, { id: nuevoId(), titulo: '', activo: true }])} style={{ marginTop: 8 }}>Agregar sección</Button>
          <div style={{ fontSize: 12, color: C.g400, marginTop: 8 }}>Ocultar una sección no borra lo que ya se escribió en consultas anteriores.</div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.g600, marginBottom: 8 }}>Campos adicionales del paciente</div>
          {campos.length === 0 && <div style={{ fontSize: 13, color: C.g400, marginBottom: 6 }}>Ej. «Seguro médico», «Médico que refiere», «Talla de medias».</div>}
          {campos.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderTop: i ? `1px solid ${C.g100}` : 'none' }}>
              <div style={{ flex: 1 }}><Input value={c.label} onChange={v => setCampos(campos.map((x, j) => j === i ? { ...x, label: v } : x))} placeholder="Nombre del campo" maxLength={60} /></div>
              <button type="button" title="Subir" style={iconoBtn} onClick={() => mover(campos, setCampos, i, -1)}><Icon name="arriba" size={16} /></button>
              <button type="button" title="Quitar" style={iconoBtn} onClick={() => setCampos(campos.filter((_, j) => j !== i))}><Icon name="eliminar" size={15} /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon="mas" onClick={() => setCampos([...campos, { id: nuevoId(), label: '' }])} style={{ marginTop: 8 }}>Agregar campo</Button>
        </div>
      </div>
    </Card>
  )
}

// ─── Payment link for deposits + the clinic's self-registration link ───
export function PagosYRegistro() {
  const { clinica, recargarSesion } = useDatos()
  const [link, setLink] = useState(clinica?.link_pago || '')
  const [pct, setPct] = useState(String(clinica?.anticipo_pct || 50))
  const [busy, setBusy] = useState(false)
  const cambiado = link.trim() !== (clinica?.link_pago || '') || Number(pct) !== (clinica?.anticipo_pct || 50)
  const guardar = async () => {
    const l = link.trim()
    if (l && !/^https:\/\/[^\s<>"']+$/i.test(l)) { toast.error('El link debe empezar con https:// y no tener espacios'); return }
    const p = Math.round(Number(pct))
    if (!(p >= 1 && p <= 100)) { toast.error('El anticipo debe ser de 1 a 100 %'); return }
    setBusy(true)
    const { error } = await supabase.from('clinicas').update({ link_pago: l || null, anticipo_pct: p }).eq('id', clinica.id)
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Guardado'); recargarSesion()
  }
  const registro = urlRegistro(codigoRegistro(clinica))
  const nuevoEnlace = async () => {
    if (!confirm('¿Crear un enlace nuevo? El anterior dejará de funcionar.')) return
    const { error } = await supabase.from('clinicas').update({ registro_token: crypto.randomUUID() }).eq('id', clinica.id)
    if (error) toast.error('No se pudo cambiar'); else { toast.success('Enlace nuevo creado'); recargarSesion() }
  }
  return (
    <Card title="Pagos en línea y registro de pacientes" right={cambiado && <Button size="sm" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>}>
      <div className="config-marca">
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.g600, marginBottom: 8 }}>Link de pago para anticipos</div>
          <div style={{ fontSize: 13, color: C.g500, marginBottom: 12, lineHeight: 1.5 }}>Al enviar la confirmación de una cita por WhatsApp puede activar el link de pago; se agrega el monto del anticipo automáticamente.</div>
          <Grid min={160}>
            <Campo label="Su link de pago" full ayuda={link ? 'Se le agregará ?monto=…&concepto=…' : `Mientras lo deja vacío se usa un enlace de ejemplo (${LINK_PAGO_EJEMPLO})`}><Input value={link} onChange={setLink} placeholder="https://app.recurrente.com/…" maxLength={300} /></Campo>
            <Campo label="Anticipo sugerido (%)"><Input type="number" min="1" max="100" value={pct} onChange={setPct} /></Campo>
          </Grid>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.g600, marginBottom: 8 }}>Enlace para que los pacientes se registren solos</div>
          <div style={{ fontSize: 13, color: C.g500, marginBottom: 12, lineHeight: 1.5 }}>Compártalo en su WhatsApp, Instagram o página: el paciente llena sus datos y antecedentes, y aparece en su lista de pacientes.</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: C.g50, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px', fontSize: 12.5, wordBreak: 'break-all' }}>{registro}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Button size="sm" variant="ghost" icon="copiar" onClick={() => { navigator.clipboard?.writeText(registro); toast.success('Enlace copiado') }}>Copiar enlace</Button>
            <Button size="sm" variant="ghost" icon="ojo" onClick={() => window.open(registro, '_blank', 'noopener')}>Ver formulario</Button>
            <Button size="sm" variant="texto" onClick={nuevoEnlace}>Crear enlace nuevo</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── Users: the administrator invites assistants and chooses what they can see ───
export function Usuarios() {
  const { clinica, perfil } = useDatos()
  const [usuarios, setUsuarios] = useState(null)
  const [invitaciones, setInvitaciones] = useState([])
  const [invitar, setInvitar] = useState(false)
  const [extra, setExtra] = useState(false)
  const cargar = useCallback(async () => {
    const [{ data: u }, { data: i }] = await Promise.all([
      supabase.from('perfiles').select('user_id, nombre, email, rol, permisos, created_at, password_creada').order('created_at'),
      supabase.from('invitaciones').select('*').is('aceptada_at', null).order('created_at', { ascending: false }),
    ])
    setUsuarios(u || []); setInvitaciones(i || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!esAdmin(perfil)) return null

  const cambiarPermiso = async (u, k, v) => {
    const permisos = { ...u.permisos, [k]: v }
    setUsuarios(us => us.map(x => x.user_id === u.user_id ? { ...x, permisos } : x))
    const { error } = await supabase.from('perfiles').update({ permisos }).eq('user_id', u.user_id)
    if (error) { toast.error('No se pudo guardar'); cargar() }
  }
  const quitar = async (u) => {
    if (!confirm(`¿Quitar el acceso de ${u.nombre || u.email}? Ya no podrá entrar a la clínica. Lo que registró se conserva.`)) return
    const { error } = await supabase.from('perfiles').delete().eq('user_id', u.user_id)
    if (error) toast.error('No se pudo quitar'); else { toast.success('Acceso retirado'); cargar() }
  }
  // email again + the WhatsApp link (whichever the person finds first)
  const reenviar = async (x) => {
    const motivo = await enviarCorreoInvitacion(x.email)
    if (!motivo) toast.success(`Le enviamos otro correo a ${x.email}`)
    else toast.error(avisoCorreo(x.email, motivo))
    if (motivo !== 'YA_ENTRA' && confirm('¿Enviarle también el enlace por WhatsApp?')) window.open(linkWhatsAppSinNumero(mensajeInvitacion(x, clinica)), '_blank', 'noopener')
    cargar()
  }
  const cancelar = async (i) => {
    await supabase.from('invitaciones').delete().eq('id', i.id); cargar()
  }

  const asistentes = (usuarios || []).filter(u => u.rol !== 'dueno')
  const admin = (usuarios || []).find(u => u.rol === 'dueno')
  const permitidos = USUARIOS_INCLUIDOS + (clinica?.usuarios_extra || 0)
  const ocupados = (usuarios || []).length + invitaciones.length
  const lleno = usuarios !== null && ocupados >= permitidos
  return (
    <Card title="Usuarios y permisos" right={<Button size="sm" icon="mas" onClick={() => lleno ? setExtra(true) : setInvitar(true)}>Invitar asistente</Button>}>
      <div style={{ fontSize: 13.5, color: C.g500, marginBottom: 14, lineHeight: 1.5 }}>Usted es el administrador: ve todo, incluidos costos y pagos. Sus asistentes trabajan en la misma clínica (pacientes, citas y expedientes compartidos) y solo ven lo que usted les permita.</div>
      {usuarios !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: lleno ? C.amberLight : C.purpleMid, borderRadius: 14, padding: '10px 14px', marginBottom: 12, fontSize: 13.5 }}>
          <Icon name="usuarios" size={18} style={{ color: lleno ? C.amber : C.purple }} />
          <div style={{ flex: 1, minWidth: 220, color: C.g700 }}>
            <strong>{ocupados} de {permitidos} usuarios.</strong> Su plan incluye {USUARIOS_INCLUIDOS} (usted y un asistente){clinica?.usuarios_extra ? ` + ${clinica.usuarios_extra} adicional${clinica.usuarios_extra > 1 ? 'es' : ''}` : ''}. Cada usuario adicional cuesta {PRECIO_USUARIO_EXTRA} al mes.
          </div>
          <Button size="sm" variant="ghost" icon="mas" onClick={() => setExtra(true)}>Agregar usuario adicional</Button>
        </div>
      )}
      {admin && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.g100}` }}>
        <Icon name="escudo" size={18} style={{ color: C.purple }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{admin.nombre}</div><div style={{ fontSize: 12.5, color: C.g500 }}>{admin.email}</div></div><Badge color={C.purpleDark} bg={C.purpleMid}>Administrador</Badge>
      </div>}
      {usuarios === null ? <div style={{ color: C.g400, padding: 10 }}>Cargando…</div> : asistentes.map(u => (
        <div key={u.user_id} style={{ padding: '14px 0', borderBottom: `1px solid ${C.g100}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Icon name="usuarios" size={18} style={{ color: C.g500 }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{u.nombre}</div><div style={{ fontSize: 12.5, color: C.g500 }}>{u.email}</div></div>
            {!u.password_creada && <>
              <Badge color={C.amber} bg={C.amberLight}>Aún no crea su contraseña</Badge>
              <Button size="sm" variant="ghost" icon="enviar" onClick={() => reenviar(u)}>Reenviar</Button>
            </>}
            <Badge>Asistente</Badge><Button size="sm" variant="texto" onClick={() => quitar(u)}>Quitar acceso</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {PERMISOS.map(p => (
              <label key={p.k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, cursor: 'pointer' }}>
                <Interruptor activo={puede(u, p.k)} onChange={v => cambiarPermiso(u, p.k, v)} />
                <span>{p.label}{p.ayuda && <span style={{ display: 'block', fontSize: 12, color: C.g400 }}>{p.ayuda}</span>}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {usuarios && asistentes.length === 0 && invitaciones.length === 0 && <div style={{ fontSize: 13.5, color: C.g400, padding: '12px 0' }}>Aún no tiene asistentes.</div>}
      {invitaciones.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.g100}` }}>
          <Icon name="reloj" size={18} style={{ color: C.amber }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{i.nombre || i.email}</div><div style={{ fontSize: 12.5, color: C.g500 }}>{i.email} · invitado el {fmtFecha(i.created_at)} · aún no entra</div></div>
          <Button size="sm" variant="ghost" icon="enviar" onClick={() => reenviar(i)}>Reenviar</Button>
          <Button size="sm" variant="texto" onClick={() => cancelar(i)}>Cancelar invitación</Button>
        </div>
      ))}
      {invitar && <InvitarModal clinica={clinica} onClose={() => { setInvitar(false); cargar() }} onListo={cargar} />}
      {extra && <UsuarioExtraModal onClose={() => setExtra(false)} />}
    </Card>
  )
}

function InvitarModal({ clinica, onClose, onListo }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [permisos, setPermisos] = useState(permisosIniciales)
  const [busy, setBusy] = useState(false)
  const [lista, setLista] = useState(null) // the invitation once saved
  const enviar = async () => {
    const e = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('Escriba un correo válido'); return }
    if (/[<>]/.test(nombre)) { toast.error('El nombre no puede tener < >'); return }
    setBusy(true)
    const { data, error } = await supabase.from('invitaciones').insert({ clinica_id: clinica.id, email: e, nombre: nombre.trim() || null, permisos }).select().single()
    if (error) {
      setBusy(false)
      toast.error(error.code === '23505' ? 'Ya hay una invitación para ese correo'
        : /LIMITE_USUARIOS/.test(error.message) ? 'Ya usa todos los usuarios de su plan. Agregue un usuario adicional.'
        : 'No se pudo invitar')
      return
    }
    // the email is sent right away; the WhatsApp link stays as a second way
    const motivo = await enviarCorreoInvitacion(e)
    setBusy(false)
    if (motivo === 'OTRA_CLINICA') {
      // that email is already the account of another clinic: it could never join this one
      await supabase.from('invitaciones').delete().eq('id', data.id)
      toast.error(`${e} ya tiene su propia cuenta en Conception Health. Use otro correo para su asistente.`)
      return
    }
    setLista({ ...data, correo: !motivo })
    onListo()
  }
  if (lista) {
    const msg = mensajeInvitacion(lista, clinica)
    return (
      <Modal title="Invitación lista" subtitle={lista.email} onClose={onClose} maxWidth={520}>
        <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 12, fontSize: 14, background: lista.correo ? C.greenLight : C.amberLight, color: lista.correo ? C.green : C.amber }}>
          {lista.correo ? <>Le enviamos un correo a <strong>{lista.email}</strong> para que cree su contraseña.</> : <>No se pudo enviar el correo. Envíele el enlace por WhatsApp.</>}
        </div>
        <div style={{ fontSize: 14.5, color: C.g700, lineHeight: 1.6 }}>
          {lista.correo ? 'Si no le llega (revise también spam), envíele este enlace:' : <>Al abrir este enlace, <strong>{lista.nombre || lista.email}</strong> creará su contraseña con el correo <strong>{lista.email}</strong> y entrará directo a {clinica.nombre}.</>}
        </div>
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: C.g100, fontSize: 12.5, color: C.g600, wordBreak: 'break-all' }}>{linkInvitacion(lista.email)}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
          <Button variant="ghost" icon="copiar" onClick={() => { navigator.clipboard?.writeText(msg); toast.success('Mensaje copiado') }}>Copiar mensaje</Button>
          <Button icon="mensaje" onClick={() => window.open(linkWhatsAppSinNumero(msg), '_blank', 'noopener')}>Enviar por WhatsApp</Button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Invitar asistente" subtitle={`Trabajará en ${clinica.nombre}`} onClose={onClose} maxWidth={560}>
      <Grid min={200}>
        <Campo label="Nombre"><Input value={nombre} onChange={setNombre} placeholder="Ej. Ana López" maxLength={120} /></Campo>
        <Campo label="Correo electrónico *"><Input type="email" value={email} onChange={setEmail} maxLength={120} /></Campo>
      </Grid>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.g600, margin: '18px 0 8px' }}>¿Qué puede hacer?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PERMISOS.map(p => (
          <label key={p.k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
            <Interruptor activo={!!permisos[p.k]} onChange={v => setPermisos({ ...permisos, [p.k]: v })} />
            <span>{p.label}{p.ayuda && <span style={{ display: 'block', fontSize: 12, color: C.g400 }}>{p.ayuda}</span>}</span>
          </label>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: C.g400, marginTop: 14, lineHeight: 1.5 }}>Le llegará un correo para crear su contraseña; también le damos un enlace para enviárselo por WhatsApp. Debe ser un correo que todavía no tenga cuenta en Conception Health. Puede cambiar los permisos cuando quiera.</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="enviar" onClick={enviar} disabled={busy}>{busy ? 'Enviando…' : 'Enviar invitación'}</Button>
      </div>
    </Modal>
  )
}

// More users than the plan includes: monthly extra charge (Recurrente product "Usuario adicional")
function UsuarioExtraModal({ onClose }) {
  return (
    <Modal title="Usuario adicional" subtitle={`${PRECIO_USUARIO_EXTRA} al mes por usuario`} onClose={onClose} maxWidth={480}>
      <div style={{ fontSize: 14.5, color: C.g700, lineHeight: 1.6 }}>
        Su plan incluye {USUARIOS_INCLUIDOS} usuarios: usted (administrador) y un asistente. Para invitar a más personas, agregue usuarios adicionales por <strong>{PRECIO_USUARIO_EXTRA} al mes</strong> cada uno.
        <ul style={{ margin: '12px 0 0', paddingLeft: 20, color: C.g600 }}>
          <li>Se cobra junto con su suscripción, en Recurrente.</li>
          <li>Apenas se confirme el pago podrá invitar a la nueva persona.</li>
        </ul>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        {LINK_USUARIO_EXTRA
          ? <Button icon="suscripcion" onClick={() => window.open(LINK_USUARIO_EXTRA, '_blank', 'noopener')}>Agregar usuario adicional</Button>
          : <Button disabled>Próximamente</Button>}
      </div>
    </Modal>
  )
}

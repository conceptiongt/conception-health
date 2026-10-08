import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { plantillaDe, camposPaciente, urlRegistro, codigoRegistro, LINK_PAGO_EJEMPLO } from '../lib/ficha'
import { PERMISOS, permisosIniciales, esAdmin } from '../lib/permisos'
import { fmtFecha } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Card, Badge } from './ui/Varios'
import { Button } from './ui/Button'
import { Campo, Input, Grid } from './ui/Campos'
import { Icon } from './ui/Icon'
import { Modal } from './ui/Modal'
import { toast } from './ui/Toast'
import { Interruptor } from './MensajePaciente'

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
  const cargar = useCallback(async () => {
    const [{ data: u }, { data: i }] = await Promise.all([
      supabase.from('perfiles').select('user_id, nombre, email, rol, permisos, created_at').order('created_at'),
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
  const cancelar = async (i) => {
    await supabase.from('invitaciones').delete().eq('id', i.id); cargar()
  }

  const asistentes = (usuarios || []).filter(u => u.rol !== 'dueno')
  const admin = (usuarios || []).find(u => u.rol === 'dueno')
  return (
    <Card title="Usuarios y permisos" right={<Button size="sm" icon="mas" onClick={() => setInvitar(true)}>Invitar asistente</Button>}>
      <div style={{ fontSize: 13.5, color: C.g500, marginBottom: 14, lineHeight: 1.5 }}>Usted es el administrador: ve todo, incluidos costos y pagos. Sus asistentes trabajan en la misma clínica (pacientes, citas y expedientes compartidos) y solo ven lo que usted les permita.</div>
      {admin && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.g100}` }}>
        <Icon name="escudo" size={18} style={{ color: C.purple }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{admin.nombre}</div><div style={{ fontSize: 12.5, color: C.g500 }}>{admin.email}</div></div><Badge color={C.purpleDark} bg={C.purpleMid}>Administrador</Badge>
      </div>}
      {usuarios === null ? <div style={{ color: C.g400, padding: 10 }}>Cargando…</div> : asistentes.map(u => (
        <div key={u.user_id} style={{ padding: '14px 0', borderBottom: `1px solid ${C.g100}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Icon name="usuarios" size={18} style={{ color: C.g500 }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>{u.nombre}</div><div style={{ fontSize: 12.5, color: C.g500 }}>{u.email}</div></div>
            <Badge>Asistente</Badge><Button size="sm" variant="texto" onClick={() => quitar(u)}>Quitar acceso</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {PERMISOS.map(p => (
              <label key={p.k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, cursor: 'pointer' }}>
                <Interruptor activo={!!u.permisos?.[p.k]} onChange={v => cambiarPermiso(u, p.k, v)} />
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
          <Button size="sm" variant="texto" onClick={() => cancelar(i)}>Cancelar invitación</Button>
        </div>
      ))}
      {invitar && <InvitarModal clinica={clinica} onClose={() => setInvitar(false)} onListo={() => { setInvitar(false); cargar() }} />}
    </Card>
  )
}

function InvitarModal({ clinica, onClose, onListo }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [permisos, setPermisos] = useState(permisosIniciales)
  const [busy, setBusy] = useState(false)
  const enviar = async () => {
    const e = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast.error('Escriba un correo válido'); return }
    if (/[<>]/.test(nombre)) { toast.error('El nombre no puede tener < >'); return }
    setBusy(true)
    const { error } = await supabase.from('invitaciones').insert({ clinica_id: clinica.id, email: e, nombre: nombre.trim() || null, permisos })
    if (error) { setBusy(false); toast.error(error.code === '23505' ? 'Ya hay una invitación para ese correo' : 'No se pudo invitar'); return }
    // the assistant gets an email link to enter and create their password
    const { error: e2 } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true, data: { nombre: nombre.trim() }, emailRedirectTo: location.origin } })
    setBusy(false)
    if (e2) toast.error('La invitación quedó guardada, pero no se pudo enviar el correo. Pídale que entre con «Crear cuenta» usando ese correo.')
    else toast.success(`Le enviamos un correo a ${e} para que entre`)
    onListo()
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
      <div style={{ fontSize: 12.5, color: C.g400, marginTop: 14, lineHeight: 1.5 }}>Recibirá un correo para entrar y crear su contraseña. Debe ser un correo que todavía no tenga cuenta en Conception Health. Puede cambiar los permisos cuando quiera.</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="enviar" onClick={enviar} disabled={busy}>{busy ? 'Enviando…' : 'Enviar invitación'}</Button>
      </div>
    </Modal>
  )
}

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { esAdmin, puede } from '../lib/permisos'
import { fmtFecha } from '../lib/formato'
import { usuariosIncluidosUI, precioUsuarioExtraUI } from '../lib/constantes'
import {
  PUESTOS, CLAVE_TEMPORAL_HORAS, REGLA_CLAVE, claveValida, generarClave, sugerirUsuario, limpiarUsuario, errorUsuario, plantillaPermisos, clavesVisibles,
  gruposVisibles, llamarUsuarios, actualizarPerfil, mensajeUsuarios, textoAcceso, limpiarCodigoHospital, profesionalesDe, permisosConMedicos, textoVinculo,
} from '../lib/usuariosHospital'
import { atiendeCitas } from '../hooks/useHospital'
import { useDatos } from '../hooks/useDatos'
import { Card, Badge } from './ui/Varios'
import { Button } from './ui/Button'
import { Campo, Input, Grid } from './ui/Campos'
import { Desplegable } from './ui/Desplegable'
import { Icon } from './ui/Icon'
import { Modal } from './ui/Modal'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'
import { Interruptor } from './MensajePaciente'

// Configuración → Usuarios for HOSPITAL accounts. The administrator creates staff users WITHOUT e-mail (user name + temporary password, edge function
// usuarios-hospital), chooses what each one can see and do, and gives them the hospital access code. E-mail assistants that already exist stay in the list.

// Clipboard can be refused (permissions, insecure context): say so instead of a false «copiado»
async function copiar(texto, ok) {
  try { await navigator.clipboard.writeText(texto); toast.success(ok) } catch { toast.error('No se pudo copiar. Seleccione el texto y cópielo a mano.') }
}
const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
const faltaFuncion = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(e.message || ''))
const vencioClave = (u) => !u.password_creada && !!u.clave_temporal_at && Date.now() - new Date(u.clave_temporal_at).getTime() > CLAVE_TEMPORAL_HORAS * 3600 * 1000

export function UsuariosHospital() {
  const { clinica, perfil, hospital } = useDatos()
  const [usuarios, setUsuarios] = useState(null)
  const [invitaciones, setInvitaciones] = useState([])
  const [codigo, setCodigo] = useState(null)
  const [cupos, setCupos] = useState(null) // { ocupados, permitidos }
  const [faltante, setFaltante] = useState(false) // the SQL of this stage is not applied yet
  const [modal, setModal] = useState(null) // { tipo: 'crear' | 'editar' | 'clave' | 'codigo' | 'datos', ... }
  const [ocupado, setOcupado] = useState(null) // user_id with an action running

  const cargar = useCallback(async () => {
    const [{ data: u }, { data: i }, c, k] = await Promise.all([
      supabase.from('perfiles').select('user_id, nombre, email, rol, permisos, created_at, password_creada, usuario, puesto, activo, clave_temporal_at').order('created_at'),
      supabase.from('invitaciones').select('*').is('aceptada_at', null).order('created_at', { ascending: false }),
      supabase.rpc('hospital_codigo_acceso', { p_codigo: null }),
      supabase.rpc('hospital_usuarios_cupos'),
    ])
    setUsuarios(u || []); setInvitaciones(i || [])
    setFaltante(faltaFuncion(c.error))
    setCodigo(c.error ? null : c.data || null)
    setCupos(k.error ? null : k.data || null)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!esAdmin(perfil)) return null

  const personal = (usuarios || []).filter(u => u.rol === 'asistente' && u.usuario)
  const conCorreo = (usuarios || []).filter(u => u.rol === 'asistente' && !u.usuario)
  const soportes = (usuarios || []).filter(u => u.rol === 'soporte')
  const admin = (usuarios || []).find(u => u.rol === 'dueno')
  const ocupados = cupos?.ocupados ?? ((usuarios || []).length - soportes.length + invitaciones.length)
  const permitidos = cupos?.permitidos ?? usuariosIncluidosUI(clinica)
  const lleno = usuarios !== null && ocupados >= permitidos
  const medicos = (hospital?.profesionales || []).filter(atiendeCitas)
  const existentes = personal.map(u => u.usuario)

  // one action of the edge function on one user; returns the answer's data, or null after showing the reason
  const ejecutar = async (accion, u, extra) => {
    setOcupado(u.user_id)
    const r = await llamarUsuarios(accion, { user_id: u.user_id, ...extra })
    setOcupado(null)
    if (r.error) { toast.error(mensajeUsuarios(r.error)); if (r.error === 'NO_ENCONTRADO') cargar(); return null }
    return r.data
  }
  const desactivar = async (u) => {
    if (!await confirmar({ mensaje: `¿Desactivar a ${u.nombre}? Ya no podrá entrar ni ver datos del hospital. Lo que registró se conserva y puede volver a activarlo cuando quiera.`, aceptar: 'Desactivar', peligro: true })) return
    if (await ejecutar('desactivar', u)) { toast.success(`${u.nombre} fue desactivado`); cargar() }
  }
  const activar = async (u) => { if (await ejecutar('activar', u)) { toast.success(`${u.nombre} puede entrar de nuevo`); cargar() } }
  const eliminar = async (u) => {
    if (!await confirmar(`¿Eliminar a ${u.nombre} (${u.usuario})? Su usuario se borra para siempre y libera un lugar de su plan. Lo que registró se conserva. Si solo quiere que no entre por ahora, use «Desactivar».`)) return
    if (await ejecutar('eliminar', u)) { toast.success('Usuario eliminado'); cargar() }
  }
  const quitarCorreo = async (u) => {
    if (!await confirmar(`¿Quitar el acceso de ${u.nombre || u.email}? Ya no podrá entrar al hospital. Lo que registró se conserva.`)) return
    const { error } = await supabase.from('perfiles').delete().eq('user_id', u.user_id)
    if (error) toast.error('No se pudo quitar'); else { toast.success('Acceso retirado'); cargar() }
  }
  const cancelarInvitacion = async (i) => { await supabase.from('invitaciones').delete().eq('id', i.id); cargar() }

  const estado = (u) => u.activo === false ? <Badge color={C.red} bg={C.redLight}>Desactivado</Badge>
    : vencioClave(u) ? <Badge color={C.red} bg={C.redLight}>Contraseña temporal vencida</Badge>
    : !u.password_creada ? <Badge color={C.amber} bg={C.amberLight}>Contraseña temporal pendiente</Badge>
    : <Badge color={C.green} bg={C.greenLight}>Activo</Badge>

  return (
    <Card title="Usuarios y permisos" right={<Button size="sm" icon="mas" disabled={faltante} onClick={() => lleno ? toast.error('Ya usa todos los usuarios de su plan.') : setModal({ tipo: 'crear' })}>Crear usuario</Button>}>
      <div style={{ fontSize: 13.5, color: C.g500, marginBottom: 14, lineHeight: 1.5 }}>
        Usted es el administrador: ve todo y siempre tiene el control. Cada persona de su hospital entra con un usuario y una contraseña que usted le da (sin correo personal) y solo ve lo que usted le permita.
      </div>

      {faltante && <div style={{ background: C.purpleMid, color: C.purpleDark, borderRadius: 14, padding: '12px 16px', marginBottom: 12, fontSize: 13.5, lineHeight: 1.5 }}><strong>Disponible pronto.</strong> Crear usuarios con usuario y contraseña, y dar a su personal un código de acceso, estará listo muy pronto.</div>}

      {codigo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: C.purpleMid, borderRadius: 14, padding: '10px 14px', marginBottom: 12, fontSize: 13.5 }}>
          <Icon name="escudo" size={18} style={{ color: C.purple }} />
          <div style={{ flex: 1, minWidth: 220, color: C.g700 }}>
            Código de su hospital: <strong style={{ ...mono, fontSize: 15, letterSpacing: '0.04em' }}>{codigo}</strong>
            <div style={{ fontSize: 12.5, color: C.g500, marginTop: 2 }}>Su personal lo escribe al entrar, junto con su usuario y contraseña.</div>
          </div>
          <Button size="sm" variant="ghost" icon="copiar" onClick={() => copiar(`${location.origin}/?hospital=${codigo}`, 'Enlace de acceso copiado')}>Copiar enlace</Button>
          <Button size="sm" variant="ghost" icon="editar" onClick={() => setModal({ tipo: 'codigo' })}>Cambiar</Button>
        </div>
      )}

      {usuarios !== null && !faltante && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: lleno ? C.amberLight : C.purpleMid, borderRadius: 14, padding: '10px 14px', marginBottom: 12, fontSize: 13.5 }}>
          <Icon name="usuarios" size={18} style={{ color: lleno ? C.amber : C.purple }} />
          <div style={{ flex: 1, minWidth: 220, color: C.g700 }}>
            <strong>{ocupados} de {permitidos} usuarios.</strong> Cada usuario adicional cuesta {precioUsuarioExtraUI(clinica)} al mes.
            {lleno && <div style={{ fontSize: 12.5, color: C.g500, marginTop: 2 }}>Para crear más, elimine uno que ya no use o escríbanos para agregar usuarios.</div>}
          </div>
        </div>
      )}

      {admin && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.g100}` }}>
        <Icon name="escudo" size={18} style={{ color: C.purple }} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 500 }}>{admin.nombre}</div><div style={{ fontSize: 12.5, color: C.g500, overflowWrap: 'anywhere' }}>{admin.email}</div></div><Badge color={C.purpleDark} bg={C.purpleMid}>Administrador</Badge>
      </div>}
      {soportes.map(u => (
        <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.g100}`, flexWrap: 'wrap' }}>
          <Icon name="escudo" size={18} style={{ color: C.amber }} /><div style={{ flex: 1, minWidth: 180 }}><div style={{ fontWeight: 500 }}>Soporte Conception (temporal)</div><div style={{ fontSize: 12.5, color: C.g500 }}>Entró con su código de soporte. Para cerrar su acceso use «Cancelar acceso» en Acceso de soporte.</div></div><Badge color={C.amber} bg={C.amberLight}>Temporal</Badge>
        </div>
      ))}

      {usuarios === null ? <div style={{ color: C.g400, padding: 10 }}>Cargando…</div> : personal.map(u => (
        <div key={u.user_id} style={{ padding: '14px 0', borderBottom: `1px solid ${C.g100}`, opacity: u.activo === false ? 0.75 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Icon name="usuarios" size={18} style={{ color: C.g500 }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 500 }}>{u.nombre}</div>
              <div style={{ fontSize: 12.5, color: C.g500 }}><span style={mono}>{u.usuario}</span>{u.puesto ? ` · ${u.puesto}` : ''}</div>
              {textoVinculo(u.permisos, hospital?.profesionales) && <div style={{ fontSize: 12.5, color: C.g500, marginTop: 2 }}>{textoVinculo(u.permisos, hospital?.profesionales)}</div>}
            </div>
            {estado(u)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <Button size="sm" variant="ghost" icon="editar" disabled={ocupado === u.user_id} onClick={() => setModal({ tipo: 'editar', u })}>Editar permisos</Button>
            <Button size="sm" variant="ghost" icon="refrescar" disabled={ocupado === u.user_id} onClick={() => setModal({ tipo: 'clave', u })}>Restablecer contraseña</Button>
            {u.activo === false
              ? <Button size="sm" variant="ghost" disabled={ocupado === u.user_id} onClick={() => activar(u)}>Activar</Button>
              : <Button size="sm" variant="ghost" disabled={ocupado === u.user_id} onClick={() => desactivar(u)}>Desactivar</Button>}
            <Button size="sm" variant="texto" icon="eliminar" disabled={ocupado === u.user_id} onClick={() => eliminar(u)}>Eliminar</Button>
          </div>
        </div>
      ))}

      {conCorreo.map(u => (
        <div key={u.user_id} style={{ padding: '14px 0', borderBottom: `1px solid ${C.g100}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Icon name="usuarios" size={18} style={{ color: C.g500 }} />
            <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontWeight: 500 }}>{u.nombre}</div><div style={{ fontSize: 12.5, color: C.g500, overflowWrap: 'anywhere' }}>{u.email}</div>
              {textoVinculo(u.permisos, hospital?.profesionales) && <div style={{ fontSize: 12.5, color: C.g500, marginTop: 2 }}>{textoVinculo(u.permisos, hospital?.profesionales)}</div>}</div>
            <Badge>Con correo</Badge>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <Button size="sm" variant="ghost" icon="editar" onClick={() => setModal({ tipo: 'editar', u })}>Editar permisos</Button>
            <Button size="sm" variant="texto" onClick={() => quitarCorreo(u)}>Quitar acceso</Button>
          </div>
        </div>
      ))}

      {usuarios && !faltante && personal.length === 0 && conCorreo.length === 0 && invitaciones.length === 0 && <div style={{ fontSize: 13.5, color: C.g400, padding: '12px 0' }}>Aún no ha creado usuarios. Use «Crear usuario» para dar acceso a su personal.</div>}
      {invitaciones.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.g100}`, flexWrap: 'wrap' }}>
          <Icon name="reloj" size={18} style={{ color: C.amber }} /><div style={{ flex: 1, minWidth: 180 }}><div style={{ fontWeight: 500 }}>{i.nombre || i.email}</div><div style={{ fontSize: 12.5, color: C.g500, overflowWrap: 'anywhere' }}>{i.email} · invitado el {fmtFecha(i.created_at)} · aún no entra</div></div>
          <Button size="sm" variant="texto" onClick={() => cancelarInvitacion(i)}>Cancelar invitación</Button>
        </div>
      ))}

      {modal?.tipo === 'crear' && <UsuarioModal modo="crear" existentes={existentes} medicos={medicos} todos={hospital?.profesionales || []} departamentos={hospital?.departamentos || []} onClose={() => setModal(null)}
        onListo={(d) => { setModal({ tipo: 'datos', titulo: 'Usuario creado', ...d }); cargar() }} />}
      {modal?.tipo === 'editar' && <UsuarioModal modo="editar" u={modal.u} existentes={existentes} medicos={medicos} todos={hospital?.profesionales || []} departamentos={hospital?.departamentos || []} onClose={() => setModal(null)}
        onListo={() => { setModal(null); cargar() }} />}
      {modal?.tipo === 'clave' && <ClaveModal u={modal.u} onClose={() => setModal(null)}
        onListo={(d) => { setModal({ tipo: 'datos', titulo: 'Contraseña restablecida', ...d }); cargar() }} />}
      {modal?.tipo === 'codigo' && <CodigoModal actual={codigo} onClose={() => setModal(null)} onListo={(c) => { setCodigo(c); setModal(null); toast.success('Código actualizado') }} />}
      {modal?.tipo === 'datos' && <DatosAccesoModal titulo={modal.titulo} clinica={clinica} codigo={codigo} usuario={modal.usuario} password={modal.password} onClose={() => setModal(null)} />}
    </Card>
  )
}

// A password field with «Generar», show/hide and copy
function CampoClave({ value, onChange }) {
  const [ver, setVer] = useState(false)
  return (
    <Campo label="Contraseña temporal *" ayuda={`${REGLA_CLAVE} La persona deberá cambiarla al entrar; vence en ${CLAVE_TEMPORAL_HORAS} horas.`}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}><Input type={ver ? 'text' : 'password'} value={value} onChange={onChange} maxLength={72} autoComplete="new-password" spellCheck={false} /></div>
        <Button size="sm" variant="ghost" onClick={() => { onChange(generarClave()); setVer(true) }}>Generar</Button>
        <Button size="sm" variant="ghost" icon="ojo" onClick={() => setVer(!ver)}>{ver ? 'Ocultar' : 'Mostrar'}</Button>
        <Button size="sm" variant="ghost" icon="copiar" disabled={!value} onClick={() => copiar(value, 'Contraseña copiada')}>Copiar</Button>
      </div>
    </Campo>
  )
}

const AYUDA_MEDICOS = 'Opcional. Vincule a este usuario con los médicos con los que trabaja. Sirve para dos cosas: 1) podrá confirmar la atención de las citas de esos médicos y registrar los insumos usados; 2) si apaga «Ver los expedientes de todos los pacientes», en pantalla solo verá los pacientes y las citas de esos médicos. Si no vincula a nadie, el usuario funciona igual con los permisos que usted le dé.'

// Multi-select of doctors: checklist with «Seleccionar todos» / «Quitar todos», and a search box when the list is long.
// `medicos` = active doctors; doctors already linked but no longer active (in `todos`) stay listed as «inactivo» so they can be removed.
function SelectorMedicos({ medicos, todos, departamentos, value, onChange }) {
  const [buscar, setBuscar] = useState('')
  const lista = useMemo(() => {
    const extra = value.filter(id => !medicos.some(m => m.id === id)).map(id => todos.find(m => m.id === id)).filter(Boolean)
    return [...medicos, ...extra.map(m => ({ ...m, _inactivo: true }))]
  }, [medicos, todos, value])
  const dep = (m) => departamentos.find(d => d.id === m.departamento_id)?.nombre || ''
  const q = buscar.trim().toLowerCase()
  const visibles = q ? lista.filter(m => `${m.nombre} ${dep(m)}`.toLowerCase().includes(q)) : lista
  const elegido = new Set(value)
  const alternar = (id) => onChange(elegido.has(id) ? value.filter(x => x !== id) : [...value, id])
  const todosElegidos = lista.length > 0 && lista.every(m => elegido.has(m.id))
  return (
    <div style={{ border: `1px solid ${C.g200}`, borderRadius: 12, background: 'rgba(255,255,255,0.9)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 10px', borderBottom: lista.length ? `1px solid ${C.g100}` : 'none', background: C.g50 }}>
        <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: C.g600 }} aria-live="polite">{value.length === 0 ? 'Ninguno seleccionado' : `${value.length} de ${lista.length} seleccionados`}</span>
        <Button size="sm" variant="ghost" disabled={!lista.length || todosElegidos} onClick={() => onChange([...new Set([...value, ...lista.map(m => m.id)])])}>Seleccionar todos</Button>
        <Button size="sm" variant="ghost" disabled={!value.length} onClick={() => onChange([])}>Quitar todos</Button>
      </div>
      {lista.length === 0 && <div style={{ padding: '12px 14px', fontSize: 13.5, color: C.g400 }}>Aún no hay médicos activos. Agréguelos en Mi hospital.</div>}
      {lista.length > 8 && (
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.g100}` }}>
          <Input value={buscar} onChange={setBuscar} placeholder="Buscar médico o especialidad" aria-label="Buscar médico" autoComplete="off" />
        </div>
      )}
      <div role="group" aria-label="Médicos vinculados" style={{ maxHeight: 232, overflowY: 'auto' }}>
        {visibles.map(m => (
          <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', fontSize: 14, borderBottom: `1px solid ${C.g100}`, background: elegido.has(m.id) ? C.purpleMid : 'transparent' }}>
            <input type="checkbox" checked={elegido.has(m.id)} onChange={() => alternar(m.id)} style={{ width: 17, height: 17, accentColor: 'var(--acento)', flexShrink: 0, margin: 0 }} />
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{m.nombre}{(dep(m) || m._inactivo) && <span style={{ color: C.g400, fontSize: 12.5 }}> · {[dep(m), m._inactivo ? 'inactivo' : ''].filter(Boolean).join(' · ')}</span>}</span>
          </label>
        ))}
        {lista.length > 0 && visibles.length === 0 && <div style={{ padding: '12px 14px', fontSize: 13.5, color: C.g400 }}>Ningún médico coincide con «{buscar}».</div>}
      </div>
    </div>
  )
}

// Create or edit a user: name, user name, position (pre-fills the permissions), temporary password (create only) and what they can do
function UsuarioModal({ modo, u, existentes, medicos, todos, departamentos, onClose, onListo }) {
  const crear = modo === 'crear'
  const personal = !!u?.usuario || crear // false: an e-mail assistant (only its permissions are editable)
  const claves = clavesVisibles()
  const [nombre, setNombre] = useState(u?.nombre || '')
  const [usuario, setUsuario] = useState(u?.usuario || '')
  const [editado, setEditado] = useState(false) // the user name was typed by hand: stop suggesting
  const [puesto, setPuesto] = useState(() => !u?.puesto ? '' : PUESTOS.includes(u.puesto) ? u.puesto : 'Otro')
  const [puestoOtro, setPuestoOtro] = useState(() => (u?.puesto && !PUESTOS.includes(u.puesto) ? u.puesto : ''))
  const [password, setPassword] = useState('')
  const [permisos, setPermisos] = useState(() => crear ? plantillaPermisos('') : Object.fromEntries(claves.map(k => [k, puede(u, k)])))
  // linked doctors (legacy single key included); ids of doctors that no longer exist are dropped, inactive ones stay until the person removes them
  const [profesionalIds, setProfesionalIds] = useState(() => profesionalesDe(u?.permisos).filter(id => todos.some(m => m.id === id)))
  const [busy, setBusy] = useState(false)
  const errUsuario = crear && usuario ? errorUsuario(usuario, existentes) : ''
  const verTodos = !!permisos.ver_todos_pacientes

  const cambiarNombre = (v) => { setNombre(v); if (crear && !editado) setUsuario(sugerirUsuario(v)) }
  const elegirPuesto = (v) => { setPuesto(v); if (crear) setPermisos(plantillaPermisos(v)) } // the template only pre-fills: every box can still be changed

  const guardar = async () => {
    const puestoFinal = puesto === 'Otro' ? puestoOtro.trim() || 'Otro' : puesto
    if (personal) {
      if (nombre.trim().length < 2) { toast.error('Escriba el nombre de la persona.'); return }
      if (/[<>]/.test(nombre) || /[<>]/.test(puestoOtro)) { toast.error('El nombre y el puesto no pueden tener < >'); return }
      if (puestoFinal.length > 40) { toast.error('El puesto puede tener hasta 40 caracteres.'); return }
    }
    if (crear) {
      const e = errorUsuario(usuario, existentes)
      if (e) { toast.error(e); return }
      if (!claveValida(password)) { toast.error(`La contraseña no es válida. ${REGLA_CLAVE}`); return }
    }
    const permisosFinal = permisosConMedicos(permisos, profesionalIds)
    setBusy(true)
    if (!personal) { // e-mail assistant: keep its other keys, change only what this window shows
      const r = await actualizarPerfil(u.user_id, { permisos: { ...permisosConMedicos(u.permisos, []), ...permisosFinal } })
      setBusy(false)
      if (r.error) toast.error(mensajeUsuarios(r.error, 'No se pudo guardar')); else { toast.success('Permisos guardados'); onListo() }
      return
    }
    const r = crear
      ? await llamarUsuarios('crear', { usuario, nombre: nombre.trim(), puesto: puestoFinal, permisos: permisosFinal, password })
      : await actualizarPerfil(u.user_id, { nombre: nombre.trim(), puesto: puestoFinal, permisos: permisosFinal })
    setBusy(false)
    if (r.error) { toast.error(mensajeUsuarios(r.error)); return }
    if (crear) onListo({ usuario, password })
    else { toast.success('Cambios guardados'); onListo() }
  }

  return (
    <Modal title={crear ? 'Crear usuario' : personal ? 'Editar usuario' : 'Editar permisos'} subtitle={crear ? 'Entrará con su usuario y contraseña, sin correo' : u.nombre} onClose={onClose} maxWidth={640}>
      {personal && (
        <Grid min={220}>
          <Campo label="Nombre *"><Input value={nombre} onChange={cambiarNombre} maxLength={80} placeholder="Ej. Ana López" autoFocus={crear} /></Campo>
          <Campo label="Usuario *" ayuda={crear ? 'Con este nombre entra al sistema. Minúsculas, números, punto y guion.' : 'El usuario no se puede cambiar. Si hace falta otro, cree un usuario nuevo.'}>
            {crear
              ? <Input value={usuario} onChange={v => { setUsuario(limpiarUsuario(v)); setEditado(true) }} maxLength={30} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="nombre.apellido" aria-invalid={!!errUsuario} />
              : <div style={{ ...mono, padding: '11px 14px', border: `1px solid ${C.g200}`, borderRadius: 12, background: C.g50, fontSize: 14, overflowWrap: 'anywhere' }}>{u.usuario}</div>}
            {errUsuario && <div role="alert" style={{ fontSize: 12.5, color: C.red, marginTop: 5 }}>{errUsuario}</div>}
          </Campo>
          <Campo label="Puesto" ayuda={crear ? 'Al elegirlo se marcan los permisos más comunes de ese puesto; usted puede cambiar cada uno.' : undefined}>
            <Desplegable value={puesto} onChange={elegirPuesto} ariaLabel="Puesto" placeholder="Elija el puesto" options={PUESTOS.map(p => ({ value: p, label: p }))} style={{ width: '100%' }} />
            {puesto === 'Otro' && <div style={{ marginTop: 8 }}><Input value={puestoOtro} onChange={setPuestoOtro} maxLength={40} placeholder="Escriba el puesto" /></div>}
          </Campo>
          {crear && <CampoClave value={password} onChange={setPassword} />}
        </Grid>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, color: C.g600, margin: personal ? '22px 0 4px' : '0 0 4px' }}>¿Qué puede hacer?</div>
      {gruposVisibles().map(g => (
        <div key={g.titulo} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: C.g400, textTransform: 'uppercase', marginBottom: 8 }}>{g.titulo}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {g.items.map(p => (
              <label key={p.k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
                <Interruptor activo={!!permisos[p.k]} onChange={v => setPermisos({ ...permisos, [p.k]: v })} />
                <span style={{ minWidth: 0 }}>{p.label}{p.ayuda && <span style={{ display: 'block', fontSize: 12, color: C.g400 }}>{p.ayuda}</span>}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {claves.includes('ver_todos_pacientes') && (
        <div style={{ marginTop: 18 }}>
          <Campo label="Médicos vinculados (opcional)" ayuda={AYUDA_MEDICOS}>
            <SelectorMedicos medicos={medicos} todos={todos} departamentos={departamentos} value={profesionalIds} onChange={setProfesionalIds} />
          </Campo>
          {!verTodos && profesionalIds.length === 0 && <div style={{ fontSize: 12.5, color: C.amber, marginTop: 6 }}>Sin médicos vinculados, esta persona no verá ningún paciente de otros.</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon={crear ? 'mas' : 'check'} onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : crear ? 'Crear usuario' : 'Guardar cambios'}</Button>
      </div>
    </Modal>
  )
}

function ClaveModal({ u, onClose, onListo }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const guardar = async () => {
    if (!claveValida(password)) { toast.error(`La contraseña no es válida. ${REGLA_CLAVE}`); return }
    setBusy(true)
    const r = await llamarUsuarios('restablecer', { user_id: u.user_id, password })
    setBusy(false)
    if (r.error) { toast.error(mensajeUsuarios(r.error)); return }
    onListo({ usuario: u.usuario, password })
  }
  return (
    <Modal title="Restablecer contraseña" subtitle={`${u.nombre} · ${u.usuario}`} onClose={onClose} maxWidth={520}>
      <div style={{ fontSize: 14, color: C.g600, lineHeight: 1.55, marginBottom: 14 }}>Escriba una contraseña temporal nueva. Se cierran las sesiones abiertas de esta persona y se le pedirá cambiarla al entrar.</div>
      <CampoClave value={password} onChange={setPassword} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="refrescar" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Restablecer contraseña'}</Button>
      </div>
    </Modal>
  )
}

// Shown ONCE after creating a user or resetting a password: the only moment the temporary password is visible
function DatosAccesoModal({ titulo, clinica, codigo, usuario, password, onClose }) {
  const texto = textoAcceso({ hospital: clinica?.nombre, codigoHospital: codigo || '—', usuario, password })
  const fila = (k, v) => <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '6px 0' }}><span style={{ width: 150, color: C.g500, fontSize: 13 }}>{k}</span><strong style={{ ...mono, overflowWrap: 'anywhere', minWidth: 0 }}>{v}</strong></div>
  return (
    <Modal title={titulo} subtitle={clinica?.nombre} onClose={onClose} maxWidth={540}>
      <div style={{ background: C.g50, border: `1px solid ${C.line}`, borderRadius: 14, padding: '10px 16px', fontSize: 14 }}>
        {fila('Código del hospital', codigo || '—')}
        {fila('Usuario', usuario)}
        {fila('Contraseña temporal', password)}
      </div>
      <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: C.amberLight, color: C.amber, fontSize: 13.5, lineHeight: 1.5 }}>
        La contraseña es temporal: se le pedirá cambiarla al entrar. Vence en {CLAVE_TEMPORAL_HORAS} horas. <strong>Cópiela ahora: no se vuelve a mostrar.</strong>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
        <Button icon="copiar" variant="ghost" onClick={() => copiar(texto, 'Datos de acceso copiados')}>Copiar datos de acceso</Button>
        <Button onClick={onClose}>Listo</Button>
      </div>
    </Modal>
  )
}

function CodigoModal({ actual, onClose, onListo }) {
  const [valor, setValor] = useState(actual || '')
  const [busy, setBusy] = useState(false)
  const guardar = async () => {
    if (!/^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/.test(valor)) { toast.error('El código lleva de 4 a 20 caracteres: letras, números y guion.'); return }
    if (valor === actual) { onClose(); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('hospital_codigo_acceso', { p_codigo: valor })
    setBusy(false)
    if (error) { toast.error(/CODIGO_OCUPADO/.test(error.message) ? 'Ese código ya lo usa otro hospital. Elija otro.' : /CODIGO_INVALIDO/.test(error.message) ? 'El código lleva de 4 a 20 caracteres: letras, números y guion.' : 'No se pudo cambiar el código.'); return }
    onListo(data || valor)
  }
  return (
    <Modal title="Código de su hospital" subtitle="Lo escribe su personal al entrar" onClose={onClose} maxWidth={480}>
      <Campo label="Código" ayuda="De 4 a 20 caracteres: letras, números y guion. Ej. POLI-4821.">
        <Input value={valor} onChange={v => setValor(limpiarCodigoHospital(v))} maxLength={20} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus />
      </Campo>
      <div style={{ fontSize: 13, color: C.g500, marginTop: 12, lineHeight: 1.5 }}>Si lo cambia, su personal debe usar el código nuevo y los enlaces de acceso anteriores dejan de servir.</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar código'}</Button>
      </div>
    </Modal>
  )
}

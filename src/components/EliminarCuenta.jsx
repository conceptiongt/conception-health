import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { useDatos } from '../hooks/useDatos'
import { esAdmin } from '../lib/permisos'
import { Card } from './ui/Varios'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'

const MOTIVOS = [
  'Ya no quiero que Conception Health guarde mis datos.',
  'Quiero borrar mis datos y volver a empezar.',
  'Encontré otra plataforma que se adapta mejor a mi clínica.',
  'Ya no estoy usando Conception Health.',
  'El plan es muy costoso para mi clínica.',
  'Le faltan funciones que necesito.',
  'Otro',
]
const PALABRA = 'eliminar'
const rojo = { background: C.red, color: '#fff', border: `1px solid ${C.red}` }

// Danger zone at the end of Configuración. The admin deletes the whole clinic; an assistant deletes only their own user.
export function EliminarCuenta() {
  const { perfil, clinica } = useDatos()
  const [abierto, setAbierto] = useState(false)
  const admin = esAdmin(perfil)
  return (
    <Card title="Eliminar cuenta">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, fontSize: 13.5, color: C.g500, lineHeight: 1.55 }}>
          {admin
            ? <>Elimina para siempre la cuenta de <strong>{clinica?.nombre}</strong>: pacientes, expedientes, fotos, citas, cobros, inventario, Lía y los usuarios de sus asistentes. También se cancela su suscripción.</>
            : <>Elimina su usuario. Ya no podrá entrar a <strong>{clinica?.nombre}</strong>. Los pacientes y expedientes de la clínica se conservan.</>}
        </div>
        <Button variant="danger" icon="eliminar" onClick={() => setAbierto(true)}>{admin ? 'Eliminar cuenta' : 'Eliminar mi usuario'}</Button>
      </div>
      {abierto && <Asistente admin={admin} clinica={clinica} onClose={() => setAbierto(false)} />}
    </Card>
  )
}

function Asistente({ admin, clinica, onClose }) {
  const [paso, setPaso] = useState(1)
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [detalle, setDetalle] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const listo = texto.trim().toLowerCase() === PALABRA
  const faltaDetalle = motivo === 'Otro' && !detalle.trim()

  const eliminar = async () => {
    if (!listo || enviando) return
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('eliminar-cuenta', {
      method: 'POST', body: { confirmacion: PALABRA, motivo, detalle: detalle.trim().slice(0, 1000) },
    })
    if (error || !data?.ok) {
      let msg = data?.error
      try { msg = msg || (await error?.context?.json())?.error } catch { /* sin detalle */ }
      toast.error(msg || 'No se pudo eliminar la cuenta. Intente de nuevo.')
      setEnviando(false)
      return
    }
    toast.success(admin ? 'Su cuenta fue eliminada' : 'Su usuario fue eliminado')
    await supabase.auth.signOut()
  }

  const titulo = admin ? '¿Quiere eliminar su cuenta?' : '¿Quiere eliminar su usuario?'
  const pie = (siguiente) => (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22, flexWrap: 'wrap' }}>
      <Button variant="ghost" onClick={onClose}>Conservar la cuenta</Button>
      {siguiente}
    </div>
  )

  return (
    <Modal title={titulo} subtitle={paso > 1 ? `Paso ${paso} de 3` : clinica?.nombre} onClose={enviando ? undefined : onClose} maxWidth={540}>
      {paso > 1 && !enviando && (
        <button onClick={() => setPaso(p => p - 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.g500, cursor: 'pointer', padding: 0, marginBottom: 12, fontSize: 13.5 }}>
          <Icon name="atras" size={15} /> Atrás
        </button>
      )}

      {paso === 1 && <>
        <div style={{ fontSize: 14.5, color: C.g700, lineHeight: 1.6 }}>
          {admin
            ? <>Al hacer esto, usted y sus asistentes <strong>perderán de inmediato el acceso</strong> a Conception Health y se <strong>eliminarán permanentemente</strong> todos los datos de <strong>{clinica?.nombre}</strong>. No podrá recuperarlos.</>
            : <>Al hacer esto, <strong>perderá de inmediato el acceso</strong> a {clinica?.nombre}. Los pacientes, citas y expedientes de la clínica <strong>no se borran</strong>; los sigue administrando el dueño de la cuenta.</>}
        </div>
        {admin && <>
          <ul style={{ margin: '14px 0 0', paddingLeft: 20, color: C.g600, fontSize: 14, lineHeight: 1.7 }}>
            <li>Pacientes, expedientes, fichas, fotos y documentos.</li>
            <li>Citas, cobros, pagos, gastos e inventario.</li>
            <li>Lía, sus conversaciones y la conexión de WhatsApp.</li>
            <li>Los usuarios de sus asistentes.</li>
            <li>Su suscripción se cancela y no se le volverá a cobrar.</li>
          </ul>
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: C.g100, fontSize: 13.5, color: C.g600, lineHeight: 1.5 }}>
            Si necesita conservar algo, descárguelo antes desde <strong>Expedientes</strong> (PDF o Excel).
          </div>
        </>}
        {pie(<Button onClick={() => setPaso(2)}>Continuar con la eliminación</Button>)}
      </>}

      {paso === 2 && <>
        <div style={{ fontSize: 14.5, color: C.g700, marginBottom: 12 }}>
          ¿Nos cuenta por qué quiere eliminar su {admin ? 'cuenta' : 'usuario'}? <span style={{ color: C.red }}>*</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {MOTIVOS.map(m => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', cursor: 'pointer', fontSize: 14, color: C.g700 }}>
              <input type="radio" name="motivo" checked={motivo === m} onChange={() => setMotivo(m)} style={{ width: 17, height: 17, accentColor: C.purple }} />
              {m}
            </label>
          ))}
        </div>
        <textarea value={detalle} onChange={e => setDetalle(e.target.value)} maxLength={1000} rows={3}
          placeholder={motivo === 'Otro' ? 'Cuéntenos el motivo' : 'Comentario opcional: ¿qué podríamos mejorar?'}
          style={{ width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.g200}`, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
        {pie(<Button onClick={() => setPaso(3)} disabled={faltaDetalle}>Continuar con la eliminación</Button>)}
      </>}

      {paso === 3 && <>
        <div style={{ fontSize: 14.5, color: C.g700, lineHeight: 1.6 }}>
          {admin
            ? <>Eliminar su cuenta es <strong>permanente e irreversible</strong>. Perderá para siempre los datos de <strong>{clinica?.nombre}</strong>.</>
            : <>Eliminar su usuario es <strong>permanente</strong>. Para volver a entrar, el dueño de la cuenta tendría que invitarle de nuevo.</>}
        </div>
        <div style={{ fontSize: 14.5, color: C.g700, margin: '14px 0 8px' }}>
          Para confirmar, escriba la palabra <strong>"{PALABRA}"</strong>.
        </div>
        <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus disabled={enviando}
          onKeyDown={e => { if (e.key === 'Enter') eliminar() }} placeholder={PALABRA} autoComplete="off" spellCheck={false}
          style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${listo ? C.red : C.g200}`, fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
        {pie(<Button variant="danger" onClick={eliminar} disabled={!listo || enviando} style={rojo}>
          {enviando ? 'Eliminando…' : admin ? 'Eliminar cuenta' : 'Eliminar mi usuario'}
        </Button>)}
      </>}
    </Modal>
  )
}

import { useState, useEffect, useRef } from 'react'
import { C } from '../lib/theme'
import { esAdmin } from '../lib/permisos'
import { googleEstado, avisosGoogle, alAvisoGoogle, conectarGoogle, sincronizarTodas, confirmarGoogle, desconectarGoogle, opcionesGoogle } from '../lib/google'
import { Card } from './ui/Varios'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'
import { Interruptor } from './MensajePaciente'

const cuando = (t) => t ? new Date(t).toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null

// "Google Calendar" card of the Calendario page: connect the clinic's own Google account and see its status.
// est === undefined → loading; null → the feature is not available yet (migration / function not deployed).
export function TarjetaGoogle({ perfil }) {
  const dueno = esAdmin(perfil)
  const [est, setEst] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [progreso, setProgreso] = useState('')
  const corrida = useRef(false)
  const [falta, setFalta] = useState(() => !!avisosGoogle().faltaPermiso)

  // the Calendario reports «reconectar» / «faltaPermiso» after reading the Google events
  useEffect(() => alAvisoGoogle(() => { setFalta(!!avisosGoogle().faltaPermiso); googleEstado({ forzar: true }).then(setEst) }), [])

  const cargar = async () => setEst(await googleEstado({ forzar: true }))

  useEffect(() => {
    if (corrida.current) return
    corrida.current = true
    // back from Google: #/calendario?google=ok | error
    const q = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const resultado = q.get('google')
    if (resultado) window.history.replaceState(null, '', '#/calendario')
    ;(async () => {
      const e = await googleEstado({ forzar: true })
      setEst(e)
      if (resultado === 'error') toast.error('No se pudo conectar con Google. Intente de nuevo.')
      // connected: NOTHING is sent yet; the card asks the owner to confirm the account first
      if (resultado === 'ok' && e?.conectada) toast.success('Cuenta de Google conectada. Falta confirmarla.')
    })()
  }, [])

  const enviarTodas = async () => {
    setBusy(true); setProgreso('')
    try {
      const r = await sincronizarTodas(d => setProgreso(`Enviando citas… ${d.sincronizadas} de ${d.total}`))
      if (r?.reconectar) toast.error('Google pidió volver a conectar la cuenta')
      else if (r?.confirmar) toast.error('Falta confirmar la cuenta de Google')
      else if (r && !r.sincronizado) toast.error('Google Calendar ya no está conectado.')
      else if (r?.fallidas > 0 || r?.pendientes > 0) {
        const n = Math.max(r.pendientes || 0, r.fallidas || 0)
        toast.error(`Quedaron ${n} citas sin enviar. Toque "Sincronizar ahora" para reintentar.`)
      }
      else toast.success(r?.total ? `${r.sincronizadas} de ${r.total} citas al día en Google Calendar` : 'No hay citas próximas que enviar')
    } catch { toast.error('No se pudo sincronizar. Intente de nuevo.') }
    setProgreso(''); setBusy(false); cargar()
  }
  const confirmarCuenta = async () => {
    setBusy(true)
    try { await confirmarGoogle(est?.google_email) } catch (e) {
      setBusy(false)
      if (e?.cuentaCambio) { await cargar(); toast.error('La cuenta conectada cambió. Revise el correo y confirme de nuevo.') }
      else toast.error('No se pudo confirmar. Intente de nuevo.')
      return
    }
    await enviarTodas()
  }

  const conectar = async () => {
    setBusy(true)
    try { await conectarGoogle() } catch { setBusy(false); toast.error('No se pudo iniciar la conexión con Google') }
  }
  const desconectar = async () => {
    if (!await confirmar({
      titulo: '¿Desconectar Google Calendar?',
      mensaje: ['Las citas nuevas dejarán de enviarse a su Google Calendar.', 'Los eventos que ya están en Google no se borran; podrá quitarlos desde Google si lo desea.'],
      aceptar: 'Desconectar', peligro: true,
    })) return
    setBusy(true)
    try { await desconectarGoogle(); toast.success('Google Calendar desconectado') } catch { toast.error('No se pudo desconectar. Intente de nuevo.') }
    setBusy(false); cargar()
  }
  const ocultar = async (v) => {
    setEst({ ...est, ocultar_nombre: v })
    try { await opcionesGoogle({ ocultar_nombre: v }); toast.success('Listo. Se aplicará a las citas que se guarden de ahora en adelante; use «Sincronizar ahora» para actualizar las que ya están.') }
    catch { setEst({ ...est, ocultar_nombre: !v }); toast.error('No se pudo guardar el cambio') }
  }

  const texto = { fontSize: 13.5, color: C.g500, marginTop: 4, lineHeight: 1.55, maxWidth: 720 }
  const pildora = (fondo, color) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', minWidth: 0, padding: '6px 12px', borderRadius: 99, background: fondo, color, fontSize: 12.5, fontWeight: 600 })
  // `texto` = left column; `lado` = the action at the right (wraps below on narrow screens); `debajo` = second line
  let cuerpo, lado = null, debajo = null
  if (est === undefined) cuerpo = <div style={texto}>Cargando…</div>
  else if (est === null) {
    cuerpo = <div style={texto}>Puede pasar cualquier cita a su Google Calendar con el botón "Agregar a Google Calendar" de cada cita.</div>
    lado = <span style={pildora(C.g100, C.g500)}>Disponible pronto</span>
  } else if (!est.conectada) {
    cuerpo = (
      <>
        <div style={texto}>Conecte la cuenta de Google de su clínica: sus citas aparecerán solas en su Google Calendar, con los recordatorios de Google, y los eventos de ese calendario se verán aquí.</div>
        {!dueno && <div style={{ ...texto, color: C.g600 }}>Pídale al dueño de la cuenta que conecte Google Calendar.</div>}
      </>
    )
    if (dueno) lado = <Button onClick={conectar} disabled={busy}>Conectar con Google</Button>
  } else {
    const fallo = est.estado === 'error'
    const sinConfirmar = !est.confirmada && !fallo
    const ultima = cuando(est.ultimo_sync_at)
    const correo = est.google_email || 'su cuenta de Google'
    cuerpo = (
      <>
        <div style={texto}>
          {fallo ? 'Google pidió volver a conectar la cuenta.' : 'Sus citas se envían a su Google Calendar y los eventos de ese calendario se muestran aquí.'}
          {sinConfirmar && <> Cuenta conectada: <strong style={{ color: C.black, overflowWrap: 'anywhere' }}>{correo}</strong>.</>}
        </div>
        {sinConfirmar && (
          <div role="alert" style={{ marginTop: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: `1px solid ${C.g200}`, color: C.black, fontSize: 13.5, lineHeight: 1.55 }}>
            {dueno
              ? <>Se conectó la cuenta <strong style={{ overflowWrap: 'anywhere' }}>{est.google_email || 'de Google'}</strong>. ¿Enviar las citas de su clínica a ese calendario de Google?
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <Button size="sm" onClick={confirmarCuenta} disabled={busy}>Sí, usar esta cuenta</Button>
                    <Button variant="ghost" size="sm" onClick={desconectar} disabled={busy}>No, desconectar</Button>
                  </div></>
              : 'Falta que el dueño confirme la cuenta de Google.'}
          </div>
        )}
        {falta && !fallo && !sinConfirmar && (
          <div style={{ ...texto, color: C.g600 }}>Para ver todos sus calendarios de Google, conecte de nuevo y acepte el permiso.
            {dueno && <div style={{ marginTop: 8 }}><Button size="sm" variant="ghost" onClick={conectar} disabled={busy}>Conectar de nuevo</Button></div>}
          </div>
        )}
        {progreso && <div style={{ ...texto, color: C.g600 }}>{progreso}</div>}
        {fallo && !dueno && <div style={{ ...texto, color: C.g600 }}>Pídale al dueño de la cuenta que la conecte de nuevo.</div>}
      </>
    )
    if (fallo) {
      lado = <>
        <span style={pildora(C.amberLight, C.amber)}>Hay que volver a conectar</span>
        {dueno && <Button size="sm" onClick={conectar} disabled={busy}>Conectar de nuevo</Button>}
      </>
    } else if (!sinConfirmar) {
      lado = <>
        <span title={correo} style={pildora(C.greenLight, C.green)}>
          <span style={{ display: 'inline-flex', flexShrink: 0 }}><Icon name="check" size={14} /></span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Vinculado con <strong>{correo}</strong></span>
        </span>
        {dueno && <>
          <Button variant="ghost" size="sm" onClick={enviarTodas} disabled={busy}>Sincronizar ahora</Button>
          <Button variant="danger" size="sm" onClick={desconectar} disabled={busy}>Desconectar</Button>
        </>}
      </>
      if (dueno || ultima) debajo = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px 22px', flexWrap: 'wrap', marginTop: 10 }}>
          {dueno && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <Interruptor activo={!!est.ocultar_nombre} onChange={ocultar} titulo="Ocultar el nombre del paciente en Google" />
              <span style={{ fontSize: 13.5, lineHeight: 1.4, color: C.black }}>Ocultar el nombre del paciente en Google
                <span style={{ display: 'block', fontSize: 12, color: C.g400 }}>El evento dirá solo el tipo de cita, la sede y el estado.</span></span>
            </label>
          )}
          {ultima && <span style={{ fontSize: 12.5, color: C.g500 }}>Última sincronización: {ultima}</span>}
        </div>
      )
    }
  }

  return (
    <Card style={{ marginTop: 18, padding: '18px 22px' }}>
      <div className="tg-fila">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0, flex: '1 1 240px' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="calendarioMas" size={19} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: C.black }}>Google Calendar</div>
            {cuerpo}
          </div>
        </div>
        {lado && <div className="tg-lado">{lado}</div>}
      </div>
      {debajo && <div style={{ paddingLeft: 52 }} className="tg-debajo">{debajo}</div>}
    </Card>
  )
}

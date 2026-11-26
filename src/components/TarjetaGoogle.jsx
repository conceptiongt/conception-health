import { useState, useEffect, useRef } from 'react'
import { C } from '../lib/theme'
import { esAdmin } from '../lib/permisos'
import { googleEstado, conectarGoogle, sincronizarTodas, desconectarGoogle, opcionesGoogle } from '../lib/google'
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
  const corrida = useRef(false)

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
      if (resultado === 'ok' && e?.conectada) {
        toast.success('Google Calendar conectado')
        setBusy(true)
        try {
          const r = await sincronizarTodas()
          if (r?.sincronizadas) toast.success(`${r.sincronizadas} ${r.sincronizadas === 1 ? 'cita enviada' : 'citas enviadas'} a Google Calendar`)
        } catch { /* the card shows the status; "Sincronizar ahora" retries */ }
        setBusy(false)
        cargar()
      }
    })()
  }, [])

  const conectar = async () => {
    setBusy(true)
    try { await conectarGoogle() } catch { setBusy(false); toast.error('No se pudo iniciar la conexión con Google') }
  }
  const sincronizar = async () => {
    setBusy(true)
    try {
      const r = await sincronizarTodas()
      if (r?.reconectar) toast.error('Google pidió volver a conectar la cuenta')
      else toast.success(r?.total ? `${r.sincronizadas} de ${r.total} citas al día en Google Calendar` : 'No hay citas próximas que enviar')
    } catch { toast.error('No se pudo sincronizar. Intente de nuevo.') }
    setBusy(false); cargar()
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
  let cuerpo
  if (est === undefined) cuerpo = <div style={texto}>Cargando…</div>
  else if (est === null) cuerpo = <div style={texto}>Disponible pronto. Mientras tanto, puede pasar cualquier cita a su Google Calendar con el botón "Agregar a Google Calendar" de cada cita.</div>
  else if (!est.conectada) {
    cuerpo = (
      <>
        <div style={texto}>Conecte la cuenta de Google de su clínica y sus citas aparecerán solas en su Google Calendar, con los recordatorios de Google.</div>
        {dueno
          ? <div style={{ marginTop: 12 }}><Button onClick={conectar} disabled={busy}>Conectar con Google</Button></div>
          : <div style={{ ...texto, color: C.g600 }}>Pídale al dueño de la cuenta que conecte Google Calendar.</div>}
      </>
    )
  } else {
    const fallo = est.estado === 'error'
    const ultima = cuando(est.ultimo_sync_at)
    cuerpo = (
      <>
        <div style={texto}>Conectado como <strong style={{ color: C.black, overflowWrap: 'anywhere' }}>{est.google_email || 'su cuenta de Google'}</strong>{ultima && <> · Última sincronización: {ultima}</>}</div>
        {fallo && (
          <div role="alert" style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, background: C.amberLight, color: C.amber, fontSize: 13.5, lineHeight: 1.5 }}>
            Google pidió volver a conectar la cuenta.
          </div>
        )}
        {dueno ? (
          <>
            {!fallo && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '12px 0 4px' }}>
                <Interruptor activo={!!est.ocultar_nombre} onChange={ocultar} titulo="Ocultar el nombre del paciente en Google" />
                <span style={{ fontSize: 13.5, lineHeight: 1.4, color: C.black }}>Ocultar el nombre del paciente en Google
                  <span style={{ display: 'block', fontSize: 12, color: C.g400 }}>El evento dirá solo el tipo de cita.</span></span>
              </label>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {fallo
                ? <Button onClick={conectar} disabled={busy}>Conectar de nuevo</Button>
                : <Button variant="ghost" size="sm" onClick={sincronizar} disabled={busy}>Sincronizar ahora</Button>}
              <Button variant="danger" size="sm" onClick={desconectar} disabled={busy}>Desconectar</Button>
            </div>
          </>
        ) : fallo && <div style={{ ...texto, color: C.g600 }}>Pídale al dueño de la cuenta que la conecte de nuevo.</div>}
      </>
    )
  }

  return (
    <Card style={{ marginTop: 18, padding: '18px 22px' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="calendarioMas" size={19} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: C.black }}>Google Calendar</div>
          {cuerpo}
        </div>
      </div>
    </Card>
  )
}

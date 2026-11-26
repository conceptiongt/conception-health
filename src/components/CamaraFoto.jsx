import { useEffect, useRef, useState } from 'react'
import { C } from '../lib/theme'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'

// Touch-first devices (phones, tablets, iPads) keep the native camera app via <input capture>;
// computers open the in-platform camera. Without getUserMedia a computer falls back to the file picker.
export const usarCamaraNativa = () => {
  try { return navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches } catch { return false }
}
export const hayCamaraWeb = () => !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia)

const pad = (n) => String(n).padStart(2, '0')
const nombreFoto = (d) => `foto-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`

const MENSAJES = {
  permiso: 'No se dio permiso para usar la cámara. Puede permitirla en el candado de la barra de direcciones, o elegir un archivo.',
  nocamara: 'No se encontró una cámara en este equipo.',
  ocupada: 'Otra aplicación está usando la cámara.',
  otro: 'No se pudo abrir la cámara.',
}
const tipoError = (e) => {
  const n = e?.name
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'permiso'
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'nocamara'
  if (n === 'NotReadableError' || n === 'TrackStartError') return 'ocupada'
  return 'otro'
}

// Live camera window: returns a normal JPEG File through onFoto, which feeds the existing upload handler.
export function CamaraFoto({ onFoto, onClose, onElegirArchivo }) {
  const videoRef = useRef(null)
  const [deviceId, setDeviceId] = useState(null)
  const [camaras, setCamaras] = useState([])
  const [listo, setListo] = useState(false)
  const [error, setError] = useState(null)
  const [espejo, setEspejo] = useState(false)
  const [pausa, setPausa] = useState(false)
  const [intento, setIntento] = useState(0)
  const [foto, setFoto] = useState(null) // { file, url }

  const corriendo = !foto && !pausa

  // One effect owns the stream: whatever ends it (close, capture, camera switch, hidden tab) runs the cleanup that stops every track.
  useEffect(() => {
    if (!corriendo) return undefined
    let cancelado = false
    let stream = null
    setListo(false); setError(null)
    const pedir = async (video) => {
      try { return await navigator.mediaDevices.getUserMedia({ video, audio: false }) } catch (e) { return e }
    }
    ;(async () => {
      if (!hayCamaraWeb()) { setError('otro'); return }
      const ideal = { width: { ideal: 1920 }, height: { ideal: 1080 } }
      let r = await pedir(deviceId ? { deviceId: { exact: deviceId }, ...ideal } : { facingMode: { ideal: 'environment' }, ...ideal })
      // a saved device that no longer exists: retry with the default camera
      if (r instanceof Error && deviceId && r.name === 'OverconstrainedError') r = await pedir({ facingMode: { ideal: 'environment' }, ...ideal })
      if (r instanceof Error) { if (!cancelado) setError(tipoError(r)); return }
      stream = r
      // the window was closed while the permission prompt was open: release right away
      if (cancelado) { stream.getTracks().forEach(t => t.stop()); stream = null; return }
      const video = videoRef.current
      if (!video) { stream.getTracks().forEach(t => t.stop()); stream = null; return }
      video.srcObject = stream
      const ajustes = stream.getVideoTracks()[0]?.getSettings?.() || {}
      setEspejo(ajustes.facingMode !== 'environment') // selfie and desktop webcams look natural mirrored
      try { await video.play() } catch { /* autoplay is allowed for muted inline video; ignore */ }
      if (cancelado) return
      setListo(true)
      try {
        const lista = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
        if (!cancelado) setCamaras(lista)
      } catch { /* the switch button just stays hidden */ }
    })()
    return () => {
      cancelado = true
      if (stream) stream.getTracks().forEach(t => t.stop())
      const v = videoRef.current
      if (v) v.srcObject = null
    }
  }, [corriendo, deviceId, intento])

  // Hidden tab: release the camera; reopen when visible again
  useEffect(() => {
    const fn = () => setPausa(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [])

  // Free the preview image when it is replaced or the window closes
  useEffect(() => () => { if (foto?.url) URL.revokeObjectURL(foto.url) }, [foto])

  const tomar = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height) // drawn unmirrored: the mirror is CSS-only
    const ahora = new Date()
    c.toBlob((blob) => {
      if (!blob) { setError('otro'); return }
      const file = new File([blob], nombreFoto(ahora), { type: 'image/jpeg', lastModified: ahora.getTime() })
      setFoto({ file, url: URL.createObjectURL(blob) })
    }, 'image/jpeg', 0.9)
  }
  const usar = () => { const f = foto.file; setFoto(null); onClose(); onFoto(f) }
  const repetir = () => { setFoto(null); setIntento(n => n + 1) }
  const cambiar = () => {
    if (camaras.length < 2) return
    const actual = videoRef.current?.srcObject?.getVideoTracks?.()[0]?.getSettings?.().deviceId
    const i = camaras.findIndex(d => d.deviceId === actual)
    setDeviceId(camaras[(i + 1) % camaras.length].deviceId)
  }

  const fase = error ? 'error' : foto ? 'revisar' : listo ? 'vivo' : 'abriendo'
  const marco = { position: 'relative', width: '100%', minHeight: 200, borderRadius: 16, background: '#0F1624', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }

  return (
    <Modal title="Tomar foto" onClose={onClose} maxWidth={640}>
      <div aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {fase === 'abriendo' ? 'Abriendo la cámara' : fase === 'vivo' ? 'Cámara lista' : fase === 'revisar' ? 'Foto tomada' : MENSAJES[error]}
      </div>
      {fase === 'error' ? (
        <div role="alert" style={{ padding: '24px 8px', textAlign: 'center', color: C.g600, fontSize: 14, lineHeight: 1.5 }}>
          {MENSAJES[error]}
        </div>
      ) : (
        <div style={marco}>
          <video ref={videoRef} autoPlay playsInline muted className="cam-video" style={{ display: foto ? 'none' : 'block', transform: espejo ? 'scaleX(-1)' : 'none' }} />
          {foto && <img src={foto.url} alt="Foto tomada" className="cam-video" />}
          {fase === 'abriendo' && <div style={{ position: 'absolute', color: '#fff', fontSize: 14 }}>Abriendo la cámara…</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 16 }}>
        {fase === 'error' && <Button variant="primary" size="lg" onClick={() => { onClose(); onElegirArchivo() }} style={{ minHeight: 48 }}>Elegir un archivo</Button>}
        {fase === 'error' && error !== 'permiso' && error !== 'nocamara' && <Button variant="ghost" size="lg" onClick={() => setIntento(n => n + 1)} style={{ minHeight: 48 }}>Reintentar</Button>}
        {fase === 'vivo' && camaras.length > 1 && <Button variant="ghost" size="lg" icon="camara" onClick={cambiar} style={{ minHeight: 48 }}>Cambiar cámara</Button>}
        {fase === 'revisar' && <Button variant="ghost" size="lg" onClick={repetir} style={{ minHeight: 48 }}>Repetir</Button>}
        <Button variant="ghost" size="lg" onClick={onClose} style={{ minHeight: 48 }}>Cancelar</Button>
        {fase === 'revisar' && <Button variant="primary" size="lg" onClick={usar} style={{ minHeight: 48 }}>Usar esta foto</Button>}
        {(fase === 'vivo' || fase === 'abriendo') && <Button variant="primary" size="lg" icon="camara" onClick={tomar} disabled={fase !== 'vivo'} style={{ minHeight: 48 }}>Tomar foto</Button>}
      </div>
    </Modal>
  )
}

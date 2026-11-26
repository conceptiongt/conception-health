import { useState, useEffect } from 'react'
import { C } from '../lib/theme'
import { linkWhatsApp } from '../lib/formato'
import { esMeetUrl } from '../lib/agenda'
import { meetCita } from '../lib/google'
import { useGoogleListo } from '../hooks/useGoogleListo'
import { esSoporte } from '../lib/permisos'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'

// A Google Meet link with its actions: copy, open and (when `telefono` is given and valid) send by WhatsApp. Only real Meet URLs are drawn.
export function EnlaceMeet({ url, telefono }) {
  if (!esMeetUrl(url)) return null
  const wa = telefono ? linkWhatsApp(telefono, `Su enlace para la teleconsulta: ${url}`) : null
  const copiar = async () => { try { await navigator.clipboard.writeText(url); toast.success('Enlace copiado') } catch { toast.error('No se pudo copiar el enlace') } }
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13.5, color: C.black }}>
        <span style={{ display: 'inline-flex', color: C.purple, flexShrink: 0 }}><Icon name="video" size={16} /></span>
        <span style={{ fontWeight: 600, flexShrink: 0 }}>Enlace de Meet</span>
        <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.g500 }}>{url.replace('https://', '')}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Button variant="ghost" size="sm" icon="copiar" onClick={copiar}>Copiar</Button>
        <Button variant="ghost" size="sm" icon="enlace" onClick={() => window.open(url, '_blank', 'noopener')}>Abrir</Button>
        {wa && <Button variant="ghost" size="sm" icon="mensaje" onClick={() => window.open(wa, '_blank', 'noopener')}>Enviar por WhatsApp</Button>}
      </div>
    </div>
  )
}

// Meet link of ONE cita, in its detail. Only shown while Google Calendar is connected and confirmed. The link is read once when this
// mounts (the detail opens), never while a list renders; «Crear enlace» asks Google to make it. Support sessions only see an existing link.
export function MeetCita({ cita, telefono, perfil, arriba = 16 }) {
  const listo = useGoogleListo()
  const [url, setUrl] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [busy, setBusy] = useState(false)
  const activa = listo && !!cita?.id && cita.estado !== 'Cancelada'
  useEffect(() => {
    if (!activa) return
    let vivo = true
    setCargando(true)
    meetCita(cita.id, false).then(r => { if (vivo) { setUrl(r?.meet_url || null); setCargando(false) } })
    return () => { vivo = false }
  }, [activa, cita?.id])
  if (!activa || cargando) return null
  const crear = async () => {
    setBusy(true)
    const r = await meetCita(cita.id, true)
    setBusy(false)
    if (r?.meet_url) { setUrl(r.meet_url); toast.success('Enlace de Meet creado') }
    else toast.error('No se pudo crear el enlace de Meet. Intente de nuevo.')
  }
  if (!url && esSoporte(perfil)) return null
  return (
    <div style={{ marginTop: arriba }}>
      {url
        ? <EnlaceMeet url={url} telefono={telefono} />
        : <Button variant="ghost" size="sm" icon="video" disabled={busy} onClick={crear}>{busy ? 'Creando enlace…' : 'Crear enlace de Google Meet'}</Button>}
    </div>
  )
}

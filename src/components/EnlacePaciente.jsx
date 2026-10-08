import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { C, SHADOW } from '../lib/theme'
import { linkWhatsApp } from '../lib/formato'
import { urlPortal, urlRegistro } from '../lib/ficha'
import { useDatos } from '../hooks/useDatos'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'

// Always-visible button with the patient's links (portal and data form), ready to copy or send by WhatsApp
export function EnlacePaciente({ paciente, size = 'sm' }) {
  const { recargar } = useDatos()
  const [abierto, setAbierto] = useState(false)
  const [token, setToken] = useState(paciente.registro_token)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const nombre = paciente.nombre.split(' ')[0]
  const portal = urlPortal(paciente)
  const copiar = (t, aviso) => { navigator.clipboard?.writeText(t); toast.success(aviso); setAbierto(false) }
  const enviar = (texto) => {
    const wa = linkWhatsApp(paciente.telefono, texto)
    if (!wa) { toast.error('El paciente no tiene teléfono; copie el enlace'); return }
    window.open(wa, '_blank', 'noopener'); setAbierto(false)
  }
  const publicar = async () => {
    const { error } = await supabase.from('pacientes').update({ portal_activo: true }).eq('id', paciente.id)
    if (error) toast.error('No se pudo publicar'); else { toast.success('Portal publicado'); recargar() }
  }
  const formulario = async () => { // creates the patient's private form link the first time
    if (token) return urlRegistro(token)
    const nuevo = crypto.randomUUID()
    const { error } = await supabase.from('pacientes').update({ registro_token: nuevo }).eq('id', paciente.id)
    if (error) { toast.error('No se pudo crear el enlace'); return null }
    setToken(nuevo); recargar()
    return urlRegistro(nuevo)
  }
  const msgPortal = `Hola ${nombre} 👋\n\nEn este enlace puede ver su expediente, sus indicaciones y documentos cuando lo necesite:\n${portal}`
  const msgForm = (u) => `Hola ${nombre} 👋\n\nPor favor llene sus datos en este enlace (toma 3 minutos):\n${u}`

  const fila = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }
  return (
    <div ref={caja} style={{ position: 'relative', display: 'inline-block' }}>
      <Button size={size} icon="enlace" onClick={() => setAbierto(!abierto)}>Enlace del paciente</Button>
      {abierto && (
        <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 60, width: 340, maxWidth: '86vw', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: SHADOW, padding: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Portal del paciente</div>
          <div style={{ fontSize: 12.5, color: paciente.portal_activo ? C.g500 : C.amber, marginTop: 2 }}>
            {paciente.portal_activo ? 'Ve sus consultas, indicaciones y documentos.' : 'Aún no está publicado: el paciente verá «portal en preparación».'}
          </div>
          <div style={{ fontSize: 12, color: C.g400, background: C.g50, borderRadius: 8, padding: '6px 8px', marginTop: 8, wordBreak: 'break-all' }}>{portal}</div>
          <div style={fila}>
            <Button size="sm" icon="mensaje" onClick={() => enviar(msgPortal)}>WhatsApp</Button>
            <Button size="sm" variant="ghost" icon="copiar" onClick={() => copiar(portal, 'Enlace del portal copiado')}>Copiar</Button>
            {!paciente.portal_activo && <Button size="sm" variant="ghost" icon="check" onClick={publicar}>Publicar</Button>}
          </div>

          <div style={{ height: 1, background: C.g100, margin: '14px 0' }} />
          <div style={{ fontWeight: 600, fontSize: 14 }}>Formulario de datos</div>
          <div style={{ fontSize: 12.5, color: C.g500, marginTop: 2 }}>{paciente.registro_completado_at ? 'El paciente ya lo llenó; puede enviarlo de nuevo para actualizar.' : 'Para que el paciente llene sus datos y antecedentes.'}</div>
          <div style={fila}>
            <Button size="sm" icon="mensaje" onClick={async () => { const u = await formulario(); if (u) enviar(msgForm(u)) }}>WhatsApp</Button>
            <Button size="sm" variant="ghost" icon="copiar" onClick={async () => { const u = await formulario(); if (u) copiar(u, 'Enlace del formulario copiado') }}>Copiar</Button>
          </div>
          <button onClick={() => setAbierto(false)} aria-label="Cerrar" style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: C.g400 }}><Icon name="cerrar" size={16} /></button>
        </div>
      )}
    </div>
  )
}

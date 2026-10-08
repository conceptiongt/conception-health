import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { fmtQ, mensajeConfirmacion, linkWhatsApp, linkCalendar } from '../lib/formato'
import { linkPago, urlRegistro, LINK_PAGO_EJEMPLO } from '../lib/ficha'
import { useDatos } from '../hooks/useDatos'
import { Button } from './ui/Button'
import { toast } from './ui/Toast'

// Appointment message for WhatsApp, with switches to add the payment link (deposit %) and the patient's data form
export function MensajePaciente({ paciente, cita, precio = 0, compacto }) {
  const { clinica, perfil, recargar } = useDatos()
  const [pago, setPago] = useState(!!cita.link_pago || (precio > 0 && ['Primera consulta'].includes(cita.tipo)))
  const [pct, setPct] = useState(cita.anticipo_pct || clinica?.anticipo_pct || 50)
  const [formulario, setFormulario] = useState(!paciente.registro_completado_at)
  const [token, setToken] = useState(paciente.registro_token)
  const monto = Math.round(precio * pct) / 100
  const ejemplo = !clinica?.link_pago

  const msg = mensajeConfirmacion(paciente, cita, clinica?.nombre || perfil.nombre, {
    pago: pago && monto > 0 ? { monto, pct, link: linkPago(clinica, monto, `Anticipo ${cita.tipo || 'cita'} · ${paciente.nombre}`) } : null,
    formulario: formulario && token ? urlRegistro(token) : null,
  })
  const wa = linkWhatsApp(paciente.telefono, msg)
  const cal = linkCalendar(paciente, cita)

  const activarFormulario = async (v) => { // the first time, the patient gets their own private form link
    setFormulario(v)
    if (v && !token) {
      const nuevo = crypto.randomUUID()
      const { error } = await supabase.from('pacientes').update({ registro_token: nuevo }).eq('id', paciente.id)
      if (error) { toast.error('No se pudo crear el enlace'); setFormulario(false); return }
      setToken(nuevo); recargar()
    }
  }
  // the form switch starts on for patients who have not filled their data: create their link right away
  useEffect(() => { if (formulario && !token) activarFormulario(true) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const guardarPago = (v, p = pct) => { // remember the choice on the appointment
    if (cita.id) supabase.from('citas').update({ link_pago: v, anticipo_pct: p }).eq('id', cita.id).then(() => {})
  }

  const interruptor = (activo, onChange, texto, detalle) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
      <Interruptor activo={activo} onChange={onChange} />
      <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{texto}{detalle && <span style={{ display: 'block', fontSize: 12, color: C.g400 }}>{detalle}</span>}</span>
    </label>
  )

  return (
    <div>
      {interruptor(pago, (v) => { setPago(v); guardarPago(v) }, <>Agregar link de pago del anticipo</>,
        precio > 0 ? <span>
          <input type="number" min="1" max="100" value={pct} onChange={e => { const p = Math.max(1, Math.min(100, Number(e.target.value) || 0)); setPct(p); guardarPago(pago, p) }}
            style={{ width: 52, padding: '2px 6px', border: `1px solid ${C.g200}`, borderRadius: 6, fontFamily: 'inherit', fontSize: 12.5, marginRight: 4 }} />% = {fmtQ(monto)}{ejemplo ? ' · enlace de ejemplo' : ''}
        </span> : 'Elija un servicio con precio para calcular el anticipo')}
      {interruptor(formulario, activarFormulario, 'Agregar formulario para que el paciente llene sus datos', paciente.registro_completado_at ? 'El paciente ya llenó sus datos' : 'Datos personales y antecedentes médicos, antes de la cita')}
      {!compacto && <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: C.g50, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.6 }}>{msg}</pre>}
      {ejemplo && pago && <div style={{ fontSize: 12, color: C.g400, marginTop: 6 }}>Mientras no configure su link de pago real (Configuración → Pagos en línea) se usa {LINK_PAGO_EJEMPLO}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {wa && <Button icon="mensaje" size={compacto ? 'sm' : undefined} onClick={() => window.open(wa, '_blank', 'noopener')}>Enviar por WhatsApp</Button>}
        <Button variant="ghost" size={compacto ? 'sm' : undefined} icon="copiar" onClick={() => { navigator.clipboard?.writeText(msg); toast.success('Mensaje copiado') }}>Copiar mensaje</Button>
        {!compacto && cal && <Button variant="ghost" icon="calendarioMas" onClick={() => window.open(cal, '_blank', 'noopener')}>Agregar a Google Calendar</Button>}
      </div>
    </div>
  )
}

// Small on/off switch
export function Interruptor({ activo, onChange, titulo }) {
  return (
    <button type="button" role="switch" aria-checked={activo} title={titulo} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(!activo) }} style={{
      width: 36, height: 21, borderRadius: 11, border: 'none', padding: 2, cursor: 'pointer', flexShrink: 0, marginTop: 1,
      background: activo ? 'var(--acento)' : '#C9CBD6', transition: 'background .15s', display: 'inline-flex',
    }}>
      <span style={{ width: 17, height: 17, borderRadius: 9, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transform: activo ? 'translateX(15px)' : 'none', transition: 'transform .15s' }} />
    </button>
  )
}

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { C } from '../../lib/theme'
import { cuando, iniciales } from '../../lib/lia'
import { fmtFechaCorta, fmtHora } from '../../lib/formato'
import { useDatos } from '../../hooks/useDatos'
import { useLia } from '../../hooks/useLia'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { toast } from '../ui/Toast'
import { Burbuja, EtapaBadge, NotaSistema, botonMini } from './Comunes'

const FILTROS = [
  { v: 'todas', label: 'Todas', f: () => true },
  { v: 'doctor', label: 'Le necesitan', f: c => c.etapa === 'doctor' },
  { v: 'activas', label: 'En conversación', f: c => ['nuevo', 'calificando', 'horario_ofrecido'].includes(c.etapa) },
  { v: 'agendados', label: 'Agendados', f: c => c.etapa === 'agendado' },
  { v: 'seguimiento', label: 'En seguimiento', f: c => ['sin_respuesta', 'frio', 'post'].includes(c.etapa) },
  { v: 'descartados', label: 'Descartados', f: c => c.etapa === 'descartado' },
]

export function Conversaciones({ irA }) {
  const { convs, recargar, cfg } = useLia()
  const { perfil, citas, ir } = useDatos()
  const [filtro, setFiltro] = useState('todas')
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState(null)
  const [viendo, setViendo] = useState(false)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [ficha, setFicha] = useState(false)
  const caja = useRef(null)

  const f = FILTROS.find(x => x.v === filtro).f
  const qq = q.trim().toLowerCase()
  const lista = convs.filter(f).filter(c => !qq || `${c.nombre} ${c.motivo || ''} ${c.telefono || ''}`.toLowerCase().includes(qq))
  const sel = convs.find(c => c.id === selId) || lista[0] || null

  useEffect(() => {
    if (!sel) { setMensajes([]); return }
    let vivo = true
    supabase.from('lia_mensajes').select('*').eq('conversacion_id', sel.id).order('created_at').then(({ data }) => { if (vivo) setMensajes(data || []) })
    return () => { vivo = false }
  }, [sel?.id, sel?.ultimo_at]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (caja.current) caja.current.scrollTop = caja.current.scrollHeight }, [mensajes])

  const nombreLia = cfg.nombre || 'Lía'
  const conectado = cfg.whatsapp?.estado === 'conectado'

  const nota = async (c, t) => supabase.from('lia_mensajes').insert({ clinica_id: perfil.clinica_id, conversacion_id: c.id, de: 's', texto: t })
  const actualizar = async (c, cambios, t) => {
    const { error } = await supabase.from('lia_conversaciones').update({ ...cambios, ultimo_at: new Date().toISOString() }).eq('id', c.id)
    if (error) { toast.error('No se pudo guardar'); return }
    if (t) await nota(c, t)
    recargar()
  }
  const tomar = (c) => actualizar(c, { tomado: true }, `Usted tomó la conversación. ${nombreLia} no contesta hasta que se la devuelva.`)
  const devolver = (c) => actualizar(c, { tomado: false, ...(c.etapa === 'doctor' ? { etapa: c.cita_id ? 'agendado' : 'calificando', alerta: null } : {}) }, `Usted le devolvió la conversación a ${nombreLia}.`)
  const enviar = async () => {
    const t = texto.trim()
    if (!t || !sel) return
    setTexto('')
    // the server sends it through the clinic's WhatsApp (when connected) and stores it
    const { data, error } = await supabase.functions.invoke('lia-responder', { body: { accion: 'enviar', conversacion_id: sel.id, texto: t } })
    if (error || data?.error) {
      setTexto(t)
      toast.error(data?.error === 'ventana'
        ? 'Pasaron más de 24 horas desde el último mensaje del paciente: WhatsApp no deja escribirle hasta que vuelva a escribir.'
        : 'No se pudo enviar el mensaje por WhatsApp')
      return
    }
    recargar()
  }

  if (!convs.length) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: '48px 24px', textAlign: 'center', color: C.g500 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="mensaje" size={26} /></div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.black, marginBottom: 6 }}>Todavía no hay conversaciones</div>
        <div style={{ fontSize: 14, maxWidth: 460, margin: '0 auto 18px', lineHeight: 1.6 }}>
          {conectado ? `Cuando un paciente escriba a su WhatsApp, aquí verá cómo le contesta ${nombreLia}.` : `Cuando su WhatsApp esté conectado, aquí verá cada conversación. Mientras tanto puede probar a ${nombreLia} usted mismo.`}
        </div>
        <Button variant="brand" icon="telefono" onClick={() => irA('probar')}>Probar a {nombreLia}</Button>
      </div>
    )
  }

  const cita = sel?.cita_id ? citas.find(c => c.id === sel.cita_id) : null
  const Ficha = () => !sel ? null : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        {[['Motivo', sel.motivo || '—'], ['Llegó por', sel.origen || '—'], ['Teléfono', sel.telefono || '—']].map(([k, v]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.g400, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
            <div style={{ fontSize: 14 }}>{v}</div>
          </div>
        ))}
      </div>
      {(cita || sel.prueba_cita) && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.g400, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Cita</div>
          {cita
            ? <><div style={{ fontWeight: 700 }}>{cita.servicio || cita.tipo}</div><div style={{ fontSize: 13.5, color: C.g600 }}>{fmtFechaCorta(cita.fecha)} · {fmtHora(cita.hora)} · {cita.estado}</div>
                <button style={{ ...botonMini, marginTop: 8 }} onClick={() => ir('citas')}><Icon name="citas" size={14} />Ver en Citas</button></>
            : <><div style={{ fontWeight: 700 }}>{sel.prueba_cita.servicio}</div><div style={{ fontSize: 13.5, color: C.g600 }}>{fmtFechaCorta(sel.prueba_cita.fecha)} · {sel.prueba_cita.hora}</div><div style={{ fontSize: 12.5, color: C.g400, marginTop: 4 }}>Cita de prueba, no está en su agenda.</div></>}
        </div>
      )}
      {!sel.prueba && (sel.etapa !== 'descartado'
        ? <button style={botonMini} onClick={() => actualizar(sel, { etapa: 'descartado' })}>Marcar como descartado</button>
        : <button style={botonMini} onClick={() => actualizar(sel, { etapa: sel.cita_id ? 'agendado' : 'calificando' })}>Volver a activar</button>)}
    </div>
  )

  return (
    <>
      <div className={`lia-inbox${viendo ? ' viendo' : ''}`}>
        <section className="lia-lista" style={{ display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.line}` }}>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, borderBottom: `1px solid ${C.g100}` }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o motivo" aria-label="Buscar conversación"
              style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.g200}`, fontSize: 13.5, fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTROS.map(x => {
                const on = filtro === x.v
                return <button key={x.v} onClick={() => setFiltro(x.v)} aria-pressed={on} style={{ fontSize: 12.5, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, border: `1px solid ${on ? C.black : C.line}`, background: on ? C.black : '#fff', color: on ? '#fff' : C.g600 }}>
                  {x.label} <span style={{ opacity: 0.6 }}>{convs.filter(x.f).length}</span></button>
              })}
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {lista.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: C.g400 }}>No hay conversaciones aquí.</div>}
            {lista.map(c => (
              <button key={c.id} className="lia-item" onClick={() => { setSelId(c.id); setViendo(true) }} style={{
                display: 'flex', gap: 11, padding: 12, width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${C.g100}`, cursor: 'pointer', fontFamily: 'inherit',
                background: sel?.id === c.id ? C.purpleMid : '#fff',
              }}>
                <span style={{ width: 38, height: 38, borderRadius: 19, background: C.g100, color: C.g600, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{iniciales(c.nombre)}</span>
                <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <b style={{ fontSize: 14, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</b>
                    <span style={{ fontSize: 11.5, color: C.g400, whiteSpace: 'nowrap' }}>{cuando(c.ultimo_at)}</span>
                  </span>
                  <span style={{ fontSize: 13, color: C.g500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.motivo || c.telefono || ''}</span>
                  <span><EtapaBadge v={c.etapa} prueba={c.prueba} /></span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="lia-chat" style={{ display: 'flex', flexDirection: 'column' }}>
          {sel && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px', borderBottom: `1px solid ${C.g100}` }}>
              <button className="lia-volver" onClick={() => setViendo(false)} aria-label="Volver a la lista" style={{ ...botonMini, padding: 7 }}><Icon name="atras" size={16} /></button>
              <span style={{ width: 38, height: 38, borderRadius: 19, background: C.g100, color: C.g600, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{iniciales(sel.nombre)}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <b style={{ display: 'block', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel.nombre}</b>
                <span style={{ display: 'block', fontSize: 12.5, color: C.g400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[sel.telefono, sel.origen].filter(Boolean).join(' · ')}</span>
              </span>
              <EtapaBadge v={sel.etapa} prueba={sel.prueba} />
              <button className="lia-ficha-btn" style={botonMini} onClick={() => setFicha(true)}>Ficha</button>
            </div>
            {sel.tomado
              ? <Banda fondo={C.blueLight} color={C.blue} icono="registrar" texto={`Usted está atendiendo esta conversación. ${nombreLia} no contesta hasta que se la devuelva.`} boton={<Button size="sm" variant="ghost" onClick={() => devolver(sel)}>Devolver a {nombreLia}</Button>} />
              : sel.etapa === 'doctor'
                ? <Banda fondo={C.redLight} color={C.red} icono="mano" texto={<><b>{nombreLia} le pasó esta conversación.</b> {sel.alerta}</>} boton={<Button size="sm" variant="brand" onClick={() => tomar(sel)}>Tomar la conversación</Button>} />
                : <Banda fondo={C.purpleMid} color={C.purple} icono="lia" texto={`${nombreLia} atiende esta conversación.`} boton={!sel.prueba && <Button size="sm" variant="ghost" onClick={() => tomar(sel)}>Tomar la conversación</Button>} />}
            <div ref={caja} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 4, background: C.g50 }}>
              {mensajes.map((m, i) => {
                if (m.de === 's') return <NotaSistema key={m.id}>{m.texto}</NotaSistema>
                const cambia = i === 0 || mensajes[i - 1].de !== m.de
                const quien = m.de === 'l' ? nombreLia : m.de === 'd' ? 'Consultorio' : sel.nombre
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.de === 'p' ? 'flex-start' : 'flex-end' }}>
                    {cambia && <span style={{ fontSize: 11.5, fontWeight: 700, color: m.de === 'p' ? C.g400 : m.de === 'd' ? C.blue : C.purple, margin: '8px 6px 3px' }}>{quien}</span>}
                    <Burbuja m={m} mio={m.de !== 'p'} fondo={m.de === 'p' ? '#fff' : m.de === 'd' ? C.blueLight : C.purpleLight} etiqueta={m.etiqueta} />
                  </div>
                )
              })}
            </div>
            {sel.tomado && (
              <div style={{ borderTop: `1px solid ${C.g100}`, padding: '10px 12px' }}>
                {!conectado && <div style={{ fontSize: 12, color: C.g400, marginBottom: 6 }}>Su WhatsApp todavía no está conectado: el mensaje queda guardado aquí.</div>}
                <form onSubmit={e => { e.preventDefault(); enviar() }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={1} placeholder="Escriba como consultorio…" aria-label={`Mensaje para ${sel.nombre}`}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar() } }}
                    style={{ flex: 1, minWidth: 0, resize: 'none', border: `1px solid ${C.g200}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', maxHeight: 120 }} />
                  <Button type="submit" variant="brand" icon="enviar" disabled={!texto.trim()}>Enviar</Button>
                </form>
              </div>
            )}
          </>}
        </section>

        <aside className="lia-ficha" style={{ borderLeft: `1px solid ${C.line}`, padding: 18, overflowY: 'auto' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.g400, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Ficha del paciente</div>
          <Ficha />
        </aside>
      </div>
      {ficha && sel && <Modal title={sel.nombre} subtitle="Ficha del paciente" onClose={() => setFicha(false)} maxWidth={420}><Ficha /></Modal>}
    </>
  )
}

function Banda({ fondo, color, icono, texto, boton }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 14px', padding: '9px 16px', fontSize: 13, background: fondo, color, borderBottom: `1px solid ${C.g100}` }}>
      <span style={{ display: 'flex', gap: 7, alignItems: 'flex-start', minWidth: 0 }}><Icon name={icono} size={16} style={{ marginTop: 1 }} /><span>{texto}</span></span>
      {boton}
    </div>
  )
}

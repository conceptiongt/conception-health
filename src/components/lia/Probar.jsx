import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { C, SHADOW } from '../../lib/theme'
import { fmtQ } from '../../lib/formato'
import { etapa } from '../../lib/lia'
import { LIA_PRUEBAS_PAUSADAS } from '../../lib/constantes'
import { Card, Badge } from '../ui/Varios'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Burbuja, Escribiendo, NotaSistema } from './Comunes'

const IDEAS = [
  'Hola, ¿cuánto cuesta la consulta?',
  'Me salió algo en la piel que me pica y a veces sangra, ¿es grave?',
  '¿Tienen algo el sábado en la mañana?',
  'Mejor lo pienso y le aviso',
  '¿Aceptan seguro médico?',
  '¿Me manda la ubicación?',
  '¿Usted es un robot?',
  'Quiero cambiar mi cita para otro día',
]
const ERRORES = {
  sin_llave: 'La prueba en vivo todavía no está activada en esta cuenta. Mientras tanto puede ver la conversación de ejemplo.',
  limite: 'Llegó al límite de pruebas de hoy. Mañana puede seguir probando.',
  ocupado: 'Lía está recibiendo muchos mensajes. Intente de nuevo en un momento.',
  vacio: 'Escriba un mensaje o mande una foto.',
}
const ICONO_LOG = { agenda: 'citas', ok: 'check', hot: 'mano', warn: 'alerta', lee: 'mensaje' }
const COLOR_LOG = { agenda: [C.purple, C.purpleLight], ok: [C.green, C.greenLight], hot: [C.red, C.redLight], warn: [C.amber, C.amberLight], lee: [C.g600, C.g100] }
const espera = (ms) => new Promise(r => setTimeout(r, ms))

// Resizes a picked photo: the full image for Lía (≤1280 px) and a small preview kept with the message
function prepararFoto(file) {
  return new Promise((resolve) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const lienzo = (max) => {
        const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas')
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        return c.toDataURL('image/jpeg', 0.8)
      }
      const grande = lienzo(1280), mini = lienzo(360)
      URL.revokeObjectURL(url)
      resolve({ media_type: 'image/jpeg', data: grande.split(',')[1], miniatura: mini })
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

// "Probar a Lía": a phone where the doctor writes as a patient; Lía answers from the server with the clinic's real data
export function Probar(props) {
  if (LIA_PRUEBAS_PAUSADAS) return <PruebasPausadas nombreLia={props.nombreLia} />
  return <ProbarChat {...props} />
}

// Shown instead of the test chat while tests are paused (they use AI credits)
function PruebasPausadas({ nombreLia = 'Lía' }) {
  return (
    <div id="lia-prueba" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: '40px 24px', textAlign: 'center', boxShadow: SHADOW }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.peach, color: C.orange, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon name="telefono" size={26} /></div>
      <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Las pruebas de {nombreLia} están en pausa</div>
      <div style={{ fontSize: 14, color: C.g500, maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>Por el momento no se puede conversar con {nombreLia}. Puede revisar cómo atiende, sus ajustes y el seguimiento; las pruebas se activarán pronto.</div>
    </div>
  )
}

function ProbarChat({ nombreLia = 'Lía', medico, servicios = [], onCambio }) {
  const [conv, setConv] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [log, setLog] = useState([])
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState(null)
  const [pensando, setPensando] = useState(false)
  const [nota, setNota] = useState('')
  const [ejemplo, setEjemplo] = useState(false)
  const caja = useRef(null)
  const archivo = useRef(null)
  const cancelado = useRef(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const { data: c } = await supabase.from('lia_conversaciones').select('*').eq('prueba', true).maybeSingle()
      if (!vivo || !c) return
      const { data: m } = await supabase.from('lia_mensajes').select('*').eq('conversacion_id', c.id).order('created_at')
      if (vivo) { setConv(c); setMensajes(m || []) }
    })()
    return () => { vivo = false; cancelado.current = true }
  }, [])
  useEffect(() => { if (caja.current) caja.current.scrollTop = caja.current.scrollHeight }, [mensajes, pensando])

  const enviar = async (t = texto) => {
    const limpio = t.trim()
    if ((!limpio && !foto) || pensando || ejemplo) return
    const f = foto
    setTexto(''); setFoto(null); setNota('')
    setMensajes(p => [...p, { id: 'temp', de: 'p', texto: limpio || null, foto: f?.miniatura, created_at: new Date().toISOString() }])
    setPensando(true)
    const { data, error } = await supabase.functions.invoke('lia-responder', {
      body: { accion: 'probar', texto: limpio, foto: f ? { media_type: f.media_type, data: f.data } : undefined, miniatura: f?.miniatura },
    })
    let r = data
    if (error) { try { r = await error.context.json() } catch { r = { error: 'fallo' } } }
    setPensando(false)
    if (r?.mensajes) { setMensajes(r.mensajes); setConv(r.conversacion) }
    else setMensajes(p => p.filter(m => m.id !== 'temp'))
    if (r?.actividad?.length) setLog(p => [...p, ...r.actividad.map(a => ({ ...a, hora: new Date() }))])
    if (r?.error) setNota(ERRORES[r.error] || 'No se pudo contestar. Intente de nuevo.')
    onCambio?.()
  }

  const reiniciar = async () => {
    cancelado.current = true
    setEjemplo(false)
    await supabase.functions.invoke('lia-responder', { body: { accion: 'reiniciar' } })
    setConv(null); setMensajes([]); setLog([]); setNota('')
    onCambio?.()
  }

  const elegirFoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const f = await prepararFoto(file)
    if (!f) { setNota('No se pudo abrir esa imagen. Pruebe con una foto JPG o PNG.'); return }
    setFoto(f)
  }

  // Scripted conversation, shown when the live test is not available (nothing is saved)
  const verEjemplo = async () => {
    cancelado.current = false
    setEjemplo(true); setNota(''); setConv(null); setLog([])
    const sv = servicios.find(s => s.activo !== false && s.categoria === 'Primera consulta') || servicios[0]
    const precio = sv && Number(sv.precio) ? fmtQ(sv.precio).replace('.00', '') : 'Q400'
    const hoy = new Date(), dia = (n) => { const d = new Date(hoy); d.setDate(d.getDate() + n); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' }) }
    const guion = [
      ['p', 'Hola buenas noches, ¿cuánto cuesta la consulta?'],
      ['l', `¡Hola, buenas noches! Soy ${nombreLia}, asistente de ${medico} 🙂\nLa consulta cuesta ${precio} e incluye la revisión completa y su plan de tratamiento.`],
      ['l', '¿Qué le gustaría atender? Así le aparto el espacio adecuado.'],
      ['p', 'tengo unas manchas en la cara desde hace meses'],
      ['log', 'agenda', 'Revisó su agenda: horarios libres para primera consulta'],
      ['l', `Entiendo, eso se revisa a detalle en consulta. Tengo libre el ${dia(1)} a las 10:00 o el ${dia(2)} a las 16:30. ¿Cuál le queda mejor?`],
      ['p', 'el primero porfa'],
      ['l', '¡Perfecto! ¿Me regala su nombre completo para apartarle el espacio?'],
      ['p', 'María Fernanda López'],
      ['log', 'ok', `Apartó el ${dia(1)} a las 10:00 en su agenda`],
      ['l', `Listo, María Fernanda ✅\n*Consulta*\n${dia(1)}, 10:00\nUn día antes le escribo para confirmar. ¡Que descanse!`],
    ]
    setMensajes([])
    for (const [de, a, b] of guion) {
      if (cancelado.current) return
      if (de === 'log') { setLog(p => [...p, { tipo: a, texto: b, hora: new Date() }]); continue }
      if (de === 'l') { setPensando(true); await espera(900 + Math.min(1400, a.length * 12)); setPensando(false) } else await espera(1100)
      if (cancelado.current) return
      setMensajes(p => [...p, { id: Math.random(), de, texto: a, created_at: new Date().toISOString() }])
    }
    setEjemplo(false)
  }

  const visibles = mensajes.filter(m => !(m.de === 's' && m.interno))
  const e = conv && etapa(conv.etapa)
  const cita = conv?.prueba_cita

  return (
    <div className="lia-probar">
      <div style={{ width: '100%', maxWidth: 390, margin: '0 auto', height: 'min(680px, calc(100vh - 210px))', minHeight: 520, display: 'flex', flexDirection: 'column', borderRadius: 36, border: '10px solid #0B1120', background: '#EFEAE2', overflow: 'hidden', boxShadow: '0 40px 70px -40px rgba(11,17,32,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 14px 12px', background: '#075E54', color: '#fff' }}>
          <div style={{ width: 36, height: 36, borderRadius: 24, background: '#fff', color: '#075E54', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="lia" size={19} stroke={2} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{medico}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{pensando ? 'escribiendo…' : 'en línea'}</div>
          </div>
        </div>
        <div ref={caja} aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NotaSistema><Icon name="candado" size={12} style={{ verticalAlign: -2 }} /> Conversación de prueba. Nada sale a un paciente real.</NotaSistema>
          {visibles.length === 0 && !pensando && <NotaSistema>Escriba como si fuera un paciente. Por ejemplo: “Hola, ¿cuánto cuesta la consulta?”</NotaSistema>}
          {visibles.map(m => m.de === 's'
            ? <NotaSistema key={m.id}>{m.texto}</NotaSistema>
            : <Burbuja key={m.id} m={m} mio={m.de === 'p'} fondo={m.de === 'p' ? '#D9FDD3' : '#fff'} leido={m.de === 'p'} />)}
          {pensando && <Escribiendo />}
        </div>
        {foto && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 0', fontSize: 12.5, color: C.g600 }}>
            <img src={foto.miniatura} alt="Foto lista para mandar" style={{ height: 54, borderRadius: 8 }} />Foto lista para mandar
            <button onClick={() => setFoto(null)} aria-label="Quitar foto" style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: C.g500, display: 'flex' }}><Icon name="cerrar" size={16} /></button>
          </div>
        )}
        <form onSubmit={ev => { ev.preventDefault(); enviar() }} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', padding: 8 }}>
          <button type="button" onClick={() => archivo.current?.click()} disabled={pensando || ejemplo} aria-label="Mandar una foto" style={{ width: 42, height: 42, borderRadius: 21, border: 'none', background: '#fff', color: C.g500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="camara" size={18} /></button>
          <textarea value={texto} onChange={ev => setTexto(ev.target.value)} rows={1} disabled={ejemplo} aria-label="Mensaje como paciente"
            placeholder={ejemplo ? 'Reproduciendo el ejemplo…' : 'Escriba un mensaje'}
            onKeyDown={ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing) { ev.preventDefault(); enviar() } }}
            style={{ flex: 1, minWidth: 0, resize: 'none', border: 'none', borderRadius: 22, padding: '11px 14px', fontSize: 14.5, fontFamily: 'inherit', maxHeight: 110, background: '#fff' }} />
          <button type="submit" disabled={pensando || ejemplo || (!texto.trim() && !foto)} aria-label="Enviar" style={{ width: 42, height: 42, borderRadius: 21, border: 'none', background: '#00A884', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: pensando || ejemplo || (!texto.trim() && !foto) ? 0.5 : 1 }}><Icon name="enviar" size={18} /></button>
          <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" onChange={elegirFoto} hidden />
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" icon="refrescar" onClick={reiniciar} disabled={pensando}>Empezar de nuevo</Button>
          <Button variant="soft" icon="play" onClick={verEjemplo} disabled={pensando || ejemplo}>Ver una conversación de ejemplo</Button>
        </div>
        {nota && (
          <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12, background: C.amberLight, color: C.g700, fontSize: 13.5 }}>
            <Icon name="alerta" size={17} style={{ color: C.amber, marginTop: 1 }} />{nota}
          </div>
        )}
        <Card title={`Qué está haciendo ${nombreLia}`}>
          {log.length === 0
            ? <div style={{ fontSize: 13.5, color: C.g400 }}>Aquí verá cada paso: cuando revisa su agenda, aparta una cita o le avisa a usted.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 280, overflowY: 'auto' }}>
                {log.map((l, i) => {
                  const [color, bg] = COLOR_LOG[l.tipo] || COLOR_LOG.lee
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderTop: i ? `1px solid ${C.g100}` : 'none', fontSize: 13.5 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={ICONO_LOG[l.tipo] || 'mensaje'} size={15} /></span>
                      <span style={{ flex: 1, color: C.g700 }}>{l.texto}</span>
                      <span style={{ fontSize: 11.5, color: C.g400, whiteSpace: 'nowrap' }}>{l.hora.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )
                })}
              </div>}
        </Card>
        <Card title="Ficha del paciente">
          {!conv
            ? <div style={{ fontSize: 13.5, color: C.g400 }}>Se llena sola mientras conversa: nombre, motivo, tipo de paciente y etapa.</div>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
                {[['Nombre', conv.nombre], ['Motivo', conv.motivo || '—'], ['Etapa', <Badge color={e.color} bg={e.bg}>{e.label}</Badge>],
                  ['Cita', cita ? `${cita.servicio}, ${cita.fecha.split('-').reverse().join('/')} ${cita.hora}` : '—']].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: C.g400, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 14 }}>{v}</div>
                  </div>
                ))}
              </div>}
          {cita && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 10 }}>En la prueba la cita no se guarda en su agenda.</div>}
        </Card>
        <Card title="Ideas para probar">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {IDEAS.map(t => (
              <button key={t} onClick={() => setTexto(t)} disabled={pensando || ejemplo} style={{ fontSize: 13, padding: '7px 11px', borderRadius: 999, background: C.g50, border: `1px solid ${C.line}`, cursor: 'pointer', fontFamily: 'inherit', color: C.g700, textAlign: 'left', boxShadow: SHADOW }}>{t}</button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

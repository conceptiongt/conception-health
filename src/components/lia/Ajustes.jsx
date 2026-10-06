import { useEffect, useState } from 'react'
import { C } from '../../lib/theme'
import { fmtQ } from '../../lib/formato'
import { DIAS } from '../../lib/lia'
import { useDatos } from '../../hooks/useDatos'
import { useLia } from '../../hooks/useLia'
import { Card, Badge } from '../ui/Varios'
import { Campo, Input, Select, Textarea, Grid } from '../ui/Campos'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { toast } from '../ui/Toast'
import { Interruptor, Segmentos, Titulo, botonMini } from './Comunes'

const quitarBtn = { width: 30, height: 30, borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: C.g400, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
const agregarBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 2px', border: 'none', background: 'none', color: C.purple, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }
const DURACIONES = [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hora'], [90, '1 h 30 min'], [120, '2 horas']]

export function Ajustes({ seccion }) {
  const { cfg, set, guardar } = useLia()
  const { servicios, clinica, planActivo, ir } = useDatos()
  const nombreLia = cfg.nombre || 'Lía'
  const d = cfg.datos
  const [bloqueo, setBloqueo] = useState({ fecha: '', hasta_fecha: '', desde: '', hasta: '', motivo: '' })
  const [numero, setNumero] = useState(cfg.whatsapp?.numero || '')

  useEffect(() => {
    if (!seccion) return
    const t = setTimeout(() => document.getElementById(`lia-${seccion}`)?.scrollIntoView({ behavior: 'smooth' }), 60)
    return () => clearTimeout(t)
  }, [seccion])

  const activos = servicios.filter(s => s.activo !== false).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre, 'es'))
  const serv = (id) => cfg.servicios?.[id] || {}
  const agregarBloqueo = () => {
    if (!bloqueo.fecha) { toast.error('Elija el día del bloqueo'); return }
    if ((bloqueo.desde && !bloqueo.hasta) || (!bloqueo.desde && bloqueo.hasta) || (bloqueo.desde && bloqueo.hasta <= bloqueo.desde)) { toast.error('Revise las horas: la hora final debe ser después de la inicial'); return }
    set('bloqueos', [...(cfg.bloqueos || []), { ...bloqueo, hasta_fecha: bloqueo.hasta_fecha && bloqueo.hasta_fecha > bloqueo.fecha ? bloqueo.hasta_fecha : '' }])
    setBloqueo({ fecha: '', hasta_fecha: '', desde: '', hasta: '', motivo: '' })
  }
  const solicitarWhatsApp = async () => {
    if (numero.replace(/\D/g, '').length < 8) { toast.error('Escriba el número de WhatsApp del consultorio'); return }
    const ok = await guardar({ ...cfg, whatsapp: { estado: 'solicitado', numero: numero.trim(), solicitado_at: new Date().toISOString() } })
    if (ok) toast.success('Solicitud enviada. Todavía no está conectado: le contactaremos.')
    else toast.error('No se pudo enviar la solicitud')
  }
  const cancelarWhatsApp = async () => {
    const ok = await guardar({ ...cfg, whatsapp: { estado: 'sin_conectar', numero: '' } })
    if (ok) { setNumero(''); toast.success('Solicitud cancelada') }
    else toast.error('No se pudo cancelar la solicitud')
  }
  const wa = cfg.whatsapp?.estado || 'sin_conectar'
  const conHealth = planActivo && ['basico', 'max'].includes(clinica?.plan)

  return (
    <>
      <Titulo sub="Cómo se llama, cómo habla y cuándo atiende.">Recepcionista</Titulo>
      <Card>
        <Grid min={220}>
          <Campo label="Nombre"><Input value={cfg.nombre} onChange={v => set('nombre', v)} /></Campo>
          <Campo label="Cómo trata al paciente"><Select value={cfg.trato} onChange={v => set('trato', v)}><option value="usted">De usted</option><option value="tú">De tú</option></Select></Campo>
          <Campo label="Emojis"><Select value={cfg.emojis} onChange={v => set('emojis', v)}><option value="pocos">Pocos, con naturalidad</option><option value="no">Ninguno</option></Select></Campo>
          <Campo label="Cómo se presenta" full><Input value={cfg.presentacion} onChange={v => set('presentacion', v)} /></Campo>
          <Campo label="Cuándo atiende" full ayuda={{
            siempre: `${nombreLia} contesta todos los mensajes, a cualquier hora.`,
            fuera: `En horario de consulta contesta su equipo; ${nombreLia} toma los mensajes de noche, en almuerzo y en fin de semana.`,
            pausa: `${nombreLia} no contesta. Útil en vacaciones o si quiere atender usted.`,
          }[cfg.modo]}>
            <Segmentos valor={cfg.modo} onChange={v => set('modo', v)} opciones={[{ value: 'siempre', label: 'Siempre, 24/7' }, { value: 'fuera', label: 'Solo fuera de horario' }, { value: 'pausa', label: 'En pausa' }]} />
          </Campo>
          <Campo label="A quién contesta" full ayuda={cfg.activacion?.modo === 'palabra'
            ? `${nombreLia} solo atiende a quien escriba “${cfg.activacion.palabra || nombreLia}” (con o sin tilde, en mayúsculas o minúsculas). Los demás chats no se tocan ni se guardan: los sigue atendiendo usted desde su teléfono.`
            : `${nombreLia} contesta a todas las personas que escriben a su WhatsApp.`}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Segmentos valor={cfg.activacion?.modo || 'todos'} onChange={v => set('activacion', { palabra: cfg.activacion?.palabra || nombreLia, ...cfg.activacion, modo: v })}
                opciones={[{ value: 'todos', label: 'A todos' }, { value: 'palabra', label: 'Solo si escriben una palabra' }]} />
              {cfg.activacion?.modo === 'palabra' && <div style={{ width: 180 }}><Input value={cfg.activacion.palabra} onChange={v => set('activacion.palabra', v)} aria-label="Palabra que activa a Lía" placeholder="Lía" /></div>}
            </div>
          </Campo>
        </Grid>
      </Card>

      <Titulo sub={`Lo que ${nombreLia} contesta cuando preguntan dónde están, cómo pagar o si aceptan seguro.`}>Datos del consultorio</Titulo>
      <Card>
        <Grid min={240}>
          <Campo label="Médico"><Input value={d.doctor} onChange={v => set('datos.doctor', v)} placeholder="Ej. Dra. Ana López" /></Campo>
          <Campo label="Especialidad"><Input value={d.especialidad} onChange={v => set('datos.especialidad', v)} placeholder="Ej. Dermatología" /></Campo>
          <Campo label="Dirección" full><Input value={d.direccion} onChange={v => set('datos.direccion', v)} placeholder="Edificio, oficina, avenida, zona" /></Campo>
          <Campo label="Enlace del mapa" ayuda="Copie el enlace de Google Maps de su clínica"><Input value={d.mapa} onChange={v => set('datos.mapa', v)} placeholder="https://maps.google.com/…" /></Campo>
          <Campo label="Cómo llegar y parqueo"><Input value={d.referencias} onChange={v => set('datos.referencias', v)} /></Campo>
          <Campo label="Teléfono fijo"><Input value={d.telefono} onChange={v => set('datos.telefono', v)} /></Campo>
          <Campo label="Enlace para dejar reseña en Google"><Input value={d.resena} onChange={v => set('datos.resena', v)} /></Campo>
          <Campo label="Formas de pago"><Textarea rows={2} value={d.pagos} onChange={v => set('datos.pagos', v)} /></Campo>
          <Campo label="Seguros médicos"><Textarea rows={2} value={d.seguros} onChange={v => set('datos.seguros', v)} placeholder="Ej. Le damos factura para su reembolso" /></Campo>
          <Campo label="Indicaciones para la cita" full><Textarea rows={2} value={d.indicaciones} onChange={v => set('datos.indicaciones', v)} /></Campo>
        </Grid>
      </Card>

      <Titulo sub={`${nombreLia} usa sus tarifas: da el precio de una vez y aparta el tiempo que dura cada servicio.`} right={<button style={botonMini} onClick={() => ir('configuracion')}><Icon name="ajustes" size={14} />Editar tarifas</button>}>Servicios que agenda</Titulo>
      <Card>
        {activos.length === 0
          ? <div style={{ fontSize: 13.5, color: C.g500, lineHeight: 1.6 }}>Todavía no tiene tarifas. Agréguelas en <b>Configuración → Tarifas</b> para que {nombreLia} sepa qué ofrecer y cuánto cobrar. Mientras tanto agenda una “Consulta” de {cfg.duracion_base} minutos sin precio.</div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 620 }}>
                <thead><tr>{['Servicio', 'Precio', 'Lo ofrece', 'Duración', `Nota para ${nombreLia}`].map(h => <th key={h} style={{ textAlign: 'left', padding: '0 10px 10px 0', fontSize: 11, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {activos.map(s => (
                    <tr key={s.id} style={{ borderTop: `1px solid ${C.g100}`, opacity: serv(s.id).ofrece === false ? 0.55 : 1 }}>
                      <td style={{ padding: '10px 10px 10px 0' }}><b>{s.nombre}</b><div style={{ fontSize: 12, color: C.g400 }}>{s.categoria}</div></td>
                      <td style={{ padding: '10px 10px 10px 0', whiteSpace: 'nowrap' }}>{Number(s.precio) ? fmtQ(s.precio) : '—'}</td>
                      <td style={{ padding: '10px 10px 10px 0' }}><Interruptor id={`ofrece-${s.id}`} checked={serv(s.id).ofrece !== false} onChange={v => set(`servicios.${s.id}.ofrece`, v)} label={<span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Ofrecer {s.nombre}</span>} /></td>
                      <td style={{ padding: '10px 10px 10px 0', minWidth: 120 }}><Select value={String(serv(s.id).dur || cfg.duracion_base)} onChange={v => set(`servicios.${s.id}.dur`, Number(v))} aria-label={`Duración de ${s.nombre}`}>{DURACIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></td>
                      <td style={{ padding: '10px 0', minWidth: 200 }}><Input value={serv(s.id).nota || ''} onChange={v => set(`servicios.${s.id}.nota`, v)} placeholder="Ej. solo pacientes que ya vinieron" aria-label={`Nota de ${s.nombre}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </Card>

      <Titulo sub={`${nombreLia} solo ofrece citas dentro de este horario y nunca encima de una cita que ya existe.`}>Horario de atención</Titulo>
      <Card>
        {[1, 2, 3, 4, 5, 6, 0].map((dia, n) => {
          const turnos = cfg.horario?.[dia] || []
          return (
            <div key={dia} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: n ? `1px solid ${C.g100}` : 'none' }}>
              <b style={{ width: 92 }}>{DIAS[dia]}</b>
              <Interruptor id={`abierto-${dia}`} checked={turnos.length > 0} onChange={v => set(`horario.${dia}`, v ? [['08:00', '13:00']] : [])} label={<span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{DIAS[dia]} abierto</span>} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', flex: 1, minWidth: 220 }}>
                {turnos.length === 0 && <span style={{ fontSize: 13.5, color: C.g400 }}>Cerrado</span>}
                {turnos.map((t, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: C.g50, border: `1px solid ${C.g100}`, borderRadius: 10, padding: '3px 4px 3px 8px' }}>
                    <input type="time" value={t[0]} onChange={e => set(`horario.${dia}.${i}.0`, e.target.value)} aria-label={`${DIAS[dia]}, desde`} style={{ border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13.5 }} />–
                    <input type="time" value={t[1]} onChange={e => set(`horario.${dia}.${i}.1`, e.target.value)} aria-label={`${DIAS[dia]}, hasta`} style={{ border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13.5 }} />
                    <button style={quitarBtn} aria-label="Quitar turno" onClick={() => set(`horario.${dia}`, turnos.filter((_, j) => j !== i))}><Icon name="cerrar" size={14} /></button>
                  </span>
                ))}
                {turnos.length > 0 && turnos.length < 3 && <button style={agregarBtn} onClick={() => set(`horario.${dia}`, [...turnos, ['14:30', '18:00']])}><Icon name="mas" size={14} />Turno</button>}
              </div>
            </div>
          )
        })}
      </Card>

      <Titulo sub={`Vacaciones, congresos o un rato libre: ${nombreLia} no ofrece esos espacios.`}>Bloqueos</Titulo>
      <Card>
        {(cfg.bloqueos || []).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {cfg.bloqueos.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${C.g100}` : 'none', fontSize: 14 }}>
                <Icon name="candado" size={15} style={{ color: C.g400 }} />
                <span style={{ flex: 1 }}><b>{b.motivo || 'Bloqueo'}</b> · {b.fecha.split('-').reverse().join('/')}{b.hasta_fecha ? ` al ${b.hasta_fecha.split('-').reverse().join('/')}` : ''} · {b.desde ? `${b.desde} a ${b.hasta}` : 'todo el día'}</span>
                <button style={quitarBtn} aria-label="Quitar bloqueo" onClick={() => set('bloqueos', cfg.bloqueos.filter((_, j) => j !== i))}><Icon name="cerrar" size={15} /></button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}>
          <Campo label="Motivo"><Input value={bloqueo.motivo} onChange={v => setBloqueo(p => ({ ...p, motivo: v }))} placeholder="Ej. Congreso" /></Campo>
          <Campo label="Día"><Input type="date" value={bloqueo.fecha} onChange={v => setBloqueo(p => ({ ...p, fecha: v }))} /></Campo>
          <Campo label="Hasta el día (opcional)"><Input type="date" value={bloqueo.hasta_fecha} onChange={v => setBloqueo(p => ({ ...p, hasta_fecha: v }))} /></Campo>
          <Campo label="Desde (vacío = todo el día)"><Input type="time" value={bloqueo.desde} onChange={v => setBloqueo(p => ({ ...p, desde: v }))} /></Campo>
          <Campo label="Hasta"><Input type="time" value={bloqueo.hasta} onChange={v => setBloqueo(p => ({ ...p, hasta: v }))} /></Campo>
          <Button icon="mas" onClick={agregarBloqueo}>Agregar bloqueo</Button>
        </div>
      </Card>

      <Titulo sub={`Respuestas que ${nombreLia} da tal cual.`}>Preguntas frecuentes</Titulo>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(cfg.faq || []).map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr) 30px', gap: 8, alignItems: 'start' }}>
              <Input value={f.p} onChange={v => set(`faq.${i}.p`, v)} placeholder="Pregunta" aria-label="Pregunta" />
              <Textarea rows={1} value={f.r} onChange={v => set(`faq.${i}.r`, v)} placeholder="Respuesta" aria-label="Respuesta" />
              <button style={quitarBtn} aria-label="Quitar pregunta" onClick={() => set('faq', cfg.faq.filter((_, j) => j !== i))}><Icon name="cerrar" size={15} /></button>
            </div>
          ))}
          <div><button style={agregarBtn} onClick={() => set('faq', [...(cfg.faq || []), { p: '', r: '' }])}><Icon name="mas" size={15} />Agregar pregunta</button></div>
        </div>
      </Card>

      <div id="lia-conexiones" style={{ scrollMarginTop: 20 }}><Titulo sub="Se conectan una sola vez.">Conexiones</Titulo></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        <Card>
          <Conexion icono="mensaje" titulo="WhatsApp" estado={wa === 'conectado' ? ['Conectado', C.green, C.greenLight] : wa === 'solicitado' ? ['En proceso', C.amber, C.amberLight] : ['Sin conectar', C.g500, C.g100]} />
          <p style={{ fontSize: 13.5, color: C.g600, margin: '10px 0', lineHeight: 1.55 }}>Cuando esté conectado, {nombreLia} contesta los mensajes que llegan a su WhatsApp y usted ve cada conversación aquí.</p>
          {wa === 'sin_conectar' && <>
            <Campo label="Número de WhatsApp del consultorio" ayuda="Esto solo envía la solicitud. Conception le contacta para hacer la conexión con usted; mientras tanto Lía no contesta en WhatsApp.">
              <Input value={numero} onChange={setNumero} placeholder="+502 5555 0000" />
            </Campo>
            <Button variant="brand" style={{ marginTop: 10 }} onClick={solicitarWhatsApp}>Solicitar conexión</Button>
          </>}
          {wa === 'solicitado' && <>
            <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.55 }}>Solicitud enviada para el número <b>{cfg.whatsapp.numero}</b>. <b>Todavía no está conectado</b>: Conception le contactará para terminar la conexión.</div>
            <button style={{ ...botonMini, marginTop: 10 }} onClick={cancelarWhatsApp}>Cancelar solicitud</button>
          </>}
        </Card>
        <Card>
          <Conexion icono="citas" titulo="Google Calendar" estado={['Próximamente', C.g500, C.g100]} />
          <p style={{ fontSize: 13.5, color: C.g600, margin: '10px 0 0', lineHeight: 1.55 }}>Hoy {nombreLia} agenda en la agenda de Conception Health. Pronto podrá conectar su Google Calendar para que también respete sus eventos personales.</p>
        </Card>
        <Card>
          <Conexion icono="estetoscopio" titulo="Conception Health" estado={conHealth ? ['Incluido', C.green, C.greenLight] : ['No incluido', C.g500, C.g100]} />
          <p style={{ fontSize: 13.5, color: C.g600, margin: '10px 0 0', lineHeight: 1.55 }}>
            {conHealth ? 'Cada paciente y cada cita que agenda Lía se crean en sus pacientes, citas y cobros.' : 'Con el plan Max, cada paciente que agenda Lía llega con su expediente, cobros y reportes.'}
          </p>
          {!conHealth && <button style={{ ...botonMini, marginTop: 10 }} onClick={() => ir('suscripcion')}>Ver planes</button>}
        </Card>
      </div>

      <Titulo sub="Usted no revisa nada: le avisamos solo cuando hace falta.">Avisos para usted</Titulo>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Interruptor id="av-cita" checked={cfg.avisarme.cita} onChange={v => set('avisarme.cita', v)} label={`Cuando ${nombreLia} agenda una cita`} />
          <Interruptor id="av-doctor" checked={cfg.avisarme.doctor} onChange={v => set('avisarme.doctor', v)} label="Cuando un caso le necesita a usted" />
          <Interruptor id="av-confirma" checked={cfg.avisarme.confirma} onChange={v => set('avisarme.confirma', v)} label="Cuando un paciente confirma o cancela" />
          <Interruptor id="av-resumen" checked={cfg.avisarme.resumen} onChange={v => set('avisarme.resumen', v)} label="Resumen del día a las 7:00 a. m." />
          <Grid min={220}>
            <Campo label="Por dónde"><Select value={cfg.avisarme.canal} onChange={v => set('avisarme.canal', v)}><option value="whatsapp">WhatsApp personal</option><option value="correo">Correo</option></Select></Campo>
            {cfg.avisarme.canal === 'correo'
              ? <Campo label="Correo"><Input type="email" value={cfg.avisarme.correo} onChange={v => set('avisarme.correo', v)} /></Campo>
              : <Campo label="Su número personal"><Input value={cfg.avisarme.numero} onChange={v => set('avisarme.numero', v)} placeholder="+502 …" /></Campo>}
          </Grid>
        </div>
      </Card>
    </>
  )
}

function Conexion({ icono, titulo, estado }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: C.purpleMid, color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icono} size={18} /></span>
      <b style={{ fontSize: 15, flex: 1 }}>{titulo}</b>
      <Badge color={estado[1]} bg={estado[2]}>{estado[0]}</Badge>
    </div>
  )
}

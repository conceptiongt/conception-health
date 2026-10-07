import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { C, SHADOW } from '../../lib/theme'
import { cuando } from '../../lib/lia'
import { fmtHora, hoyISO } from '../../lib/formato'
import { estadoCita } from '../../lib/constantes'
import { useDatos } from '../../hooks/useDatos'
import { useLia } from '../../hooks/useLia'
import { Card, Badge, Stat } from '../ui/Varios'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const fechaDe = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }

export function Resumen({ irA }) {
  const { cfg, convs, avisos, recargar } = useLia()
  const { citas, pacientes } = useDatos()
  const nombreLia = cfg.nombre || 'Lía'
  const porPaciente = Object.fromEntries(pacientes.map(p => [p.id, p]))
  const hace7 = Date.now() - 7 * 864e5
  const reales = convs.filter(c => !c.prueba)
  const deLia = citas.filter(c => c.agendada_por === 'lia')
  const semana = deLia.filter(c => new Date(c.created_at).getTime() >= hace7)
  const nec = reales.filter(c => c.etapa === 'doctor' && !c.tomado)
  const activas = reales.filter(c => new Date(c.ultimo_at).getTime() >= hace7)
  const seguimiento = reales.filter(c => ['horario_ofrecido', 'sin_respuesta', 'frio', 'post'].includes(c.etapa))
  const proximas = deLia.filter(c => c.fecha >= hoyISO() && !['Cancelada', 'No asistió'].includes(c.estado)).sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || ''))).slice(0, 6)
  const wa = cfg.whatsapp?.estado || 'sin_conectar'

  // notices are marked as read after the doctor sees them
  useEffect(() => {
    const nuevos = avisos.filter(a => !a.leido).map(a => a.id)
    if (!nuevos.length) return
    const t = setTimeout(async () => { await supabase.from('lia_avisos').update({ leido: true }).in('id', nuevos); recargar() }, 2500)
    return () => clearTimeout(t)
  }, [avisos, recargar])

  return (
    <>
      {wa !== 'conectado' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 18px', borderRadius: 16, background: '#fff', border: `1px solid ${C.line}`, boxShadow: SHADOW, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: C.amberLight, color: C.amber, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="mensaje" size={19} /></div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{wa === 'solicitado' ? 'Su WhatsApp todavía no está conectado' : 'Falta conectar su WhatsApp'}</div>
            <div style={{ fontSize: 13.5, color: C.g500 }}>
              {wa === 'solicitado' ? `Recibimos su solicitud y Conception le contactará para hacer la conexión. Mientras tanto puede configurar y probar a ${nombreLia}.` : `Cuando lo conecte, ${nombreLia} empieza a contestar a sus pacientes. Mientras tanto puede configurarla y probarla.`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" icon="telefono" onClick={() => irA('probar')}>Probar a {nombreLia}</Button>
            {wa !== 'solicitado' && <Button variant="brand" onClick={() => irA('ajustes', 'conexiones')}>Conectar WhatsApp</Button>}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        <Stat icono="citas" label={`Citas que agendó ${nombreLia}`} valor={semana.length} sub="Últimos 7 días" />
        <Stat icono="mensaje" label="Conversaciones" valor={activas.length} sub="Últimos 7 días" color={C.blue} bg={C.blueLight} />
        <Stat icono="mano" label="Le necesitan a usted" valor={nec.length} sub={`Casos que ${nombreLia} le pasó`} color={nec.length ? C.red : C.g500} bg={nec.length ? C.redLight : C.g100} />
        <Stat icono="repetir" label="En seguimiento" valor={seguimiento.length} sub="Recontactos y después de consulta" color={C.amber} bg={C.amberLight} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, marginTop: 18, alignItems: 'start' }}>
        <Card title={`Lo que hizo ${nombreLia}`}>
          {avisos.length === 0
            ? <div style={{ fontSize: 13.5, color: C.g400, lineHeight: 1.6 }}>Aquí verá cada cita nueva, cada confirmación y los casos que {nombreLia} le pase. Usted se entera cuando la cita ya existe.</div>
            : <div style={{ display: 'flex', flexDirection: 'column' }}>
                {avisos.slice(0, 12).map((a, i) => {
                  const cita = a.cita_id && citas.find(c => c.id === a.cita_id)
                  const conv = a.conversacion_id && convs.find(c => c.id === a.conversacion_id)
                  const p = cita && porPaciente[cita.paciente_id]
                  const tipo = { cita: ['Nueva cita', C.green, C.greenLight, 'citas'], movida: ['Cita movida', C.purple, C.purpleLight, 'repetir'], cancelo: ['Canceló', C.g500, C.g100, 'cerrar'], doctor: ['Le necesita', C.red, C.redLight, 'mano'], confirmo: ['Confirmó', C.green, C.greenLight, 'check'] }[a.tipo]
                  const fecha = cita && fechaDe(cita.fecha)
                  return (
                    <button key={a.id} onClick={() => irA('conversaciones')} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', background: 'none', border: 'none', borderTop: i ? `1px solid ${C.g100}` : 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                      {fecha
                        ? <span style={{ width: 52, flexShrink: 0, textAlign: 'center', borderRadius: 10, background: C.purpleMid, color: C.purpleDark, padding: '6px 0' }}>
                            <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{DIAS_C[fecha.getDay()]}</span>
                            <span style={{ display: 'block', fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>{fecha.getDate()}</span>
                            <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{MESES_C[fecha.getMonth()]}</span>
                          </span>
                        : <span style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 10, background: tipo[2], color: tipo[1], display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={tipo[3]} size={20} /></span>}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Badge color={tipo[1]} bg={tipo[2]}>{tipo[0]}</Badge>
                          {!a.leido && <span title="Nuevo" style={{ width: 8, height: 8, borderRadius: 4, background: C.red }} />}
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.g400, whiteSpace: 'nowrap' }}>{cuando(a.created_at)}</span>
                        </span>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5, color: C.black, marginTop: 4 }}>{p?.nombre || conv?.nombre || '—'}</span>
                        <span style={{ display: 'block', fontSize: 13, color: C.g500 }}>{cita ? `${cita.servicio || cita.tipo || 'Cita'} · ${fmtHora(cita.hora)}` : a.texto}{cita && a.texto ? ` · ${a.texto}` : ''}</span>
                      </span>
                    </button>
                  )
                })}
              </div>}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {nec.length > 0 && (
            <Card title="Le necesitan">
              {nec.map(c => (
                <button key={c.id} onClick={() => irA('conversaciones')} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 12, border: 'none', background: C.redLight, color: C.red, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8, fontSize: 13.5 }}>
                  <Icon name="mano" size={17} style={{ marginTop: 1 }} /><span><b style={{ color: C.black }}>{c.nombre}</b><br />{c.alerta || c.motivo}</span>
                </button>
              ))}
            </Card>
          )}
          <Card title={`Próximas citas que agendó ${nombreLia}`}>
            {proximas.length === 0
              ? <div style={{ fontSize: 13.5, color: C.g400 }}>Todavía no hay citas agendadas por {nombreLia}.</div>
              : proximas.map((c, i) => {
                  const e = estadoCita(c.estado)
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${C.g100}` : 'none' }}>
                      <span style={{ fontSize: 13, color: C.g500, width: 84, flexShrink: 0 }}>{c.fecha.split('-').reverse().slice(0, 2).join('/')} · {fmtHora(c.hora)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{porPaciente[c.paciente_id]?.nombre || '—'}</b>
                        <span style={{ fontSize: 12.5, color: C.g400 }}>{c.servicio || c.tipo}</span>
                      </span>
                      <Badge color={e.color} bg={e.bg}>{c.estado}</Badge>
                    </div>
                  )
                })}
          </Card>
        </div>
      </div>
    </>
  )
}

import { C } from '../../lib/theme'
import { fmtFechaCorta, fmtHora, hoyISO } from '../../lib/formato'
import { useDatos } from '../../hooks/useDatos'
import { useLia } from '../../hooks/useLia'
import { Card, Badge } from '../ui/Varios'
import { Textarea } from '../ui/Campos'
import { Icon } from '../ui/Icon'
import { Interruptor, EtapaBadge, botonMini } from './Comunes'

const sumar = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const fechaHora = (iso) => iso ? new Date(iso).toLocaleString('es-GT', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''

export function Seguimiento({ irA }) {
  const { cfg, set, convs } = useLia()
  const { citas, pacientes } = useDatos()
  const nombreLia = cfg.nombre || 'Lía'
  const I = cfg.metodo.insistir, S = cfg.secuencias
  const porPaciente = Object.fromEntries(pacientes.map(p => [p.id, p]))
  const hoy = hoyISO()

  const colas = {
    recontacto: convs.filter(c => !c.prueba && c.seg && ['horario_ofrecido', 'sin_respuesta', 'frio'].includes(c.etapa))
      .map(c => ({ key: c.id, nombre: c.nombre, detalle: `${c.motivo || 'Sin motivo'} · recontacto ${(c.seg.paso || 0) + 1} de ${Math.min(I.max, S.recontacto.pasos.length)}`, cuando: fechaHora(c.seg.proximo), badge: <EtapaBadge v={c.etapa} />, ir: 'conversaciones' })),
    recordatorios: citas.filter(c => c.fecha >= hoy && c.fecha <= sumar(hoy, 2) && ['Pendiente', 'Confirmada'].includes(c.estado))
      .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')))
      .map(c => ({ key: c.id, nombre: porPaciente[c.paciente_id]?.nombre || '—', detalle: `${c.servicio || c.tipo || 'Cita'} · ${fmtFechaCorta(c.fecha)} ${fmtHora(c.hora)}`, badge: c.estado === 'Confirmada' ? <Badge color={C.green} bg={C.greenLight}>Confirmó</Badge> : <Badge color={C.amber} bg={C.amberLight}>Por confirmar</Badge>, ir: 'citas' })),
    despues: citas.filter(c => c.estado === 'Asistió' && c.fecha < hoy && c.fecha >= sumar(hoy, -8))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map(c => ({ key: c.id, nombre: porPaciente[c.paciente_id]?.nombre || '—', detalle: `Vino el ${fmtFechaCorta(c.fecha)} · ${c.servicio || c.tipo || 'Consulta'}`, ir: 'citas' })),
  }
  const defs = [
    ['recontacto', 'Recontactar a quien no respondió', `La mayoría no agenda en la primera conversación. ${nombreLia} retoma cada una con el nombre y el caso de la persona, hasta dejar la cita en su agenda.`, 'Pacientes en esta etapa', '{nombre} {motivo} {horario} {medico}'],
    ['recordatorios', 'Confirmar y recordar', `Para que el paciente sí llegue. Si alguien no puede venir, ${nombreLia} le ofrece otro horario y libera el espacio.`, 'Citas de los próximos días', '{nombre} {servicio} {dia} {hora} {direccion} {mapa} {medico}'],
    ['despues', 'Después de la consulta', 'El seguimiento que hace que el paciente vuelva a su control y le recomiende.', 'Pacientes que vinieron esta semana', '{nombre} {resena} {medico}'],
  ]

  return (
    <>
      {cfg.whatsapp?.estado !== 'conectado' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12, background: C.amberLight, color: C.g700, fontSize: 13.5, marginBottom: 14 }}>
          <Icon name="alerta" size={17} style={{ color: C.amber, marginTop: 1 }} />
          Estos mensajes empiezan a salir solos cuando su WhatsApp esté conectado. Ya puede dejarlos listos.
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {[['reloj', `Escribe de ${I.desde} a ${I.hasta}`], ['citas', I.domingo ? 'También en domingo' : 'Nunca en domingo'], ['repetir', `Máximo ${I.max} recontactos`], ['mano', 'Si dice que no, no vuelve a escribir']].map(([ic, t]) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '6px 11px', borderRadius: 999, background: '#fff', border: `1px solid ${C.line}`, color: C.g600 }}><Icon name={ic} size={14} />{t}</span>
        ))}
        <button style={botonMini} onClick={() => irA('metodo')}><Icon name="libro" size={14} />Cambiar reglas</button>
      </div>

      {defs.map(([k, titulo, desc, tituloCola, vars]) => (
        <Card key={k} style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
            <div style={{ padding: 22, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.black }}>{titulo}</div>
                  <div style={{ fontSize: 13.5, color: C.g500, marginTop: 4, maxWidth: '60ch', lineHeight: 1.55 }}>{desc}</div>
                </div>
                <Interruptor id={`seq-${k}`} checked={S[k].activo} onChange={v => set(`secuencias.${k}.activo`, v)} label={<span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Activar {titulo}</span>} />
              </div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, opacity: S[k].activo ? 1 : 0.5 }}>
                {S[k].pasos.map((p, i) => {
                  const fuera = k === 'recontacto' && i >= I.max
                  return (
                    <li key={i} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: 12, paddingBottom: 14, opacity: fuera ? 0.45 : 1 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 14, background: C.purpleLight, color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12.5 }}>{i + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, margin: '4px 0 6px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{p.cuando}{fuera && <Badge>No se envía: máximo {I.max}</Badge>}</div>
                        <Textarea rows={2} value={p.texto} onChange={v => set(`secuencias.${k}.pasos.${i}.texto`, v)} aria-label={p.cuando} />
                      </div>
                    </li>
                  )
                })}
              </ol>
              <div style={{ fontSize: 12.5, color: C.g400 }}>{nombreLia} cambia {vars.split(' ').map(v => <code key={v} style={{ fontSize: 11.5, background: C.g100, padding: '1px 5px', borderRadius: 5, color: C.g600, marginRight: 4 }}>{v}</code>)} por los datos de cada paciente.</div>
            </div>
            <div style={{ padding: 22, background: C.g50, borderLeft: `1px solid ${C.g100}`, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: C.g400, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{tituloCola}</div>
              {colas[k].length === 0
                ? <div style={{ fontSize: 13.5, color: C.g400 }}>Nadie en esta etapa ahora.</div>
                : colas[k].slice(0, 8).map((x, i) => (
                    <button key={x.key} onClick={() => irA(x.ir)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 12px', width: '100%', textAlign: 'left', padding: '10px 0', border: 'none', borderTop: i ? `1px solid ${C.line}` : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <b style={{ fontSize: 14, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.nombre}</b>
                      <span style={{ gridRow: '1 / 3', gridColumn: 2, alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontSize: 12, color: C.g500 }}>{x.cuando}{x.badge}</span>
                      <span style={{ fontSize: 12.5, color: C.g400 }}>{x.detalle}</span>
                    </button>
                  ))}
            </div>
          </div>
        </Card>
      ))}
    </>
  )
}

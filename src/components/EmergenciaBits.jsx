import { C } from '../lib/theme'
import { triageDe, estadoEm, minutosEntre, duracionTexto, fechaHoraGT, horaGT } from '../lib/emergencias'
import { Icon } from './ui/Icon'

// Amber reminder shown wherever a provisional patient is listed (Expedientes, patient header, Citas…) until the data is completed
export function FaltanDatos({ paciente, style }) {
  if (!paciente?.sin_identificar) return null
  return (
    <span title="Este paciente llegó sin poder identificarse: complete sus datos" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 6, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
      color: C.amber, background: C.amberLight, border: '1px solid #F2CD92', verticalAlign: 'middle', ...style,
    }}><Icon name="alerta" size={13} />Faltan datos</span>
  )
}

// «1 · Reanimación»: the number and the name always go together, the colour only reinforces
export function EtiquetaTriage({ triage, corto = false, style }) {
  const t = triageDe(triage)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '3px 10px 3px 4px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
      color: t.texto, background: t.bg, border: `1px solid ${t.color}55`, ...style,
    }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, background: t.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>{t.n}</span>
      {corto ? t.label : <>Triaje {t.n} · {t.label}</>}
    </span>
  )
}

export function EstadoEm({ estado }) {
  const e = estadoEm(estado)
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', color: e.color, background: e.bg }}>{e.label}</span>
}

// What the emergency record says, for the patient's history (Expedientes → Consultas)
export function BloqueEmergencia({ em, medico }) {
  if (!em) return null
  const espera = minutosEntre(em.llegada_at, em.atendido_at)
  const total = minutosEntre(em.llegada_at, em.cerrado_at)
  const dato = (k, v) => v ? (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontSize: 14, color: C.black, marginTop: 3, overflowWrap: 'anywhere' }}>{v}</div>
    </div>
  ) : null
  return (
    <div style={{ background: '#FFF5F6', border: '1px solid #F4C4CD', borderRadius: 14, padding: '12px 14px', marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <Icon name="emergencia" size={16} style={{ color: C.red }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.red, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Emergencia</span>
        <EtiquetaTriage triage={em.triage} />
        <EstadoEm estado={em.estado} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px 20px' }}>
        {dato('Motivo', em.motivo)}
        {dato('Acompañante', em.acompanante)}
        {dato('Médico', medico)}
        {dato('Llegó', fechaHoraGT(em.llegada_at))}
        {dato('Pasó a atención', em.atendido_at ? `${horaGT(em.atendido_at)} · espera de ${duracionTexto(espera)}` : em.cerrado_at ? 'No fue atendido' : 'Todavía no')}
        {dato('Terminó', em.cerrado_at ? `${horaGT(em.cerrado_at)} · total ${duracionTexto(total)}` : 'En curso')}
        {dato('Nota del destino', em.destino_nota)}
        {dato('Registró', em.registrado_nombre)}
      </div>
    </div>
  )
}

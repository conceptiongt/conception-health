import { C } from '../lib/theme'
import { fmtFechaCorta } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { EGRESOS, textoDias, diasIngresado } from '../hooks/useCamas'
import { colorProfesional } from '../hooks/useHospital'
import { Badge, Card } from './ui/Varios'
import { Icon } from './ui/Icon'

const camaDe = (hospital, e) => hospital.recursos.find(r => r.id === e.cama_id)
const horaCorta = (ts) => new Date(ts).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })

// «Ingresado — Cama 103» tag shown next to the patient's name while admitted
export function EtiquetaIngreso({ estancias }) {
  const { hospital } = useDatos()
  const actual = (estancias || []).find(e => !e.egreso_at)
  if (!actual) return null
  return <Badge color={C.red} bg={C.redLight}><Icon name="cama" size={13} />Ingresado — {camaDe(hospital, actual)?.nombre || 'cama'}</Badge>
}

// Expediente → «Hospitalizaciones»: current and past stays
export function Hospitalizaciones({ estancias }) {
  const { hospital, ir } = useDatos()
  if (estancias === null) return <Card title="Hospitalizaciones"><div style={{ color: C.g400, fontSize: 13.5 }}>Cargando…</div></Card>
  return (
    <Card title={`Hospitalizaciones (${estancias.length})`}>
      {estancias.length === 0 ? <div style={{ color: C.g400, fontSize: 13.5 }}>Este paciente no tiene hospitalizaciones.</div> : (
        <div>
          {estancias.map((e, i) => {
            const cama = camaDe(hospital, e), area = hospital.areas.find(a => a.id === cama?.area_id), medico = hospital.profesional(e.profesional_id)
            const actual = !e.egreso_at
            const dias = actual ? diasIngresado(e) : Math.max(0, Math.round((new Date(e.egreso_at) - new Date(e.ingreso_at)) / 86400000))
            return (
              <div key={e.id} style={{ padding: '12px 0', borderTop: i ? `1px solid ${C.g100}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <strong style={{ fontSize: 14.5 }}>{cama?.nombre || 'Cama'}{area && <span style={{ fontWeight: 400, color: C.g500 }}> · {area.nombre}</span>}</strong>
                  {actual ? <Badge color={C.red} bg={C.redLight}>Ingresado ahora</Badge> : <Badge color={C.g600} bg={C.g100}>{EGRESOS.find(x => x.value === e.egreso_tipo)?.label || 'Egreso'}</Badge>}
                  <span style={{ fontSize: 12.5, color: C.g500 }}>{actual ? textoDias(dias) : dias === 0 ? 'Mismo día' : dias === 1 ? '1 día' : `${dias} días`}</span>
                </div>
                <div style={{ fontSize: 13.5, color: C.g600, lineHeight: 1.55 }}>
                  Ingreso: {fmtFechaCorta(e.ingreso_at)} {horaCorta(e.ingreso_at)}{!actual && <> · Egreso: {fmtFechaCorta(e.egreso_at)} {horaCorta(e.egreso_at)}</>}
                  <br />Motivo: {e.motivo}
                  {medico && <><br /><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, background: colorProfesional(medico, hospital.profesionales.indexOf(medico)) }} />{medico.nombre}</span></>}
                  {e.egreso_nota && <><br />Nota de egreso: {e.egreso_nota}</>}
                </div>
                {actual && <button type="button" onClick={() => ir('camas')} style={{ marginTop: 6, border: 'none', background: 'none', padding: 0, color: 'var(--acento-fuerte)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Ver en Camas</button>}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

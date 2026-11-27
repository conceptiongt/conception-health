import { C } from '../lib/theme'
import { fechaLarga, mayuscula } from '../lib/calendario'
import { ESTADOS_CIRUGIA, fechaDe, horaDe, textoDuracion } from '../lib/quirofanos'
import { useDatos } from '../hooks/useDatos'
import { Button } from './ui/Button'
import { Badge } from './ui/Varios'
import { Icon } from './ui/Icon'

// «Cirugía programada» read-only block of a cita that has an operating-room booking: its date, time and doctor change only by re-programming.
// `liberando`: the cita is being cancelled (state change) → warns that the room is released.
export function BloqueCirugia({ cir, onReprogramar, liberando }) {
  const { hospital, perfil } = useDatos()
  const q = hospital.recursos.find(r => r.id === cir.quirofano_id)
  const medico = hospital.profesional(cir.cirujano_id), anes = hospital.profesional(cir.anestesiologo_id)
  const ini = Date.parse(cir.inicio), fin = Date.parse(cir.fin)
  const est = ESTADOS_CIRUGIA[cir.estado] || ESTADOS_CIRUGIA.programada
  const equipo = [medico && `Cirujano: ${medico.nombre}`, anes ? `Anestesiólogo: ${anes.nombre}` : 'Sin anestesiólogo', cir.ayudantes && `Ayudantes: ${cir.ayudantes}`].filter(Boolean).join(' · ')
  return (
    <div style={{ gridColumn: '1 / -1', border: `1px solid ${C.line}`, borderRadius: 16, padding: '14px 16px', background: 'rgba(246,248,253,0.85)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <Icon name="quirofano" size={17} style={{ color: C.purple }} />
        <strong style={{ fontSize: 14.5 }}>Cirugía programada: {q?.nombre || 'Quirófano'}, {horaDe(ini)}–{horaDe(fin)}</strong>
        <Badge color={est.color} bg={est.bg}>{est.label}</Badge>
      </div>
      <div style={{ fontSize: 13.5, color: C.g600, lineHeight: 1.55 }}>
        {mayuscula(fechaLarga(fechaDe(ini)))} · {textoDuracion(Math.round((fin - ini) / 60000))}{cir.limpieza_min > 0 && ` + ${cir.limpieza_min} min de limpieza`}<br />{equipo}
      </div>
      <div style={{ fontSize: 12.5, color: C.g400, marginTop: 6 }}>La fecha, la hora y el cirujano de una cirugía se cambian al reprogramarla.</div>
      {liberando && cir.estado !== 'suspendida' && (
        <div role="status" style={{ marginTop: 10, background: C.amberLight, color: C.amber, borderRadius: 12, padding: '8px 12px', fontSize: 13.5, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="alerta" size={15} />Al guardar con este estado se libera {q?.nombre || 'el quirófano'} y el equipo.
        </div>
      )}
      {perfil?.rol !== 'soporte' && <div style={{ marginTop: 10 }}><Button size="sm" variant="soft" icon="repetir" onClick={onReprogramar}>Reprogramar en Quirófanos</Button></div>}
    </div>
  )
}

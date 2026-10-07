import { C, SHADOW } from '../../lib/theme'
import { PLANES } from '../../lib/constantes'
import { useDatos } from '../../hooks/useDatos'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Titulo } from './Comunes'
import { Probar } from './Probar'

const PUNTOS = [
  ['mensaje', 'Contesta en segundos, también a las 3 a. m.', 'Con sus precios, su ubicación y el lenguaje de su especialidad. Nunca un menú de opciones.'],
  ['citas', 'Agenda sola en su agenda', 'Ofrece solo los horarios que de verdad tiene libres y aparta el espacio en cuanto el paciente elige. Sin dobles reservas.'],
  ['repetir', 'No suelta al paciente', 'Recontacta a quien no respondió, confirma la cita, recuerda para que sí llegue y da seguimiento después de la consulta.'],
]

// Lía page for accounts whose plan does not include her: what she does, a live test and the plans
export function Bloqueada() {
  const { clinica, servicios, ir } = useDatos()
  const max = PLANES.find(p => p.value === 'max'), sola = PLANES.find(p => p.value === 'lia')
  return (
    <>
      <div style={{ borderRadius: 22, padding: 1.5, background: C.grad, boxShadow: SHADOW }}>
        <div style={{ borderRadius: 21, background: '#0B1120', color: '#fff', padding: 'clamp(22px,4vw,36px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: '#A5B4FC' }}>RECEPCIONISTA VIRTUAL</div>
            <div style={{ fontSize: 'clamp(26px,3.4vw,36px)', fontWeight: 600, lineHeight: 1.08, letterSpacing: '-0.02em', margin: '10px 0 12px' }}>Lía atiende y agenda.<br />Usted no toca el teléfono.</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6, maxWidth: '52ch' }}>Recibe los mensajes que ya llegan a su WhatsApp, contesta al momento, filtra y agenda directo en su agenda. Usted se entera cuando la cita ya existe.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
              <Button variant="brand" icon="suscripcion" onClick={() => ir('suscripcion')}>Activar Lía</Button>
              <Button variant="ghost" icon="telefono" onClick={() => document.getElementById('lia-prueba')?.scrollIntoView({ behavior: 'smooth' })}>Probarla ahora</Button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PUNTOS.map(([ic, t, d]) => (
              <div key={t} style={{ display: 'flex', gap: 12 }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#C4B5FD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={ic} size={18} /></span>
                <div><div style={{ fontWeight: 700, fontSize: 14.5 }}>{t}</div><div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55, marginTop: 2 }}>{d}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginTop: 16 }}>
        {[max, sola].map(p => (
          <div key={p.value} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, boxShadow: SHADOW }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, letterSpacing: '0.14em' }}>{p.value === 'max' ? 'PLAN MAX · HEALTH + LÍA' : 'SOLO LÍA'}</div>
            <div style={{ fontSize: 26, fontWeight: 600, margin: '6px 0 10px' }}>{p.precio || 'Precio por anunciar'}</div>
            <div style={{ fontSize: 13.5, color: C.g600, lineHeight: 1.6 }}>{p.incluye.join(' · ')}</div>
          </div>
        ))}
      </div>

      <div id="lia-prueba" style={{ scrollMarginTop: 20 }}>
        <Titulo sub="Escriba como si fuera un paciente. Lía contesta con los datos y la agenda de su consultorio. En la prueba nada se guarda en su agenda.">Pruébela con su consultorio</Titulo>
      </div>
      <Probar medico={clinica?.nombre || 'Su consultorio'} servicios={servicios} />
    </>
  )
}

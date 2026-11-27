import { Desplegable } from './ui/Desplegable'

const HORAS = Array.from({ length: 24 }, (_, i) => { const v = String(i).padStart(2, '0'); return { value: v, label: v } })
const MINUTOS = Array.from({ length: 12 }, (_, i) => { const v = String(i * 5).padStart(2, '0'); return { value: v, label: v } })

// A time of day «HH:MM» chosen with the platform's own lists (never the browser's time picker)
export function CampoHora({ valor, onChange, etiqueta = 'Hora' }) {
  const [h, m] = (valor || '08:00').split(':')
  const minutos = MINUTOS.some(x => x.value === m) ? MINUTOS : [...MINUTOS, { value: m, label: m }].sort((a, b) => a.value.localeCompare(b.value))
  const caja = { width: 84, justifyContent: 'space-between', padding: '11px 12px' }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Desplegable ariaLabel={`${etiqueta} (hora)`} value={h} onChange={v => onChange(`${v}:${m}`)} options={HORAS} style={caja} />
      <span style={{ fontWeight: 600 }}>:</span>
      <Desplegable ariaLabel={`${etiqueta} (minutos)`} value={m} onChange={v => onChange(`${h}:${v}`)} options={minutos} style={caja} />
    </div>
  )
}

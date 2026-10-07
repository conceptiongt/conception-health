import { especialidad } from '../lib/especialidades'
import { Campo, Input, Select, Grid } from './ui/Campos'

// Clinical fields of the clinic's specialty for one appointment; valor = citas.datos
export function CamposEspecialidad({ esp, valor, onChange }) {
  const campos = especialidad(esp).campos
  const set = (k) => (v) => onChange({ ...valor, [k]: v })
  return (
    <Grid min={190}>
      {campos.map(c => (
        <Campo key={c.k} label={c.unidad ? `${c.label} (${c.unidad})` : c.label}>
          {c.tipo === 'opciones'
            ? <Select value={valor?.[c.k] ?? ''} onChange={set(c.k)}><option value="">—</option>{c.opciones.map(x => <option key={x}>{x}</option>)}</Select>
            : <Input type={c.tipo === 'numero' ? 'number' : 'text'} step="any" value={valor?.[c.k] ?? ''} onChange={set(c.k)} placeholder={c.ayuda} maxLength={200} />}
        </Campo>
      ))}
    </Grid>
  )
}

// Drops empty values before saving
export const limpiarDatos = (d) => Object.fromEntries(Object.entries(d || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))

import { C, GLASS } from '../../lib/theme'
import { ESPECIALIDADES, HOSPITAL, esHospital } from '../../lib/especialidades'
import { Campo } from './Campos'
import { Desplegable } from './Desplegable'

const TIPOS = [{ value: 'clinica', label: 'Clínica' }, { value: 'hospital', label: 'Hospital' }]
const OPCIONES = ESPECIALIDADES.map(e => ({ value: e.value, label: e.label }))

// Two-step choice of account type: Clínica (then its specialty from the list) or Hospital (nothing else to choose).
// `value` is the stored especialidad: '' (clinic, none chosen yet), a clinic specialty, or 'hospital'.
export function TipoCuenta({ value, onChange, ayuda }) {
  const tipo = esHospital(value) ? 'hospital' : 'clinica'
  const cambiarTipo = (t) => { if (t !== tipo) onChange(t === 'hospital' ? HOSPITAL.value : '') }
  return (
    <>
      <Campo label="Tipo de cuenta">
        <div role="group" aria-label="Tipo de cuenta" style={{ ...GLASS, display: 'flex', gap: 4, padding: 4, borderRadius: 24 }}>
          {TIPOS.map(o => {
            const activo = tipo === o.value
            return (
              <button key={o.value} type="button" className="pestana" aria-pressed={activo} onClick={() => cambiarTipo(o.value)} style={{
                flex: 1, padding: '8px 15px', borderRadius: 160, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
                fontWeight: 500, background: activo ? C.purple : 'transparent', color: activo ? C.onPurple : C.g600,
                boxShadow: activo ? '0 4px 14px var(--acento-sombra)' : 'none',
              }}>{o.label}</button>
            )
          })}
        </div>
      </Campo>
      {tipo === 'clinica'
        ? (
          <Campo label="Especialidad" ayuda={ayuda}>
            <Desplegable ariaLabel="Especialidad" value={value} onChange={onChange} options={OPCIONES} placeholder="Seleccione…" style={{ width: '100%' }} />
          </Campo>
        )
        : <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.5 }}>Cuenta para hospitales y sanatorios. Podrá organizar sus especialidades dentro de la plataforma.</div>}
    </>
  )
}

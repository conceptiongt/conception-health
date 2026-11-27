import { useMemo } from 'react'
import { C } from '../lib/theme'
import { useDatos } from '../hooks/useDatos'
import { atiendeCitas, colorProfesional } from '../hooks/useHospital'
import { citasQueChocan } from '../lib/calendario'
import { puede } from '../lib/permisos'
import { Campo } from './ui/Campos'
import { Desplegable } from './ui/Desplegable'
import { Icon } from './ui/Icon'

// «El Dr. Pérez» / «La Dra. Ruiz» / the plain name for anything else
export const fraseMedico = (nombre) => (/^dra\b/i.test(nombre) ? `La ${nombre}` : /^dr\b/i.test(nombre) ? `El ${nombre}` : nombre)

// Doctor options for an appointment: the chosen specialty's doctors first, then the rest under «Otros médicos»
export function opcionesMedico({ profesionales, departamentos, departamentoId, actualId, sinMedico = 'Sin médico asignado' }) {
  const lista = profesionales.filter(p => atiendeCitas(p) || p.id === actualId)
  const color = (p) => colorProfesional(p, profesionales.indexOf(p))
  const nombreDep = (p) => departamentos.find(d => d.id === p.departamento_id)?.nombre
  const propios = departamentoId ? lista.filter(p => p.departamento_id === departamentoId) : []
  const otros = departamentoId ? lista.filter(p => p.departamento_id !== departamentoId) : lista
  const fila = (p, grupo) => ({ value: p.id, label: `${p.nombre}${nombreDep(p) && p.departamento_id !== departamentoId ? ` · ${nombreDep(p)}` : ''}${p.tipo === 'externo' ? ' (externo)' : ''}`, punto: color(p), grupo })
  return [
    { value: '', label: sinMedico },
    ...propios.map((p, i) => fila(p, i === 0 ? 'De esta especialidad' : undefined)),
    ...otros.map((p, i) => fila(p, departamentoId && i === 0 ? 'Otros médicos' : undefined)),
  ]
}

// A hospital asks for a specialty on a new appointment only when it has at least one active specialty
export const hayEspecialidades = (hospital) => !!hospital?.departamentos?.some(d => d.activo)

// Specialty + doctor of an appointment in a hospital, right after the date / time (Registrar and CitaModal).
// valor = { departamento_id, profesional_id } · onChange(patch) merges into the form.
// Shows a live (non-blocking) warning when the chosen doctor already has an appointment at that date / time.
export function CamposHospital({ valor, onChange, fecha, hora, citas = [], citaId, duracion }) {
  const { hospital, perfil } = useDatos()
  const { departamentos, profesionales } = hospital
  const conEspecialidades = hayEspecialidades(hospital)
  const depId = valor.departamento_id || ''
  const profId = valor.profesional_id || ''
  const opcionesDep = useMemo(
    () => departamentos.filter(d => d.activo || d.id === depId).map(d => ({ value: d.id, label: d.nombre + (d.activo ? '' : ' (inactiva)') })),
    [departamentos, depId],
  )
  const opcionesProf = useMemo(
    () => opcionesMedico({ profesionales, departamentos, departamentoId: depId, actualId: profId }),
    [profesionales, departamentos, depId, profId],
  )
  const medico = profesionales.find(p => p.id === profId)
  const choques = useMemo(() => (profId && hora
    ? citasQueChocan(citas.filter(c => c.profesional_id === profId), { fecha, hora, citaId, ...(duracion ? { duracion } : {}) }) : []),
    [citas, profId, fecha, hora, citaId, duracion])

  if (!hospital.disponible) return null
  const elegirMedico = (id) => {
    const p = profesionales.find(x => x.id === id)
    const dep = departamentos.find(d => d.id === p?.departamento_id)
    // a doctor's specialty is preselected only when none is chosen yet (a chosen one is never overwritten) and only if it is active
    onChange({ profesional_id: id, ...(!depId && dep?.activo ? { departamento_id: dep.id } : {}) })
  }
  const caja = { width: '100%', justifyContent: 'space-between', padding: '11px 14px' }
  return (
    <>
      {conEspecialidades || depId ? (
        <Campo label={conEspecialidades ? 'Especialidad *' : 'Especialidad'}>
          <Desplegable ariaLabel="Especialidad" value={depId} onChange={(v) => onChange({ departamento_id: v })} options={opcionesDep} placeholder="Elija la especialidad" style={caja} />
        </Campo>
      ) : puede(perfil, 'configuracion') && (
        <div style={{ gridColumn: '1 / -1', fontSize: 13, color: C.g500, lineHeight: 1.5 }}>Cargue las especialidades en Configuración → Mi hospital.</div>
      )}
      <Campo label="Médico">
        <Desplegable ariaLabel="Médico" value={profId} onChange={elegirMedico} options={opcionesProf} style={caja} />
      </Campo>
      {medico && choques.length > 0 && (
        <div role="status" style={{ gridColumn: '1 / -1', background: C.amberLight, color: C.amber, borderRadius: 18, padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="alerta" size={17} />
          <span>{fraseMedico(medico.nombre)} ya tiene una cita a esa hora. Puede guardar de todas formas.</span>
        </div>
      )}
    </>
  )
}

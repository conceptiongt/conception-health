import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { esHospital } from '../lib/especialidades'
import { usaCirugias } from '../lib/calendario'

// Hospital structure (specialties, doctors and staff, areas and beds). Loaded once for hospital accounts (and for clinics that turned on the
// operating-room calendar) and shared through the data context as `hospital` (see App.jsx). When the tables do not exist yet (migration not
// applied) it reports `disponible: false` with empty lists, silently.
// `disponible` keeps meaning «hospital mode is ready» (specialty + doctor on appointments), so it is only true for hospital accounts;
// `tablas` is true whenever the lists could be read (also for a non-hospital clinic with the surgery calendar).

export const FUNCIONES = [
  { value: 'medico', label: 'Médico' },
  { value: 'anestesiologo', label: 'Anestesiólogo' },
  { value: 'enfermeria', label: 'Enfermería' },
  { value: 'otro', label: 'Otro' },
]
export const TIPOS_PROFESIONAL = [
  { value: 'planta', label: 'De planta' },
  { value: 'externo', label: 'Externo' },
]
export const TIPOS_AREA = [
  { value: 'quirofanos', label: 'Quirófanos', recurso: 'quirofano' },
  { value: 'encamamiento', label: 'Encamamiento', recurso: 'cama' },
  { value: 'emergencia', label: 'Emergencia', recurso: 'cubiculo' },
  { value: 'uci', label: 'UCI', recurso: 'cama' },
  { value: 'consulta', label: 'Consulta', recurso: 'consultorio' },
  { value: 'otro', label: 'Otro', recurso: 'cubiculo' },
]
export const TIPOS_RECURSO = {
  quirofano: { uno: 'quirófano', otros: 'quirófanos', nombre: 'Quirófano' },
  cama: { uno: 'cama', otros: 'camas', nombre: 'Cama' },
  cubiculo: { uno: 'cubículo', otros: 'cubículos', nombre: 'Cubículo' },
  consultorio: { uno: 'consultorio', otros: 'consultorios', nombre: 'Consultorio' },
}
// colour used for a doctor that has none chosen yet (steady per doctor)
export const COLOR_MEDICO_DEFECTO = ['#2F6BFF', '#0E9AC4', '#14998A', '#5B5BD6', '#8B5CF6', '#D98A00', '#C8304A', '#4A5D23']
export const colorProfesional = (p, i = 0) => p?.color || COLOR_MEDICO_DEFECTO[(i >= 0 ? i : 0) % COLOR_MEDICO_DEFECTO.length]
// doctors who can be assigned to an appointment
export const atiendeCitas = (p) => p.activo && (p.funcion === 'medico' || p.funcion === 'anestesiologo')
// «Dr. X» from the full name for the short labels
export const nombreCorto = (p) => {
  const partes = String(p?.nombre || '').trim().split(/\s+/)
  return partes.length > 2 ? partes.slice(0, 2).join(' ') : partes.join(' ')
}

const VACIO = { esHospital: false, disponible: false, tablas: false, cargado: true, departamentos: [], profesionales: [], areas: [], recursos: [], departamento: () => undefined, profesional: () => undefined, recargar: async () => {} }
export const HOSPITAL_VACIO = VACIO

// A missing table means the migration has not been applied
export const tablaFaltante = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache|Could not find the (table|function)/i.test(e.message || ''))

export function useCargarHospital(clinica) {
  const esHosp = !!clinica?.id && esHospital(clinica?.especialidad)
  const activo = !!clinica?.id && usaCirugias(clinica)
  const [estado, setEstado] = useState({ disponible: false, cargado: !activo, departamentos: [], profesionales: [], areas: [], recursos: [] })

  const recargar = useCallback(async () => {
    if (!activo) return
    const leer = (t) => supabase.from(t).select('*')
    const [d, p, a, r] = await Promise.all([leer('departamentos'), leer('profesionales'), leer('areas'), leer('recursos')])
    const errores = [d, p, a, r].map(x => x.error).filter(Boolean)
    if (errores.length) {
      // not applied yet (or not readable): no hospital data, no noise for the user
      if (errores.every(tablaFaltante)) { setEstado({ disponible: false, cargado: true, departamentos: [], profesionales: [], areas: [], recursos: [] }); return }
      // a transient failure never flips a loaded hospital to «not available»: keep what we had
      console.warn('Hospital: no se pudieron leer los datos', errores[0].message)
      setEstado(prev => (prev.disponible ? prev : { ...prev, cargado: true }))
      return
    }
    const porNombre = (x, y) => (x.nombre || '').localeCompare(y.nombre || '', 'es')
    setEstado({
      disponible: true, cargado: true,
      departamentos: (d.data || []).sort((x, y) => (x.orden - y.orden) || porNombre(x, y)),
      profesionales: (p.data || []).sort(porNombre),
      areas: (a.data || []).sort((x, y) => (x.orden - y.orden) || porNombre(x, y)),
      recursos: (r.data || []).sort((x, y) => (x.orden - y.orden) || (x.nombre || '').localeCompare(y.nombre || '', 'es', { numeric: true })),
    })
  }, [activo])
  // turning the surgery calendar on later: show the loading state (not «Disponible pronto») until the first read finishes
  useEffect(() => { if (activo) setEstado(prev => (prev.disponible || !prev.cargado ? prev : { ...prev, cargado: false })); recargar() }, [recargar, activo])

  return useMemo(() => {
    if (!activo) return VACIO
    const { departamentos, profesionales } = estado
    return {
      ...estado, esHospital: esHosp, tablas: estado.disponible, disponible: estado.disponible && esHosp, recargar,
      departamento: (id) => departamentos.find(x => x.id === id),
      profesional: (id) => profesionales.find(x => x.id === id),
    }
  }, [activo, esHosp, estado, recargar])
}

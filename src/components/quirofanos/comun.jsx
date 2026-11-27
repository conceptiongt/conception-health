import { useState, useEffect, useMemo } from 'react'
import { useDatos } from '../../hooks/useDatos'
import { colorProfesional, nombreCorto } from '../../hooks/useHospital'
import { fraseMedico } from '../HospitalCita'
import { estiloColor } from '../../lib/calendario'
import { horaDe, leerError, textoChoque } from '../../lib/quirofanos'

export function useMedia(consulta) {
  const [v, setV] = useState(() => window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const f = () => setV(m.matches)
    m.addEventListener('change', f); f()
    return () => m.removeEventListener('change', f)
  }, [consulta])
  return v
}

// Rooms, surgeons and anesthesiologists of the clinic with the lookups the calendar needs
export function useEquipo() {
  const { hospital, pacientes, citas } = useDatos()
  return useMemo(() => {
    const { recursos, profesionales } = hospital
    const quirofanos = recursos.filter(r => r.tipo === 'quirofano' && r.activo)
    const cirujanos = profesionales.filter(p => p.activo && p.funcion === 'medico')
    const anestesiologos = profesionales.filter(p => p.activo && p.funcion === 'anestesiologo')
    const colorDe = (id) => { const p = profesionales.find(x => x.id === id); return colorProfesional(p, profesionales.indexOf(p)) }
    const pacPorCita = (citaId) => { const c = citas.find(x => x.id === citaId); return c ? pacientes.find(p => p.id === c.paciente_id) : null }
    return {
      quirofanos, cirujanos, anestesiologos, colorDe, pacPorCita,
      quirofano: (id) => recursos.find(r => r.id === id),
      profesional: (id) => profesionales.find(p => p.id === id),
      nombreProf: (id) => profesionales.find(p => p.id === id)?.nombre || 'Médico',
      corto: (id) => { const p = profesionales.find(x => x.id === id); return p ? nombreCorto(p) : '' },
      estilo: (id) => estiloColor(colorDe(id)),
    }
  }, [hospital, pacientes, citas])
}

// «María López · Apendicectomía» for a reservation of a surgery, «Bloqueo: Mantenimiento» for a manual block
export function etiquetaReserva(r, equipo) {
  if (r.motivo === 'bloqueo') return `Bloqueo: ${r.titulo}`
  const p = equipo.pacPorCita(r.cita_id)
  return [p?.nombre, r.titulo].filter(Boolean).join(' · ') || 'Otra cirugía'
}

// A database error → the sentence the user reads. `nombres` = { quirofano, cirujano, anestesiologo } (display names of the chosen ones)
export function textoError(error, nombres = {}) {
  const { codigo, detalle } = leerError(error)
  const cuando = detalle ? ` ${textoChoque(detalle)}${detalle.titulo ? ` (${detalle.titulo})` : ''}` : ''
  switch (codigo) {
    case 'CHOQUE_QUIROFANO': return `${nombres.quirofano || 'El quirófano'} ya está ocupado${cuando || ' a esa hora'}. Elija otro horario u otro quirófano.`
    case 'CHOQUE_CIRUJANO': return `${nombres.cirujano ? fraseMedico(nombres.cirujano) : 'El cirujano'} ya está ocupado${cuando || ' a esa hora'}. Elija otro horario u otro cirujano.`
    case 'CHOQUE_ANESTESIOLOGO': return `${nombres.anestesiologo ? fraseMedico(nombres.anestesiologo) : 'El anestesiólogo'} ya está ocupado${cuando || ' a esa hora'}. Elija otro horario u otro anestesiólogo.`
    case 'FUERA_DE_SERVICIO': return 'Ese quirófano o esa cama está fuera de servicio.'
    case 'SIN_PERMISO': return 'Su usuario no puede hacer este cambio ahora (cuenta vencida o sesión de soporte).'
    case 'NO_ENCONTRADO': return 'Ya no se encontró este registro. Actualice la pantalla.'
    case 'REFERENCIA_AJENA': return 'Uno de los datos elegidos no pertenece a su clínica. Actualice la pantalla.'
    case 'DATOS_INVALIDOS': return 'Revise los datos: algo no es válido (duración, médico o quirófano).'
    case 'CIRUGIA_USAR_QUIROFANOS': return 'La fecha y la hora de una cirugía se cambian en Quirófanos, con «Reprogramar».'
    case 'ATENCION_CONFIRMADA': return 'Esta cita ya tiene la atención confirmada. Para cambiarla, primero use «Corregir».'
    case 'CIRUGIA_REALIZADA': return 'No se puede eliminar una cirugía realizada.'
    case 'PLAN': return 'Su plan no incluye este módulo.'
    case 'CAMA_OCUPADA': return 'Esa cama ya está ocupada. Elija otra cama.'
    case 'PACIENTE_INGRESADO': return 'Este paciente ya está ingresado en otra cama.'
    default: return 'No se pudo guardar. Intente de nuevo.'
  }
}
export const esChoque = (error) => /CHOQUE_/.test(error?.message || '')
export const rangoTexto = (ini, fin) => `${horaDe(ini)} – ${horaDe(fin)}`

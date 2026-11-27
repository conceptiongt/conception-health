import { supabase } from './supabase'
import { especialidad, especialidadDe } from './especialidades'

// Adds the specialty's starter services (price Q0, to be filled in Tarifas) that the clinic does not have yet
export async function cargarSugeridos(clinica, servicios = []) {
  const tiene = new Set(servicios.map(s => `${s.categoria}|${s.nombre}`.toLowerCase()))
  const filas = especialidad(clinica.especialidad).servicios
    .filter(([cat, nom]) => !tiene.has(`${cat}|${nom}`.toLowerCase()))
    .map(([categoria, nombre]) => ({ clinica_id: clinica.id, categoria, nombre, precio: 0 }))
  if (filas.length) {
    const { error } = await supabase.from('servicios').insert(filas)
    if (error) return { error, n: 0 }
  }
  await supabase.from('clinicas').update({ sugeridos_cargados: true }).eq('id', clinica.id)
  return { n: filas.length }
}

const clave = (categoria, nombre) => `${categoria}|${nombre}`.toLowerCase()

// Hospital: the suggested services of each specialty (price Q0, to be filled in Tarifas), tied to that specialty (servicios.departamento_id).
// `departamentos` are saved rows ({ id, clave, base }); `servicios` are the clinic's current services ({ id, categoria, nombre, departamento_id }).
// A service name shared by several specialties is not duplicated and is not tied to the first one: when a second specialty suggests it, it stays
// (or becomes) general (departamento_id = null) so it is offered under every specialty.
export async function cargarSugeridosDepartamentos(clinica, departamentos, servicios = []) {
  const existentes = new Map()
  for (const s of servicios) { const k = clave(s.categoria, s.nombre); existentes.set(k, [...(existentes.get(k) || []), s]) }
  const nuevas = new Map() // key -> row to insert
  const generales = new Set() // ids of existing services that become general
  for (const d of departamentos) {
    for (const [categoria, nombre] of especialidadDe(d.clave || d.base).servicios) {
      const k = clave(categoria, nombre)
      if (nuevas.has(k)) { nuevas.get(k).departamento_id = null; continue } // a second specialty suggests the same service in this load
      const ya = existentes.get(k)
      if (ya) { ya.forEach(s => { if (s.departamento_id && s.departamento_id !== d.id) generales.add(s.id) }); continue }
      nuevas.set(k, { clinica_id: clinica.id, categoria, nombre, precio: 0, departamento_id: d.id })
    }
  }
  if (generales.size) {
    const { error } = await supabase.from('servicios').update({ departamento_id: null }).in('id', [...generales])
    if (error) return { error, n: 0 }
  }
  if (!nuevas.size) return { n: 0 }
  const { error } = await supabase.from('servicios').insert([...nuevas.values()])
  return error ? { error, n: 0 } : { n: nuevas.size }
}

// How many suggested services of the active specialties the clinic does not have yet (to offer «Cargar servicios sugeridos»)
export function sugeridosFaltantes(departamentos, servicios = []) {
  const tiene = new Set(servicios.map(s => clave(s.categoria, s.nombre)))
  const faltan = new Set()
  for (const d of departamentos.filter(x => x.activo)) {
    for (const [categoria, nombre] of especialidadDe(d.clave || d.base).servicios) { const k = clave(categoria, nombre); if (!tiene.has(k)) faltan.add(k) }
  }
  return faltan.size
}

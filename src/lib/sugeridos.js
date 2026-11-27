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

// Hospital: the suggested services of each specialty (price Q0, to be filled in Tarifas), tied to that specialty (servicios.departamento_id).
// `departamentos` are saved rows ({ id, clave, base }). A service the clinic already has (same type and name, in any specialty) is not added again.
export async function cargarSugeridosDepartamentos(clinica, departamentos, servicios = []) {
  const tiene = new Set(servicios.map(s => `${s.categoria}|${s.nombre}`.toLowerCase()))
  const filas = []
  for (const d of departamentos) {
    for (const [categoria, nombre] of especialidadDe(d.clave || d.base).servicios) {
      const k = `${categoria}|${nombre}`.toLowerCase()
      if (tiene.has(k)) continue
      tiene.add(k)
      filas.push({ clinica_id: clinica.id, categoria, nombre, precio: 0, departamento_id: d.id })
    }
  }
  if (!filas.length) return { n: 0 }
  const { error } = await supabase.from('servicios').insert(filas)
  return error ? { error, n: 0 } : { n: filas.length }
}

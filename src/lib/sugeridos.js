import { supabase } from './supabase'
import { especialidad } from './especialidades'

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

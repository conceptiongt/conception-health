import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Locations, products and stock of the clinic (loaded only where inventory is used)
export function useInventario() {
  const [inv, setInv] = useState(null)
  const recargar = useCallback(async () => {
    const [s, p, e] = await Promise.all([
      supabase.from('sedes').select('*').order('nombre'),
      supabase.from('productos').select('*').order('nombre'),
      supabase.from('existencias').select('*'),
    ])
    const error = s.error || p.error || e.error
    setInv(error ? { error: error.message } : { sedes: s.data, productos: p.data, existencias: e.data })
  }, [])
  useEffect(() => { recargar() }, [recargar])
  return { inv, recargar }
}

export const existencia = (inv, sedeId, productoId) =>
  Number(inv?.existencias?.find(e => e.sede_id === sedeId && e.producto_id === productoId)?.cantidad) || 0

// Below the minimum, only where the location stocks that product (it has had movements of it)
export const bajoMinimo = (inv, sedeId, producto) =>
  Number(producto.stock_minimo) > 0 && !!inv?.existencias?.some(e => e.sede_id === sedeId && e.producto_id === producto.id) &&
  existencia(inv, sedeId, producto.id) < Number(producto.stock_minimo)

export const totalProducto = (inv, productoId) =>
  (inv?.existencias || []).filter(e => e.producto_id === productoId).reduce((n, e) => n + Number(e.cantidad), 0)

export const fmtCant = (n) => Number(n).toLocaleString('es-GT', { maximumFractionDigits: 2 })

// Friendly message for inventory errors raised by the database
export function errorInventario(error, porDefecto = 'No se pudo guardar') {
  const t = `${error?.message || ''} ${error?.hint || ''}`
  if (t.includes('SIN_EXISTENCIA')) {
    const disp = t.match(/disponible=([\d.]+)/)?.[1]
    return `No hay suficiente existencia en esa sede${disp != null ? ` (disponible: ${fmtCant(disp)})` : ''}`
  }
  if (t.includes('duplicate key') || t.includes('unique')) return 'Ya existe uno con ese nombre'
  if (t.includes('row-level security')) return 'Su plan no incluye inventario'
  return porDefecto
}

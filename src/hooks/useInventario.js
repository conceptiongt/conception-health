import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Locations, products and stock of the clinic (loaded only where inventory is used)
export function useInventario() {
  const [inv, setInv] = useState(null)
  const recargar = useCallback(async () => {
    const [s, p, e, pr, ca] = await Promise.all([
      supabase.from('sedes').select('*').order('nombre'),
      supabase.from('productos').select('*').order('nombre'),
      supabase.from('existencias').select('*'),
      supabase.from('proveedores').select('*').order('nombre'),
      supabase.from('categorias_inventario').select('*').order('nombre'),
    ])
    const error = s.error || p.error || e.error || pr.error || ca.error
    setInv(error ? { error: error.message } : { sedes: s.data, productos: p.data, existencias: e.data, proveedores: pr.data, categorias: ca.data })
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
  if (error?.code === '23503' || t.includes('foreign key')) return 'Tiene historial (movimientos u órdenes), por eso no se puede eliminar. Desactívelo: deja de aparecer y su historial se conserva.'
  if (t.includes('row-level security')) return 'Su plan no incluye inventario'
  return porDefecto
}

// Overall status of a product across the active locations
export function estadoProducto(inv, sedes, p) {
  const total = sedes.reduce((n, s) => n + existencia(inv, s.id, p.id), 0)
  if (total <= 0) return { clave: 'agotado', label: 'Agotado', color: '#C23B3B', bg: '#FCEDED', total }
  if (sedes.some(s => bajoMinimo(inv, s.id, p))) return { clave: 'bajo', label: 'Reabastecer', color: '#9A6200', bg: '#FDF5E4', total }
  return { clave: 'ok', label: 'En existencia', color: '#1F7A4D', bg: '#E9F6EF', total }
}

// What the stock is worth (cost × quantity), optionally for one location
export const valorInventario = (inv, sedeId) =>
  (inv?.existencias || []).filter(e => !sedeId || e.sede_id === sedeId)
    .reduce((n, e) => n + Number(e.cantidad) * (Number(inv.productos.find(p => p.id === e.producto_id)?.costo) || 0), 0)

// Locations below their minimum. Suggested order: up to the product's maximum (min/max rule, like Odoo),
// or twice the minimum when no maximum is set. `enCamino` = quantities already ordered and not yet received.
export function porReabastecer(inv, sedes, productos, enCamino = {}) {
  const filas = []
  for (const s of sedes) for (const p of productos) {
    if (!bajoMinimo(inv, s.id, p)) continue
    const hay = existencia(inv, s.id, p.id), min = Number(p.stock_minimo)
    const tope = Number(p.stock_maximo) > min ? Number(p.stock_maximo) : min * 2
    const pedido = enCamino[s.id + '|' + p.id] || 0
    filas.push({ sede: s, producto: p, hay, min, tope, pedido, sugerido: Math.max(0, Math.ceil(tope - hay - pedido)) })
  }
  return filas.sort((a, b) => a.hay / a.min - b.hay / b.min)
}

// Received lots with an expiry date in the next `dias` days (or already expired) where there is still stock
export function porVencer(inv, movimientos, dias = 60) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const limite = new Date(hoy); limite.setDate(limite.getDate() + dias)
  return (movimientos || [])
    .filter(m => m.tipo === 'entrada' && m.vence && new Date(m.vence + 'T00:00') <= limite && existencia(inv, m.sede_id, m.producto_id) > 0)
    .map(m => ({ ...m, dias: Math.round((new Date(m.vence + 'T00:00') - hoy) / 86400000) }))
    .sort((a, b) => a.dias - b.dias)
}

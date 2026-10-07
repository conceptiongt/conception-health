import { useState, useRef, useEffect } from 'react'
import { C } from '../../lib/theme'
import { existencia, fmtCant } from '../../hooks/useInventario'
import { Icon } from '../ui/Icon'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { toast } from '../ui/Toast'
import { supabase } from '../../lib/supabase'

// Offered as one-click suggestions while the clinic has no categories yet
export const CATEGORIAS_BASE = ['Insumos', 'Medicamentos', 'Equipo']

export const categoriasDe = (inv) => (inv?.categorias || []).map(c => c.nombre).sort((a, b) => a.localeCompare(b, 'es'))

const quitarTildes = (t = '') => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// "Insumo", "insumos " and "INSUMOS" are the same category
export const mismaCategoria = (a, b) => {
  const n = (t) => quitarTildes(t).trim().replace(/\s+/g, ' ').replace(/(es|s)$/, '')
  return n(a) === n(b)
}
const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1)

const chipStyle = (activo) => ({
  padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${activo ? C.purple : C.g200}`, background: activo ? C.purpleLight : '#fff', color: activo ? C.purple : C.g600,
})

// Type to search a product; category chips underneath narrow the list. Shows the stock of `sedeId` when given.
export function BuscadorProducto({ productos, valor, onChange, inv, sedeId, soloConExistencia, placeholder = 'Escriba el nombre del producto…' }) {
  const elegido = productos.find(p => p.id === valor)
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [categoria, setCategoria] = useState('')
  const [marcado, setMarcado] = useState(0)
  const caja = useRef(null)
  const input = useRef(null)

  useEffect(() => {
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  const hay = (p) => sedeId ? existencia(inv, sedeId, p.id) : null
  const categorias = [...new Set(productos.filter(p => p.categoria).map(p => p.categoria))].sort((a, b) => a.localeCompare(b, 'es'))
  const q = quitarTildes(texto.trim())
  const lista = productos
    .filter(p => (!categoria || p.categoria === categoria) && (!q || quitarTildes(p.nombre).includes(q) || quitarTildes(p.categoria).includes(q)))
    .sort((a, b) => (soloConExistencia ? (hay(b) > 0) - (hay(a) > 0) : 0) || a.nombre.localeCompare(b.nombre, 'es'))

  const elegir = (p) => {
    if (soloConExistencia && !(hay(p) > 0)) return
    onChange(p.id); setTexto(''); setAbierto(false)
  }
  const teclas = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setMarcado(m => Math.min(m + 1, lista.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado(m => Math.max(m - 1, 0)) }
    else if (e.key === 'Enter' && abierto && lista[marcado]) { e.preventDefault(); elegir(lista[marcado]) }
    else if (e.key === 'Escape' && abierto) { e.stopPropagation(); setAbierto(false) }
  }

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      {elegido && !abierto ? (
        <button type="button" onClick={() => { setAbierto(true); setTimeout(() => input.current?.focus(), 0) }} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 10, border: `1px solid ${C.g200}`,
          background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}>
          <Icon name="caja" size={16} style={{ color: C.purple }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: C.black }}>{elegido.nombre}</span>
            <span style={{ fontSize: 12.5, color: C.g400 }}>{elegido.categoria ? ` · ${elegido.categoria}` : ''}</span>
          </span>
          {sedeId && <span style={{ fontSize: 12.5, color: C.g500, whiteSpace: 'nowrap' }}>hay {fmtCant(hay(elegido))} {elegido.unidad}</span>}
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.purple }}>Cambiar</span>
        </button>
      ) : (
        <div style={{ position: 'relative' }}>
          <Icon name="buscar" size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.g400 }} />
          <input ref={input} value={texto} placeholder={placeholder} onFocus={() => setAbierto(true)} onKeyDown={teclas}
            onChange={e => { setTexto(e.target.value); setAbierto(true); setMarcado(0) }}
            style={{ width: '100%', padding: '11px 13px 11px 36px', border: `1px solid ${C.g200}`, borderRadius: 10, fontSize: 14, color: C.black, background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
      )}

      {abierto && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 20, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 14px 40px rgba(11,17,32,0.16)', overflow: 'hidden' }}>
          {categorias.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', borderBottom: `1px solid ${C.g100}`, background: C.g50 }}>
              <button type="button" onClick={() => { setCategoria(''); setMarcado(0) }} style={chipStyle(!categoria)}>Todas</button>
              {categorias.map(c => <button type="button" key={c} onClick={() => { setCategoria(c === categoria ? '' : c); setMarcado(0) }} style={chipStyle(categoria === c)}>{c}</button>)}
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {lista.length === 0 ? <div style={{ padding: '14px 14px', color: C.g400, fontSize: 13.5 }}>Ningún producto coincide{texto ? ` con «${texto}»` : ''}</div>
              : lista.map((p, i) => {
                const n = hay(p), sinStock = soloConExistencia && !(n > 0)
                return (
                  <button type="button" key={p.id} onMouseEnter={() => setMarcado(i)} onClick={() => elegir(p)} disabled={sinStock} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', borderTop: i ? `1px solid ${C.g100}` : 'none',
                    background: i === marcado && !sinStock ? C.purpleMid : '#fff', cursor: sinStock ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'inherit', opacity: sinStock ? 0.5 : 1,
                  }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: C.black }}>{p.nombre}</span>
                      <span style={{ fontSize: 12, color: C.g400 }}>{p.categoria || 'Sin categoría'}</span>
                    </span>
                    {n != null && <span style={{ fontSize: 12.5, fontWeight: 700, color: n > 0 ? C.g600 : C.red, whiteSpace: 'nowrap' }}>{n > 0 ? `hay ${fmtCant(n)} ${p.unidad}` : 'sin existencia'}</span>}
                    {p.id === valor && <Icon name="check" size={15} style={{ color: C.purple }} />}
                  </button>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// Category of a product: pick one, or create a new one (saved for the whole clinic)
export function ElegirCategoria({ valor, onChange, inv, onCreada, onAdministrar }) {
  const [nueva, setNueva] = useState(false)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const lista = categoriasDe(inv)
  const crear = async (nombre) => {
    const t = capital((nombre ?? texto).trim().replace(/\s+/g, ' '))
    if (!t) { setNueva(false); return }
    const parecida = lista.find(c => mismaCategoria(c, t))
    if (parecida) { onChange(parecida); setTexto(''); setNueva(false); if (parecida !== t) toast.success(`Ya existe «${parecida}»; se usó esa`); return }
    setBusy(true)
    const { error } = await supabase.from('categorias_inventario').insert({ nombre: t })
    setBusy(false)
    if (error) { toast.error('No se pudo crear la categoría'); return }
    await onCreada?.()
    onChange(t); setTexto(''); setNueva(false)
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {lista.map(c => <button type="button" key={c} onClick={() => onChange(valor === c ? '' : c)} style={chipStyle(valor === c)}>{c}</button>)}
      {lista.length === 0 && !nueva && CATEGORIAS_BASE.map(c => (
        <button type="button" key={c} onClick={() => crear(c)} disabled={busy} title="Crear esta categoría" style={{ ...chipStyle(false), borderStyle: 'dashed' }}>+ {c}</button>
      ))}
      {nueva ? (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder="Nombre de la categoría"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crear() } if (e.key === 'Escape') { e.stopPropagation(); setNueva(false) } }}
            style={{ padding: '6px 12px', borderRadius: 160, border: `1px solid ${C.purple}`, fontSize: 12.5, width: 170, fontFamily: 'inherit' }} />
          <button type="button" onClick={() => crear()} disabled={busy} style={{ ...chipStyle(true), padding: '6px 12px' }}>Agregar</button>
        </span>
      ) : (
        <button type="button" onClick={() => setNueva(true)} style={{ ...chipStyle(false), borderStyle: 'dashed', color: C.purple }}>+ Nueva categoría</button>
      )}
      {onAdministrar && lista.length > 0 && <button type="button" onClick={onAdministrar} style={{ border: 'none', background: 'none', color: C.g500, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>Editar categorías</button>}
    </div>
  )
}

// Manage categories: rename, merge duplicates, delete, add
export function CategoriasModal({ inv, onClose, onCambio }) {
  const [editando, setEditando] = useState(null) // { id, nombre }
  const [nueva, setNueva] = useState('')
  const [busy, setBusy] = useState(false)
  const cats = [...(inv.categorias || [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const usos = (c) => inv.productos.filter(p => p.categoria === c.nombre).length
  // Among repeated categories, keep the one with more products (or the one written with a capital letter)
  const preferida = (grupo) => [...grupo].sort((x, y) => usos(y) - usos(x) || (/^[A-ZÁÉÍÓÚÑ]/.test(y.nombre) - /^[A-ZÁÉÍÓÚÑ]/.test(x.nombre)) || x.nombre.length - y.nombre.length)[0]
  const dobles = (c) => {
    const grupo = cats.filter(o => mismaCategoria(o.nombre, c.nombre))
    const destino = preferida(grupo)
    return grupo.length > 1 && destino.id !== c.id ? [destino] : []
  }

  const renombrar = async (c, nombre) => {
    const t = capital(nombre.trim().replace(/\s+/g, ' '))
    if (!t || t === c.nombre) { setEditando(null); return }
    const destino = cats.find(o => o.id !== c.id && o.nombre.toLowerCase() === t.toLowerCase())
    if (destino && !confirm(`Ya existe «${destino.nombre}». ¿Unir «${c.nombre}» con «${destino.nombre}»? Sus ${usos(c)} productos pasan a «${destino.nombre}».`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('categoria_renombrar', { p_id: c.id, p_nombre: destino ? destino.nombre : t })
    setBusy(false)
    if (error) { toast.error('No se pudo cambiar'); return }
    toast.success(data === 'unida' ? 'Categorías unidas' : 'Categoría actualizada')
    setEditando(null); onCambio()
  }
  const unir = async (c, destino) => {
    if (!confirm(`¿Unir «${c.nombre}» con «${destino.nombre}»? Sus ${usos(c)} productos pasan a «${destino.nombre}» y «${c.nombre}» desaparece.`)) return
    setBusy(true)
    const { error } = await supabase.rpc('categoria_renombrar', { p_id: c.id, p_nombre: destino.nombre })
    setBusy(false)
    if (error) { toast.error('No se pudo unir'); return }
    toast.success('Categorías unidas'); onCambio()
  }
  const eliminar = async (c) => {
    const n = usos(c)
    if (!confirm(n ? `¿Eliminar «${c.nombre}»? Sus ${n} productos se quedan, solo que sin categoría.` : `¿Eliminar «${c.nombre}»?`)) return
    setBusy(true)
    const { error } = await supabase.rpc('categoria_eliminar', { p_id: c.id })
    setBusy(false)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Categoría eliminada'); onCambio()
  }
  const agregar = async () => {
    const t = capital(nueva.trim().replace(/\s+/g, ' '))
    if (!t) return
    const parecida = cats.find(c => mismaCategoria(c.nombre, t))
    if (parecida) { toast.error(`Ya existe «${parecida.nombre}»`); return }
    setBusy(true)
    const { error } = await supabase.from('categorias_inventario').insert({ nombre: t })
    setBusy(false)
    if (error) { toast.error('No se pudo crear'); return }
    setNueva(''); onCambio()
  }

  return (
    <Modal title="Categorías" subtitle="Cambie el nombre, una las repetidas o elimine las que no use" onClose={onClose} maxWidth={620}>
      {cats.length === 0 && <div style={{ color: C.g400, marginBottom: 14 }}>Aún no hay categorías.</div>}
      <div style={{ border: cats.length ? `1px solid ${C.line}` : 'none', borderRadius: 16, overflow: 'hidden' }}>
        {cats.map((c, i) => {
          const parecidas = dobles(c)
          return (
            <div key={c.id} style={{ padding: '12px 16px', borderTop: i ? `1px solid ${C.g100}` : 'none' }}>
              {editando?.id === c.id ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input autoFocus value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') renombrar(c, editando.nombre); if (e.key === 'Escape') { e.stopPropagation(); setEditando(null) } }}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.purple}`, fontSize: 14, fontFamily: 'inherit' }} />
                  <Button size="sm" onClick={() => renombrar(c, editando.nombre)} disabled={busy}>Guardar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 500 }}>{c.nombre}</div>
                    <div style={{ fontSize: 12.5, color: C.g500 }}>{usos(c)} {usos(c) === 1 ? 'producto' : 'productos'}</div>
                  </div>
                  <Button size="sm" variant="ghost" icon="editar" onClick={() => setEditando({ id: c.id, nombre: c.nombre })}>Cambiar nombre</Button>
                  <Button size="sm" variant="danger" icon="eliminar" onClick={() => eliminar(c)} disabled={busy}>Eliminar</Button>
                </div>
              )}
              {parecidas.length > 0 && editando?.id !== c.id && (
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: C.amberLight, color: C.amber, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  Parece repetida con «{parecidas[0].nombre}».
                  <button onClick={() => unir(c, parecidas[0])} disabled={busy} style={{ border: 'none', background: 'none', color: C.amber, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Unirla con «{parecidas[0].nombre}»</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input value={nueva} onChange={e => setNueva(e.target.value)} placeholder="Nueva categoría (ej. Medicamentos)" onKeyDown={e => { if (e.key === 'Enter') agregar() }}
          style={{ flex: 1, padding: '10px 13px', borderRadius: 6, border: `1px solid ${C.g200}`, fontSize: 14, fontFamily: 'inherit' }} />
        <Button icon="mas" onClick={agregar} disabled={busy || !nueva.trim()}>Agregar</Button>
      </div>
    </Modal>
  )
}

import { useState, useRef, useEffect } from 'react'
import { C } from '../../lib/theme'
import { existencia, fmtCant } from '../../hooks/useInventario'
import { Icon } from '../ui/Icon'

// Suggested until the clinic creates its own
export const CATEGORIAS_BASE = ['Insumos', 'Medicamentos', 'Equipo']

export function categoriasDe(productos) {
  const usadas = [...new Set(productos.filter(p => p.categoria).map(p => p.categoria.trim()))]
  return [...new Set([...usadas, ...CATEGORIAS_BASE])].sort((a, b) => a.localeCompare(b, 'es'))
}

const quitarTildes = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

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

// Category of a product: pick an existing one or create a new one by hand
export function ElegirCategoria({ valor, onChange, categorias }) {
  const [nueva, setNueva] = useState(false)
  const [texto, setTexto] = useState('')
  const lista = [...new Set([...categorias, ...(valor ? [valor] : [])])].sort((a, b) => a.localeCompare(b, 'es'))
  const crear = () => {
    const t = texto.trim()
    if (!t) { setNueva(false); return }
    const existente = lista.find(c => quitarTildes(c) === quitarTildes(t))
    onChange(existente || t.charAt(0).toUpperCase() + t.slice(1)); setTexto(''); setNueva(false)
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {lista.map(c => <button type="button" key={c} onClick={() => onChange(valor === c ? '' : c)} style={chipStyle(valor === c)}>{c}</button>)}
      {nueva ? (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} placeholder="Nueva categoría"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crear() } if (e.key === 'Escape') { e.stopPropagation(); setNueva(false) } }}
            style={{ padding: '6px 10px', borderRadius: 20, border: `1px solid ${C.purple}`, fontSize: 12.5, width: 150, fontFamily: 'inherit' }} />
          <button type="button" onClick={crear} style={{ ...chipStyle(true), padding: '6px 10px' }}>Agregar</button>
        </span>
      ) : (
        <button type="button" onClick={() => setNueva(true)} style={{ ...chipStyle(false), borderStyle: 'dashed', color: C.purple }}>+ Nueva categoría</button>
      )}
    </div>
  )
}

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C, GLASS, SHADOW_HOVER } from '../../lib/theme'
import { filtroStyle } from './Campos'
import { Icon } from './Icon'

const MARGEN = 8   // minimum distance to the viewport edges
const ALTO = 320   // tallest the list grows before it scrolls
const sinTildes = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Optional per-option extras: `punto` (a colour dot before the label) and `grupo` (a small heading shown above the row, set on the first row of a group)
const Punto = ({ color }) => <span aria-hidden="true" style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, background: color, marginRight: 8, verticalAlign: 0 }} />

// In-platform replacement for a filter <select>: pill button + list drawn by the app (not the operating system).
// The list lives in <body> with fixed position, so tables never clip it and it opens above windows.
export function Desplegable({ value, onChange, options, ariaLabel, disabled = false, style, placeholder }) {
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0) // option highlighted by keyboard or pointer
  const [pos, setPos] = useState(null)
  const boton = useRef(null)
  const lista = useRef(null)
  const escrito = useRef({ texto: '', hora: 0 }) // type-ahead buffer
  const id = useId()
  const indice = options.findIndex(o => o.value === value)
  const elegido = Math.max(0, indice)
  const sinElegir = indice < 0 && placeholder != null // nothing chosen yet: the pill shows the placeholder
  const visible = abierto && !disabled

  const abrir = (i = elegido) => { setActivo(i); setPos(null); setAbierto(true) }
  const cerrar = (devolverFoco = true) => {
    setAbierto(false)
    if (devolverFoco) boton.current?.focus({ preventScroll: true })
  }
  const elegir = (i) => { cerrar(); if (options[i] && options[i].value !== value) onChange(options[i].value) }

  // Place the list under the button, or above when there is more room there; never past the viewport edges
  useLayoutEffect(() => {
    if (!visible) return
    const colocar = (e) => {
      const b = boton.current, l = lista.current
      if (!b || !l || (e && e.target === l)) return
      const r = b.getBoundingClientRect()
      const vw = document.documentElement.clientWidth, vh = window.innerHeight
      if (r.bottom < 0 || r.top > vh) { setAbierto(false); return }
      const minimo = Math.min(r.width, vw - MARGEN * 2)
      l.style.minWidth = `${minimo}px` // applied before measuring
      const ancho = l.offsetWidth
      const abajo = vh - r.bottom - MARGEN - 6, encima = r.top - MARGEN - 6
      const sube = abajo < Math.min(l.scrollHeight + 2, ALTO) && encima > abajo
      setPos({
        left: Math.max(MARGEN, Math.min(r.left, vw - MARGEN - ancho)),
        minWidth: minimo,
        maxHeight: Math.max(80, Math.min(ALTO, sube ? encima : abajo)),
        ...(sube ? { bottom: vh - r.top + 6 } : { top: r.bottom + 6 }),
      })
    }
    colocar()
    window.addEventListener('resize', colocar)
    window.addEventListener('scroll', colocar, true)
    return () => { window.removeEventListener('resize', colocar); window.removeEventListener('scroll', colocar, true) }
  }, [visible, options.length])

  // Focus moves to the list once it is placed
  const colocada = pos != null
  useEffect(() => { if (visible && colocada) lista.current?.focus({ preventScroll: true }) }, [visible, colocada])
  // Keep the highlighted option in view inside the list (without scrolling the page)
  useEffect(() => {
    const l = lista.current
    const o = l?.children[activo]
    if (!visible || !o) return
    if (o.offsetTop < l.scrollTop) l.scrollTop = o.offsetTop - 6
    else if (o.offsetTop + o.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = o.offsetTop + o.offsetHeight - l.clientHeight + 6
  }, [visible, colocada, activo])
  // Clicking or tapping outside closes the list
  useEffect(() => {
    if (!visible) return
    const fuera = (e) => { if (!boton.current?.contains(e.target) && !lista.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('pointerdown', fuera, true)
    return () => document.removeEventListener('pointerdown', fuera, true)
  }, [visible])

  // Typing letters jumps to the next option that starts with them
  const buscarLetra = (letra, desde) => {
    const ahora = Date.now()
    const e = escrito.current
    e.texto = (ahora - e.hora < 600 ? e.texto : '') + sinTildes(letra)
    e.hora = ahora
    const inicio = e.texto.length > 1 ? desde : desde + 1
    for (let k = 0; k < options.length; k++) {
      const i = (inicio + k) % options.length
      if (sinTildes(options[i].label).startsWith(e.texto)) return i
    }
    return desde
  }
  const esLetra = (e) => e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey

  // Enter and Space open the list through the button's native click
  const teclaBoton = (e) => {
    if (visible) return
    const destino = { ArrowDown: elegido, ArrowUp: elegido, Home: 0, End: options.length - 1 }[e.key]
    if (destino != null) { e.preventDefault(); abrir(destino) }
    else if (esLetra(e)) { e.preventDefault(); abrir(buscarLetra(e.key, elegido)) }
  }
  const teclaLista = (e) => {
    const ultimo = options.length - 1
    const destino = { ArrowDown: Math.min(ultimo, activo + 1), ArrowUp: Math.max(0, activo - 1), Home: 0, End: ultimo }[e.key]
    if (destino != null) { e.preventDefault(); setActivo(destino) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(activo) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar() } // the window behind stays open
    else if (e.key === 'Tab') cerrar() // focus returns to the button, then Tab moves on from there
    else if (esLetra(e)) { e.preventDefault(); setActivo(buscarLetra(e.key, activo)) }
  }

  return (
    <>
      <button
        ref={boton} type="button" className="desplegable-btn" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={visible} aria-controls={visible ? id : undefined}
        aria-label={`${ariaLabel}: ${sinElegir ? placeholder : options[elegido]?.label ?? ''}`}
        onClick={() => (visible ? cerrar() : abrir())} onKeyDown={teclaBoton}
        style={{ ...filtroStyle, display: 'inline-flex', alignItems: 'center', gap: 10, maxWidth: '100%', textAlign: 'left', cursor: disabled ? 'default' : 'pointer', ...style }}
      >
        {/* every label shares one cell, so the pill keeps the width of the longest one */}
        <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', flex: 1, minWidth: 0 }}>
          {options.map((o, i) => (
            <span key={o.value} aria-hidden={i !== elegido || sinElegir} style={{ gridArea: '1 / 1', visibility: i === elegido && !sinElegir ? 'visible' : 'hidden', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.punto && <Punto color={o.punto} />}{o.label}</span>
          ))}
          {sinElegir && <span style={{ gridArea: '1 / 1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.g400 }}>{placeholder}</span>}
        </span>
        <span style={{ display: 'inline-flex', flexShrink: 0, color: C.g500, transform: visible ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}><Icon name="abajo" size={15} /></span>
      </button>
      {visible && createPortal(
        <ul
          ref={lista} id={id} role="listbox" tabIndex={-1} aria-label={ariaLabel} aria-activedescendant={`${id}-${activo}`}
          className="desplegable-lista" onKeyDown={teclaLista}
          style={{
            ...GLASS, background: 'rgba(255,255,255,0.96)', border: `1px solid ${C.line}`, boxShadow: SHADOW_HOVER,
            position: 'fixed', zIndex: 900, margin: 0, padding: 6, listStyle: 'none', borderRadius: 16, overflowY: 'auto', overscrollBehavior: 'contain',
            width: 'max-content', maxWidth: `calc(100vw - ${MARGEN * 2}px)`, outline: 'none',
            ...(pos || { top: 0, left: 0, visibility: 'hidden' }),
          }}
        >
          {options.map((o, i) => (
            <li
              key={o.value} id={`${id}-${i}`} role="option" aria-selected={i === elegido && !sinElegir}
              onPointerMove={() => i !== activo && setActivo(i)} onMouseDown={e => e.preventDefault()} onClick={() => elegir(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: i === elegido && !sinElegir ? 600 : 400, color: i === elegido && !sinElegir ? 'var(--acento-fuerte)' : C.black, background: i === activo ? C.purpleMid : 'transparent' }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                {o.grupo && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.g400, marginBottom: 3 }}>{o.grupo}</span>}
                {o.punto && <Punto color={o.punto} />}{o.label}
              </span>
              <span style={{ display: 'inline-flex', width: 15, visibility: i === elegido && !sinElegir ? 'visible' : 'hidden' }}><Icon name="check" size={15} /></span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  )
}

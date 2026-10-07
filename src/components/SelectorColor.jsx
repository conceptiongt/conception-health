import { useRef, useState, useEffect } from 'react'
import { C, valido } from '../lib/theme'

// ─── conversions ───
const hexARgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const rgbAHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
function rgbAHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max }
}
function hsvARgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

export const COLORES_SUGERIDOS = ['#1F5F5B', '#2F4B7C', '#2E6B8A', '#4A5D23', '#7A2E3B', '#8C5A2B', '#5B4A8B', '#3D3D3D']

// Pick any color: drag the dot over the square, move the hue bar, or type the code (hex or RGB)
export function SelectorColor({ valor, onChange }) {
  const [hsv, setHsv] = useState(() => rgbAHsv(...hexARgb(valido(valor) ? valor : '#1F5F5B')))
  const [texto, setTexto] = useState(valor || '')
  const caja = useRef(null)
  const hex = rgbAHex(...hsvARgb(hsv.h, hsv.s, hsv.v))
  const [r, g, b] = hexARgb(hex)

  useEffect(() => { // keep in sync when the value changes from outside (suggested colors, reset)
    if (valido(valor) && valor.toUpperCase() !== hex) { setHsv(rgbAHsv(...hexARgb(valor))); setTexto(valor.toUpperCase()) }
  }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps

  const emitir = (n) => { setHsv(n); const h = rgbAHex(...hsvARgb(n.h, n.s, n.v)); setTexto(h); onChange(h) }
  const mover = (e) => {
    const rect = caja.current.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    emitir({ ...hsv, s, v })
  }
  const arrastrar = (e) => {
    e.preventDefault(); mover(e)
    const mv = (ev) => mover(ev), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  const deRgb = (i, val) => { const c = [r, g, b]; c[i] = Math.max(0, Math.min(255, Number(val) || 0)); emitir(rgbAHsv(...c)) }
  const deHex = (t) => { setTexto(t); const h = t.startsWith('#') ? t : '#' + t; if (valido(h)) { setHsv(rgbAHsv(...hexARgb(h))); onChange(h.toUpperCase()) } }
  const campo = { width: '100%', padding: '7px 9px', borderRadius: 8, border: `1px solid ${C.g200}`, fontFamily: 'inherit', fontSize: 13 }

  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ width: 240 }}>
        <div ref={caja} onPointerDown={arrastrar} style={{
          position: 'relative', height: 160, borderRadius: 16, cursor: 'crosshair', touchAction: 'none',
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
        }}>
          <span style={{ position: 'absolute', left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, width: 16, height: 16, marginLeft: -8, marginTop: -8, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.35)', background: hex, pointerEvents: 'none' }} />
        </div>
        <input type="range" min="0" max="359" value={Math.round(hsv.h)} onChange={e => emitir({ ...hsv, h: Number(e.target.value) })} aria-label="Tono"
          className="tono" style={{ width: '100%', marginTop: 12 }} />
      </div>
      <div style={{ flex: '1 1 180px', minWidth: 180 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: 16, background: hex, border: `1px solid ${C.line}` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: C.g500, marginBottom: 4 }}>Código</div>
            <input value={texto} onChange={e => deHex(e.target.value.trim())} style={campo} placeholder="#1F5F5B" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {['R', 'G', 'B'].map((l, i) => (
            <label key={l}><div style={{ fontSize: 12, color: C.g500, marginBottom: 4 }}>{l}</div>
              <input type="number" min="0" max="255" value={[r, g, b][i]} onChange={e => deRgb(i, e.target.value)} style={campo} /></label>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.g500, margin: '14px 0 6px' }}>Sugeridos</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {COLORES_SUGERIDOS.map(c => (
            <button key={c} type="button" onClick={() => { setHsv(rgbAHsv(...hexARgb(c))); setTexto(c); onChange(c) }} title={c}
              style={{ width: 26, height: 26, borderRadius: 7, background: c, cursor: 'pointer', border: hex === c ? `2px solid ${C.black}` : '2px solid #fff', boxShadow: `0 0 0 1px ${C.line}` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

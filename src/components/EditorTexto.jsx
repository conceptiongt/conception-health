import { useRef, useEffect, useState } from 'react'
import { C } from '../lib/theme'
import { limpiarHtml } from '../lib/ficha'

const COLORES = ['#1F2230', '#C8304A', '#1F63C6', '#1E7B45', '#A8490D', '#7A2E9A', '#0F7C86']
const RESALTES = [['#FFF3A3', 'Amarillo'], ['#DDF7CE', 'Verde'], ['#FFE0E5', 'Rosa'], ['#DCF4FF', 'Celeste']]
const LETRAS = [['Poppins, sans-serif', 'Normal'], ['Georgia, serif', 'Clásica'], ["'Courier New', monospace", 'Máquina']]
const TAMANOS = [['2', 'Pequeña'], ['3', 'Normal'], ['5', 'Grande'], ['6', 'Muy grande']]

// Text with formatting: select a word or paragraph and give it color, highlight, size, font, bold, lists…
export function EditorTexto({ valor, onChange, placeholder, minAlto = 90 }) {
  const ref = useRef(null)
  const [abierto, setAbierto] = useState(null) // 'color' | 'resaltar' | null
  const [foco, setFoco] = useState(false)

  useEffect(() => { // only write the HTML when it changes from outside, so the cursor does not jump
    const el = ref.current
    if (el && el.innerHTML !== (valor || '')) el.innerHTML = limpiarHtml(valor || '')
  }, [valor])

  const emitir = () => onChange(ref.current.innerHTML === '<br>' ? '' : ref.current.innerHTML)
  const cmd = (nombre, arg) => {
    ref.current.focus()
    document.execCommand('styleWithCSS', false, true)
    document.execCommand(nombre, false, arg)
    setAbierto(null)
    emitir()
  }
  const pegar = (e) => { // paste as plain text (no foreign styles or scripts)
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  const btn = { height: 30, minWidth: 30, padding: '0 7px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: C.g700, fontFamily: 'inherit', fontSize: 13.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
  const sel = { height: 30, border: `1px solid ${C.g200}`, borderRadius: 6, background: '#fff', fontFamily: 'inherit', fontSize: 12.5, color: C.g700, padding: '0 4px', cursor: 'pointer' }
  const sep = <span style={{ width: 1, height: 18, background: C.g200, margin: '0 3px' }} />
  const noFoco = (e) => e.preventDefault() // keep the text selection while clicking the toolbar

  return (
    <div style={{ border: `1px solid ${foco ? C.purple : C.g200}`, borderRadius: 10, background: '#fff', boxShadow: foco ? `0 0 0 3px var(--acento-anillo)` : 'none', transition: 'border-color .15s, box-shadow .15s' }}>
      <div onMouseDown={noFoco} style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', padding: '5px 6px', borderBottom: `1px solid ${C.g100}`, background: C.g50, borderRadius: '10px 10px 0 0', position: 'relative' }}>
        <select aria-label="Estilo de letra" style={sel} defaultValue="" onChange={e => { cmd('fontName', e.target.value); e.target.value = '' }}>
          <option value="" disabled>Letra</option>{LETRAS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
        </select>
        <select aria-label="Tamaño" style={sel} defaultValue="" onChange={e => { cmd('fontSize', e.target.value); e.target.value = '' }}>
          <option value="" disabled>Tamaño</option>{TAMANOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {sep}
        <button type="button" title="Negrita" style={{ ...btn, fontWeight: 700 }} onClick={() => cmd('bold')}>B</button>
        <button type="button" title="Cursiva" style={{ ...btn, fontStyle: 'italic' }} onClick={() => cmd('italic')}>I</button>
        <button type="button" title="Subrayado" style={{ ...btn, textDecoration: 'underline' }} onClick={() => cmd('underline')}>U</button>
        {sep}
        <button type="button" title="Color de letra" style={btn} onClick={() => setAbierto(abierto === 'color' ? null : 'color')}>
          <span style={{ fontWeight: 700, borderBottom: '3px solid #C8304A', lineHeight: 1 }}>A</span>
        </button>
        <button type="button" title="Resaltar" style={btn} onClick={() => setAbierto(abierto === 'resaltar' ? null : 'resaltar')}>
          <span style={{ background: '#FFF3A3', padding: '0 4px', borderRadius: 3, fontWeight: 600 }}>ab</span>
        </button>
        {sep}
        <button type="button" title="Lista con viñetas" style={btn} onClick={() => cmd('insertUnorderedList')}>• ≡</button>
        <button type="button" title="Lista numerada" style={btn} onClick={() => cmd('insertOrderedList')}>1.</button>
        <button type="button" title="Quitar formato" style={{ ...btn, color: C.g400, fontSize: 12 }} onClick={() => cmd('removeFormat')}>Limpiar</button>

        {abierto && (
          <div style={{ position: 'absolute', top: 38, left: 150, zIndex: 5, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 260 }}>
            {abierto === 'color'
              ? <>{COLORES.map(c => <button key={c} type="button" title={c} onClick={() => cmd('foreColor', c)} style={{ width: 24, height: 24, borderRadius: 12, background: c, border: '2px solid #fff', boxShadow: `0 0 0 1px ${C.g200}`, cursor: 'pointer' }} />)}
                  <label title="Otro color" style={{ width: 24, height: 24, borderRadius: 12, overflow: 'hidden', boxShadow: `0 0 0 1px ${C.g200}`, cursor: 'pointer', background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                    <input type="color" onChange={e => cmd('foreColor', e.target.value)} style={{ opacity: 0, width: 24, height: 24, cursor: 'pointer' }} />
                  </label></>
              : <>{RESALTES.map(([c, l]) => <button key={c} type="button" title={l} onClick={() => cmd('hiliteColor', c)} style={{ height: 24, padding: '0 8px', borderRadius: 6, background: c, border: `1px solid ${C.g200}`, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>{l}</button>)}
                  <button type="button" onClick={() => cmd('hiliteColor', 'transparent')} style={{ height: 24, padding: '0 8px', borderRadius: 6, background: '#fff', border: `1px solid ${C.g200}`, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Sin resaltar</button></>}
          </div>
        )}
      </div>
      <div
        ref={ref} contentEditable suppressContentEditableWarning className="editor-texto" data-placeholder={placeholder}
        onInput={emitir} onPaste={pegar} onFocus={() => setFoco(true)} onBlur={() => { setFoco(false); setAbierto(null) }}
        style={{ minHeight: minAlto, padding: '11px 13px', outline: 'none', fontSize: 14.5, lineHeight: 1.65, color: C.black, overflowWrap: 'anywhere' }}
      />
    </div>
  )
}

// Read-only view of formatted text
export function TextoFormateado({ html, style }) {
  return <div className="texto-ficha" style={{ fontSize: 15, lineHeight: 1.7, color: C.black, overflowWrap: 'anywhere', ...style }} dangerouslySetInnerHTML={{ __html: limpiarHtml(html) }} />
}

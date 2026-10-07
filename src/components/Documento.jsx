import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui/Button'
import { toast } from './ui/Toast'
import { descargarExcel } from '../lib/excel'

const INK = '#1A2332', MUTED = '#63718A', LINE = '#D5DCE8', BRAND = '#7C3AED'

// Formal printable document (only visible when printing; see .print-only in index.css).
// secciones: [{ titulo, tabla: { headers, filas } } | { titulo, pares: [[label, valor]] } | { titulo, texto } | { titulo, imagenes: [{ src, pie }] }]
function Documento({ titulo, subtitulo, clinica, secciones, onReady }) {
  const hoy = new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })
  return createPortal(
    <div className="print-only" style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: INK, fontSize: 11.5, lineHeight: 1.45 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, paddingBottom: 12, borderBottom: `3px solid ${BRAND}` }}>
        <img src="/logo-dark.png" alt="Conception" onLoad={onReady} onError={onReady} style={{ height: 44, width: 'auto' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9.5, letterSpacing: '0.14em', color: MUTED, fontWeight: 700 }}>{clinica?.toUpperCase()}</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 12, color: MUTED }}>{subtitulo}</div>}
        </div>
      </div>
      {secciones.filter(Boolean).map((s, i) => (
        <div key={i} style={{ breakInside: s.tabla ? 'auto' : 'avoid', pageBreakInside: s.tabla ? 'auto' : 'avoid' }}>
          {s.titulo && <div style={{ fontSize: 13, fontWeight: 600, color: BRAND, margin: '18px 0 8px' }}>{s.titulo}</div>}
          {s.pares && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
              {s.pares.map(([k, v]) => (
                <div key={k} style={{ borderBottom: `1px solid ${LINE}`, padding: '4px 0', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: MUTED }}>{k}</span><strong style={{ textAlign: 'right' }}>{v || '—'}</strong>
                </div>
              ))}
            </div>
          )}
          {s.texto && <div style={{ whiteSpace: 'pre-wrap' }}>{s.texto}</div>}
          {s.tabla && (
            s.tabla.filas.length === 0 ? <div style={{ color: MUTED }}>Sin registros</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${LINE}` }}>
                    {s.tabla.headers.map(h => <th key={h} style={{ textAlign: 'left', padding: '5px 4px', color: MUTED, fontWeight: 700 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.tabla.filas.map((f, j) => (
                    <tr key={j} style={{ borderBottom: `1px solid ${LINE}`, fontWeight: f._total ? 800 : 400 }}>
                      {(f._total ? f.celdas : f).map((c, k) => <td key={k} style={{ padding: '5px 4px', verticalAlign: 'top' }}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
          {s.imagenes && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {s.imagenes.map((im, k) => (
                <div key={k} style={{ breakInside: 'avoid' }}>
                  <img src={im.src} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 6, border: `1px solid ${LINE}` }} />
                  <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>{im.pie}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ marginTop: 26, paddingTop: 8, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: MUTED }}>
        <span>Conception Health · Documento confidencial</span>
        <span>Generado el {hoy}</span>
      </div>
    </div>,
    document.body,
  )
}

// "Excel" + "PDF / Imprimir" buttons. `preparar()` returns { titulo, subtitulo, secciones, excel: { hojas, archivo } } (may be async)
export function Exportar({ clinica, preparar, size = 'sm' }) {
  const [doc, setDoc] = useState(null)
  const [busy, setBusy] = useState(false)
  const printed = useRef(false)

  const excel = async () => {
    setBusy(true)
    try {
      const d = await preparar()
      await descargarExcel(d.excel.hojas, d.excel.archivo)
      toast.success('Excel descargado')
    } catch { toast.error('No se pudo generar el Excel') }
    setBusy(false)
  }
  const imprimir = async () => {
    setBusy(true)
    try {
      const d = await preparar()
      printed.current = false
      setDoc(d)
    } catch { toast.error('No se pudo preparar el documento') }
    setBusy(false)
  }
  const onReady = () => {
    if (printed.current) return
    printed.current = true
    // give images a moment to load before opening the print dialog
    setTimeout(() => { window.print(); setDoc(null) }, 400)
  }

  return (
    <>
      <Button variant="ghost" size={size} onClick={excel} disabled={busy} icon="excel">Excel</Button>
      <Button variant="ghost" size={size} onClick={imprimir} disabled={busy} title="Se abre la ventana de impresión; elija 'Guardar como PDF' para descargarlo" icon="imprimir">PDF / Imprimir</Button>
      {doc && <Documento clinica={clinica} titulo={doc.titulo} subtitulo={doc.subtitulo} secciones={doc.secciones} onReady={onReady} />}
    </>
  )
}

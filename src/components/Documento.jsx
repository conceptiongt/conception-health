import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui/Button'
import { toast } from './ui/Toast'
import { descargarExcel } from '../lib/excel'
import { useDatos } from '../hooks/useDatos'
import { urlLogo, iniciales } from '../lib/marca'
import { COLOR_BASE, mezclar, valido } from '../lib/theme'
import { generarPdf, verPdf } from './DocumentoPaciente'
import { nombreArchivo } from '../lib/ficha'

const INK = '#1C1C1E', MUTED = '#6B6963', LINE = '#E3E1DB', SOFT = '#F7F6F3'

// Formal printable document in the clinic's own brand (logo + color). Only visible when printing (.print-only).
// secciones: [{ titulo, tabla: { headers, filas } } | { titulo, pares: [[label, valor]] } | { titulo, texto } | { titulo, imagenes } | { resumen: [[label, valor]] }]
function Documento({ titulo, subtitulo, clinica: nombreClinica, secciones, onReady, refPdf }) {
  const { clinica } = useDatos() || {}
  const logo = urlLogo(clinica)
  const acento = valido(clinica?.color) ? clinica.color : COLOR_BASE
  const tenue = mezclar(acento, '#FFFFFF', 0.9)
  const nombre = clinica?.nombre || nombreClinica
  const hoy = new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })
  useEffect(() => { if (!logo) onReady?.() }, [logo, onReady])
  // refPdf: rendered off-screen at A4 width to build the PDF; otherwise only visible to the printer
  const contenedor = refPdf
    ? (c) => <div ref={refPdf} style={{ position: 'fixed', left: -10000, top: 0, width: 794, zIndex: -1 }}><div style={{ width: 794, padding: '40px 44px', boxSizing: 'border-box', background: '#fff' }}>{c}</div></div>
    : (c) => <div className="print-only">{c}</div>
  return createPortal(contenedor(
    <div style={{ fontFamily: "'Poppins', -apple-system, sans-serif", color: INK, fontSize: 10.5, lineHeight: 1.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 14, borderBottom: `1px solid ${LINE}` }}>
        {logo
          ? <img src={logo} alt="" onLoad={onReady} onError={onReady} style={{ height: 48, maxWidth: 170, objectFit: 'contain' }} />
          : <div style={{ width: 44, height: 44, borderRadius: 8, background: acento, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600 }}>{iniciales(nombre)}</div>}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{nombre}</div>
          <div style={{ fontSize: 9.5, color: MUTED }}>{hoy}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', color: acento }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 11, color: MUTED }}>{subtitulo}</div>}
        </div>
      </div>
      <div style={{ height: 3, background: acento, width: 64, marginTop: -2, borderRadius: 2 }} />

      {secciones.filter(Boolean).map((s, i) => (
        <div key={i} style={{ breakInside: s.tabla ? 'auto' : 'avoid', pageBreakInside: s.tabla ? 'auto' : 'avoid' }}>
          {s.titulo && <div style={{ fontSize: 12, fontWeight: 500, margin: '20px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 3, height: 13, background: acento, borderRadius: 2 }} />{s.titulo}</div>}
          {s.resumen && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.resumen.length}, 1fr)`, gap: 8, marginTop: 18 }}>
              {s.resumen.map(([k, v]) => (
                <div key={k} style={{ background: tenue, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, color: MUTED }}>{k}</div>
                  <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          )}
          {s.pares && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              {s.pares.map(([k, v]) => (
                <div key={k} style={{ borderBottom: `1px solid ${LINE}`, padding: '6px 0', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: MUTED }}>{k}</span><span style={{ textAlign: 'right', fontWeight: 500 }}>{v || '—'}</span>
                </div>
              ))}
            </div>
          )}
          {s.texto && <div style={{ whiteSpace: 'pre-wrap', background: SOFT, borderRadius: 8, padding: '10px 12px' }}>{s.texto}</div>}
          {s.tabla && (
            s.tabla.filas.length === 0 ? <div style={{ color: MUTED }}>Sin registros</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.8 }}>
                <thead>
                  <tr>{s.tabla.headers.map((h, k) => <th key={k} style={{ textAlign: 'left', padding: '6px 8px', color: INK, fontWeight: 500, background: tenue, borderBottom: `1px solid ${acento}` }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {s.tabla.filas.map((f, j) => (
                    <tr key={j} style={{ borderBottom: `1px solid ${LINE}`, fontWeight: f._total ? 600 : 400, background: f._total ? SOFT : 'transparent' }}>
                      {(f._total ? f.celdas : f).map((c, k) => <td key={k} style={{ padding: '6px 8px', verticalAlign: 'top' }}>{c}</td>)}
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
                  <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{im.pie}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ marginTop: 28, paddingTop: 8, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: MUTED }}>
        <span>{nombre} · Documento confidencial</span>
        <span>Generado el {hoy}</span>
      </div>
    </div>),
    document.body,
  )
}

// "Excel", "Ver PDF" (opens in another window, where it can be downloaded) and "Imprimir" buttons.
// `preparar()` returns { titulo, subtitulo, secciones, excel: { hojas, archivo } } (may be async)
export function Exportar({ clinica, preparar, size = 'sm' }) {
  const [doc, setDoc] = useState(null)
  const [pdf, setPdf] = useState(null) // document being turned into a PDF
  const [busy, setBusy] = useState(false)
  const printed = useRef(false)
  const refPdf = useRef(null)
  const esperaPdf = useRef(null)

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
  const verEnPdf = async () => {
    setBusy(true)
    try {
      await verPdf(async () => {
        const d = await preparar()
        await new Promise(r => { esperaPdf.current = r; setPdf(d) }) // wait until the document is on the page
        return generarPdf(refPdf.current.firstChild, `${nombreArchivo(d.titulo || 'documento')}.pdf`)
      }, 'PDF')
    } catch { toast.error('No se pudo generar el PDF') }
    setPdf(null); setBusy(false)
  }
  useEffect(() => { if (pdf && refPdf.current) esperaPdf.current?.() }, [pdf])

  return (
    <>
      <Button variant="ghost" size={size} onClick={excel} disabled={busy} icon="excel">Excel</Button>
      <Button variant="ghost" size={size} onClick={verEnPdf} disabled={busy} title="Se abre en otra ventana, desde donde puede descargarlo" icon="pdf">Ver PDF</Button>
      <Button variant="ghost" size={size} onClick={imprimir} disabled={busy} icon="imprimir">Imprimir</Button>
      {doc && <Documento clinica={clinica} titulo={doc.titulo} subtitulo={doc.subtitulo} secciones={doc.secciones} onReady={onReady} />}
      {pdf && <Documento clinica={clinica} titulo={pdf.titulo} subtitulo={pdf.subtitulo} secciones={pdf.secciones} refPdf={refPdf} />}
    </>
  )
}

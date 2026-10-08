import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { COLOR_BASE, mezclar, valido } from '../lib/theme'
import { iniciales } from '../lib/marca'
import { fmtFecha, fmtFechaCorta, fmtHora, fmtQ, totalCobro, saldo } from '../lib/formato'
import { ETAPAS_FOTO } from '../lib/constantes'
import { resumenDatos } from '../lib/especialidades'
import { limpiarHtml, edad } from '../lib/ficha'

const INK = '#1C1C1E', MUTED = '#5F6172', LINE = '#E3E1DB', SOFT = '#F7F6F3'

// A4 document (794 px wide) of a patient's file with exactly what was chosen; used for the PDF, print and the portal.
// marca = { nombre, color, logo }, partes = { datos, antecedentes, consultas: [{ cita, secciones: [{ titulo, html }], datosClinicos }], fotos: [{ src, pie }], documentos: [{ nombre }], cobros: [] }
export function DocumentoPaciente({ marca, titulo, subtitulo, paciente, partes, impresion }) {
  const acento = valido(marca?.color) ? marca.color : COLOR_BASE
  const tenue = mezclar(acento, '#FFFFFF', 0.9)
  const hoy = new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })
  const h2 = (t) => (
    <div style={{ fontSize: 15, fontWeight: 600, margin: '22px 0 10px', display: 'flex', alignItems: 'center', gap: 9, color: INK, breakAfter: 'avoid' }}>
      <span style={{ width: 4, height: 16, background: acento, borderRadius: 2 }} />{t}
    </div>
  )
  const pares = (lista) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 26px' }}>
      {lista.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} style={{ borderBottom: `1px solid ${LINE}`, padding: '7px 0', breakInside: 'avoid' }}>
          <div style={{ fontSize: 10.5, color: MUTED }}>{k}</div>
          <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{v}</div>
        </div>
      ))}
    </div>
  )
  const anios = edad(paciente.fecha_nacimiento)
  const cobros = partes.cobros || []
  const totalC = cobros.reduce((n, c) => n + totalCobro(c), 0), pagadoC = cobros.reduce((n, c) => n + (Number(c.pagado) || 0), 0)

  return (
    <div style={{ width: impresion ? '100%' : 794, padding: impresion ? 0 : '40px 48px', boxSizing: 'border-box', background: '#fff', fontFamily: "'Poppins', -apple-system, sans-serif", color: INK, fontSize: 12.5, lineHeight: 1.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 16, borderBottom: `2px solid ${acento}` }}>
        {marca?.logo
          ? <img src={marca.logo} alt="" crossOrigin="anonymous" style={{ height: 56, maxWidth: 190, objectFit: 'contain' }} />
          : <div style={{ width: 50, height: 50, borderRadius: 10, background: acento, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 600 }}>{iniciales(marca?.nombre)}</div>}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{marca?.nombre}</div>
          <div style={{ fontSize: 10.5, color: MUTED }}>{hoy}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 21, fontWeight: 600, color: acento, letterSpacing: '-0.01em' }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 11.5, color: MUTED }}>{subtitulo}</div>}
        </div>
      </div>

      <div style={{ marginTop: 16, background: tenue, borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 10.5, color: MUTED }}>Paciente</div><div style={{ fontSize: 16, fontWeight: 600 }}>{paciente.nombre}</div></div>
        {anios != null && <div><div style={{ fontSize: 10.5, color: MUTED }}>Edad</div><div style={{ fontSize: 14, fontWeight: 500 }}>{anios} años</div></div>}
        {paciente.dpi && <div><div style={{ fontSize: 10.5, color: MUTED }}>DPI</div><div style={{ fontSize: 14, fontWeight: 500 }}>{paciente.dpi}</div></div>}
        {paciente.telefono && <div><div style={{ fontSize: 10.5, color: MUTED }}>Teléfono</div><div style={{ fontSize: 14, fontWeight: 500 }}>{paciente.telefono}</div></div>}
      </div>

      {partes.datos && <>{h2('Datos personales')}{pares([
        ['Fecha de nacimiento', paciente.fecha_nacimiento && fmtFecha(paciente.fecha_nacimiento)], ['Sexo', paciente.sexo], ['Correo', paciente.email],
        ['Dirección', paciente.direccion], ['Ocupación', paciente.ocupacion], ['Estado civil', paciente.estado_civil],
        ['Contacto de emergencia', [paciente.contacto_emergencia, paciente.telefono_emergencia].filter(Boolean).join(' · ')],
        ...(partes.extra || []),
      ])}</>}

      {partes.antecedentes && <>{h2('Antecedentes médicos')}{pares([
        ['Tipo de sangre', paciente.tipo_sangre], ['Alergias', paciente.alergias], ['Enfermedades', paciente.enfermedades], ['Medicamentos actuales', paciente.medicamentos],
        ['Antecedentes quirúrgicos', paciente.antecedentes_quirurgicos], ['Antecedentes familiares', paciente.antecedentes_familiares], ['Hábitos', paciente.habitos],
      ])}{paciente.notas_medicas && <div style={{ marginTop: 10, background: SOFT, borderRadius: 8, padding: '10px 12px', whiteSpace: 'pre-wrap' }}>{paciente.notas_medicas}</div>}</>}

      {partes.consultas?.length > 0 && <>
        {h2(partes.consultas.length === 1 ? 'Consulta' : `Consultas (${partes.consultas.length})`)}
        {partes.consultas.map(({ cita, secciones, datosClinicos }) => (
          <div key={cita.id} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '14px 16px', marginBottom: 12, breakInside: 'avoid-page' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingBottom: 8, borderBottom: `1px solid ${LINE}`, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{fmtFecha(cita.fecha)}</span>
              {cita.hora && <span style={{ color: MUTED }}>{fmtHora(cita.hora)}</span>}
              <span style={{ marginLeft: 'auto', fontWeight: 500, color: acento }}>{[cita.tipo, cita.servicio].filter(Boolean).join(' · ')}</span>
            </div>
            {(datosClinicos || cita.peso || cita.talla) && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>{[cita.peso && `Peso ${cita.peso} kg`, cita.talla && `Talla ${cita.talla} cm`, datosClinicos].filter(Boolean).join(' · ')}</div>}
            {secciones.map(s => (
              <div key={s.titulo} style={{ marginTop: 8, breakInside: 'avoid' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: acento, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.titulo}</div>
                {s.html ? <div className="texto-ficha" style={{ fontSize: 12.5, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: limpiarHtml(s.html) }} />
                  : <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{s.texto}</div>}
              </div>
            ))}
          </div>
        ))}
      </>}

      {partes.fotos?.length > 0 && <>{h2('Fotografías')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {partes.fotos.map((f, i) => (
            <div key={i} style={{ breakInside: 'avoid' }}>
              <img src={f.src} alt="" crossOrigin="anonymous" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8, border: `1px solid ${LINE}` }} />
              <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{f.pie}</div>
            </div>
          ))}
        </div></>}

      {partes.documentos?.length > 0 && <>{h2('Estudios y documentos adjuntos')}
        {partes.documentos.map((d, i) => <div key={i} style={{ padding: '6px 0', borderBottom: `1px solid ${LINE}` }}>📄 {d.nombre} <span style={{ color: MUTED }}>· {fmtFechaCorta(d.fecha)}</span></div>)}
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>Los archivos PDF se entregan por separado o en su portal de paciente.</div></>}

      {cobros.length > 0 && <>{h2('Estado de cuenta')}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead><tr>{['Fecha', 'Concepto', 'Total', 'Pagado', 'Saldo'].map(h => <th key={h} style={{ textAlign: h === 'Fecha' || h === 'Concepto' ? 'left' : 'right', padding: '7px 8px', background: tenue, borderBottom: `1px solid ${acento}`, fontWeight: 600 }}>{h}</th>)}</tr></thead>
          <tbody>
            {cobros.map(c => <tr key={c.id} style={{ borderBottom: `1px solid ${LINE}` }}>
              <td style={{ padding: '6px 8px' }}>{fmtFechaCorta(c.fecha)}</td><td style={{ padding: '6px 8px' }}>{c.concepto}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtQ(totalCobro(c))}</td><td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtQ(c.pagado)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{fmtQ(saldo(c))}</td></tr>)}
            <tr style={{ background: SOFT, fontWeight: 600 }}><td style={{ padding: '7px 8px' }} colSpan={2}>Total</td><td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtQ(totalC)}</td><td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtQ(pagadoC)}</td><td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmtQ(totalC - pagadoC)}</td></tr>
          </tbody>
        </table></>}

      <div style={{ marginTop: 30, paddingTop: 10, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: MUTED }}>
        <span>{marca?.nombre} · Documento confidencial</span><span>Generado el {hoy} con Conception Health</span>
      </div>
    </div>
  )
}

// Builds the parts of the document from the clinic's data and the choices of the selection window
export function armarPartes({ paciente, citas, cobros, archivos, clinica, eleccion, secciones }) {
  const ficha = (cita) => {
    const lista = secciones.filter(s => eleccion.secciones[s.id] !== false && cita.ficha?.[s.id] && limpiarHtml(cita.ficha[s.id]).replace(/<[^>]+>/g, '').trim())
      .map(s => ({ titulo: s.titulo, html: cita.ficha[s.id] }))
    if (eleccion.secciones._procedimiento !== false && cita.procedimiento) lista.push({ titulo: 'Procedimiento', texto: cita.procedimiento })
    if (eleccion.secciones._notas && cita.notas) lista.push({ titulo: 'Notas', texto: cita.notas })
    return lista
  }
  const etapa = (v) => ETAPAS_FOTO.find(e => e.value === v)?.label
  return {
    datos: eleccion.datos, antecedentes: eleccion.antecedentes,
    extra: eleccion.datos ? (clinica?.campos_paciente || []).map(c => [c.label, paciente.extra?.[c.id]]) : [],
    consultas: eleccion.consultas ? citas.filter(c => eleccion.citaIds.includes(c.id)).sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map(c => ({ cita: c, secciones: ficha(c), datosClinicos: eleccion.secciones._datos !== false ? resumenDatos(c.datos, clinica?.especialidad) : '' })) : [],
    fotos: eleccion.fotos ? archivos.filter(a => eleccion.archivoIds.includes(a.id) && (a.mime || '').startsWith('image/') && a.url).map(a => ({ src: a.url, pie: [etapa(a.etapa), fmtFechaCorta(a.fecha), a.notas].filter(Boolean).join(' · ') })) : [],
    documentos: eleccion.fotos ? archivos.filter(a => eleccion.archivoIds.includes(a.id) && !(a.mime || '').startsWith('image/')).map(a => ({ nombre: a.nombre || a.notas || 'Documento', fecha: a.fecha })) : [],
    cobros: eleccion.cobros ? cobros : [],
  }
}

// Renders the document off-screen and turns it into a PDF file (html2pdf is loaded only when needed)
export async function generarPdf(elemento, nombreArchivo) {
  const { default: html2pdf } = await import('html2pdf.js')
  await Promise.all([...elemento.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r })))
  const blob = await html2pdf().set({
    margin: [0, 0, 8, 0], filename: nombreArchivo, image: { type: 'jpeg', quality: 0.92 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'px', format: [794, 1123], hotfixes: ['px_scaling'] },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['img', 'tr'] },
  }).from(elemento).outputPdf('blob')
  return new File([blob], nombreArchivo, { type: 'application/pdf' })
}

// Off-screen holder for the document while the PDF is generated
export function Fuera({ children, refEl }) {
  return createPortal(<div ref={refEl} style={{ position: 'fixed', left: -10000, top: 0, width: 794, zIndex: -1 }}>{children}</div>, document.body)
}

// Opens the PDF in a new window with its name on top and "Descargar" / "Imprimir" buttons; the download keeps
// the file name (patient or section + date), which the browser's own viewer would lose.
// The window is opened at the click, before generating, so the browser does not block it.
export async function verPdf(generar, titulo = 'Documento') {
  const w = window.open('', '_blank')
  if (w) { w.document.title = titulo; w.document.body.style.cssText = 'font-family:sans-serif;padding:40px;color:#555'; w.document.body.textContent = 'Preparando el PDF…' }
  try {
    const f = await generar()
    const url = URL.createObjectURL(f)
    if (!w) { const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); return } // pop-ups blocked: download instead
    const d = w.document
    d.open()
    d.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><style>'
      + 'body{margin:0;font-family:Poppins,-apple-system,sans-serif;background:#525659;display:flex;flex-direction:column;height:100vh}'
      + '.barra{display:flex;align-items:center;gap:10px;padding:10px 16px;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.2);flex-wrap:wrap}'
      + '.nombre{flex:1;min-width:180px;font-size:14px;color:#333;word-break:break-all}'
      + '.btn{border:none;border-radius:160px;padding:10px 18px;font:600 14px Poppins,sans-serif;cursor:pointer;text-decoration:none;background:#6161FF;color:#fff}'
      + '.btn.sec{background:#fff;color:#333;border:1px solid #DDDFEB}iframe{flex:1;border:none;width:100%}'
      + '</style></head><body><div class="barra"><span class="nombre" id="n"></span><a class="btn" id="b">Descargar PDF</a><button class="btn sec" id="p">Imprimir</button></div><iframe id="f"></iframe></body></html>')
    d.close()
    d.title = f.name
    d.getElementById('n').textContent = f.name
    const b = d.getElementById('b'); b.href = url; b.download = f.name
    d.getElementById('f').src = url
    d.getElementById('p').onclick = () => { try { d.getElementById('f').contentWindow.print() } catch { w.print() } }
  } catch (e) { w?.close(); throw e }
}

// Shows the document only to the printer and opens the print dialog once its images have loaded
export function Imprimir({ children, onListo }) {
  const ref = useRef(null)
  useEffect(() => {
    const imgs = [...(ref.current?.querySelectorAll('img') || [])]
    Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r }))).then(() => {
      setTimeout(() => { window.print(); onListo() }, 200)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(<div ref={ref} className="print-only">{children}</div>, document.body)
}

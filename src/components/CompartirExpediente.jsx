import { useState, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { TIPOS_CITA } from '../lib/constantes'
import { fmtFechaCorta, linkWhatsApp } from '../lib/formato'
import { urlLogo } from '../lib/marca'
import { seccionesActivas, urlDocumento } from '../lib/ficha'
import { puede } from '../lib/permisos'
import { slug } from '../lib/excel'
import { useDatos } from '../hooks/useDatos'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input } from './ui/Campos'
import { toast } from './ui/Toast'
import { SelectorPeriodo, RangoFechas, enPeriodo } from './Filtros'
import { DocumentoPaciente, armarPartes, generarPdf, Fuera, verPdf, Imprimir } from './DocumentoPaciente'

const puedeCompartirArchivo = () => {
  try { return !!navigator.canShare?.({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }) } catch { return false }
}

// Window to choose exactly what goes in the PDF (data, history, some consultations, photos, account) and then
// download it, print it or send it by WhatsApp
export function CompartirExpediente({ paciente, citas, cobros = [], archivos = [], citaInicial, onClose }) {
  const { clinica, perfil } = useDatos()
  const finanzas = puede(perfil, 'finanzas')
  const secciones = seccionesActivas(clinica)
  const unaSola = !!citaInicial
  const [e, setE] = useState(() => ({
    datos: !unaSola, antecedentes: !unaSola, consultas: true, fotos: !unaSola && archivos.length > 0, cobros: false,
    citaIds: unaSola ? [citaInicial.id] : citas.map(c => c.id),
    archivoIds: unaSola ? archivos.filter(a => a.cita_id === citaInicial.id).map(a => a.id) : archivos.map(a => a.id),
    secciones: { _notas: false },
  }))
  const [tipo, setTipo] = useState('')
  const [periodo, setPeriodo] = useState({ mes: '', anio: '', desde: '', hasta: '' })
  const [titulo, setTitulo] = useState(unaSola ? 'Resumen de su consulta' : 'Expediente clínico')
  const [busy, setBusy] = useState('')
  const [listo, setListo] = useState(null) // { file, link } after preparing for WhatsApp
  const refDoc = useRef(null)
  const set = (k, v) => setE(p => ({ ...p, [k]: v }))

  const visibles = useMemo(() => citas.filter(c => (!tipo || c.tipo === tipo) && enPeriodo(c.fecha, periodo)).sort((a, b) => b.fecha.localeCompare(a.fecha)), [citas, tipo, periodo])
  const filtrar = (t, p) => { // changing the filter selects exactly the consultations it shows
    setTipo(t); setPeriodo(p)
    set('citaIds', citas.filter(c => (!t || c.tipo === t) && enPeriodo(c.fecha, p)).map(c => c.id))
  }
  const alternar = (k, id) => set(k, e[k].includes(id) ? e[k].filter(x => x !== id) : [...e[k], id])

  const marca = { nombre: clinica?.nombre, color: clinica?.color, logo: urlLogo(clinica) }
  const partes = armarPartes({ paciente, citas, cobros: finanzas ? cobros : [], archivos, clinica, eleccion: e, secciones })
  const nada = !e.datos && !e.antecedentes && !partes.consultas.length && !partes.fotos.length && !partes.documentos.length && !partes.cobros.length
  const archivo = `${slug(titulo || 'expediente')}_${slug(paciente.nombre)}.pdf`

  const pdf = async () => generarPdf(refDoc.current.firstChild, archivo)
  const [imprimiendo, setImprimiendo] = useState(false)
  const abrirPdf = async () => {
    setBusy('pdf')
    try { await verPdf(pdf, titulo) } catch { toast.error('No se pudo generar el PDF') }
    setBusy('')
  }
  // WhatsApp: the PDF is saved privately and the patient gets a short link (valid 30 days); on phones the file itself can also be sent
  const preparar = async () => {
    setBusy('whatsapp')
    try {
      const f = await pdf()
      const path = `${clinica.id}/${crypto.randomUUID()}.pdf`
      const { error } = await supabase.storage.from('compartidos').upload(path, f, { contentType: 'application/pdf' })
      if (error) throw error
      const { data, error: e2 } = await supabase.from('documentos_compartidos').insert({ clinica_id: clinica.id, paciente_id: paciente.id, path, titulo }).select('token').single()
      if (e2) throw e2
      setListo({ file: f, link: urlDocumento(data.token) })
    } catch { toast.error('No se pudo preparar el documento') }
    setBusy('')
  }
  const mensaje = listo && `Hola ${paciente.nombre.split(' ')[0]} 👋\n\nLe compartimos su ${titulo.toLowerCase()} de ${clinica?.nombre}:\n${listo.link}\n\nCualquier duda, estamos para servirle.`
  const wa = listo && linkWhatsApp(paciente.telefono, mensaje)
  const enviarArchivo = async () => {
    try { await navigator.share({ files: [listo.file], title: titulo, text: mensaje }) } catch { /* cancelled */ }
  }

  const chip = (activo, onClick, texto, deshabilitado) => (
    <button type="button" onClick={onClick} disabled={deshabilitado} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 160, cursor: deshabilitado ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 13.5,
      border: `1.5px solid ${activo ? C.purple : C.g200}`, background: activo ? C.purpleMid : '#fff', color: deshabilitado ? C.g300 : C.black, fontWeight: activo ? 600 : 400,
    }}><span style={{ width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${activo ? C.purple : C.g300}`, background: activo ? C.purple : '#fff', color: C.onPurple, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{activo ? '✓' : ''}</span>{texto}</button>
  )
  const h = (t) => <div style={{ fontSize: 13, fontWeight: 600, color: C.g600, margin: '18px 0 8px' }}>{t}</div>

  if (listo) return (
    <Modal title="Listo para enviar" subtitle={`${titulo} · ${paciente.nombre}`} onClose={onClose} maxWidth={520}>
      <div style={{ fontSize: 14, color: C.g600, lineHeight: 1.6 }}>El paciente recibirá un enlace para ver y descargar su PDF (válido por 30 días).</div>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: C.g50, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, fontSize: 13.5, margin: '14px 0' }}>{mensaje}</pre>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {wa ? <Button icon="mensaje" onClick={() => window.open(wa, '_blank', 'noopener')}>Abrir WhatsApp con el mensaje</Button>
          : <div style={{ fontSize: 13, color: C.amber }}>El paciente no tiene teléfono registrado; copie el mensaje.</div>}
        <Button variant="ghost" icon="copiar" onClick={() => { navigator.clipboard?.writeText(mensaje); toast.success('Mensaje copiado') }}>Copiar mensaje</Button>
        {puedeCompartirArchivo() && <Button variant="ghost" icon="pdf" onClick={enviarArchivo}>Enviar el archivo PDF</Button>}
      </div>
    </Modal>
  )

  return (
    <Modal title="Imprimir, descargar o compartir" subtitle={paciente.nombre} onClose={onClose} maxWidth={760}>
      {h('¿Qué incluir?')}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chip(e.datos, () => set('datos', !e.datos), 'Datos personales')}
        {chip(e.antecedentes, () => set('antecedentes', !e.antecedentes), 'Antecedentes médicos')}
        {chip(e.consultas, () => set('consultas', !e.consultas), `Consultas (${e.citaIds.length})`, !citas.length)}
        {chip(e.fotos, () => set('fotos', !e.fotos), `Fotos y documentos (${e.archivoIds.length})`, !archivos.length)}
        {finanzas && chip(e.cobros, () => set('cobros', !e.cobros), 'Estado de cuenta (costos)', !cobros.length)}
      </div>

      {e.consultas && citas.length > 0 && <>
        {h('Consultas')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <select value={tipo} onChange={ev => filtrar(ev.target.value, periodo)} style={{ padding: '9px 11px', borderRadius: 6, border: `1px solid ${C.g200}`, fontFamily: 'inherit', fontSize: 13.5, background: '#fff' }}>
            <option value="">Todo tipo</option>{TIPOS_CITA.filter(t => citas.some(c => c.tipo === t)).map(t => <option key={t}>{t}</option>)}
          </select>
          <SelectorPeriodo valor={periodo} onChange={p => filtrar(tipo, p)} todosAnios />
          <RangoFechas valor={periodo} onChange={p => filtrar(tipo, p)} />
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, maxHeight: 210, overflowY: 'auto' }}>
          {visibles.length === 0 ? <div style={{ padding: 14, color: C.g400, fontSize: 13.5 }}>Ninguna consulta en ese período</div> : visibles.map((c, i) => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i ? `1px solid ${C.g100}` : 'none', cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={e.citaIds.includes(c.id)} onChange={() => alternar('citaIds', c.id)} style={{ width: 17, height: 17, accentColor: 'var(--acento)' }} />
              <span style={{ width: 92, color: C.g600 }}>{fmtFechaCorta(c.fecha)}</span><span>{[c.tipo, c.servicio].filter(Boolean).join(' · ') || 'Consulta'}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <Button variant="texto" size="sm" onClick={() => set('citaIds', [...new Set([...e.citaIds, ...visibles.map(c => c.id)])])}>Marcar todas</Button>
          <Button variant="texto" size="sm" onClick={() => set('citaIds', [])}>Ninguna</Button>
        </div>
        {h('Partes de cada consulta')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {secciones.map(s => chip(e.secciones[s.id] !== false, () => set('secciones', { ...e.secciones, [s.id]: e.secciones[s.id] === false }), s.titulo))}
          {chip(e.secciones._datos !== false, () => set('secciones', { ...e.secciones, _datos: e.secciones._datos === false }), 'Datos clínicos')}
          {chip(e.secciones._procedimiento !== false, () => set('secciones', { ...e.secciones, _procedimiento: e.secciones._procedimiento === false }), 'Procedimiento')}
          {chip(!!e.secciones._notas, () => set('secciones', { ...e.secciones, _notas: !e.secciones._notas }), 'Notas internas')}
        </div>
      </>}

      {e.fotos && archivos.length > 0 && <>
        {h('Fotos y documentos')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
          {archivos.map(a => {
            const si = e.archivoIds.includes(a.id)
            return (
              <button key={a.id} type="button" onClick={() => alternar('archivoIds', a.id)} style={{ position: 'relative', padding: 0, borderRadius: 10, overflow: 'hidden', border: `2px solid ${si ? C.purple : C.g200}`, background: C.g50, cursor: 'pointer', height: 84, opacity: si ? 1 : 0.55 }}>
                {(a.mime || '').startsWith('image/') ? <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 11.5, padding: 6, display: 'block', color: C.g600 }}>📄 {a.nombre || a.notas || 'PDF'}</span>}
                {si && <span style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, background: C.purple, color: C.onPurple, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
              </button>
            )
          })}
        </div>
      </>}

      {h('Título del documento')}
      <Input value={titulo} onChange={setTitulo} maxLength={80} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="ghost" icon="pdf" onClick={abrirPdf} disabled={!!busy || nada} title="Se abre en otra ventana, desde donde puede descargarlo">{busy === 'pdf' ? 'Generando…' : 'Ver PDF'}</Button>
        <Button variant="ghost" icon="imprimir" onClick={() => setImprimiendo(true)} disabled={!!busy || nada || imprimiendo}>Imprimir</Button>
        <Button icon="mensaje" onClick={preparar} disabled={!!busy || nada}>{busy === 'whatsapp' ? 'Preparando…' : 'Compartir por WhatsApp'}</Button>
      </div>
      {imprimiendo && <Imprimir onListo={() => setImprimiendo(false)}><DocumentoPaciente impresion marca={marca} titulo={titulo} subtitulo={fmtFechaCorta(new Date().toISOString())} paciente={paciente} partes={partes} /></Imprimir>}
      <Fuera refEl={refDoc}><DocumentoPaciente marca={marca} titulo={titulo} subtitulo={fmtFechaCorta(new Date().toISOString())} paciente={paciente} partes={partes} /></Fuera>
    </Modal>
  )
}

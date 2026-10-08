import { useState, useEffect, useRef } from 'react'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/config'
import { C, SHADOW, aplicarMarca } from '../lib/theme'
import { iniciales } from '../lib/marca'
import { ETAPAS_FOTO, ORIGENES, TIPOS_SANGRE } from '../lib/constantes'
import { fmtFecha, fmtFechaCorta, fmtHora, fmtQ, totalCobro, saldo } from '../lib/formato'
import { resumenDatos } from '../lib/especialidades'
import { seccionesDe, edad, nombreArchivo } from '../lib/ficha'
import { Button } from '../components/ui/Button'
import { Campo, Input, Select, Textarea, Grid } from '../components/ui/Campos'
import { Icon } from '../components/ui/Icon'
import { Cargando } from '../components/ui/Varios'
import { TextoFormateado } from '../components/EditorTexto'
import { DocumentoPaciente, generarPdf, Fuera } from '../components/DocumentoPaciente'
import { toast } from '../components/ui/Toast'
import { slug } from '../lib/excel'

// Pages patients open without an account: /p/<token> portal, /r/<token> data form, /d/<token> shared PDF
const RUTA = /^\/(p|r|d)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9-]{8,60})\/?$/i
export function rutaPublica() {
  const m = location.pathname.match(RUTA)
  return m ? { tipo: m[1].toLowerCase(), token: /^[0-9a-f-]{36}$/i.test(m[2]) ? m[2] : m[2].toLowerCase() } : null
}

async function llamar(body) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/publico`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY }, body: JSON.stringify(body),
    })
    return await r.json()
  } catch { return { error: 'RED' } }
}
const MENSAJES = {
  NO_ENCONTRADO: 'Este enlace no existe o ya no está disponible.', VENCIDO: 'Este enlace ya venció. Pida a su clínica que se lo envíe de nuevo.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos. Espere unos minutos e intente de nuevo.', RED: 'No hay conexión. Revise su internet e intente de nuevo.',
}

export function PaginaPublica({ tipo, token }) {
  if (tipo === 'p') return <Portal token={token} />
  if (tipo === 'r') return <Registro token={token} />
  return <DocumentoCompartido token={token} />
}

// ─── shared frame with the clinic's brand ───
function Marco({ clinica, children, ancho = 860 }) {
  useEffect(() => { aplicarMarca(clinica?.color); if (clinica?.nombre) document.title = clinica.nombre }, [clinica])
  return (
    <div style={{ minHeight: '100vh', background: C.bgApp }}>
      <header style={{ background: 'var(--menu-fondo)', color: 'var(--menu-texto)', padding: '14px 16px' }}>
        <div style={{ maxWidth: ancho, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          {clinica?.logo
            ? <span style={{ background: '#fff', borderRadius: 12, padding: '6px 10px', display: 'flex' }}><img src={clinica.logo} alt={`Logo de ${clinica.nombre}`} style={{ height: 40, maxWidth: 150, objectFit: 'contain' }} /></span>
            : clinica && <span style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', color: 'var(--acento)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{iniciales(clinica.nombre)}</span>}
          <div style={{ fontSize: 17, fontWeight: 600 }}>{clinica?.nombre}</div>
        </div>
      </header>
      <main style={{ maxWidth: ancho, margin: '0 auto', padding: '24px 16px 60px' }}>{children}</main>
      <footer style={{ textAlign: 'center', fontSize: 12, color: C.g400, paddingBottom: 24 }}>Información privada y confidencial · Conception Health</footer>
    </div>
  )
}
const Caja = ({ children, style }) => <div style={{ background: '#fff', borderRadius: 24, boxShadow: SHADOW, padding: '22px 20px', ...style }}>{children}</div>
const Aviso = ({ icono = 'alerta', titulo, texto }) => (
  <Caja style={{ textAlign: 'center', padding: '44px 24px' }}>
    <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon name={icono} size={26} /></div>
    <div style={{ fontSize: 21, fontWeight: 600, marginBottom: 6 }}>{titulo}</div>
    <div style={{ fontSize: 16, color: C.g500, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>{texto}</div>
  </Caja>
)

// ─── Patient portal ───
function Portal({ token }) {
  const [d, setD] = useState(null)
  const [tab, setTab] = useState('consultas')
  const [pdf, setPdf] = useState(null) // { titulo, partes } being generated
  const ref = useRef(null)
  useEffect(() => { llamar({ accion: 'portal', token }).then(setD) }, [token])

  useEffect(() => {
    if (!pdf || !ref.current) return
    const nombre = `${nombreArchivo(d.paciente.nombre, pdf.titulo)}.pdf`
    generarPdf(ref.current.firstChild, nombre).then(f => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = nombre; a.click()
    }).catch(() => toast.error('No se pudo generar el PDF')).finally(() => setPdf(null))
  }, [pdf, d])

  if (!d) return <Marco><Cargando /></Marco>
  if (d.error) return <Marco><Aviso titulo="No se pudo abrir" texto={MENSAJES[d.error] || 'Intente de nuevo más tarde.'} /></Marco>
  if (d.inactivo) return <Marco clinica={d.clinica}><Aviso icono="reloj" titulo="Su portal aún no está listo" texto="Su médico está preparando su información. Le avisaremos cuando pueda verla aquí." /></Marco>

  const clinica = { especialidad: d.clinica.especialidad, plantilla_ficha: d.clinica.plantilla }
  const consultas = d.citas.map(c => ({ cita: c, secciones: [...seccionesDe(c, clinica), ...(c.procedimiento ? [{ titulo: 'Procedimiento', texto: c.procedimiento }] : [])], datosClinicos: resumenDatos(c.datos, d.clinica.especialidad) }))
  const fotos = d.archivos.filter(a => (a.mime || '').startsWith('image/'))
  const docs = d.archivos.filter(a => !(a.mime || '').startsWith('image/'))
  const tabs = [
    ['consultas', `Mis consultas (${d.citas.length})`, 'citas'],
    d.archivos.length > 0 && ['archivos', `Fotos y documentos (${d.archivos.length})`, 'archivo'],
    d.paciente.datos && ['datos', 'Mis datos', 'usuarios'],
    d.cobros.length > 0 && ['pagos', 'Mis pagos', 'cartera'],
  ].filter(Boolean)
  const etapa = (v) => ETAPAS_FOTO.find(e => e.value === v)?.label
  const descargar = (titulo, lista) => setPdf({ titulo, partes: { consultas: lista } })
  const p = d.paciente.datos || {}
  const fila = (k, v, alerta) => v ? <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.g100}` }}><div style={{ fontSize: 14, color: C.g500 }}>{k}</div><div style={{ fontSize: 18, color: alerta ? C.red : C.black, whiteSpace: 'pre-wrap' }}>{v}</div></div> : null

  return (
    <Marco clinica={d.clinica}>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: '4px 0 4px' }}>Hola, {d.paciente.nombre.split(' ')[0]}</h1>
      <div style={{ fontSize: 17, color: C.g500, marginBottom: 20, lineHeight: 1.5 }}>Aquí está la información que su médico compartió con usted.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {tabs.map(([v, l, i]) => (
          <button key={v} onClick={() => setTab(v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 160, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 16, fontWeight: 500, background: tab === v ? 'var(--acento)' : '#fff', color: tab === v ? 'var(--acento-texto)' : C.black, boxShadow: tab === v ? 'none' : SHADOW }}>
            <Icon name={i} size={18} />{l}
          </button>
        ))}
      </div>

      {tab === 'consultas' && (consultas.length === 0 ? <Aviso icono="citas" titulo="Todavía no hay consultas" texto="Cuando su médico comparta una consulta, la verá aquí." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {consultas.length > 1 && <div><Button variant="ghost" icon="descargar" onClick={() => descargar('Mis consultas', consultas)} disabled={!!pdf}>{pdf ? 'Preparando PDF…' : 'Descargar todas en PDF'}</Button></div>}
          {consultas.map(({ cita: c, secciones, datosClinicos }, i) => (
            <Caja key={c.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingBottom: 12, borderBottom: `1px solid ${C.g100}` }}>
                <div style={{ fontSize: 21, fontWeight: 600 }}>{fmtFecha(c.fecha)}</div>
                {c.hora && <div style={{ fontSize: 16, color: C.g500 }}>{fmtHora(c.hora)}</div>}
                <div style={{ fontSize: 16, color: 'var(--acento-oscuro)', fontWeight: 500, marginLeft: 'auto' }}>{[c.tipo, c.servicio].filter(Boolean).join(' · ')}</div>
              </div>
              {(datosClinicos || c.peso || c.talla) && <div style={{ fontSize: 15, color: C.g600, marginTop: 12 }}>{[c.peso && `Peso ${c.peso} kg`, c.talla && `Talla ${c.talla} cm`, datosClinicos].filter(Boolean).join(' · ')}</div>}
              {secciones.map(s => (
                <div key={s.titulo} style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--acento-oscuro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.titulo}</div>
                  {s.html ? <TextoFormateado html={s.html} style={{ fontSize: 17.5, lineHeight: 1.75 }} /> : <div style={{ fontSize: 17.5, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{s.texto}</div>}
                </div>
              ))}
              {secciones.length === 0 && !datosClinicos && <div style={{ fontSize: 16, color: C.g400, marginTop: 12 }}>Sin indicaciones escritas para esta consulta.</div>}
              <div style={{ marginTop: 18 }}><Button variant="ghost" icon="descargar" onClick={() => descargar(`Consulta del ${fmtFechaCorta(c.fecha)}`, [consultas[i]])} disabled={!!pdf}>Descargar en PDF</Button></div>
            </Caja>
          ))}
        </div>
      ))}

      {tab === 'archivos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {docs.length > 0 && <Caja>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Estudios y documentos</div>
            {docs.map(a => (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: `1px solid ${C.g100}`, color: C.black, textDecoration: 'none', fontSize: 17 }}>
                <Icon name="pdf" size={28} style={{ color: C.red }} /><span style={{ flex: 1 }}>{a.nombre || a.notas || 'Documento'}<span style={{ display: 'block', fontSize: 14, color: C.g500 }}>{fmtFecha(a.fecha)}</span></span>
                <span style={{ color: 'var(--acento-oscuro)', fontWeight: 500, fontSize: 15 }}>Abrir</span>
              </a>
            ))}
          </Caja>}
          {fotos.length > 0 && <Caja>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Fotografías</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {fotos.map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: C.g600 }}>
                  <img src={a.url} alt={a.notas || etapa(a.etapa) || 'Fotografía'} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 14 }} />
                  <div style={{ fontSize: 14, marginTop: 4 }}>{[etapa(a.etapa), fmtFechaCorta(a.fecha)].filter(Boolean).join(' · ')}</div>
                </a>
              ))}
            </div>
          </Caja>}
        </div>
      )}

      {tab === 'datos' && <Caja>
        {fila('Fecha de nacimiento', p.fecha_nacimiento && `${fmtFecha(p.fecha_nacimiento)}${edad(p.fecha_nacimiento) != null ? ` (${edad(p.fecha_nacimiento)} años)` : ''}`)}
        {fila('Teléfono', p.telefono)}{fila('Correo', p.email)}{fila('Tipo de sangre', p.tipo_sangre)}
        {fila('Alergias', p.alergias, true)}{fila('Enfermedades', p.enfermedades)}{fila('Medicamentos', p.medicamentos)}
        {fila('Antecedentes quirúrgicos', p.antecedentes_quirurgicos)}{fila('Antecedentes familiares', p.antecedentes_familiares)}
        {fila('Contacto de emergencia', [p.contacto_emergencia, p.telefono_emergencia].filter(Boolean).join(' · '))}
        <div style={{ fontSize: 14, color: C.g400, marginTop: 14 }}>Si algún dato no es correcto, avise a su clínica.</div>
      </Caja>}

      {tab === 'pagos' && <Caja>
        {d.cobros.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: `1px solid ${C.g100}`, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontSize: 17 }}>{c.concepto}</div><div style={{ fontSize: 14, color: C.g500 }}>{fmtFecha(c.fecha)}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, color: C.g500 }}>Total {fmtQ(totalCobro(c))} · pagado {fmtQ(c.pagado)}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: saldo(c) > 0 ? C.red : C.green }}>{saldo(c) > 0 ? `Pendiente ${fmtQ(saldo(c))}` : 'Pagado'}</div></div>
          </div>
        ))}
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 14, textAlign: 'right' }}>Saldo pendiente: {fmtQ(d.cobros.reduce((n, c) => n + saldo(c), 0))}</div>
      </Caja>}

      {pdf && <Fuera refEl={ref}><DocumentoPaciente marca={d.clinica} titulo={pdf.titulo} paciente={{ nombre: d.paciente.nombre }} partes={pdf.partes} /></Fuera>}
    </Marco>
  )
}

// ─── Form the patient fills before the appointment ───
function Registro({ token }) {
  const [d, setD] = useState(null)
  const [f, setF] = useState({})
  const [acepta, setAcepta] = useState(false)
  const [busy, setBusy] = useState(false)
  const [listo, setListo] = useState(false)
  const [trampa, setTrampa] = useState('') // hidden field: only bots fill it
  const inicio = useRef(Date.now())
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  useEffect(() => { llamar({ accion: 'registro_ver', token }).then(r => { setD(r); if (r.paciente) setF({ nombre: r.paciente.nombre || '', telefono: r.paciente.telefono || '', email: r.paciente.email || '' }) }) }, [token])

  if (!d) return <Marco><Cargando /></Marco>
  if (d.error) return <Marco><Aviso titulo="No se pudo abrir" texto={MENSAJES[d.error] || 'Intente de nuevo más tarde.'} /></Marco>
  if (listo) return <Marco clinica={d.clinica} ancho={720}><Aviso icono="check" titulo="¡Gracias! Recibimos sus datos" texto={`${d.clinica.nombre} ya tiene su información. Le esperamos en su cita.`} /></Marco>

  const nuevo = !d.paciente
  const PELIGRO = /[<>]|javascript:/i
  const enviar = async (e) => {
    e.preventDefault()
    if (!f.nombre?.trim() || !f.telefono?.trim()) { toast.error('Escriba su nombre y teléfono'); return }
    if (!acepta) { toast.error('Marque la casilla de autorización para continuar'); return }
    if (Object.values(f).some(v => typeof v === 'string' && PELIGRO.test(v))) { toast.error('Quite los signos < > de sus respuestas'); return }
    setBusy(true)
    const r = await llamar({ accion: 'registro_guardar', token, datos: f, sitio_web: trampa, ms: Date.now() - inicio.current })
    setBusy(false)
    if (r.ok) { setListo(true); window.scrollTo(0, 0); return }
    toast.error(r.error === 'DATO_INVALIDO' ? 'Revise sus respuestas: hay un dato con formato no válido' : r.error === 'LIMITE' ? 'La clínica no puede recibir más registros por ahora; llámeles por favor' : MENSAJES[r.error] || 'No se pudo enviar, intente de nuevo')
  }
  const t = (texto) => <div style={{ gridColumn: '1 / -1', fontSize: 17, fontWeight: 600, marginTop: 10, paddingBottom: 6, borderBottom: `1px solid ${C.g100}` }}>{texto}</div>
  return (
    <Marco clinica={d.clinica} ancho={720}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: '4px 0 6px' }}>{nuevo ? 'Registro de paciente' : `Hola, ${d.paciente.nombre.split(' ')[0]}`}</h1>
      <div style={{ fontSize: 16.5, color: C.g500, marginBottom: 18, lineHeight: 1.55 }}>
        {d.completado ? 'Ya recibimos sus datos. Si necesita corregir algo, puede enviarlos de nuevo.' : 'Llene sus datos antes de su cita; así su médico tendrá todo listo. Toma unos 3 minutos.'}
      </div>
      <Caja>
        <form onSubmit={enviar} className="form-grande">
          <Grid min={240}>
            {t('Sus datos')}
            <Campo label="Nombre completo *"><Input value={f.nombre} onChange={set('nombre')} required maxLength={120} autoComplete="name" /></Campo>
            <Campo label="Teléfono *"><Input type="tel" value={f.telefono} onChange={set('telefono')} required maxLength={30} autoComplete="tel" /></Campo>
            <Campo label="Correo electrónico"><Input type="email" value={f.email} onChange={set('email')} maxLength={120} autoComplete="email" /></Campo>
            <Campo label="Fecha de nacimiento"><Input type="date" value={f.fecha_nacimiento} onChange={set('fecha_nacimiento')} /></Campo>
            <Campo label="Sexo"><Select value={f.sexo} onChange={set('sexo')}><option value="">—</option>{['Femenino', 'Masculino', 'Otro'].map(s => <option key={s}>{s}</option>)}</Select></Campo>
            {t('Su salud')}
            <Campo label="Tipo de sangre"><Select value={f.tipo_sangre} onChange={set('tipo_sangre')}><option value="">Seleccione…</option>{TIPOS_SANGRE.map(t => <option key={t}>{t}</option>)}</Select></Campo>
            <Campo label="¿Tiene alergias?" full><Textarea value={f.alergias} onChange={set('alergias')} rows={2} maxLength={500} placeholder="Medicamentos, alimentos… o escriba «ninguna»" /></Campo>
            <Campo label="Enfermedades que padece" full><Textarea value={f.enfermedades} onChange={set('enfermedades')} rows={2} maxLength={500} placeholder="Ej. diabetes, presión alta…" /></Campo>
            <Campo label="Medicamentos que toma" full><Textarea value={f.medicamentos} onChange={set('medicamentos')} rows={2} maxLength={500} /></Campo>
            <Campo label="Operaciones que le han hecho" full><Textarea value={f.antecedentes_quirurgicos} onChange={set('antecedentes_quirurgicos')} rows={2} maxLength={500} /></Campo>
            <Campo label="Enfermedades en su familia" full><Textarea value={f.antecedentes_familiares} onChange={set('antecedentes_familiares')} rows={2} maxLength={500} /></Campo>
            {t('En caso de emergencia')}
            <Campo label="Nombre del contacto"><Input value={f.contacto_emergencia} onChange={set('contacto_emergencia')} maxLength={120} /></Campo>
            <Campo label="Teléfono del contacto"><Input type="tel" value={f.telefono_emergencia} onChange={set('telefono_emergencia')} maxLength={30} /></Campo>
            {nuevo && <>
              {t('Su visita')}
              <Campo label="¿Cómo nos encontró?" full>
                <Opciones valor={f.origen} onChange={(v) => setF(p => ({ ...p, origen: v, red: '', referido_por: '', origen_otro: '' }))} opciones={ORIGENES.map(o => [o.value, o.label])} />
              </Campo>
              {f.origen === 'redes' && <Campo label="¿En qué red social?" full><Opciones valor={f.red} onChange={set('red')} opciones={REDES_FORMULARIO.map(r => [r, r])} /></Campo>}
              {f.origen === 'referido' && <Campo label="¿Quién le recomendó?" full><Input value={f.referido_por} onChange={set('referido_por')} maxLength={120} placeholder="Nombre de la persona" /></Campo>}
              {f.origen === 'otro' && <Campo label="Cuéntenos cómo nos encontró" full><Input value={f.origen_otro} onChange={set('origen_otro')} maxLength={200} placeholder="Ej. pasé por la clínica, un anuncio…" /></Campo>}
              <Campo label="Motivo de su consulta" full><Textarea value={f.motivo} onChange={set('motivo')} rows={3} maxLength={500} /></Campo>
            </>}
          </Grid>
          <input type="text" name="sitio_web" value={trampa} onChange={e => setTrampa(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -5000, width: 1, height: 1, opacity: 0 }} />
          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 20, fontSize: 15.5, lineHeight: 1.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} style={{ width: 22, height: 22, marginTop: 1, accentColor: 'var(--acento)', flexShrink: 0 }} />
            Autorizo a {d.clinica.nombre} a guardar estos datos de forma privada para mi atención médica.
          </label>
          <div style={{ marginTop: 20 }}><Button type="submit" size="lg" icon="enviar" disabled={busy}>{busy ? 'Enviando…' : 'Enviar mis datos'}</Button></div>
        </form>
      </Caja>
    </Marco>
  )
}

const REDES_FORMULARIO = ['Facebook', 'Instagram', 'TikTok']

// Big tappable buttons (easier than a list for older patients)
function Opciones({ valor, onChange, opciones }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {opciones.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} style={{
          padding: '12px 18px', borderRadius: 160, cursor: 'pointer', fontFamily: 'inherit', fontSize: 16,
          border: `1.5px solid ${valor === v ? 'var(--acento)' : C.g200}`, background: valor === v ? 'var(--acento-tenue)' : '#fff', color: C.black, fontWeight: valor === v ? 600 : 400,
        }}>{valor === v ? '✓ ' : ''}{l}</button>
      ))}
    </div>
  )
}

// ─── PDF shared by WhatsApp ───
function DocumentoCompartido({ token }) {
  const [d, setD] = useState(null)
  useEffect(() => { llamar({ accion: 'documento', token }).then(setD) }, [token])
  if (!d) return <Marco><Cargando /></Marco>
  if (d.error) return <Marco clinica={d.clinica}><Aviso titulo="No se pudo abrir" texto={MENSAJES[d.error] || 'Intente de nuevo más tarde.'} /></Marco>
  return (
    <Marco clinica={d.clinica} ancho={900}>
      <Caja style={{ textAlign: 'center' }}>
        <Icon name="pdf" size={44} style={{ color: C.red }} />
        <div style={{ fontSize: 22, fontWeight: 600, margin: '8px 0 4px' }}>{d.titulo || 'Documento'}</div>
        <div style={{ fontSize: 16, color: C.g500, marginBottom: 18 }}>Enviado por {d.clinica?.nombre}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button size="lg" icon="ojo" onClick={() => window.open(d.url, '_blank', 'noopener')}>Ver documento</Button>
          <Button size="lg" variant="ghost" icon="descargar" onClick={() => { location.href = d.descargar || d.url }}>Descargar</Button>
        </div>
      </Caja>
      <iframe src={d.url} title={d.titulo || 'Documento'} className="solo-escritorio" style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 16, marginTop: 16, background: '#fff' }} />
    </Marco>
  )
}

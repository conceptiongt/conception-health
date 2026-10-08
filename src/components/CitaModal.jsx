import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { ESTADOS_CITA, ETAPAS_FOTO, estadoCita } from '../lib/constantes'
import { especialidad, tiposDe } from '../lib/especialidades'
import { seccionesActivas, limpiarHtml, tieneTexto } from '../lib/ficha'
import { puede } from '../lib/permisos'
import { hoyISO, fmtFecha, fmtFechaCorta, fmtQ, saldo } from '../lib/formato'
import { CamposEspecialidad, limpiarDatos } from './CamposEspecialidad'
import { EditorTexto } from './EditorTexto'
import { MensajePaciente, Interruptor } from './MensajePaciente'
import { CompartirExpediente } from './CompartirExpediente'
import { BotonesSubir, subirArchivos, tipoArchivo } from './SubirArchivos'
import { Button } from './ui/Button'
import { Badge } from './ui/Varios'
import { Icon } from './ui/Icon'
import { Campo, Input, Select, Textarea, Grid } from './ui/Campos'
import { toast } from './ui/Toast'
import { useDatos } from '../hooks/useDatos'
import { ServicioCampos, servicioInicial, servicioParaGuardar } from './ServicioCampos'

// Create or edit a consultation on its own full screen: appointment data, the clinical file (one section per
// part: diagnosis, prescription, plan, care…), what the patient sees in their portal and the WhatsApp message
export function CitaModal({ cita, paciente, clinicaId, onClose, onGuardado, soloCita }) {
  const { servicios, sedes = [], acc, citas = [], cobros = [], clinica, perfil, ir } = useDatos()
  const esp = especialidad(clinica?.especialidad)
  const secciones = seccionesActivas(clinica)
  const clinico = puede(perfil, 'expedientes')
  const ficha = clinico && !soloCita // from Citas only the appointment is edited; the clinical file lives in the patient file
  const finanzas = puede(perfil, 'finanzas')
  const [f, setF] = useState({
    fecha: cita?.fecha || hoyISO(), hora: cita?.hora?.slice(0, 5) || '', tipo: cita?.tipo || 'Seguimiento',
    estado: cita?.estado || 'Pendiente', peso: cita?.peso ?? '', talla: cita?.talla ?? '',
    procedimiento: cita?.procedimiento || '', notas: cita?.notas || '', datos: cita?.datos || {}, ficha: cita?.ficha || {},
    portal: !!cita?.portal, sede: cita?.sede_id || paciente?.sede_id || (sedes.length === 1 ? sedes[0].id : ''),
  })
  const [serv, setServ] = useState(() => servicioInicial(cita?.tipo || 'Seguimiento', servicios, cita))
  const [busy, setBusy] = useState(false)
  const [compartir, setCompartir] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const setFicha = (id) => (html) => setF(p => ({ ...p, ficha: { ...p.ficha, [id]: html } }))
  const cambiarTipo = (tipo) => { setF(p => ({ ...p, tipo })); setServ(servicioInicial(tipo, servicios)) }
  const conSedes = acc?.inventario && sedes.length > 0
  useEffect(() => { window.scrollTo(0, 0) }, [])

  // photos and PDFs of this consultation: uploaded right away, or kept until a new consultation is saved
  const [archivos, setArchivos] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [etapa, setEtapa] = useState('estudio')
  const [subiendo, setSubiendo] = useState(0)
  const cargarArchivos = useCallback(async () => {
    if (!cita?.id || !ficha) return
    const { data } = await supabase.from('archivos').select('*').eq('cita_id', cita.id).order('created_at')
    const lista = data || []
    if (lista.length) {
      const { data: urls } = await supabase.storage.from('expedientes').createSignedUrls(lista.map(a => a.path), 3600)
      const porPath = Object.fromEntries((urls || []).map(u => [u.path, u.signedUrl]))
      lista.forEach(a => { a.url = porPath[a.path] })
    }
    setArchivos(lista)
  }, [cita?.id, ficha])
  useEffect(() => { cargarArchivos() }, [cargarArchivos])
  const recibirArchivos = async (files) => {
    if (!cita) { setPendientes(p => [...p, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))]); return }
    setSubiendo(files.length)
    const errores = await subirArchivos(files, { clinicaId, pacienteId: paciente.id, citaId: cita.id, etapa, fecha: f.fecha })
    setSubiendo(0)
    if (errores) toast.error(`${errores} archivo(s) no se pudieron subir`); else toast.success(files.length === 1 ? 'Archivo guardado' : 'Archivos guardados')
    cargarArchivos()
  }

  const anteriores = citas.filter(c => c.paciente_id === paciente?.id && c.id !== cita?.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4)
  const deuda = cobros.filter(c => c.paciente_id === paciente?.id).reduce((n, c) => n + saldo(c), 0)
  const cobroCita = cobros.find(c => c.cita_id === cita?.id)
  const precio = cobroCita ? Number(cobroCita.precio) - Number(cobroCita.descuento || 0) : Number(serv.precio) || Number(servicios.find(s => s.id === cita?.servicio_id)?.precio) || 0

  const fichaLimpia = () => Object.fromEntries(Object.entries(f.ficha).filter(([, h]) => tieneTexto(h)).map(([k, h]) => [k, limpiarHtml(h)]))

  const guardar = async () => {
    if (!f.fecha) { toast.error('La fecha es requerida'); return }
    const s = servicioParaGuardar(serv)
    const fila = {
      servicio_id: s.servicio_id, servicio: s.servicio,
      fecha: f.fecha, hora: f.hora || null, tipo: f.tipo || null, estado: f.estado,
      peso: f.peso === '' ? null : Number(f.peso), talla: f.talla === '' ? null : Number(f.talla),
      ...(ficha ? { procedimiento: f.procedimiento.trim() || null, notas: f.notas.trim() || null, datos: limpiarDatos(f.datos), ficha: fichaLimpia(), portal: f.portal } : {}),
      ...(conSedes ? { sede_id: f.sede || null } : {}),
    }
    setBusy(true)
    const { data: guardada, error } = cita
      ? await supabase.from('citas').update(fila).eq('id', cita.id).select().single()
      : await supabase.from('citas').insert({ ...fila, clinica_id: clinicaId, paciente_id: paciente.id }).select().single()
    // a new consultation with a price creates the patient's pending charge
    if (!error && !cita && s.precio > 0) {
      await supabase.from('cobros').insert({
        clinica_id: clinicaId, paciente_id: paciente.id, cita_id: guardada.id, servicio_id: s.servicio_id,
        concepto: s.servicio || f.tipo, precio: s.precio, fecha: f.fecha,
      })
    }
    if (!error && !cita && pendientes.length) {
      const errores = await subirArchivos(pendientes.map(p => p.file), { clinicaId, pacienteId: paciente.id, citaId: guardada.id, etapa, fecha: f.fecha })
      if (errores) toast.error(`${errores} archivo(s) no se pudieron subir`)
    }
    setBusy(false)
    if (error) { toast.error('No se pudo guardar la cita'); return }
    toast.success(cita ? 'Cita actualizada' : 'Cita agregada')
    onGuardado()
  }

  // Deletes the appointment with its charges and payments; a patient with no other history is deleted too
  const eliminar = async () => {
    const otrasCitas = citas.some(c => c.paciente_id === paciente?.id && c.id !== cita.id)
    const partes = ['¿Eliminar esta cita?', 'También se eliminará su cobro y los pagos registrados en él, para que no quede saldo pendiente.']
    if (!otrasCitas) partes.push(`${paciente?.nombre} no tiene otras citas: si tampoco tiene otros cobros, fotos o productos usados, también se eliminará su expediente.`)
    partes.push('Esta acción no se puede deshacer.')
    if (!confirm(partes.join('\n\n'))) return
    setBusy(true)
    const { data, error } = await supabase.rpc('cita_eliminar', { p_cita: cita.id })
    setBusy(false)
    if (error) { toast.error(error.message?.includes('SIN_PERMISO') ? 'Su usuario no tiene permiso para eliminar' : 'No se pudo eliminar'); return }
    toast.success(data?.paciente_eliminado ? 'Se eliminaron la cita, su cobro y el expediente' : data?.cobros ? 'Se eliminaron la cita y su cobro' : 'Cita eliminada')
    onGuardado({ pacienteEliminado: !!data?.paciente_eliminado })
  }

  const citaActual = { ...cita, ...f, id: cita?.id, ficha: fichaLimpia() }
  // measurements + patient summary: under the appointment data when editing from Citas, on the side in the patient file
  const medidasPaciente = (
    <>
          <section className="bloque">
            <h3>Medidas</h3>
            <Grid min={110}>
              <Campo label="Peso (kg)"><Input type="number" step="0.1" value={f.peso} onChange={set('peso')} /></Campo>
              <Campo label="Talla (cm)"><Input type="number" step="0.1" value={f.talla} onChange={set('talla')} /></Campo>
            </Grid>
            {Number(f.peso) > 0 && Number(f.talla) > 0 && <div style={{ fontSize: 13, color: C.g500, marginTop: 10 }}>IMC: <strong style={{ color: C.black, fontWeight: 500 }}>{(Number(f.peso) / (Number(f.talla) / 100) ** 2).toFixed(1)}</strong></div>}
          </section>
          <section className="bloque">
            <h3>Paciente</h3>
            <div style={{ fontSize: 13.5, color: C.g600, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {paciente?.telefono && <span>{paciente.telefono}</span>}
              {paciente?.alergias && <span style={{ color: C.red }}>Alergias: {paciente.alergias}</span>}
              {finanzas && <span>Saldo pendiente: <strong style={{ color: deuda > 0 ? C.red : C.green, fontWeight: 500 }}>{fmtQ(deuda)}</strong></span>}
            </div>
            {anteriores.length > 0 && <>
              <div style={{ fontSize: 12.5, color: C.g400, margin: '14px 0 6px' }}>Citas anteriores</div>
              {anteriores.map(c => { const e = estadoCita(c.estado); return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: `1px solid ${C.g100}`, fontSize: 13 }}>
                  <span style={{ width: 78, color: C.g500 }}>{fmtFechaCorta(c.fecha)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tipo || 'Consulta'}</span>
                  <Badge color={e.color} bg={e.bg}>{c.estado}</Badge>
                </div>
              ) })}
            </>}
          </section>
    </>
  )

  return (
    <div>
      <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.g500, cursor: 'pointer', padding: 0, marginBottom: 14, fontSize: 13.5, fontFamily: 'inherit' }}><Icon name="atras" size={16} />Volver</button>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, color: C.g500 }}>{cita ? 'Consulta' : 'Nueva cita'}</div>
          <h1 style={{ fontSize: 26, fontWeight: 500, margin: '2px 0 0', letterSpacing: '-0.02em' }}>{paciente?.nombre}</h1>
          <div style={{ fontSize: 13.5, color: C.g500, marginTop: 4 }}>{fmtFecha(f.fecha)}{f.hora ? ` · ${f.hora}` : ''}{f.tipo ? ` · ${f.tipo}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {cita && puede(perfil, 'eliminar') && <Button variant="danger" onClick={eliminar} icon="eliminar">Eliminar</Button>}
          {soloCita && clinico && <Button variant="ghost" onClick={() => ir('expedientes', paciente.id)} icon="expedientes">Abrir expediente</Button>}
          {cita && ficha && <Button variant="ghost" onClick={() => setCompartir(true)} icon="compartir">Imprimir o compartir</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy} icon="check">{busy ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </div>

      <div className="cita-pagina">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <section className="bloque">
            <h3>Datos de la cita</h3>
            <Grid min={190}>
              <Campo label="Fecha *"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
              <Campo label="Hora"><Input type="time" value={f.hora} onChange={set('hora')} /></Campo>
              <Campo label="Estado"><Select value={f.estado} onChange={set('estado')}>{ESTADOS_CITA.map(e => <option key={e.value}>{e.value}</option>)}</Select></Campo>
              {conSedes && <Campo label="Sede"><Select value={f.sede} onChange={set('sede')}><option value="">—</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>}
              <Campo label="Tipo de consulta"><Select value={f.tipo} onChange={cambiarTipo}>{tiposDe(clinica?.especialidad, f.tipo).map(t => <option key={t}>{t}</option>)}</Select></Campo>
              <ServicioCampos tipo={f.tipo} servicios={servicios} valor={serv} onChange={setServ} conPrecio={!cita && finanzas} conPrecios={finanzas} />
            </Grid>
          </section>

          {!ficha && <div className="cita-dos">{medidasPaciente}</div>}
          {ficha && <>
            <section className="bloque">
              <h3>{esp.label}</h3>
              <CamposEspecialidad esp={clinica?.especialidad} valor={f.datos} onChange={set('datos')} />
            </section>

            <section className="bloque">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <h3 style={{ margin: 0 }}>Ficha de la consulta</h3>
                <span style={{ fontSize: 12.5, color: C.g400 }}>Seleccione una palabra o párrafo para darle color, resaltarlo o cambiar la letra. Las secciones se ajustan en Configuración → Ficha clínica.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
                {secciones.map(s => (
                  <div key={s.id}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.g700, marginBottom: 6 }}>{s.titulo}</div>
                    <EditorTexto valor={f.ficha[s.id]} onChange={setFicha(s.id)} placeholder={s.id === 'motivo' ? esp.notas : `Escriba ${s.titulo.toLowerCase()}…`} minAlto={s.id === 'hallazgos' || s.id === 'receta' ? 110 : 80} />
                  </div>
                ))}
                <Campo label="Procedimiento realizado / a realizar"><Textarea value={f.procedimiento} onChange={set('procedimiento')} rows={2} /></Campo>
              </div>
            </section>

            <section className="bloque">
              <h3>Fotos y documentos de esta consulta</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: C.g500 }}>Tipo:</span>
                <select value={etapa} onChange={e => setEtapa(e.target.value)} style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.g200}`, fontFamily: 'inherit', fontSize: 13.5, background: '#fff' }}>
                  {ETAPAS_FOTO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <BotonesSubir onArchivos={recibirArchivos} ocupado={subiendo ? `Subiendo ${subiendo} archivo(s)…` : ''} />
              {(archivos.length > 0 || pendientes.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginTop: 14 }}>
                  {archivos.map(a => (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" title={a.nombre || ''} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.g200}`, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: C.red, textDecoration: 'none' }}>
                      {(a.mime || '').startsWith('image/') ? <img src={a.url} alt={a.nombre || 'Foto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ textAlign: 'center', fontSize: 11, color: C.g600, padding: 6 }}><Icon name="pdf" size={28} style={{ color: C.red, display: 'block', margin: '0 auto 4px' }} />{a.nombre}</span>}
                    </a>
                  ))}
                  {pendientes.map((p, i) => (
                    <div key={p.url} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: `1px dashed ${C.purple}`, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                      {tipoArchivo(p.file).startsWith('image/') ? <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: C.g600, padding: 6, textAlign: 'center' }}><Icon name="pdf" size={28} style={{ color: C.red, display: 'block', margin: '0 auto 4px' }} />{p.file.name}</span>}
                      <button type="button" title="Quitar" onClick={() => setPendientes(l => l.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {pendientes.length > 0 && <div style={{ fontSize: 12.5, color: C.g400, marginTop: 8 }}>Se subirán al guardar la cita.</div>}
            </section>

            <section className="bloque" style={{ background: C.g50 }}>
              <h3><Icon name="candado" size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Notas internas</h3>
              <div style={{ fontSize: 12.5, color: C.g400, marginTop: -6, marginBottom: 8 }}>Solo las ve su consultorio; no salen en el portal ni en lo que comparte, salvo que usted las marque al imprimir.</div>
              <Textarea value={f.notas} onChange={set('notas')} rows={4} />
            </section>
          </>}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {clinico && (
            <section className="bloque">
              <h3>Portal del paciente</h3>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <Interruptor activo={f.portal} onChange={set('portal')} />
                <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>Mostrar esta consulta en el portal del paciente
                  <span style={{ display: 'block', fontSize: 12, color: C.g400 }}>{paciente?.portal_activo ? 'Su portal está activo' : 'Su portal aún no está publicado (se publica desde el expediente)'}</span></span>
              </label>
            </section>
          )}
          <section className="bloque">
            <h3>Mensaje para el paciente</h3>
            <MensajePaciente paciente={paciente} cita={citaActual} precio={precio} compacto />
          </section>
          {ficha && medidasPaciente}
        </aside>
      </div>
      {compartir && <CompartirExpediente paciente={paciente} citas={citas.filter(c => c.paciente_id === paciente.id).map(c => c.id === cita.id ? citaActual : c)} citaInicial={cita} onClose={() => setCompartir(false)} />}
    </div>
  )
}

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { useDatos } from '../hooks/useDatos'
import { atiendeCitas } from '../hooks/useHospital'
import { opcionesMedico, fraseMedico } from './HospitalCita'
import { TRIAGES, RESULTADOS, MOTIVOS_RAPIDOS, SEXOS_EM, mensajeEmergencia, hoyGT } from '../lib/emergencias'
import { esSoporte } from '../lib/permisos'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import { Campo, Input, Textarea } from './ui/Campos'
import { Desplegable } from './ui/Desplegable'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'
import { BotonesSubir, subirArchivos } from './SubirArchivos'
import { FaltanDatos } from './EmergenciaBits'
import { ConfirmarAtencionModal } from './ConfirmarAtencion'
import { useAtenciones } from '../hooks/useAtenciones'
import { puedeConfirmar } from '../lib/insumos'

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const caja = { width: '100%', justifyContent: 'space-between', padding: '12px 14px' }
const etiqueta = { fontSize: 13, fontWeight: 600, color: C.g600, marginBottom: 8 }

// Patients matching a search by name or phone (top `max`), identified patients only
function buscarPacientes(pacientes, texto, max = 6) {
  const q = sinTildes(texto).trim()
  if (!q) return []
  const digitos = q.replace(/\D/g, '')
  return pacientes
    .filter(p => !p.sin_identificar && (sinTildes(p.nombre).includes(q) || (digitos.length >= 3 && String(p.telefono || '').replace(/\D/g, '').includes(digitos))))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, max)
}

// Search box + the matches under it, navigable with the arrows and Enter
function BuscadorPacientes({ valor, onValor, onElegir, placeholder, autoFocus = true, sinResultado }) {
  const { pacientes } = useDatos()
  const [activo, setActivo] = useState(0)
  const lista = useMemo(() => buscarPacientes(pacientes, valor), [pacientes, valor])
  useEffect(() => { setActivo(0) }, [valor])
  const tecla = (e) => {
    if (!lista.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => Math.min(lista.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); onElegir(lista[activo]) }
  }
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <Icon name="buscar" size={17} style={{ position: 'absolute', left: 14, top: 14, color: C.g400 }} />
        <Input value={valor} onChange={onValor} onKeyDown={tecla} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder}
          role="combobox" aria-expanded={lista.length > 0} aria-controls="em-resultados" aria-autocomplete="list"
          style={{ width: '100%', padding: '13px 14px 13px 40px', border: `1px solid ${C.g200}`, borderRadius: 14, fontSize: 15, background: 'rgba(255,255,255,0.9)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>
      {lista.length > 0 && (
        <ul id="em-resultados" role="listbox" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
          {lista.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === activo}>
              <button type="button" onClick={() => onElegir(p)} onMouseEnter={() => setActivo(i)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 14.5,
                background: i === activo ? C.purpleMid : '#fff', borderTop: i ? `1px solid ${C.g100}` : 'none', color: C.black,
              }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                <span style={{ fontSize: 12.5, color: C.g500, flexShrink: 0 }}>{p.telefono || ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {valor.trim() && lista.length === 0 && <div style={{ fontSize: 13.5, color: C.g500, marginTop: 10 }}>{sinResultado || 'Ningún paciente coincide.'}</div>}
    </div>
  )
}

// Big selectable pill (patient mode, outcome…)
function Opcion({ activa, onClick, children, color = C.purple, bg = C.purpleMid, style }) {
  return (
    <button type="button" role="radio" aria-checked={activa} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, padding: '10px 14px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600, textAlign: 'center',
      border: `2px solid ${activa ? color : C.g200}`, background: activa ? bg : '#fff', color: activa ? color : C.g700, transition: 'border-color 0.12s, background 0.12s', ...style,
    }}>{children}</button>
  )
}

// ───────────────────────── Registrar llegada ─────────────────────────
export function RegistrarLlegada({ onClose }) {
  const { hospital, sedes, acc, perfil, emergencias } = useDatos()
  const [modo, setModo] = useState('buscar') // 'buscar' | 'nuevo' | 'sin'
  const [q, setQ] = useState('')
  const [pac, setPac] = useState(null)
  const [nombre, setNombre] = useState('')
  const [tel, setTel] = useState('')
  const [sexo, setSexo] = useState('')
  const [edad, setEdad] = useState('')
  const [triage, setTriage] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [acomp, setAcomp] = useState('')
  const [prof, setProf] = useState('')
  const conSedes = acc?.inventario && sedes.length > 0
  const [sede, setSede] = useState(sedes.length === 1 ? sedes[0].id : '')
  const [busy, setBusy] = useState(false)
  const enviando = useRef(false) // double-submit guard (state updates are asynchronous)
  const [listo, setListo] = useState(null)
  const [subidas, setSubidas] = useState(0)
  const [subiendo, setSubiendo] = useState(false)
  const areaMotivo = useRef(null)

  const depEmergencia = hospital.departamentos.find(d => d.es_emergencia && d.activo)
  const opcionesProf = useMemo(
    () => opcionesMedico({ profesionales: hospital.profesionales, departamentos: hospital.departamentos, departamentoId: depEmergencia?.id, sinMedico: 'Sin médico por ahora' }),
    [hospital.profesionales, hospital.departamentos, depEmergencia?.id],
  )
  const motivoLimpio = motivo.trim().replace(/:\s*$/, '').trim()
  const pacienteListo = modo === 'sin' || (modo === 'buscar' && !!pac) || (modo === 'nuevo' && nombre.trim().length >= 2)
  const valido = pacienteListo && triage != null && motivoLimpio.length >= 2

  const ponerChip = (chip) => {
    setMotivo(m => (m.trim() ? `${chip}: ${m.replace(/^\s+/, '')}` : `${chip}: `))
    setTimeout(() => { const a = areaMotivo.current; if (a) { a.focus(); a.setSelectionRange(a.value.length, a.value.length) } }, 0)
  }

  const registrar = async () => {
    if (!valido || enviando.current) return
    enviando.current = true; setBusy(true)
    const { data, error } = await supabase.rpc('emergencia_registrar', {
      p_paciente: modo === 'buscar' ? pac.id : null,
      p_nombre: modo === 'nuevo' ? nombre.trim() : null,
      p_telefono: modo === 'nuevo' ? tel.trim() || null : null,
      p_sexo: modo === 'sin' ? sexo || null : null,
      p_edad: modo === 'sin' ? edad.trim() || null : null,
      p_triage: triage, p_motivo: motivoLimpio, p_acompanante: acomp.trim() || null,
      p_profesional: prof || null, p_sede: conSedes ? sede || null : null,
    })
    if (error) { enviando.current = false; setBusy(false); toast.error(mensajeEmergencia(error, 'No se pudo registrar la llegada')); return }
    await emergencias.recargar(true) // the board shows it at once
    toast.success('Llegada registrada')
    setBusy(false)
    setListo({ ...data, nombre: modo === 'buscar' ? pac.nombre : modo === 'nuevo' ? nombre.trim() : 'Paciente sin identificar' })
  }

  const subir = async (files) => {
    setSubiendo(true)
    const errores = await subirArchivos(files, { clinicaId: perfil.clinica_id, pacienteId: listo.paciente_id, citaId: listo.cita_id, etapa: 'estudio', fecha: hoyGT() })
    setSubiendo(false)
    if (errores) toast.error(`${errores} archivo(s) no se pudieron subir`)
    if (files.length - errores > 0) { setSubidas(n => n + files.length - errores); toast.success(files.length === 1 ? 'Foto guardada' : 'Fotos guardadas') }
  }

  const alTeclear = (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.target.tagName === 'BUTTON') return
    if (listo) return
    e.preventDefault(); registrar()
  }

  if (listo) {
    return (
      <Modal title="Llegada registrada" subtitle={listo.nombre} onClose={onClose} maxWidth={520}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.greenLight, color: C.green, borderRadius: 14, padding: '12px 14px', marginBottom: 16, fontSize: 14.5, fontWeight: 600 }}>
          <Icon name="check" size={20} />El paciente ya aparece en el tablero.
        </div>
        {listo.sin_identificar && <div style={{ marginBottom: 16 }}><FaltanDatos paciente={{ sin_identificar: true }} /><span style={{ fontSize: 13.5, color: C.g600, marginLeft: 8 }}>Complete sus datos cuando pueda.</span></div>}
        <div style={etiqueta}>¿Quiere agregar fotos? (opcional)</div>
        <BotonesSubir onArchivos={subir} ocupado={subiendo ? 'Subiendo…' : ''} />
        {subidas > 0 && <div style={{ fontSize: 13.5, color: C.green, marginTop: 10 }}>{subidas} {subidas === 1 ? 'foto agregada' : 'fotos agregadas'}.</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <Button size="lg" icon="check" onClick={onClose} disabled={subiendo}>Listo</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Registrar llegada" subtitle="Paciente que llega sin cita" onClose={onClose} maxWidth={720}>
      <div onKeyDown={alTeclear}>
        <div style={etiqueta} id="em-paciente">1 · Paciente</div>
        <div role="radiogroup" aria-labelledby="em-paciente" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
          <Opcion activa={modo === 'buscar'} onClick={() => setModo('buscar')}><Icon name="buscar" size={17} />Buscar paciente</Opcion>
          <Opcion activa={modo === 'nuevo'} onClick={() => setModo('nuevo')}><Icon name="mas" size={17} />Paciente nuevo</Opcion>
          <Opcion activa={modo === 'sin'} onClick={() => setModo('sin')} color={C.amber} bg={C.amberLight}><Icon name="alerta" size={17} />No se puede identificar ahora</Opcion>
        </div>
        {modo === 'buscar' && (pac ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.purpleMid, borderRadius: 14, padding: '12px 14px' }}>
            <Icon name="check" size={18} style={{ color: C.purple }} />
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 15 }}>{pac.nombre}</div><div style={{ fontSize: 12.5, color: C.g500 }}>{pac.telefono || 'Sin teléfono'}</div></div>
            <Button size="sm" variant="ghost" onClick={() => { setPac(null); setQ('') }}>Cambiar</Button>
          </div>
        ) : (
          <BuscadorPacientes valor={q} onValor={setQ} onElegir={setPac} placeholder="Buscar paciente por nombre o teléfono"
            sinResultado={<>Ningún paciente coincide. <button type="button" onClick={() => { setNombre(q); setModo('nuevo') }} style={{ background: 'none', border: 'none', padding: 0, color: C.purple, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Registrarlo como paciente nuevo</button></>} />
        ))}
        {modo === 'nuevo' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Campo label="Nombre completo *"><Input value={nombre} onChange={setNombre} autoFocus maxLength={120} /></Campo>
            <Campo label="Teléfono (opcional)"><Input type="tel" value={tel} onChange={setTel} placeholder="5555-1234" maxLength={30} /></Campo>
          </div>
        )}
        {modo === 'sin' && (
          <div style={{ background: C.amberLight, borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 13.5, color: C.amber, marginBottom: 12, lineHeight: 1.5 }}>Se registra como «Sin identificar» y queda un aviso hasta que se completen sus datos. Todo lo de abajo es opcional.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 6 }} id="em-sexo">Sexo</div>
                <div role="radiogroup" aria-labelledby="em-sexo" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {SEXOS_EM.map(s => <Opcion key={s.value} activa={sexo === s.value} onClick={() => setSexo(sexo === s.value ? '' : s.value)} style={{ minHeight: 42, padding: '8px 12px', fontSize: 13.5, flex: '1 1 auto' }}>{s.label}</Opcion>)}
                </div>
              </div>
              <Campo label="Edad aproximada"><Input value={edad} onChange={setEdad} placeholder="Ej. 35 o «adulto mayor»" maxLength={20} /></Campo>
            </div>
          </div>
        )}

        <div style={{ ...etiqueta, marginTop: 20 }} id="em-triage">2 · Triaje *</div>
        <div role="radiogroup" aria-labelledby="em-triage" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8 }}>
          {TRIAGES.map(t => (
            <button key={t.n} type="button" role="radio" aria-checked={triage === t.n} onClick={() => setTriage(t.n)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 8px', minHeight: 78, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
              border: `3px solid ${triage === t.n ? t.color : 'transparent'}`, background: t.bg, color: t.texto, boxShadow: triage === t.n ? `0 0 0 2px #fff inset` : 'none',
            }}>
              <span style={{ width: 30, height: 30, borderRadius: 15, background: t.color, color: '#fff', fontSize: 16, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.n}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.15 }}>{t.label}</span>
            </button>
          ))}
        </div>

        <div style={{ ...etiqueta, marginTop: 20 }}>3 · Motivo de la visita *</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {MOTIVOS_RAPIDOS.map(m => (
            <button key={m} type="button" onClick={() => ponerChip(m)} style={{ padding: '8px 13px', minHeight: 38, borderRadius: 999, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, color: C.g700 }}>{m}</button>
          ))}
        </div>
        <textarea ref={areaMotivo} value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} maxLength={500} aria-label="Motivo de la visita" placeholder="¿Por qué viene el paciente?"
          style={{ width: '100%', padding: '11px 14px', border: `1px solid ${C.g200}`, borderRadius: 14, fontSize: 15, background: 'rgba(255,255,255,0.9)', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }} />

        <div style={{ ...etiqueta, marginTop: 20 }}>4 · Otros datos (opcional)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          <Campo label="Acompañante"><Input value={acomp} onChange={setAcomp} placeholder="Nombre y parentesco" maxLength={120} /></Campo>
          <Campo label="Médico que lo recibe"><Desplegable ariaLabel="Médico" value={prof} onChange={setProf} options={opcionesProf} style={caja} /></Campo>
          {conSedes && <Campo label="Sede"><Desplegable ariaLabel="Sede" value={sede} onChange={setSede} options={[{ value: '', label: 'Sin sede' }, ...sedes.map(s => ({ value: s.id, label: s.nombre }))]} style={caja} /></Campo>}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', marginTop: 24 }}>
          {!valido && <span style={{ fontSize: 13, color: C.g500, flex: 1, minWidth: 180 }}>{!pacienteListo ? 'Falta elegir o escribir el paciente' : triage == null ? 'Falta el triaje' : 'Falta el motivo'}</span>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button size="lg" icon="check" onClick={registrar} disabled={!valido || busy}>{busy ? 'Registrando…' : 'Registrar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ───────────────────────── Finalizar ─────────────────────────
export function FinalizarModal({ item, onClose }) {
  const { hospital, emergencias, perfil } = useDatos()
  const { activo: conInsumos } = useAtenciones() // hospital supplies available (SQL applied)
  const { em, cita, paciente } = item
  const [siguiente, setSiguiente] = useState(null) // the cita to confirm supplies for, right after finishing
  const hayMedicos = hospital.profesionales.some(atiendeCitas)
  const [resultado, setResultado] = useState('')
  const [nota, setNota] = useState('')
  const [prof, setProf] = useState(cita?.profesional_id || '')
  const [busy, setBusy] = useState(false)
  const enviando = useRef(false)
  const depEm = hospital.departamentos.find(d => d.es_emergencia && d.activo)
  const opciones = useMemo(
    () => opcionesMedico({ profesionales: hospital.profesionales, departamentos: hospital.departamentos, departamentoId: depEm?.id, actualId: cita?.profesional_id, sinMedico: 'Elija el médico' }),
    [hospital.profesionales, hospital.departamentos, depEm?.id, cita?.profesional_id],
  )
  // the assigned doctor is who confirms that the patient was attended (not needed when the patient left without being seen)
  const necesitaMedico = hayMedicos && resultado !== 'retirado'
  const medicoOk = !necesitaMedico || !!prof
  const valido = !!resultado && medicoOk && !!cita
  const medico = hospital.profesional(prof)

  const finalizar = async () => {
    if (!valido || enviando.current) return
    enviando.current = true; setBusy(true)
    if (!cita) { enviando.current = false; setBusy(false); toast.error('La cita todavía no se cargó. Intente de nuevo'); return }
    if (prof !== (cita?.profesional_id || '')) {
      const { error } = await supabase.from('citas').update({ profesional_id: prof || null }).eq('id', cita.id)
      if (error) { enviando.current = false; setBusy(false); toast.error('No se pudo asignar el médico'); return }
    }
    const { error } = await supabase.rpc('emergencia_estado', { p_cita: em.cita_id, p_estado: resultado, p_nota: nota.trim() || null })
    if (error) { enviando.current = false; setBusy(false); toast.error(mensajeEmergencia(error)); return }
    await emergencias.recargar(true)
    toast.success('Emergencia finalizada')
    // finished and attended: offer the supplies confirmation right away (it can also be done later from Citas)
    const hecha = { ...cita, estado: 'Asistió', profesional_id: prof || null }
    if (conInsumos && resultado !== 'retirado' && puedeConfirmar(perfil, hecha)) { enviando.current = false; setBusy(false); setSiguiente(hecha); return }
    onClose()
  }

  if (siguiente) return <ConfirmarAtencionModal cita={siguiente} paciente={paciente} subtituloExtra="Emergencia finalizada" onClose={onClose} />

  return (
    <Modal title="Finalizar emergencia" subtitle={paciente?.nombre} onClose={onClose} maxWidth={560}>
      <div style={etiqueta} id="em-resultado">¿Cómo terminó? *</div>
      <div role="radiogroup" aria-labelledby="em-resultado" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {RESULTADOS.map(r => <Opcion key={r.value} activa={resultado === r.value} onClick={() => setResultado(r.value)} color={r.color} bg={r.bg}>{r.label}</Opcion>)}
      </div>
      <div style={{ marginTop: 18 }}>
        <Campo label={necesitaMedico ? 'Médico que confirma la atención *' : 'Médico'} ayuda={medico ? `${fraseMedico(medico.nombre)} confirma que el paciente fue atendido.` : necesitaMedico ? 'El médico asignado confirma que el paciente fue atendido.' : undefined}>
          <Desplegable ariaLabel="Médico que confirma" value={prof} onChange={setProf} options={opciones} style={caja} />
        </Campo>
      </div>
      <div style={{ marginTop: 14 }}>
        <Campo label="Nota (opcional)"><Textarea value={nota} onChange={setNota} rows={2} maxLength={300} placeholder="Ej. Se envía a casa con indicaciones / Traslado al hospital regional" /></Campo>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="check" onClick={finalizar} disabled={!valido || busy}>{busy ? 'Guardando…' : 'Finalizar'}</Button>
      </div>
    </Modal>
  )
}

// ───────────────────────── Completar datos ─────────────────────────
export function CompletarDatosModal({ item, onClose }) {
  const { emergencias } = useDatos()
  const [modo, setModo] = useState('nuevo') // 'nuevo' | 'existente'
  const [nombre, setNombre] = useState('')
  const [tel, setTel] = useState('')
  const [q, setQ] = useState('')
  const [pac, setPac] = useState(null)
  const [busy, setBusy] = useState(false)
  const enviando = useRef(false)
  const valido = modo === 'nuevo' ? nombre.trim().length >= 2 : !!pac

  const guardar = async () => {
    if (!valido || enviando.current) return
    if (modo === 'existente' && !await confirmar({
      titulo: '¿Unir con este paciente?', subtitulo: pac.nombre,
      mensaje: ['La emergencia, sus fotos, cobros y productos usados pasan a este paciente y el registro «Sin identificar» se elimina. No se puede deshacer.'], aceptar: 'Unir',
    })) return
    enviando.current = true; setBusy(true)
    const { error } = await supabase.rpc('emergencia_identificar', {
      p_cita: item.em.cita_id, p_paciente: modo === 'existente' ? pac.id : null,
      p_nombre: modo === 'nuevo' ? nombre.trim() : null, p_telefono: modo === 'nuevo' ? tel.trim() || null : null,
    })
    if (error) { enviando.current = false; setBusy(false); toast.error(mensajeEmergencia(error)); return }
    await emergencias.recargar(true)
    toast.success(modo === 'existente' ? 'Emergencia unida al paciente' : 'Datos completados')
    onClose()
  }
  const alTeclear = (e) => { if (e.key === 'Enter' && !e.defaultPrevented && e.target.tagName === 'INPUT' && modo === 'nuevo') { e.preventDefault(); guardar() } }

  return (
    <Modal title="Completar datos del paciente" subtitle={item.paciente?.nombre} onClose={onClose} maxWidth={560}>
      <div onKeyDown={alTeclear}>
        <div role="radiogroup" aria-label="Qué desea hacer" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginBottom: 16 }}>
          <Opcion activa={modo === 'nuevo'} onClick={() => setModo('nuevo')}>Escribir sus datos</Opcion>
          <Opcion activa={modo === 'existente'} onClick={() => setModo('existente')}>Ya existe este paciente</Opcion>
        </div>
        {modo === 'nuevo' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Campo label="Nombre completo *"><Input value={nombre} onChange={setNombre} autoFocus maxLength={120} /></Campo>
            <Campo label="Teléfono (opcional)"><Input type="tel" value={tel} onChange={setTel} placeholder="5555-1234" maxLength={30} /></Campo>
          </div>
        ) : pac ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.purpleMid, borderRadius: 14, padding: '12px 14px' }}>
              <Icon name="check" size={18} style={{ color: C.purple }} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 15 }}>{pac.nombre}</div><div style={{ fontSize: 12.5, color: C.g500 }}>{pac.telefono || 'Sin teléfono'}</div></div>
              <Button size="sm" variant="ghost" onClick={() => { setPac(null); setQ('') }}>Cambiar</Button>
            </div>
            <div style={{ fontSize: 13, color: C.g500, marginTop: 10, lineHeight: 1.5 }}>La emergencia, sus fotos, cobros y productos usados pasan a este paciente y el registro «Sin identificar» se elimina.</div>
          </div>
        ) : (
          <BuscadorPacientes valor={q} onValor={setQ} onElegir={setPac} placeholder="Buscar paciente por nombre o teléfono" />
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button icon="check" onClick={guardar} disabled={!valido || busy}>{busy ? 'Guardando…' : modo === 'existente' ? 'Unir con este paciente' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ───────────────────────── Fotos ─────────────────────────
export function FotosModal({ item, onClose }) {
  const { perfil } = useDatos()
  const { cita, paciente } = item
  const [archivos, setArchivos] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const cargar = useCallback(async () => {
    if (!cita) return
    const { data } = await supabase.from('archivos').select('*').eq('cita_id', cita.id).order('created_at')
    const lista = data || []
    if (lista.length) {
      const { data: urls } = await supabase.storage.from('expedientes').createSignedUrls(lista.map(a => a.path), 3600)
      const porPath = Object.fromEntries((urls || []).map(u => [u.path, u.signedUrl]))
      lista.forEach(a => { a.url = porPath[a.path] })
    }
    setArchivos(lista)
  }, [cita?.id])
  useEffect(() => { cargar() }, [cargar])
  const subir = async (files) => {
    if (!cita) return
    setSubiendo(true)
    const errores = await subirArchivos(files, { clinicaId: perfil.clinica_id, pacienteId: cita.paciente_id, citaId: cita.id, etapa: 'estudio', fecha: cita.fecha || hoyGT() })
    setSubiendo(false)
    if (errores) toast.error(`${errores} archivo(s) no se pudieron subir`); else toast.success(files.length === 1 ? 'Archivo guardado' : 'Archivos guardados')
    cargar()
  }
  return (
    <Modal title="Fotos y documentos" subtitle={paciente?.nombre} onClose={onClose} maxWidth={620}>
      {!esSoporte(perfil) && <BotonesSubir onArchivos={subir} ocupado={subiendo ? 'Subiendo…' : ''} />}
      {archivos === null ? <div style={{ color: C.g500, marginTop: 16 }}>Cargando…</div> : archivos.length === 0 ? (
        <div style={{ color: C.g500, marginTop: 16, fontSize: 14 }}>Esta emergencia aún no tiene fotos.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginTop: 16 }}>
          {archivos.map(a => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" title={a.nombre || ''} style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.g200}`, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', color: C.red }}>
              {(a.mime || '').startsWith('image/') ? <img src={a.url} alt={a.nombre || 'Foto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ textAlign: 'center', fontSize: 11, color: C.g600, padding: 6 }}><Icon name="pdf" size={28} style={{ color: C.red, display: 'block', margin: '0 auto 4px' }} />{a.nombre}</span>}
            </a>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}><Button onClick={onClose}>Cerrar</Button></div>
    </Modal>
  )
}

// state change used by the board's quick buttons
export async function moverEstado(emergencias, citaId, estado, nota) {
  const { error } = await supabase.rpc('emergencia_estado', { p_cita: citaId, p_estado: estado, p_nota: nota || null })
  if (error) { toast.error(mensajeEmergencia(error)); return false }
  await emergencias.recargar(true)
  return true
}

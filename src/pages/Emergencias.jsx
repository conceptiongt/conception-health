import { useState, useMemo, useEffect, useCallback } from 'react'
import { C, SHADOW, GLASS } from '../lib/theme'
import { useDatos } from '../hooks/useDatos'
import { colorProfesional } from '../hooks/useHospital'
import { esSoporte } from '../lib/permisos'
import { slug } from '../lib/excel'
import { fmtFechaCorta } from '../lib/formato'
import {
  TRIAGES, EN_CURSO, ESTADOS_EM, triageDe, estadoEm, haceTexto, duracionTexto, demora, COLOR_DEMORA, horaGT, fechaHoraGT, hoyGT, hoyGTDe, minutosEntre,
} from '../lib/emergencias'
import { opcionesMedico } from '../components/HospitalCita'
import { Encabezado, Vacio, Pestanas, Tabla } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Desplegable } from '../components/ui/Desplegable'
import { filtroStyle } from '../components/ui/Campos'
import { MiniCalendario } from '../components/MiniCalendario'
import { Exportar } from '../components/Documento'
import { confirmar } from '../components/ui/Confirmar'
import { toast } from '../components/ui/Toast'
import { supabase } from '../lib/supabase'
import { leerRango } from '../hooks/useEmergencias'
import { FaltanDatos, EtiquetaTriage, EstadoEm } from '../components/EmergenciaBits'
import { RegistrarLlegada, FinalizarModal, CompletarDatosModal, FotosModal, moverEstado } from '../components/EmergenciaModales'

// re-render every 20 s so «hace 12 min» and the delay colours stay current
function useAhora(ms = 20000) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setT(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return t
}

const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Emergencias({ sub }) {
  const { hospital, emergencias, pacientes, citas, perfil, clinica, ir } = useDatos()
  const soporte = esSoporte(perfil)
  const ahora = useAhora()
  const [registrar, setRegistrar] = useState(false)
  const [finalizar, setFinalizar] = useState(null)
  const [completar, setCompletar] = useState(null)
  const [fotos, setFotos] = useState(null)
  const [refrescando, setRefrescando] = useState(false)
  const historial = sub === 'historial'

  const pacPorId = useMemo(() => new Map(pacientes.map(p => [p.id, p])), [pacientes])
  const citaPorId = useMemo(() => new Map(citas.map(c => [c.id, c])), [citas])
  // every emergency with its cita and patient (the patient comes from the cita: that is where a merge points)
  const armar = useCallback((filas) => filas.map(em => {
    const cita = citaPorId.get(em.cita_id)
    return { em, cita, paciente: pacPorId.get(cita?.paciente_id ?? em.paciente_id) }
  }), [citaPorId, pacPorId])
  const items = useMemo(() => armar(emergencias.filas), [armar, emergencias.filas])
  const abiertas = useMemo(() => items.filter(i => !i.em.cerrado_at), [items])
  const sinIdentificar = useMemo(() => pacientes.filter(p => p.sin_identificar), [pacientes])

  // keyboard shortcut N: register an arrival only when nothing else is taking the keyboard (typing, an open list, a Desplegable, a window)
  useEffect(() => {
    if (soporte) return
    const fn = (e) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key?.toLowerCase() !== 'n') return
      const a = document.activeElement
      if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable || a.closest?.('[role="listbox"], [aria-haspopup="listbox"], [contenteditable]:not([contenteditable="false"])'))) return
      if (document.querySelector('[role="dialog"], [role="listbox"]')) return // any open window or open list
      e.preventDefault(); setRegistrar(true)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [soporte])

  if (hospital.disponible && emergencias.cargado && emergencias.fallo && !emergencias.disponible) {
    return (
      <>
        <Encabezado titulo="Emergencias" />
        <Vacio icono="emergencia" titulo="No se pudieron cargar las emergencias" texto="Revise su conexión. Se reintentará automáticamente.">
          <Button icon="refrescar" onClick={() => emergencias.recargar(true)}>Reintentar</Button>
        </Vacio>
      </>
    )
  }
  if (!hospital.disponible || (emergencias.cargado && !emergencias.disponible)) {
    return (
      <>
        <Encabezado titulo="Emergencias" />
        <Vacio icono="emergencia" titulo="Disponible pronto" texto="Estamos terminando de preparar las emergencias de su hospital. Le avisaremos cuando pueda usarlas." />
      </>
    )
  }

  const actualizar = async () => { setRefrescando(true); await emergencias.recargar(true); setRefrescando(false) }
  const abrirExpediente = (it) => it.paciente && ir('expedientes', it.paciente.id)
  const conTabla = !!emergencias.cargado

  return (
    <>
      <Encabezado titulo="Emergencias" subtitulo={`${abiertas.length} ${abiertas.length === 1 ? 'paciente en curso' : 'pacientes en curso'} · atención las 24 horas`}>
        <Button variant="ghost" icon="refrescar" onClick={actualizar} disabled={refrescando}>{refrescando ? 'Actualizando…' : 'Actualizar'}</Button>
        {!soporte && <Button size="lg" icon="mas" onClick={() => setRegistrar(true)} title="Atajo: tecla N">Registrar llegada <kbd style={{ fontFamily: 'inherit', fontSize: 11.5, padding: '1px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.28)', marginLeft: 4 }}>N</kbd></Button>}
      </Encabezado>

      <div style={{ marginBottom: 16 }}>
        <Pestanas valor={historial ? 'historial' : ''} onChange={(v) => ir('emergencias', v || null)}
          opciones={[{ value: '', label: `En curso (${abiertas.length})`, icono: 'actividad' }, { value: 'historial', label: 'Historial', icono: 'libro' }]} />
      </div>

      {sinIdentificar.length > 0 && (
        <div role="status" style={{ background: C.amberLight, color: C.amber, border: '1px solid #F2CD92', borderRadius: 18, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Icon name="alerta" size={20} />
          <div style={{ flex: 1, minWidth: 220, fontSize: 14.5, fontWeight: 600 }}>
            {sinIdentificar.length === 1 ? '1 paciente sin identificar' : `${sinIdentificar.length} pacientes sin identificar`}: complete sus datos.
          </div>
          {!soporte && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sinIdentificar.slice(0, 3).map(p => {
                const it = items.find(i => i.paciente?.id === p.id)
                return it ? <Button key={p.id} size="sm" variant="ghost" icon="editar" onClick={() => setCompletar(it)} title={p.nombre}>Completar {p.nombre.replace(/^Sin identificar — /, '')}</Button> : null
              })}
            </div>
          )}
        </div>
      )}

      {!conTabla ? null : historial
        ? <Historial armar={armar} ahora={ahora} soporte={soporte} onExpediente={abrirExpediente} />
        : <Tablero abiertas={abiertas} ahora={ahora} soporte={soporte} hospital={hospital} emergencias={emergencias}
            onFinalizar={setFinalizar} onCompletar={setCompletar} onFotos={setFotos} onExpediente={abrirExpediente} onRegistrar={() => setRegistrar(true)} />}

      {registrar && <RegistrarLlegada onClose={() => setRegistrar(false)} />}
      {finalizar && <FinalizarModal item={finalizar} onClose={() => setFinalizar(null)} />}
      {completar && <CompletarDatosModal item={completar} onClose={() => setCompletar(null)} />}
      {fotos && <FotosModal item={fotos} onClose={() => setFotos(null)} />}
    </>
  )
}

// ───────────────────────── Board ─────────────────────────
function Tablero({ abiertas, ahora, soporte, hospital, emergencias, onFinalizar, onCompletar, onFotos, onExpediente, onRegistrar }) {
  const orden = (a, b) => (a.em.triage - b.em.triage) || String(a.em.llegada_at).localeCompare(String(b.em.llegada_at))
  if (abiertas.length === 0) {
    return (
      <Vacio icono="emergencia" titulo="No hay emergencias en curso" texto="Cuando llegue un paciente sin cita, regístrelo aquí.">
        {!soporte && <Button size="lg" icon="mas" onClick={onRegistrar}>Registrar llegada</Button>}
      </Vacio>
    )
  }
  return (
    <div className="em-tablero">
      {EN_CURSO.map(col => {
        const lista = abiertas.filter(i => i.em.estado === col.value).sort(orden)
        return (
          <section key={col.value} aria-label={`${col.label}: ${lista.length}`} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 4px' }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 10, background: col.color }} />
              <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 600, color: C.black }}>{col.label}</h2>
              <span style={{ minWidth: 22, padding: '1px 8px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: col.bg, color: col.color, textAlign: 'center' }}>{lista.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lista.length === 0 && <div style={{ border: `1px dashed ${C.g200}`, borderRadius: 18, padding: '22px 16px', textAlign: 'center', color: C.g400, fontSize: 13.5 }}>Sin pacientes</div>}
              {lista.map(it => <Tarjeta key={it.em.cita_id} item={it} ahora={ahora} soporte={soporte} hospital={hospital} emergencias={emergencias}
                onFinalizar={onFinalizar} onCompletar={onCompletar} onFotos={onFotos} onExpediente={onExpediente} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Tarjeta({ item, ahora, soporte, hospital, emergencias, onFinalizar, onCompletar, onFotos, onExpediente }) {
  const { em, cita, paciente } = item
  const t = triageDe(em.triage)
  const nivel = demora(em, ahora)
  const col = COLOR_DEMORA[nivel]
  const [ocupado, setOcupado] = useState(false)
  const depEm = hospital.departamentos.find(d => d.es_emergencia && d.activo)
  const opciones = useMemo(
    () => opcionesMedico({ profesionales: hospital.profesionales, departamentos: hospital.departamentos, departamentoId: depEm?.id, actualId: cita?.profesional_id, sinMedico: 'Sin médico' }),
    [hospital.profesionales, hospital.departamentos, depEm?.id, cita?.profesional_id],
  )
  const medico = hospital.profesional(cita?.profesional_id)

  const mover = async (estado) => {
    setOcupado(true)
    const ok = await moverEstado(emergencias, em.cita_id, estado)
    setOcupado(false)
    if (ok) toast.success(estado === 'atencion' ? 'Paciente en atención' : 'Paciente en observación')
  }
  return (
    <article style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, overflow: 'hidden', boxShadow: SHADOW, minWidth: 0 }}>
      <div aria-hidden="true" style={{ height: 7, background: t.color }} />
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <EtiquetaTriage triage={em.triage} corto />
          <FaltanDatos paciente={paciente} />
        </div>
        <div>
          <div style={{ fontSize: 16.5, fontWeight: 600, color: C.black, overflowWrap: 'anywhere', lineHeight: 1.25 }}>{paciente?.sin_identificar ? 'Sin identificar' : paciente?.nombre || '—'}</div>
          {paciente?.sin_identificar && <div style={{ fontSize: 12.5, color: C.g500, marginTop: 2, overflowWrap: 'anywhere' }}>{paciente.nombre.replace(/^Sin identificar — /, '')}</div>}
        </div>
        <div style={{ fontSize: 14, color: C.g700, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }} title={em.motivo}>{em.motivo}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 8, fontWeight: 600, color: col.color, background: col.bg }}>
            <Icon name="reloj" size={14} />{haceTexto(em.llegada_at, ahora)}
          </span>
          {nivel === 'rojo' && <strong style={{ color: C.red }}>Demora</strong>}
          {nivel === 'ambar' && <strong style={{ color: C.amber }}>Atender pronto</strong>}
          <span style={{ color: C.g500 }}>Llegó {horaGT(em.llegada_at)}</span>
        </div>
        {em.acompanante && <div style={{ fontSize: 12.5, color: C.g500, overflowWrap: 'anywhere' }}>Acompañante: {em.acompanante}</div>}
        <Desplegable ariaLabel="Médico asignado" value={cita?.profesional_id || ''} options={opciones} disabled={soporte || ocupado || !cita}
          onChange={async (id) => {
            setOcupado(true)
            const { error } = await supabase.from('citas').update({ profesional_id: id || null }).eq('id', cita.id)
            if (error) toast.error('No se pudo asignar el médico')
            else { await emergencias.recargar(true); toast.success(id ? 'Médico asignado' : 'Médico quitado') }
            setOcupado(false)
          }}
          style={{ width: '100%', justifyContent: 'space-between', padding: '9px 12px', fontSize: 13.5, borderColor: medico ? undefined : '#F2CD92', background: medico ? undefined : C.amberLight }} />
        {!soporte && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {em.estado === 'espera' && <Button icon="play" onClick={() => mover('atencion')} disabled={ocupado} style={{ flex: '1 1 140px' }}>Pasar a atención</Button>}
            {em.estado === 'atencion' && <Button variant="soft" onClick={() => mover('observacion')} disabled={ocupado} style={{ flex: '1 1 120px' }}>Observación</Button>}
            {em.estado === 'observacion' && <Button variant="soft" onClick={() => mover('atencion')} disabled={ocupado} style={{ flex: '1 1 120px' }}>Pasar a atención</Button>}
            <Button variant={em.estado === 'espera' ? 'ghost' : 'primary'} icon="check" onClick={() => onFinalizar(item)} disabled={ocupado || !cita} title={!cita ? 'Cargando la cita…' : undefined} style={{ flex: '1 1 110px' }}>Finalizar</Button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderTop: `1px solid ${C.g100}`, paddingTop: 8, marginTop: 2 }}>
          <Button size="sm" variant="texto" icon="camara" onClick={() => onFotos(item)} disabled={!cita} title={!cita ? 'Cargando la cita…' : undefined}>Fotos</Button>
          <Button size="sm" variant="texto" icon="expedientes" onClick={() => onExpediente(item)} disabled={!paciente}>Abrir expediente</Button>
          {!soporte && paciente?.sin_identificar && <Button size="sm" variant="soft" icon="editar" onClick={() => onCompletar(item)}>Completar datos</Button>}
        </div>
      </div>
    </article>
  )
}

// ───────────────────────── History ─────────────────────────
function Historial({ armar, ahora, soporte, onExpediente }) {
  const { hospital, emergencias, clinica } = useDatos()
  const [desde, setDesde] = useState(() => hoyGT(6))
  const [hasta, setHasta] = useState(() => hoyGT(0))
  const [triage, setTriage] = useState('')
  const [resultado, setResultado] = useState('')
  const [medico, setMedico] = useState('')
  const [buscar, setBuscar] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // the shared state only holds recent emergencies: this view loads its own date range (paginated beyond 1000 rows)
  const [filas, setFilas] = useState(null)
  const [fallo, setFallo] = useState(false)
  const version = emergencias.version
  useEffect(() => {
    let vigente = true
    leerRango(desde, hasta).then(r => {
      if (!vigente) return
      if (r.error) setFallo(true) // keeps the rows already shown
      else { setFilas(r.filas); setFallo(false) }
    })
    return () => { vigente = false }
  }, [desde, hasta, version])
  const items = useMemo(() => armar(filas || []), [armar, filas])

  const q = normalizar(buscar).trim()
  const lista = useMemo(() => items.filter(({ em, cita, paciente }) => {
    const f = hoyGTDe(em.llegada_at)
    if (f < desde || f > hasta) return false
    if (triage && em.triage !== Number(triage)) return false
    if (resultado && em.estado !== resultado) return false
    if (medico === '_sin' ? !!cita?.profesional_id : medico && cita?.profesional_id !== medico) return false
    if (q && !normalizar(paciente?.nombre).includes(q)) return false
    return true
  }).sort((a, b) => String(b.em.llegada_at).localeCompare(String(a.em.llegada_at))), [items, desde, hasta, triage, resultado, medico, q])

  const esperas = lista.map(i => minutosEntre(i.em.llegada_at, i.em.atendido_at)).filter(n => n != null)
  const promedio = esperas.length ? Math.round(esperas.reduce((a, b) => a + b, 0) / esperas.length) : null
  const cuantos = (n) => lista.filter(i => i.em.triage === n).length

  const nombreMedico = (cita) => hospital.profesional(cita?.profesional_id)?.nombre || ''
  const rangoTexto = `Del ${fmtFechaCorta(desde)} al ${fmtFechaCorta(hasta)}`
  const filtroTexto = [rangoTexto, triage && `Triaje ${triage}`, resultado && estadoEm(resultado).label, medico === '_sin' ? 'Sin médico' : medico && hospital.profesional(medico)?.nombre, q && `"${buscar}"`].filter(Boolean).join(' · ')
  const preparar = () => ({
    titulo: 'Emergencias', subtitulo: `${filtroTexto} · ${lista.length} ${lista.length === 1 ? 'emergencia' : 'emergencias'}`,
    secciones: [{ tabla: {
      headers: ['Llegada', 'Paciente', 'Triaje', 'Motivo', 'Médico', 'Resultado', 'Hasta la atención', 'Tiempo total'],
      filas: lista.map(({ em, cita, paciente }) => [fechaHoraGT(em.llegada_at), paciente?.nombre || '—', `${em.triage} · ${triageDe(em.triage).label}`, em.motivo, nombreMedico(cita) || '—', estadoEm(em.estado).label,
        em.atendido_at ? duracionTexto(minutosEntre(em.llegada_at, em.atendido_at)) : '—', em.cerrado_at ? duracionTexto(minutosEntre(em.llegada_at, em.cerrado_at)) : 'En curso']),
    } }],
    excel: { archivo: `emergencias_${slug(filtroTexto)}`, hojas: [{ nombre: 'Emergencias', columnas: [
      { header: 'Llegada', key: 'llegada', width: 18 }, { header: 'Paciente', key: 'paciente', width: 30 }, { header: 'Triaje', key: 'triaje', width: 18 }, { header: 'Motivo', key: 'motivo', width: 40 },
      { header: 'Médico', key: 'medico', width: 24 }, { header: 'Resultado', key: 'resultado', width: 22 }, { header: 'Minutos hasta la atención', key: 'espera', width: 14 },
      { header: 'Minutos totales', key: 'total', width: 14 }, { header: 'Nota del destino', key: 'nota', width: 30 }, { header: 'Acompañante', key: 'acomp', width: 22 },
    ], filas: lista.map(({ em, cita, paciente }) => ({
      llegada: fechaHoraGT(em.llegada_at), paciente: paciente?.nombre, triaje: `${em.triage} · ${triageDe(em.triage).label}`, motivo: em.motivo, medico: nombreMedico(cita),
      resultado: estadoEm(em.estado).label, espera: minutosEntre(em.llegada_at, em.atendido_at), total: minutosEntre(em.llegada_at, em.cerrado_at), nota: em.destino_nota, acomp: em.acompanante,
    })) }] },
  })

  const reabrir = async (it) => {
    if (!await confirmar({ titulo: '¿Reabrir esta emergencia?', subtitulo: it.paciente?.nombre, mensaje: ['Vuelve al tablero «En espera» y su cita queda como pendiente.'], aceptar: 'Reabrir' })) return
    setOcupado(true)
    const ok = await moverEstado(emergencias, it.em.cita_id, 'espera')
    setOcupado(false)
    if (ok) toast.success('Emergencia reabierta')
  }

  const chip = (children, key) => <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.g700 }}>{children}</span>
  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(150px, 1fr))', gap: 12, flex: '1 1 340px', maxWidth: 460 }}>
          <MiniCalendario etiqueta="Desde" valor={desde} onElegir={(v) => { setDesde(v); if (v > hasta) setHasta(v) }} />
          <MiniCalendario etiqueta="Hasta" valor={hasta} minimo={desde} onElegir={(v) => { setHasta(v); if (v < desde) setDesde(v) }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: '2 1 360px', paddingTop: 26 }}>
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar paciente por nombre…" aria-label="Buscar paciente" style={{ ...filtroStyle, flex: '1 1 200px', minWidth: 0 }} />
          <Desplegable ariaLabel="Triaje" value={triage} onChange={setTriage} options={[{ value: '', label: 'Todo triaje' }, ...TRIAGES.map(t => ({ value: String(t.n), label: `${t.n} · ${t.label}`, punto: t.color }))]} />
          <Desplegable ariaLabel="Resultado" value={resultado} onChange={setResultado} options={[{ value: '', label: 'Todo resultado' }, ...ESTADOS_EM.map(e => ({ value: e.value, label: e.label }))]} />
          <Desplegable ariaLabel="Médico" value={medico} onChange={setMedico} options={[{ value: '', label: 'Todo médico' }, { value: '_sin', label: 'Sin médico' }, ...hospital.profesionales.filter(p => p.activo || p.id === medico).map(p => ({ value: p.id, label: p.nombre, punto: colorProfesional(p, hospital.profesionales.indexOf(p)) }))]} />
          <Exportar clinica={clinica?.nombre} preparar={preparar} />
        </div>
      </div>

      {fallo && <div role="alert" style={{ background: C.redLight, color: C.red, borderRadius: 14, padding: '10px 14px', marginBottom: 12, fontSize: 14 }}>No se pudo actualizar el historial. Se muestran los datos anteriores.</div>}
      <div role="group" aria-label="Resumen del historial" style={{ ...GLASS, borderRadius: 18, padding: '12px 16px', marginBottom: 14, display: 'flex', gap: '8px 20px', flexWrap: 'wrap', alignItems: 'center', boxShadow: SHADOW }}>
        {chip(<><strong style={{ fontSize: 20, color: C.black }}>{lista.length}</strong> {lista.length === 1 ? 'emergencia' : 'emergencias'}</>, 'total')}
        {TRIAGES.map(t => chip(<><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, background: t.color }} />Triaje {t.n}: <strong>{cuantos(t.n)}</strong></>, t.n))}
        {chip(<>Espera promedio hasta la atención: <strong>{promedio == null ? '—' : duracionTexto(promedio)}</strong></>, 'prom')}
      </div>

      <Tabla
        columnas={['Llegada', 'Paciente', 'Triaje', 'Motivo', 'Médico', 'Resultado', 'Hasta la atención', 'Tiempo total', '']}
        vacio={filas === null ? 'Cargando…' : 'No hay emergencias con estos filtros'}
        filas={lista.map(it => {
          const { em, cita, paciente } = it
          const m = hospital.profesional(cita?.profesional_id)
          return { key: em.cita_id, celdas: [
            fechaHoraGT(em.llegada_at),
            <span style={{ fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{paciente?.nombre || '—'}<FaltanDatos paciente={paciente} /></span>,
            <EtiquetaTriage triage={em.triage} corto />,
            <span title={em.motivo} style={{ whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minWidth: 160, maxWidth: 260 }}>{em.motivo}</span>,
            m ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, background: colorProfesional(m, hospital.profesionales.indexOf(m)) }} />{m.nombre}</span> : <span style={{ color: C.g400 }}>Sin médico</span>,
            <EstadoEm estado={em.estado} />,
            em.atendido_at ? duracionTexto(minutosEntre(em.llegada_at, em.atendido_at)) : <span style={{ color: C.g400 }}>{em.cerrado_at ? 'No atendido' : `Esperando ${duracionTexto(minutosEntre(em.llegada_at, new Date(ahora).toISOString()))}`}</span>,
            em.cerrado_at ? duracionTexto(minutosEntre(em.llegada_at, em.cerrado_at)) : <span style={{ color: C.g400 }}>En curso</span>,
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <Button size="sm" variant="texto" icon="expedientes" onClick={() => onExpediente(it)} disabled={!paciente}>Expediente</Button>
              {!soporte && em.cerrado_at && <Button size="sm" variant="texto" icon="repetir" onClick={() => reabrir(it)} disabled={ocupado}>Reabrir</Button>}
            </span>,
          ] }
        })}
      />
    </>
  )
}

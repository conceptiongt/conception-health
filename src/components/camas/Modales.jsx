import { useState, useMemo } from 'react'
import { C } from '../../lib/theme'
import { puede, esSoporte } from '../../lib/permisos'
import { useDatos } from '../../hooks/useDatos'
import { colorProfesional } from '../../hooks/useHospital'
import { EGRESOS, SIGNOS, TIPOS_NOTA, agregarNota, darEgreso, diasIngresado, ingresarPaciente, textoDias, trasladarPaciente, useNotas } from '../../hooks/useCamas'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Campo, Input, Textarea } from '../ui/Campos'
import { Desplegable } from '../ui/Desplegable'
import { Badge, Segmentos } from '../ui/Varios'
import { Icon } from '../ui/Icon'
import { toast } from '../ui/Toast'
import { confirmar } from '../ui/Confirmar'
import { PacientePicker } from '../PacientePicker'
import { textoError } from '../quirofanos/comun'

const caja = { width: '100%', justifyContent: 'space-between', padding: '11px 14px' }
export const fechaHora = (ts) => new Date(ts).toLocaleString('es-GT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Lookups shared by the bed screens
export function useCamasEquipo(abiertas) {
  const { hospital, pacientes } = useDatos()
  return useMemo(() => {
    const camas = hospital.recursos.filter(r => r.tipo === 'cama' && r.activo)
    const area = (id) => hospital.areas.find(a => a.id === id)
    const ocupada = (camaId) => abiertas.find(e => e.cama_id === camaId)
    return {
      camas, area, ocupada,
      cama: (id) => hospital.recursos.find(r => r.id === id),
      paciente: (id) => pacientes.find(p => p.id === id),
      medico: (id) => hospital.profesional(id),
      colorMedico: (id) => { const m = hospital.profesional(id); return m ? colorProfesional(m, hospital.profesionales.indexOf(m)) : null },
      libres: camas.filter(c => !c.fuera_de_servicio && !ocupada(c.id)),
      etiquetaCama: (c) => `${area(c.area_id)?.nombre ? `${area(c.area_id).nombre} · ` : ''}${c.nombre || ''}`,
    }
  }, [hospital, pacientes, abiertas])
}

// ─── Admit a patient ───
export function IngresarModal({ cama, abiertas, onClose, onGuardado }) {
  const { hospital, ir } = useDatos()
  const eq = useCamasEquipo(abiertas)
  const [f, setF] = useState({ paciente: '', cama: cama?.id || '', profesional: '', departamento: '', motivo: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => { setError(''); setF(x => ({ ...x, [k]: v })) }
  const medicos = hospital.profesionales.filter(p => p.activo && p.funcion === 'medico')
  const ingresados = Object.fromEntries(abiertas.map(e => [e.paciente_id, `Ya ingresado · ${eq.cama(e.cama_id)?.nombre || 'otra cama'}`]))
  const elegirMedico = (id) => {
    const m = hospital.profesional(id)
    setError(''); setF(x => ({ ...x, profesional: id, departamento: x.departamento || (m?.departamento_id && hospital.departamento(m.departamento_id)?.activo ? m.departamento_id : '') }))
  }
  const guardar = async () => {
    if (!f.paciente) { setError('Elija el paciente.'); return }
    if (!f.cama) { setError('Elija la cama.'); return }
    if (f.motivo.trim().length < 2) { setError('Escriba el motivo de ingreso.'); return }
    setBusy(true)
    const { error: err } = await ingresarPaciente({ paciente: f.paciente, cama: f.cama, profesional: f.profesional, departamento: f.departamento, motivo: f.motivo.trim() })
    setBusy(false)
    if (err) { const t = textoError(err); setError(t); if (/CAMA_OCUPADA|PACIENTE_INGRESADO/.test(err.message || '')) onGuardado(false); return }
    toast.success(`Paciente ingresado en ${eq.cama(f.cama)?.nombre || 'la cama'}`)
    await onGuardado(true)
    onClose()
  }
  return (
    <Modal title="Ingresar paciente" subtitle={cama ? `${eq.etiquetaCama(cama)}` : 'Elija una cama libre'} onClose={onClose} maxWidth={620}>
      <div style={{ display: 'grid', gap: 16 }}>
        <Campo label="Paciente *"><PacientePicker valor={f.paciente} onChange={set('paciente')} deshabilitados={ingresados} onNuevo={() => { onClose(); ir('registrar') }} /></Campo>
        <Campo label="Cama *">
          <Desplegable ariaLabel="Cama" value={f.cama} onChange={set('cama')} placeholder="Elija una cama libre" style={caja}
            options={eq.libres.map(c => ({ value: c.id, label: eq.etiquetaCama(c) }))} />
        </Campo>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          <Campo label="Médico tratante">
            <Desplegable ariaLabel="Médico tratante" value={f.profesional} onChange={elegirMedico} style={caja}
              options={[{ value: '', label: 'Sin asignar' }, ...medicos.map(p => ({ value: p.id, label: p.nombre, punto: colorProfesional(p, hospital.profesionales.indexOf(p)) }))]} />
          </Campo>
          <Campo label="Especialidad">
            <Desplegable ariaLabel="Especialidad" value={f.departamento} onChange={set('departamento')} style={caja}
              options={[{ value: '', label: 'Sin especialidad' }, ...hospital.departamentos.filter(d => d.activo).map(d => ({ value: d.id, label: d.nombre }))]} />
          </Campo>
        </div>
        <Campo label="Motivo de ingreso *"><Textarea value={f.motivo} onChange={set('motivo')} rows={3} maxLength={300} placeholder="Ej. Neumonía, observación postoperatoria…" /></Campo>
      </div>
      {error && <div role="alert" style={{ marginTop: 16, background: C.redLight, color: C.red, borderRadius: 14, padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10 }}><Icon name="alerta" size={16} style={{ marginTop: 2 }} /><span>{error}</span></div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="check" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Ingresar paciente'}</Button>
      </div>
    </Modal>
  )
}

// ─── Stay: patient, notes and actions ───
export function EstanciaModal({ estancia, abiertas, onClose, onCambio }) {
  const { perfil, ir, hospital } = useDatos()
  const eq = useCamasEquipo(abiertas)
  const lectura = esSoporte(perfil)
  const paciente = eq.paciente(estancia.paciente_id), cama = eq.cama(estancia.cama_id), medico = eq.medico(estancia.profesional_id)
  const dep = hospital.departamento(estancia.departamento_id)
  const { notas, recargar } = useNotas(estancia.id)
  const [nota, setNota] = useState(false)
  const [traslado, setTraslado] = useState(false)
  const [egreso, setEgreso] = useState(false)

  return (
    <Modal title={paciente?.nombre || 'Paciente'} subtitle={`${eq.etiquetaCama(cama || {})} · ${textoDias(diasIngresado(estancia))}${diasIngresado(estancia) === 0 ? '' : ' ingresado'}`} onClose={onClose} maxWidth={680}>
      <div style={{ fontSize: 14, display: 'grid', gap: 6, marginBottom: 14 }}>
        <div><span style={{ color: C.g500 }}>Motivo: </span>{estancia.motivo}</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span><span style={{ color: C.g500 }}>Médico: </span>{medico ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, background: eq.colorMedico(medico.id) }} />{medico.nombre}</span> : 'Sin asignar'}</span>
          {dep && <span><span style={{ color: C.g500 }}>Especialidad: </span>{dep.nombre}</span>}
          <span><span style={{ color: C.g500 }}>Ingresó: </span>{fechaHora(estancia.ingreso_at)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {!lectura && <Button size="sm" icon="mas" variant={nota ? 'soft' : 'primary'} onClick={() => setNota(n => !n)}>Agregar nota</Button>}
        {!lectura && <Button size="sm" variant="ghost" icon="repetir" onClick={() => setTraslado(true)}>Trasladar de cama</Button>}
        {!lectura && <Button size="sm" variant="ghost" icon="salir" onClick={() => setEgreso(true)}>Dar egreso</Button>}
        {paciente && puede(perfil, 'expedientes') && <Button size="sm" variant="ghost" icon="expedientes" onClick={() => { onClose(); ir('expedientes', paciente.id) }}>Abrir expediente</Button>}
      </div>

      {nota && !lectura && <NotaForm estancia={estancia} onListo={async () => { setNota(false); await recargar() }} onCancelar={() => setNota(false)} />}

      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.g400, margin: '4px 0 8px' }}>Notas</div>
      {notas === null ? <div style={{ color: C.g400, fontSize: 13.5 }}>Cargando…</div> : notas.length === 0 ? <div style={{ color: C.g400, fontSize: 13.5 }}>Todavía no hay notas.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {notas.map(n => (
            <div key={n.id} style={{ padding: '10px 0', borderTop: `1px solid ${C.g100}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <Badge color={C.purpleDark} bg={C.purpleMid}>{TIPOS_NOTA.find(t => t.value === n.tipo)?.label || n.tipo}</Badge>
                <span style={{ fontSize: 12.5, color: C.g500 }}>{fechaHora(n.created_at)}{n.autor_nombre ? ` · ${n.autor_nombre}` : ''}</span>
              </div>
              {n.texto && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.texto}</div>}
              {n.signos && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {SIGNOS.filter(s => n.signos[s.k] != null && n.signos[s.k] !== '').map(s => <span key={s.k} style={{ padding: '3px 9px', borderRadius: 8, background: C.g100, fontSize: 13 }}><span style={{ color: C.g500 }}>{s.label}: </span><strong>{n.signos[s.k]}</strong> {s.unidad}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {traslado && <TrasladoModal estancia={estancia} abiertas={abiertas} onClose={() => setTraslado(false)} onListo={async () => { setTraslado(false); await onCambio(); await recargar() }} />}
      {egreso && <EgresoModal estancia={estancia} paciente={paciente} cama={cama} onClose={() => setEgreso(false)} onListo={async () => { await onCambio(); onClose() }} />}
    </Modal>
  )
}

function NotaForm({ estancia, onListo, onCancelar }) {
  const [tipo, setTipo] = useState('evolucion')
  const [texto, setTexto] = useState('')
  const [signos, setSignos] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const guardar = async () => {
    let payload = null
    if (tipo === 'signos') {
      payload = {}
      for (const s of SIGNOS) {
        const v = String(signos[s.k] ?? '').trim()
        if (!v) continue
        if (s.texto) { if (v.length > 12) { setError(`${s.label}: demasiado largo.`); return } payload[s.k] = v }
        else { const n = Number(v.replace(',', '.')); if (!Number.isFinite(n) || n < 0 || n > 1000) { setError(`${s.label}: escriba un número.`); return } payload[s.k] = n }
      }
      if (!Object.keys(payload).length) { setError('Escriba al menos un signo vital.'); return }
    } else if (!texto.trim()) { setError('Escriba la nota.'); return }
    setBusy(true)
    const { error: err } = await agregarNota(estancia.id, tipo, tipo === 'signos' ? null : texto.trim(), payload)
    setBusy(false)
    if (err) { setError(textoError(err)); return }
    toast.success('Nota agregada')
    onListo()
  }
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 18, padding: 14, background: 'rgba(246,248,253,0.8)', marginBottom: 16 }}>
      <Segmentos opciones={TIPOS_NOTA} valor={tipo} onChange={(v) => { setTipo(v); setError('') }} />
      <div style={{ marginTop: 12 }}>
        {tipo === 'signos' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            {SIGNOS.map(s => (
              <Campo key={s.k} label={`${s.label} (${s.unidad})`}>
                <Input value={signos[s.k] ?? ''} onChange={v => { setError(''); setSignos(x => ({ ...x, [s.k]: v })) }} inputMode={s.texto ? 'text' : 'decimal'} placeholder={s.hint} maxLength={12} aria-label={s.label} />
              </Campo>
            ))}
          </div>
        ) : (
          <Textarea value={texto} onChange={v => { setError(''); setTexto(v) }} rows={3} maxLength={4000} aria-label="Texto de la nota" placeholder={tipo === 'evolucion' ? 'Cómo amaneció el paciente, hallazgos, plan…' : tipo === 'enfermeria' ? 'Cuidados realizados, observaciones…' : 'Nueva indicación médica…'} />
        )}
      </div>
      {error && <div role="alert" style={{ marginTop: 10, color: C.red, fontSize: 13.5 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button size="sm" icon="check" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar nota'}</Button>
      </div>
    </div>
  )
}

function TrasladoModal({ estancia, abiertas, onClose, onListo }) {
  const eq = useCamasEquipo(abiertas)
  const [cama, setCama] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mover = async () => {
    if (!cama) { setError('Elija la cama a la que pasa el paciente.'); return }
    setBusy(true)
    const { error: err } = await trasladarPaciente(estancia.id, cama)
    setBusy(false)
    if (err) { setError(textoError(err)); return }
    toast.success(`Paciente trasladado a ${eq.cama(cama)?.nombre}`)
    onListo()
  }
  return (
    <Modal title="Trasladar de cama" subtitle={`Ahora está en ${eq.cama(estancia.cama_id)?.nombre || 'una cama'}`} onClose={onClose} maxWidth={460}>
      <Campo label="Cama nueva *">
        <Desplegable ariaLabel="Cama nueva" value={cama} onChange={(v) => { setError(''); setCama(v) }} placeholder={eq.libres.length ? 'Elija una cama libre' : 'No hay camas libres'} style={caja}
          options={eq.libres.filter(c => c.id !== estancia.cama_id).map(c => ({ value: c.id, label: eq.etiquetaCama(c) }))} />
      </Campo>
      {error && <div role="alert" style={{ marginTop: 12, color: C.red, fontSize: 13.5 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="check" onClick={mover} disabled={busy}>{busy ? 'Trasladando…' : 'Trasladar'}</Button>
      </div>
    </Modal>
  )
}

function EgresoModal({ estancia, paciente, cama, onClose, onListo }) {
  const [tipo, setTipo] = useState('alta')
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dar = async () => {
    if (tipo === 'fallecido' && !await confirmar({ titulo: '¿Registrar fallecimiento?', mensaje: [`Se da egreso a ${paciente?.nombre || 'el paciente'} como fallecido y ${cama?.nombre || 'la cama'} queda libre.`], aceptar: 'Registrar egreso', peligro: true })) return
    setBusy(true)
    const { error: err } = await darEgreso(estancia.id, tipo, nota.trim())
    setBusy(false)
    if (err) { setError(textoError(err)); return }
    toast.success(`Egreso registrado; ${cama?.nombre || 'la cama'} quedó libre`)
    onListo()
  }
  return (
    <Modal title="Dar egreso" subtitle={`${paciente?.nombre || ''} · ${cama?.nombre || ''}`} onClose={onClose} maxWidth={500}>
      <div role="radiogroup" aria-label="Tipo de egreso" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {EGRESOS.map(e => (
          <button key={e.value} type="button" role="radio" aria-checked={tipo === e.value} onClick={() => setTipo(e.value)} style={{ padding: '9px 16px', borderRadius: 160, border: `1.5px solid ${tipo === e.value ? C.purple : C.g200}`, background: tipo === e.value ? C.purple : 'rgba(255,255,255,0.9)', color: tipo === e.value ? C.onPurple : C.black, fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>{e.label}</button>
        ))}
      </div>
      <Campo label="Nota de egreso" ayuda="Opcional"><Textarea value={nota} onChange={setNota} rows={3} maxLength={500} placeholder="Resumen, indicaciones al salir, a dónde se traslada…" /></Campo>
      {error && <div role="alert" style={{ marginTop: 12, color: C.red, fontSize: 13.5 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="check" onClick={dar} disabled={busy}>{busy ? 'Guardando…' : 'Dar egreso'}</Button>
      </div>
    </Modal>
  )
}

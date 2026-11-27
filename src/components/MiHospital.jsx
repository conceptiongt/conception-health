import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { CATALOGO_HOSPITAL, CLAVES_BASE_HOSPITAL, especialidadDe, esHospital } from '../lib/especialidades'
import { cargarSugeridosDepartamentos } from '../lib/sugeridos'
import { PALETA } from '../lib/calendario'
import { puede } from '../lib/permisos'
import { useDatos } from '../hooks/useDatos'
import { FUNCIONES, TIPOS_PROFESIONAL, TIPOS_AREA, TIPOS_RECURSO, colorProfesional, COLOR_MEDICO_DEFECTO } from '../hooks/useHospital'
import { Card, Badge } from './ui/Varios'
import { Button } from './ui/Button'
import { Campo, Input, filtroStyle } from './ui/Campos'
import { Desplegable } from './ui/Desplegable'
import { Icon } from './ui/Icon'
import { Modal } from './ui/Modal'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'
import { Interruptor } from './MensajePaciente'
import { SelectorColor } from './SelectorColor'

// Configuración → Mi hospital: the administrator builds the hospital their own way (specialties, doctors and staff, areas, operating rooms and beds).
// Only for hospital accounts and for users with the «configuracion» permission. Before the migration is applied it shows «Disponible pronto».
export function MiHospital() {
  const { clinica, perfil, hospital } = useDatos()
  if (!esHospital(clinica?.especialidad) || !puede(perfil, 'configuracion')) return null
  if (!hospital.cargado) return null
  if (!hospital.disponible) {
    return (
      <Card title="Mi hospital">
        <div style={{ fontSize: 13.5, color: C.g500, lineHeight: 1.6 }}>
          <Badge color={C.purpleDark} bg={C.purpleMid}>Disponible pronto</Badge>
          <div style={{ marginTop: 10 }}>Aquí armará su hospital: especialidades, médicos y personal, áreas, quirófanos y camas. Le avisaremos en cuanto esté listo.</div>
        </div>
      </Card>
    )
  }
  return (
    <>
      <Especialidades />
      <Personal />
      <Areas />
    </>
  )
}

// ─── shared bits ───
const filaEstilo = { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: `1px solid ${C.g100}`, flexWrap: 'wrap' }
const botonIcono = { width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: C.g500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
const Ayuda = ({ children }) => <div style={{ fontSize: 13.5, color: C.g500, marginBottom: 14, lineHeight: 1.5 }}>{children}</div>
const plural = (n, uno, otros) => `${n} ${n === 1 ? uno : otros}`

function Pie({ onCancelar, onGuardar, busy, texto = 'Guardar', deshabilitado }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 22 }}>
      <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
      <Button onClick={onGuardar} disabled={busy || deshabilitado} icon="check">{busy ? 'Guardando…' : texto}</Button>
    </div>
  )
}

// Message for a failed write (a repeated name is the usual cause)
const falla = (error, repetido, porDefecto = 'No se pudo guardar') => (error?.code === '23505' || /duplicate|unique/i.test(error?.message || '') ? repetido : porDefecto)

// ─── 1. Especialidades ───
function Especialidades() {
  const { clinica, citas, servicios, hospital, recargar } = useDatos()
  const { departamentos, profesionales } = hospital
  const [modal, setModal] = useState(null) // 'catalogo' | 'nueva' | { editar: departamento }
  const [busy, setBusy] = useState(false)

  const medicosDe = (id) => profesionales.filter(p => p.departamento_id === id).length
  const citasDe = (id) => citas.filter(c => c.departamento_id === id).length

  // inserts specialties and, in the same go, their suggested services (price Q0, tied to each specialty)
  const agregarFilas = async (filas) => {
    const { data, error } = await supabase.from('departamentos').insert(filas.map(f => ({ clinica_id: clinica.id, es_emergencia: false, activo: true, ...f }))).select()
    if (error) { toast.error(falla(error, 'Ya existe una especialidad con ese nombre')); return false }
    const r = await cargarSugeridosDepartamentos(clinica, data || [], servicios)
    if (r.error) toast.error('Se agregaron las especialidades, pero no sus servicios sugeridos')
    await Promise.all([hospital.recargar(), recargar()])
    return true
  }
  const cargarBase = async () => {
    setBusy(true)
    const orden = departamentos.length
    const ok = await agregarFilas(CLAVES_BASE_HOSPITAL
      .filter(k => !departamentos.some(d => d.clave === k))
      .map((k, i) => ({ clave: k, nombre: especialidadDe(k).label, es_emergencia: k === 'emergencias', orden: orden + i })))
    setBusy(false)
    if (ok) toast.success('Especialidades base cargadas')
  }
  const alternar = async (d, activo) => {
    const { error } = await supabase.from('departamentos').update({ activo }).eq('id', d.id)
    if (error) { toast.error('No se pudo guardar'); return }
    hospital.recargar()
  }
  const eliminar = async (d) => {
    const nc = citasDe(d.id), nm = medicosDe(d.id)
    if (nc || nm) {
      // in use: it cannot be deleted, offer to deactivate it instead
      const partes = [nc && plural(nc, 'cita', 'citas'), nm && plural(nm, 'médico', 'médicos')].filter(Boolean).join(' y ')
      const desactivar = d.activo && await confirmar({
        titulo: 'No se puede eliminar',
        mensaje: `«${d.nombre}» tiene ${partes}. Para no perder su historial no se puede eliminar.\n\nPuede desactivarla: dejará de ofrecerse al agendar, y sus citas y médicos se conservan.`,
        aceptar: 'Desactivar', cancelar: 'Cerrar',
      })
      if (!d.activo) toast.error(`«${d.nombre}» tiene ${partes}; ya está desactivada`)
      if (desactivar) alternar(d, false)
      return
    }
    const nt = servicios.filter(s => s.departamento_id === d.id).length
    if (!await confirmar({ mensaje: `¿Eliminar la especialidad «${d.nombre}»?${nt ? `\n\nSus ${plural(nt, 'tarifa', 'tarifas')} pasarán a ser generales.` : ''}`, aceptar: 'Eliminar' })) return
    const { error } = await supabase.from('departamentos').delete().eq('id', d.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Especialidad eliminada')
    await Promise.all([hospital.recargar(), recargar()])
  }

  return (
    <Card title={`Especialidades${departamentos.length ? ` (${departamentos.length})` : ''}`} right={departamentos.length > 0 && (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" icon="mas" onClick={() => setModal('catalogo')}>Agregar del catálogo</Button>
        <Button size="sm" variant="ghost" icon="mas" onClick={() => setModal('nueva')}>Crear especialidad nueva</Button>
      </div>
    )}>
      <Ayuda>Las especialidades de su hospital. Cada una trae sus propios tipos de atención y datos clínicos; al agendar se elige la especialidad y el médico.</Ayuda>
      {departamentos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '22px 8px 8px' }}>
          <Button size="lg" icon="estetoscopio" onClick={cargarBase} disabled={busy}>{busy ? 'Cargando…' : 'Cargar las especialidades base'}</Button>
          <div style={{ fontSize: 13, color: C.g500, margin: '12px auto 18px', maxWidth: 520, lineHeight: 1.55 }}>
            Ginecología y obstetricia, pediatría, medicina general, medicina interna, traumatología, cirugía general, anestesiología, enfermería, psicología y emergencias. Después puede agregar otras o crear las suyas.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button size="sm" variant="ghost" icon="mas" onClick={() => setModal('catalogo')}>Agregar del catálogo</Button>
            <Button size="sm" variant="ghost" icon="mas" onClick={() => setModal('nueva')}>Crear especialidad nueva</Button>
          </div>
        </div>
      ) : (
        <div>
          {departamentos.map((d, i) => (
            <div key={d.id} style={{ ...filaEstilo, borderTop: i ? filaEstilo.borderTop : 'none', opacity: d.activo ? 1 : 0.65 }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: C.black, overflowWrap: 'anywhere' }}>{d.nombre}{d.es_emergencia && <span style={{ marginLeft: 8 }}><Badge color={C.red} bg={C.redLight}>Emergencia</Badge></span>}</div>
                {!d.clave && d.base && <div style={{ fontSize: 12.5, color: C.g400 }}>Usa la ficha de {especialidadDe(d.base).label}</div>}
              </div>
              <span style={{ fontSize: 13, color: C.g500, whiteSpace: 'nowrap' }}>{plural(medicosDe(d.id), 'médico', 'médicos')}</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.g600 }}>
                <Interruptor activo={d.activo} onChange={(v) => alternar(d, v)} titulo={d.activo ? 'Activa: se ofrece al agendar' : 'Desactivada'} />Activa
              </label>
              <button type="button" style={botonIcono} className="btn-ghost" title="Cambiar nombre" aria-label={`Cambiar el nombre de ${d.nombre}`} onClick={() => setModal({ editar: d })}><Icon name="editar" size={15} /></button>
              <button type="button" style={{ ...botonIcono, color: C.red }} className="btn-ghost" title="Eliminar" aria-label={`Eliminar ${d.nombre}`} onClick={() => eliminar(d)}><Icon name="eliminar" size={15} /></button>
            </div>
          ))}
        </div>
      )}
      {modal === 'catalogo' && <CatalogoModal departamentos={departamentos} onClose={() => setModal(null)} onAgregar={agregarFilas} />}
      {modal === 'nueva' && <NuevaEspecialidadModal departamentos={departamentos} onClose={() => setModal(null)} onAgregar={agregarFilas} />}
      {modal?.editar && <EditarEspecialidadModal d={modal.editar} onClose={() => setModal(null)} onGuardado={() => { setModal(null); hospital.recargar() }} />}
    </Card>
  )
}

// searchable multi-select of the catalogue entries the hospital does not have yet
function CatalogoModal({ departamentos, onClose, onAgregar }) {
  const [buscar, setBuscar] = useState('')
  const [marcadas, setMarcadas] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const sinTildes = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const nombres = useMemo(() => new Set(departamentos.map(d => d.nombre.trim().toLowerCase())), [departamentos])
  const faltan = CATALOGO_HOSPITAL.filter(e => !departamentos.some(d => d.clave === e.value) && !nombres.has(e.label.toLowerCase()))
  const q = sinTildes(buscar.trim())
  const lista = faltan.filter(e => !q || sinTildes(e.label).includes(q))
  const alternar = (k) => setMarcadas(m => { const n = new Set(m); n.has(k) ? n.delete(k) : n.add(k); return n })
  const agregar = async () => {
    setBusy(true)
    const orden = departamentos.length
    const ok = await onAgregar(faltan.filter(e => marcadas.has(e.value)).map((e, i) => ({ clave: e.value, nombre: e.label, es_emergencia: e.value === 'emergencias', orden: orden + i })))
    setBusy(false)
    if (ok) { toast.success(marcadas.size === 1 ? 'Especialidad agregada' : `${marcadas.size} especialidades agregadas`); onClose() }
  }
  return (
    <Modal title="Agregar del catálogo" subtitle="Marque las especialidades que su hospital ofrece" onClose={onClose} maxWidth={560}>
      {faltan.length === 0 ? <div style={{ fontSize: 14, color: C.g500 }}>Ya agregó todas las especialidades del catálogo. Puede crear las suyas con «Crear especialidad nueva».</div> : (
        <>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Icon name="buscar" size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.g400 }} />
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar especialidad…" aria-label="Buscar especialidad" autoFocus style={{ ...filtroStyle, width: '100%', paddingLeft: 32, boxSizing: 'border-box' }} />
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto', border: `1px solid ${C.line}`, borderRadius: 14 }}>
            {lista.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.g400, fontSize: 13.5 }}>Ninguna especialidad coincide</div>}
            {lista.map((e, i) => (
              <label key={e.value} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', borderTop: i ? `1px solid ${C.g100}` : 'none', background: marcadas.has(e.value) ? C.purpleMid : 'transparent', fontSize: 14 }}>
                <input type="checkbox" checked={marcadas.has(e.value)} onChange={() => alternar(e.value)} style={{ width: 17, height: 17, accentColor: C.purple, cursor: 'pointer' }} />
                {e.label}
              </label>
            ))}
          </div>
        </>
      )}
      <Pie onCancelar={onClose} onGuardar={agregar} busy={busy} deshabilitado={marcadas.size === 0} texto={marcadas.size ? `Agregar (${marcadas.size})` : 'Agregar'} />
    </Modal>
  )
}

function NuevaEspecialidadModal({ departamentos, onClose, onAgregar }) {
  const [nombre, setNombre] = useState('')
  const [base, setBase] = useState('general')
  const [busy, setBusy] = useState(false)
  const guardar = async () => {
    const n = nombre.trim()
    if (n.length < 2) { toast.error('Escriba el nombre de la especialidad'); return }
    if (departamentos.some(d => d.nombre.trim().toLowerCase() === n.toLowerCase())) { toast.error('Ya existe una especialidad con ese nombre'); return }
    setBusy(true)
    const ok = await onAgregar([{ clave: null, nombre: n, base, orden: departamentos.length }])
    setBusy(false)
    if (ok) { toast.success('Especialidad creada'); onClose() }
  }
  return (
    <Modal title="Crear especialidad nueva" onClose={onClose} maxWidth={480}>
      <div style={{ display: 'grid', gap: 16 }}>
        <Campo label="Nombre de la especialidad *"><Input value={nombre} onChange={setNombre} maxLength={60} autoFocus placeholder="Ej. Cardiología pediátrica" onKeyDown={e => { if (e.key === 'Enter') guardar() }} /></Campo>
        <Campo label="Basada en" ayuda="Usará la misma ficha de esa especialidad; después podrá ajustarla.">
          <Desplegable ariaLabel="Basada en" value={base} onChange={setBase} options={CATALOGO_HOSPITAL.map(e => ({ value: e.value, label: e.label }))} style={{ width: '100%', justifyContent: 'space-between', padding: '11px 14px' }} />
        </Campo>
      </div>
      <Pie onCancelar={onClose} onGuardar={guardar} busy={busy} texto="Crear especialidad" />
    </Modal>
  )
}

function EditarEspecialidadModal({ d, onClose, onGuardado }) {
  const [nombre, setNombre] = useState(d.nombre)
  const [busy, setBusy] = useState(false)
  const guardar = async () => {
    const n = nombre.trim()
    if (n.length < 2) { toast.error('Escriba el nombre'); return }
    setBusy(true)
    const { error } = await supabase.from('departamentos').update({ nombre: n }).eq('id', d.id)
    setBusy(false)
    if (error) { toast.error(falla(error, 'Ya existe una especialidad con ese nombre')); return }
    toast.success('Nombre actualizado')
    onGuardado()
  }
  return (
    <Modal title="Cambiar nombre" onClose={onClose} maxWidth={440}>
      <Campo label="Nombre de la especialidad *"><Input value={nombre} onChange={setNombre} maxLength={60} autoFocus onKeyDown={e => { if (e.key === 'Enter') guardar() }} /></Campo>
      <Pie onCancelar={onClose} onGuardar={guardar} busy={busy} />
    </Modal>
  )
}

// ─── 2. Médicos y personal ───
function Personal() {
  const { citas, hospital } = useDatos()
  const { profesionales, departamentos } = hospital
  const [modal, setModal] = useState(undefined) // undefined closed · null new · profesional edit
  const nombreFuncion = (v) => FUNCIONES.find(f => f.value === v)?.label || v

  const alternar = async (p, activo) => {
    const { error } = await supabase.from('profesionales').update({ activo }).eq('id', p.id)
    if (error) { toast.error('No se pudo guardar'); return }
    hospital.recargar()
  }
  const eliminar = async (p) => {
    const n = citas.filter(c => c.profesional_id === p.id).length
    if (n) {
      const desactivar = p.activo && await confirmar({
        titulo: 'No se puede eliminar',
        mensaje: `${p.nombre} tiene ${n === 1 ? '1 cita' : `${n} citas`}. Para no perder su historial no se puede eliminar.\n\nPuede desactivarle: dejará de ofrecerse al agendar y sus citas se conservan.`,
        aceptar: 'Desactivar', cancelar: 'Cerrar',
      })
      if (!p.activo) toast.error(`${p.nombre} tiene ${n === 1 ? '1 cita' : `${n} citas`}; ya está desactivado`)
      if (desactivar) alternar(p, false)
      return
    }
    if (!await confirmar({ mensaje: `¿Eliminar a ${p.nombre} de su lista de médicos y personal?`, aceptar: 'Eliminar' })) return
    const { error } = await supabase.from('profesionales').delete().eq('id', p.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Eliminado')
    hospital.recargar()
  }

  return (
    <Card title={`Médicos y personal${profesionales.length ? ` (${profesionales.length})` : ''}`} right={<Button size="sm" variant="ghost" icon="mas" onClick={() => setModal(null)}>Agregar</Button>}>
      <Ayuda>Médicos y personal «de planta» o «externo», cada uno con su especialidad. El color identifica al médico en el calendario.</Ayuda>
      {profesionales.length === 0 ? <div style={{ color: C.g400, fontSize: 13.5 }}>Aún no hay médicos ni personal. Agregue el primero con «Agregar».</div> : (
        <div>
          {profesionales.map((p, i) => (
            <div key={p.id} style={{ ...filaEstilo, borderTop: i ? filaEstilo.borderTop : 'none', opacity: p.activo ? 1 : 0.65 }}>
              <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 14, flexShrink: 0, background: colorProfesional(p, i), boxShadow: `0 0 0 1px ${C.line}` }} />
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: C.black, overflowWrap: 'anywhere' }}>
                  {p.nombre}{p.tipo === 'externo' && <span style={{ marginLeft: 8 }}><Badge color={C.amber} bg={C.amberLight}>Externo</Badge></span>}
                </div>
                <div style={{ fontSize: 12.5, color: C.g500 }}>
                  {[nombreFuncion(p.funcion), hospital.departamento(p.departamento_id)?.nombre || 'Sin especialidad', p.colegiado && `Col. ${p.colegiado}`, p.telefono].filter(Boolean).join(' · ')}
                </div>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.g600 }}>
                <Interruptor activo={p.activo} onChange={(v) => alternar(p, v)} titulo={p.activo ? 'Activo' : 'Inactivo'} />Activo
              </label>
              <button type="button" style={botonIcono} className="btn-ghost" title="Editar" aria-label={`Editar a ${p.nombre}`} onClick={() => setModal(p)}><Icon name="editar" size={15} /></button>
              <button type="button" style={{ ...botonIcono, color: C.red }} className="btn-ghost" title="Eliminar" aria-label={`Eliminar a ${p.nombre}`} onClick={() => eliminar(p)}><Icon name="eliminar" size={15} /></button>
            </div>
          ))}
        </div>
      )}
      {modal !== undefined && <PersonalModal p={modal} departamentos={departamentos} usados={profesionales.map(x => x.color).filter(Boolean)} onClose={() => setModal(undefined)} onGuardado={() => { setModal(undefined); hospital.recargar() }} />}
    </Card>
  )
}

function PersonalModal({ p, departamentos, usados, onClose, onGuardado }) {
  const { clinica } = useDatos()
  const siguiente = COLOR_MEDICO_DEFECTO.find(c => !usados.includes(c)) || COLOR_MEDICO_DEFECTO[usados.length % COLOR_MEDICO_DEFECTO.length]
  const [f, setF] = useState(() => ({
    nombre: p?.nombre || '', funcion: p?.funcion || 'medico', tipo: p?.tipo || 'planta', departamento_id: p?.departamento_id || '',
    colegiado: p?.colegiado || '', telefono: p?.telefono || '', color: p?.color || siguiente,
  }))
  const [otroColor, setOtroColor] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(x => ({ ...x, [k]: v }))
  const caja = { width: '100%', justifyContent: 'space-between', padding: '11px 14px' }
  const guardar = async () => {
    const nombre = f.nombre.trim()
    if (nombre.length < 2) { toast.error('Escriba el nombre'); return }
    const fila = { nombre, funcion: f.funcion, tipo: f.tipo, departamento_id: f.departamento_id || null, colegiado: f.colegiado.trim() || null, telefono: f.telefono.trim() || null, color: f.color.toUpperCase() }
    setBusy(true)
    const { error } = p
      ? await supabase.from('profesionales').update(fila).eq('id', p.id)
      : await supabase.from('profesionales').insert({ ...fila, clinica_id: clinica.id, activo: true })
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success(p ? 'Cambios guardados' : 'Agregado')
    onGuardado()
  }
  return (
    <Modal title={p ? 'Editar médico o personal' : 'Agregar médico o personal'} onClose={onClose} maxWidth={560}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}><Campo label="Nombre completo *"><Input value={f.nombre} onChange={set('nombre')} maxLength={80} autoFocus placeholder="Ej. Dra. Ana López" /></Campo></div>
        <Campo label="Función"><Desplegable ariaLabel="Función" value={f.funcion} onChange={set('funcion')} options={FUNCIONES} style={caja} /></Campo>
        <Campo label="Tipo"><Desplegable ariaLabel="Tipo" value={f.tipo} onChange={set('tipo')} options={TIPOS_PROFESIONAL} style={caja} /></Campo>
        <div style={{ gridColumn: '1 / -1' }}>
          <Campo label="Especialidad" ayuda={departamentos.length === 0 ? 'Primero cargue las especialidades de su hospital' : undefined}>
            <Desplegable ariaLabel="Especialidad" value={f.departamento_id} onChange={set('departamento_id')} style={caja}
              options={[{ value: '', label: 'Sin especialidad' }, ...departamentos.filter(d => d.activo || d.id === f.departamento_id).map(d => ({ value: d.id, label: d.nombre + (d.activo ? '' : ' (inactiva)') }))]} />
          </Campo>
        </div>
        <Campo label="Número de colegiado"><Input value={f.colegiado} onChange={set('colegiado')} maxLength={30} /></Campo>
        <Campo label="Teléfono"><Input type="tel" value={f.telefono} onChange={set('telefono')} maxLength={30} /></Campo>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 8 }}>Color en el calendario</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {[...new Set([...PALETA, ...COLOR_MEDICO_DEFECTO])].map(hex => (
              <button key={hex} type="button" onClick={() => set('color')(hex)} aria-label={`Usar el color ${hex}`} aria-pressed={f.color.toUpperCase() === hex}
                style={{ width: 28, height: 28, borderRadius: 9, background: hex, cursor: 'pointer', padding: 0, border: f.color.toUpperCase() === hex ? `2px solid ${C.black}` : '2px solid #fff', boxShadow: `0 0 0 1px ${C.line}` }} />
            ))}
            <button type="button" onClick={() => setOtroColor(o => !o)} aria-expanded={otroColor} style={{ border: 'none', background: 'none', color: 'var(--acento-fuerte)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>Otro color</button>
          </div>
          {otroColor && <div style={{ marginTop: 12 }}><SelectorColor valor={f.color} onChange={set('color')} /></div>}
        </div>
      </div>
      <Pie onCancelar={onClose} onGuardar={guardar} busy={busy} />
    </Modal>
  )
}

// ─── 3. Áreas, quirófanos y camas ───
const RECURSOS_OPCIONES = Object.entries(TIPOS_RECURSO).map(([value, v]) => ({ value, label: v.nombre }))
const sugerenciaArea = { quirofanos: 'Quirófanos', encamamiento: 'Encamamiento', emergencia: 'Emergencia', uci: 'UCI', consulta: 'Consulta externa', otro: '' }

// «Quirófano 3», «Cama 107»… the numbering continues after the highest number the area already uses (beds start at 101)
function nombresNuevos(tipo, cuantos, existentes) {
  const base = TIPOS_RECURSO[tipo].nombre
  const nums = existentes.filter(r => r.tipo === tipo).map(r => Number((r.nombre.match(/(\d+)\s*$/) || [])[1])).filter(Number.isFinite)
  const inicio = nums.length ? Math.max(...nums) + 1 : tipo === 'cama' ? 101 : 1
  return Array.from({ length: cuantos }, (_, i) => `${base} ${inicio + i}`)
}

function Areas() {
  const { hospital, sedes } = useDatos()
  const { areas, recursos } = hospital
  const [modal, setModal] = useState(null) // { area: null | área } · { recursos: área } · { recurso }
  const recursosDe = (id) => recursos.filter(r => r.area_id === id)

  // totals: «2 quirófanos · 12 camas»
  const totales = Object.entries(TIPOS_RECURSO).map(([k, v]) => [recursos.filter(r => r.tipo === k).length, v]).filter(([n]) => n > 0)
    .map(([n, v]) => plural(n, v.uno, v.otros))
  const fuera = recursos.filter(r => r.fuera_de_servicio).length

  const eliminarArea = async (a) => {
    const n = recursosDe(a.id).length
    if (!await confirmar({ mensaje: `¿Eliminar el área «${a.nombre}»${n ? ` y sus ${plural(n, 'quirófano, cama o cubículo', 'quirófanos, camas o cubículos')}` : ''}?`, aceptar: 'Eliminar' })) return
    const { error } = await supabase.from('areas').delete().eq('id', a.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Área eliminada')
    hospital.recargar()
  }

  return (
    <Card title="Áreas, quirófanos y camas" right={<Button size="sm" variant="ghost" icon="mas" onClick={() => setModal({ area: null })}>Agregar área</Button>}>
      <Ayuda>Arme su hospital por áreas y agregue sus quirófanos, camas y consultorios, tantos como tenga.</Ayuda>
      {areas.length === 0 ? <div style={{ color: C.g400, fontSize: 13.5 }}>Aún no hay áreas. Ej. «Quirófanos», «Encamamiento» o «Emergencia».</div> : (
        <>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.g700, marginBottom: 14 }}>
            {totales.length ? totales.join(' · ') : 'Sin quirófanos ni camas todavía'}{fuera > 0 && <span style={{ color: C.amber, fontWeight: 500 }}> · {plural(fuera, 'fuera de servicio', 'fuera de servicio')}</span>}
          </div>
          {TIPOS_AREA.filter(t => areas.some(a => a.tipo === t.value)).map(t => (
            <div key={t.value} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>{t.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {areas.filter(a => a.tipo === t.value).map(a => {
                  const lista = recursosDe(a.id)
                  return (
                    <div key={a.id} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.7)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: lista.length ? 10 : 0 }}>
                        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: 14.5, color: C.black, overflowWrap: 'anywhere' }}>{a.nombre}</span>
                          <span style={{ marginLeft: 8, fontSize: 12.5, color: C.g400 }}>{lista.length ? lista.map(r => r.tipo).filter((x, i, l) => l.indexOf(x) === i).map(k => plural(lista.filter(r => r.tipo === k).length, TIPOS_RECURSO[k].uno, TIPOS_RECURSO[k].otros)).join(' · ') : 'vacía'}</span>
                          {a.sede_id && sedes.find(s => s.id === a.sede_id) && <span style={{ marginLeft: 8, fontSize: 12.5, color: C.g400 }}>· {sedes.find(s => s.id === a.sede_id).nombre}</span>}
                        </div>
                        <Button size="sm" variant="soft" icon="mas" onClick={() => setModal({ recursos: a })}>Agregar {TIPOS_RECURSO[t.recurso].uno}</Button>
                        <button type="button" style={botonIcono} className="btn-ghost" title="Editar el área" aria-label={`Editar el área ${a.nombre}`} onClick={() => setModal({ area: a })}><Icon name="editar" size={15} /></button>
                        <button type="button" style={{ ...botonIcono, color: C.red }} className="btn-ghost" title="Eliminar el área" aria-label={`Eliminar el área ${a.nombre}`} onClick={() => eliminarArea(a)}><Icon name="eliminar" size={15} /></button>
                      </div>
                      {lista.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {lista.map(r => (
                            <button key={r.id} type="button" onClick={() => setModal({ recurso: r })} title={r.fuera_de_servicio ? 'Fuera de servicio' : 'Clic para editar'} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 160, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500,
                              border: `1px solid ${r.fuera_de_servicio ? '#EBC98E' : C.g200}`, background: r.fuera_de_servicio ? C.amberLight : '#fff', color: r.fuera_de_servicio ? C.amber : C.g700,
                              textDecoration: r.fuera_de_servicio ? 'line-through' : 'none',
                            }}>{r.fuera_de_servicio && <Icon name="alerta" size={12} />}{r.nombre}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
      {modal?.area !== undefined && <AreaModal a={modal.area} sedes={sedes} onClose={() => setModal(null)}
        onGuardado={(nueva) => { hospital.recargar(); setModal(nueva ? { recursos: nueva } : null) }} />}
      {modal?.recursos && <RecursosModal area={modal.recursos} existentes={recursosDe(modal.recursos.id)} onClose={() => setModal(null)} onGuardado={() => { setModal(null); hospital.recargar() }} />}
      {modal?.recurso && <RecursoModal r={modal.recurso} onClose={() => setModal(null)} onGuardado={() => { setModal(null); hospital.recargar() }} />}
    </Card>
  )
}

function AreaModal({ a, sedes, onClose, onGuardado }) {
  const { clinica, hospital } = useDatos()
  const [f, setF] = useState(() => ({ nombre: a?.nombre || sugerenciaArea.quirofanos, tipo: a?.tipo || 'quirofanos', sede_id: a?.sede_id || '' }))
  const [busy, setBusy] = useState(false)
  const cambiarTipo = (tipo) => setF(x => ({ ...x, tipo, nombre: !x.nombre.trim() || x.nombre === sugerenciaArea[x.tipo] ? sugerenciaArea[tipo] : x.nombre }))
  const guardar = async () => {
    const nombre = f.nombre.trim()
    if (nombre.length < 2) { toast.error('Escriba el nombre del área'); return }
    const fila = { nombre, tipo: f.tipo, sede_id: f.sede_id || null }
    setBusy(true)
    if (a) {
      const { error } = await supabase.from('areas').update(fila).eq('id', a.id)
      setBusy(false)
      if (error) { toast.error('No se pudo guardar'); return }
      toast.success('Área actualizada'); onGuardado(null); return
    }
    const { data, error } = await supabase.from('areas').insert({ ...fila, clinica_id: clinica.id, orden: hospital.areas.length }).select().single()
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Área agregada')
    onGuardado(data) // goes straight on to adding its operating rooms / beds
  }
  return (
    <Modal title={a ? 'Editar área' : 'Agregar área'} onClose={onClose} maxWidth={480}>
      <div style={{ display: 'grid', gap: 16 }}>
        <Campo label="Tipo de área"><Desplegable ariaLabel="Tipo de área" value={f.tipo} onChange={cambiarTipo} options={TIPOS_AREA.map(t => ({ value: t.value, label: t.label }))} style={{ width: '100%', justifyContent: 'space-between', padding: '11px 14px' }} /></Campo>
        <Campo label="Nombre del área *"><Input value={f.nombre} onChange={v => setF(x => ({ ...x, nombre: v }))} maxLength={60} autoFocus placeholder="Ej. Quirófanos del segundo nivel" onKeyDown={e => { if (e.key === 'Enter') guardar() }} /></Campo>
        {sedes.length > 0 && (
          <Campo label="Sede">
            <Desplegable ariaLabel="Sede" value={f.sede_id} onChange={v => setF(x => ({ ...x, sede_id: v }))} style={{ width: '100%', justifyContent: 'space-between', padding: '11px 14px' }}
              options={[{ value: '', label: 'Sin sede' }, ...sedes.map(s => ({ value: s.id, label: s.nombre }))]} />
          </Campo>
        )}
      </div>
      <Pie onCancelar={onClose} onGuardar={guardar} busy={busy} texto={a ? 'Guardar' : 'Agregar área'} />
    </Modal>
  )
}

// several quirófanos / camas at once: «cuántos» stepper, names numbered automatically and editable
function RecursosModal({ area, existentes, onClose, onGuardado }) {
  const { clinica } = useDatos()
  const [tipo, setTipo] = useState(() => TIPOS_AREA.find(t => t.value === area.tipo)?.recurso || 'cubiculo')
  const [cuantos, setCuantos] = useState(1)
  const [nombres, setNombres] = useState(() => nombresNuevos(tipo, 1, existentes))
  const [busy, setBusy] = useState(false)
  const regenerar = (t, n) => setNombres(nombresNuevos(t, n, existentes))
  const poner = (n) => { const v = Math.max(1, Math.min(60, Math.round(Number(n)) || 1)); setCuantos(v); regenerar(tipo, v) }
  const guardar = async () => {
    const lista = nombres.map(n => n.trim())
    if (lista.some(n => !n)) { toast.error('Todos necesitan un nombre'); return }
    const repetidos = lista.filter((n, i) => lista.findIndex(x => x.toLowerCase() === n.toLowerCase()) !== i || existentes.some(r => r.nombre.toLowerCase() === n.toLowerCase()))
    if (repetidos.length) { toast.error(`Ya existe «${repetidos[0]}» en esta área`); return }
    setBusy(true)
    const base = existentes.length
    const { error } = await supabase.from('recursos').insert(lista.map((nombre, i) => ({ clinica_id: clinica.id, area_id: area.id, tipo, nombre, activo: true, fuera_de_servicio: false, orden: base + i })))
    setBusy(false)
    if (error) { toast.error(falla(error, 'Ya existe uno de esos nombres en esta área')); return }
    toast.success(lista.length === 1 ? 'Agregado' : `${lista.length} agregados`)
    onGuardado()
  }
  const paso = { width: 38, height: 38, borderRadius: 19, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: C.g700, fontFamily: 'inherit' }
  return (
    <Modal title={`Agregar a «${area.nombre}»`} onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 180px' }}>
          <Campo label="Qué va a agregar">
            <Desplegable ariaLabel="Qué va a agregar" value={tipo} onChange={(t) => { setTipo(t); regenerar(t, cuantos) }} options={RECURSOS_OPCIONES} style={{ width: '100%', justifyContent: 'space-between', padding: '11px 14px' }} />
          </Campo>
        </div>
        <Campo label="¿Cuántos?">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button type="button" style={paso} onClick={() => poner(cuantos - 1)} aria-label="Uno menos" disabled={cuantos <= 1}>−</button>
            <input type="number" min="1" max="60" value={cuantos} onChange={e => poner(e.target.value)} aria-label="Cantidad" style={{ ...filtroStyle, width: 64, textAlign: 'center', fontSize: 15, fontWeight: 600 }} />
            <button type="button" style={paso} onClick={() => poner(cuantos + 1)} aria-label="Uno más" disabled={cuantos >= 60}>+</button>
          </div>
        </Campo>
      </div>
      <div style={{ fontSize: 12.5, color: C.g500, margin: '16px 0 8px' }}>Los nombres se numeran solos; puede cambiar cualquiera.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, maxHeight: 260, overflowY: 'auto', padding: 2 }}>
        {nombres.map((n, i) => <Input key={i} aria-label={`Nombre ${i + 1}`} value={n} maxLength={40} onChange={v => setNombres(l => l.map((x, j) => j === i ? v : x))} />)}
      </div>
      <Pie onCancelar={onClose} onGuardar={guardar} busy={busy} texto={cuantos === 1 ? 'Agregar' : `Agregar ${cuantos}`} />
    </Modal>
  )
}

function RecursoModal({ r, onClose, onGuardado }) {
  const [nombre, setNombre] = useState(r.nombre)
  const [fuera, setFuera] = useState(!!r.fuera_de_servicio)
  const [busy, setBusy] = useState(false)
  const guardar = async () => {
    const n = nombre.trim()
    if (!n) { toast.error('Escriba el nombre'); return }
    setBusy(true)
    const { error } = await supabase.from('recursos').update({ nombre: n, fuera_de_servicio: fuera }).eq('id', r.id)
    setBusy(false)
    if (error) { toast.error(falla(error, 'Ya existe uno con ese nombre en esta área')); return }
    toast.success('Cambios guardados')
    onGuardado()
  }
  const eliminar = async () => {
    if (!await confirmar({ mensaje: `¿Eliminar «${r.nombre}»?`, aceptar: 'Eliminar' })) return
    const { error } = await supabase.from('recursos').delete().eq('id', r.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Eliminado')
    onGuardado()
  }
  return (
    <Modal title={r.nombre} subtitle={TIPOS_RECURSO[r.tipo]?.nombre} onClose={onClose} maxWidth={440}>
      <div style={{ display: 'grid', gap: 16 }}>
        <Campo label="Nombre *"><Input value={nombre} onChange={setNombre} maxLength={40} autoFocus onKeyDown={e => { if (e.key === 'Enter') guardar() }} /></Campo>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 14 }}>
          <Interruptor activo={fuera} onChange={setFuera} />
          <span>Fuera de servicio<span style={{ display: 'block', fontSize: 12.5, color: C.g400 }}>Mantenimiento, reparación o limpieza profunda</span></span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 22 }}>
        <Button variant="danger" icon="eliminar" onClick={eliminar}>Eliminar</Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy} icon="check">{busy ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

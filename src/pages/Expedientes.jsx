import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { ORIGENES, REDES, ETAPAS_FOTO, METODOS_PAGO, estadoCita, origenLabel } from '../lib/constantes'
import { fmtQ, fmtFecha, fmtFechaCorta, fmtHora, hoyISO, saldo, totalCobro, linkWhatsApp } from '../lib/formato'
import { slug } from '../lib/excel'
import { resumenDatos } from '../lib/especialidades'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Tabla, Card, Badge, Vacio, Stat, Cargando, Pestanas } from '../components/ui/Varios'
import { Icon } from '../components/ui/Icon'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Campo, Input, Select, Textarea, Grid, filtroStyle } from '../components/ui/Campos'
import { Exportar } from '../components/Documento'
import { CitaModal } from '../components/CitaModal'
import { ProductosPaciente } from '../components/ProductosPaciente'
import { CobroDetalle, AbonoModal, estadoDeCuenta, ESTADOS_COBRO, estadoCobro, Progreso } from '../components/Pagos'
import { FiltroSede, nombreSede } from '../components/Filtros'
import { toast } from '../components/ui/Toast'
import { CompartirExpediente } from '../components/CompartirExpediente'
import { PortalCliente } from '../components/PortalCliente'
import { EnlacePaciente } from '../components/EnlacePaciente'
import { BotonesSubir, subirArchivos } from '../components/SubirArchivos'
import { TextoFormateado } from '../components/EditorTexto'
import { seccionesDe, camposPaciente, edad, urlPortal, urlRegistro } from '../lib/ficha'
import { puede } from '../lib/permisos'

export function Expedientes({ abrirId }) {
  const { pacientes, citas, cobros, clinica, ir, sedes, perfil } = useDatos()
  const finanzas = puede(perfil, 'finanzas')
  const [abierto, setAbierto] = useState(abrirId || null)
  const [sede, setSede] = useState('')
  const [buscar, setBuscar] = useState('')
  const [origen, setOrigen] = useState('')
  const [red, setRed] = useState('')
  const [contacto, setContacto] = useState('') // '' | 'telefono' | 'email' | 'sin'

  useEffect(() => { setAbierto(abrirId || null) }, [abrirId])

  const paciente = pacientes.find(p => p.id === abierto)
  if (abierto && paciente) return <Expediente paciente={paciente} onVolver={() => setAbierto(null)} />

  const q = buscar.trim().toLowerCase()
  const lista = pacientes
    .filter(p => (!q || [p.nombre, p.telefono, p.email, p.dpi].some(v => (v || '').toLowerCase().includes(q)))
      && (!origen || p.origen === origen) && (!red || p.red === red) && (!sede || p.sede_id === sede)
      && (!contacto || (contacto === 'telefono' ? !!p.telefono : contacto === 'email' ? !!p.email : !p.telefono && !p.email)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const hoy = hoyISO()
  const info = (p) => {
    const cs = citas.filter(c => c.paciente_id === p.id)
    const ultima = cs.filter(c => c.fecha <= hoy).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    const proxima = cs.filter(c => c.fecha > hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
    const deuda = cobros.filter(c => c.paciente_id === p.id).reduce((n, c) => n + saldo(c), 0)
    return { consultas: cs.length, ultima, proxima, deuda }
  }

  const preparar = () => ({
    titulo: 'Pacientes', subtitulo: `${lista.length} pacientes`,
    secciones: [{ tabla: { headers: ['Paciente', 'Teléfono', 'Correo', 'Origen', 'Consultas', 'Última cita', 'Próxima cita', ...(finanzas ? ['Saldo'] : [])],
      filas: lista.map(p => { const i = info(p); return [p.nombre, p.telefono || '—', p.email || '—', p.origen === 'redes' && p.red ? `Redes (${p.red})` : origenLabel(p.origen), i.consultas, i.ultima ? fmtFechaCorta(i.ultima.fecha) : '—', i.proxima ? fmtFechaCorta(i.proxima.fecha) : '—', ...(finanzas ? [fmtQ(i.deuda)] : [])] }) } }],
    excel: { archivo: 'pacientes', hojas: [{ nombre: 'Pacientes', columnas: [
      { header: 'Paciente', key: 'n', width: 30 }, { header: 'Teléfono', key: 't', width: 14 }, { header: 'Correo', key: 'e', width: 28 }, { header: 'DPI', key: 'dpi', width: 16 }, { header: 'Origen', key: 'o', width: 15 },
      { header: 'Red social', key: 'r', width: 12 }, { header: 'Referido por', key: 'ref', width: 20 }, { header: 'Registrado', key: 'reg', width: 12 },
      { header: 'Consultas', key: 'c', width: 10 }, { header: 'Última cita', key: 'u', width: 12 }, { header: 'Próxima cita', key: 'px', width: 12 },
      ...(finanzas ? [{ header: 'Saldo pendiente', key: 's', width: 15, moneda: true }] : []), { header: 'Tipo de sangre', key: 'sg', width: 12 },
      { header: 'Contacto de emergencia', key: 'ce', width: 24 }, { header: 'Tel. emergencia', key: 'te', width: 15 },
      { header: 'Alergias', key: 'al', width: 25 }, { header: 'Enfermedades', key: 'en', width: 25 }, { header: 'Medicamentos', key: 'me', width: 25 },
    ], filas: lista.map(p => { const i = info(p); return {
      n: p.nombre, t: p.telefono, e: p.email, dpi: p.dpi, ce: p.contacto_emergencia, te: p.telefono_emergencia, o: origenLabel(p.origen), r: p.red, ref: p.referido_por, reg: p.created_at.slice(0, 10), c: i.consultas,
      u: i.ultima?.fecha, px: i.proxima?.fecha, s: i.deuda, sg: p.tipo_sangre, al: p.alergias, en: p.enfermedades, me: p.medicamentos,
    } }) }] },
  })

  const sel = filtroStyle
  return (
    <>
      <Encabezado titulo="Expedientes" subtitulo={`${lista.length} ${lista.length === 1 ? 'paciente' : 'pacientes'}`}>
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
        <Button onClick={() => ir('registrar')} icon="mas">Registrar paciente</Button>
      </Encabezado>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, teléfono, correo o DPI…" style={{ ...sel, flex: '1 1 240px' }} />
        <select value={origen} onChange={e => setOrigen(e.target.value)} style={sel}><option value="">Todo origen</option>{ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select value={red} onChange={e => setRed(e.target.value)} style={sel}><option value="">Toda red social</option>{REDES.map(r => <option key={r}>{r}</option>)}</select>
        <select value={contacto} onChange={e => setContacto(e.target.value)} style={sel}>
          <option value="">Con o sin contacto</option><option value="telefono">Con teléfono</option><option value="email">Con correo</option><option value="sin">Sin teléfono ni correo</option>
        </select>
      </div>
      <div style={{ marginBottom: 14 }}><FiltroSede valor={sede} onChange={setSede} contar={(id) => pacientes.filter(p => !id || p.sede_id === id).length} /></div>
      {pacientes.length === 0 ? (
        <Vacio icono="expedientes" titulo="Aún no hay pacientes" texto="Registre su primer paciente para crear su expediente.">
          <Button onClick={() => ir('registrar')} icon="mas">Registrar paciente</Button>
        </Vacio>
      ) : (
        <Tabla
          columnas={['Paciente', 'Teléfono', ...(sedes.length ? ['Sede'] : []), 'Origen', 'Consultas', 'Última cita', 'Próxima cita', ...(finanzas ? ['Saldo'] : [])]}
          onFila={(f) => setAbierto(f.key)}
          vacio="Ningún paciente coincide con la búsqueda"
          filas={lista.map(p => { const i = info(p); return { key: p.id, celdas: [
            <span style={{ fontWeight: 500 }}>{p.nombre}</span>, p.telefono || '—', ...(sedes.length ? [nombreSede(sedes, p.sede_id) || <span style={{ color: C.g300 }}>—</span>] : []), p.origen === 'redes' && p.red ? p.red : origenLabel(p.origen), i.consultas,
            i.ultima ? fmtFechaCorta(i.ultima.fecha) : '—', i.proxima ? fmtFechaCorta(i.proxima.fecha) : '—',
            ...(finanzas ? [i.deuda > 0 ? <span style={{ color: C.red, fontWeight: 500 }}>{fmtQ(i.deuda)}</span> : <span style={{ color: C.g400 }}>Q0.00</span>] : []),
          ] } })}
        />
      )}
    </>
  )
}

const TABS = [
  { value: 'consultas', label: 'Consultas', icono: 'citas' },
  { value: 'ficha', label: 'Ficha del paciente', icono: 'estetoscopio' },
  { value: 'archivos', label: 'Fotos y documentos', icono: 'camara' },
  { value: 'cobros', label: 'Cobros', icono: 'cartera', permiso: 'finanzas' },
  { value: 'productos', label: 'Productos usados', icono: 'caja', inventario: true },
]

function Expediente({ paciente, onVolver }) {
  const { citas, cobros, clinica, perfil, recargar, acc, sedes } = useDatos()
  const clinico = puede(perfil, 'expedientes')
  const finanzas = puede(perfil, 'finanzas')
  const [tab, setTab] = useState('consultas')
  const [portal, setPortal] = useState(false)
  const [citaAbierta, setCitaAbierta] = useState(undefined) // undefined: list, null: new, object: edit
  const [editando, setEditando] = useState(false)
  const [compartir, setCompartir] = useState(undefined) // undefined: closed, null: whole file, cita: one consultation
  const [archivos, setArchivos] = useState(null)
  const misCitas = citas.filter(c => c.paciente_id === paciente.id).sort((a, b) => (b.fecha + (b.hora || '')).localeCompare(a.fecha + (a.hora || '')))
  const misCobros = cobros.filter(c => c.paciente_id === paciente.id).sort((a, b) => b.fecha.localeCompare(a.fecha))

  const cargarArchivos = useCallback(async () => {
    const { data } = await supabase.from('archivos').select('*').eq('paciente_id', paciente.id).order('fecha', { ascending: false })
    const lista = data || []
    if (lista.length) {
      const { data: urls } = await supabase.storage.from('expedientes').createSignedUrls(lista.map(a => a.path), 3600)
      const porPath = Object.fromEntries((urls || []).map(u => [u.path, u.signedUrl]))
      lista.forEach(a => { a.url = porPath[a.path] })
    }
    setArchivos(lista)
    return lista
  }, [paciente.id])
  useEffect(() => { cargarArchivos() }, [cargarArchivos])

  const eliminar = async () => {
    if (!confirm(`¿Eliminar a ${paciente.nombre} y TODO su expediente (citas, fotos, documentos y cobros)? Esta acción no se puede deshacer.`)) return
    const paths = (archivos || []).map(a => a.path)
    if (paths.length) await supabase.storage.from('expedientes').remove(paths)
    const { error } = await supabase.from('pacientes').delete().eq('id', paciente.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Paciente eliminado')
    await recargar()
    onVolver()
  }

  if (citaAbierta !== undefined) return <CitaModal cita={citaAbierta} paciente={paciente} clinicaId={perfil.clinica_id} onClose={() => setCitaAbierta(undefined)} onGuardado={async (r) => { setCitaAbierta(undefined); if (r?.pacienteEliminado) { await recargar(); onVolver() } else recargar() }} />

  if (portal && archivos) return <PortalCliente paciente={paciente} citas={misCitas} archivos={archivos} onVolver={() => setPortal(false)} onCambio={recargar} onArchivos={cargarArchivos} />

  const totalPrecio = misCobros.reduce((n, c) => n + totalCobro(c), 0)
  const totalPagado = misCobros.reduce((n, c) => n + (Number(c.pagado) || 0), 0)
  const anios = edad(paciente.fecha_nacimiento)

  return (
    <>
      <button onClick={onVolver} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.g500, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14, fontSize: 13.5, fontFamily: 'inherit' }}><Icon name="atras" size={16} />Expedientes</button>
      <Encabezado titulo={paciente.nombre} subtitulo={[anios != null && `${anios} años`, paciente.sexo, paciente.telefono, nombreSede(sedes, paciente.sede_id) && `Sede ${nombreSede(sedes, paciente.sede_id)}`, `paciente desde el ${fmtFecha(paciente.created_at)}`].filter(Boolean).join(' · ')}>
        <EnlacePaciente paciente={paciente} />
        {clinico && <Button size="sm" variant="ghost" icon="ojo" onClick={() => setPortal(true)} disabled={!archivos}>Portal del cliente{paciente.portal_activo ? ' · publicado' : ''}</Button>}
        {clinico && <Button size="sm" variant="ghost" icon="compartir" onClick={() => setCompartir(null)} disabled={!archivos}>Imprimir o compartir</Button>}
        <Button variant="ghost" size="sm" onClick={() => setEditando(true)} icon="editar">Editar ficha</Button>
        {puede(perfil, 'eliminar') && <Button variant="danger" size="sm" onClick={eliminar} icon="eliminar">Eliminar</Button>}
      </Encabezado>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 16 }}>
        <Stat label="Consultas" valor={misCitas.length} />
        {finanzas && <Stat label="Total pagado" valor={fmtQ(totalPagado)} color={C.green} />}
        {finanzas && <Stat label="Saldo pendiente" valor={fmtQ(totalPrecio - totalPagado)} color={totalPrecio - totalPagado > 0 ? C.red : C.black} />}
        <Stat label="Fotos y documentos" valor={archivos ? archivos.length : '…'} />
      </div>

      <div style={{ marginBottom: 16 }}><Pestanas opciones={TABS.filter(t => (!t.inventario || (acc.inventario && puede(perfil, 'inventario'))) && (!t.permiso || puede(perfil, t.permiso)) && (clinico || ['consultas', 'cobros'].includes(t.value)))} valor={tab} onChange={setTab} /></div>

      {tab === 'ficha' && clinico && <FichaPaciente paciente={paciente} onEditar={() => setEditando(true)} />}
      {tab === 'consultas' && <Consultas citas={misCitas} clinico={clinico} onAbrir={setCitaAbierta} onCompartir={(c) => setCompartir(c)} onCambio={recargar} />}
      {tab === 'archivos' && clinico && <Archivos paciente={paciente} archivos={archivos} citas={misCitas} clinicaId={perfil.clinica_id} onCambio={cargarArchivos} />}
      {tab === 'productos' && acc.inventario && <ProductosPaciente paciente={paciente} citas={misCitas} />}
      {tab === 'cobros' && finanzas && <Cobros paciente={paciente} cobros={misCobros} clinicaId={perfil.clinica_id} onCambio={recargar} />}

      {editando && <PacienteModal paciente={paciente} onClose={() => setEditando(false)} onGuardado={() => { setEditando(false); recargar() }} />}
      {compartir !== undefined && archivos && <CompartirExpediente paciente={paciente} citas={misCitas} cobros={misCobros} archivos={archivos} citaInicial={compartir} onClose={() => setCompartir(undefined)} />}
    </>
  )
}

// ─── Patient record: personal data, medical history and the clinic's own extra fields ───
function FichaPaciente({ paciente, onEditar }) {
  const { clinica, sedes } = useDatos()
  const extra = camposPaciente(clinica)
  const par = (k, v, alerta) => (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.g100}`, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: C.g500 }}>{k}</div>
      <div style={{ fontSize: 15.5, color: v ? (alerta ? C.red : C.black) : C.g300, marginTop: 3, whiteSpace: 'pre-wrap', fontWeight: alerta && v ? 500 : 400 }}>{v || 'Sin registrar'}</div>
    </div>
  )
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: '0 28px' }
  const formulario = paciente.registro_token && !paciente.registro_completado_at
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(formulario || paciente.registro_completado_at) && (
        <div style={{ background: formulario ? C.amberLight : C.greenLight, color: formulario ? C.amber : C.green, borderRadius: 16, padding: '11px 16px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name={formulario ? 'reloj' : 'check'} size={17} />
          <span style={{ flex: 1 }}>{formulario ? 'Se le envió el formulario al paciente; sus datos aparecerán aquí cuando lo llene.' : `El paciente llenó su formulario el ${fmtFecha(paciente.registro_completado_at)}.`}</span>
          {formulario && <Button size="sm" variant="ghost" icon="copiar" onClick={() => { navigator.clipboard?.writeText(urlRegistro(paciente.registro_token)); toast.success('Enlace copiado') }}>Copiar enlace del formulario</Button>}
        </div>
      )}
      <Card title="Datos personales" right={<Button variant="ghost" size="sm" onClick={onEditar} icon="editar">Editar</Button>}>
        <div style={grid}>
          {par('Fecha de nacimiento', paciente.fecha_nacimiento && `${fmtFecha(paciente.fecha_nacimiento)}${edad(paciente.fecha_nacimiento) != null ? ` (${edad(paciente.fecha_nacimiento)} años)` : ''}`)}
          {par('Sexo', paciente.sexo)}
          {par('DPI', paciente.dpi)}
          {par('Teléfono', paciente.telefono)}
          {par('Correo electrónico', paciente.email)}
          {par('Dirección', paciente.direccion)}
          {par('Ocupación', paciente.ocupacion)}
          {par('Estado civil', paciente.estado_civil)}
          {par('Cómo nos encontró', paciente.origen === 'redes' && paciente.red ? `Redes (${paciente.red})` : origenLabel(paciente.origen))}
          {nombreSede(sedes, paciente.sede_id) && par('Sede', nombreSede(sedes, paciente.sede_id))}
          {par('Contacto de emergencia', [paciente.contacto_emergencia, paciente.telefono_emergencia].filter(Boolean).join(' · '))}
          {paciente.extra?.motivo_registro && par('Motivo (lo escribió el paciente)', paciente.extra.motivo_registro)}
        </div>
      </Card>
      <Card title="Antecedentes médicos" right={<Button variant="ghost" size="sm" onClick={onEditar} icon="editar">Editar</Button>}>
        <div style={grid}>
          {par('Alergias', paciente.alergias, true)}
          {par('Tipo de sangre', paciente.tipo_sangre)}
          {par('Enfermedades crónicas', paciente.enfermedades)}
          {par('Medicamentos actuales', paciente.medicamentos)}
          {par('Antecedentes quirúrgicos', paciente.antecedentes_quirurgicos)}
          {par('Antecedentes familiares', paciente.antecedentes_familiares)}
          {par('Hábitos', paciente.habitos)}
        </div>
        {par('Notas médicas generales', paciente.notas_medicas)}
      </Card>
      {extra.length > 0 && (
        <Card title="Información adicional" right={<Button variant="ghost" size="sm" onClick={onEditar} icon="editar">Editar</Button>}>
          <div style={grid}>{extra.map(c => <div key={c.id}>{par(c.label, paciente.extra?.[c.id])}</div>)}</div>
        </Card>
      )}
    </div>
  )
}

function PacienteModal({ paciente, onClose, onGuardado }) {
  const { sedes, acc, clinica } = useDatos()
  const conSedes = acc?.inventario && sedes.length > 0
  const extra = camposPaciente(clinica)
  const [f, setF] = useState({ ...paciente, extra: { ...(paciente.extra || {}) } })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const setExtra = (k) => (v) => setF(p => ({ ...p, extra: { ...p.extra, [k]: v } }))
  const guardar = async () => {
    if (!f.nombre?.trim()) { toast.error('El nombre es requerido'); return }
    setBusy(true)
    const limpio = (v) => (typeof v === 'string' ? v.trim() : v) || null
    const campos = ['telefono', 'email', 'tipo_sangre', 'alergias', 'enfermedades', 'medicamentos', 'contacto_emergencia', 'telefono_emergencia', 'notas_medicas',
      'fecha_nacimiento', 'sexo', 'dpi', 'direccion', 'ocupacion', 'estado_civil', 'antecedentes_quirurgicos', 'antecedentes_familiares', 'habitos']
    const { error } = await supabase.from('pacientes').update({
      nombre: f.nombre.trim(), origen: f.origen || null,
      red: f.origen === 'redes' ? f.red || null : null, referido_por: f.origen === 'referido' ? limpio(f.referido_por) : null,
      ...Object.fromEntries(campos.map(k => [k, limpio(f[k])])),
      extra: Object.fromEntries(Object.entries(f.extra || {}).filter(([, v]) => v != null && String(v).trim()).map(([k, v]) => [k, String(v).trim()])),
      ...(conSedes ? { sede_id: f.sede_id || null } : {}),
    }).eq('id', paciente.id)
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Ficha actualizada')
    onGuardado()
  }
  const titulo = (t) => <div style={{ gridColumn: '1 / -1', fontSize: 14, fontWeight: 600, color: C.g700, marginTop: 8, paddingBottom: 6, borderBottom: `1px solid ${C.g100}` }}>{t}</div>
  return (
    <Modal title="Ficha del paciente" subtitle={paciente.nombre} onClose={onClose} maxWidth={820}>
      <Grid min={210}>
        {titulo('Datos personales')}
        <Campo label="Nombre completo *"><Input value={f.nombre} onChange={set('nombre')} maxLength={120} /></Campo>
        <Campo label="Fecha de nacimiento"><Input type="date" value={f.fecha_nacimiento} onChange={set('fecha_nacimiento')} /></Campo>
        <Campo label="Sexo"><Select value={f.sexo} onChange={set('sexo')}><option value="">—</option>{['Femenino', 'Masculino', 'Otro'].map(s => <option key={s}>{s}</option>)}</Select></Campo>
        <Campo label="DPI"><Input value={f.dpi} onChange={set('dpi')} maxLength={30} /></Campo>
        <Campo label="Teléfono"><Input value={f.telefono} onChange={set('telefono')} maxLength={30} /></Campo>
        <Campo label="Correo electrónico"><Input type="email" value={f.email} onChange={set('email')} maxLength={120} /></Campo>
        <Campo label="Ocupación"><Input value={f.ocupacion} onChange={set('ocupacion')} maxLength={120} /></Campo>
        <Campo label="Estado civil"><Select value={f.estado_civil} onChange={set('estado_civil')}><option value="">—</option>{['Soltero(a)', 'Casado(a)', 'Unido(a)', 'Divorciado(a)', 'Viudo(a)'].map(s => <option key={s}>{s}</option>)}</Select></Campo>
        <Campo label="Dirección" full><Input value={f.direccion} onChange={set('direccion')} maxLength={300} /></Campo>
        <Campo label="Cómo nos encontró"><Select value={f.origen} onChange={set('origen')}><option value="">—</option>{ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Campo>
        {f.origen === 'redes' && <Campo label="Red social"><Select value={f.red} onChange={set('red')}><option value="">—</option>{REDES.map(r => <option key={r}>{r}</option>)}</Select></Campo>}
        {f.origen === 'referido' && <Campo label="Referido por"><Input value={f.referido_por} onChange={set('referido_por')} maxLength={120} /></Campo>}
        {conSedes && <Campo label="Sede"><Select value={f.sede_id} onChange={set('sede_id')}><option value="">—</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>}
        <Campo label="Contacto de emergencia"><Input value={f.contacto_emergencia} onChange={set('contacto_emergencia')} maxLength={120} /></Campo>
        <Campo label="Teléfono de emergencia"><Input value={f.telefono_emergencia} onChange={set('telefono_emergencia')} maxLength={30} /></Campo>

        {titulo('Antecedentes médicos')}
        <Campo label="Tipo de sangre"><Input value={f.tipo_sangre} onChange={set('tipo_sangre')} placeholder="Ej. O+" maxLength={10} /></Campo>
        <Campo label="Alergias" full><Textarea value={f.alergias} onChange={set('alergias')} rows={2} maxLength={1000} /></Campo>
        <Campo label="Enfermedades crónicas" full><Textarea value={f.enfermedades} onChange={set('enfermedades')} rows={2} maxLength={1000} /></Campo>
        <Campo label="Medicamentos actuales" full><Textarea value={f.medicamentos} onChange={set('medicamentos')} rows={2} maxLength={1000} /></Campo>
        <Campo label="Antecedentes quirúrgicos" full><Textarea value={f.antecedentes_quirurgicos} onChange={set('antecedentes_quirurgicos')} rows={2} maxLength={1000} /></Campo>
        <Campo label="Antecedentes familiares" full><Textarea value={f.antecedentes_familiares} onChange={set('antecedentes_familiares')} rows={2} maxLength={1000} /></Campo>
        <Campo label="Hábitos" full><Textarea value={f.habitos} onChange={set('habitos')} rows={2} placeholder="Ej. fuma, ejercicio, alimentación…" maxLength={1000} /></Campo>
        <Campo label="Notas médicas generales" full><Textarea value={f.notas_medicas} onChange={set('notas_medicas')} rows={3} maxLength={4000} /></Campo>

        {extra.length > 0 && titulo('Información adicional')}
        {extra.map(c => <Campo key={c.id} label={c.label} full={c.largo}><Input value={f.extra?.[c.id]} onChange={setExtra(c.id)} maxLength={500} /></Campo>)}
      </Grid>
      <div style={{ fontSize: 12.5, color: C.g400, marginTop: 14 }}>Puede agregar sus propios campos en Configuración → Ficha clínica.</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

// ─── Consultations: each one readable on its own, with its clinical file sections ───
function Consultas({ citas, clinico, onAbrir, onCompartir, onCambio }) {
  const { sedes, clinica } = useDatos()
  const [abiertas, setAbiertas] = useState(() => new Set(citas.slice(0, 1).map(c => c.id)))
  const alternar = (id) => setAbiertas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <Card title={`Consultas (${citas.length})`} right={<Button size="sm" onClick={() => onAbrir(null)} icon="mas">Nueva cita</Button>}>
      {citas.length === 0 ? <div style={{ color: C.g400 }}>Sin consultas registradas</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {citas.map(c => {
            const e = estadoCita(c.estado)
            const secciones = clinico ? seccionesDe(c, clinica) : []
            const dc = clinico ? resumenDatos(c.datos, clinica?.especialidad) : ''
            const abierta = abiertas.has(c.id)
            const contenido = secciones.length || dc || c.procedimiento || (clinico && c.notas)
            return (
              <div key={c.id} style={{ border: `1px solid ${C.line}`, borderRadius: 18, overflow: 'hidden' }}>
                <div onClick={() => contenido ? alternar(c.id) : onAbrir(c)} className="fila" style={{ display: 'flex', gap: 14, padding: '14px 16px', alignItems: 'center', flexWrap: 'wrap', cursor: 'pointer' }}>
                  <div style={{ width: 120, flexShrink: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{fmtFechaCorta(c.fecha)}</div>
                    <div style={{ fontSize: 12.5, color: C.g500 }}>{fmtHora(c.hora)}{nombreSede(sedes, c.sede_id) ? ` · ${nombreSede(sedes, c.sede_id)}` : ''}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 180, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, fontSize: 15 }}>{c.tipo || 'Consulta'}{c.servicio ? ` · ${c.servicio}` : ''}</span>
                    <Badge color={e.color} bg={e.bg}>{c.estado}</Badge>
                    {secciones.length > 0 && <span style={{ fontSize: 12, color: C.g400 }}>{secciones.map(s => s.titulo).slice(0, 3).join(' · ')}{secciones.length > 3 ? '…' : ''}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={ev => ev.stopPropagation()}>
                    {clinico && c.portal && <span title="Se muestra en el portal del cliente" style={{ display: 'inline-flex', marginRight: 4 }}><Badge color={C.purpleDark} bg={C.purpleMid}>En portal</Badge></span>}
                    {clinico && <Button size="sm" variant="texto" icon="compartir" title="Imprimir o compartir esta consulta" onClick={() => onCompartir(c)} />}
                    <Button size="sm" variant="ghost" icon="editar" onClick={() => onAbrir(c)}>Abrir</Button>
                    {contenido && <Icon name={abierta ? 'arriba' : 'abajo'} size={17} style={{ color: C.g400, cursor: 'pointer' }} />}
                  </div>
                </div>
                {abierta && contenido && (
                  <div style={{ padding: '4px 18px 18px', borderTop: `1px solid ${C.g100}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {(dc || c.peso || c.talla) && <div style={{ fontSize: 13.5, color: C.g600, marginTop: 10 }}>{[c.peso && `Peso ${c.peso} kg`, c.talla && `Talla ${c.talla} cm`, dc].filter(Boolean).join(' · ')}</div>}
                    {secciones.map(s => (
                      <div key={s.id}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.purpleDark, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{s.titulo}</div>
                        <TextoFormateado html={s.html} />
                      </div>
                    ))}
                    {c.procedimiento && <div><div style={{ fontSize: 12, fontWeight: 600, color: C.purpleDark, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Procedimiento</div><div style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{c.procedimiento}</div></div>}
                    {clinico && c.notas && <div style={{ background: C.g50, borderRadius: 12, padding: '10px 12px' }}><div style={{ fontSize: 12, fontWeight: 600, color: C.g500, marginBottom: 3 }}>NOTAS INTERNAS</div><div style={{ fontSize: 14, whiteSpace: 'pre-wrap', color: C.g700 }}>{c.notas}</div></div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── Photos and documents (studies, x-rays, lab results in PDF…) ───
function Archivos({ paciente, archivos, citas, clinicaId, onCambio }) {
  const [subiendo, setSubiendo] = useState(0)
  const [etapa, setEtapa] = useState('estudio')
  const [fecha, setFecha] = useState(hoyISO())
  const [notas, setNotas] = useState('')
  const [citaId, setCitaId] = useState('')
  const [ver, setVer] = useState(null)

  const subir = async (files) => {
    setSubiendo(files.length)
    const errores = await subirArchivos(files, { clinicaId, pacienteId: paciente.id, citaId: citaId || null, etapa, fecha, notas: notas.trim() || null })
    setSubiendo(0)
    if (errores) toast.error(`${errores} archivo(s) no se pudieron subir`)
    else toast.success(files.length === 1 ? 'Archivo guardado' : 'Archivos guardados')
    setNotas('')
    onCambio()
  }

  const borrar = async (a) => {
    if (!confirm('¿Eliminar este archivo?')) return
    await supabase.storage.from('expedientes').remove([a.path])
    const { error } = await supabase.from('archivos').delete().eq('id', a.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    setVer(null)
    onCambio()
  }
  const esImagen = (a) => (a.mime || '').startsWith('image/')

  return (
    <>
      <Card title="Agregar fotos o documentos">
        <Grid min={180}>
          <Campo label="Tipo"><Select value={etapa} onChange={setEtapa}>{ETAPAS_FOTO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</Select></Campo>
          <Campo label="Fecha"><Input type="date" value={fecha} onChange={setFecha} /></Campo>
          <Campo label="Consulta (opcional)"><Select value={citaId} onChange={setCitaId}><option value="">—</option>{citas.map(c => <option key={c.id} value={c.id}>{fmtFechaCorta(c.fecha)} · {c.tipo || 'Consulta'}</option>)}</Select></Campo>
          <Campo label="Descripción (opcional)"><Input value={notas} onChange={setNotas} placeholder="Ej. Radiografía de tórax" maxLength={200} /></Campo>
        </Grid>
        <div style={{ marginTop: 14 }}><BotonesSubir onArchivos={subir} ocupado={subiendo ? `Subiendo ${subiendo} archivo(s)…` : ''} texto="Elegir fotos o PDF (estudios, radiografías, laboratorios…)" /></div>
        <div style={{ fontSize: 12, color: C.g400, marginTop: 6 }}>Se guardan en la nube de forma privada: solo su consultorio puede verlos, desde cualquier dispositivo. El paciente solo ve los que usted elija en «Portal del cliente».</div>
      </Card>

      {!archivos ? <Cargando /> : ETAPAS_FOTO.map(et => {
        const lista = archivos.filter(a => a.etapa === et.value)
        if (!lista.length) return null
        return (
          <Card key={et.value} title={`${et.label} (${lista.length})`} style={{ marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
              {lista.map(a => (
                <div key={a.id} style={{ border: `1px solid ${C.g200}`, borderRadius: 16, overflow: 'hidden', background: C.g50 }}>
                  <button onClick={() => setVer(a)} style={{ padding: 0, border: 'none', width: '100%', background: 'none', cursor: 'pointer', textAlign: 'left', display: 'block' }}>
                    {esImagen(a)
                      ? <img src={a.url} alt={a.notas || a.nombre || 'Foto del expediente'} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ height: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: C.red, background: '#fff' }}><Icon name="pdf" size={36} /><span style={{ fontSize: 11.5, color: C.g600, padding: '0 8px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{a.nombre || 'Documento PDF'}</span></div>}
                  </button>
                  <div style={{ padding: '7px 9px', fontSize: 12, color: C.g600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtFechaCorta(a.fecha)}{a.notas ? ` · ${a.notas}` : ''}</span>
                    {a.portal && <span title="Se muestra en el portal del cliente" style={{ fontSize: 11, color: C.purpleDark, fontWeight: 600 }}>Portal</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      })}
      {archivos && archivos.length === 0 && <Vacio icono="camara" titulo="Sin fotos ni documentos todavía" texto="Agregue fotos de antes, proceso y resultado, o estudios en PDF." />}

      {ver && (
        <Modal title={ver.nombre && !esImagen(ver) ? ver.nombre : ETAPAS_FOTO.find(e => e.value === ver.etapa)?.label} subtitle={`${fmtFecha(ver.fecha)}${ver.notas ? ' · ' + ver.notas : ''}`} onClose={() => setVer(null)} maxWidth={900}>
          {esImagen(ver)
            ? <img src={ver.url} alt={ver.notas || 'Foto del expediente'} style={{ width: '100%', borderRadius: 16 }} />
            : <iframe src={ver.url} title={ver.nombre || 'Documento'} style={{ width: '100%', height: '70vh', border: `1px solid ${C.line}`, borderRadius: 12 }} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <span style={{ marginRight: 'auto' }} />
            <Button variant="ghost" onClick={() => window.open(ver.url, '_blank', 'noopener')} icon="descargar">Abrir / descargar</Button>
            <Button variant="danger" onClick={() => borrar(ver)} icon="eliminar">Eliminar</Button>
          </div>
        </Modal>
      )}
    </>
  )
}

function Cobros({ paciente, cobros, clinicaId, onCambio }) {
  const { clinica } = useDatos()
  const [editando, setEditando] = useState(undefined)
  const [abierto, setAbierto] = useState(null)
  const [pagar, setPagar] = useState(null)
  const total = cobros.reduce((n, c) => n + totalCobro(c), 0)
  const pagado = cobros.reduce((n, c) => n + (Number(c.pagado) || 0), 0)
  return (
    <Card title={`Cobros y pagos (${cobros.length})`} right={<>
      {cobros.length > 0 && <Exportar clinica={clinica?.nombre} preparar={() => estadoDeCuenta(paciente, cobros)} />}
      <Button size="sm" onClick={() => setEditando(null)} icon="mas">Nuevo cobro</Button>
    </>}>
      {cobros.length === 0 ? <div style={{ color: C.g400 }}>Sin cobros registrados</div> : (
        <>
          <Tabla
            columnas={['Fecha', 'Concepto', 'Total', 'Pagado', 'Saldo', 'Avance', 'Estado', '']}
            onFila={(f) => f.cobro && setAbierto(f.cobro)}
            filas={[...cobros.map(c => {
              const e = ESTADOS_COBRO[estadoCobro(c)]
              return { key: c.id, cobro: c, celdas: [fmtFechaCorta(c.fecha), <div><div>{c.concepto}</div>{Number(c.descuento) > 0 && <div style={{ fontSize: 12, color: C.green }}>Descuento {fmtQ(c.descuento)}</div>}</div>,
                fmtQ(totalCobro(c)), <span style={{ color: C.green }}>{fmtQ(c.pagado)}</span>,
                <span style={{ fontWeight: 500, color: saldo(c) > 0 ? C.red : C.g400 }}>{fmtQ(saldo(c))}</span>, <Progreso c={c} ancho={90} />,
                <div><Badge color={e.color} bg={e.bg}>{e.label}</Badge>{c.vence && saldo(c) > 0 && <div style={{ fontSize: 11.5, color: C.g400, marginTop: 2 }}>límite {fmtFechaCorta(c.vence)}</div>}</div>,
                <div style={{ display: 'flex', gap: 6 }} onClick={ev => ev.stopPropagation()}>
                  {saldo(c) > 0 && <Button variant="ghost" size="sm" onClick={() => setPagar(c)}>Registrar pago</Button>}
                  <Button variant="texto" size="sm" onClick={() => setEditando(c)} icon="editar" title="Editar cobro" />
                </div>] }
            }), { key: 'total', celdas: [<strong style={{ fontWeight: 500 }}>Total</strong>, '', <strong style={{ fontWeight: 500 }}>{fmtQ(total)}</strong>, <strong style={{ fontWeight: 500, color: C.green }}>{fmtQ(pagado)}</strong>, <strong style={{ fontWeight: 500, color: total - pagado > 0 ? C.red : C.black }}>{fmtQ(total - pagado)}</strong>, '', '', ''] }]}
          />
          <div style={{ fontSize: 12.5, color: C.g400, marginTop: 10 }}>Haga clic en un cobro para ver su historial de pagos y poner un plazo para pagar.</div>
        </>
      )}
      {editando !== undefined && <CobroModal cobro={editando} paciente={paciente} clinicaId={clinicaId} onClose={() => setEditando(undefined)} onGuardado={() => { setEditando(undefined); onCambio() }} />}
      {abierto && <CobroDetalle cobro={cobros.find(c => c.id === abierto.id) || abierto} paciente={paciente} onClose={() => setAbierto(null)} onCambio={onCambio} />}
      {pagar && <AbonoModal cobro={pagar} paciente={paciente} onClose={() => setPagar(null)} onGuardado={() => { setPagar(null); onCambio() }} />}
    </Card>
  )
}

function CobroModal({ cobro, paciente, clinicaId, onClose, onGuardado }) {
  const { servicios } = useDatos()
  const [f, setF] = useState({
    servicioId: cobro?.servicio_id || '', concepto: cobro?.concepto || '', precio: cobro?.precio ?? '', descuento: cobro?.descuento ? String(cobro.descuento) : '',
    pagado: '', metodo: cobro?.metodo || '', fecha: cobro?.fecha || hoyISO(), vence: cobro?.vence || '', observaciones: cobro?.observaciones || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const precio = Number(f.precio) || 0, descuento = Number(f.descuento) || 0, pagado = Number(f.pagado) || 0
  const total = Math.max(0, precio - descuento)
  const activos = servicios.filter(x => x.activo).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre, 'es'))

  const elegirServicio = (id) => {
    const sv = servicios.find(x => x.id === id)
    setF(p => sv ? { ...p, servicioId: id, concepto: sv.nombre, precio: String(sv.precio) } : { ...p, servicioId: '' })
  }

  const guardar = async () => {
    if (!f.concepto.trim()) { toast.error('Escriba el concepto o procedimiento'); return }
    if (descuento > precio) { toast.error('El descuento no puede ser mayor que el precio'); return }
    if (!cobro && pagado > total) { toast.error('El anticipo no puede ser mayor que el total'); return }
    if (cobro && total < Number(cobro.pagado || 0)) { toast.error(`Ya se pagaron ${fmtQ(cobro.pagado)}; el total no puede quedar por debajo`); return }
    const fila = {
      concepto: f.concepto.trim(), servicio_id: f.servicioId || null, precio, descuento, metodo: f.metodo || null,
      fecha: f.fecha, vence: f.vence || null, observaciones: f.observaciones.trim() || null,
    }
    setBusy(true)
    const { data: nuevo, error } = cobro
      ? await supabase.from('cobros').update(fila).eq('id', cobro.id).select().single()
      : await supabase.from('cobros').insert({ ...fila, clinica_id: clinicaId, paciente_id: paciente.id }).select().single()
    // the down payment of a new charge is its first payment
    if (!error && !cobro && pagado > 0) await supabase.from('abonos').insert({ cobro_id: nuevo.id, monto: pagado, fecha: f.fecha, metodo: f.metodo || null, nota: 'Anticipo' })
    setBusy(false)
    if (error) { toast.error('No se pudo guardar el cobro'); return }
    toast.success('Cobro guardado')
    onGuardado()
  }
  const eliminar = async () => {
    if (!confirm('¿Eliminar este cobro?')) return
    const { error } = await supabase.from('cobros').delete().eq('id', cobro.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Cobro eliminado')
    onGuardado()
  }

  const resumen = (label, valor, color = C.black, grande) => (
    <div style={{ flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.g400, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: grande ? 20 : 16, fontWeight: 600, color, marginTop: 2 }}>{valor}</div>
    </div>
  )

  return (
    <Modal title={cobro ? 'Editar cobro' : 'Nuevo cobro'} subtitle={paciente.nombre} onClose={onClose}>
      <Grid min={180}>
        {activos.length > 0 && (
          <Campo label="Servicio de sus tarifas" full>
            <Select value={f.servicioId} onChange={elegirServicio}>
              <option value="">— Escribir concepto manualmente —</option>
              {activos.map(x => <option key={x.id} value={x.id}>{x.categoria} · {x.nombre} — {fmtQ(x.precio)}</option>)}
            </Select>
          </Campo>
        )}
        <Campo label="Concepto / procedimiento *" full><Input value={f.concepto} onChange={set('concepto')} placeholder="Ej. Consulta, Rinoplastía…" /></Campo>
        <Campo label="Precio (Q)"><Input type="number" min="0" step="0.01" value={f.precio} onChange={set('precio')} /></Campo>
        <Campo label="Descuento (Q)" ayuda="Ej. tarifa Q17,000 dejada en Q15,000 → Q2,000"><Input type="number" min="0" step="0.01" value={f.descuento} onChange={set('descuento')} placeholder="0.00" /></Campo>
        {!cobro && <Campo label="Anticipo (Q)" ayuda="Si ya dejó un pago; los siguientes se registran en el historial"><Input type="number" min="0" step="0.01" value={f.pagado} onChange={set('pagado')} placeholder="0.00" /></Campo>}
        <Campo label="Método de pago"><Select value={f.metodo} onChange={set('metodo')}><option value="">—</option>{METODOS_PAGO.map(m => <option key={m}>{m}</option>)}</Select></Campo>
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
        <Campo label="Fecha límite de pago" ayuda={<span>Plazo: {[[30, 'días'], [3, 'meses'], [6, 'meses']].map(([n, u]) => <button key={n + u} type="button" onClick={() => { const d = new Date(`${f.fecha}T12:00`); u === 'meses' ? d.setMonth(d.getMonth() + n) : d.setDate(d.getDate() + n); set('vence')(d.toISOString().slice(0, 10)) }} style={{ border: 'none', background: 'none', color: C.purple, cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', fontSize: 12 }}>{n} {u}</button>)}</span>}><Input type="date" value={f.vence} onChange={set('vence')} /></Campo>
        <Campo label="Observaciones" full><Textarea value={f.observaciones} onChange={set('observaciones')} rows={2} /></Campo>
      </Grid>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18, padding: '14px 16px', background: C.g50, border: `1px solid ${C.line}`, borderRadius: 14 }}>
        {resumen('PRECIO', fmtQ(precio))}
        {resumen('DESCUENTO', descuento ? `− ${fmtQ(descuento)}` : '—', C.green)}
        {resumen('TOTAL', fmtQ(total), C.black, true)}
        {resumen('SALDO', fmtQ(Math.max(0, total - (cobro ? Number(cobro.pagado || 0) : pagado))), total - (cobro ? Number(cobro.pagado || 0) : pagado) > 0 ? C.red : C.green, true)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {cobro && <Button variant="danger" icon="eliminar" onClick={eliminar}>Eliminar</Button>}
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

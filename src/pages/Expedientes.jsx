import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { ORIGENES, REDES, ETAPAS_FOTO, METODOS_PAGO, estadoCita, origenLabel } from '../lib/constantes'
import { fmtQ, fmtFecha, fmtFechaCorta, fmtHora, hoyISO, saldo, totalCobro } from '../lib/formato'
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

export function Expedientes({ abrirId }) {
  const { pacientes, citas, cobros, clinica, ir, sedes } = useDatos()
  const [abierto, setAbierto] = useState(abrirId || null)
  const [sede, setSede] = useState('')
  const [buscar, setBuscar] = useState('')
  const [origen, setOrigen] = useState('')

  useEffect(() => { setAbierto(abrirId || null) }, [abrirId])

  const paciente = pacientes.find(p => p.id === abierto)
  if (abierto && paciente) return <Expediente paciente={paciente} onVolver={() => setAbierto(null)} />

  const q = buscar.trim().toLowerCase()
  const lista = pacientes
    .filter(p => (!q || p.nombre.toLowerCase().includes(q) || (p.telefono || '').includes(q)) && (!origen || p.origen === origen) && (!sede || p.sede_id === sede))
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
    secciones: [{ tabla: { headers: ['Paciente', 'Teléfono', 'Origen', 'Consultas', 'Última cita', 'Próxima cita', 'Saldo'],
      filas: lista.map(p => { const i = info(p); return [p.nombre, p.telefono || '—', p.origen === 'redes' && p.red ? `Redes (${p.red})` : origenLabel(p.origen), i.consultas, i.ultima ? fmtFechaCorta(i.ultima.fecha) : '—', i.proxima ? fmtFechaCorta(i.proxima.fecha) : '—', fmtQ(i.deuda)] }) } }],
    excel: { archivo: 'pacientes', hojas: [{ nombre: 'Pacientes', columnas: [
      { header: 'Paciente', key: 'n', width: 30 }, { header: 'Teléfono', key: 't', width: 14 }, { header: 'Origen', key: 'o', width: 15 },
      { header: 'Red social', key: 'r', width: 12 }, { header: 'Referido por', key: 'ref', width: 20 }, { header: 'Registrado', key: 'reg', width: 12 },
      { header: 'Consultas', key: 'c', width: 10 }, { header: 'Última cita', key: 'u', width: 12 }, { header: 'Próxima cita', key: 'px', width: 12 },
      { header: 'Saldo pendiente', key: 's', width: 15, moneda: true }, { header: 'Tipo de sangre', key: 'sg', width: 12 },
      { header: 'Alergias', key: 'al', width: 25 }, { header: 'Enfermedades', key: 'en', width: 25 }, { header: 'Medicamentos', key: 'me', width: 25 },
    ], filas: lista.map(p => { const i = info(p); return {
      n: p.nombre, t: p.telefono, o: origenLabel(p.origen), r: p.red, ref: p.referido_por, reg: p.created_at.slice(0, 10), c: i.consultas,
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
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre o teléfono…" style={{ ...sel, flex: '1 1 240px' }} />
        <select value={origen} onChange={e => setOrigen(e.target.value)} style={sel}><option value="">Todo origen</option>{ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      </div>
      <div style={{ marginBottom: 14 }}><FiltroSede valor={sede} onChange={setSede} contar={(id) => pacientes.filter(p => !id || p.sede_id === id).length} /></div>
      {pacientes.length === 0 ? (
        <Vacio icono="expedientes" titulo="Aún no hay pacientes" texto="Registre su primer paciente para crear su expediente.">
          <Button onClick={() => ir('registrar')} icon="mas">Registrar paciente</Button>
        </Vacio>
      ) : (
        <Tabla
          columnas={['Paciente', 'Teléfono', ...(sedes.length ? ['Sede'] : []), 'Origen', 'Consultas', 'Última cita', 'Próxima cita', 'Saldo']}
          onFila={(f) => setAbierto(f.key)}
          vacio="Ningún paciente coincide con la búsqueda"
          filas={lista.map(p => { const i = info(p); return { key: p.id, celdas: [
            <span style={{ fontWeight: 500 }}>{p.nombre}</span>, p.telefono || '—', ...(sedes.length ? [nombreSede(sedes, p.sede_id) || <span style={{ color: C.g300 }}>—</span>] : []), p.origen === 'redes' && p.red ? p.red : origenLabel(p.origen), i.consultas,
            i.ultima ? fmtFechaCorta(i.ultima.fecha) : '—', i.proxima ? fmtFechaCorta(i.proxima.fecha) : '—',
            i.deuda > 0 ? <span style={{ color: C.red, fontWeight: 500 }}>{fmtQ(i.deuda)}</span> : <span style={{ color: C.g400 }}>Q0.00</span>,
          ] } })}
        />
      )}
    </>
  )
}

const TABS = [
  { value: 'datos', label: 'Datos médicos', icono: 'estetoscopio' },
  { value: 'consultas', label: 'Consultas', icono: 'citas' },
  { value: 'fotos', label: 'Fotos', icono: 'camara' },
  { value: 'cobros', label: 'Cobros', icono: 'cartera' },
  { value: 'productos', label: 'Productos usados', icono: 'caja', inventario: true },
]

function Expediente({ paciente, onVolver }) {
  const { citas, cobros, clinica, perfil, recargar, acc, sedes } = useDatos()
  const [tab, setTab] = useState('datos')
  const [citaAbierta, setCitaAbierta] = useState(undefined) // undefined: list, null: new, object: edit
  const [editando, setEditando] = useState(false)
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
    if (!confirm(`¿Eliminar a ${paciente.nombre} y TODO su expediente (citas, fotos y cobros)? Esta acción no se puede deshacer.`)) return
    const paths = (archivos || []).map(a => a.path)
    if (paths.length) await supabase.storage.from('expedientes').remove(paths)
    const { error } = await supabase.from('pacientes').delete().eq('id', paciente.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Paciente eliminado')
    await recargar()
    onVolver()
  }

  if (citaAbierta !== undefined) return <CitaModal cita={citaAbierta} paciente={paciente} clinicaId={perfil.clinica_id} onClose={() => setCitaAbierta(undefined)} onGuardado={async (r) => { setCitaAbierta(undefined); if (r?.pacienteEliminado) { await recargar(); onVolver() } else recargar() }} />

  const totalPrecio = misCobros.reduce((n, c) => n + totalCobro(c), 0)
  const totalPagado = misCobros.reduce((n, c) => n + (Number(c.pagado) || 0), 0)

  const preparar = async () => {
    const actuales = await cargarArchivos() // fresh signed links for the printed photos
    const fotos = actuales.filter(a => a.url && (a.mime || '').startsWith('image/'))
    return {
      titulo: 'Expediente clínico', subtitulo: paciente.nombre,
      secciones: [
        { titulo: 'Datos del paciente', pares: [
          ['Nombre', paciente.nombre], ['Teléfono', paciente.telefono], ['Correo', paciente.email], ['Origen', paciente.origen === 'redes' && paciente.red ? `Redes (${paciente.red})` : origenLabel(paciente.origen)],
          ['Referido por', paciente.referido_por], ['Tipo de sangre', paciente.tipo_sangre], ['Registrado', fmtFecha(paciente.created_at)],
          ['Contacto de emergencia', paciente.contacto_emergencia], ['Teléfono de emergencia', paciente.telefono_emergencia],
        ] },
        { titulo: 'Antecedentes', pares: [['Alergias', paciente.alergias], ['Enfermedades crónicas', paciente.enfermedades], ['Medicamentos actuales', paciente.medicamentos]] },
        paciente.notas_medicas && { titulo: 'Notas médicas generales', texto: paciente.notas_medicas },
        { titulo: 'Consultas', tabla: { headers: ['Fecha', 'Hora', 'Tipo', 'Estado', 'Peso', 'Talla', 'Datos clínicos', 'Procedimiento', 'Notas'],
          filas: misCitas.map(c => [fmtFechaCorta(c.fecha), fmtHora(c.hora), [c.tipo, c.servicio].filter(Boolean).join(' · ') || '—', c.estado, c.peso ? `${c.peso} kg` : '—', c.talla ? `${c.talla} cm` : '—', resumenDatos(c.datos, clinica?.especialidad) || '—', c.procedimiento || '—', c.notas || '—']) } },
        { titulo: 'Cobros', tabla: { headers: ['Fecha', 'Concepto', 'Precio', 'Descuento', 'Total', 'Pagado', 'Saldo', 'Método', 'Vence'],
          filas: [...misCobros.map(c => [fmtFechaCorta(c.fecha), c.concepto, fmtQ(c.precio), Number(c.descuento) ? fmtQ(c.descuento) : '—', fmtQ(totalCobro(c)), fmtQ(c.pagado), fmtQ(saldo(c)), c.metodo || '—', c.vence ? fmtFechaCorta(c.vence) : '—']),
            ...(misCobros.length ? [{ _total: true, celdas: ['', 'Total', '', '', fmtQ(totalPrecio), fmtQ(totalPagado), fmtQ(totalPrecio - totalPagado), '', ''] }] : [])] } },
        fotos.length > 0 && { titulo: 'Fotos', imagenes: fotos.map(a => ({ src: a.url, pie: `${ETAPAS_FOTO.find(e => e.value === a.etapa)?.label} · ${fmtFechaCorta(a.fecha)}${a.notas ? ' · ' + a.notas : ''}` })) },
      ],
      excel: { archivo: `expediente_${slug(paciente.nombre)}`, hojas: [
        { nombre: 'Datos', columnas: [{ header: 'Campo', key: 'k', width: 26 }, { header: 'Valor', key: 'v', width: 50 }], filas: [
          ['Nombre', paciente.nombre], ['Teléfono', paciente.telefono], ['Correo', paciente.email], ['Origen', origenLabel(paciente.origen)], ['Red social', paciente.red], ['Referido por', paciente.referido_por],
          ['Tipo de sangre', paciente.tipo_sangre], ['Alergias', paciente.alergias], ['Enfermedades crónicas', paciente.enfermedades], ['Medicamentos', paciente.medicamentos],
          ['Contacto de emergencia', paciente.contacto_emergencia], ['Teléfono de emergencia', paciente.telefono_emergencia], ['Notas médicas', paciente.notas_medicas],
        ].map(([k, v]) => ({ k, v })) },
        { nombre: 'Consultas', columnas: [{ header: 'Fecha', key: 'f', width: 12 }, { header: 'Hora', key: 'h', width: 8 }, { header: 'Tipo', key: 't', width: 18 }, { header: 'Estado', key: 'e', width: 12 },
          { header: 'Peso (kg)', key: 'p', width: 10 }, { header: 'Talla (cm)', key: 'ta', width: 10 }, { header: 'Datos clínicos', key: 'dc', width: 40 }, { header: 'Procedimiento', key: 'pr', width: 28 }, { header: 'Notas', key: 'n', width: 50 }],
          filas: misCitas.map(c => ({ f: c.fecha, h: fmtHora(c.hora), t: c.tipo, e: c.estado, p: c.peso, ta: c.talla, dc: resumenDatos(c.datos, clinica?.especialidad), pr: c.procedimiento, n: c.notas })) },
        { nombre: 'Cobros', columnas: [{ header: 'Fecha', key: 'f', width: 12 }, { header: 'Concepto', key: 'c', width: 30 }, { header: 'Precio', key: 'p', width: 12, moneda: true },
          { header: 'Descuento', key: 'd', width: 12, moneda: true }, { header: 'Total', key: 't', width: 12, moneda: true }, { header: 'Pagado', key: 'pa', width: 12, moneda: true }, { header: 'Saldo', key: 's', width: 12, moneda: true }, { header: 'Método', key: 'm', width: 14 },
          { header: 'Vence', key: 'v', width: 12 }, { header: 'Observaciones', key: 'o', width: 40 }],
          filas: misCobros.map(c => ({ f: c.fecha, c: c.concepto, p: Number(c.precio), d: Number(c.descuento) || 0, t: totalCobro(c), pa: Number(c.pagado), s: saldo(c), m: c.metodo, v: c.vence, o: c.observaciones })) },
      ] },
    }
  }

  return (
    <>
      <button onClick={onVolver} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.g500, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14, fontSize: 13.5 }}><Icon name="atras" size={16} />Expedientes</button>
      <Encabezado titulo={paciente.nombre} subtitulo={[paciente.telefono, paciente.email, nombreSede(sedes, paciente.sede_id) && `Sede ${nombreSede(sedes, paciente.sede_id)}`, paciente.origen === 'redes' && paciente.red ? `Llegó por ${paciente.red}` : origenLabel(paciente.origen), `registrado el ${fmtFecha(paciente.created_at)}`].filter(Boolean).join(' · ')}>
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
        <Button variant="ghost" size="sm" onClick={() => setEditando(true)} icon="editar">Editar datos</Button>
        <Button variant="danger" size="sm" onClick={eliminar} icon="eliminar">Eliminar paciente</Button>
      </Encabezado>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        <Stat label="Consultas" valor={misCitas.length} />
        <Stat label="Total pagado" valor={fmtQ(totalPagado)} color={C.green} />
        <Stat label="Saldo pendiente" valor={fmtQ(totalPrecio - totalPagado)} color={totalPrecio - totalPagado > 0 ? C.red : C.black} />
        <Stat label="Fotos" valor={archivos ? archivos.length : '…'} />
      </div>

      <div style={{ marginBottom: 16 }}><Pestanas opciones={TABS.filter(t => !t.inventario || acc.inventario)} valor={tab} onChange={setTab} /></div>

      {tab === 'datos' && <DatosMedicos paciente={paciente} onEditar={() => setEditando(true)} />}
      {tab === 'consultas' && <Consultas citas={misCitas} onAbrir={setCitaAbierta} />}
      {tab === 'fotos' && <Fotos paciente={paciente} archivos={archivos} citas={misCitas} clinicaId={perfil.clinica_id} onCambio={cargarArchivos} />}
      {tab === 'productos' && acc.inventario && <ProductosPaciente paciente={paciente} citas={misCitas} />}
      {tab === 'cobros' && <Cobros paciente={paciente} cobros={misCobros} clinicaId={perfil.clinica_id} onCambio={recargar} />}

      {editando && <PacienteModal paciente={paciente} onClose={() => setEditando(false)} onGuardado={() => { setEditando(false); recargar() }} />}
    </>
  )
}

function DatosMedicos({ paciente, onEditar }) {
  const par = (k, v) => (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${C.g100}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
      <div style={{ fontSize: 14.5, color: v ? C.black : C.g300, marginTop: 2, whiteSpace: 'pre-wrap' }}>{v || 'Sin registrar'}</div>
    </div>
  )
  return (
    <Card title="Datos médicos" right={<Button variant="ghost" size="sm" onClick={onEditar} icon="editar">Editar</Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '0 24px' }}>
        {par('Tipo de sangre', paciente.tipo_sangre)}
        {par('Alergias', paciente.alergias)}
        {par('Enfermedades crónicas', paciente.enfermedades)}
        {par('Medicamentos actuales', paciente.medicamentos)}
        {par('Contacto de emergencia', paciente.contacto_emergencia)}
        {par('Teléfono de emergencia', paciente.telefono_emergencia)}
      </div>
      {par('Notas médicas generales', paciente.notas_medicas)}
    </Card>
  )
}

function PacienteModal({ paciente, onClose, onGuardado }) {
  const { sedes, acc } = useDatos()
  const conSedes = acc?.inventario && sedes.length > 0
  const [f, setF] = useState({ ...paciente })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const guardar = async () => {
    if (!f.nombre?.trim()) { toast.error('El nombre es requerido'); return }
    setBusy(true)
    const limpio = (v) => (typeof v === 'string' ? v.trim() : v) || null
    const { error } = await supabase.from('pacientes').update({
      nombre: f.nombre.trim(), telefono: limpio(f.telefono), email: limpio(f.email), origen: f.origen || null,
      red: f.origen === 'redes' ? f.red || null : null, referido_por: f.origen === 'referido' ? limpio(f.referido_por) : null,
      tipo_sangre: limpio(f.tipo_sangre), alergias: limpio(f.alergias), enfermedades: limpio(f.enfermedades),
      medicamentos: limpio(f.medicamentos), contacto_emergencia: limpio(f.contacto_emergencia), ...(conSedes ? { sede_id: f.sede_id || null } : {}),
      telefono_emergencia: limpio(f.telefono_emergencia), notas_medicas: limpio(f.notas_medicas),
    }).eq('id', paciente.id)
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Datos actualizados')
    onGuardado()
  }
  return (
    <Modal title="Editar datos del paciente" subtitle={paciente.nombre} onClose={onClose} maxWidth={720}>
      <Grid min={200}>
        <Campo label="Nombre completo *"><Input value={f.nombre} onChange={set('nombre')} /></Campo>
        <Campo label="Teléfono"><Input value={f.telefono} onChange={set('telefono')} /></Campo>
        <Campo label="Correo electrónico"><Input type="email" value={f.email} onChange={set('email')} /></Campo>
        <Campo label="Origen"><Select value={f.origen} onChange={set('origen')}><option value="">—</option>{ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Campo>
        {f.origen === 'redes' && <Campo label="Red social"><Select value={f.red} onChange={set('red')}><option value="">—</option>{REDES.map(r => <option key={r}>{r}</option>)}</Select></Campo>}
        {f.origen === 'referido' && <Campo label="Referido por"><Input value={f.referido_por} onChange={set('referido_por')} /></Campo>}
        {conSedes && <Campo label="Sede"><Select value={f.sede_id} onChange={set('sede_id')}><option value="">—</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Campo>}
        <Campo label="Tipo de sangre"><Input value={f.tipo_sangre} onChange={set('tipo_sangre')} placeholder="Ej. O+" /></Campo>
        <Campo label="Alergias" full><Textarea value={f.alergias} onChange={set('alergias')} rows={2} /></Campo>
        <Campo label="Enfermedades crónicas" full><Textarea value={f.enfermedades} onChange={set('enfermedades')} rows={2} /></Campo>
        <Campo label="Medicamentos actuales" full><Textarea value={f.medicamentos} onChange={set('medicamentos')} rows={2} /></Campo>
        <Campo label="Contacto de emergencia"><Input value={f.contacto_emergencia} onChange={set('contacto_emergencia')} /></Campo>
        <Campo label="Teléfono de emergencia"><Input value={f.telefono_emergencia} onChange={set('telefono_emergencia')} /></Campo>
        <Campo label="Notas médicas generales" full><Textarea value={f.notas_medicas} onChange={set('notas_medicas')} rows={4} /></Campo>
      </Grid>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

function Consultas({ citas, onAbrir }) {
  const { sedes, clinica } = useDatos()
  return (
    <Card title={`Consultas (${citas.length})`} right={<Button size="sm" onClick={() => onAbrir(null)} icon="mas">Nueva cita</Button>}>
      {citas.length === 0 ? <div style={{ color: C.g400 }}>Sin consultas registradas</div> : citas.map((c, i) => {
        const e = estadoCita(c.estado)
        return (
          <div key={c.id} className="fila" onClick={() => onAbrir(c)} style={{ display: 'flex', gap: 14, padding: '12px 8px', borderTop: i ? `1px solid ${C.g100}` : 'none', flexWrap: 'wrap', alignItems: 'flex-start', cursor: 'pointer', borderRadius: 8 }}>
            <div style={{ width: 110, flexShrink: 0 }}>
              <div style={{ fontWeight: 500 }}>{fmtFechaCorta(c.fecha)}</div>
              <div style={{ fontSize: 12.5, color: C.g500 }}>{fmtHora(c.hora)}{nombreSede(sedes, c.sede_id) ? ` · ${nombreSede(sedes, c.sede_id)}` : ''}</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 500 }}>{c.tipo || 'Consulta'}{c.servicio ? ` · ${c.servicio}` : ''}</span><Badge color={e.color} bg={e.bg}>{c.estado}</Badge>
              </div>
              <div style={{ fontSize: 13, color: C.g600, marginTop: 3 }}>
                {[c.peso && `Peso ${c.peso} kg`, c.talla && `Talla ${c.talla} cm`, resumenDatos(c.datos, clinica?.especialidad), c.procedimiento].filter(Boolean).join(' · ')}
              </div>
              {c.notas && <div style={{ fontSize: 13, color: C.g700, marginTop: 4, whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.notas}</div>}
            </div>
            <Icon name="flecha" size={15} style={{ color: C.g300, marginTop: 4 }} />
          </div>
        )
      })}
    </Card>
  )
}

function Fotos({ paciente, archivos, citas, clinicaId, onCambio }) {
  const [subiendo, setSubiendo] = useState(0)
  const [etapa, setEtapa] = useState('antes')
  const [fecha, setFecha] = useState(hoyISO())
  const [notas, setNotas] = useState('')
  const [citaId, setCitaId] = useState('')
  const [ver, setVer] = useState(null)

  const subir = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setSubiendo(files.length)
    let errores = 0
    for (const file of files) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${clinicaId}/${paciente.id}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('expedientes').upload(path, file, { contentType: file.type })
      if (!error) {
        const { error: e2 } = await supabase.from('archivos').insert({
          clinica_id: clinicaId, paciente_id: paciente.id, cita_id: citaId || null, etapa, fecha, notas: notas.trim() || null, path, mime: file.type,
        })
        if (e2) { errores++; await supabase.storage.from('expedientes').remove([path]) }
      } else errores++
      setSubiendo(n => n - 1)
    }
    if (errores) toast.error(`${errores} archivo(s) no se pudieron subir`)
    else toast.success('Fotos guardadas')
    setNotas('')
    onCambio()
  }

  const borrar = async (a) => {
    if (!confirm('¿Eliminar esta foto?')) return
    await supabase.storage.from('expedientes').remove([a.path])
    const { error } = await supabase.from('archivos').delete().eq('id', a.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    setVer(null)
    onCambio()
  }

  return (
    <>
      <Card title="Agregar fotos o archivos">
        <Grid min={180}>
          <Campo label="Etapa"><Select value={etapa} onChange={setEtapa}>{ETAPAS_FOTO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}</Select></Campo>
          <Campo label="Fecha"><Input type="date" value={fecha} onChange={setFecha} /></Campo>
          <Campo label="Consulta (opcional)"><Select value={citaId} onChange={setCitaId}><option value="">—</option>{citas.map(c => <option key={c.id} value={c.id}>{fmtFechaCorta(c.fecha)} · {c.tipo || 'Consulta'}</option>)}</Select></Campo>
          <Campo label="Notas (opcional)"><Input value={notas} onChange={setNotas} /></Campo>
        </Grid>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, padding: 16, borderRadius: 16, border: `2px dashed ${C.g300}`, background: C.g50, cursor: subiendo ? 'default' : 'pointer', fontWeight: 600, color: subiendo ? C.purple : C.g600 }}>
          <input type="file" accept="image/*,application/pdf" multiple onChange={subir} disabled={!!subiendo} style={{ display: 'none' }} />
          {subiendo ? `Subiendo ${subiendo} archivo(s)…` : 'Elegir fotos o tomar foto'}
        </label>
        <div style={{ fontSize: 12, color: C.g400, marginTop: 6 }}>Las fotos se guardan en la nube de forma privada: solo su consultorio puede verlas, desde cualquier dispositivo.</div>
      </Card>

      {!archivos ? <Cargando /> : ETAPAS_FOTO.map(et => {
        const lista = archivos.filter(a => a.etapa === et.value)
        if (!lista.length) return null
        return (
          <Card key={et.value} title={`${et.label} (${lista.length})`} style={{ marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
              {lista.map(a => (
                <button key={a.id} onClick={() => setVer(a)} style={{ padding: 0, border: `1px solid ${C.g200}`, borderRadius: 16, overflow: 'hidden', background: C.g50, cursor: 'pointer', textAlign: 'left' }}>
                  {(a.mime || '').startsWith('image/')
                    ? <img src={a.url} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
                    : <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}><Icon name="archivo" size={30} /></div>}
                  <div style={{ padding: '6px 8px', fontSize: 12, color: C.g600 }}>{fmtFechaCorta(a.fecha)}{a.notas ? ` · ${a.notas}` : ''}</div>
                </button>
              ))}
            </div>
          </Card>
        )
      })}
      {archivos && archivos.length === 0 && <Vacio icono="camara" titulo="Sin fotos todavía" texto="Agregue fotos de antes, proceso y resultado." />}

      {ver && (
        <Modal title={ETAPAS_FOTO.find(e => e.value === ver.etapa)?.label} subtitle={`${fmtFecha(ver.fecha)}${ver.notas ? ' · ' + ver.notas : ''}`} onClose={() => setVer(null)} maxWidth={820}>
          {(ver.mime || '').startsWith('image/')
            ? <img src={ver.url} alt="" style={{ width: '100%', borderRadius: 16 }} />
            : <a href={ver.url} target="_blank" rel="noopener noreferrer">Abrir archivo</a>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => window.open(ver.url, '_blank', 'noopener')} icon="descargar">Descargar</Button>
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

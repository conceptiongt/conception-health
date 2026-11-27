import { useState, useMemo } from 'react'
import { C, GLASS, SHADOW } from '../lib/theme'
import { fmtFechaCorta } from '../lib/formato'
import { esSoporte } from '../lib/permisos'
import { useDatos } from '../hooks/useDatos'
import { EGRESOS, diasIngresado, textoDias, useCamas } from '../hooks/useCamas'
import { Encabezado, Segmentos, Badge, Tabla, Cargando } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Desplegable } from '../components/ui/Desplegable'
import { Icon } from '../components/ui/Icon'
import { Exportar } from '../components/Documento'
import { slug } from '../lib/excel'
import { IngresarModal, EstanciaModal, useCamasEquipo, fechaHora } from '../components/camas/Modales'
import { RAYADO } from '../lib/agenda'

const VERDE = { color: C.green, bg: C.greenLight, borde: '#B7E3A0', label: 'Libre' }
const ROJO = { color: C.red, bg: C.redLight, borde: '#F4B6C0', label: 'Ocupada' }
const GRIS = { color: C.g500, bg: C.g100, borde: C.g300, label: 'Fuera de servicio' }
const DIA = 86400000
const nombreEgreso = (t) => EGRESOS.find(e => e.value === t)?.label || t || '—'

// Bed map of the hospital: which beds are free, who is in each one, admissions, transfers and discharges
export function Camas() {
  const { perfil, hospital, clinica } = useDatos()
  const lectura = esSoporte(perfil)
  const datos = useCamas({ ms: 30000 }) // refreshes every 30 s while visible, on focus, and with «Actualizar»
  const eq = useCamasEquipo(datos.abiertas)
  const [vista, setVista] = useState('mapa')
  const [area, setArea] = useState('')
  const [ingresando, setIngresando] = useState(null) // { cama? }
  const [abierta, setAbierta] = useState(null) // estancia id (its modal reads the fresh row)
  const [actualizando, setActualizando] = useState(false)

  const hospedaje = useMemo(() => hospital.areas.filter(a => eq.camas.some(c => c.area_id === a.id)), [hospital.areas, eq.camas])
  const camasVista = eq.camas.filter(c => !area || c.area_id === area)
  const estado = (c) => (eq.ocupada(c.id) ? ROJO : c.fuera_de_servicio ? GRIS : VERDE)
  const nOcup = camasVista.filter(c => eq.ocupada(c.id)).length
  const nFuera = camasVista.filter(c => c.fuera_de_servicio && !eq.ocupada(c.id)).length
  const nLibres = camasVista.length - nOcup - nFuera
  const estanciaAbierta = datos.abiertas.find(e => e.id === abierta)

  const actualizar = async () => { setActualizando(true); await datos.recargar(); setActualizando(false) }

  if (!hospital.cargado || (!datos.listo && datos.disponible && !datos.error)) return <><Encabezado titulo="Camas" /><Cargando /></>
  if (!hospital.tablas || !datos.disponible) {
    return (
      <>
        <Encabezado titulo="Camas" subtitulo="Camas libres y pacientes ingresados" />
        <div style={{ ...GLASS, borderRadius: 24, padding: '40px 24px', textAlign: 'center', boxShadow: SHADOW }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="cama" size={26} /></div>
          <div style={{ marginBottom: 10 }}><Badge color={C.purpleDark} bg={C.purpleMid}>Disponible pronto</Badge></div>
          <div style={{ fontSize: 14, color: C.g500, maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>Aquí verá qué camas están libres, ingresará pacientes, escribirá notas de evolución y dará egresos. Le avisaremos en cuanto esté listo.</div>
        </div>
      </>
    )
  }

  // ─── lists + exports ───
  const filaIngresado = (e) => {
    const c = eq.cama(e.cama_id)
    return { e, paciente: eq.paciente(e.paciente_id)?.nombre || '—', cama: c?.nombre || '—', area: eq.area(c?.area_id)?.nombre || '—', medico: eq.medico(e.profesional_id)?.nombre || 'Sin asignar', esp: hospital.departamento(e.departamento_id)?.nombre || '—', dias: diasIngresado(e) }
  }
  const ingresados = datos.abiertas.filter(e => !area || eq.cama(e.cama_id)?.area_id === area).map(filaIngresado)
    .sort((a, b) => a.area.localeCompare(b.area, 'es') || a.cama.localeCompare(b.cama, 'es', { numeric: true }))
  const egresos = datos.egresos.filter(e => !area || eq.cama(e.cama_id)?.area_id === area).map(e => ({ ...filaIngresado(e), dias: Math.max(0, Math.round((new Date(e.egreso_at) - new Date(e.ingreso_at)) / DIA)) }))

  const prepararIngresados = () => ({
    titulo: 'Pacientes ingresados', subtitulo: `${ingresados.length} ${ingresados.length === 1 ? 'paciente' : 'pacientes'}`,
    secciones: [{ tabla: { headers: ['Paciente', 'Cama', 'Área', 'Médico', 'Especialidad', 'Ingreso', 'Días'], filas: ingresados.map(r => [r.paciente, r.cama, r.area, r.medico, r.esp, fmtFechaCorta(r.e.ingreso_at), r.dias]) } }],
    excel: { archivo: 'pacientes-ingresados', hojas: [{ nombre: 'Ingresados', columnas: [
      { header: 'Paciente', key: 'p', width: 30 }, { header: 'Cama', key: 'c', width: 14 }, { header: 'Área', key: 'a', width: 20 }, { header: 'Médico', key: 'm', width: 26 },
      { header: 'Especialidad', key: 'e', width: 22 }, { header: 'Motivo', key: 'mo', width: 34 }, { header: 'Ingreso', key: 'i', width: 18 }, { header: 'Días', key: 'd', width: 8 },
    ], filas: ingresados.map(r => ({ p: r.paciente, c: r.cama, a: r.area, m: r.medico, e: r.esp, mo: r.e.motivo, i: fechaHora(r.e.ingreso_at), d: r.dias })) }] },
  })
  const prepararEgresos = () => ({
    titulo: 'Egresos de los últimos 30 días', subtitulo: `${egresos.length} ${egresos.length === 1 ? 'egreso' : 'egresos'}`,
    secciones: [{ tabla: { headers: ['Paciente', 'Cama', 'Médico', 'Ingreso', 'Egreso', 'Tipo', 'Días'], filas: egresos.map(r => [r.paciente, r.cama, r.medico, fmtFechaCorta(r.e.ingreso_at), fmtFechaCorta(r.e.egreso_at), nombreEgreso(r.e.egreso_tipo), r.dias]) } }],
    excel: { archivo: `egresos-${slug('ultimos 30 dias')}`, hojas: [{ nombre: 'Egresos', columnas: [
      { header: 'Paciente', key: 'p', width: 30 }, { header: 'Cama', key: 'c', width: 14 }, { header: 'Médico', key: 'm', width: 26 }, { header: 'Motivo', key: 'mo', width: 34 },
      { header: 'Ingreso', key: 'i', width: 18 }, { header: 'Egreso', key: 'g', width: 18 }, { header: 'Tipo de egreso', key: 't', width: 18 }, { header: 'Nota de egreso', key: 'n', width: 34 }, { header: 'Días', key: 'd', width: 8 },
    ], filas: egresos.map(r => ({ p: r.paciente, c: r.cama, m: r.medico, mo: r.e.motivo, i: fechaHora(r.e.ingreso_at), g: fechaHora(r.e.egreso_at), t: nombreEgreso(r.e.egreso_tipo), n: r.e.egreso_nota, d: r.dias })) }] },
  })

  return (
    <>
      <Encabezado titulo="Camas" subtitulo="Qué camas están libres y quién está ingresado">
        <Button variant="ghost" icon="refrescar" onClick={actualizar} disabled={actualizando}>{actualizando ? 'Actualizando…' : 'Actualizar'}</Button>
        {!lectura && <Button icon="mas" onClick={() => setIngresando({})} disabled={eq.libres.length === 0} title={eq.libres.length === 0 ? 'No hay camas libres' : undefined}>Ingresar paciente</Button>}
      </Encabezado>

      {datos.error && <div role="alert" style={{ background: C.amberLight, color: C.amber, borderRadius: 14, padding: '10px 14px', fontSize: 13.5, marginBottom: 14 }}>No se pudo actualizar la información. <button type="button" onClick={actualizar} style={{ border: 'none', background: 'none', color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Reintentar</button></div>}

      {eq.camas.length === 0 ? (
        <div style={{ ...GLASS, borderRadius: 24, padding: '28px 24px', textAlign: 'center', boxShadow: SHADOW }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Aún no hay camas registradas</div>
          <div style={{ fontSize: 14, color: C.g500, maxWidth: 460, margin: '0 auto' }}>Agregue un área de encamamiento con sus camas en Configuración → Mi hospital.</div>
        </div>
      ) : (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div role="status" aria-live="polite" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 240 }}>
            <Resumen>{camasVista.length} {camasVista.length === 1 ? 'cama' : 'camas'}</Resumen>
            <Resumen e={VERDE}>{nLibres} {nLibres === 1 ? 'libre' : 'libres'}</Resumen>
            <Resumen e={ROJO}>{nOcup} {nOcup === 1 ? 'ocupada' : 'ocupadas'}</Resumen>
            {nFuera > 0 && <Resumen e={GRIS}>{nFuera} fuera de servicio</Resumen>}
          </div>
          {hospedaje.length > 1 && <Desplegable ariaLabel="Área" value={area} onChange={setArea} options={[{ value: '', label: 'Todas las áreas' }, ...hospedaje.map(a => ({ value: a.id, label: a.nombre }))]} />}
          <Segmentos opciones={[{ value: 'mapa', label: 'Mapa de camas' }, { value: 'ingresados', label: 'Pacientes ingresados', n: datos.abiertas.length }, { value: 'egresos', label: 'Egresos recientes' }]} valor={vista} onChange={setVista} />
        </div>

        {vista === 'mapa' && hospedaje.filter(a => !area || a.id === area).map(a => {
          const camas = eq.camas.filter(c => c.area_id === a.id)
          return (
            <section key={a.id} aria-label={a.nombre} style={{ marginBottom: 22 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: C.purple, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 10px' }}>{a.nombre}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
                {camas.map(c => <CamaTarjeta key={c.id} cama={c} est={estado(c)} e={eq.ocupada(c.id)} eq={eq} hospital={hospital}
                  onClick={() => (eq.ocupada(c.id) ? setAbierta(eq.ocupada(c.id).id) : !c.fuera_de_servicio && !lectura ? setIngresando({ cama: c }) : null)} lectura={lectura} />)}
              </div>
            </section>
          )
        })}

        {vista === 'ingresados' && (<>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}><Exportar clinica={clinica?.nombre} preparar={prepararIngresados} /></div>
          <Tabla columnas={['Paciente', 'Cama', 'Área', 'Médico', 'Especialidad', 'Días']} vacio="No hay pacientes ingresados" onFila={(f) => setAbierta(f.key)}
            filas={ingresados.map(r => ({ key: r.e.id, celdas: [<strong key="p">{r.paciente}</strong>, r.cama, r.area, <span key="m" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{eq.colorMedico(r.e.profesional_id) && <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, background: eq.colorMedico(r.e.profesional_id) }} />}{r.medico}</span>, r.esp, textoDias(r.dias)] }))} />
        </>)}

        {vista === 'egresos' && (<>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 13.5, color: C.g500 }}>Últimos 30 días</span><Exportar clinica={clinica?.nombre} preparar={prepararEgresos} />
          </div>
          <Tabla columnas={['Paciente', 'Cama', 'Médico', 'Ingreso', 'Egreso', 'Tipo', 'Días']} vacio="No hay egresos en los últimos 30 días"
            filas={egresos.map(r => ({ key: r.e.id, celdas: [<strong key="p">{r.paciente}</strong>, r.cama, r.medico, fmtFechaCorta(r.e.ingreso_at), fmtFechaCorta(r.e.egreso_at), nombreEgreso(r.e.egreso_tipo), r.dias] }))} />
        </>)}
        {datos.actualizado && <div style={{ fontSize: 12, color: C.g400, marginTop: 12 }}>Actualizado a las {new Date(datos.actualizado).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false })} · se actualiza solo cada 30 segundos</div>}
      </>)}

      {ingresando && <IngresarModal cama={ingresando.cama} abiertas={datos.abiertas} onClose={() => setIngresando(null)} onGuardado={async () => { await datos.recargar() }} />}
      {estanciaAbierta && <EstanciaModal estancia={estanciaAbierta} abiertas={datos.abiertas} onClose={() => setAbierta(null)} onCambio={datos.recargar} />}
    </>
  )
}

const Resumen = ({ children, e }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 160, background: e ? e.bg : 'rgba(255,255,255,0.9)', color: e ? e.color : C.g700, border: `1px solid ${e ? e.borde : C.g200}`, fontSize: 13.5, fontWeight: 600 }}>
    {e && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 8, background: e.color }} />}{children}
  </span>
)

function CamaTarjeta({ cama, est, e, eq, hospital, onClick, lectura }) {
  const ocupada = !!e
  const clicable = ocupada || (!cama.fuera_de_servicio && !lectura)
  const paciente = ocupada ? eq.paciente(e.paciente_id) : null
  const medico = ocupada ? eq.medico(e.profesional_id) : null
  const dep = ocupada ? hospital.departamento(e.departamento_id) : null
  return (
    <button type="button" onClick={onClick} disabled={!clicable} aria-label={`${cama.nombre}: ${est.label}${paciente ? `, ${paciente.nombre}` : ''}`}
      style={{
        textAlign: 'left', padding: '12px 14px', borderRadius: 18, border: `1.5px solid ${est.borde}`, borderLeft: `6px solid ${est.color}`, backgroundColor: est.bg, backgroundImage: cama.fuera_de_servicio && !ocupada ? RAYADO(0.12) : 'none', fontFamily: 'inherit', cursor: clicable ? 'pointer' : 'default', minHeight: 112, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
      }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: C.black }}>{cama.nombre}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: est.color }}>{est.label}</span>
      </span>
      {ocupada ? (<>
        <span style={{ fontWeight: 600, fontSize: 14, color: C.black, overflowWrap: 'anywhere' }}>{paciente?.nombre || 'Paciente'}</span>
        <span style={{ fontSize: 12.5, color: C.g600 }}>{textoDias(diasIngresado(e))}{diasIngresado(e) > 0 && ' ingresado'}</span>
        <span style={{ fontSize: 12.5, color: C.g600, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {medico && <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, background: eq.colorMedico(medico.id), flexShrink: 0 }} />}<span style={{ overflowWrap: 'anywhere' }}>{medico?.nombre || 'Sin médico'}</span>
        </span>
        {dep && <span style={{ fontSize: 12, color: C.g500 }}>{dep.nombre}</span>}
      </>) : (
        <span style={{ fontSize: 13, color: cama.fuera_de_servicio ? C.g500 : C.green, marginTop: 'auto' }}>{cama.fuera_de_servicio ? 'No se puede usar' : lectura ? '' : '+ Ingresar paciente'}</span>
      )}
    </button>
  )
}

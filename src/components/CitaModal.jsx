import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { ESTADOS_CITA, estadoCita } from '../lib/constantes'
import { especialidad, tiposDe } from '../lib/especialidades'
import { CamposEspecialidad, limpiarDatos } from './CamposEspecialidad'
import { hoyISO, fmtFecha, fmtFechaCorta, fmtQ, saldo } from '../lib/formato'
import { Button } from './ui/Button'
import { Badge } from './ui/Varios'
import { Icon } from './ui/Icon'
import { Campo, Input, Select, Textarea, Grid } from './ui/Campos'
import { toast } from './ui/Toast'
import { useDatos } from '../hooks/useDatos'
import { ServicioCampos, servicioInicial, servicioParaGuardar } from './ServicioCampos'

// Create or edit a consultation on its own full screen (roomy notes); `cita` null = new
export function CitaModal({ cita, paciente, clinicaId, onClose, onGuardado }) {
  const { servicios, sedes = [], acc, citas = [], cobros = [], clinica } = useDatos()
  const esp = especialidad(clinica?.especialidad)
  const [f, setF] = useState({
    fecha: cita?.fecha || hoyISO(), hora: cita?.hora?.slice(0, 5) || '', tipo: cita?.tipo || 'Seguimiento',
    estado: cita?.estado || 'Pendiente', peso: cita?.peso ?? '', talla: cita?.talla ?? '',
    procedimiento: cita?.procedimiento || '', notas: cita?.notas || '', datos: cita?.datos || {}, sede: cita?.sede_id || paciente?.sede_id || (sedes.length === 1 ? sedes[0].id : ''),
  })
  const [serv, setServ] = useState(() => servicioInicial(cita?.tipo || 'Seguimiento', servicios, cita))
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const cambiarTipo = (tipo) => { setF(p => ({ ...p, tipo })); setServ(servicioInicial(tipo, servicios)) }
  const conSedes = acc?.inventario && sedes.length > 0
  useEffect(() => { window.scrollTo(0, 0) }, [])

  const anteriores = citas.filter(c => c.paciente_id === paciente?.id && c.id !== cita?.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4)
  const deuda = cobros.filter(c => c.paciente_id === paciente?.id).reduce((n, c) => n + saldo(c), 0)

  const guardar = async () => {
    if (!f.fecha) { toast.error('La fecha es requerida'); return }
    const s = servicioParaGuardar(serv)
    const fila = {
      servicio_id: s.servicio_id, servicio: s.servicio,
      fecha: f.fecha, hora: f.hora || null, tipo: f.tipo || null, estado: f.estado,
      peso: f.peso === '' ? null : Number(f.peso), talla: f.talla === '' ? null : Number(f.talla),
      procedimiento: f.procedimiento.trim() || null, notas: f.notas.trim() || null, datos: limpiarDatos(f.datos),
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
    setBusy(false)
    if (error) { toast.error('No se pudo guardar la cita'); return }
    toast.success(cita ? 'Cita actualizada' : 'Cita agregada')
    onGuardado()
  }

  // Deletes the appointment with its charges and payments; a patient with no other history is deleted too
  const eliminar = async () => {
    const susCobros = cobros.filter(c => c.cita_id === cita.id)
    const pagado = susCobros.reduce((n, c) => n + (Number(c.pagado) || 0), 0)
    const otrasCitas = citas.some(c => c.paciente_id === paciente?.id && c.id !== cita.id)
    const otrosCobros = cobros.some(c => c.paciente_id === paciente?.id && c.cita_id !== cita.id)
    const soloEsta = !otrasCitas && !otrosCobros
    const partes = ['¿Eliminar esta cita?']
    if (susCobros.length) partes.push(`También se eliminará su cobro de ${fmtQ(susCobros.reduce((n, c) => n + Number(c.precio || 0) - Number(c.descuento || 0), 0))}${pagado > 0 ? ` y los pagos registrados (${fmtQ(pagado)})` : ''}, para que no quede saldo pendiente.`)
    if (soloEsta) partes.push(`${paciente?.nombre} no tiene otro historial, así que también se eliminará su expediente (si tiene fotos o productos usados, el expediente se conserva).`)
    partes.push('Esta acción no se puede deshacer.')
    if (!confirm(partes.join('\n\n'))) return
    setBusy(true)
    const { data, error } = await supabase.rpc('cita_eliminar', { p_cita: cita.id })
    setBusy(false)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success(data?.paciente_eliminado ? 'Se eliminaron la cita, su cobro y el expediente' : data?.cobros ? 'Se eliminaron la cita y su cobro' : 'Cita eliminada')
    onGuardado({ pacienteEliminado: !!data?.paciente_eliminado })
  }

  return (
    <div>
      <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.g500, cursor: 'pointer', padding: 0, marginBottom: 14, fontSize: 13.5, fontFamily: 'inherit' }}><Icon name="atras" size={16} />Volver</button>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, color: C.g500 }}>{cita ? 'Editar cita' : 'Nueva cita'}</div>
          <h1 style={{ fontSize: 26, fontWeight: 500, margin: '2px 0 0', letterSpacing: '-0.02em' }}>{paciente?.nombre}</h1>
          <div style={{ fontSize: 13.5, color: C.g500, marginTop: 4 }}>{fmtFecha(f.fecha)}{f.hora ? ` · ${f.hora}` : ''}{f.tipo ? ` · ${f.tipo}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {cita && <Button variant="danger" onClick={eliminar} icon="eliminar">Eliminar</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy} icon="check">{busy ? 'Guardando…' : 'Guardar cita'}</Button>
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
              <ServicioCampos tipo={f.tipo} servicios={servicios} valor={serv} onChange={setServ} conPrecio={!cita} />
            </Grid>
          </section>

          <section className="bloque">
            <h3>{esp.label}</h3>
            <CamposEspecialidad esp={clinica?.especialidad} valor={f.datos} onChange={set('datos')} />
          </section>

          <section className="bloque">
            <h3>Notas médicas</h3>
            <Textarea value={f.notas} onChange={set('notas')} rows={14} placeholder={esp.notas} />
            <div style={{ marginTop: 16 }}>
              <Campo label="Procedimiento realizado / a realizar"><Textarea value={f.procedimiento} onChange={set('procedimiento')} rows={3} /></Campo>
            </div>
          </section>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
              <span>Saldo pendiente: <strong style={{ color: deuda > 0 ? C.red : C.green, fontWeight: 500 }}>{fmtQ(deuda)}</strong></span>
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
        </aside>
      </div>
    </div>
  )
}

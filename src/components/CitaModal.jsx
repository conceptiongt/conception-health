import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { TIPOS_CITA, ESTADOS_CITA } from '../lib/constantes'
import { hoyISO } from '../lib/formato'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Campo, Input, Select, Textarea, Grid } from './ui/Campos'
import { toast } from './ui/Toast'
import { useDatos } from '../hooks/useDatos'
import { ServicioCampos, servicioInicial, servicioParaGuardar } from './ServicioCampos'

// Create or edit a consultation of a patient; `cita` null = new
export function CitaModal({ cita, paciente, clinicaId, onClose, onGuardado }) {
  const [f, setF] = useState({
    fecha: cita?.fecha || hoyISO(), hora: cita?.hora?.slice(0, 5) || '', tipo: cita?.tipo || 'Seguimiento',
    estado: cita?.estado || 'Pendiente', peso: cita?.peso ?? '', talla: cita?.talla ?? '',
    procedimiento: cita?.procedimiento || '', notas: cita?.notas || '',
  })
  const { servicios } = useDatos()
  const [serv, setServ] = useState(() => servicioInicial(cita?.tipo || 'Seguimiento', servicios, cita))
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const cambiarTipo = (tipo) => { setF(p => ({ ...p, tipo })); setServ(servicioInicial(tipo, servicios)) }

  const guardar = async () => {
    if (!f.fecha) { toast.error('La fecha es requerida'); return }
    const s = servicioParaGuardar(serv)
    const fila = {
      servicio_id: s.servicio_id, servicio: s.servicio,
      fecha: f.fecha, hora: f.hora || null, tipo: f.tipo || null, estado: f.estado,
      peso: f.peso === '' ? null : Number(f.peso), talla: f.talla === '' ? null : Number(f.talla),
      procedimiento: f.procedimiento.trim() || null, notas: f.notas.trim() || null,
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

  const eliminar = async () => {
    if (!confirm('¿Eliminar esta cita? Esta acción no se puede deshacer.')) return
    const { error } = await supabase.from('citas').delete().eq('id', cita.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Cita eliminada')
    onGuardado()
  }

  return (
    <Modal title={cita ? 'Editar cita' : 'Nueva cita'} subtitle={paciente?.nombre} onClose={onClose}>
      <Grid min={180}>
        <Campo label="Fecha *"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
        <Campo label="Hora"><Input type="time" value={f.hora} onChange={set('hora')} /></Campo>
        <Campo label="Tipo de consulta"><Select value={f.tipo} onChange={cambiarTipo}>{TIPOS_CITA.map(t => <option key={t}>{t}</option>)}</Select></Campo>
        <ServicioCampos tipo={f.tipo} servicios={servicios} valor={serv} onChange={setServ} conPrecio={!cita} />
        <Campo label="Estado"><Select value={f.estado} onChange={set('estado')}>{ESTADOS_CITA.map(e => <option key={e.value}>{e.value}</option>)}</Select></Campo>
        <Campo label="Peso (kg)"><Input type="number" step="0.1" value={f.peso} onChange={set('peso')} /></Campo>
        <Campo label="Talla (cm)"><Input type="number" step="0.1" value={f.talla} onChange={set('talla')} /></Campo>
        <Campo label="Procedimiento realizado / a realizar" full><Input value={f.procedimiento} onChange={set('procedimiento')} /></Campo>
        <Campo label="Notas médicas" full><Textarea value={f.notas} onChange={set('notas')} rows={4} /></Campo>
      </Grid>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {cita && <Button variant="danger" onClick={eliminar} icon="eliminar">Eliminar</Button>}
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

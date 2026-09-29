import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { TIPOS_CITA, ESTADOS_CITA, ORIGENES, REDES } from '../lib/constantes'
import { hoyISO, fmtHora, linkCalendar, linkWhatsApp, mensajeConfirmacion } from '../lib/formato'
import { useDatos, mensajeError } from '../hooks/useDatos'
import { Button } from '../components/ui/Button'
import { Campo, Input, Select, Textarea, Grid } from '../components/ui/Campos'
import { Card, Encabezado } from '../components/ui/Varios'
import { toast } from '../components/ui/Toast'

const vacio = { nombre: '', telefono: '', fecha: hoyISO(), hora: '', tipo: 'Primera consulta', estado: 'Confirmada', notas: '', origen: '', red: '', referido_por: '' }

export function Registrar() {
  const { citas, pacientes, perfil, clinica, recargar, ir } = useDatos()
  const [f, setF] = useState(vacio)
  const [busy, setBusy] = useState(false)
  const [listo, setListo] = useState(null) // { paciente, cita } after saving
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))

  const ocupada = f.fecha && f.hora
    ? citas.find(c => c.fecha === f.fecha && c.hora?.slice(0, 5) === f.hora && !['No asistió', 'Reagendada'].includes(c.estado))
    : null
  const nombreOcupada = ocupada ? pacientes.find(p => p.id === ocupada.paciente_id)?.nombre : null

  const guardar = async (e) => {
    e.preventDefault()
    if (!f.nombre.trim() || !f.fecha || !f.origen) { toast.error('Complete nombre, fecha y cómo nos encontró'); return }
    setBusy(true)
    const { data: paciente, error } = await supabase.from('pacientes').insert({
      clinica_id: perfil.clinica_id, nombre: f.nombre.trim(), telefono: f.telefono.trim() || null,
      origen: f.origen, red: f.origen === 'redes' ? f.red || null : null,
      referido_por: f.origen === 'referido' ? f.referido_por.trim() || null : null, created_by: perfil.user_id,
    }).select().single()
    if (error) { setBusy(false); toast.error(mensajeError(error)); return }
    const { data: cita, error: e2 } = await supabase.from('citas').insert({
      clinica_id: perfil.clinica_id, paciente_id: paciente.id, fecha: f.fecha, hora: f.hora || null,
      tipo: f.tipo || null, estado: f.estado, notas: f.notas.trim() || null,
    }).select().single()
    setBusy(false)
    if (e2) {
      await supabase.from('pacientes').delete().eq('id', paciente.id) // keep data consistent
      toast.error('No se pudo guardar la cita')
      return
    }
    toast.success('Paciente registrado')
    setListo({ paciente, cita })
    setF({ ...vacio, fecha: f.fecha })
    recargar()
  }

  if (listo) {
    const msg = mensajeConfirmacion(listo.paciente, listo.cita, clinica?.nombre || perfil.nombre)
    const wa = linkWhatsApp(listo.paciente.telefono, msg)
    const cal = linkCalendar(listo.paciente, listo.cita)
    return (
      <>
        <Encabezado titulo="Paciente registrado ✅" subtitulo={`${listo.paciente.nombre} · ${listo.cita.fecha} ${fmtHora(listo.cita.hora)}`} />
        <Card title="Mensaje de confirmación">
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: C.g50, borderRadius: 10, padding: 14, margin: 0, fontSize: 14 }}>{msg}</pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(msg); toast.success('Mensaje copiado') }}>📋 Copiar mensaje</Button>
            {wa && <Button variant="ghost" onClick={() => window.open(wa, '_blank', 'noopener')}>💬 Enviar por WhatsApp</Button>}
            {cal && <Button variant="ghost" onClick={() => window.open(cal, '_blank', 'noopener')}>📅 Agregar a Google Calendar</Button>}
          </div>
        </Card>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <Button onClick={() => setListo(null)}>➕ Registrar otro paciente</Button>
          <Button variant="ghost" onClick={() => ir('expedientes', listo.paciente.id)}>🗂️ Ver expediente</Button>
        </div>
      </>
    )
  }

  return (
    <form onSubmit={guardar}>
      <Encabezado titulo="Registrar paciente" subtitulo="Datos del paciente y su primera cita" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card title="Datos del paciente">
          <Grid>
            <Campo label="Nombre completo *"><Input value={f.nombre} onChange={set('nombre')} required /></Campo>
            <Campo label="Teléfono"><Input type="tel" value={f.telefono} onChange={set('telefono')} placeholder="5555-1234" /></Campo>
          </Grid>
        </Card>
        <Card title="Cita">
          <Grid>
            <Campo label="Fecha *"><Input type="date" value={f.fecha} onChange={set('fecha')} required /></Campo>
            <Campo label="Hora" ayuda="Cada cita dura 1 hora"><Input type="time" value={f.hora} onChange={set('hora')} /></Campo>
            <Campo label="Tipo de consulta"><Select value={f.tipo} onChange={set('tipo')}>{TIPOS_CITA.map(t => <option key={t}>{t}</option>)}</Select></Campo>
            <Campo label="Estado"><Select value={f.estado} onChange={set('estado')}>{ESTADOS_CITA.map(e => <option key={e.value}>{e.value}</option>)}</Select></Campo>
            <Campo label="Notas" full><Textarea value={f.notas} onChange={set('notas')} rows={2} placeholder="Opcional" /></Campo>
          </Grid>
          {ocupada && (
            <div style={{ marginTop: 12, background: C.amberLight, color: C.amber, borderRadius: 10, padding: '10px 14px', fontSize: 13.5 }}>
              ⚠️ Ya hay una cita a esa hora con <strong>{nombreOcupada || 'otro paciente'}</strong>. Puede guardar de todas formas o elegir otra hora.
            </div>
          )}
        </Card>
        <Card title="¿Cómo nos encontró? *">
          <Grid>
            <Campo label="Origen"><Select value={f.origen} onChange={set('origen')} required>
              <option value="">Seleccione…</option>{ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select></Campo>
            {f.origen === 'redes' && <Campo label="¿Qué red social?"><Select value={f.red} onChange={set('red')}>
              <option value="">Seleccione…</option>{REDES.map(r => <option key={r}>{r}</option>)}
            </Select></Campo>}
            {f.origen === 'referido' && <Campo label="¿Referido por quién?"><Input value={f.referido_por} onChange={set('referido_por')} /></Campo>}
          </Grid>
        </Card>
        <div><Button type="submit" size="lg" disabled={busy}>{busy ? 'Guardando…' : 'Registrar paciente'}</Button></div>
      </div>
    </form>
  )
}

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C, SHADOW } from '../lib/theme'
import { ESTADOS_CITA, ORIGENES, REDES } from '../lib/constantes'
import { tiposDe } from '../lib/especialidades'
import { puede } from '../lib/permisos'
import { urlRegistro } from '../lib/ficha'
import { MensajePaciente } from '../components/MensajePaciente'
import { hoyISO, fmtFecha, fmtHora, fmtQ } from '../lib/formato'
import { useDatos, mensajeError } from '../hooks/useDatos'
import { Button } from '../components/ui/Button'
import { Campo, Input, Select, Textarea, Grid } from '../components/ui/Campos'
import { Card, Encabezado } from '../components/ui/Varios'
import { Icon } from '../components/ui/Icon'
import { ServicioCampos, servicioInicial, servicioParaGuardar } from '../components/ServicioCampos'
import { toast } from '../components/ui/Toast'

const vacio = { nombre: '', telefono: '', email: '', fecha: hoyISO(), hora: '', tipo: 'Primera consulta', estado: 'Confirmada', notas: '', origen: '', red: '', referido_por: '', sede: '' }

export function Registrar() {
  const { citas, pacientes, servicios, perfil, clinica, recargar, ir, sedes, acc } = useDatos()
  const finanzas = puede(perfil, 'finanzas')
  const conSedes = acc?.inventario && sedes.length > 0
  const [f, setF] = useState(() => ({ ...vacio, sede: sedes.length === 1 ? sedes[0].id : '' }))
  const [serv, setServ] = useState(() => servicioInicial(vacio.tipo, servicios))
  const [busy, setBusy] = useState(false)
  const [listo, setListo] = useState(null) // { paciente, cita, cobro } after saving
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const cambiarTipo = (tipo) => { setF(p => ({ ...p, tipo })); setServ(servicioInicial(tipo, servicios)) }

  const ocupada = f.fecha && f.hora
    ? citas.find(c => c.fecha === f.fecha && c.hora?.slice(0, 5) === f.hora && !['No asistió', 'Reagendada'].includes(c.estado))
    : null
  const nombreOcupada = ocupada ? pacientes.find(p => p.id === ocupada.paciente_id)?.nombre : null

  const guardar = async (e) => {
    e.preventDefault()
    if (!f.nombre.trim() || !f.fecha || !f.origen) { toast.error('Complete nombre, fecha y cómo nos encontró'); return }
    if (conSedes && !f.sede) { toast.error('Elija la sede de la cita'); return }
    const sede = conSedes ? { sede_id: f.sede } : {}
    const s = servicioParaGuardar(serv)
    setBusy(true)
    const { data: paciente, error } = await supabase.from('pacientes').insert({
      clinica_id: perfil.clinica_id, nombre: f.nombre.trim(), telefono: f.telefono.trim() || null, email: f.email.trim() || null,
      origen: f.origen, red: f.origen === 'redes' ? f.red || null : null,
      referido_por: f.origen === 'referido' ? f.referido_por.trim() || null : null, created_by: perfil.user_id, ...sede,
    }).select().single()
    if (error) { setBusy(false); toast.error(mensajeError(error)); return }
    const { data: cita, error: e2 } = await supabase.from('citas').insert({
      clinica_id: perfil.clinica_id, paciente_id: paciente.id, fecha: f.fecha, hora: f.hora || null,
      tipo: f.tipo || null, estado: f.estado, notas: f.notas.trim() || null, servicio_id: s.servicio_id, servicio: s.servicio, ...sede,
    }).select().single()
    if (e2) {
      await supabase.from('pacientes').delete().eq('id', paciente.id) // keep data consistent
      setBusy(false); toast.error('No se pudo guardar la cita'); return
    }
    // the service price becomes a pending charge (discounts can be applied later in the file)
    let cobro = null
    if (s.precio > 0) {
      const fila = { clinica_id: perfil.clinica_id, paciente_id: paciente.id, cita_id: cita.id, servicio_id: s.servicio_id, concepto: s.servicio || f.tipo, precio: s.precio, fecha: f.fecha }
      // assistants without access to finances can create the charge but not read it back
      if (finanzas) cobro = (await supabase.from('cobros').insert(fila).select().single()).data
      else await supabase.from('cobros').insert(fila)
    }
    setBusy(false)
    toast.success('Paciente registrado')
    setListo({ paciente, cita, cobro, precio: s.precio })
    setF({ ...vacio, fecha: f.fecha, sede: f.sede })
    setServ(servicioInicial(vacio.tipo, servicios))
    recargar()
  }

  if (listo) {
    return (
      <>
        <Encabezado titulo="Paciente registrado" subtitulo={`${listo.paciente.nombre} · ${fmtFecha(listo.cita.fecha)} · ${fmtHora(listo.cita.hora)}`} />
        {listo.cobro && (
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.green}`, borderRadius: 16, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 14 }}>Se registró el cobro <strong>{listo.cobro.concepto}</strong> por <strong>{fmtQ(listo.cobro.precio)}</strong>. Puede aplicar un descuento o registrar pagos en su expediente.</div>
          </div>
        )}
        <Card title="Mensaje de confirmación por WhatsApp">
          <MensajePaciente paciente={listo.paciente} cita={listo.cita} precio={listo.precio} />
        </Card>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <Button icon="mas" onClick={() => setListo(null)}>Registrar otro paciente</Button>
          <Button variant="ghost" icon="expedientes" onClick={() => ir('expedientes', listo.paciente.id)}>Ver expediente</Button>
        </div>
      </>
    )
  }

  return (
    <form onSubmit={guardar}>
      <Encabezado titulo="Registrar paciente" subtitulo="Datos del paciente y su primera cita" />
      <EnlaceRegistro token={clinica?.registro_token} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="Datos del paciente">
          <Grid>
            <Campo label="Nombre completo *"><Input value={f.nombre} onChange={set('nombre')} required /></Campo>
            <Campo label="Teléfono"><Input type="tel" value={f.telefono} onChange={set('telefono')} placeholder="5555-1234" /></Campo>
            <Campo label="Correo electrónico"><Input type="email" value={f.email} onChange={set('email')} placeholder="Opcional" /></Campo>
          </Grid>
        </Card>
        <Card title="Cita">
          <Grid>
            {conSedes && <Campo label="Sede *"><Select value={f.sede} onChange={set('sede')}><option value="">Seleccione…</option>{sedes.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select></Campo>}
            <Campo label="Fecha *"><Input type="date" value={f.fecha} onChange={set('fecha')} required /></Campo>
            <Campo label="Hora" ayuda="Cada cita dura 1 hora"><Input type="time" value={f.hora} onChange={set('hora')} /></Campo>
            <Campo label="Tipo de consulta"><Select value={f.tipo} onChange={cambiarTipo}>{tiposDe(clinica?.especialidad, f.tipo).map(t => <option key={t}>{t}</option>)}</Select></Campo>
            <Campo label="Estado"><Select value={f.estado} onChange={set('estado')}>{ESTADOS_CITA.map(e => <option key={e.value}>{e.value}</option>)}</Select></Campo>
            <ServicioCampos tipo={f.tipo} servicios={servicios} valor={serv} onChange={setServ} />
            <Campo label="Notas" full><Textarea value={f.notas} onChange={set('notas')} rows={2} placeholder="Opcional" /></Campo>
          </Grid>
          {ocupada && (
            <div style={{ marginTop: 14, background: C.amberLight, color: C.amber, borderRadius: 24, padding: '11px 14px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center' }}>
              <Icon name="alerta" size={17} />
              <span>Ya hay una cita a esa hora con <strong>{nombreOcupada || 'otro paciente'}</strong>. Puede guardar de todas formas o elegir otra hora.</span>
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
        <div><Button type="submit" size="lg" variant="brand" icon="check" disabled={busy}>{busy ? 'Guardando…' : 'Registrar paciente'}</Button></div>
      </div>
    </form>
  )
}

// The other way to register: the patient fills in their own data from a link
function EnlaceRegistro({ token }) {
  if (!token) return null
  const link = urlRegistro(token)
  const msg = `¡Hola! 👋 Para agendar su cita, por favor llene sus datos en este enlace (toma 3 minutos):\n${link}`
  return (
    <div style={{ background: C.purpleMid, borderRadius: 18, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Icon name="enlace" size={18} style={{ color: C.purple }} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>¿Prefiere que el paciente llene sus datos?</div>
        <div style={{ fontSize: 12.5, color: C.g600 }}>Envíele el enlace de registro; aparecerá en su lista de pacientes con sus antecedentes.</div>
      </div>
      <Button size="sm" variant="ghost" icon="copiar" onClick={() => { navigator.clipboard?.writeText(link); toast.success('Enlace copiado') }}>Copiar enlace</Button>
      <Button size="sm" icon="mensaje" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')}>Enviar por WhatsApp</Button>
    </div>
  )
}

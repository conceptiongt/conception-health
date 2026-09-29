import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { solicitarVinculo, estadoVinculo, desvincular, sincronizar } from '../lib/studio'
import { useDatos } from '../hooks/useDatos'
import { Card, Badge } from './ui/Varios'
import { Button } from './ui/Button'
import { Input } from './ui/Campos'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'

const fmt = (d) => d ? new Date(d).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

// Configuración → Conception Studio: link the clinic with its agency so monthly totals are shared
export function VinculoStudio() {
  const { clinica, perfil, pacientes, citas, cobros, recargarSesion } = useDatos()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const estado = clinica?.studio_clave ? clinica.studio_estado : null

  const vincular = async () => {
    setBusy(true)
    const r = await solicitarVinculo(link, clinica, perfil.email)
    setBusy(false)
    if (r.error) { toast.error(r.error); return }
    setLink('')
    toast.success('Solicitud enviada a Conception')
    recargarSesion()
  }
  const revisar = async () => {
    setBusy(true)
    const e = await estadoVinculo(clinica.studio_clave)
    if (e) await supabase.from('clinicas').update({ studio_estado: e.estado, studio_cliente: e.cliente || clinica.studio_cliente }).eq('id', clinica.id)
    setBusy(false)
    recargarSesion()
  }
  const enviar = async () => {
    setBusy(true)
    const r = await sincronizar(clinica, { pacientes, citas, cobros })
    setBusy(false)
    if (r.error) { toast.error('No se pudieron enviar los datos'); revisar(); return }
    toast.success('Datos enviados a Conception')
    recargarSesion()
  }
  const quitar = async () => {
    if (!confirm('¿Desvincular de Conception Studio? Dejará de enviar sus datos mensuales.')) return
    setBusy(true)
    await desvincular(clinica)
    setBusy(false)
    toast.success('Desvinculado')
    recargarSesion()
  }
  const toggleIngresos = async () => {
    const { error } = await supabase.from('clinicas').update({ studio_compartir_ingresos: !clinica.studio_compartir_ingresos }).eq('id', clinica.id)
    if (error) { toast.error('No se pudo guardar'); return }
    recargarSesion()
  }

  const esDueno = perfil.rol === 'dueno'
  return (
    <Card title="Conception Studio" style={{ marginTop: 16 }} right={
      estado === 'aprobado' ? <Badge color={C.green} bg={C.greenLight}>Vinculado</Badge>
        : estado === 'pendiente' ? <Badge color={C.amber} bg={C.amberLight}>Esperando aprobación</Badge>
        : <Badge>Sin vincular</Badge>
    }>
      <div style={{ fontSize: 13.5, color: C.g500, lineHeight: 1.6, marginTop: -6, marginBottom: 16 }}>
        Si trabaja con la agencia Conception, vincule su cuenta para que sus reportes se llenen solos cada mes.
        Solo se comparten <strong>totales</strong> (pacientes nuevos, por qué red llegaron, consultas, cirugías y procedimientos);
        <strong> nunca nombres, teléfonos ni expedientes</strong>.
      </div>

      {!estado || estado === 'rechazado' || estado === 'desvinculado' ? (
        <>
          {(estado === 'rechazado' || estado === 'desvinculado') && (
            <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>
              {estado === 'rechazado' ? 'Conception no aprobó la solicitud anterior.' : 'La vinculación anterior fue desactivada.'} Puede solicitarla de nuevo con el link que le envíen.
            </div>
          )}
          {esDueno ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px' }}><Input value={link} onChange={setLink} placeholder="Pegue aquí el link que le envió Conception" /></div>
              <Button icon="flecha" onClick={vincular} disabled={busy || !link.trim()}>{busy ? 'Enviando…' : 'Vincular con Conception Studio'}</Button>
            </div>
          ) : <div style={{ fontSize: 13, color: C.g400 }}>Solo el dueño de la cuenta puede vincularla.</div>}
          <div style={{ fontSize: 12, color: C.g400, marginTop: 8 }}>Sin el link que le envía Conception no es posible vincular. Conception debe aprobar la solicitud.</div>
        </>
      ) : estado === 'pendiente' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: 14 }}>
            Solicitud enviada para <strong>{clinica.studio_cliente}</strong>. Conception debe aprobarla; no se envía ningún dato hasta entonces.
          </div>
          <Button variant="ghost" size="sm" onClick={revisar} disabled={busy}>Revisar estado</Button>
          {esDueno && <Button variant="danger" size="sm" onClick={quitar} disabled={busy}>Cancelar solicitud</Button>}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: C.greenLight, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={18} /></div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Vinculado con {clinica.studio_cliente}</div>
              <div style={{ fontSize: 12.5, color: C.g500 }}>Último envío: {fmt(clinica.studio_ultimo_envio)} · se envía automáticamente al usar la app</div>
            </div>
            <Button variant="ghost" size="sm" onClick={enviar} disabled={busy}>{busy ? 'Enviando…' : 'Enviar ahora'}</Button>
            {esDueno && <Button variant="danger" size="sm" onClick={quitar} disabled={busy}>Desvincular</Button>}
          </div>
          {esDueno && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!clinica.studio_compartir_ingresos} onChange={toggleIngresos} style={{ width: 18, height: 18, accentColor: C.purple }} />
              Compartir también el total cobrado del mes (confidencial, ayuda a medir el retorno de su publicidad)
            </label>
          )}
        </>
      )}
    </Card>
  )
}

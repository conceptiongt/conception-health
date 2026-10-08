import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { ETAPAS_FOTO } from '../lib/constantes'
import { fmtFecha, fmtFechaCorta, linkWhatsApp } from '../lib/formato'
import { seccionesDe, urlPortal } from '../lib/ficha'
import { resumenDatos } from '../lib/especialidades'
import { puede } from '../lib/permisos'
import { useDatos } from '../hooks/useDatos'
import { Card, Badge } from './ui/Varios'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'
import { Interruptor } from './MensajePaciente'

// One screen to decide, item by item, what the patient sees in their portal, and to publish it
export function PortalCliente({ paciente, citas, archivos, onVolver, onCambio, onArchivos }) {
  const { clinica, perfil } = useDatos()
  const finanzas = puede(perfil, 'finanzas')
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const link = urlPortal(paciente)
  const wa = linkWhatsApp(paciente.telefono, `Hola ${paciente.nombre.split(' ')[0]} 👋\n\nEn este enlace puede ver su expediente, sus indicaciones y documentos cuando lo necesite:\n${link}`)

  const guardar = async (tabla, campos, ids, aviso) => {
    const q = supabase.from(tabla).update(campos)
    const { error } = await (Array.isArray(ids) ? q.in('id', ids) : q.eq('id', ids))
    if (error) { toast.error('No se pudo guardar'); return }
    if (aviso) toast.success(aviso)
    tabla === 'archivos' ? onArchivos() : onCambio()
  }
  const paciente_ = (campos, aviso) => guardar('pacientes', campos, paciente.id, aviso)
  const partesDe = (c) => [
    ...seccionesDe(c, clinica).map(s => ({ id: s.id, titulo: s.titulo })),
    ...(resumenDatos(c.datos, clinica?.especialidad) || c.peso || c.talla ? [{ id: '_datos', titulo: 'Datos clínicos y medidas' }] : []),
    ...(c.procedimiento ? [{ id: '_procedimiento', titulo: 'Procedimiento' }] : []),
  ]
  const alternarParte = (c, id) => {
    const ocultas = c.portal_ocultar || []
    guardar('citas', { portal_ocultar: ocultas.includes(id) ? ocultas.filter(x => x !== id) : [...ocultas, id] }, c.id)
  }
  const enPortal = citas.filter(c => c.portal).length, archivosPortal = archivos.filter(a => a.portal).length
  const etapa = (v) => ETAPAS_FOTO.find(e => e.value === v)?.label
  const fila = (activo, onChange, titulo, detalle) => (
    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '12px 0' }}>
      <Interruptor activo={activo} onChange={onChange} />
      <span style={{ fontSize: 14.5 }}>{titulo}{detalle && <span style={{ display: 'block', fontSize: 12.5, color: C.g400 }}>{detalle}</span>}</span>
    </label>
  )
  const todas = (tabla, lista, v) => guardar(tabla, { portal: v }, lista.map(x => x.id))

  return (
    <div>
      <button onClick={onVolver} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.g500, cursor: 'pointer', padding: 0, marginBottom: 14, fontSize: 13.5, fontFamily: 'inherit', fontWeight: 600 }}><Icon name="atras" size={16} />Volver al expediente</button>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, color: C.g500 }}>Portal del cliente</div>
          <h1 style={{ fontSize: 26, fontWeight: 500, margin: '2px 0 6px', letterSpacing: '-0.02em' }}>{paciente.nombre}</h1>
          {paciente.portal_activo ? <Badge color={C.green} bg={C.greenLight}>Publicado: el paciente ya puede verlo</Badge> : <Badge color={C.amber} bg={C.amberLight}>Sin publicar: el paciente todavía no ve nada</Badge>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" icon="ojo" onClick={() => window.open(link, '_blank', 'noopener')}>Ver como paciente</Button>
          <Button variant="ghost" icon="copiar" onClick={() => { navigator.clipboard?.writeText(link); toast.success('Enlace copiado') }}>Copiar enlace</Button>
          {wa && <Button variant="ghost" icon="mensaje" onClick={() => window.open(wa, '_blank', 'noopener')}>Enviar por WhatsApp</Button>}
          <Button variant={paciente.portal_activo ? 'ghost' : undefined} icon={paciente.portal_activo ? 'cerrar' : 'check'}
            onClick={() => paciente_({ portal_activo: !paciente.portal_activo }, paciente.portal_activo ? 'El portal ya no es visible para el paciente' : 'Portal publicado')}>
            {paciente.portal_activo ? 'Dejar de mostrar' : 'Mostrar en portal del cliente'}
          </Button>
        </div>
      </div>

      <div style={{ background: C.purpleMid, borderRadius: 16, padding: '12px 16px', fontSize: 14, color: C.g700, marginBottom: 16, lineHeight: 1.55 }}>
        Encienda lo que quiere que vea el paciente. Hoy verá <strong>{enPortal} {enPortal === 1 ? 'consulta' : 'consultas'}</strong> y <strong>{archivosPortal} {archivosPortal === 1 ? 'archivo' : 'archivos'}</strong>{paciente.portal_datos ? ', sus datos' : ''}{paciente.portal_costos ? ' y sus costos' : ''}. Las notas internas nunca se muestran.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="Información general">
          {fila(paciente.portal_datos, (v) => paciente_({ portal_datos: v }), 'Datos personales y antecedentes médicos', 'Teléfono, fecha de nacimiento, alergias, enfermedades, medicamentos…')}
          {finanzas && fila(paciente.portal_costos, (v) => paciente_({ portal_costos: v }), 'Costos, pagos y saldo pendiente', 'Lo que ha pagado y lo que debe')}
        </Card>

        <Card title={`Consultas (${citas.length})`} right={citas.length > 0 && <div style={{ display: 'flex', gap: 10 }}>
          <Button size="sm" variant="texto" onClick={() => todas('citas', citas, true)}>Mostrar todas</Button>
          <Button size="sm" variant="texto" onClick={() => todas('citas', citas, false)}>Ninguna</Button></div>}>
          {citas.length === 0 && <div style={{ color: C.g400 }}>Sin consultas</div>}
          {citas.map((c, i) => {
            const partes = partesDe(c), ocultas = c.portal_ocultar || []
            return (
              <div key={c.id} style={{ borderTop: i ? `1px solid ${C.g100}` : 'none', padding: '6px 0 10px' }}>
                {fila(c.portal, (v) => guardar('citas', { portal: v }, c.id), <><strong style={{ fontWeight: 600 }}>{fmtFecha(c.fecha)}</strong> · {[c.tipo, c.servicio].filter(Boolean).join(' · ') || 'Consulta'}</>,
                  !partes.length ? 'Esta consulta no tiene indicaciones escritas' : c.portal ? null : `${partes.length} ${partes.length === 1 ? 'parte' : 'partes'} escritas`)}
                {c.portal && partes.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 48 }}>
                    {partes.map(p => {
                      const si = !ocultas.includes(p.id)
                      return (
                        <button key={p.id} type="button" onClick={() => alternarParte(c, p.id)} title={si ? 'Se muestra; toque para ocultar' : 'Oculto; toque para mostrar'} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 160, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                          border: `1.5px solid ${si ? C.purple : C.g200}`, background: si ? C.purpleMid : '#fff', color: si ? C.black : C.g400, textDecoration: si ? 'none' : 'line-through',
                        }}>{si ? '✓' : '✕'} {p.titulo}</button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </Card>

        <Card title={`Fotos y documentos (${archivos.length})`} right={archivos.length > 0 && <div style={{ display: 'flex', gap: 10 }}>
          <Button size="sm" variant="texto" onClick={() => todas('archivos', archivos, true)}>Mostrar todos</Button>
          <Button size="sm" variant="texto" onClick={() => todas('archivos', archivos, false)}>Ninguno</Button></div>}>
          {archivos.length === 0 ? <div style={{ color: C.g400 }}>Sin fotos ni documentos</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {archivos.map(a => (
                <div key={a.id} onClick={() => guardar('archivos', { portal: !a.portal }, a.id)} style={{ borderRadius: 16, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${a.portal ? C.purple : C.g200}`, background: '#fff', opacity: a.portal ? 1 : 0.7 }}>
                  {(a.mime || '').startsWith('image/')
                    ? <img src={a.url} alt={a.notas || etapa(a.etapa) || 'Foto'} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                    : <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red }}><Icon name="pdf" size={34} /></div>}
                  <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Interruptor activo={a.portal} onChange={(v) => guardar('archivos', { portal: v }, a.id)} />
                    <span style={{ fontSize: 12, color: C.g600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre && !(a.mime || '').startsWith('image/') ? a.nombre : etapa(a.etapa)} · {fmtFechaCorta(a.fecha)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

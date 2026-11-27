import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { fmtFechaCorta, fmtHora } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { useInventario, existencia, fmtCant } from '../hooks/useInventario'
import { useAtenciones } from '../hooks/useAtenciones'
import { esAdmin, esSoporte } from '../lib/permisos'
import { ESTADOS_CONFIRMABLES, puedeConfirmar, kitDeServicio, errorAtencion, faltaSQL } from '../lib/insumos'
import { fraseMedico } from './HospitalCita'
import { BuscadorProducto } from './inventario/Selectores'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Badge, Cargando } from './ui/Varios'
import { Icon } from './ui/Icon'
import { Campo, Input } from './ui/Campos'
import { Desplegable } from './ui/Desplegable'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'

// «Confirmar atención»: the assigned doctor (or the owner) confirms the patient was attended and lists the supplies used.
// The list starts with the service's default kit (Inventario → Paquetes); each line can be removed (X) or changed, and others can be added.
// What is missing in stock is NOT blocking: the rest is discounted and the shortfall goes to «Pendientes de bodega».
export function ConfirmarAtencionModal({ cita, paciente, onClose, onHecho, subtituloExtra }) {
  const { hospital, recargar: recargarDatos } = useDatos()
  const { inv } = useInventario()
  const { recargar } = useAtenciones()
  const [lineas, setLineas] = useState(null) // [{ producto, cantidad }] — null until the kit is loaded
  const [sede, setSede] = useState(cita.sede_id || '')
  const [agregar, setAgregar] = useState('')
  const [aMano, setAMano] = useState([]) // supplies already discounted by hand for this cita (so they are not discounted twice)
  const [busy, setBusy] = useState(false)
  const enviando = useRef(false)

  const dep = hospital.departamento(cita.departamento_id)
  const medico = hospital.profesional(cita.profesional_id)
  const sinInventario = !!inv?.error || (inv && inv.productos.length === 0)

  // start from the service's kit once the inventory is loaded
  useEffect(() => { if (inv && lineas === null) setLineas(inv.error ? [] : kitDeServicio(inv, cita.servicio_id).filter(l => inv.productos.some(p => p.id === l.producto && p.activo))) }, [inv, lineas, cita.servicio_id])
  // the only way to duplicate a discount is a manual one (Descargar producto / Usar paquete): show them
  useEffect(() => {
    let vivo = true
    supabase.from('inventario_movimientos').select('producto_id, delta').eq('cita_id', cita.id).eq('tipo', 'uso')
      .then(({ data }) => { if (vivo) setAMano(data || []) })
    return () => { vivo = false }
  }, [cita.id])
  // a single location is chosen by itself; with several and none on the cita, the user picks
  useEffect(() => { if (inv && !inv.error && !sede) { const s = inv.sedes.filter(x => x.activa); if (s.length === 1) setSede(s[0].id) } }, [inv, sede])

  const producto = (id) => inv?.productos.find(p => p.id === id)
  const sedesActivas = inv && !inv.error ? inv.sedes.filter(s => s.activa) : []
  const opcionesSede = sedesActivas.map(s => ({ value: s.id, label: s.nombre }))
  const cantidadOk = (l) => Number(l.cantidad) > 0 && Number(l.cantidad) <= 9999999
  const valido = lineas !== null && lineas.every(cantidadOk) && (!lineas.length || !!sede)
  const faltan = lineas ? lineas.filter(l => cantidadOk(l) && Number(l.cantidad) > existencia(inv, sede, l.producto)).length : 0
  const nombrePrevio = (id) => producto(id)?.nombre || 'Producto'

  const confirmarAtencion = async () => {
    if (!valido || enviando.current) return
    enviando.current = true; setBusy(true)
    const { data, error } = await supabase.rpc('atencion_confirmar', {
      p_cita: cita.id, p_lineas: lineas.map(l => ({ producto_id: l.producto, cantidad: Number(l.cantidad) })), p_sede: sede || null,
    })
    if (error) { enviando.current = false; setBusy(false); toast.error(errorAtencion(error, 'No se pudo confirmar la atención')); if (faltaSQL(error)) onClose(); return }
    await Promise.all([recargar(), recargarDatos?.()])
    toast.success(data?.faltantes ? `Atención confirmada. ${data.faltantes === 1 ? '1 insumo quedó' : `${data.faltantes} insumos quedaron`} pendiente${data.faltantes === 1 ? '' : 's'} de bodega` : 'Atención confirmada')
    onHecho?.(data)
    onClose()
  }

  const caja = { width: '100%', justifyContent: 'space-between', padding: '11px 14px' }
  return (
    <Modal title="Confirmar atención" subtitle={[paciente?.nombre, `${fmtFechaCorta(cita.fecha)}${cita.hora ? ` · ${fmtHora(cita.hora)}` : ''}`, cita.servicio || cita.tipo, subtituloExtra].filter(Boolean).join(' · ')} onClose={onClose} maxWidth={700}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {dep && <Badge color={C.purple} bg={C.purpleMid}>{dep.nombre}</Badge>}
        {medico && <span style={{ fontSize: 13.5, color: C.g600 }}>{fraseMedico(medico.nombre)}</span>}
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, color: C.g600 }}>
        Al confirmar, la cita queda como «Asistió» y los insumos de la lista salen de la bodega.
      </p>

      {!inv || lineas === null ? <Cargando /> : (
        <>
          {!sinInventario && sedesActivas.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <Campo label="Sede de la que salen los insumos *">
                <Desplegable ariaLabel="Sede" value={sede} onChange={setSede} options={opcionesSede} placeholder="Elija la sede" style={caja} />
              </Campo>
            </div>
          )}

          {sinInventario ? (
            <div style={{ padding: '12px 14px', borderRadius: 14, background: C.g50, border: `1px solid ${C.g200}`, fontSize: 13.5, color: C.g600, lineHeight: 1.5 }}>
              {inv.error ? 'Su plan no incluye inventario: se confirma la atención sin insumos.' : 'Todavía no hay insumos en el inventario: se confirma la atención sin insumos.'}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.g700, marginBottom: 4 }}>Insumos usados</div>
              <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 8, lineHeight: 1.45 }}>
                {kitDeServicio(inv, cita.servicio_id).length
                  ? <>Insumos habituales de «{cita.servicio}». Quite con la X los que no usó, cambie cantidades o agregue otros.</>
                  : <>{cita.servicio ? `«${cita.servicio}» no tiene insumos predefinidos.` : 'La cita no tiene servicio.'} Agregue los que usó, o confirme sin insumos. Los kits se arman en Inventario → Paquetes.</>}
              </div>
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 16 }}>
                {lineas.length === 0 && <div style={{ padding: '12px 14px', color: C.g400, fontSize: 13.5 }}>Sin insumos en la lista</div>}
                {lineas.map((l, i) => {
                  const p = producto(l.producto), hay = existencia(inv, sede, l.producto), n = Number(l.cantidad), falta = cantidadOk(l) && n > hay
                  const deEsp = !!dep && p?.departamento_id === dep.id
                  return (
                    <div key={l.producto} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: i ? `1px solid ${C.g100}` : 'none', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <div style={{ fontWeight: 500, color: C.black, overflowWrap: 'anywhere' }}>{p?.nombre || 'Insumo'}{deEsp && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: C.purple }}>de la especialidad</span>}</div>
                        <div style={{ fontSize: 12, color: falta ? C.amber : C.g400 }}>
                          {!sede ? 'Elija la sede' : falta ? `Solo hay ${fmtCant(hay)}: lo que falte pasa a Pendientes de bodega` : `Hay ${fmtCant(hay)} ${p?.unidad || ''}`}
                        </div>
                      </div>
                      <div style={{ width: 96 }}><Input type="number" min="0" step="any" aria-label={`Cantidad de ${p?.nombre || 'insumo'}`} value={l.cantidad} onChange={(v) => setLineas(a => a.map((x, j) => j === i ? { ...x, cantidad: v } : x))} /></div>
                      <span style={{ width: 62, fontSize: 13, color: C.g500 }}>{p?.unidad}</span>
                      <button type="button" onClick={() => setLineas(a => a.filter((_, j) => j !== i))} aria-label={`Quitar ${p?.nombre || 'insumo'}`} title="Quitar" className="btn-ghost"
                        style={{ border: 'none', background: 'none', color: C.g400, cursor: 'pointer', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="cerrar" size={16} /></button>
                    </div>
                  )
                })}
                <div style={{ padding: 10, borderTop: lineas.length ? `1px solid ${C.g100}` : 'none' }}>
                  <BuscadorProducto productos={inv.productos.filter(p => p.activo && !lineas.some(l => l.producto === p.id))} valor={agregar} inv={inv} sedeId={sede || undefined}
                    primero={dep ? (p) => p.departamento_id === dep.id : undefined} etiquetaPrimero={dep ? 'de la especialidad' : undefined}
                    onChange={(id) => { setAgregar(''); setLineas(a => [...a, { producto: id, cantidad: '1' }]) }} placeholder="+ Agregar insumo: escriba el nombre…" />
                </div>
              </div>
              {faltan > 0 && (
                <div role="status" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 14, background: C.amberLight, color: C.amber, fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Icon name="alerta" size={17} />
                  <span>{faltan === 1 ? 'Un insumo no alcanza' : `${faltan} insumos no alcanzan`}: se descuenta lo que hay y lo que falta queda en «Pendientes de bodega». No se bloquea la atención.</span>
                </div>
              )}
              {aMano.length > 0 && (
                <div role="status" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 14, background: C.amberLight, color: C.amber, fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Icon name="alerta" size={17} style={{ marginTop: 2 }} />
                  <span>Esta cita ya tiene insumos descargados a mano ({aMano.map(m => `${nombrePrevio(m.producto_id)} ×${fmtCant(Math.abs(m.delta))}`).join(', ')}). Quítelos de la lista para no descontarlos dos veces.</span>
                </div>
              )}
            </>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button icon="check" onClick={confirmarAtencion} disabled={!valido || busy}>{busy ? 'Confirmando…' : 'Confirmar atención'}</Button>
      </div>
    </Modal>
  )
}

// What a cita shows about its supplies once attended (read-only), with «Corregir» for the owner
export function AtencionConfirmada({ cita, detalle, onCambio }) {
  const { perfil, recargar: recargarDatos } = useDatos()
  const { productos, recargar } = useAtenciones()
  const { atencion, lineas, pendientes } = detalle
  const [busy, setBusy] = useState(false)
  const nombre = (id) => productos.find(p => p.id === id)
  const pendienteDe = (l) => pendientes.find(p => p.atencion_insumo_id === l.id)
  const cuando = new Date(atencion.confirmada_at).toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  const corregir = async () => {
    const ok = await confirmar({
      titulo: '¿Corregir esta atención?', subtitulo: 'Solo la persona administradora puede hacerlo',
      mensaje: ['Los insumos descontados regresan a la bodega, se quita la confirmación y la cita vuelve a su estado anterior. Después podrá confirmarla de nuevo con los insumos correctos.'],
      aceptar: 'Sí, corregir',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('atencion_corregir', { p_cita: cita.id })
    setBusy(false)
    if (error) { toast.error(errorAtencion(error, 'No se pudo corregir')); return }
    await Promise.all([recargar(), recargarDatos?.()])
    toast.success('Atención corregida: los insumos regresaron a la bodega')
    onCambio?.({ estado: atencion.estado_previo || undefined }) // the form of the cita that is open must not save the old estado back
  }
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: '14px 16px', background: '#fff', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: lineas.length ? 10 : 0 }}>
        <Badge color={C.green} bg={C.greenLight}><Icon name="check" size={13} stroke={2.4} />Atención confirmada</Badge>
        <span style={{ fontSize: 13, color: C.g500, flex: 1, minWidth: 160 }}>{atencion.confirmada_nombre ? `${atencion.confirmada_nombre} · ` : ''}{cuando}</span>
        {esAdmin(perfil) && !esSoporte(perfil) && <Button size="sm" variant="ghost" icon="repetir" onClick={corregir} disabled={busy}>Corregir</Button>}
      </div>
      {lineas.length === 0
        ? <div style={{ fontSize: 13, color: C.g400, marginTop: 8 }}>Sin insumos descontados.</div>
        : lineas.map((l, i) => {
          const p = nombre(l.producto_id), pend = pendienteDe(l)
          return (
            <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderTop: i ? `1px solid ${C.g100}` : 'none', flexWrap: 'wrap', fontSize: 13.5 }}>
              <span style={{ flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere', color: C.black }}>{p?.nombre || 'Insumo'}</span>
              <strong style={{ fontWeight: 600 }}>{fmtCant(l.descontada)} {p?.unidad || ''}</strong>
              {Number(l.faltante) > 0 || pend ? (
                pend?.estado === 'resuelto'
                  ? <Badge color={C.green} bg={C.greenLight}>Pendiente resuelto</Badge>
                  : <Badge color={C.amber} bg={C.amberLight}>Faltaron {fmtCant(pend?.cantidad ?? l.faltante)} · pendiente de bodega</Badge>
              ) : null}
            </div>
          )
        })}
    </div>
  )
}

// One block for a cita: the confirmed attendance with its supplies, or the «Confirmar atención» button (when this user can).
// Hospital accounts only; renders nothing before the migration is applied, for support sessions without a confirmation, or when the cita cannot be confirmed.
export function PanelAtencion({ cita, paciente, onCambio, compacto, arriba = 0 }) {
  const { perfil, hospital, emergencias } = useDatos()
  const { activo, delCita } = useAtenciones()
  const [abrir, setAbrir] = useState(false)
  if (!activo || !hospital?.disponible || !cita?.id) return null
  const d = delCita(cita.id)
  const envolver = (x) => <div style={{ marginTop: arriba }}>{x}</div>
  if (d.atencion) return envolver(<AtencionConfirmada cita={cita} detalle={d} onCambio={onCambio} />)
  const enCurso = emergencias?.porCita?.get(cita.id)
  if (enCurso && !enCurso.cerrado_at) return null // an open emergency is confirmed when it is finished
  if (!ESTADOS_CONFIRMABLES.includes(cita.estado) || esSoporte(perfil)) return null
  if (!puedeConfirmar(perfil, cita)) {
    const m = hospital.profesional(cita.profesional_id)
    return envolver(<div style={{ fontSize: 13, color: C.g500 }}>{m ? `${fraseMedico(m.nombre)} confirma la atención y los insumos.` : 'El médico asignado confirma la atención y los insumos.'}</div>)
  }
  return envolver(
    <>
      <Button icon="check" size={compacto ? 'sm' : 'md'} onClick={() => setAbrir(true)}>Confirmar atención</Button>
      {abrir && <ConfirmarAtencionModal cita={cita} paciente={paciente} onClose={() => setAbrir(false)} onHecho={() => onCambio?.({ estado: 'Asistió' })} />}
    </>
  )
}

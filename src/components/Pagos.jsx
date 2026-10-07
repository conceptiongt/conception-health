import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { METODOS_PAGO } from '../lib/constantes'
import { fmtQ, fmtFecha, fmtFechaCorta, hoyISO, saldo, totalCobro } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Badge, Indicadores } from './ui/Varios'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Icon } from './ui/Icon'
import { Campo, Input, Select, Textarea, Grid } from './ui/Campos'
import { toast } from './ui/Toast'

// ─── Status of a charge ───
export const ESTADOS_COBRO = {
  pagado: { label: 'Pagado', color: C.green, bg: C.greenLight },
  parcial: { label: 'Abonado', color: C.blue, bg: C.blueLight },
  pendiente: { label: 'Pendiente', color: C.amber, bg: C.amberLight },
  vencido: { label: 'Vencido', color: C.red, bg: C.redLight },
}
export function estadoCobro(c, hoy = hoyISO()) {
  if (saldo(c) <= 0) return 'pagado'
  if (c.vence && c.vence < hoy) return 'vencido'
  return Number(c.pagado) > 0 ? 'parcial' : 'pendiente'
}
// Consultation type of a charge: from its rate, else from its appointment
export const tipoCobro = (c, citas, servicios) =>
  servicios.find(s => s.id === c.servicio_id)?.categoria || citas.find(x => x.id === c.cita_id)?.tipo || 'Otro'
export const sedeCobro = (c, citas, pacientes) =>
  citas.find(x => x.id === c.cita_id)?.sede_id || pacientes.find(p => p.id === c.paciente_id)?.sede_id || null

export function Progreso({ c, ancho = 120 }) {
  const t = totalCobro(c), pct = t > 0 ? Math.min(100, (Number(c.pagado) / t) * 100) : 100
  return (
    <div style={{ width: ancho }}>
      <div style={{ height: 5, borderRadius: 3, background: C.g100, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? C.green : C.purple }} />
      </div>
      <div style={{ fontSize: 11.5, color: C.g400, marginTop: 3 }}>{Math.round(pct)}% pagado</div>
    </div>
  )
}

// Payments of one charge (newest first)
export function useAbonos(cobroId) {
  const [abonos, setAbonos] = useState(null)
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('abonos').select('*').eq('cobro_id', cobroId).order('fecha', { ascending: false }).order('created_at', { ascending: false })
    setAbonos(data || [])
  }, [cobroId])
  useEffect(() => { cargar() }, [cargar])
  return { abonos, cargar }
}

// ─── Register a payment ───
export function AbonoModal({ cobro, paciente, onClose, onGuardado }) {
  const pendiente = saldo(cobro)
  const [f, setF] = useState({ monto: pendiente > 0 ? String(pendiente) : '', fecha: hoyISO(), metodo: '', nota: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const n = Number(f.monto)
  const guardar = async () => {
    if (!(n > 0)) { toast.error('Escriba el monto del pago'); return }
    if (n > pendiente + 0.001 && !confirm(`El pago (${fmtQ(n)}) es mayor que el saldo (${fmtQ(pendiente)}). ¿Registrarlo de todas formas?`)) return
    setBusy(true)
    const { error } = await supabase.from('abonos').insert({ cobro_id: cobro.id, monto: n, fecha: f.fecha, metodo: f.metodo || null, nota: f.nota.trim() || null })
    setBusy(false)
    if (error) { toast.error('No se pudo registrar el pago'); return }
    toast.success(n >= pendiente ? 'Pago registrado: el cobro quedó saldado' : 'Abono registrado')
    onGuardado()
  }
  return (
    <Modal title="Registrar pago" subtitle={`${paciente?.nombre || ''} · ${cobro.concepto}`} onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', gap: 24, padding: '12px 14px', borderRadius: 10, background: C.g50, border: `1px solid ${C.line}`, marginBottom: 16, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 12, color: C.g500 }}>Total</div><div style={{ fontWeight: 500 }}>{fmtQ(totalCobro(cobro))}</div></div>
        <div><div style={{ fontSize: 12, color: C.g500 }}>Pagado</div><div style={{ fontWeight: 500, color: C.green }}>{fmtQ(cobro.pagado)}</div></div>
        <div><div style={{ fontSize: 12, color: C.g500 }}>Saldo</div><div style={{ fontWeight: 500, color: pendiente > 0 ? C.red : C.green }}>{fmtQ(pendiente)}</div></div>
      </div>
      <Grid min={180}>
        <Campo label="Monto (Q) *"><Input type="number" min="0" step="0.01" value={f.monto} onChange={set('monto')} autoFocus /></Campo>
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
        <Campo label="Método"><Select value={f.metodo} onChange={set('metodo')}><option value="">—</option>{METODOS_PAGO.map(m => <option key={m}>{m}</option>)}</Select></Campo>
        <Campo label="Nota (opcional)"><Input value={f.nota} onChange={set('nota')} placeholder="No. de boleta, autorización…" /></Campo>
      </Grid>
      {n > 0 && <div style={{ fontSize: 13, color: C.g500, marginTop: 12 }}>Después de este pago quedará: <strong style={{ color: Math.max(0, pendiente - n) > 0 ? C.black : C.green, fontWeight: 500 }}>{fmtQ(Math.max(0, pendiente - n))}</strong></div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={busy} icon="check">{busy ? 'Guardando…' : 'Registrar pago'}</Button>
      </div>
    </Modal>
  )
}

// ─── One charge: totals, deadline and its payment history ───
export function CobroDetalle({ cobro, paciente, onClose, onCambio }) {
  const { citas = [], servicios = [] } = useDatos()
  const { abonos, cargar } = useAbonos(cobro.id)
  const [pagar, setPagar] = useState(false)
  const [vence, setVence] = useState(cobro.vence || '')
  const e = ESTADOS_COBRO[estadoCobro(cobro)]
  const cambio = () => { cargar(); onCambio() }

  const plazo = (n, unidad) => {
    const d = new Date(`${cobro.fecha}T12:00`)
    unidad === 'meses' ? d.setMonth(d.getMonth() + n) : d.setDate(d.getDate() + n)
    guardarVence(d.toISOString().slice(0, 10))
  }
  const guardarVence = async (v) => {
    setVence(v)
    const { error } = await supabase.from('cobros').update({ vence: v || null }).eq('id', cobro.id)
    if (error) { toast.error('No se pudo guardar la fecha límite'); return }
    toast.success(v ? `Fecha límite: ${fmtFecha(v)}` : 'Sin fecha límite'); onCambio()
  }
  const borrar = async (a) => {
    if (!confirm(`¿Eliminar el pago de ${fmtQ(a.monto)} del ${fmtFechaCorta(a.fecha)}? El saldo vuelve a subir.`)) return
    const { error } = await supabase.from('abonos').delete().eq('id', a.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Pago eliminado'); cambio()
  }

  return (
    <Modal title={cobro.concepto} subtitle={`${paciente?.nombre || ''} · ${tipoCobro(cobro, citas, servicios)} · ${fmtFecha(cobro.fecha)}`} onClose={onClose} maxWidth={720}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <Badge color={e.color} bg={e.bg}>{e.label}</Badge>
        {cobro.vence && saldo(cobro) > 0 && <span style={{ fontSize: 13, color: e === ESTADOS_COBRO.vencido ? C.red : C.g500 }}>Fecha límite {fmtFecha(cobro.vence)}</span>}
        <div style={{ flex: 1 }} />
        {saldo(cobro) > 0 && <Button icon="mas" onClick={() => setPagar(true)}>Registrar pago</Button>}
      </div>
      <Indicadores items={[
        { label: 'Precio', valor: fmtQ(cobro.precio), sub: Number(cobro.descuento) ? `Descuento ${fmtQ(cobro.descuento)}` : null },
        { label: 'Total', valor: fmtQ(totalCobro(cobro)) },
        { label: 'Pagado', valor: fmtQ(cobro.pagado), color: C.green },
        { label: 'Saldo', valor: fmtQ(saldo(cobro)), color: saldo(cobro) > 0 ? C.red : C.green },
      ]} />

      {saldo(cobro) > 0 && (
        <div style={{ marginTop: 16, padding: '12px 14px', border: `1px solid ${C.line}`, borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Plazo para pagar</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {[[15, 'días'], [30, 'días'], [2, 'meses'], [3, 'meses'], [6, 'meses']].map(([n, u]) => (
              <Button key={n + u} size="sm" variant="ghost" onClick={() => plazo(n, u)}>{n} {u}</Button>
            ))}
            <span style={{ fontSize: 13, color: C.g500, marginLeft: 6 }}>o fecha:</span>
            <input type="date" value={vence} onChange={ev => guardarVence(ev.target.value)} style={{ padding: '5px 10px', minHeight: 32, borderRadius: 8, border: `1px solid ${C.g200}`, fontFamily: 'inherit', fontSize: 13 }} />
          </div>
        </div>
      )}

      <div style={{ fontSize: 14, fontWeight: 500, margin: '20px 0 8px' }}>Historial de pagos</div>
      {!abonos ? <div style={{ color: C.g400 }}>Cargando…</div> : abonos.length === 0 ? (
        <div style={{ color: C.g400, fontSize: 13.5 }}>Todavía no hay pagos registrados.</div>
      ) : (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
          {abonos.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${C.g100}` : 'none', fontSize: 13.5 }}>
              <span style={{ width: 84, color: C.g500 }}>{fmtFechaCorta(a.fecha)}</span>
              <span style={{ flex: 1, minWidth: 0, color: C.g600 }}>{[a.metodo, a.nota].filter(Boolean).join(' · ') || '—'}</span>
              <strong style={{ fontWeight: 500, color: C.green }}>{fmtQ(a.monto)}</strong>
              <button onClick={() => borrar(a)} title="Eliminar pago" aria-label="Eliminar pago" className="btn-ghost" style={{ border: 'none', background: 'none', color: C.g400, cursor: 'pointer', width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="eliminar" size={15} /></button>
            </div>
          ))}
        </div>
      )}
      {cobro.observaciones && <div style={{ marginTop: 14, fontSize: 13, color: C.g600 }}>Observaciones: {cobro.observaciones}</div>}

      {pagar && <AbonoModal cobro={cobro} paciente={paciente} onClose={() => setPagar(false)} onGuardado={() => { setPagar(false); cambio() }} />}
    </Modal>
  )
}

// Statement of account of one patient (charges with each payment), for the PDF / Excel export
export async function estadoDeCuenta(paciente, cobros) {
  const ids = cobros.map(c => c.id)
  const { data } = ids.length ? await supabase.from('abonos').select('*').in('cobro_id', ids).order('fecha') : { data: [] }
  const abonos = data || []
  const total = cobros.reduce((n, c) => n + totalCobro(c), 0), pagado = cobros.reduce((n, c) => n + Number(c.pagado || 0), 0)
  const filas = []
  for (const c of [...cobros].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    filas.push([fmtFechaCorta(c.fecha), c.concepto, fmtQ(totalCobro(c)), '', fmtQ(saldo(c)), ESTADOS_COBRO[estadoCobro(c)].label])
    for (const a of abonos.filter(x => x.cobro_id === c.id)) filas.push(['', `   Pago ${fmtFechaCorta(a.fecha)}${a.metodo ? ` · ${a.metodo}` : ''}`, '', fmtQ(a.monto), '', ''])
  }
  filas.push({ _total: true, celdas: ['', 'Totales', fmtQ(total), fmtQ(pagado), fmtQ(total - pagado), ''] })
  return {
    titulo: 'Estado de cuenta', subtitulo: paciente.nombre,
    secciones: [
      { resumen: [['Total', fmtQ(total)], ['Pagado', fmtQ(pagado)], ['Saldo pendiente', fmtQ(total - pagado)]] },
      { titulo: 'Detalle de cobros y pagos', tabla: { headers: ['Fecha', 'Concepto', 'Cargo', 'Pago', 'Saldo', 'Estado'], filas } },
    ],
    excel: { archivo: `estado-de-cuenta_${paciente.nombre}`, hojas: [{ nombre: 'Estado de cuenta', columnas: [
      { header: 'Fecha', key: 'f', width: 12 }, { header: 'Concepto', key: 'c', width: 36 }, { header: 'Cargo', key: 'cargo', width: 14, moneda: true },
      { header: 'Pago', key: 'pago', width: 14, moneda: true }, { header: 'Método', key: 'm', width: 14 }, { header: 'Saldo del cobro', key: 's', width: 14, moneda: true },
    ], filas: [...cobros].sort((a, b) => a.fecha.localeCompare(b.fecha)).flatMap(c => [
      { f: c.fecha, c: c.concepto, cargo: totalCobro(c), s: saldo(c) },
      ...abonos.filter(x => x.cobro_id === c.id).map(a => ({ f: a.fecha, c: `Pago · ${c.concepto}`, pago: Number(a.monto), m: a.metodo })),
    ]) }] },
  }
}

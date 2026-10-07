import { useState } from 'react'
import { C } from '../lib/theme'
import { TIPOS_CITA } from '../lib/constantes'
import { fmtQ, fmtFechaCorta, saldo, totalCobro, hoyISO } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Tabla, Badge, Indicadores, Segmentos, Vacio, Card } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { filtroStyle } from '../components/ui/Campos'
import { Exportar } from '../components/Documento'
import { SelectorPeriodo, RangoFechas, FiltroSede, enPeriodo, textoPeriodo, nombreSede } from '../components/Filtros'
import { ESTADOS_COBRO, estadoCobro, tipoCobro, sedeCobro, Progreso, CobroDetalle, AbonoModal } from '../components/Pagos'

// Payment control of every patient: who already paid, who owes, what is overdue (surgeries above all)
export function Pagos() {
  const { cobros, pacientes, citas, servicios, sedes, clinica, recargar, ir } = useDatos()
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState('')       // '' | 'deben' | 'vencido' | 'pagado'
  const [tipo, setTipo] = useState('')
  const [sede, setSede] = useState('')
  const [periodo, setPeriodo] = useState({ mes: '', anio: '', desde: '', hasta: '' })
  const [vista, setVista] = useState('pacientes')
  const [abierto, setAbierto] = useState(null)   // charge detail
  const [pagar, setPagar] = useState(null)
  const [expandido, setExpandido] = useState(null)
  const hoy = hoyISO()
  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))

  const q = buscar.trim().toLowerCase()
  const lista = cobros.filter(c => {
    const p = porId[c.paciente_id]
    if (!p) return false
    if (q && !p.nombre.toLowerCase().includes(q) && !(c.concepto || '').toLowerCase().includes(q)) return false
    const e = estadoCobro(c, hoy)
    if (estado === 'deben' && e === 'pagado') return false
    if (estado && estado !== 'deben' && e !== estado) return false
    if (tipo && tipoCobro(c, citas, servicios) !== tipo) return false
    if (sede && sedeCobro(c, citas, pacientes) !== sede) return false
    if (!enPeriodo(c.fecha, periodo)) return false
    return true
  }).sort((a, b) => (estadoCobro(b, hoy) === 'vencido') - (estadoCobro(a, hoy) === 'vencido') || b.fecha.localeCompare(a.fecha))

  const total = lista.reduce((n, c) => n + totalCobro(c), 0)
  const pagado = lista.reduce((n, c) => n + Number(c.pagado || 0), 0)
  const vencidos = lista.filter(c => estadoCobro(c, hoy) === 'vencido')
  const grupos = Object.values(lista.reduce((g, c) => { (g[c.paciente_id] ||= { p: porId[c.paciente_id], cobros: [] }).cobros.push(c); return g }, {}))
    .map(g => ({ ...g, total: g.cobros.reduce((n, c) => n + totalCobro(c), 0), pagado: g.cobros.reduce((n, c) => n + Number(c.pagado || 0), 0), vencido: g.cobros.some(c => estadoCobro(c, hoy) === 'vencido') }))
    .map(g => ({ ...g, saldo: Math.max(0, g.total - g.pagado) }))
    .sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo || a.p.nombre.localeCompare(b.p.nombre, 'es'))
  const alDia = grupos.filter(g => g.saldo <= 0).length

  const filtroTexto = [textoPeriodo(periodo), sede && nombreSede(sedes, sede), tipo, estado && { deben: 'Con saldo', vencido: 'Vencidos', pagado: 'Pagados' }[estado]].filter(Boolean).join(' · ')
  const preparar = () => ({
    titulo: 'Pagos y saldos', subtitulo: filtroTexto,
    secciones: [
      { resumen: [['Total cobrado', fmtQ(total)], ['Pagado', fmtQ(pagado)], ['Saldo pendiente', fmtQ(total - pagado)], ['Pacientes al día', `${alDia} de ${grupos.length}`]] },
      { titulo: 'Por paciente', tabla: { headers: ['Paciente', 'Cobros', 'Total', 'Pagado', 'Saldo', 'Estado'],
        filas: grupos.map(g => [g.p.nombre, g.cobros.length, fmtQ(g.total), fmtQ(g.pagado), fmtQ(g.saldo), g.saldo <= 0 ? 'Al día' : g.vencido ? 'Vencido' : 'Con saldo']) } },
    ],
    excel: { archivo: 'pagos-y-saldos', hojas: [{ nombre: 'Cobros', columnas: [
      { header: 'Fecha', key: 'f', width: 12 }, { header: 'Paciente', key: 'p', width: 30 }, { header: 'Concepto', key: 'c', width: 30 }, { header: 'Tipo', key: 't', width: 16 },
      { header: 'Sede', key: 's', width: 14 }, { header: 'Total', key: 'tot', width: 13, moneda: true }, { header: 'Pagado', key: 'pag', width: 13, moneda: true },
      { header: 'Saldo', key: 'sal', width: 13, moneda: true }, { header: 'Fecha límite', key: 'v', width: 12 }, { header: 'Estado', key: 'e', width: 12 },
    ], filas: lista.map(c => ({ f: c.fecha, p: porId[c.paciente_id]?.nombre, c: c.concepto, t: tipoCobro(c, citas, servicios), s: nombreSede(sedes, sedeCobro(c, citas, pacientes)),
      tot: totalCobro(c), pag: Number(c.pagado || 0), sal: saldo(c), v: c.vence, e: ESTADOS_COBRO[estadoCobro(c)].label })) }] },
  })

  const filaCobro = (c, conPaciente) => {
    const e = ESTADOS_COBRO[estadoCobro(c, hoy)]
    return { key: c.id, cobro: c, celdas: [
      fmtFechaCorta(c.fecha),
      ...(conPaciente ? [<span style={{ fontWeight: 500 }}>{porId[c.paciente_id]?.nombre}</span>] : []),
      <div><div>{c.concepto}</div><div style={{ fontSize: 12, color: C.g400 }}>{tipoCobro(c, citas, servicios)}{sedes.length && sedeCobro(c, citas, pacientes) ? ` · ${nombreSede(sedes, sedeCobro(c, citas, pacientes))}` : ''}</div></div>,
      fmtQ(totalCobro(c)), <span style={{ color: C.green }}>{fmtQ(c.pagado)}</span>,
      <span style={{ fontWeight: 500, color: saldo(c) > 0 ? C.red : C.g400 }}>{fmtQ(saldo(c))}</span>,
      <Progreso c={c} ancho={100} />,
      <div><Badge color={e.color} bg={e.bg}>{e.label}</Badge>{c.vence && saldo(c) > 0 && <div style={{ fontSize: 11.5, color: C.g400, marginTop: 2 }}>límite {fmtFechaCorta(c.vence)}</div>}</div>,
      saldo(c) > 0 ? <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setPagar(c) }}>Registrar pago</Button> : '',
    ] }
  }

  return (
    <>
      <Encabezado titulo="Pagos y saldos" subtitulo="Control de pagos de cada paciente: quién ya pagó, quién tiene saldo y qué está vencido">
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
      </Encabezado>

      <Indicadores style={{ marginBottom: 18 }} items={[
        { label: 'Total de cobros', valor: fmtQ(total), sub: `${lista.length} ${lista.length === 1 ? 'cobro' : 'cobros'}` },
        { label: 'Pagado', valor: fmtQ(pagado), color: C.green, sub: total ? `${Math.round((pagado / total) * 100)}% del total` : null },
        { label: 'Saldo pendiente', valor: fmtQ(total - pagado), color: total - pagado > 0 ? C.red : C.black, onClick: () => setEstado('deben') },
        { label: 'Vencido', valor: fmtQ(vencidos.reduce((n, c) => n + saldo(c), 0)), color: vencidos.length ? C.red : C.black, sub: `${vencidos.length} ${vencidos.length === 1 ? 'cobro' : 'cobros'}`, onClick: () => setEstado('vencido') },
        { label: 'Pacientes al día', valor: `${alDia} de ${grupos.length}`, onClick: () => setEstado('pagado') },
      ]} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar paciente o concepto…" style={{ ...filtroStyle, flex: '1 1 260px' }} />
      </div>
      <div style={{ marginBottom: 10 }}><FiltroSede valor={sede} onChange={setSede} /></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <Segmentos valor={estado} onChange={setEstado} opciones={[{ value: '', label: 'Todos' }, { value: 'deben', label: 'Con saldo' }, { value: 'vencido', label: 'Vencidos' }, { value: 'pagado', label: 'Pagados' }]} />
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={filtroStyle}><option value="">Todo tipo</option>{[...TIPOS_CITA, 'Otro'].map(t => <option key={t}>{t}</option>)}</select>
        <SelectorPeriodo valor={periodo} onChange={setPeriodo} todosAnios />
        <RangoFechas valor={periodo} onChange={setPeriodo} />
        <div style={{ flex: 1 }} />
        <Segmentos valor={vista} onChange={setVista} opciones={[{ value: 'pacientes', label: 'Por paciente' }, { value: 'cobros', label: 'Por cobro' }]} />
      </div>

      {cobros.length === 0 ? (
        <Card><Vacio icono="cartera" titulo="Aún no hay cobros" texto="Los cobros se crean al registrar una cita con precio, o desde la pestaña Cobros del expediente de cada paciente." /></Card>
      ) : vista === 'cobros' ? (
        <Tabla columnas={['Fecha', 'Paciente', 'Concepto', 'Total', 'Pagado', 'Saldo', 'Avance', 'Estado', '']} onFila={(f) => setAbierto(f.cobro)} vacio="Ningún cobro con estos filtros"
          filas={lista.map(c => filaCobro(c, true))} />
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
          <div className="pago-fila pago-cab"><span>Paciente</span><span>Cobros</span><span>Total</span><span>Pagado</span><span>Saldo</span><span>Estado</span></div>
          {grupos.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: C.g400 }}>Ningún paciente con estos filtros</div>}
          {grupos.map(g => {
            const abiertoG = expandido === g.p.id
            const est = g.saldo <= 0 ? { l: 'Al día', c: C.green, b: C.greenLight } : g.vencido ? { l: 'Vencido', c: C.red, b: C.redLight } : { l: 'Con saldo', c: C.amber, b: C.amberLight }
            return (
              <div key={g.p.id} style={{ borderTop: `1px solid ${C.g100}` }}>
                <div className="pago-fila fila" onClick={() => setExpandido(abiertoG ? null : g.p.id)} style={{ cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Icon name="flecha" size={14} style={{ color: C.g400, transform: abiertoG ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.p.nombre}</span>
                  </span>
                  <span style={{ color: C.g500 }}>{g.cobros.length}</span>
                  <span>{fmtQ(g.total)}</span>
                  <span style={{ color: C.green }}>{fmtQ(g.pagado)}</span>
                  <span style={{ fontWeight: 500, color: g.saldo > 0 ? C.red : C.g400 }}>{fmtQ(g.saldo)}</span>
                  <span><Badge color={est.c} bg={est.b}>{est.l}</Badge></span>
                </div>
                {abiertoG && (
                  <div style={{ padding: '4px 16px 16px 38px', background: C.g50 }}>
                    <Tabla columnas={['Fecha', 'Concepto', 'Total', 'Pagado', 'Saldo', 'Avance', 'Estado', '']} onFila={(f) => setAbierto(f.cobro)} filas={g.cobros.map(c => filaCobro(c, false))} />
                    <div style={{ marginTop: 10 }}><Button size="sm" variant="ghost" icon="expedientes" onClick={() => ir('expedientes', g.p.id)}>Abrir expediente</Button></div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {abierto && <CobroDetalle cobro={cobros.find(c => c.id === abierto.id) || abierto} paciente={porId[abierto.paciente_id]} onClose={() => setAbierto(null)} onCambio={recargar} />}
      {pagar && <AbonoModal cobro={pagar} paciente={porId[pagar.paciente_id]} onClose={() => setPagar(null)} onGuardado={() => { setPagar(null); recargar() }} />}
    </>
  )
}

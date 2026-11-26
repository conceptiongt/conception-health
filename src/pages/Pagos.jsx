import { useState, useEffect } from 'react'
import { C } from '../lib/theme'
import { TIPOS_CITA } from '../lib/constantes'
import { fmtQ, fmtFechaCorta, saldo, totalCobro, hoyISO } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Vacio, Card } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Icon } from '../components/ui/Icon'
import { Panel, Avatar, Tocable } from '../components/ui/Panel'
import { filtroStyle } from '../components/ui/Campos'
import { Desplegable } from '../components/ui/Desplegable'
import { Exportar } from '../components/Documento'
import { prepararPagos, resumenPagos, agruparPorPaciente } from '../lib/exportar'
import { SelectorPeriodo, RangoFechas, FiltroSede, enPeriodo, textoPeriodo, nombreSede } from '../components/Filtros'
import { ESTADOS_COBRO, estadoCobro, tipoCobro, sedeCobro, CobroDetalle, AbonoModal } from '../components/Pagos'

// True while the viewport is at least `min` px wide (list + detail side by side)
function useAncho(min) {
  const q = `(min-width: ${min}px)`
  const [ok, setOk] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setOk(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [q])
  return ok
}
const pctDe = (n, t) => (t > 0 ? Math.max(0, Math.min(100, (n / t) * 100)) : 0)
const Cifra = ({ label, valor, sub, pct, color, rojo, onClick }) => (
  <Tocable onClick={onClick} label={onClick ? `${label}: ${valor}` : undefined} className="pg-cifra">
    <div className="in-kpi-l">{label}</div>
    <div className="in-kpi-n" style={{ color: color || undefined }}>{valor}</div>
    <div className="k-barra" role="presentation"><span className={rojo ? 'pg-barra-roja' : 'k-barra-rayas'} style={{ width: `${pct}%`, minWidth: pct > 0 ? 6 : 0 }} /></div>
    {sub && <div className="in-kpi-s">{sub}</div>}
  </Tocable>
)

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
  const [sel, setSel] = useState(null)           // selected row key ("p:<patient>" or "c:<charge>")
  const [detalleMovil, setDetalleMovil] = useState(false) // detail window on narrow screens
  const ancho = useAncho(1100)
  const hoy = hoyISO()
  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))

  const q = buscar.trim().toLowerCase()
  const cumple = (c, k) => { const e = estadoCobro(c, hoy); return k === 'deben' ? e !== 'pagado' : !k || e === k }
  // every filter except the status tab, so the tabs can show their own counts
  const base = cobros.filter(c => {
    const p = porId[c.paciente_id]
    if (!p) return false
    if (q && !p.nombre.toLowerCase().includes(q) && !(c.concepto || '').toLowerCase().includes(q)) return false
    if (tipo && tipoCobro(c, citas, servicios) !== tipo) return false
    if (sede && sedeCobro(c, citas, pacientes) !== sede) return false
    if (!enPeriodo(c.fecha, periodo)) return false
    return true
  })
  const lista = base.filter(c => cumple(c, estado)).sort((a, b) => (estadoCobro(b, hoy) === 'vencido') - (estadoCobro(a, hoy) === 'vencido') || b.fecha.localeCompare(a.fecha))

  const { total, pagado, vencidos, grupos, alDia } = resumenPagos(lista, porId, hoy)

  const filtroTexto = [textoPeriodo(periodo), sede && nombreSede(sedes, sede), tipo, estado && { deben: 'Con saldo', vencido: 'Vencidos', pagado: 'Pagados' }[estado]].filter(Boolean).join(' · ')
  const preparar = () => prepararPagos({ lista, pacientes, citas, servicios, sedes, filtroTexto })


  // ── rows of the navy list ──
  const resumenGrupo = (g) => {
    const abiertos = g.cobros.filter(c => saldo(c) > 0)
    const limite = abiertos.map(c => c.vence).filter(Boolean).sort()[0]
    const key = g.saldo <= 0 ? 'pagado' : g.vencido ? 'vencido' : g.pagado > 0 ? 'parcial' : 'pendiente'
    return { key: `p:${g.p.id}`, nombre: g.p.nombre, pacienteId: g.p.id, cobros: g.cobros, monto: g.saldo > 0 ? g.saldo : g.total, estadoKey: key,
      sub: `${g.cobros.length} ${g.cobros.length === 1 ? 'cobro' : 'cobros'}${limite ? ` · límite ${fmtFechaCorta(limite)}` : ''}` }
  }
  const resumenCobro = (c) => {
    const key = estadoCobro(c, hoy)
    return { key: `c:${c.id}`, nombre: porId[c.paciente_id]?.nombre, pacienteId: c.paciente_id, cobros: [c], monto: saldo(c) > 0 ? saldo(c) : totalCobro(c), estadoKey: key,
      sub: `${c.concepto}${c.vence && saldo(c) > 0 ? ` · límite ${fmtFechaCorta(c.vence)}` : ` · ${fmtFechaCorta(c.fecha)}`}` }
  }
  const filas = vista === 'cobros' ? lista.map(resumenCobro) : grupos.map(resumenGrupo)
  const fila = filas.find(f => f.key === sel) || (ancho ? filas[0] : null)
  // if the selected row leaves the list (filtered out), clear the selection so the modal doesn't reopen by itself
  const selExiste = sel != null && filas.some(f => f.key === sel)
  useEffect(() => {
    if (sel != null && !selExiste) { setSel(null); setDetalleMovil(false) }
  }, [sel, selExiste])
  const cuenta = (k) => vista === 'cobros' ? base.filter(c => cumple(c, k)).length : agruparPorPaciente(base.filter(c => cumple(c, k))).length
  const etiquetaChip = { vencido: 'Vencido', pendiente: 'Con saldo', parcial: 'Con saldo', pagado: 'Al día' } // patient rows: old three-state wording (as in the PDF/Excel export)

  const nFiltros = [buscar.trim(), tipo, sede, (periodo.mes !== '' || periodo.anio !== '' || periodo.desde || periodo.hasta) ? 'p' : ''].filter(v => v !== '' && v != null).length
  const limpiar = () => { setBuscar(''); setTipo(''); setSede(''); setPeriodo({ mes: '', anio: '', desde: '', hasta: '' }) }
  const elegir = (k) => { setSel(k); if (!ancho) setDetalleMovil(true) }

  const pendiente = total - pagado
  const vencidoMonto = vencidos.reduce((n, c) => n + saldo(c), 0)

  // detail of the selected row: the patient (or the single charge) with its charges, totals and actions
  const detalle = fila && (() => {
    const pac = porId[fila.pacienteId]
    const tot = fila.cobros.reduce((n, c) => n + totalCobro(c), 0), pag = fila.cobros.reduce((n, c) => n + Number(c.pagado || 0), 0)
    const sal = Math.max(0, tot - pag)
    return (
      <div className="pg-detalle">
        <div className="pg-cab">
          <Avatar nombre={pac?.nombre} size={48} oscuro />
          <div style={{ flex: '1 1 150px', minWidth: 0 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 300, fontSize: 24, letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>{pac?.nombre}</div>
          </div>
          <button type="button" className="pg-btn linea" onClick={() => ir('expedientes', fila.pacienteId)}><Icon name="expedientes" size={15} />Abrir expediente</button>
        </div>
        <div className="pg-tarjetas">
          {fila.cobros.map(c => {
            const e = estadoCobro(c, hoy)
            const t = totalCobro(c)
            return (
              <div key={c.id} className="pg-tarjeta">
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="c">{c.concepto}</div>
                    <div className="s">{tipoCobro(c, citas, servicios)}{sedes.length && sedeCobro(c, citas, pacientes) ? ` · ${nombreSede(sedes, sedeCobro(c, citas, pacientes))}` : ''} · {fmtFechaCorta(c.fecha)}</div>
                  </div>
                  <span className={`pg-chip ${e}`} style={{ marginTop: 0 }}>{ESTADOS_COBRO[e].label}</span>
                </div>
                <div className="pg-mini">
                  <div><div className="l">Total</div><div className="v">{fmtQ(t)}</div></div>
                  <div><div className="l">Abonado</div><div className="v">{fmtQ(c.pagado)}</div></div>
                  <div><div className="l">Saldo</div><div className="v" style={{ color: saldo(c) > 0 ? '#FFC9D1' : '#B8F0CF' }}>{fmtQ(saldo(c))}</div></div>
                </div>
                <div>
                  <div className="pg-prog" role="presentation"><span style={{ width: `${t > 0 ? pctDe(Number(c.pagado), t) : 100}%` }} /></div>
                  <div className="s" style={{ marginTop: 4 }}>{Math.round(t > 0 ? pctDe(Number(c.pagado), t) : 100)}% pagado{c.vence && saldo(c) > 0 ? ` · límite ${fmtFechaCorta(c.vence)}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {saldo(c) > 0 && <button type="button" className="pg-btn blanco" onClick={() => setPagar(c)}><Icon name="mas" size={14} />Registrar pago</button>}
                  <button type="button" className="pg-btn linea" onClick={() => setAbierto(c)}>Ver detalle</button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="pg-totales">
          <div><div className="l">Total</div><div className="v">{fmtQ(tot)}</div></div>
          <div><div className="l">Abonado</div><div className="v">{fmtQ(pag)}</div></div>
          <div><div className="l">Saldo</div><div className="v" style={{ color: sal > 0 ? '#FFC9D1' : '#B8F0CF' }}>{fmtQ(sal)}</div></div>
        </div>
      </div>
    )
  })()

  return (
    <>
      <Encabezado titulo="Pagos y saldos" acento="saldos" subtitulo="Control de pagos de cada paciente: quién ya pagó, quién tiene saldo y qué está vencido">
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
      </Encabezado>

      <div className="pg-resumen">
        <Panel eyebrow="Resumen" titulo={filtroTexto || 'Todos los cobros'} style={{ padding: 'clamp(16px, 1.8vw, 22px) clamp(18px, 2.2vw, 28px)' }}>
          <div className="pg-tres">
            <Cifra label="Total de cobros" valor={fmtQ(total)} sub={`${lista.length} ${lista.length === 1 ? 'cobro' : 'cobros'}`} pct={total > 0 ? 100 : 0} />
            <Cifra label="Pagado" valor={fmtQ(pagado)} sub={total ? `${Math.round((pagado / total) * 100)}% del total` : null} pct={pctDe(pagado, total)} />
            <Cifra label="Saldo pendiente" valor={fmtQ(pendiente)} color={pendiente > 0 ? C.red : undefined} rojo pct={pctDe(pendiente, total)} sub="Ver los que tienen saldo" onClick={() => setEstado('deben')} />
          </div>
        </Panel>
        <Panel eyebrow="Atención" titulo="Para revisar" style={{ padding: 'clamp(16px, 1.8vw, 22px) clamp(18px, 2.2vw, 28px)' }}>
          <div className="pg-dos">
            <Cifra label="Vencido" valor={fmtQ(vencidoMonto)} color={vencidos.length ? C.red : undefined} rojo pct={pctDe(vencidoMonto, pendiente)} sub={`${vencidos.length} ${vencidos.length === 1 ? 'cobro' : 'cobros'}`} onClick={() => setEstado('vencido')} />
            <Cifra label="Pacientes al día" valor={`${alDia} de ${grupos.length}`} pct={pctDe(alDia, grupos.length)} sub="Ver los pagados" onClick={() => setEstado('pagado')} />
          </div>
        </Panel>
      </div>

      <div className="pg-filtros">
        <span className="pg-filtros-t">Filtros activos <span className="pg-count" aria-label={`${nFiltros} filtros activos`}>{nFiltros}</span></span>
        <input className="pg-buscar" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar paciente o concepto…" aria-label="Buscar paciente o concepto" style={filtroStyle} />
        <FiltroSede valor={sede} onChange={setSede} />
        <Desplegable ariaLabel="Tipo" value={tipo} onChange={setTipo} options={[{ value: '', label: 'Todo tipo' }, ...[...TIPOS_CITA, 'Otro'].map(t => ({ value: t, label: t }))]} />
        <SelectorPeriodo valor={periodo} onChange={setPeriodo} todosAnios desplegable />
        <RangoFechas valor={periodo} onChange={setPeriodo} />
        {nFiltros > 0 && <Button variant="texto" size="sm" onClick={limpiar}>Limpiar filtros</Button>}
      </div>

      {cobros.length === 0 ? (
        <Card><Vacio icono="cartera" titulo="Aún no hay cobros" texto="Los cobros se crean al registrar una cita con precio, o desde la pestaña Cobros del expediente de cada paciente." /></Card>
      ) : (
        <div className="pg-navy">
          <div className="pg-top">
            <div className="pg-titulo">{vista === 'cobros' ? 'Cobros' : 'Pacientes'} <span style={{ color: '#C6D3E8' }}>· {filas.length}</span></div>
            <div className="pg-tabs" role="group" aria-label="Estado de los cobros">
              {[{ value: '', label: 'Todos' }, { value: 'deben', label: 'Con saldo' }, { value: 'vencido', label: 'Vencidos' }, { value: 'pagado', label: 'Pagados' }].map(o => (
                <button key={o.value} type="button" aria-pressed={estado === o.value} className={`pg-tab${estado === o.value ? ' on' : ''}`} onClick={() => setEstado(o.value)}>{o.label}<span className="n">{cuenta(o.value)}</span></button>
              ))}
            </div>
            <div className="pg-vista" role="group" aria-label="Vista">
              {[{ value: 'pacientes', label: 'Por paciente' }, { value: 'cobros', label: 'Por cobro' }].map(o => (
                <button key={o.value} type="button" aria-pressed={vista === o.value} className={`pg-tab${vista === o.value ? ' on' : ''}`} onClick={() => { setVista(o.value); setSel(null) }}>{o.label}</button>
              ))}
            </div>
          </div>

          <div className="pg-cuerpo">
            <div className="pg-lista">
              {filas.length === 0 && <div className="pg-vacio">{vista === 'cobros' ? 'Ningún cobro con estos filtros' : 'Ningún paciente con estos filtros'}</div>}
              {filas.map(f => (
                <button key={f.key} type="button" className={`pg-fila${fila?.key === f.key ? ' sel' : ''}`} aria-pressed={fila?.key === f.key} onClick={() => elegir(f.key)}>
                  <Avatar nombre={f.nombre} oscuro />
                  <span style={{ minWidth: 0 }}>
                    <span className="pg-fila-n" style={{ display: 'block' }}>{f.nombre}</span>
                    <span className="pg-fila-s" style={{ display: 'block' }}>{f.sub}</span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span className="pg-monto" style={{ display: 'block' }}>{fmtQ(f.monto)}</span>
                    <span className={`pg-chip ${f.estadoKey}`}>{vista === 'cobros' ? ESTADOS_COBRO[f.estadoKey].label : etiquetaChip[f.estadoKey]}</span>
                  </span>
                </button>
              ))}
            </div>
            {ancho && (detalle || (filas.length === 0 && <div className="pg-detalle"><div className="pg-vacio" style={{ color: '#E8EEF6' }}>No hay nada que mostrar con estos filtros</div></div>))}
          </div>
        </div>
      )}

      {!ancho && detalleMovil && fila && (
        <Modal title={fila.nombre} subtitle={fila.sub} onClose={() => setDetalleMovil(false)} maxWidth={620}>{detalle}</Modal>
      )}
      {abierto && <CobroDetalle cobro={cobros.find(c => c.id === abierto.id) || abierto} paciente={porId[abierto.paciente_id]} onClose={() => setAbierto(null)} onCambio={recargar} />}
      {pagar && <AbonoModal cobro={pagar} paciente={porId[pagar.paciente_id]} onClose={() => setPagar(null)} onGuardado={() => { setPagar(null); recargar() }} />}
    </>
  )
}

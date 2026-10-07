import { useState } from 'react'
import { C, SHADOW } from '../lib/theme'
import { MESES, ESTADOS_CITA, ORIGENES, REDES, estadoCita, origenLabel } from '../lib/constantes'
import { fmtQ, fmtNum, fmtFecha, fmtFechaCorta, fmtHora, saldo, totalCobro, hoyISO, linkCalendar } from '../lib/formato'
import { slug } from '../lib/excel'
import { especialidad } from '../lib/especialidades'
import { puede } from '../lib/permisos'
import { useDatos } from '../hooks/useDatos'
import { Card, Badge, Indicadores } from '../components/ui/Varios'
import { Icon } from '../components/ui/Icon'
import { Exportar } from '../components/Documento'
import { SelectorPeriodo, AgregarAnio, FiltroSede, enPeriodo, nombreSede } from '../components/Filtros'
import { sedeCobro } from '../components/Pagos'

const hoy = new Date()
const COLOR_ESTADO = { Confirmada: '#1D4ED8', Pendiente: '#0F766E', 'Asistió': '#15803D', 'No asistió': '#DC2626', Reagendada: '#C2410C', Cancelada: '#6B6780' }
const PLURAL = { Confirmada: 'Confirmadas', Pendiente: 'Pendientes', 'Asistió': 'Asistieron', 'No asistió': 'No asistieron', Reagendada: 'Reagendadas', Cancelada: 'Canceladas' }
const Seccion = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, color: C.purple, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '26px 0 12px' }}>{children}</div>
)

export function Inicio() {
  const { pacientes: todosP, citas: todasC, cobros: todosCo, clinica, perfil, ir, sedes } = useDatos()
  const [periodo, setPeriodo] = useState({ mes: hoy.getMonth(), anio: hoy.getFullYear() })
  const [sede, setSede] = useState('')
  const nombre = clinica?.nombre || perfil.nombre
  const finanzas = puede(perfil, 'finanzas')

  // everything below follows the chosen location
  const pacientes = sede ? todosP.filter(p => p.sede_id === sede) : todosP
  const citas = sede ? todasC.filter(c => c.sede_id === sede) : todasC
  const cobros = sede ? todosCo.filter(c => sedeCobro(c, todasC, todosP) === sede) : todosCo
  const porId = Object.fromEntries(todosP.map(p => [p.id, p]))

  const enMesSel = (iso) => enPeriodo(iso, periodo)
  const nuevos = pacientes.filter(p => enMesSel(p.created_at))
  const deRedes = nuevos.filter(p => p.origen === 'redes').length
  const otros = nuevos.length - deRedes
  const pct = (n) => nuevos.length ? `${Math.round((n / nuevos.length) * 100)}% del total` : '—'
  const citasMes = citas.filter(c => enMesSel(c.fecha))
  const cobrosMes = cobros.filter(c => enMesSel(c.fecha))
  const ventasMes = cobrosMes.reduce((n, c) => n + (Number(c.pagado) || 0), 0)
  const ventasAnio = cobros.filter(c => c.fecha?.startsWith(String(periodo.anio))).reduce((n, c) => n + (Number(c.pagado) || 0), 0)
  const facturadoMes = cobrosMes.reduce((n, c) => n + totalCobro(c), 0)
  const pendienteTotal = cobros.reduce((n, c) => n + saldo(c), 0)
  const vencidos = cobros.filter(c => c.vence && c.vence < hoyISO() && saldo(c) > 0)
  const porEstado = ESTADOS_CITA.map(e => ({ ...e, n: citasMes.filter(c => c.estado === e.value).length }))
  const porOrigen = ORIGENES.map(o => ({ label: o.label, valor: nuevos.filter(p => p.origen === o.value).length }))
  const porRed = REDES.filter(r => r !== 'LinkedIn' || nuevos.some(p => p.red === r)).map(r => ({ red: r, n: nuevos.filter(p => p.origen === 'redes' && p.red === r).length }))
  const maxRed = Math.max(1, ...porRed.map(r => r.n))
  const cirugias = citasMes.filter(c => c.tipo === 'Cirugía').length
  const procedimientos = citasMes.filter(c => c.tipo === 'Procedimiento').length

  const seis = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(periodo.anio, periodo.mes - 5 + i, 1)
    const m = { mes: d.getMonth(), anio: d.getFullYear() }
    return { ...m, n: pacientes.filter(p => enPeriodo(p.created_at, m)).length }
  })
  const maxMes = Math.max(1, ...seis.map(s => s.n))

  const ultimos = [...pacientes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map(p => ({
    p, c: citas.filter(c => c.paciente_id === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0],
  }))
  const proximas = citas
    .filter(c => c.fecha >= hoyISO() && ['Pendiente', 'Confirmada', 'Reagendada'].includes(c.estado))
    .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')))
    .slice(0, 6)

  const esActual = periodo.mes === hoy.getMonth() && periodo.anio === hoy.getFullYear()
  const titulo = `${MESES[periodo.mes]} ${periodo.anio}${sede ? ` · ${nombreSede(sedes, sede)}` : ''}`

  const preparar = () => ({
    titulo: `Resumen de ${titulo}`,
    subtitulo: nombre,
    secciones: [
      { resumen: [['Pacientes nuevos', fmtNum(nuevos.length)], ['Citas del mes', fmtNum(citasMes.length)], ...(finanzas ? [['Cobrado del mes', fmtQ(ventasMes)], ['Saldo pendiente', fmtQ(pendienteTotal)]] : [])] },
      { titulo: 'Resumen', pares: [
        ['Pacientes del mes', fmtNum(nuevos.length)], ['Desde redes', `${deRedes} (${pct(deRedes)})`],
        ['Referidos / otros', `${otros} (${pct(otros)})`], ['Citas del mes', fmtNum(citasMes.length)],
        ['Cirugías', fmtNum(cirugias)], ['Procedimientos', fmtNum(procedimientos)],
        ...(finanzas ? [['Cobrado del mes', fmtQ(ventasMes)], ['Facturado del mes', fmtQ(facturadoMes)],
          [`Cobrado en ${periodo.anio}`, fmtQ(ventasAnio)], ['Saldo pendiente total', fmtQ(pendienteTotal)]] : []),
      ] },
      { titulo: 'Estado de citas', tabla: { headers: ['Estado', 'Citas'], filas: porEstado.map(e => [PLURAL[e.value], e.n]) } },
      { titulo: 'Origen de los pacientes', tabla: { headers: ['Origen', 'Pacientes'], filas: porOrigen.map(o => [o.label, o.valor]) } },
      { titulo: 'Distribución por red social', tabla: { headers: ['Red', 'Pacientes'], filas: porRed.map(r => [r.red, r.n]) } },
    ],
    excel: {
      archivo: `resumen_${slug(titulo)}`,
      hojas: [{ nombre: 'Resumen', columnas: [{ header: 'Indicador', key: 'k', width: 32 }, { header: 'Valor', key: 'v', width: 18 }],
        filas: [['Pacientes del mes', nuevos.length], ['Desde redes', deRedes], ['Referidos / otros', otros], ['Citas del mes', citasMes.length],
          ['Cirugías', cirugias], ['Procedimientos', procedimientos], ...(finanzas ? [['Cobrado del mes (Q)', ventasMes], ['Facturado del mes (Q)', facturadoMes],
          [`Cobrado en ${periodo.anio} (Q)`, ventasAnio], ['Saldo pendiente total (Q)', pendienteTotal]] : []),
          ...porEstado.map(e => [`Citas ${PLURAL[e.value].toLowerCase()}`, e.n]), ...porRed.map(r => [`Red: ${r.red}`, r.n])]
          .map(([k, v]) => ({ k, v })) }],
    },
  })

  const th = { padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: C.g500, whiteSpace: 'nowrap', background: C.g50, borderBottom: `1px solid ${C.line}` }
  const td = { padding: '11px 16px', whiteSpace: 'nowrap' }

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: C.black, margin: 0, letterSpacing: '-0.02em' }}>Hola, {nombre} 👋</h1>
        <div style={{ fontSize: 14, color: C.g500, marginTop: 4 }}>{especialidad(clinica?.especialidad).lema}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.g700 }}>Período:</span>
        <SelectorPeriodo valor={periodo} onChange={(p) => setPeriodo({ mes: p.mes === '' ? 0 : p.mes, anio: p.anio })} todosMeses={false} />
        <AgregarAnio />
        <div style={{ flex: 1 }} />
        <Exportar clinica={nombre} preparar={preparar} />
      </div>
      {sedes.length > 0 && <div style={{ marginBottom: 18 }}><FiltroSede valor={sede} onChange={setSede} /></div>}

      <Indicadores items={[
        { label: 'Pacientes del mes', valor: fmtNum(nuevos.length), sub: 'Total registrados' },
        { label: 'Desde redes', valor: fmtNum(deRedes), sub: pct(deRedes) },
        { label: 'Referidos / otros', valor: fmtNum(otros), sub: pct(otros) },
        { label: 'Citas del mes', valor: fmtNum(citasMes.length), sub: `${cirugias} cirugías · ${procedimientos} procedimientos`, onClick: () => ir('citas') },
        finanzas && { label: 'Ventas del mes', valor: fmtQ(ventasMes), sub: `Anual: ${fmtQ(ventasAnio)}`, onClick: () => ir('pagos') },
        finanzas && { label: 'Saldo pendiente', valor: fmtQ(pendienteTotal), color: pendienteTotal > 0 ? C.red : C.black, sub: `${vencidos.length} vencidos`, onClick: () => ir('pagos') },
      ]} />

      <Seccion>Estado de citas — {esActual ? 'este mes' : `${MESES[periodo.mes]} ${periodo.anio}`}</Seccion>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {porEstado.map(e => (
          <div key={e.value} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: '18px 14px', boxShadow: SHADOW, textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, color: C.g400, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{PLURAL[e.value]}</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: COLOR_ESTADO[e.value], marginTop: 6 }}>{e.n}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, marginTop: 22 }}>
        <Card title="Pacientes por mes">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 160, borderBottom: `1px solid ${C.line}` }}>
            {seis.map((s, i) => (
              <div key={`${s.anio}-${s.mes}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <span style={{ fontSize: 12, marginBottom: 4, color: C.g600 }}>{s.n}</span>
                <div style={{ width: '62%', height: `${(s.n / maxMes) * 120}px`, minHeight: s.n ? 3 : 0, background: C.grad, opacity: i === 5 ? 1 : 0.75, borderRadius: '6px 6px 0 0' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
            {seis.map(s => <div key={`${s.anio}-${s.mes}`} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: C.g400 }}>{MESES[s.mes].slice(0, 3)}</div>)}
          </div>
        </Card>
        <Card title="Pacientes por red social">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, paddingTop: 2 }}>
            {porRed.map(r => (
              <div key={r.red} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 28px', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: C.g600 }}>{r.red}</span>
                <div style={{ height: 6, background: C.g100, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(r.n / maxRed) * 100}%`, background: C.purple, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 13, color: C.g500, textAlign: 'right' }}>{r.n}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: C.g400, marginTop: 14 }}>
            Otros orígenes: {porOrigen.filter(o => o.label !== 'Redes sociales').map(o => `${o.label} ${o.valor}`).join(' · ')}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, marginTop: 16 }}>
        <Card title="Próximas citas" right={<button onClick={() => ir('citas')} style={{ background: 'none', border: 'none', color: C.purple, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Ver todas</button>}>
          {proximas.length === 0 ? <div style={{ fontSize: 13.5, color: C.g400 }}>No hay citas próximas</div> : proximas.map((c, i) => (
            <div key={c.id} onClick={() => ir('expedientes', c.paciente_id)} className="fila" style={{ display: 'flex', gap: 12, padding: '9px 6px', borderTop: i ? `1px solid ${C.g100}` : 'none', cursor: 'pointer', borderRadius: 6 }}>
              <div style={{ width: 104, fontSize: 13, color: C.g500 }}>{fmtFecha(c.fecha).replace(/ de \d{4}$/, '')}<div>{fmtHora(c.hora)}</div></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{porId[c.paciente_id]?.nombre || '—'}</div>
                <div style={{ fontSize: 12.5, color: C.g500 }}>{[c.tipo, c.servicio, nombreSede(sedes, c.sede_id)].filter(Boolean).join(' · ') || 'Consulta'}</div>
              </div>
            </div>
          ))}
        </Card>
        {finanzas && <Card title="Pagos vencidos" right={<span style={{ fontSize: 13, color: C.g500 }}>Saldo total <strong style={{ color: C.black, fontWeight: 500 }}>{fmtQ(pendienteTotal)}</strong></span>}>
          {vencidos.length === 0 ? <div style={{ fontSize: 13.5, color: C.g400 }}>No hay pagos vencidos</div> : vencidos.slice(0, 6).map((c, i) => (
            <div key={c.id} onClick={() => ir('expedientes', c.paciente_id)} className="fila" style={{ display: 'flex', gap: 10, padding: '9px 6px', borderTop: i ? `1px solid ${C.g100}` : 'none', cursor: 'pointer', borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{porId[c.paciente_id]?.nombre || '—'}</div>
                <div style={{ fontSize: 12.5, color: C.g500 }}>{c.concepto} · venció {fmtFecha(c.vence)}</div>
              </div>
              <span style={{ color: C.red, fontWeight: 500 }}>{fmtQ(saldo(c))}</span>
            </div>
          ))}
        </Card>}
      </div>

      <Card title="Últimos pacientes" style={{ marginTop: 16 }}>
        <div style={{ overflowX: 'auto', margin: '-16px -20px -18px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead><tr>{['Nombre', 'Última cita', 'Hora', 'Origen', 'Estado', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {ultimos.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: C.g400 }}>Aún no hay pacientes registrados</td></tr>
              ) : ultimos.map(({ p, c }) => {
                const e = c ? estadoCita(c.estado) : null
                const cal = c ? linkCalendar(p, c) : null
                return (
                  <tr key={p.id} className="fila" onClick={() => ir('expedientes', p.id)} style={{ borderTop: `1px solid ${C.g100}`, cursor: 'pointer' }}>
                    <td style={{ ...td, fontWeight: 500 }}>{p.nombre}</td>
                    <td style={td}>{c ? fmtFechaCorta(c.fecha) : '—'}</td>
                    <td style={td}>{c ? fmtHora(c.hora) : '—'}</td>
                    <td style={{ ...td, color: C.g600 }}>{p.origen === 'redes' && p.red ? p.red : origenLabel(p.origen)}</td>
                    <td style={td}>{e ? <Badge color={e.color} bg={e.bg}>{c.estado}</Badge> : '—'}</td>
                    <td style={td} onClick={ev => ev.stopPropagation()}>
                      {cal && <button onClick={() => window.open(cal, '_blank', 'noopener')} title="Agregar a Google Calendar" className="btn-ghost" style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${C.g200}`, background: '#fff', color: C.g500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="calendarioMas" size={15} /></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

import { useState } from 'react'
import { C, SHADOW } from '../lib/theme'
import { MESES, ESTADOS_CITA, ORIGENES, REDES, estadoCita, origenLabel } from '../lib/constantes'
import { fmtQ, fmtNum, fmtFecha, fmtFechaCorta, fmtHora, enMes, saldo, totalCobro, hoyISO, linkCalendar } from '../lib/formato'
import { slug } from '../lib/excel'
import { useDatos } from '../hooks/useDatos'
import { Card, Badge } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Exportar } from '../components/Documento'
import { filtroStyle } from '../components/ui/Campos'

const hoy = new Date()
const COLOR_RED = { Instagram: '#7D0080', Facebook: '#534AB7', TikTok: '#1D9E75', WhatsApp: '#3B6D11', LinkedIn: '#0A66C2' }
const COLOR_ESTADO = { Confirmada: '#1D4ED8', Pendiente: '#0F766E', 'Asistió': '#15803D', 'No asistió': '#DC2626', Reagendada: '#C2410C' }
const PLURAL = { Confirmada: 'Confirmadas', Pendiente: 'Pendientes', 'Asistió': 'Asistieron', 'No asistió': 'No asistieron', Reagendada: 'Reagendadas' }

function Metrica({ label, valor, sub }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '20px 22px', boxShadow: SHADOW, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: C.g400, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: C.black, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: C.g400, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const Seccion = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 800, color: C.purple, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '26px 0 12px' }}>{children}</div>
)

export function Inicio() {
  const { pacientes, citas, cobros, clinica, perfil, recargar, ir } = useDatos()
  const [mes, setMes] = useState({ mes: hoy.getMonth(), year: hoy.getFullYear() })
  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))
  const nombre = clinica?.nombre || perfil.nombre

  const nuevos = pacientes.filter(p => enMes(p.created_at, mes))
  const deRedes = nuevos.filter(p => p.origen === 'redes').length
  const otros = nuevos.length - deRedes
  const pct = (n) => nuevos.length ? `${Math.round((n / nuevos.length) * 100)}% del total` : '—'
  const citasMes = citas.filter(c => enMes(c.fecha, mes))
  const cobrosMes = cobros.filter(c => enMes(c.fecha, mes))
  const ventasMes = cobrosMes.reduce((n, c) => n + (Number(c.pagado) || 0), 0)
  const ventasAnio = cobros.filter(c => c.fecha?.startsWith(String(mes.year))).reduce((n, c) => n + (Number(c.pagado) || 0), 0)
  const facturadoMes = cobrosMes.reduce((n, c) => n + totalCobro(c), 0)
  const pendienteTotal = cobros.reduce((n, c) => n + saldo(c), 0)
  const vencidos = cobros.filter(c => c.vence && c.vence < hoyISO() && saldo(c) > 0)
  const porEstado = ESTADOS_CITA.map(e => ({ ...e, n: citasMes.filter(c => c.estado === e.value).length }))
  const porOrigen = ORIGENES.map(o => ({ label: o.label, valor: nuevos.filter(p => p.origen === o.value).length }))
  const porRed = REDES.filter(r => r !== 'LinkedIn' || nuevos.some(p => p.red === r)).map(r => ({ red: r, n: nuevos.filter(p => p.origen === 'redes' && p.red === r).length }))
  const maxRed = Math.max(1, ...porRed.map(r => r.n))
  const cirugias = citasMes.filter(c => c.tipo === 'Cirugía').length
  const procedimientos = citasMes.filter(c => c.tipo === 'Procedimiento').length

  const cuatro = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mes.year, mes.mes - 5 + i, 1)
    const m = { mes: d.getMonth(), year: d.getFullYear() }
    return { ...m, n: pacientes.filter(p => enMes(p.created_at, m)).length }
  })
  const maxMes = Math.max(1, ...cuatro.map(s => s.n))

  // latest patients with their most recent appointment
  const ultimos = [...pacientes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10).map(p => ({
    p, c: citas.filter(c => c.paciente_id === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0],
  }))
  const proximas = citas
    .filter(c => c.fecha >= hoyISO() && ['Pendiente', 'Confirmada', 'Reagendada'].includes(c.estado))
    .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')))
    .slice(0, 6)

  const periodos = Array.from({ length: 15 }, (_, i) => { const d = new Date(hoy.getFullYear(), hoy.getMonth() + 2 - i, 1); return { mes: d.getMonth(), year: d.getFullYear() } })
  const esActual = (m) => m.mes === hoy.getMonth() && m.year === hoy.getFullYear()
  const titulo = `${MESES[mes.mes]} ${mes.year}`

  const preparar = () => ({
    titulo: `Resumen de ${titulo}`,
    subtitulo: nombre,
    secciones: [
      { titulo: 'Resumen', pares: [
        ['Pacientes del mes', fmtNum(nuevos.length)], ['Desde redes', `${deRedes} (${pct(deRedes)})`],
        ['Referidos / otros', `${otros} (${pct(otros)})`], ['Citas del mes', fmtNum(citasMes.length)],
        ['Cirugías', fmtNum(cirugias)], ['Procedimientos', fmtNum(procedimientos)],
        ['Ventas del mes (cobrado)', fmtQ(ventasMes)], ['Facturado del mes', fmtQ(facturadoMes)],
        [`Ventas del año ${mes.year}`, fmtQ(ventasAnio)], ['Saldo pendiente total', fmtQ(pendienteTotal)],
      ] },
      { titulo: 'Estado de citas', tabla: { headers: ['Estado', 'Citas'], filas: porEstado.map(e => [PLURAL[e.value], e.n]) } },
      { titulo: 'Origen de los pacientes', tabla: { headers: ['Origen', 'Pacientes'], filas: porOrigen.map(o => [o.label, o.valor]) } },
      { titulo: 'Distribución por red social', tabla: { headers: ['Red', 'Pacientes'], filas: porRed.map(r => [r.red, r.n]) } },
    ],
    excel: {
      archivo: `resumen_${slug(titulo)}`,
      hojas: [{ nombre: 'Resumen', columnas: [{ header: 'Indicador', key: 'k', width: 32 }, { header: 'Valor', key: 'v', width: 18 }],
        filas: [['Pacientes del mes', nuevos.length], ['Desde redes', deRedes], ['Referidos / otros', otros], ['Citas del mes', citasMes.length],
          ['Cirugías', cirugias], ['Procedimientos', procedimientos], ['Ventas del mes (Q)', ventasMes], ['Facturado del mes (Q)', facturadoMes],
          [`Ventas del año ${mes.year} (Q)`, ventasAnio], ['Saldo pendiente total (Q)', pendienteTotal],
          ...porEstado.map(e => [`Citas ${PLURAL[e.value].toLowerCase()}`, e.n]), ...porRed.map(r => [`Red: ${r.red}`, r.n])]
          .map(([k, v]) => ({ k, v })) }],
    },
  })

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.black, margin: 0, letterSpacing: '-0.02em' }}>Hola, {nombre} 👋</h1>
        <div style={{ fontSize: 14, color: C.g400, fontStyle: 'italic', marginTop: 4 }}>No está aquí para encajar. Está para destacar.</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.g700 }}>Período:</span>
        <select value={`${mes.year}-${mes.mes}`} onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setMes({ year: y, mes: m }) }} style={filtroStyle}>
          {periodos.map(m => <option key={`${m.year}-${m.mes}`} value={`${m.year}-${m.mes}`}>{MESES[m.mes].slice(0, 3)} {m.year}{esActual(m) ? ' (actual)' : ''}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <Exportar clinica={nombre} preparar={preparar} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        <Metrica label="Pacientes del mes" valor={fmtNum(nuevos.length)} sub="Total registrados" />
        <Metrica label="Desde redes" valor={fmtNum(deRedes)} sub={pct(deRedes)} />
        <Metrica label="Referidos / otros" valor={fmtNum(otros)} sub={pct(otros)} />
        <Metrica label="Ventas del mes" valor={fmtQ(ventasMes)} sub={`Anual: ${fmtQ(ventasAnio)}`} />
      </div>

      <Seccion>Estado de citas — {esActual(mes) ? 'este mes' : titulo}</Seccion>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {porEstado.map(e => (
          <div key={e.value} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '18px 14px', boxShadow: SHADOW, textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, color: C.g400, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{PLURAL[e.value]}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: COLOR_ESTADO[e.value], marginTop: 6 }}>{e.n}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14, marginTop: 18 }}>
        <Card title="Pacientes por mes">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 170, borderBottom: `2px solid ${C.purpleLight}` }}>
            {cuatro.map(s => (
              <div key={`${s.year}-${s.mes}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <strong style={{ fontSize: 12, marginBottom: 4 }}>{s.n}</strong>
                <div style={{ width: '100%', height: `${(s.n / maxMes) * 130}px`, minHeight: s.n ? 4 : 0, background: 'linear-gradient(180deg, #A855F7 0%, #7D0080 100%)', borderRadius: '6px 6px 0 0' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            {cuatro.map(s => <div key={`${s.year}-${s.mes}`} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, color: C.g400 }}>{MESES[s.mes].slice(0, 3)}</div>)}
          </div>
        </Card>
        <Card title="Distribución por red social">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            {porRed.map(r => (
              <div key={r.red} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 28px', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, color: C.g600 }}>{r.red}</span>
                <div style={{ height: 8, background: C.g100, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(r.n / maxRed) * 100}%`, background: COLOR_RED[r.red], borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 13, color: C.g400, textAlign: 'right' }}>{r.n}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: C.g400, marginTop: 16 }}>
            Otros orígenes: {porOrigen.filter(o => o.label !== 'Redes sociales').map(o => `${o.label} ${o.valor}`).join(' · ')}
          </div>
        </Card>
      </div>

      <Card title="Últimos pacientes" style={{ marginTop: 18 }} right={<Button variant="soft" size="sm" onClick={recargar}>Actualizar</Button>}>
        <div style={{ overflowX: 'auto', margin: '0 -22px -22px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: C.g50 }}>
                {['Nombre', 'Fecha', 'Hora', 'Origen', 'Estado', 'Calendar'].map(h => (
                  <th key={h} style={{ padding: '11px 22px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ultimos.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: C.g400 }}>Aún no hay pacientes registrados</td></tr>
              ) : ultimos.map(({ p, c }) => {
                const e = c ? estadoCita(c.estado) : null
                const cal = c ? linkCalendar(p, c) : null
                return (
                  <tr key={p.id} className="fila" onClick={() => ir('expedientes', p.id)} style={{ borderTop: `1px solid ${C.g100}`, cursor: 'pointer' }}>
                    <td style={{ padding: '13px 22px', fontWeight: 700 }}>{p.nombre}</td>
                    <td style={{ padding: '13px 22px' }}>{c ? fmtFechaCorta(c.fecha) : '—'}</td>
                    <td style={{ padding: '13px 22px' }}>{c ? fmtHora(c.hora) : '—'}</td>
                    <td style={{ padding: '13px 22px' }}><Badge color={C.blue} bg={C.blueLight}>{p.origen === 'redes' && p.red ? p.red : origenLabel(p.origen)}</Badge></td>
                    <td style={{ padding: '13px 22px' }}>{e ? <Badge color={e.color} bg={e.bg}>{c.estado}</Badge> : '—'}</td>
                    <td style={{ padding: '13px 22px' }} onClick={ev => ev.stopPropagation()}>
                      {cal && <button onClick={() => window.open(cal, '_blank', 'noopener')} title="Agregar a Google Calendar" style={{ width: 34, height: 34, borderRadius: 17, border: `1px solid ${C.purpleLight}`, background: C.purpleMid, color: C.purple, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="calendarioMas" size={16} /></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14, marginTop: 18 }}>
        <Card title="Próximas citas" right={<button onClick={() => ir('citas')} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 700, cursor: 'pointer', fontSize: 13.5 }}>Ver todas</button>}>
          {proximas.length === 0 ? <div style={{ fontSize: 13, color: C.g400 }}>No hay citas próximas</div> : proximas.map(c => (
            <div key={c.id} onClick={() => ir('expedientes', c.paciente_id)} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.g100}`, cursor: 'pointer' }}>
              <div style={{ width: 110, fontSize: 13, color: C.g500 }}>{fmtFecha(c.fecha).replace(/ de \d{4}$/, '')} · {fmtHora(c.hora)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{porId[c.paciente_id]?.nombre || '—'}</div>
                <div style={{ fontSize: 12.5, color: C.g500 }}>{[c.tipo, c.servicio].filter(Boolean).join(' · ') || 'Consulta'}</div>
              </div>
            </div>
          ))}
        </Card>
        <Card title="Cobros pendientes" right={<span style={{ fontSize: 13, color: C.g500 }}>Total: <strong style={{ color: C.black }}>{fmtQ(pendienteTotal)}</strong></span>}>
          {vencidos.length === 0 ? <div style={{ fontSize: 13, color: C.g400 }}>No hay cobros vencidos</div> : vencidos.slice(0, 6).map(c => (
            <div key={c.id} onClick={() => ir('expedientes', c.paciente_id)} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.g100}`, cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{porId[c.paciente_id]?.nombre || '—'}</div>
                <div style={{ fontSize: 12.5, color: C.g500 }}>{c.concepto} · venció {fmtFecha(c.vence)}</div>
              </div>
              <strong style={{ color: C.red }}>{fmtQ(saldo(c))}</strong>
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}

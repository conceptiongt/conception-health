import { useState } from 'react'
import { C } from '../lib/theme'
import { MESES, ESTADOS_CITA, ORIGENES, REDES } from '../lib/constantes'
import { fmtQ, fmtNum, fmtFecha, fmtHora, enMes, saldo, hoyISO } from '../lib/formato'
import { slug } from '../lib/excel'
import { useDatos } from '../hooks/useDatos'
import { Stat, Card, Encabezado, Badge } from '../components/ui/Varios'
import { Exportar } from '../components/Documento'

const hoy = new Date()

function Barras({ items, color = C.purple }) {
  const max = Math.max(0, ...items.map(i => i.valor))
  if (!max) return <div style={{ fontSize: 13, color: C.g400 }}>Sin datos este mes</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {items.filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor).map(i => (
        <div key={i.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: C.g600 }}>{i.label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ height: 14, width: `${(i.valor / max) * 100}%`, minWidth: 4, background: color, borderRadius: '0 4px 4px 0' }} />
            <strong style={{ fontSize: 13 }}>{fmtNum(i.valor)}</strong>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Inicio() {
  const { pacientes, citas, cobros, clinica, ir } = useDatos()
  const [mes, setMes] = useState({ mes: hoy.getMonth(), year: hoy.getFullYear() })
  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))

  const nuevos = pacientes.filter(p => enMes(p.created_at, mes))
  const citasMes = citas.filter(c => enMes(c.fecha, mes))
  const cobrosMes = cobros.filter(c => enMes(c.fecha, mes))
  const cobrado = cobrosMes.reduce((n, c) => n + (Number(c.pagado) || 0), 0)
  const facturado = cobrosMes.reduce((n, c) => n + (Number(c.precio) || 0), 0)
  const pendienteTotal = cobros.reduce((n, c) => n + saldo(c), 0)
  const vencidos = cobros.filter(c => c.vence && c.vence < hoyISO() && saldo(c) > 0)
  const porOrigen = ORIGENES.map(o => ({ label: o.label, valor: nuevos.filter(p => p.origen === o.value).length }))
  const porRed = REDES.map(r => ({ label: r, valor: nuevos.filter(p => p.origen === 'redes' && p.red === r).length }))
  const porEstado = ESTADOS_CITA.map(e => ({ ...e, n: citasMes.filter(c => c.estado === e.value).length }))
  const cirugias = citasMes.filter(c => c.tipo === 'Cirugía').length
  const procedimientos = citasMes.filter(c => c.tipo === 'Procedimiento').length

  // last 6 months of new patients
  const seis = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mes.year, mes.mes - 5 + i, 1)
    const m = { mes: d.getMonth(), year: d.getFullYear() }
    return { ...m, n: pacientes.filter(p => enMes(p.created_at, m)).length }
  })
  const max6 = Math.max(1, ...seis.map(s => s.n))

  const proximas = citas
    .filter(c => c.fecha >= hoyISO() && ['Pendiente', 'Confirmada', 'Reagendada'].includes(c.estado))
    .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')))
    .slice(0, 8)

  const titulo = `${MESES[mes.mes]} ${mes.year}`
  const preparar = () => ({
    titulo: `Resumen de ${titulo}`,
    subtitulo: clinica?.nombre,
    secciones: [
      { titulo: 'Resumen', pares: [
        ['Pacientes nuevos', fmtNum(nuevos.length)], ['Citas del mes', fmtNum(citasMes.length)],
        ['Cirugías', fmtNum(cirugias)], ['Procedimientos', fmtNum(procedimientos)],
        ['Cobrado en el mes', fmtQ(cobrado)], ['Facturado en el mes', fmtQ(facturado)],
        ['Saldo pendiente total', fmtQ(pendienteTotal)], ['Cobros vencidos', fmtNum(vencidos.length)],
      ] },
      { titulo: 'Citas por estado', tabla: { headers: ['Estado', 'Citas'], filas: porEstado.map(e => [e.value, e.n]) } },
      { titulo: '¿Cómo nos encontraron? (pacientes nuevos)', tabla: { headers: ['Origen', 'Pacientes'], filas: porOrigen.map(o => [o.label, o.valor]) } },
      { titulo: 'Pacientes nuevos por red social', tabla: { headers: ['Red', 'Pacientes'], filas: porRed.filter(r => r.valor).map(r => [r.label, r.valor]) } },
    ],
    excel: {
      archivo: `resumen_${slug(titulo)}`,
      hojas: [
        { nombre: 'Resumen', columnas: [{ header: 'Indicador', key: 'k', width: 30 }, { header: 'Valor', key: 'v', width: 18 }],
          filas: [['Pacientes nuevos', nuevos.length], ['Citas del mes', citasMes.length], ['Cirugías', cirugias], ['Procedimientos', procedimientos],
            ['Cobrado en el mes (Q)', cobrado], ['Facturado en el mes (Q)', facturado], ['Saldo pendiente total (Q)', pendienteTotal],
            ...porEstado.map(e => [`Citas: ${e.value}`, e.n]), ...porOrigen.map(o => [`Origen: ${o.label}`, o.valor]), ...porRed.map(r => [`Red: ${r.label}`, r.valor])]
            .map(([k, v]) => ({ k, v })) },
      ],
    },
  })

  const selectStyle = { padding: '9px 12px', borderRadius: 9, border: `1.5px solid ${C.g200}`, fontSize: 14, background: '#fff' }
  const years = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1]

  return (
    <>
      <Encabezado titulo="Inicio" subtitulo={`Resumen de ${titulo}`}>
        <select value={mes.mes} onChange={e => setMes(m => ({ ...m, mes: +e.target.value }))} style={selectStyle}>
          {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={mes.year} onChange={e => setMes(m => ({ ...m, year: +e.target.value }))} style={selectStyle}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
      </Encabezado>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 12 }}>
        <Stat icono="🧑‍⚕️" label="Pacientes nuevos" valor={fmtNum(nuevos.length)} />
        <Stat icono="📅" label="Citas del mes" valor={fmtNum(citasMes.length)} sub={`${cirugias} cirugías · ${procedimientos} procedimientos`} color={C.blue} bg={C.blueLight} />
        <Stat icono="💵" label="Cobrado en el mes" valor={fmtQ(cobrado)} sub={`de ${fmtQ(facturado)} facturado`} color={C.green} bg={C.greenLight} />
        <Stat icono="⏳" label="Saldo pendiente" valor={fmtQ(pendienteTotal)} sub={vencidos.length ? `${vencidos.length} cobro(s) vencido(s)` : 'Sin cobros vencidos'} color={C.orange} bg={C.orangeLight} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginTop: 12 }}>
        {porEstado.map(e => (
          <div key={e.value} style={{ background: '#fff', border: `1px solid ${C.g200}`, borderRadius: 12, padding: '12px 14px' }}>
            <Badge color={e.color} bg={e.bg}>{e.value}</Badge>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{e.n}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12, marginTop: 12 }}>
        <Card title="¿Cómo nos encontraron?"><Barras items={porOrigen} /></Card>
        <Card title="Pacientes por red social"><Barras items={porRed} color={C.blue} /></Card>
        <Card title="Pacientes nuevos · últimos 6 meses">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, borderBottom: `1px solid ${C.g200}` }}>
            {seis.map(s => (
              <div key={`${s.year}-${s.mes}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <strong style={{ fontSize: 12, marginBottom: 3 }}>{s.n}</strong>
                <div style={{ width: '60%', maxWidth: 36, height: `${(s.n / max6) * 100}px`, background: C.purple, borderRadius: '4px 4px 0 0' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
            {seis.map(s => <div key={`${s.year}-${s.mes}`} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, color: C.g500 }}>{MESES[s.mes].slice(0, 3)}</div>)}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12, marginTop: 12 }}>
        <Card title="Próximas citas" right={<button onClick={() => ir('citas')} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 700, cursor: 'pointer' }}>Ver todas →</button>}>
          {proximas.length === 0 ? <div style={{ fontSize: 13, color: C.g400 }}>No hay citas próximas</div> : proximas.map(c => (
            <div key={c.id} onClick={() => ir('expedientes', c.paciente_id)} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.g100}`, cursor: 'pointer' }}>
              <div style={{ width: 92, fontSize: 12.5, color: C.g500 }}>{fmtFecha(c.fecha).replace(/ de \d{4}$/, '')}<br />{fmtHora(c.hora)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{porId[c.paciente_id]?.nombre || '—'}</div>
                <div style={{ fontSize: 12.5, color: C.g500 }}>{c.tipo || 'Consulta'} · {c.estado}</div>
              </div>
            </div>
          ))}
        </Card>
        <Card title="Cobros vencidos">
          {vencidos.length === 0 ? <div style={{ fontSize: 13, color: C.g400 }}>Todo al día 🎉</div> : vencidos.slice(0, 8).map(c => (
            <div key={c.id} onClick={() => ir('expedientes', c.paciente_id)} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.g100}`, cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{porId[c.paciente_id]?.nombre || '—'}</div>
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

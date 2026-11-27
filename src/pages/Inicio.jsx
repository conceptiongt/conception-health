import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { C, SERIF } from '../lib/theme'
import { MESES, ESTADOS_CITA, ORIGENES, REDES, estadoCita, origenLabel } from '../lib/constantes'
import { fmtQ, fmtNum, fmtFecha, fmtFechaCorta, fmtHora, saldo, totalCobro, hoyISO } from '../lib/formato'
import { slug } from '../lib/excel'
import { especialidad } from '../lib/especialidades'
import { puede } from '../lib/permisos'
import { useDatos } from '../hooks/useDatos'
import { Badge } from '../components/ui/Varios'
import { Panel, Avatar, Tocable } from '../components/ui/Panel'
import { Icon } from '../components/ui/Icon'
import { Exportar } from '../components/Documento'
import { SelectorPeriodo, AgregarAnio, FiltroSede, enPeriodo, nombreSede } from '../components/Filtros'
import { sedeCobro } from '../components/Pagos'
import { abrirCitasCon } from './Citas'
import { CalendarioInicio } from '../components/CalendarioInicio'
import { colorProfesional } from '../hooks/useHospital'

const hoy = new Date()
const NO_CUENTAN = ['Cancelada', 'No asistió']
const COLOR_ESTADO = { Confirmada: '#1D4ED8', Pendiente: '#0F766E', 'Asistió': '#15803D', 'No asistió': '#DC2626', Reagendada: '#C2410C', Cancelada: '#6B6780', Eliminada: '#9F1239' }
const PLURAL = { Confirmada: 'Confirmadas', Pendiente: 'Pendientes', 'Asistió': 'Asistieron', 'No asistió': 'No asistieron', Reagendada: 'Reagendadas', Cancelada: 'Canceladas', Eliminada: 'Eliminadas' }
// Pastel tile of each appointment status (decorative surface only; text stays dark ink)
const PASTEL_ESTADO = { Pendiente: C.peach, Confirmada: C.sky, 'Asistió': C.mint, 'No asistió': C.peony, Reagendada: C.lavender, Cancelada: C.periwinkle, Eliminada: C.g100 }
const fechaCorta = (iso) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3).toLowerCase()}`
const pctDe = (n, t) => (t ? Math.min(100, (n / t) * 100) : 0)
const Linea = ({ label, valor, sub, pct, onClick, children }) => (
  <Tocable onClick={onClick} label={onClick ? `${label}: ${valor}` : undefined} className="in-kpi">
    <div className="in-kpi-l">{label}</div>
    <div className="in-kpi-n">{valor}</div>
    {children || <div className="k-barra" role="presentation"><span className="k-barra-relleno" style={{ width: `${pct}%` }} /></div>}
    {sub && <div className="in-kpi-s">{sub}</div>}
  </Tocable>
)

export function Inicio() {
  const { pacientes: todosP, citas: todasC, cobros: todosCo, clinica, perfil, ir, sedes, hospital } = useDatos()
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
  const citasMes = citas.filter(c => enMesSel(c.fecha))
  // patients of the month = patients with an appointment that month (in the chosen location) that was not cancelled
  // or missed; deleted appointments are gone, so they never count. Totals and locations always agree.
  const pacientesDe = (lista) => [...new Set(lista.filter(c => !NO_CUENTAN.includes(c.estado)).map(c => c.paciente_id))].map(id => porId[id]).filter(Boolean)
  const nuevos = pacientesDe(citasMes)
  const atendidos = new Set(citasMes.filter(c => c.estado === 'Asistió').map(c => c.paciente_id)).size
  const deRedes = nuevos.filter(p => p.origen === 'redes').length
  const otros = nuevos.length - deRedes
  const pct = (n) => nuevos.length ? `${Math.round((n / nuevos.length) * 100)}% del total` : '—'
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
    return { ...m, n: pacientesDe(citas.filter(c => enPeriodo(c.fecha, m))).length }
  })
  const maxMes = Math.max(1, ...seis.map(s => s.n))

  const ultimos = [...pacientes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map(p => ({
    p, c: citas.filter(c => c.paciente_id === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0],
  }))
  const proximas = citas
    .filter(c => c.fecha >= hoyISO() && ['Pendiente', 'Confirmada', 'Reagendada'].includes(c.estado))
    .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')))
    .slice(0, 6)

  // appointments deleted this month (Citas → Citas eliminadas), shown as their own box in "Estado de citas"
  const [eliminadasMes, setEliminadasMes] = useState([])
  useEffect(() => {
    const desde = `${periodo.anio}-${String(periodo.mes + 1).padStart(2, '0')}-01`
    const fin = new Date(periodo.anio, periodo.mes + 1, 1)
    const hasta = `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-01`
    supabase.from('citas_eliminadas').select('id, fecha, sede:datos->>sede_id').gte('fecha', desde).lt('fecha', hasta)
      .then(({ data }) => setEliminadasMes(data || []))
  }, [periodo.mes, periodo.anio])
  const eliminadas = eliminadasMes.filter(e => !sede || e.sede === sede).length

  // a status box opens Citas with that status, this month and this location
  const verCitas = (f) => { abrirCitasCon({ ...f, sede, periodo: { mes: periodo.mes, anio: periodo.anio, desde: '', hasta: '' } }); ir('citas') }

  const hoyStr = hoyISO()
  const citasHoy = citas.filter(c => c.fecha === hoyStr && ['Pendiente', 'Confirmada', 'Reagendada', 'Asistió'].includes(c.estado))
  const sigCita = proximas[0]
  // hospital: today's appointments by specialty and by doctor (a click opens Citas filtered, today only)
  const hosp = hospital.disponible
  const hoyPorDep = hosp ? hospital.departamentos.map(d => ({ d, n: citasHoy.filter(c => c.departamento_id === d.id).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n) : []
  const hoyPorMed = hosp ? hospital.profesionales.map(p => ({ p, n: citasHoy.filter(c => c.profesional_id === p.id).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 6) : []
  const verHoy = (f) => { abrirCitasCon({ ...f, sede, periodo: { mes: '', anio: '', desde: hoyStr, hasta: hoyStr } }); ir('citas') }

  const esActual = periodo.mes === hoy.getMonth() && periodo.anio === hoy.getFullYear()
  const titulo = `${MESES[periodo.mes]} ${periodo.anio}${sede ? ` · ${nombreSede(sedes, sede)}` : ''}`

  const preparar = () => ({
    titulo: `Resumen de ${titulo}`,
    subtitulo: nombre,
    secciones: [
      { resumen: [['Pacientes del mes', fmtNum(nuevos.length)], ['Citas del mes', fmtNum(citasMes.length)], ...(finanzas ? [['Cobrado del mes', fmtQ(ventasMes)], ['Saldo pendiente', fmtQ(pendienteTotal)]] : [])] },
      { titulo: 'Resumen', pares: [
        ['Pacientes del mes', fmtNum(nuevos.length)], ['Desde redes', `${deRedes} (${pct(deRedes)})`],
        ['Referidos / otros', `${otros} (${pct(otros)})`], ['Citas del mes', fmtNum(citasMes.length)],
        ['Cirugías', fmtNum(cirugias)], ['Procedimientos', fmtNum(procedimientos)],
        ...(finanzas ? [['Cobrado del mes', fmtQ(ventasMes)], ['Facturado del mes', fmtQ(facturadoMes)],
          [`Cobrado en ${periodo.anio}`, fmtQ(ventasAnio)], ['Saldo pendiente total', fmtQ(pendienteTotal)]] : []),
      ] },
      { titulo: 'Estado de citas', tabla: { headers: ['Estado', 'Citas'], filas: [...porEstado.map(e => [PLURAL[e.value], e.n]), ['Eliminadas', eliminadas]] } },
      { titulo: 'Origen de los pacientes', tabla: { headers: ['Origen', 'Pacientes'], filas: porOrigen.map(o => [o.label, o.valor]) } },
      { titulo: 'Distribución por red social', tabla: { headers: ['Red', 'Pacientes'], filas: porRed.map(r => [r.red, r.n]) } },
    ],
    excel: {
      archivo: `resumen_${slug(titulo)}`,
      hojas: [{ nombre: 'Resumen', columnas: [{ header: 'Indicador', key: 'k', width: 32 }, { header: 'Valor', key: 'v', width: 18 }],
        filas: [['Pacientes del mes', nuevos.length], ['Desde redes', deRedes], ['Referidos / otros', otros], ['Citas del mes', citasMes.length],
          ['Cirugías', cirugias], ['Procedimientos', procedimientos], ...(finanzas ? [['Cobrado del mes (Q)', ventasMes], ['Facturado del mes (Q)', facturadoMes],
          [`Cobrado en ${periodo.anio} (Q)`, ventasAnio], ['Saldo pendiente total (Q)', pendienteTotal]] : []),
          ...porEstado.map(e => [`Citas ${PLURAL[e.value].toLowerCase()}`, e.n]), ['Citas eliminadas', eliminadas], ...porRed.map(r => [`Red: ${r.red}`, r.n])]
          .map(([k, v]) => ({ k, v })) }],
    },
  })

  const fechaHoy = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long' }).format(hoy)

  return (
    <>
      <header className="in-top">
        <div className="in-top-txt">
          <div className="eyebrow">{fechaHoy}</div>
          <h1 className="in-h1">Hola, <b>{nombre}</b></h1>
          <div style={{ fontSize: 14, color: C.g500, marginTop: 10 }}>{especialidad(clinica?.especialidad).lema}</div>
        </div>
        <div className="in-ctl">
          <SelectorPeriodo valor={periodo} onChange={(p) => setPeriodo({ mes: p.mes === '' ? 0 : p.mes, anio: p.anio })} todosMeses={false} />
          <AgregarAnio />
          {sedes.length > 0 && <FiltroSede valor={sede} onChange={setSede} />}
          <Exportar clinica={nombre} preparar={preparar} />
        </div>
      </header>

      <div className="in-fila1">
        <Panel eyebrow="Resumen" titulo={titulo}>
          <div className="in-kpis">
            <Linea label="Pacientes del mes" valor={fmtNum(nuevos.length)} sub={`${atendidos} ya atendidos · sin canceladas`} pct={pctDe(atendidos, nuevos.length)} />
            <Linea label="Desde redes" valor={fmtNum(deRedes)} sub={pct(deRedes)} pct={pctDe(deRedes, nuevos.length)} />
            <Linea label="Referidos / otros" valor={fmtNum(otros)} sub={pct(otros)} pct={pctDe(otros, nuevos.length)} />
            <Linea label="Citas del mes" valor={fmtNum(citasMes.length)} sub={`${cirugias} cirugías · ${procedimientos} procedimientos`} onClick={() => ir('citas')}>
              <div className="k-barra" role="img" aria-label="Citas del mes por estado">
                {porEstado.filter(e => e.n > 0).map(e => <span key={e.value} title={`${PLURAL[e.value]}: ${e.n}`} style={{ width: `${pctDe(e.n, citasMes.length)}%`, background: COLOR_ESTADO[e.value] }} />)}
              </div>
            </Linea>
          </div>
        </Panel>

        {finanzas ? (
          <div className="in-navy">
            <div>
              <div className="eyebrow">Ventas del mes</div>
              <div className="in-navy-n" style={{ marginTop: 8 }}>{fmtQ(ventasMes)}</div>
              <div className="in-navy-sub" style={{ marginTop: 6 }}>Anual: {fmtQ(ventasAnio)}</div>
            </div>
            <hr />
            <div>
              <div className="eyebrow">Saldo pendiente</div>
              <div className="in-navy-n" style={{ marginTop: 8, fontSize: 'clamp(28px, 2.8vw, 38px)', color: pendienteTotal > 0 ? '#FFB3BF' : '#fff' }}>{fmtQ(pendienteTotal)}</div>
              <div className="in-navy-sub" style={{ marginTop: 6 }}>{vencidos.length} {vencidos.length === 1 ? 'vencido' : 'vencidos'}</div>
            </div>
            <button type="button" className="in-navy-btn" onClick={() => ir('pagos')}>Ver pagos <Icon name="flecha" size={15} /></button>
          </div>
        ) : (
          <div className="in-navy">
            <div>
              <div className="eyebrow">Hoy</div>
              <div className="in-navy-n" style={{ marginTop: 8 }}>{citasHoy.length}</div>
              <div className="in-navy-sub" style={{ marginTop: 6 }}>{citasHoy.length === 1 ? 'cita para hoy' : 'citas para hoy'}</div>
            </div>
            <hr />
            <div>
              <div className="eyebrow">Próxima cita</div>
              {sigCita ? (
                <>
                  <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 300, marginTop: 8, overflowWrap: 'anywhere' }}>{porId[sigCita.paciente_id]?.nombre || '—'}</div>
                  <div className="in-navy-sub" style={{ marginTop: 4 }}>{fechaCorta(sigCita.fecha)} · {fmtHora(sigCita.hora)}</div>
                </>
              ) : <div className="in-navy-sub" style={{ marginTop: 8 }}>No hay citas próximas</div>}
            </div>
            <button type="button" className="in-navy-btn" onClick={() => ir('citas')}>Ver citas <Icon name="flecha" size={15} /></button>
          </div>
        )}
      </div>

      {hosp && (
        <div className="in-fila4">
          <Panel eyebrow="Hospital" titulo="Hoy por especialidad">
            {hoyPorDep.length === 0 ? <div style={{ fontSize: 13.5, color: C.g500 }}>No hay citas hoy con especialidad</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '-6px' }}>
                {hoyPorDep.map(({ d, n }) => (
                  <button type="button" key={d.id} onClick={() => verHoy({ departamento: d.id })} className="in-fila-lista">
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{d.nombre}</span>
                    <span className="in-pildora">{n} {n === 1 ? 'cita' : 'citas'}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
          <Panel eyebrow="Hospital" titulo="Hoy por médico">
            {hoyPorMed.length === 0 ? <div style={{ fontSize: 13.5, color: C.g500 }}>No hay citas hoy con médico asignado</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '-6px' }}>
                {hoyPorMed.map(({ p, n }) => (
                  <button type="button" key={p.id} onClick={() => verHoy({ profesional: p.id })} className="in-fila-lista">
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 10, flexShrink: 0, background: colorProfesional(p, hospital.profesionales.indexOf(p)) }} />
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: C.g500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hospital.departamento(p.departamento_id)?.nombre || 'Sin especialidad'}</span>
                    </span>
                    <span className="in-pildora">{n} {n === 1 ? 'cita' : 'citas'}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      <div style={{ margin: '34px 0 14px' }}>
        <div className="eyebrow">Estado de citas</div>
        <h2 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 300, margin: '4px 0 0', letterSpacing: '-0.02em', color: C.black }}>{esActual ? 'Este mes' : `${MESES[periodo.mes]} ${periodo.anio}`}</h2>
      </div>
      <div className="in-estados">
        {[...porEstado.map(e => ({ ...e, onClick: () => verCitas({ estado: e.value }) })), { value: 'Eliminada', n: eliminadas, onClick: () => verCitas({ eliminadas: true }) }].map(e => (
          <Tocable key={e.value} onClick={e.onClick} label={`${PLURAL[e.value]}: ${e.n}`} className="in-estado lift" style={{ background: PASTEL_ESTADO[e.value] }}>
            <span className="in-estado-flecha" aria-hidden="true"><Icon name="flecha" size={14} style={{ transform: 'rotate(-45deg)' }} /></span>
            <div className="in-estado-n">{e.n}</div>
            <div className="in-estado-l"><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR_ESTADO[e.value], flexShrink: 0 }} />{PLURAL[e.value]}</div>
          </Tocable>
        ))}
      </div>

      <div className="in-fila3">
        <Panel eyebrow="Últimos 6 meses" titulo="Pacientes por mes">
          <div className="in-grafica" role="img" aria-label={`Pacientes por mes: ${seis.map(s => `${MESES[s.mes]} ${s.n}`).join(', ')}`}>
            {seis.map((s, i) => (
              <div key={`${s.anio}-${s.mes}`} className={`in-col${i === 5 ? ' actual' : ''}`}>
                <span className="in-val">{s.n}</span>
                <div className="in-barra" style={{ height: `calc((100% - 34px) * ${s.n / maxMes})`, minHeight: s.n ? 6 : 2 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {seis.map(s => <div key={`${s.anio}-${s.mes}`} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: C.g500, fontWeight: 500 }}>{MESES[s.mes].slice(0, 3)}</div>)}
          </div>
        </Panel>

        <Panel eyebrow="Agenda" titulo="Próximas citas" derecha={<button type="button" onClick={() => ir('citas')} style={{ background: 'none', border: 'none', color: 'var(--acento-fuerte)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>Ver todas</button>}>
          {proximas.length === 0 ? <div style={{ fontSize: 13.5, color: C.g500 }}>No hay citas próximas</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '-6px' }}>
              {proximas.map(c => (
                <button type="button" key={c.id} onClick={() => ir('expedientes', c.paciente_id)} className="in-fila-lista">
                  <Avatar nombre={porId[c.paciente_id]?.nombre} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{porId[c.paciente_id]?.nombre || '—'}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: C.g500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.tipo, c.servicio, nombreSede(sedes, c.sede_id)].filter(Boolean).join(' · ') || 'Consulta'}</span>
                  </span>
                  <span className="in-pildora">{fechaCorta(c.fecha)} · {fmtHora(c.hora)}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <CalendarioInicio citas={citas} pacientes={todosP} onDia={(iso) => ir('calendario', iso)} onAbrir={() => ir('calendario')} />
      </div>

      <div className="in-fila4">
        <Panel eyebrow="Origen" titulo="Pacientes por red social">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {porRed.map(r => (
              <div key={r.red} style={{ display: 'grid', gridTemplateColumns: 'minmax(60px, 92px) minmax(0, 1fr) 30px', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, color: C.g700, fontWeight: 500 }}>{r.red}</span>
                <div className="in-red-barra"><span style={{ width: `${(r.n / maxRed) * 100}%` }} /></div>
                <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 300, color: C.black, textAlign: 'right' }}>{r.n}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: C.g500, marginTop: 18 }}>
            Otros orígenes: {porOrigen.filter(o => o.label !== 'Redes sociales').map(o => `${o.label} ${o.valor}`).join(' · ')}
          </div>
        </Panel>

        {finanzas && (
          <Panel eyebrow="Cobros" titulo="Pagos vencidos" derecha={<span style={{ fontSize: 13, color: C.g500 }}>Saldo total <strong style={{ color: C.black, fontWeight: 600 }}>{fmtQ(pendienteTotal)}</strong></span>}>
            {vencidos.length === 0 ? <div style={{ fontSize: 13.5, color: C.g500 }}>No hay pagos vencidos</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '-6px' }}>
                {vencidos.slice(0, 6).map(c => (
                  <button type="button" key={c.id} onClick={() => ir('expedientes', c.paciente_id)} className="in-fila-lista">
                    <Avatar nombre={porId[c.paciente_id]?.nombre} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{porId[c.paciente_id]?.nombre || '—'}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: C.g500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.concepto} · venció {fmtFecha(c.vence)}</span>
                    </span>
                    <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 300, color: C.red, whiteSpace: 'nowrap' }}>{fmtQ(saldo(c))}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>

      <Panel eyebrow="Registro" titulo="Últimos pacientes" style={{ marginTop: 18 }}>
        <div style={{ overflowX: 'auto', margin: '-6px -8px -4px', padding: '0 8px' }}>
          <table className="in-tabla">
            <thead><tr>{['Nombre', 'Última cita', 'Hora', 'Origen', 'Estado'].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>
              {ultimos.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: C.g500, borderRadius: 18 }}>Aún no hay pacientes registrados</td></tr>
              ) : ultimos.map(({ p, c }) => {
                const e = c ? estadoCita(c.estado) : null
                return (
                  <tr key={p.id} onClick={() => ir('expedientes', p.id)}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontWeight: 600 }}><Avatar nombre={p.nombre} size={34} />{p.nombre}</span></td>
                    <td>{c ? fmtFechaCorta(c.fecha) : '—'}</td>
                    <td>{c ? fmtHora(c.hora) : '—'}</td>
                    <td style={{ color: C.g600 }}>{p.origen === 'redes' && p.red ? p.red : origenLabel(p.origen)}</td>
                    <td>{e ? <Badge color={e.color} bg={e.bg}>{c.estado}</Badge> : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}

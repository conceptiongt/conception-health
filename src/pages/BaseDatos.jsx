import { useState } from 'react'
import { C } from '../lib/theme'
import { ORIGENES, REDES, origenLabel } from '../lib/constantes'
import { fmtQ, fmtFechaCorta, saldo, hoyISO } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Tabla } from '../components/ui/Varios'
import { filtroStyle } from '../components/ui/Campos'
import { Exportar } from '../components/Documento'
import { FiltroSede, nombreSede } from '../components/Filtros'

// Every patient's contact details in one list, exportable to Excel / PDF
export function BaseDatos() {
  const { pacientes, citas, cobros, clinica, ir, sedes } = useDatos()
  const [sede, setSede] = useState('')
  const [buscar, setBuscar] = useState('')
  const [origen, setOrigen] = useState('')
  const [red, setRed] = useState('')
  const [contacto, setContacto] = useState('') // '' | 'telefono' | 'email'

  const hoy = hoyISO()
  const q = buscar.trim().toLowerCase()
  const filas = pacientes
    .filter(p => {
      if (q && ![p.nombre, p.telefono, p.email].some(v => (v || '').toLowerCase().includes(q))) return false
      if (origen && p.origen !== origen) return false
      if (sede && p.sede_id !== sede) return false
      if (red && p.red !== red) return false
      if (contacto === 'telefono' && !p.telefono) return false
      if (contacto === 'email' && !p.email) return false
      return true
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(p => {
      const cs = citas.filter(c => c.paciente_id === p.id)
      return {
        p,
        consultas: cs.length,
        ultima: cs.filter(c => c.fecha <= hoy).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha,
        deuda: cobros.filter(c => c.paciente_id === p.id).reduce((n, c) => n + saldo(c), 0),
      }
    })

  const origenTexto = (p) => p.origen === 'redes' && p.red ? `Redes (${p.red})` : origenLabel(p.origen)
  const preparar = () => ({
    titulo: 'Pacientes',
    subtitulo: `${filas.length} pacientes`,
    secciones: [{ tabla: {
      headers: ['Nombre', 'Teléfono', 'Correo', ...(sedes.length ? ['Sede'] : []), 'Origen', 'Registrado', 'Consultas'],
      filas: filas.map(f => [f.p.nombre, f.p.telefono || '—', f.p.email || '—', ...(sedes.length ? [nombreSede(sedes, f.p.sede_id) || '—'] : []), origenTexto(f.p), fmtFechaCorta(f.p.created_at), f.consultas]),
    } }],
    excel: { archivo: 'pacientes', hojas: [{ nombre: 'Pacientes', columnas: [
      { header: 'Nombre', key: 'n', width: 32 }, { header: 'Teléfono', key: 't', width: 15 }, { header: 'Correo', key: 'e', width: 30 },
      { header: 'Origen', key: 'o', width: 16 }, { header: 'Red social', key: 'r', width: 12 }, { header: 'Referido por', key: 'ref', width: 22 },
      { header: 'Registrado', key: 'reg', width: 12 }, { header: 'Consultas', key: 'c', width: 10 }, { header: 'Última cita', key: 'u', width: 12 },
      { header: 'Saldo pendiente', key: 's', width: 15, moneda: true }, { header: 'Contacto de emergencia', key: 'ce', width: 24 }, { header: 'Tel. emergencia', key: 'te', width: 15 },
    ], filas: filas.map(f => ({
      n: f.p.nombre, t: f.p.telefono, e: f.p.email, o: origenLabel(f.p.origen), r: f.p.red, ref: f.p.referido_por,
      reg: f.p.created_at.slice(0, 10), c: f.consultas, u: f.ultima, s: f.deuda, ce: f.p.contacto_emergencia, te: f.p.telefono_emergencia,
    })) }] },
  })

  return (
    <>
      <Encabezado titulo="Pacientes" subtitulo={`${filas.length} de ${pacientes.length} pacientes · toque uno para abrir su expediente`}>
        <Exportar clinica={clinica?.nombre} preparar={preparar} />
      </Encabezado>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar nombre, teléfono o correo…" style={{ ...filtroStyle, flex: '1 1 260px' }} />
        <select value={origen} onChange={e => setOrigen(e.target.value)} style={filtroStyle}><option value="">Todo origen</option>{ORIGENES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select value={red} onChange={e => setRed(e.target.value)} style={filtroStyle}><option value="">Toda red social</option>{REDES.map(r => <option key={r}>{r}</option>)}</select>
        <select value={contacto} onChange={e => setContacto(e.target.value)} style={filtroStyle}>
          <option value="">Con o sin contacto</option><option value="telefono">Con teléfono</option><option value="email">Con correo</option>
        </select>
      </div>
      <div style={{ marginBottom: 14, marginTop: -4 }}><FiltroSede valor={sede} onChange={setSede} contar={(id) => pacientes.filter(p => !id || p.sede_id === id).length} /></div>
      <Tabla
        columnas={['Nombre', 'Teléfono', 'Correo', ...(sedes.length ? ['Sede'] : []), 'Origen', 'Registrado', 'Consultas', 'Saldo']}
        vacio={pacientes.length ? 'Ningún paciente coincide con los filtros' : 'Aún no hay pacientes registrados'}
        onFila={(f) => ir('expedientes', f.key)}
        filas={filas.map(f => ({ key: f.p.id, celdas: [
          <span style={{ fontWeight: 500 }}>{f.p.nombre}</span>,
          f.p.telefono ? <a href={`tel:${f.p.telefono}`} onClick={e => e.stopPropagation()} style={{ color: C.black }}>{f.p.telefono}</a> : <span style={{ color: C.g300 }}>—</span>,
          f.p.email ? <a href={`mailto:${f.p.email}`} onClick={e => e.stopPropagation()} style={{ color: C.purple }}>{f.p.email}</a> : <span style={{ color: C.g300 }}>—</span>,
          ...(sedes.length ? [nombreSede(sedes, f.p.sede_id) || <span style={{ color: C.g300 }}>—</span>] : []),
          origenTexto(f.p), fmtFechaCorta(f.p.created_at), f.consultas,
          f.deuda > 0 ? <span style={{ color: C.red, fontWeight: 500 }}>{fmtQ(f.deuda)}</span> : <span style={{ color: C.g400 }}>Q0.00</span>,
        ] }))}
      />
    </>
  )
}

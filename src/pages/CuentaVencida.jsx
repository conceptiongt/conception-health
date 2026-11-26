import { supabase } from '../lib/supabase'
import { C, SERIF, SHADOW, GLASS } from '../lib/theme'
import { fmtFechaLocal } from '../lib/formato'
import { esAdmin, esSoporte, puede } from '../lib/permisos'
import { urlLogo, iniciales } from '../lib/marca'
import { limpiarGoogle } from '../lib/google'
import { useDatos } from '../hooks/useDatos'
import { useInventario } from '../hooks/useInventario'
import { Logo } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { Exportar } from '../components/Documento'
import { EliminarCuenta } from '../components/EliminarCuenta'
import { Planes } from './Suscripcion'
import {
  prepararPacientes, prepararCitas, prepararExpedientes, prepararPagos, prepararInventario, prepararFinanzas,
  cobrosOrdenados, listaInventario, cargarMovimientos, cargarFinanzas, calcularFinanzas,
} from '../lib/exportar'

const TODO = { mes: '', anio: '', desde: '', hasta: '' }

// Screen of an expired account (read-only): the only things left are downloading the data, activating a plan or deleting the account.
// It replaces the whole app, so nothing here writes to the clinic's data.
export function CuentaVencida({ errorDatos, onReintentar } = {}) {
  const { clinica, perfil, pacientes, citas, cobros, servicios, sedes } = useDatos()
  const admin = esAdmin(perfil)
  const logo = urlLogo(clinica)
  const nombre = clinica?.nombre || perfil.nombre
  // the end date: the free period (invitation code) or the paid plan
  const fin = clinica?.promo_hasta && !clinica.recurrente_suscripcion_id ? clinica.promo_hasta : clinica?.plan_hasta
  const eraPromo = !!clinica?.promo_hasta && !clinica.recurrente_suscripcion_id
  const fecha = fin ? fmtFechaLocal(fin) : null

  // clinics that never used inventory do not get that row
  const { inv } = useInventario()
  const conInventario = puede(perfil, 'inventario') && !!inv?.productos?.length

  const porId = Object.fromEntries(pacientes.map(p => [p.id, p]))
  const filas = [
    { clave: 'pacientes', titulo: 'Pacientes', texto: `${pacientes.length} ${pacientes.length === 1 ? 'paciente' : 'pacientes'} con sus datos de contacto y antecedentes`,
      preparar: () => prepararPacientes({ lista: [...pacientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), citas, cobros, finanzas: puede(perfil, 'finanzas'), filtroTexto: `${pacientes.length} pacientes`, atencion: '' }) },
    { clave: 'citas', titulo: 'Citas', texto: `${citas.length} ${citas.length === 1 ? 'cita' : 'citas'} de todas las fechas`,
      preparar: () => prepararCitas({ visibles: citas.filter(c => porId[c.paciente_id]).sort((a, b) => (b.fecha + (b.hora || '')).localeCompare(a.fecha + (a.hora || ''))), porId, sedes, filtroTexto: 'Todas las citas' }) },
    puede(perfil, 'expedientes') && { clave: 'expedientes', titulo: 'Expedientes clínicos', texto: 'Consultas y notas clínicas de cada paciente (las fotos y archivos no se incluyen)',
      preparar: () => prepararExpedientes({ pacientes, citas, clinica }) },
    puede(perfil, 'finanzas') && { clave: 'pagos', titulo: 'Pagos y saldos', texto: 'Cobros, pagos recibidos y saldos de cada paciente',
      preparar: () => prepararPagos({ lista: cobrosOrdenados(cobros, porId), pacientes, citas, servicios, sedes, filtroTexto: 'Todas las fechas' }) },
    conInventario && { clave: 'inventario', titulo: 'Inventario', texto: 'Productos, existencias por sede y movimientos',
      preparar: async () => prepararInventario({ inv, ...listaInventario(inv), sedeFiltro: '', costos: puede(perfil, 'costos'), movimientos: await cargarMovimientos() }) },
    admin && { clave: 'finanzas', titulo: 'Finanzas', texto: 'Ingresos, gastos y utilidad de todo el historial',
      preparar: async () => prepararFinanzas({ ...calcularFinanzas({ cobros, citas, pacientes, d: await cargarFinanzas(), sede: '', periodo: TODO }), titulo: 'Todo el historial', clinica, sedes }) },
  ].filter(Boolean)

  const salir = () => { limpiarGoogle(); supabase.auth.signOut() }
  const tarjeta = { ...GLASS, borderRadius: 24, padding: 'clamp(18px, 3vw, 28px)', boxShadow: SHADOW }
  const titulo = (t, sub) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: C.black, letterSpacing: '-0.015em' }}>{t}</div>
      {sub && <div style={{ fontSize: 13.5, color: C.g500, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', width: '100%', overflowX: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px clamp(14px, 3vw, 40px)' }}>
        <span style={{ background: '#fff', borderRadius: 14, padding: '6px 10px', display: 'flex', alignItems: 'center', flexShrink: 0, boxShadow: '0 4px 14px rgba(31,72,160,0.10)' }}>
          {logo ? <img src={logo} alt={`Logo de ${nombre}`} style={{ height: 30, maxWidth: 140, objectFit: 'contain' }} /> : <Logo variant="dark" height={28} />}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div style={{ width: 34, height: 34, borderRadius: 17, background: C.grad, color: C.onPurple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{iniciales(nombre)}</div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</div>
        </div>
        <Button variant="ghost" size="sm" icon="salir" onClick={salir}>Cerrar sesión</Button>
      </header>

      <main style={{ maxWidth: 940, margin: '0 auto', padding: '8px clamp(14px, 3vw, 40px) 64px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <section style={tarjeta}>
          <div style={{ width: 50, height: 50, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon name="candado" size={24} /></div>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 700, color: C.black, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Su período terminó</h1>
          <p style={{ fontSize: 15, color: C.g600, lineHeight: 1.65, margin: 0, maxWidth: 640 }}>
            {fecha ? (eraPromo ? `Su prueba gratis terminó el ${fecha}. ` : `Su suscripción terminó el ${fecha}. `) : (eraPromo ? 'Su prueba gratis terminó. ' : 'Su suscripción terminó. ')}
            Sus datos siguen guardados. Puede descargarlos, activar un plan para seguir usando la plataforma o eliminar su cuenta.
          </p>
        </section>

        <section style={tarjeta}>
          {titulo('Activar un plan', admin ? 'Al activar su plan la plataforma vuelve a funcionar completa, con todos sus datos.' : null)}
          {admin ? <Planes /> : <div style={{ fontSize: 14.5, color: C.g600, lineHeight: 1.6 }}>Pídale al dueño de la cuenta que active un plan.</div>}
        </section>

        <section style={tarjeta}>
          {titulo('Descargar mis datos', 'Elija el archivo que necesita: Excel para abrirlo en una hoja de cálculo, PDF para guardarlo o compartirlo.')}
          {errorDatos
            ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 14, color: C.red, lineHeight: 1.6 }}>
                <span style={{ flex: 1, minWidth: 220 }}>No se pudieron cargar los datos para descargar. Intente de nuevo.</span>
                <Button variant="ghost" size="sm" onClick={onReintentar}>Reintentar</Button>
              </div>
            )
            : !puede(perfil, 'exportar')
            ? <div style={{ fontSize: 14, color: C.g600, lineHeight: 1.6 }}>Su usuario no tiene permiso para descargar. Pídaselo al dueño de la cuenta.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filas.map((f, i) => (
                  <div key={f.clave} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '14px 0', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.black }}>{f.titulo}</div>
                      <div style={{ fontSize: 13, color: C.g500, marginTop: 2, lineHeight: 1.45 }}>{f.texto}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}><Exportar clinica={clinica?.nombre} preparar={f.preparar} compacto size="md" /></div>
                  </div>
                ))}
              </div>
            )}
        </section>

        {!esSoporte(perfil) && <EliminarCuenta />}
      </main>
    </div>
  )
}

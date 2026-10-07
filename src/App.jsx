import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { C, SERIF, SHADOW } from './lib/theme'
import { LIMITE_PRUEBA, LIA_DISPONIBLE, accesos, nombrePlan } from './lib/constantes'
import { useSesion } from './hooks/useSesion'
import { DatosContext, useCargarDatos } from './hooks/useDatos'
import { Acceso, CrearPassword } from './pages/Acceso'
import { Inicio } from './pages/Inicio'
import { Registrar } from './pages/Registrar'
import { Citas } from './pages/Citas'
import { Expedientes } from './pages/Expedientes'
import { Suscripcion } from './pages/Suscripcion'
import { Configuracion } from './pages/Configuracion'
import { BaseDatos } from './pages/BaseDatos'
import { Lia } from './pages/Lia'
import { Inventario } from './pages/Inventario'
import { Pagos } from './pages/Pagos'
import { urlLogo, iniciales } from './lib/marca'
import { aplicarMarca } from './lib/theme'
import { usePendientesLia } from './hooks/useLia'
import { ToastContainer } from './components/ui/Toast'
import { Cargando, Logo } from './components/ui/Varios'
import { Icon } from './components/ui/Icon'
import { estadoVinculo, sincronizar } from './lib/studio'
import { Button } from './components/ui/Button'

const NAV = [
  { id: 'inicio', label: 'Inicio', icono: 'inicio' },
  { id: 'registrar', label: 'Registrar paciente', icono: 'registrar' },
  { id: 'citas', label: 'Citas', icono: 'citas' },
  { id: 'expedientes', label: 'Expedientes', icono: 'expedientes' },
  { id: 'pagos', label: 'Pagos y saldos', icono: 'cartera' },
  { id: 'basedatos', label: 'Base de datos', icono: 'basedatos' },
  { id: 'inventario', label: 'Inventario', icono: 'caja' },
]
const NAV_LIA = [
  { id: 'lia', label: 'Lía', icono: 'lia' },
]
// Pages that belong to Conception Health (the "Lía" plan only includes the receptionist and the appointments)
const SOLO_HEALTH = ['inicio', 'registrar', 'expedientes', 'pagos', 'basedatos', 'inventario']
const NAV_CUENTA = [
  { id: 'suscripcion', label: 'Suscripción', icono: 'suscripcion' },
  { id: 'configuracion', label: 'Configuración', icono: 'ajustes' },
]


export default function App() {
  const s = useSesion()
  let contenido
  if (s.cargando) contenido = <div style={{ minHeight: '100vh' }}><Cargando /></div>
  else if (!s.session) contenido = <Acceso />
  else if (s.recuperando || !s.perfil?.password_creada) {
    contenido = <CrearPassword perfil={s.perfil} onListo={() => { s.setRecuperando(false); s.recargar() }} />
  } else contenido = <Aplicacion sesion={s} />
  return <>{contenido}<ToastContainer /></>
}

function Aplicacion({ sesion }) {
  const { perfil, clinica, planActivo, recargar: recargarSesion } = sesion
  const { datos, error, recargar } = useCargarDatos(perfil.clinica_id)
  const acc = accesos(clinica, planActivo)
  const [vista, setVista] = useState(() => acc.health || !LIA_DISPONIBLE ? 'inicio' : 'lia')
  const pendientesLia = usePendientesLia(acc.lia)
  const [menu, setMenu] = useState(false)
  const [expedienteId, setExpedienteId] = useState(null)

  useEffect(() => { aplicarMarca(clinica?.color) }, [clinica?.color])

  // Conception Studio link: refresh its status and send this clinic's monthly totals when data changes
  const syncTimer = useRef(null)
  useEffect(() => {
    if (!datos || !clinica?.studio_clave || !['pendiente', 'aprobado'].includes(clinica.studio_estado)) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(async () => {
      const e = await estadoVinculo(clinica.studio_clave)
      if (!e) return
      if (e.estado !== clinica.studio_estado) {
        await supabase.from('clinicas').update({ studio_estado: e.estado }).eq('id', clinica.id)
        recargarSesion()
      }
      if (e.estado === 'aprobado') await sincronizar(clinica, datos)
    }, 2000)
    return () => clearTimeout(syncTimer.current)
  }, [datos, clinica, recargarSesion])

  const ir = (v, extra) => {
    setVista(v); setMenu(false)
    setExpedienteId(v === 'expedientes' ? extra ?? null : null)
    window.scrollTo(0, 0)
  }

  const ctx = { ...(datos || { pacientes: [], citas: [], cobros: [], servicios: [], sedes: [] }), recargar, perfil, clinica, planActivo, acc, ir, recargarSesion }
  const enPrueba = !planActivo
  const usados = datos?.pacientes.length ?? 0

  const plan = planActivo ? `Plan ${nombrePlan(clinica?.plan) || 'activo'}` : 'Versión de prueba'

  const logo = urlLogo(clinica)
  const nombreClinica = clinica?.nombre || perfil.nombre
  const grupos = [['', NAV.filter(n => n.id !== 'inventario' || acc.inventario || !planActivo || true)], ['Recepcionista', NAV_LIA], ['Cuenta', NAV_CUENTA]]

  return (
    <DatosContext.Provider value={ctx}>
      <div className="layout">
        <div className="topbar">
          <button onClick={() => setMenu(true)} aria-label="Menú" style={{ background: 'none', border: 'none', color: C.black, cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="menu" size={22} /></button>
          {logo ? <img src={logo} alt="" style={{ height: 28, maxWidth: 140, objectFit: 'contain' }} /> : <strong style={{ fontWeight: 500 }}>{nombreClinica}</strong>}
        </div>
        {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,28,30,0.32)', zIndex: 140 }} />}

        <aside className={`sidebar${menu ? ' abierta' : ''}`}>
          <div style={{ padding: '22px 18px 16px', display: 'flex', alignItems: 'center', gap: 11, borderBottom: `1px solid ${C.line}` }}>
            {logo
              ? <img src={logo} alt="" style={{ width: 38, height: 38, borderRadius: 9, objectFit: 'contain', background: '#fff', border: `1px solid ${C.line}`, flexShrink: 0 }} />
              : <div style={{ width: 38, height: 38, borderRadius: 9, background: C.purple, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{iniciales(nombreClinica)}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.black, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{nombreClinica}</div>
              <div style={{ color: planActivo ? C.g500 : C.amber, fontSize: 12 }}>{plan}</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
            {grupos.map(([titulo, items]) => (
              <div key={titulo || 'menu'} style={{ marginBottom: 14 }}>
                {titulo && <div style={{ padding: '6px 12px 6px', color: C.g400, fontSize: 12 }}>{titulo}</div>}
                <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {items.map(n => {
                    const activo = vista === n.id
                    const bloqueado = (!acc.health && SOLO_HEALTH.includes(n.id)) || (n.id === 'inventario' && !acc.inventario)
                    return (
                      <button key={n.id} className="nav-item" onClick={() => ir(n.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 11, padding: '8px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                        textAlign: 'left', fontSize: 13.5, fontWeight: activo ? 500 : 400, fontFamily: 'inherit',
                        background: activo ? C.sidebarActive : 'none', color: activo ? C.black : C.g600,
                      }}>
                        <Icon name={n.icono} size={17} style={{ color: activo ? C.purple : C.g400 }} />{n.label}
                        {bloqueado && <Icon name="candado" size={13} style={{ marginLeft: 'auto', color: C.g300 }} />}
                        {n.id === 'lia' && !LIA_DISPONIBLE && <span style={{ marginLeft: 'auto', padding: '1px 7px', borderRadius: 4, background: C.g100, color: C.g500, fontSize: 11 }}>Pronto</span>}
                        {n.id === 'lia' && pendientesLia > 0 && <span style={{ marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: C.red, color: '#fff', fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{pendientesLia}</span>}
                      </button>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0, color: C.g500, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{perfil.email}</div>
            <button onClick={() => supabase.auth.signOut()} title="Cerrar sesión" aria-label="Cerrar sesión" className="btn-ghost" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', color: C.g500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="salir" size={16} />
            </button>
          </div>
          <div style={{ padding: '0 16px 14px', fontSize: 11, color: C.g300 }}>Conception Health</div>
        </aside>

        <main className="main">
          {enPrueba && (
            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.amber}`, borderRadius: 10, padding: '12px 16px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220, fontSize: 13.5 }}>
                <strong style={{ fontWeight: 500 }}>Versión de prueba</strong> <span style={{ color: C.g500 }}>· {usados} de {LIMITE_PRUEBA} pacientes. Active su suscripción para registrar pacientes ilimitados.</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => ir('suscripcion')}>Ver planes</Button>
            </div>
          )}
          {error ? <div style={{ color: C.red, padding: 30 }}>No se pudieron cargar los datos: {error}</div>
            : !datos ? <Cargando />
            : !acc.health && SOLO_HEALTH.includes(vista) ? <SoloHealth ir={ir} />
            : vista === 'lia' ? (LIA_DISPONIBLE ? <Lia /> : <LiaProximamente />)
            : vista === 'inventario' ? (acc.inventario ? <Inventario /> : <SoloMax ir={ir} />)
            : vista === 'inicio' ? <Inicio />
            : vista === 'registrar' ? <Registrar />
            : vista === 'citas' ? <Citas />
            : vista === 'expedientes' ? <Expedientes abrirId={expedienteId} />
            : vista === 'pagos' ? <Pagos />
            : vista === 'basedatos' ? <BaseDatos />
            : vista === 'configuracion' ? <Configuracion />
            : <Suscripcion />}
        </main>
      </div>
    </DatosContext.Provider>
  )
}


// Shown to "Lía" plan accounts when they open a Conception Health page
function SoloHealth({ ir }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', boxShadow: SHADOW }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="candado" size={26} /></div>
      <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: C.black, marginBottom: 6 }}>Esta sección es parte de Conception Health</div>
      <div style={{ fontSize: 14, color: C.g500, maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.6 }}>
        Su plan incluye a Lía y la agenda de citas. Con el plan Ultra también tiene expedientes con fotos, cobros, inventario, base de datos y reportes, y cada paciente que agenda Lía llega con su expediente.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={() => ir('lia')}>Ir a Lía</Button>
        <Button variant="brand" icon="suscripcion" onClick={() => ir('suscripcion')}>Ver planes</Button>
      </div>
    </div>
  )
}

// Lía is being finished on its own; shown instead of the receptionist until it is ready
function LiaProximamente() {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '56px 24px', textAlign: 'center', boxShadow: SHADOW }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="lia" size={26} /></div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, letterSpacing: '0.16em', marginBottom: 6 }}>PRÓXIMAMENTE</div>
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.black, marginBottom: 8 }}>Estamos trabajando en Lía</div>
      <div style={{ fontSize: 14, color: C.g500, maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
        Su recepcionista virtual en WhatsApp: contestará, agendará y recordará citas por usted. Le avisaremos en cuanto esté disponible.
      </div>
    </div>
  )
}

// Shown to accounts whose plan does not include inventory
function SoloMax({ ir }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', boxShadow: SHADOW }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="caja" size={26} /></div>
      <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: C.black, marginBottom: 6 }}>Inventario por sede</div>
      <div style={{ fontSize: 14, color: C.g500, maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.6 }}>
        Lleve el inventario de cada sede (de ciudad o departamental), descargue los productos desde el expediente de cada paciente y reciba avisos de existencia baja. Está incluido en los planes Max y Ultra.
      </div>
      <Button variant="brand" icon="suscripcion" onClick={() => ir('suscripcion')}>Ver planes</Button>
    </div>
  )
}

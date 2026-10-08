import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { C, SERIF, SHADOW } from './lib/theme'
import { LIMITE_PRUEBA, liaVisible, accesos, nombrePlan } from './lib/constantes'
import { useSesion } from './hooks/useSesion'
import { DatosContext, useCargarDatos } from './hooks/useDatos'
import { Acceso, CrearPassword } from './pages/Acceso'
import { Inicio } from './pages/Inicio'
import { Registrar } from './pages/Registrar'
import { Citas } from './pages/Citas'
import { Expedientes } from './pages/Expedientes'
import { Suscripcion } from './pages/Suscripcion'
import { Configuracion } from './pages/Configuracion'
import { Lia } from './pages/Lia'
import { Inventario } from './pages/Inventario'
import { Pagos } from './pages/Pagos'
import { urlLogo, iniciales } from './lib/marca'
import { especialidad } from './lib/especialidades'
import { cargarSugeridos } from './lib/sugeridos'
import { ElegirEspecialidad } from './components/ElegirEspecialidad'
import { aplicarMarca } from './lib/theme'
import { usePendientesLia } from './hooks/useLia'
import { ToastContainer } from './components/ui/Toast'
import { Cargando, Logo } from './components/ui/Varios'
import { Icon } from './components/ui/Icon'
import { estadoVinculo, sincronizar } from './lib/studio'
import { Button } from './components/ui/Button'
import { esAdmin, puede } from './lib/permisos'
import { PaginaPublica, rutaPublica } from './pages/Publico'

const NAV = [
  { id: 'inicio', label: 'Inicio', icono: 'inicio' },
  { id: 'registrar', label: 'Registrar paciente', icono: 'registrar' },
  { id: 'citas', label: 'Citas', icono: 'citas' },
  { id: 'expedientes', label: 'Expedientes', icono: 'expedientes' },
  { id: 'pagos', label: 'Pagos y saldos', icono: 'cartera', permiso: 'finanzas' },
  { id: 'inventario', label: 'Inventario', icono: 'caja', permiso: 'inventario' },
]
const NAV_LIA = [
  { id: 'lia', label: 'Lía', icono: 'lia' },
]
// Pages that belong to Conception Health (the "Lía" plan only includes the receptionist and the appointments)
const SOLO_HEALTH = ['inicio', 'registrar', 'expedientes', 'pagos', 'inventario']
const NAV_CUENTA = [
  { id: 'suscripcion', label: 'Suscripción', icono: 'suscripcion', soloAdmin: true },
  { id: 'configuracion', label: 'Configuración', icono: 'ajustes', permiso: 'configuracion' },
]
// what each user can open (the administrator decides for assistants in Configuración)
const permitido = (perfil, n) => (!n.soloAdmin || esAdmin(perfil)) && (!n.permiso || puede(perfil, n.permiso))
const TODAS = [...NAV, ...NAV_LIA, ...NAV_CUENTA]


export default function App() {
  const publica = rutaPublica()
  if (publica) return <><PaginaPublica {...publica} /><ToastContainer /></>
  return <AppPrivada />
}

function AppPrivada() {
  const s = useSesion()
  let contenido
  if (s.cargando) contenido = <div style={{ minHeight: '100vh' }}><Cargando /></div>
  else if (!s.session) contenido = <Acceso />
  else if (!s.perfil) contenido = <SinAcceso />
  else if (s.recuperando || !s.perfil?.password_creada) {
    contenido = <CrearPassword perfil={s.perfil} onListo={() => { s.setRecuperando(false); s.recargar() }} />
  } else contenido = <Aplicacion sesion={s} />
  return <>{contenido}<ToastContainer /></>
}

function Aplicacion({ sesion }) {
  const { perfil, clinica, planActivo, recargar: recargarSesion } = sesion
  const { datos, error, recargar } = useCargarDatos(perfil.clinica_id)
  const acc = accesos(clinica, planActivo)
  const [vista, setVista] = useState(() => acc.health || !liaVisible(clinica) ? 'inicio' : 'lia')
  const pendientesLia = usePendientesLia(acc.lia)
  const [menu, setMenu] = useState(false)
  const [expedienteId, setExpedienteId] = useState(null)

  useEffect(() => { aplicarMarca(clinica?.color) }, [clinica?.color])

  // first entry with a specialty: fill Tarifas with its suggested services (once)
  const sugiriendo = useRef(false)
  useEffect(() => {
    if (!datos || !puede(perfil, 'configuracion') || !clinica?.especialidad || clinica.sugeridos_cargados || sugiriendo.current) return
    sugiriendo.current = true
    cargarSugeridos(clinica, datos.servicios).then(() => { recargar(); recargarSesion() })
  }, [datos, clinica, recargar, recargarSesion])
  const [sinEspecialidad, setSinEspecialidad] = useState(true)

  // Conception Studio link: refresh its status and send this clinic's monthly totals when data changes
  const syncTimer = useRef(null)
  useEffect(() => {
    if (!datos || !esAdmin(perfil) || !clinica?.studio_clave || !['pendiente', 'aprobado'].includes(clinica.studio_estado)) return
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

  const plan = (esAdmin(perfil) ? '' : `${perfil.nombre} · asistente · `) + (planActivo ? `Plan ${nombrePlan(clinica?.plan) || 'activo'}` : 'Versión de prueba')

  const logo = urlLogo(clinica)
  const nombreClinica = clinica?.nombre || perfil.nombre
  const grupos = [['', NAV.filter(n => n.id !== 'inventario' || acc.inventario || !planActivo || true)], ['Recepcionista', NAV_LIA], ['Cuenta', NAV_CUENTA]]

  return (
    <DatosContext.Provider value={ctx}>
      <div className="layout">
        <div className="topbar">
          <button onClick={() => setMenu(true)} aria-label="Menú" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="menu" size={22} /></button>
          <span style={{ background: '#fff', borderRadius: 10, padding: '5px 9px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {logo ? <img src={logo} alt={`Logo de ${nombreClinica}`} style={{ height: 26, maxWidth: 120, objectFit: 'contain' }} /> : <Logo variant="dark" height={24} />}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', lineHeight: 1.25, minWidth: 0 }}>CONCEPTION<br />HEALTH</span>
        </div>
        {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,17,32,0.45)', zIndex: 140 }} />}

        <aside className={`sidebar${menu ? ' abierta' : ''}`}>
          <div style={{ padding: '22px 18px 18px' }}>
            <div style={{ background: '#fff', borderRadius: 18, padding: '16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 92, boxShadow: '0 6px 20px rgba(0,0,0,0.10)' }}>
              {logo ? <img src={logo} alt={`Logo de ${nombreClinica}`} style={{ maxHeight: 64, maxWidth: '100%', objectFit: 'contain', display: 'block' }} /> : <Logo variant="dark" height={46} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ height: 3, width: 22, borderRadius: 3, background: C.prism }} />
              <span style={{ color: 'var(--menu-texto)', fontSize: 11, fontWeight: 600, letterSpacing: '0.24em' }}>CONCEPTION HEALTH</span>
            </div>
          </div>

          <div style={{ margin: '0 16px 18px', padding: 12, borderRadius: 16, background: 'var(--menu-tarjeta)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: '#fff', color: C.purpleDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
              {iniciales(nombreClinica)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--menu-texto)', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreClinica}</div>
              <div style={{ color: 'var(--menu-suave)', fontSize: 12, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: planActivo ? '#5BE08F' : '#FFC94D', boxShadow: '0 0 0 2px rgba(255,255,255,0.5)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan}</span>
              </div>
              {clinica?.especialidad && <div style={{ color: 'var(--menu-suave)', fontSize: 11.5, marginTop: 2, lineHeight: 1.3 }}>{especialidad(clinica.especialidad).label}</div>}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {[['MENÚ', NAV], ['RECEPCIONISTA', NAV_LIA], ['CUENTA', NAV_CUENTA]].filter(([, items]) => items.some(n => permitido(perfil, n))).map(([titulo, items]) => (
              <div key={titulo} style={{ marginBottom: 18 }}>
                <div style={{ padding: '0 26px 8px', color: 'var(--menu-titulo)', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em' }}>{titulo}</div>
                <nav style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {items.filter(n => permitido(perfil, n)).map(n => {
                    const activo = vista === n.id
                    return (
                      <button key={n.id} className="nav-item" onClick={() => ir(n.id)} style={{
                        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        textAlign: 'left', fontSize: 14, fontWeight: activo ? 600 : 400, letterSpacing: '-0.01em', fontFamily: 'inherit',
                        background: activo ? 'var(--menu-activo)' : 'none', color: activo ? 'var(--menu-texto)' : 'var(--menu-suave)',
                      }}>
                        <Icon name={n.icono} size={18} style={{ opacity: activo ? 1 : 0.8 }} />{n.label}
                        {((!acc.health && SOLO_HEALTH.includes(n.id)) || (n.id === 'inventario' && !acc.inventario)) && <Icon name="candado" size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                        {n.id === 'lia' && !liaVisible(clinica) && <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 10, background: C.peach, color: C.orange, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em' }}>PRONTO</span>}
                        {n.id === 'lia' && pendientesLia > 0 && <span title="Conversaciones que le necesitan" style={{ marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: C.red, color: '#fff', fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{pendientesLia}</span>}
                      </button>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>

          <div style={{ margin: 16, padding: '12px 14px', borderRadius: 16, border: '1px solid var(--menu-linea)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--menu-titulo)', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em' }}>SESIÓN</div>
              <div style={{ color: 'var(--menu-suave)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{perfil.email}</div>
            </div>
            <button onClick={() => supabase.auth.signOut()} title="Cerrar sesión" aria-label="Cerrar sesión" style={{ width: 34, height: 34, borderRadius: 17, border: `1px solid ${C.g200}`, background: '#fff', color: C.g500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="salir" size={16} />
            </button>
          </div>
        </aside>

        <main className="main">
          {datos && clinica && esAdmin(perfil) && !clinica.especialidad && sinEspecialidad && <ElegirEspecialidad clinica={clinica} onListo={() => { setSinEspecialidad(false); recargarSesion() }} onDespues={() => setSinEspecialidad(false)} />}
          {enPrueba && (
            <div style={{ background: C.lavender, borderRadius: 24, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 38, height: 38, borderRadius: 19, background: '#fff', color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="estrella" size={18} /></div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Versión de prueba · {usados} de {LIMITE_PRUEBA} pacientes</div>
                <div style={{ fontSize: 13, color: C.g500 }}>Active su suscripción para registrar pacientes ilimitados.</div>
              </div>
              {esAdmin(perfil) && <Button variant="brand" size="sm" onClick={() => ir('suscripcion')}>Ver planes</Button>}
            </div>
          )}
          {error ? <div style={{ color: C.red, padding: 30 }}>No se pudieron cargar los datos: {error}</div>
            : !datos ? <Cargando />
            : TODAS.some(n => n.id === vista && !permitido(perfil, n)) ? <SinPermiso />
            : !acc.health && SOLO_HEALTH.includes(vista) ? <SoloHealth ir={ir} />
            : vista === 'lia' ? (liaVisible(clinica) ? <Lia /> : <LiaProximamente />)
            : vista === 'inventario' ? (acc.inventario ? <Inventario /> : <SoloMax ir={ir} />)
            : vista === 'inicio' ? <Inicio />
            : vista === 'registrar' ? <Registrar />
            : vista === 'citas' ? <Citas />
            : vista === 'expedientes' ? <Expedientes abrirId={expedienteId} />
            : vista === 'pagos' ? <Pagos />
            : vista === 'configuracion' ? <Configuracion />
            : <Suscripcion />}
        </main>
      </div>
    </DatosContext.Provider>
  )
}


// An assistant opening a page the administrator has not allowed
function SinPermiso() {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: '48px 24px', textAlign: 'center', boxShadow: SHADOW }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="candado" size={26} /></div>
      <div style={{ fontSize: 20, fontWeight: 600, color: C.black, marginBottom: 6 }}>Esta sección necesita permiso</div>
      <div style={{ fontSize: 14, color: C.g500, maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>Pida al administrador de su clínica que se la habilite en Configuración → Usuarios y permisos.</div>
    </div>
  )
}

// The account exists but is not linked to a clinic (e.g. the administrator removed the user)
function SinAcceso() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: C.bgApp }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: '36px 28px', maxWidth: 420, textAlign: 'center', boxShadow: SHADOW }}>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Su usuario no tiene acceso</div>
        <div style={{ fontSize: 14, color: C.g500, lineHeight: 1.6, marginBottom: 18 }}>Este correo no está vinculado a ninguna clínica. Si trabaja en un consultorio, pida al administrador que le invite de nuevo.</div>
        <Button variant="ghost" icon="salir" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
      </div>
    </div>
  )
}

// Shown to "Lía" plan accounts when they open a Conception Health page
function SoloHealth({ ir }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: '48px 24px', textAlign: 'center', boxShadow: SHADOW }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="candado" size={26} /></div>
      <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: C.black, marginBottom: 6 }}>Esta sección es parte de Conception Health</div>
      <div style={{ fontSize: 14, color: C.g500, maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.6 }}>
        Su plan incluye a Lía y la agenda de citas. Con el plan Ultra también tiene expedientes con fotos, cobros, inventario y reportes, y cada paciente que agenda Lía llega con su expediente.
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
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: '56px 24px', textAlign: 'center', boxShadow: SHADOW }}>
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
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 24, padding: '48px 24px', textAlign: 'center', boxShadow: SHADOW }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleMid, color: C.purple, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name="caja" size={26} /></div>
      <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: C.black, marginBottom: 6 }}>Inventario por sede</div>
      <div style={{ fontSize: 14, color: C.g500, maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.6 }}>
        Lleve el inventario de cada sede (de ciudad o departamental), descargue los productos desde el expediente de cada paciente y reciba avisos de existencia baja. Está incluido en los planes Max y Ultra.
      </div>
      <Button variant="brand" icon="suscripcion" onClick={() => ir('suscripcion')}>Ver planes</Button>
    </div>
  )
}

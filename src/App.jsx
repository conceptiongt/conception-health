import { useState } from 'react'
import { supabase } from './lib/supabase'
import { C, SERIF, SHADOW } from './lib/theme'
import { LIMITE_PRUEBA } from './lib/constantes'
import { useSesion } from './hooks/useSesion'
import { DatosContext, useCargarDatos } from './hooks/useDatos'
import { Acceso, CrearPassword } from './pages/Acceso'
import { Inicio } from './pages/Inicio'
import { Registrar } from './pages/Registrar'
import { Citas } from './pages/Citas'
import { Expedientes } from './pages/Expedientes'
import { Suscripcion } from './pages/Suscripcion'
import { Configuracion } from './pages/Configuracion'
import { ToastContainer } from './components/ui/Toast'
import { Cargando, Logo } from './components/ui/Varios'
import { Icon } from './components/ui/Icon'
import { Button } from './components/ui/Button'

const NAV = [
  { id: 'inicio', label: 'Inicio', icono: 'inicio' },
  { id: 'registrar', label: 'Registrar paciente', icono: 'registrar' },
  { id: 'citas', label: 'Citas', icono: 'citas' },
  { id: 'expedientes', label: 'Expedientes', icono: 'expedientes' },
]
const NAV_CUENTA = [
  { id: 'suscripcion', label: 'Suscripción', icono: 'suscripcion' },
  { id: 'configuracion', label: 'Configuración', icono: 'ajustes' },
]

const iniciales = (t = '') => t.replace(/^(dr|dra)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'C'

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
  const [vista, setVista] = useState('inicio')
  const [menu, setMenu] = useState(false)
  const [expedienteId, setExpedienteId] = useState(null)

  const ir = (v, extra) => {
    setVista(v); setMenu(false)
    setExpedienteId(v === 'expedientes' ? extra ?? null : null)
    window.scrollTo(0, 0)
  }

  const ctx = { ...(datos || { pacientes: [], citas: [], cobros: [], servicios: [] }), recargar, perfil, clinica, planActivo, ir, recargarSesion }
  const enPrueba = !planActivo
  const usados = datos?.pacientes.length ?? 0

  const plan = planActivo ? (clinica?.plan === 'max' ? 'Plan Max' : 'Plan Básico') : 'Versión de prueba'

  return (
    <DatosContext.Provider value={ctx}>
      <div className="layout">
        <div className="topbar">
          <button onClick={() => setMenu(true)} aria-label="Menú" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', padding: 4 }}><Icon name="menu" size={22} /></button>
          <Logo variant="light" height={28} />
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: '0.22em' }}>HEALTH</span>
        </div>
        {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(11,17,32,0.45)', zIndex: 140 }} />}

        <aside className={`sidebar${menu ? ' abierta' : ''}`}>
          <div style={{ padding: '28px 24px 22px' }}>
            <Logo variant="light" height={46} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <span style={{ height: 1, width: 18, background: C.grad }} />
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.32em' }}>HEALTH</span>
            </div>
          </div>

          <div style={{ margin: '0 16px 18px', padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, padding: 1.5, background: C.grad, flexShrink: 0 }}>
              <div style={{ width: '100%', height: '100%', borderRadius: 10.5, background: '#111A2E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontSize: 15, fontWeight: 600 }}>
                {iniciales(clinica?.nombre || perfil.nombre)}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clinica?.nombre || perfil.nombre}</div>
              <div style={{ color: planActivo ? '#A7F3D0' : '#FCD9A1', fontSize: 11.5, fontWeight: 600, marginTop: 1 }}>{plan}</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {[['MENÚ', NAV], ['CUENTA', NAV_CUENTA]].map(([titulo, items]) => (
              <div key={titulo} style={{ marginBottom: 18 }}>
                <div style={{ padding: '0 26px 8px', color: 'rgba(255,255,255,0.32)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.18em' }}>{titulo}</div>
                <nav style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {items.map(n => {
                    const activo = vista === n.id
                    return (
                      <button key={n.id} className="nav-item" onClick={() => ir(n.id)} style={{
                        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 11, border: 'none', cursor: 'pointer',
                        textAlign: 'left', fontSize: 14, fontWeight: activo ? 700 : 500, letterSpacing: '0.005em',
                        background: activo ? C.sidebarActive : 'none', color: activo ? '#fff' : 'rgba(255,255,255,0.62)',
                      }}>
                        {activo && <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: C.grad }} />}
                        <Icon name={n.icono} size={18} style={{ opacity: activo ? 1 : 0.8 }} />{n.label}
                      </button>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>

          <div style={{ margin: 16, padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em' }}>SESIÓN</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{perfil.email}</div>
            </div>
            <button onClick={() => supabase.auth.signOut()} title="Cerrar sesión" aria-label="Cerrar sesión" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="salir" size={16} />
            </button>
          </div>
        </aside>

        <main className="main">
          {enPrueba && (
            <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', boxShadow: SHADOW }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: C.amberLight, color: C.amber, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="estrella" size={18} /></div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Versión de prueba · {usados} de {LIMITE_PRUEBA} pacientes</div>
                <div style={{ fontSize: 13, color: C.g500 }}>Active su suscripción para registrar pacientes ilimitados.</div>
              </div>
              <Button variant="brand" size="sm" onClick={() => ir('suscripcion')}>Ver planes</Button>
            </div>
          )}
          {error ? <div style={{ color: C.red, padding: 30 }}>No se pudieron cargar los datos: {error}</div>
            : !datos ? <Cargando />
            : vista === 'inicio' ? <Inicio />
            : vista === 'registrar' ? <Registrar />
            : vista === 'citas' ? <Citas />
            : vista === 'expedientes' ? <Expedientes abrirId={expedienteId} />
            : vista === 'configuracion' ? <Configuracion />
            : <Suscripcion />}
        </main>
      </div>
    </DatosContext.Provider>
  )
}


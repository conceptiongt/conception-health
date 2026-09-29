import { useState } from 'react'
import { supabase } from './lib/supabase'
import { C } from './lib/theme'
import { LIMITE_PRUEBA } from './lib/constantes'
import { useSesion } from './hooks/useSesion'
import { DatosContext, useCargarDatos } from './hooks/useDatos'
import { Acceso, CrearPassword } from './pages/Acceso'
import { Inicio } from './pages/Inicio'
import { Registrar } from './pages/Registrar'
import { Citas } from './pages/Citas'
import { Expedientes } from './pages/Expedientes'
import { Suscripcion } from './pages/Suscripcion'
import { ToastContainer } from './components/ui/Toast'
import { Cargando, Logo } from './components/ui/Varios'

const NAV = [
  { id: 'inicio', label: 'Inicio', icono: '📊' },
  { id: 'registrar', label: 'Registrar paciente', icono: '➕' },
  { id: 'citas', label: 'Citas', icono: '📅' },
  { id: 'expedientes', label: 'Expedientes', icono: '🗂️' },
  { id: 'suscripcion', label: 'Suscripción', icono: '💳' },
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
  const [vista, setVista] = useState('inicio')
  const [menu, setMenu] = useState(false)
  const [expedienteId, setExpedienteId] = useState(null)

  const ir = (v, extra) => {
    setVista(v); setMenu(false)
    setExpedienteId(v === 'expedientes' ? extra ?? null : null)
    window.scrollTo(0, 0)
  }

  const ctx = { ...(datos || { pacientes: [], citas: [], cobros: [] }), recargar, perfil, clinica, planActivo, ir, recargarSesion }
  const enPrueba = !planActivo
  const usados = datos?.pacientes.length ?? 0

  return (
    <DatosContext.Provider value={ctx}>
      <div className="layout">
        <div className="topbar">
          <button onClick={() => setMenu(true)} aria-label="Menú" style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}>☰</button>
          <Logo variant="light" height={30} />
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.7 }}>HEALTH</span>
        </div>
        {menu && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 140 }} />}

        <aside className={`sidebar${menu ? ' abierta' : ''}`}>
          <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <Logo variant="light" height={50} />
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', marginTop: 6 }}>HEALTH</div>
          </div>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em' }}>CONSULTORIO</div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginTop: 2 }}>{clinica?.nombre || perfil.nombre}</div>
          </div>
          <nav style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => ir(n.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                textAlign: 'left', fontSize: 14, fontWeight: vista === n.id ? 700 : 500,
                background: vista === n.id ? C.sidebarActive : 'none', color: vista === n.id ? '#fff' : 'rgba(255,255,255,0.6)',
              }}><span style={{ fontSize: 16 }}>{n.icono}</span>{n.label}</button>
            ))}
          </nav>
          <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>{perfil.email}</div>
            <button onClick={() => supabase.auth.signOut()} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.15)', background: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cerrar sesión</button>
          </div>
        </aside>

        <main className="main">
          {enPrueba && (
            <div style={{ background: C.amberLight, border: '1px solid #FDE68A', borderRadius: 12, padding: '11px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220, fontSize: 13.5, color: C.amber }}>
                <strong>Versión de prueba:</strong> {usados} de {LIMITE_PRUEBA} pacientes usados. Active su suscripción para registrar pacientes ilimitados.
              </div>
              <button onClick={() => ir('suscripcion')} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: C.purple, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Ver planes</button>
            </div>
          )}
          {error ? <div style={{ color: C.red, padding: 30 }}>No se pudieron cargar los datos: {error}</div>
            : !datos ? <Cargando />
            : vista === 'inicio' ? <Inicio />
            : vista === 'registrar' ? <Registrar />
            : vista === 'citas' ? <Citas />
            : vista === 'expedientes' ? <Expedientes abrirId={expedienteId} />
            : <Suscripcion />}
        </main>
      </div>
    </DatosContext.Provider>
  )
}

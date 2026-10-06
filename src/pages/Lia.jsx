import { useState } from 'react'
import { C, SHADOW } from '../lib/theme'
import { accesos } from '../lib/constantes'
import { useDatos } from '../hooks/useDatos'
import { LiaContext, useCargarLia } from '../hooks/useLia'
import { Encabezado, Pestanas, Cargando } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { toast } from '../components/ui/Toast'
import { Resumen } from '../components/lia/Resumen'
import { Conversaciones } from '../components/lia/Conversaciones'
import { Probar } from '../components/lia/Probar'
import { Seguimiento } from '../components/lia/Seguimiento'
import { Metodo } from '../components/lia/Metodo'
import { Ajustes } from '../components/lia/Ajustes'
import { Bloqueada } from '../components/lia/Bloqueada'

const PESTANAS = [
  { value: 'resumen', label: 'Resumen', icono: 'inicio' },
  { value: 'conversaciones', label: 'Conversaciones', icono: 'mensaje' },
  { value: 'probar', label: 'Probar', icono: 'telefono' },
  { value: 'seguimiento', label: 'Seguimiento', icono: 'repetir' },
  { value: 'metodo', label: 'Cómo atiende', icono: 'libro' },
  { value: 'ajustes', label: 'Configuración', icono: 'ajustes' },
]

// Lía, the virtual receptionist (plans Max and Lía); other plans see what she does and can try her
export function Lia() {
  const datos = useDatos()
  const { clinica, planActivo, servicios, ir } = datos
  const lia = useCargarLia(clinica)
  const [tab, setTab] = useState('resumen')
  const [seccion, setSeccion] = useState(null)
  const acc = accesos(clinica, planActivo)

  if (lia.error) return <div style={{ color: C.red, padding: 30 }}>{lia.error}</div>
  if (lia.cargando) return <Cargando />
  if (!acc.lia) return (
    <>
      <Encabezado titulo="Lía, su recepcionista virtual" subtitulo="Contesta su WhatsApp, agenda y da seguimiento por usted" />
      <Bloqueada />
    </>
  )

  const irA = (t, s = null) => {
    if (t === 'citas') { ir('citas'); return }
    setTab(t); setSeccion(s); window.scrollTo(0, 0)
  }
  const nombreLia = lia.cfg.nombre || 'Lía'
  const medico = lia.cfg.datos?.doctor || clinica?.nombre || 'Su consultorio'
  const guardar = async () => { if (await lia.guardar()) toast.success('Cambios guardados'); else toast.error('No se pudieron guardar los cambios') }
  const editables = ['seguimiento', 'metodo', 'ajustes'].includes(tab)

  return (
    <LiaContext.Provider value={lia}>
      <Encabezado titulo={`${nombreLia}, su recepcionista`} subtitulo={{
        siempre: 'Atiende su WhatsApp las 24 horas', fuera: 'Atiende fuera del horario de consulta', pausa: 'En pausa: no está contestando',
      }[lia.cfg.modo] || ''} />
      <div style={{ marginBottom: 20, overflowX: 'auto' }}>
        <Pestanas opciones={PESTANAS} valor={tab} onChange={v => irA(v)} />
      </div>

      {tab === 'resumen' && <Resumen irA={irA} />}
      {tab === 'conversaciones' && <Conversaciones irA={irA} />}
      {tab === 'probar' && (lia.cambios
        ? <AvisoCambios onGuardar={guardar} onDescartar={lia.descartar} texto={`Guarde sus cambios para que ${nombreLia} los use en la prueba.`} />
        : <Probar nombreLia={nombreLia} medico={medico} servicios={servicios} onCambio={lia.recargar} />)}
      {tab === 'seguimiento' && <Seguimiento irA={irA} />}
      {tab === 'metodo' && <Metodo />}
      {tab === 'ajustes' && <Ajustes seccion={seccion} />}

      {editables && lia.cambios && (
        <div style={{ position: 'sticky', bottom: 16, zIndex: 50, marginTop: 20 }}>
          <AvisoCambios onGuardar={guardar} onDescartar={lia.descartar} guardando={lia.guardando} texto="Tiene cambios sin guardar." />
        </div>
      )}
    </LiaContext.Provider>
  )
}

function AvisoCambios({ texto, onGuardar, onDescartar, guardando }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 14, background: C.black, color: '#fff', boxShadow: `0 16px 40px rgba(11,17,32,0.25), ${SHADOW}` }}>
      <span style={{ flex: 1, minWidth: 200, fontSize: 14, fontWeight: 600 }}>{texto}</span>
      <Button variant="ghost" size="sm" onClick={onDescartar}>Descartar</Button>
      <Button variant="brand" size="sm" onClick={onGuardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Button>
    </div>
  )
}

import { useState } from 'react'
import { C } from '../lib/theme'
import { guardarPreferencias, leerPreferencias, usaCirugias } from '../lib/calendario'
import { esHospital } from '../lib/especialidades'
import { puede, esSoporte } from '../lib/permisos'
import { useDatos } from '../hooks/useDatos'
import { Card, Badge } from './ui/Varios'
import { toast } from './ui/Toast'
import { Interruptor } from './MensajePaciente'
import { Personal, Areas } from './MiHospital'

// Configuración → «Calendario de cirugías»: a clinic that is not a hospital (a surgeon who operates in a small hospital with two rooms…) can turn on the
// operating-room calendar, then registers its surgeons, anesthesiologists and rooms. Hospitals have all of this in «Mi hospital».
export function CalendarioCirugias() {
  const { clinica, perfil, hospital, recargarSesion } = useDatos()
  const [busy, setBusy] = useState(false)
  if (!clinica || esHospital(clinica.especialidad) || !puede(perfil, 'configuracion')) return null
  const activo = usaCirugias(clinica)
  const lectura = esSoporte(perfil)

  const cambiar = async (v) => {
    setBusy(true)
    const r = await guardarPreferencias(clinica, { ...leerPreferencias(clinica), cirugias: v })
    if (!r.fallo) { await recargarSesion(); toast.success(v ? 'Calendario de cirugías activado' : 'Calendario de cirugías desactivado') }
    setBusy(false)
  }

  return (
    <>
      <Card title="Calendario de cirugías">
        <div style={{ fontSize: 13.5, color: C.g500, lineHeight: 1.55, marginBottom: 14 }}>
          Un calendario de quirófanos para programar cirugías sin empalmes: el sistema revisa que el quirófano, el cirujano y el anestesiólogo estén libres.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: lectura || busy ? 'default' : 'pointer', fontSize: 14.5, fontWeight: 500 }}>
          <Interruptor activo={activo} onChange={cambiar} disabled={lectura || busy} titulo="Activar calendario de cirugías" />
          <span>Activar calendario de cirugías<span style={{ display: 'block', fontSize: 12.5, color: C.g400, fontWeight: 400 }}>{activo ? 'Aparece «Quirófanos» en el menú. Si lo desactiva, las cirugías ya programadas se conservan.' : 'Agrega «Quirófanos» al menú.'}</span></span>
        </label>
      </Card>
      {activo && (!hospital.cargado ? null : !hospital.tablas ? (
        <Card title="Quirófanos y cirujanos">
          <div style={{ fontSize: 13.5, color: C.g500, lineHeight: 1.6 }}>
            <Badge color={C.purpleDark} bg={C.purpleMid}>Disponible pronto</Badge>
            <div style={{ marginTop: 10 }}>Aquí registrará sus cirujanos, anestesiólogos y quirófanos. Le avisaremos en cuanto esté listo.</div>
          </div>
        </Card>
      ) : <><Personal compacto /><Areas compacto /></>)}
    </>
  )
}

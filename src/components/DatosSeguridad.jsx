import { C } from '../lib/theme'
import { Card } from './ui/Varios'
import { Icon } from './ui/Icon'
import { useState, useEffect } from 'react'
import { useDatos } from '../hooks/useDatos'
import { esAdmin } from '../lib/permisos'
import { soporteDisponible } from './SoporteAcceso'

// Read-only facts about where and how the clinic's data is stored (shown in Configuración)
const DATOS = [
  ['Dónde se guarda', 'En servidores de Supabase sobre Amazon Web Services, región Oregón (EE. UU.).'],
  ['Cifrado', 'La información viaja cifrada (TLS) y se guarda cifrada en disco (AES-256).'],
  ['Separación por clínica', 'Cada clínica solo puede ver sus propios datos; la base de datos lo aplica en cada consulta.'],
  ['Archivos y fotos', 'Los archivos y fotos de sus pacientes se guardan en un almacén privado y solo se abren con enlaces temporales. El logo de su clínica es público.'],
  ['Usuarios y permisos', 'Usted decide qué puede ver y hacer cada asistente.'],
  ['Historial', 'Las citas e inventario eliminados quedan registrados con quién, cuándo y por qué.'],
  ['Sus datos son suyos', 'Puede exportar sus listados a Excel o PDF y eliminar su cuenta cuando quiera.'],
]
// «Acceso de Conception» depends on whether the support-code feature is live
const ACCESO_CON_CODIGO = 'El equipo de soporte de Conception solo entra a su clínica con un código que usted genera y que vence en 24 horas. Cada entrada con código queda en el historial. Quien administra el servidor conserva acceso técnico a la infraestructura y no lo usa para ver los datos de sus pacientes sin su código.'
const ACCESO_SIN_CODIGO = 'Conception tiene acceso técnico de administración y lo usa solo para mantenimiento y soporte. No usa la información de sus pacientes para ningún otro fin.'

export function DatosSeguridad() {
  const { perfil } = useDatos()
  const admin = esAdmin(perfil)
  const [conCodigo, setConCodigo] = useState(false)
  useEffect(() => {
    let vivo = true
    if (admin) soporteDisponible().then(ok => { if (vivo) setConCodigo(ok) })
    else setConCodigo(false)
    return () => { vivo = false }
  }, [admin])
  const filas = [...DATOS, ['Acceso de Conception', conCodigo ? ACCESO_CON_CODIGO : ACCESO_SIN_CODIGO]]
  return (
    <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 34, height: 34, borderRadius: 11, background: C.purpleMid, color: 'var(--acento-fuerte)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="escudo" size={18} /></span>
      Seguridad y almacenamiento de sus datos
    </span>}>
      <div className="datos-seguridad">
        {filas.map(([titulo, texto]) => (
          <div key={titulo} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.black }}>{titulo}</div>
            <div style={{ fontSize: 13.5, color: C.g500, lineHeight: 1.55, marginTop: 2 }}>{texto}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 12.5, color: C.g500, lineHeight: 1.5 }}>Si usa Lía (WhatsApp), los mensajes pasan también por los servicios indicados en la política de privacidad.</div>
      <div style={{ marginTop: 10, fontSize: 13 }}>
        <a href="/privacidad" target="_blank" rel="noopener" style={{ color: 'var(--acento-fuerte)', fontWeight: 600 }}>Política de privacidad</a>
      </div>
    </Card>
  )
}

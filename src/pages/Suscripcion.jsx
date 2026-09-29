import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { PLANES, LIMITE_PRUEBA } from '../lib/constantes'
import { fmtFecha } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Card, Badge } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Campo, Input, Grid } from '../components/ui/Campos'
import { toast } from '../components/ui/Toast'

export function Suscripcion() {
  const { clinica, perfil, planActivo, pacientes, recargarSesion } = useDatos()
  const planActual = PLANES.find(p => p.value === clinica?.plan)
  const [nombre, setNombre] = useState(clinica?.nombre || '')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)

  const guardarNombre = async () => {
    if (!nombre.trim()) return
    setBusy(true)
    const { error } = await supabase.from('clinicas').update({ nombre: nombre.trim() }).eq('id', clinica.id)
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Nombre actualizado')
    recargarSesion()
  }
  const cambiarPass = async () => {
    if (pass.length < 8) { toast.error('Mínimo 8 caracteres'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(false)
    if (error) { toast.error('No se pudo cambiar la contraseña'); return }
    setPass('')
    toast.success('Contraseña actualizada')
  }

  return (
    <>
      <Encabezado titulo="Suscripción" subtitulo="Su plan y los datos de su cuenta" />

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.g400, letterSpacing: '0.08em' }}>PLAN ACTUAL</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.black }}>{planActivo && planActual ? `Plan ${planActual.nombre}` : 'Versión de prueba'}</div>
            <div style={{ fontSize: 13.5, color: C.g500 }}>
              {planActivo
                ? (clinica.plan_hasta ? `Activo hasta el ${fmtFecha(clinica.plan_hasta)}` : 'Suscripción activa')
                : `${pacientes.length} de ${LIMITE_PRUEBA} pacientes usados en la prueba gratis`}
            </div>
          </div>
          {planActivo ? <Badge color={C.green} bg={C.greenLight}>● Activa</Badge> : <Badge color={C.amber} bg={C.amberLight}>● Prueba</Badge>}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginTop: 14 }}>
        {PLANES.map(p => {
          const actual = planActivo && clinica?.plan === p.value
          return (
            <div key={p.value} style={{ background: '#fff', borderRadius: 16, padding: 22, border: `2px solid ${actual ? C.purple : p.value === 'max' ? '#C4B5FD' : C.g200}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.black, flex: 1 }}>Plan {p.nombre}</div>
                {actual && <Badge color={C.purple} bg={C.purpleLight}>Su plan</Badge>}
                {!actual && p.value === 'max' && <Badge color={C.purple} bg={C.purpleLight}>Más completo</Badge>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.purple, margin: '4px 0 14px' }}>{p.precio}</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: C.g700, fontSize: 14, lineHeight: 1.9, flex: 1 }}>
                {p.incluye.map(i => <li key={i}>{i}</li>)}
              </ul>
              <div style={{ marginTop: 18 }}>
                {actual ? (
                  <Button variant="ghost" style={{ width: '100%' }} onClick={() => p.link && window.open(p.link, '_blank', 'noopener')}>💳 Gestionar suscripción</Button>
                ) : p.link ? (
                  <Button style={{ width: '100%' }} onClick={() => window.open(p.link, '_blank', 'noopener')}>💳 Suscribirme al plan {p.nombre}</Button>
                ) : (
                  <Button variant="ghost" style={{ width: '100%' }} disabled>Próximamente</Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 13, color: C.g500, marginTop: 10, lineHeight: 1.6 }}>
        El pago se realiza de forma segura en Recurrente. <strong>Use el mismo correo de su cuenta ({perfil.email})</strong> para que su plan se active.
        Si ya pagó y aún no ve su plan activo, <button onClick={recargarSesion} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 700, cursor: 'pointer', padding: 0 }}>actualice aquí</button>.
      </div>

      <Card title="Datos de la cuenta" style={{ marginTop: 18 }}>
        <Grid>
          <Campo label="Nombre del consultorio o doctor">
            <div style={{ display: 'flex', gap: 8 }}><Input value={nombre} onChange={setNombre} /><Button variant="ghost" onClick={guardarNombre} disabled={busy}>Guardar</Button></div>
          </Campo>
          <Campo label="Correo"><Input value={perfil.email} onChange={() => {}} disabled /></Campo>
          <Campo label="Nueva contraseña" ayuda="Mínimo 8 caracteres">
            <div style={{ display: 'flex', gap: 8 }}><Input type="password" value={pass} onChange={setPass} autoComplete="new-password" /><Button variant="ghost" onClick={cambiarPass} disabled={busy}>Cambiar</Button></div>
          </Campo>
        </Grid>
      </Card>
    </>
  )
}

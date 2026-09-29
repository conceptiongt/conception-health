import { C, SERIF, SHADOW } from '../lib/theme'
import { PLANES, LIMITE_PRUEBA } from '../lib/constantes'
import { fmtFecha } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Badge } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'

export function Suscripcion() {
  const { clinica, perfil, planActivo, pacientes, recargarSesion } = useDatos()
  const planActual = PLANES.find(p => p.value === clinica?.plan)
  const abrir = (link) => link && window.open(link, '_blank', 'noopener')

  return (
    <>
      <Encabezado titulo="Suscripción" subtitulo="Elija el plan para su consultorio" />

      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 18, padding: '20px 22px', boxShadow: SHADOW, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: '0.14em' }}>PLAN ACTUAL</div>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: C.black, marginTop: 2 }}>
            {planActivo && planActual ? `Plan ${planActual.nombre}` : 'Versión de prueba'}
          </div>
          <div style={{ fontSize: 13.5, color: C.g500, marginTop: 2 }}>
            {planActivo
              ? (clinica.plan_hasta ? `Activo hasta el ${fmtFecha(clinica.plan_hasta)}` : 'Suscripción activa')
              : `${pacientes.length} de ${LIMITE_PRUEBA} pacientes usados en la prueba gratis`}
          </div>
        </div>
        {planActivo ? <Badge color={C.green} bg={C.greenLight}>Activa</Badge> : <Badge color={C.amber} bg={C.amberLight}>Prueba</Badge>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 16, marginTop: 16 }}>
        {PLANES.map(p => {
          const actual = planActivo && clinica?.plan === p.value
          const destacado = p.value === 'max'
          return (
            <div key={p.value} style={{ borderRadius: 22, padding: 1.5, boxShadow: SHADOW, background: actual || destacado ? C.grad : C.line }}>
              <div style={{ background: '#fff', borderRadius: 21, padding: 26, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.purple, letterSpacing: '0.16em' }}>PLAN {p.nombre.toUpperCase()}</div>
                  {actual ? <Badge color={C.purple} bg={C.purpleLight}>Su plan</Badge> : destacado && <Badge color={C.purple} bg={C.purpleLight}>Más completo</Badge>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '10px 0 18px' }}>
                  <span style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 800, color: C.black, letterSpacing: '-0.02em' }}>{p.precio.split(' / ')[0]}</span>
                  <span style={{ fontSize: 14, color: C.g500 }}>/ mes</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  {p.incluye.map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.g700 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 11, background: C.purpleMid, color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="check" size={13} stroke={2.4} />
                      </span>{i}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 24 }}>
                  {actual
                    ? <Button variant="ghost" icon="suscripcion" style={{ width: '100%' }} onClick={() => abrir(p.link)}>Gestionar suscripción</Button>
                    : p.link
                      ? <Button variant={destacado ? 'brand' : 'primary'} icon="suscripcion" style={{ width: '100%' }} onClick={() => abrir(p.link)}>Suscribirme al plan {p.nombre}</Button>
                      : <Button variant="ghost" style={{ width: '100%' }} disabled>Próximamente</Button>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 13, color: C.g500, marginTop: 14, lineHeight: 1.7 }}>
        El pago se realiza de forma segura en Recurrente. <strong>Use el mismo correo de su cuenta ({perfil.email})</strong> para que su plan se active.
        Si ya pagó y aún no ve su plan activo, <button onClick={recargarSesion} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 700, cursor: 'pointer', padding: 0 }}>actualice aquí</button>.
      </div>
    </>
  )
}

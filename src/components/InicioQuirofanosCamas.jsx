import { useMemo } from 'react'
import { C } from '../lib/theme'
import { hoyISO } from '../lib/formato'
import { usaCirugias, usaCamas } from '../lib/calendario'
import { puede } from '../lib/permisos'
import { estadoAhora, fechaDe, horaDe } from '../lib/quirofanos'
import { useDatos } from '../hooks/useDatos'
import { useCirugias } from '../hooks/useCirugias'
import { useCamas } from '../hooks/useCamas'
import { Panel } from './ui/Panel'

// Inicio: «Quirófanos hoy» (accounts with the surgery calendar) and «Camas» (hospitals). Each one is a quiet link to its page and shows nothing
// until the migration is applied (no «Disponible pronto» noise on the home screen).
export function InicioQuirofanosCamas() {
  const { clinica, perfil, hospital, ir } = useDatos()
  const conQ = usaCirugias(clinica) && puede(perfil, 'quirofano') && hospital.tablas
  const conC = usaCamas(clinica) && puede(perfil, 'camas') && hospital.tablas
  const hoy = hoyISO()
  const q = useCirugias({ desde: hoy, hasta: hoy, activo: conQ, ms: 60000 })
  const c = useCamas({ activo: conC, ms: 60000 })
  const quirofanos = hospital.recursos.filter(r => r.tipo === 'quirofano' && r.activo)
  const camas = hospital.recursos.filter(r => r.tipo === 'cama' && r.activo)
  const hoyCirugias = useMemo(() => q.cirugias.filter(x => x.estado !== 'suspendida' && fechaDe(Date.parse(x.inicio)) === hoy), [q.cirugias, hoy])
  const mostrarQ = conQ && q.listo && q.disponible
  const mostrarC = conC && c.listo && c.disponible
  if (!mostrarQ && !mostrarC) return null

  const ocupadas = camas.filter(x => c.abiertas.some(e => e.cama_id === x.id)).length
  const fuera = camas.filter(x => x.fuera_de_servicio && !c.abiertas.some(e => e.cama_id === x.id)).length
  const libres = camas.length - ocupadas - fuera
  const ahora = Date.now()
  return (
    <div className="in-fila4">
      {mostrarQ && (
        <Panel eyebrow="Quirófanos" titulo="Quirófanos hoy">
          {quirofanos.length === 0 ? <div style={{ fontSize: 13.5, color: C.g500 }}>Aún no hay quirófanos registrados</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '-6px' }}>
              {quirofanos.map(r => {
                const n = hoyCirugias.filter(x => x.quirofano_id === r.id).length
                const e = estadoAhora(q.reservas, r.id, ahora)
                return (
                  <button type="button" key={r.id} onClick={() => ir('quirofanos')} className="in-fila-lista">
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 10, flexShrink: 0, background: r.fuera_de_servicio ? C.g300 : e.libre ? '#34B36B' : '#E0A100' }} />
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: C.black }}>{r.nombre}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: C.g500 }}>{r.fuera_de_servicio ? 'Fuera de servicio' : e.libre ? `Libre ahora${e.hasta ? ` hasta las ${horaDe(e.hasta)}` : ''}` : `Ocupado hasta las ${horaDe(e.hasta)}`}</span>
                    </span>
                    <span className="in-pildora">{n} {n === 1 ? 'cirugía' : 'cirugías'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </Panel>
      )}
      {mostrarC && (
        <Panel eyebrow="Hospitalización" titulo="Camas">
          {camas.length === 0 ? <div style={{ fontSize: 13.5, color: C.g500 }}>Aún no hay camas registradas</div> : (
            <button type="button" onClick={() => ir('camas')} className="in-fila-lista" style={{ flexWrap: 'wrap', margin: '-6px', width: 'calc(100% + 12px)' }}>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: C.black }}>{camas.length} camas</span>
                <span style={{ display: 'block', fontSize: 12.5, color: C.g500 }}>{fuera > 0 ? `${fuera} fuera de servicio` : 'Ver el mapa de camas'}</span>
              </span>
              <span className="in-pildora" style={{ background: C.greenLight, color: C.green }}>{libres} {libres === 1 ? 'libre' : 'libres'}</span>
              <span className="in-pildora" style={{ background: C.redLight, color: C.red }}>{ocupadas} {ocupadas === 1 ? 'ocupada' : 'ocupadas'}</span>
            </button>
          )}
        </Panel>
      )}
    </div>
  )
}

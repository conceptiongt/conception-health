import { useState, useMemo } from 'react'
import { C } from '../lib/theme'
import { MESES } from '../lib/constantes'
import { hoyISO } from '../lib/formato'
import { DIAS_INICIAL, agruparPorDia, citasActivas, fechaLarga, matrizMes, nivelOcupacion, partesISO, sumarMeses } from '../lib/calendario'
import { Card } from './ui/Varios'
import { Icon } from './ui/Icon'
import { useBloqueos } from '../hooks/useBloqueos'
import { RAYADO, diaBloqueado } from '../lib/bloqueos'

// Tint of a day by how busy it is: none = libre, light accent = ocupado, strong accent = muy ocupado
const CLASE_TINTE = ['', 'tinte-1', 'tinte-2']
const flecha = { width: 32, height: 32, borderRadius: 160, border: `1px solid ${C.g200}`, background: 'rgba(255,255,255,0.9)', cursor: 'pointer', color: C.g600, fontFamily: 'inherit', fontSize: 18, lineHeight: 1, padding: 0 }

// Compact month for Inicio. `citas` already follows the page's location filter.
export function CalendarioInicio({ citas: todas, pacientes, onDia, onAbrir }) {
  const hoy = hoyISO()
  const [mes, setMes] = useState(hoy.slice(0, 7) + '-01')
  // Only count citas whose patient still exists (same filter as Calendario.jsx)
  const citas = useMemo(() => { const ids = new Set((pacientes || []).map(p => p.id)); return todas.filter(c => ids.has(c.paciente_id)) }, [todas, pacientes])
  const porDia = useMemo(() => agruparPorDia(citas), [citas])
  const { bloqueos } = useBloqueos()
  const { y, m } = partesISO(mes)
  const semanas = matrizMes(y, m)
  const hayBloqueo = semanas.flat().some(d => d.delMes && diaBloqueado(bloqueos, d.iso))
  return (
    <Card title="Calendario" right={<button type="button" onClick={onAbrir} style={{ background: 'none', border: 'none', color: 'var(--acento-fuerte)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>Abrir calendario</button>}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div aria-live="polite" style={{ flex: 1, fontWeight: 600, fontSize: 15, color: C.black }}>{MESES[m]} {y}</div>
          <button type="button" style={flecha} aria-label="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))}>‹</button>
          <button type="button" style={flecha} aria-label="Mes siguiente" onClick={() => setMes(sumarMeses(mes, 1))}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3 }}>
          {DIAS_INICIAL.map((d, i) => <div key={i} aria-hidden="true" style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: C.g500, padding: '3px 0' }}>{d}</div>)}
          {semanas.flat().map(d => {
            const n = citasActivas(porDia[d.iso]).length
            const nivel = nivelOcupacion(n)
            const esHoy = d.iso === hoy
            const bl = diaBloqueado(bloqueos, d.iso)
            return (
              <button key={d.iso} type="button" className={CLASE_TINTE[nivel]} onClick={() => onDia(d.iso)} aria-label={`${fechaLarga(d.iso)}, ${n === 0 ? 'sin citas' : n === 1 ? '1 cita' : `${n} citas`}${bl ? `, bloqueado: ${bl.titulo}` : ''}`} title={bl ? `Bloqueado: ${bl.titulo}` : undefined} style={{
                position: 'relative', ...(bl && !nivel ? { background: RAYADO(0.2) } : null), aspectRatio: '1 / 0.95', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, padding: 0,
                fontWeight: esHoy || nivel ? 700 : 500, color: nivel === 2 ? C.onPurple : d.delMes ? C.black : C.g400, opacity: d.delMes ? 1 : 0.6,
                boxShadow: esHoy ? '0 0 0 2px #fff, 0 0 0 4px var(--acento-fuerte)' : 'none',
              }}>{bl && <span aria-hidden="true" style={{ position: 'absolute', top: 3, right: 4, display: 'inline-flex', color: nivel === 2 ? C.onPurple : C.g500 }}><Icon name="candado" size={9} /></span>}{d.dia}</button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12, fontSize: 12, color: C.g500 }}>
          {['Libre', 'Ocupado', 'Muy ocupado'].map((t, i) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className={CLASE_TINTE[i]} style={{ width: 12, height: 12, borderRadius: 4, border: `1px solid ${i ? 'transparent' : C.g200}` }} />{t}
            </span>
          ))}
          {hayBloqueo && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 4, border: `1px solid ${C.g300}`, backgroundImage: RAYADO(0.3) }} />Bloqueado</span>}
        </div>
      </div>
    </Card>
  )
}

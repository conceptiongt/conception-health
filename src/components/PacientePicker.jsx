import { useState, useMemo } from 'react'
import { C } from '../lib/theme'
import { useDatos } from '../hooks/useDatos'
import { filtroStyle } from './ui/Campos'
import { Icon } from './ui/Icon'

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Search an existing patient (name, phone or e-mail) and pick one. `deshabilitados`: { pacienteId: 'reason' } shown greyed and not selectable.
// `onNuevo`: shows the «Registrar paciente nuevo» link.
export function PacientePicker({ valor, onChange, deshabilitados = {}, onNuevo, autoFocus = false }) {
  const { pacientes } = useDatos()
  const [q, setQ] = useState('')
  const elegido = pacientes.find(p => p.id === valor)
  const lista = useMemo(() => {
    const t = sinTildes(q).trim()
    const base = t ? pacientes.filter(p => sinTildes(`${p.nombre} ${p.telefono || ''} ${p.email || ''}`).includes(t)) : pacientes
    return [...base].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).slice(0, 6)
  }, [pacientes, q])

  if (elegido) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 12, border: `1px solid ${C.g200}`, background: 'rgba(255,255,255,0.9)' }}>
        <Icon name="registrar" size={17} style={{ color: C.purple }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{elegido.nombre}</div>
          {elegido.telefono && <div style={{ fontSize: 12.5, color: C.g500 }}>{elegido.telefono}</div>}
        </div>
        <button type="button" onClick={() => onChange('')} style={{ border: 'none', background: 'none', color: 'var(--acento-fuerte)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cambiar</button>
      </div>
    )
  }
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <Icon name="buscar" size={16} style={{ position: 'absolute', left: 12, top: 13, color: C.g400 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar paciente por nombre o teléfono…" aria-label="Buscar paciente" autoFocus={autoFocus}
          style={{ ...filtroStyle, width: '100%', boxSizing: 'border-box', paddingLeft: 34, fontSize: 14 }} />
      </div>
      <div role="listbox" aria-label="Pacientes" style={{ marginTop: 6, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.9)' }}>
        {lista.length === 0 && <div style={{ padding: '12px 14px', fontSize: 13.5, color: C.g500 }}>No hay pacientes con ese nombre.</div>}
        {lista.map((p, i) => {
          const motivo = deshabilitados[p.id]
          return (
            <button key={p.id} type="button" role="option" aria-selected="false" disabled={!!motivo} onClick={() => onChange(p.id)} className={motivo ? undefined : 'fila'}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', borderTop: i ? `1px solid ${C.g100}` : 'none', background: 'transparent', cursor: motivo ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 14, color: motivo ? C.g400 : C.black }}>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{p.nombre}</span>
              {motivo ? <span style={{ fontSize: 12, color: C.amber }}>{motivo}</span> : p.telefono && <span style={{ fontSize: 12.5, color: C.g400 }}>{p.telefono}</span>}
            </button>
          )
        })}
      </div>
      {pacientes.length > 6 && !q && <div style={{ fontSize: 12, color: C.g400, marginTop: 5 }}>Escriba para buscar entre sus {pacientes.length} pacientes.</div>}
      {onNuevo && <button type="button" onClick={onNuevo} style={{ marginTop: 8, border: 'none', background: 'none', padding: 0, color: 'var(--acento-fuerte)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="mas" size={14} />Registrar paciente nuevo</button>}
    </div>
  )
}

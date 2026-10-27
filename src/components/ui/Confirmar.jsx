import { useEffect, useState } from 'react'
import { C } from '../../lib/theme'
import { Modal } from './Modal'
import { Button } from './Button'

// The platform's own confirmation window (replaces the browser's "health.conception-gt.com dice…").
//   if (!(await confirmar('¿Eliminar este gasto?'))) return
//   await confirmar({ titulo, mensaje, aceptar: 'Eliminar', peligro: true })
//   const motivo = await confirmar({ ..., motivo: { opciones: [...] } })  → the reason typed, or null if cancelled
let abrir = null
let n = 0

export function confirmar(opciones) {
  const o = typeof opciones === 'string' ? { mensaje: opciones } : { ...opciones }
  // "¿Eliminar…?", "¿Quitar…?" → red button named after the action
  const accion = String(Array.isArray(o.mensaje) ? o.mensaje[0] : o.mensaje || '').match(/^¿(Eliminar|Quitar|Desvincular|Cancelar|Deshacer|Unir|Crear)/)
  if (accion) {
    o.aceptar ??= accion[1] === 'Cancelar' ? 'Sí, cancelar' : accion[1]
    o.peligro ??= ['Eliminar', 'Quitar', 'Desvincular', 'Cancelar'].includes(accion[1])
  }
  return new Promise(res => {
    if (abrir) abrir({ ...o, res, n: ++n })
    else res(o.motivo ? null : window.confirm(o.mensaje)) // only if the app has not mounted yet
  })
}

export function ConfirmarContainer() {
  const [d, setD] = useState(null)
  useEffect(() => { abrir = setD; return () => { abrir = null } }, [])
  if (!d) return null
  return <Ventana key={d.n} d={d} cerrar={() => setD(null)} />
}

function Ventana({ d, cerrar }) {
  const opciones = d.motivo?.opciones || []
  const [eleccion, setEleccion] = useState(opciones[0] || 'Otro')
  const [detalle, setDetalle] = useState('')
  const fin = (v) => { cerrar(); d.res(v) }
  const otro = !opciones.length || eleccion === 'Otro'
  const motivoTexto = otro ? detalle.trim() : (detalle.trim() ? `${eleccion}: ${detalle.trim()}` : eleccion)
  const listo = !d.motivo || motivoTexto.length >= 3
  const aceptar = () => { if (listo) fin(d.motivo ? motivoTexto : true) }
  const parrafos = Array.isArray(d.mensaje) ? d.mensaje : String(d.mensaje || '').split('\n\n')
  const titulo = d.titulo || (parrafos.length > 1 ? parrafos.shift() : '¿Está seguro?')

  return (
    <Modal title={titulo} subtitle={d.subtitulo} onClose={() => fin(d.motivo ? null : false)} maxWidth={d.motivo ? 520 : 460}>
      {parrafos.filter(Boolean).map((p, i) => (
        <p key={i} style={{ margin: i ? '10px 0 0' : 0, fontSize: 14.5, lineHeight: 1.6, color: C.g700, whiteSpace: 'pre-line' }}>{p}</p>
      ))}
      {d.motivo && <>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.g700, margin: '16px 0 8px' }}>{d.motivo.label || 'Motivo'} <span style={{ color: C.red }}>*</span></div>
        {opciones.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
            {[...opciones, 'Otro'].filter((x, i, a) => a.indexOf(x) === i).map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', cursor: 'pointer', fontSize: 14, color: C.g700 }}>
                <input type="radio" name="motivo" checked={eleccion === m} onChange={() => setEleccion(m)} style={{ width: 17, height: 17, accentColor: C.purple }} />
                {m}
              </label>
            ))}
          </div>
        )}
        <textarea value={detalle} onChange={e => setDetalle(e.target.value)} maxLength={400} rows={2} autoFocus={!opciones.length}
          placeholder={otro ? 'Escriba el motivo' : 'Detalle (opcional)'}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.g200}`, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
      </>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={() => fin(d.motivo ? null : false)}>{d.cancelar || 'Cancelar'}</Button>
        <Button onClick={aceptar} disabled={!listo}
          style={d.peligro ? { background: C.red, color: '#fff', border: `1px solid ${C.red}` } : undefined}>
          {d.aceptar || 'Aceptar'}
        </Button>
      </div>
    </Modal>
  )
}

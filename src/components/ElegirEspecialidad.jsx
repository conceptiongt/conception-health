import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { ESPECIALIDADES } from '../lib/especialidades'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { toast } from './ui/Toast'

// Asked once to accounts created before specialties existed
export function ElegirEspecialidad({ clinica, onListo, onDespues }) {
  const [esp, setEsp] = useState('')
  const [busy, setBusy] = useState(false)
  const guardar = async () => {
    if (!esp) { toast.error('Elija su especialidad'); return }
    setBusy(true)
    const { error } = await supabase.from('clinicas').update({ especialidad: esp }).eq('id', clinica.id)
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Listo, la plataforma se adaptó a su especialidad')
    onListo()
  }
  return (
    <Modal title="¿Cuál es su especialidad?" subtitle="Adaptamos los tipos de consulta, los datos clínicos de cada cita y sus tarifas sugeridas. Puede cambiarla en Configuración." onClose={onDespues} maxWidth={640}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        {ESPECIALIDADES.map(e => {
          const activo = esp === e.value
          return (
            <button key={e.value} type="button" onClick={() => setEsp(e.value)} style={{
              padding: '12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 13.5,
              border: `1.5px solid ${activo ? C.purple : C.line}`, background: activo ? C.purpleMid : '#fff', color: C.black, fontWeight: activo ? 600 : 400,
            }}>{e.label}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onDespues}>Después</Button>
        <Button onClick={guardar} disabled={busy || !esp}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

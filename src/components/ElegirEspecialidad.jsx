import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { esHospital } from '../lib/especialidades'
import { TipoCuenta } from './ui/TipoCuenta'
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
    toast.success(esHospital(esp) ? 'Listo, su cuenta quedó como hospital' : 'Listo, la plataforma se adaptó a su especialidad')
    onListo()
  }
  return (
    <Modal title="¿Qué tipo de cuenta es?" subtitle="Adaptamos los tipos de consulta, los datos clínicos de cada cita y sus tarifas sugeridas. Puede cambiarla en Configuración." onClose={onDespues} maxWidth={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><TipoCuenta value={esp} onChange={setEsp} /></div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="ghost" onClick={onDespues}>Después</Button>
        <Button onClick={guardar} disabled={busy || !esp}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </Modal>
  )
}

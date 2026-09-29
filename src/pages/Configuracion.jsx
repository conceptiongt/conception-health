import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { TIPOS_CITA } from '../lib/constantes'
import { fmtQ } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Card } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Campo, Input, Select, Grid } from '../components/ui/Campos'
import { Icon } from '../components/ui/Icon'
import { toast } from '../components/ui/Toast'

export function Configuracion() {
  const { clinica, servicios, perfil, recargar, recargarSesion } = useDatos()
  const [nombre, setNombre] = useState(clinica?.nombre || '')
  const [busy, setBusy] = useState(false)

  const guardarNombre = async () => {
    if (!nombre.trim()) { toast.error('Escriba el nombre'); return }
    setBusy(true)
    const { error } = await supabase.from('clinicas').update({ nombre: nombre.trim() }).eq('id', clinica.id)
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Nombre actualizado')
    recargarSesion()
  }

  return (
    <>
      <Encabezado titulo="Configuración" subtitulo="Datos de su consultorio y sus tarifas" />

      <Card title="Consultorio">
        <Grid>
          <Campo full label="Nombre del consultorio o doctor" ayuda="Aparece en el menú, en los mensajes de confirmación y en los documentos impresos">
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={nombre} onChange={setNombre} />
              <Button onClick={guardarNombre} disabled={busy || nombre.trim() === clinica?.nombre}>Guardar</Button>
            </div>
          </Campo>
        </Grid>
      </Card>

      <Tarifas servicios={servicios} clinicaId={perfil.clinica_id} onCambio={recargar} />
    </>
  )
}

function Tarifas({ servicios, clinicaId, onCambio }) {
  const [nuevo, setNuevo] = useState({ categoria: 'Primera consulta', nombre: '', precio: '' })
  const [editando, setEditando] = useState(null) // { id, nombre, precio }

  const agregar = async () => {
    const n = nuevo.nombre.trim() || nuevo.categoria
    const { error } = await supabase.from('servicios').insert({ clinica_id: clinicaId, categoria: nuevo.categoria, nombre: n, precio: Number(nuevo.precio) || 0 })
    if (error) { toast.error('No se pudo agregar'); return }
    toast.success('Tarifa agregada')
    setNuevo(p => ({ ...p, nombre: '', precio: '' }))
    onCambio()
  }
  const guardar = async () => {
    if (!editando.nombre.trim()) { toast.error('Escriba el nombre'); return }
    const { error } = await supabase.from('servicios').update({ nombre: editando.nombre.trim(), precio: Number(editando.precio) || 0 }).eq('id', editando.id)
    if (error) { toast.error('No se pudo guardar'); return }
    setEditando(null)
    onCambio()
  }
  const eliminar = async (s) => {
    if (!confirm(`¿Eliminar "${s.nombre}" de sus tarifas? Las citas y cobros ya registrados no cambian.`)) return
    const { error } = await supabase.from('servicios').delete().eq('id', s.id)
    if (error) { toast.error('No se pudo eliminar'); return }
    onCambio()
  }

  const ayuda = {
    'Primera consulta': 'Ej. "Primera consulta" Q300',
    'Seguimiento': 'Ej. "Control post-operatorio" Q200',
    'Evaluación': 'Ej. "Evaluación estética" Q250',
    'Procedimiento': 'Ej. "Bótox frontal" Q2,500',
    'Cirugía': 'Ej. "Rinoplastía" Q17,000',
  }
  const btn = { width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', color: C.g600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }

  return (
    <Card title="Tarifas" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13.5, color: C.g500, marginTop: -8, marginBottom: 18, lineHeight: 1.6 }}>
        Registre sus servicios con su precio. Al registrar una cita se llena el precio automáticamente y se crea el cobro del paciente
        (luego puede aplicar un descuento en el expediente).
      </div>

      <div style={{ background: C.g50, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, alignItems: 'end' }}>
          <Campo label="Tipo"><Select value={nuevo.categoria} onChange={v => setNuevo(p => ({ ...p, categoria: v }))}>{TIPOS_CITA.map(t => <option key={t}>{t}</option>)}</Select></Campo>
          <Campo label="Nombre del servicio"><Input value={nuevo.nombre} onChange={v => setNuevo(p => ({ ...p, nombre: v }))} placeholder={ayuda[nuevo.categoria]} /></Campo>
          <Campo label="Precio (Q)"><Input type="number" min="0" step="0.01" value={nuevo.precio} onChange={v => setNuevo(p => ({ ...p, precio: v }))} placeholder="0.00" /></Campo>
          <Button icon="mas" onClick={agregar}>Agregar tarifa</Button>
        </div>
      </div>

      {TIPOS_CITA.map(cat => {
        const lista = servicios.filter(s => s.categoria === cat).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        return (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{cat}</div>
            {lista.length === 0 ? (
              <div style={{ fontSize: 13, color: C.g300, padding: '6px 0' }}>Sin tarifas</div>
            ) : lista.map(s => editando?.id === s.id ? (
              <div key={s.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderTop: `1px solid ${C.g100}`, flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 200px' }}><Input value={editando.nombre} onChange={v => setEditando(p => ({ ...p, nombre: v }))} /></div>
                <div style={{ flex: '1 1 120px' }}><Input type="number" min="0" step="0.01" value={editando.precio} onChange={v => setEditando(p => ({ ...p, precio: v }))} /></div>
                <Button size="sm" onClick={guardar}>Guardar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
              </div>
            ) : (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.g100}` }}>
                <div style={{ flex: 1, fontWeight: 600 }}>{s.nombre}</div>
                <div style={{ fontWeight: 700, minWidth: 110, textAlign: 'right' }}>{fmtQ(s.precio)}</div>
                <button style={btn} title="Editar" onClick={() => setEditando({ id: s.id, nombre: s.nombre, precio: String(s.precio) })}><Icon name="editar" size={15} /></button>
                <button style={{ ...btn, color: C.red }} title="Eliminar" onClick={() => eliminar(s)}><Icon name="eliminar" size={15} /></button>
              </div>
            ))}
          </div>
        )
      })}
    </Card>
  )
}

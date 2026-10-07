import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { MESES } from '../lib/constantes'
import { fmtFechaCorta } from '../lib/formato'
import { useDatos } from '../hooks/useDatos'
import { Segmentos } from './ui/Varios'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Campo, Input, filtroStyle } from './ui/Campos'
import { toast } from './ui/Toast'

const ESTE_ANIO = new Date().getFullYear()

// Years offered in every period picker: the ones added by hand + this year + any year with data. Newest first.
export function useAnios() {
  const { clinica, citas = [], pacientes = [], cobros = [] } = useDatos()
  const deDatos = [...citas.map(c => c.fecha), ...pacientes.map(p => p.created_at), ...cobros.map(c => c.fecha)]
    .filter(Boolean).map(f => Number(String(f).slice(0, 4)))
  return [...new Set([ESTE_ANIO, ...(clinica?.anios || []), ...deDatos])].filter(Boolean).sort((a, b) => b - a)
}

// { mes: '' | 0-11, anio: number | '', desde: 'YYYY-MM-DD', hasta } → does an ISO date fall inside?
export function enPeriodo(iso, p) {
  if (!iso) return false
  const d = String(iso).slice(0, 10)
  if (p.desde || p.hasta) return (!p.desde || d >= p.desde) && (!p.hasta || d <= p.hasta)
  if (p.anio !== '' && p.anio != null && Number(d.slice(0, 4)) !== Number(p.anio)) return false
  if (p.mes !== '' && p.mes != null && Number(d.slice(5, 7)) - 1 !== Number(p.mes)) return false
  return true
}

export function textoPeriodo(p) {
  if (p.desde || p.hasta) return `Del ${p.desde ? fmtFechaCorta(p.desde) : '…'} al ${p.hasta ? fmtFechaCorta(p.hasta) : '…'}`
  const mes = p.mes !== '' && p.mes != null ? MESES[p.mes] : null
  const anio = p.anio !== '' && p.anio != null ? p.anio : null
  return [mes, anio].filter(Boolean).join(' ') || 'Todas las fechas'
}

// Month (January…December, no year) + year selects
export function SelectorPeriodo({ valor, onChange, todosMeses = true, todosAnios = false }) {
  const anios = useAnios()
  const rango = !!(valor.desde || valor.hasta)
  return (
    <>
      <select value={valor.mes === '' || valor.mes == null ? '' : valor.mes} disabled={rango} onChange={e => onChange({ ...valor, mes: e.target.value === '' ? '' : Number(e.target.value) })} style={{ ...filtroStyle, opacity: rango ? 0.5 : 1 }} aria-label="Mes">
        {todosMeses && <option value="">Todos los meses</option>}
        {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
      </select>
      <select value={valor.anio ?? ''} disabled={rango} onChange={e => onChange({ ...valor, anio: e.target.value === '' ? '' : Number(e.target.value) })} style={{ ...filtroStyle, opacity: rango ? 0.5 : 1 }} aria-label="Año">
        {todosAnios && <option value="">Todos los años</option>}
        {anios.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </>
  )
}

// "From … to …" calendar range; overrides month/year while set
export function RangoFechas({ valor, onChange }) {
  const activo = !!(valor.desde || valor.hasta)
  const estilo = { ...filtroStyle, padding: '6px 10px', minHeight: 36 }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, color: C.g500 }}>Del</span>
      <input type="date" value={valor.desde || ''} onChange={e => onChange({ ...valor, desde: e.target.value })} style={estilo} aria-label="Desde" />
      <span style={{ fontSize: 13, color: C.g500 }}>al</span>
      <input type="date" value={valor.hasta || ''} min={valor.desde || undefined} onChange={e => onChange({ ...valor, hasta: e.target.value })} style={estilo} aria-label="Hasta" />
      {activo && <Button variant="texto" size="sm" onClick={() => onChange({ ...valor, desde: '', hasta: '' })}>Quitar fechas</Button>}
    </div>
  )
}

// "+ Agregar año": adds a year by hand to every period picker
export function AgregarAnio() {
  const { clinica, recargarSesion } = useDatos()
  const anios = useAnios()
  const [abierto, setAbierto] = useState(false)
  const [anio, setAnio] = useState('')
  const [busy, setBusy] = useState(false)
  const abrir = () => { setAnio(String(Math.max(...anios) + 1)); setAbierto(true) }
  const guardar = async () => {
    const n = Number(anio)
    if (!Number.isInteger(n) || n < 2000 || n > 2100) { toast.error('Escriba un año válido, por ejemplo 2027'); return }
    if (anios.includes(n)) { toast.error(`${n} ya está en la lista`); setAbierto(false); return }
    setBusy(true)
    const { error } = await supabase.from('clinicas').update({ anios: [...new Set([...(clinica.anios || []), n])] }).eq('id', clinica.id)
    setBusy(false)
    if (error) { toast.error('No se pudo agregar el año'); return }
    toast.success(`Se agregó ${n}`)
    setAbierto(false); recargarSesion()
  }
  return (
    <>
      <Button variant="ghost" size="sm" icon="mas" onClick={abrir}>Agregar año</Button>
      {abierto && (
        <Modal title="Agregar año" subtitle="Aparecerá en todos los selectores de período, el más nuevo primero" onClose={() => setAbierto(false)} maxWidth={380}>
          <Campo label="Año"><Input type="number" min="2000" max="2100" value={anio} onChange={setAnio} onKeyDown={e => { if (e.key === 'Enter') guardar() }} /></Campo>
          <div style={{ fontSize: 12.5, color: C.g500, marginTop: 10 }}>Años actuales: {anios.join(', ')}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={busy}>Agregar</Button>
          </div>
        </Modal>
      )}
    </>
  )
}

// "Todas | Guatemala | Petén" — only for plans with locations, and only when the clinic has created some
export function FiltroSede({ valor, onChange, contar }) {
  const { sedes = [], acc } = useDatos()
  if (!acc?.inventario || sedes.length === 0) return null
  return (
    <Segmentos valor={valor} onChange={onChange} opciones={[
      { value: '', label: 'Todas', n: contar?.('') },
      ...sedes.map(s => ({ value: s.id, label: s.nombre, n: contar?.(s.id) })),
    ]} />
  )
}

export const nombreSede = (sedes, id) => sedes?.find(s => s.id === id)?.nombre

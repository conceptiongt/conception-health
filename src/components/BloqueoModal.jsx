import { useState, useMemo } from 'react'
import { C } from '../lib/theme'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import { Input, Select } from './ui/Campos'
import { Segmentos } from './ui/Varios'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'
import { MiniCalendario } from './MiniCalendario'
import { hoyISO } from '../lib/formato'
import { NO_OCUPAN, aMinutos, deMinutos, duracionCita, esISO } from '../lib/calendario'
import { MAX_TITULO, TITULOS_RAPIDOS, guardarBloqueos, limpiarTitulo, mismoBloqueo, nuevoId, validarBloqueo } from '../lib/bloqueos'

// 06:00 … 22:00 every 30 minutes
const HORAS_BLOQUEO = (() => { const l = []; for (let m = 6 * 60; m <= 22 * 60; m += 30) l.push(deMinutos(m)); return l })()
const etiqueta = { display: 'block', fontSize: 13, fontWeight: 500, color: C.g600, marginBottom: 6 }
const chip = (activo) => ({
  padding: '6px 13px', borderRadius: 160, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
  border: `1.5px solid ${activo ? C.purple : C.g200}`, background: activo ? C.purpleMid : 'rgba(255,255,255,0.9)', color: activo ? 'var(--acento-fuerte)' : C.g600,
})

// «Bloquear agenda»: one day, a range of days, or specific hours, with a title. `bloqueo` = the block being edited (null = new).
// It saves through guardarBloqueos (re-reads the clinic's current list), so edits never drop what was saved meanwhile.
export function BloqueoModal({ bloqueo, fechaInicial, citas = [], clinica, onClose, onGuardado }) {
  const editando = !!bloqueo
  const [titulo, setTitulo] = useState(bloqueo?.motivo || '')
  const [modo, setModo] = useState(bloqueo?.hasta_fecha ? 'rango' : 'dia')
  const [fecha, setFecha] = useState(bloqueo?.fecha || (esISO(fechaInicial) ? fechaInicial : hoyISO()))
  const [hastaFecha, setHastaFecha] = useState(bloqueo?.hasta_fecha || '')
  const [horario, setHorario] = useState(bloqueo?.desde || bloqueo?.hasta ? 'horas' : 'todo')
  const [desde, setDesde] = useState(bloqueo?.desde || '09:00')
  const [hasta, setHasta] = useState(bloqueo?.hasta || '12:00')
  const [busy, setBusy] = useState(false)

  const fin = modo === 'rango' ? (hastaFecha || fecha) : fecha
  const actual = () => ({
    ...(bloqueo?.id ? { id: bloqueo.id } : {}),
    fecha, hasta_fecha: modo === 'rango' && hastaFecha > fecha ? hastaFecha : '',
    desde: horario === 'horas' ? desde : '', hasta: horario === 'horas' ? hasta : '', motivo: limpiarTitulo(titulo),
  })

  // appointments (still on the agenda) inside the chosen period; with hours chosen, only those overlapping them
  const citasEnPeriodo = useMemo(() => {
    if (!esISO(fecha) || fin < fecha) return 0
    const a = aMinutos(desde), b = aMinutos(hasta)
    return citas.filter(c => {
      const f = c.fecha?.slice(0, 10)
      if (!f || f < fecha || f > fin || NO_OCUPAN.includes(c.estado)) return false
      if (horario !== 'horas') return true
      if (!c.hora || a == null || b == null) return false
      const i = aMinutos(c.hora)
      return i < b && a < i + duracionCita(c)
    }).length
  }, [citas, fecha, fin, horario, desde, hasta])

  const guardar = async () => {
    const nuevo = actual()
    const fallo = validarBloqueo(nuevo)
    if (fallo) { toast.error(fallo); return }
    setBusy(true)
    try {
      const lista = await guardarBloqueos(clinica, (l) => editando ? l.map(x => mismoBloqueo(x, bloqueo) ? nuevo : x) : [...l, { id: nuevoId(), ...nuevo }])
      toast.success(editando ? 'Bloqueo actualizado' : 'Agenda bloqueada')
      onGuardado(lista)
    } catch (e) { toast.error(e.message || 'No se pudo guardar el bloqueo') }
    setBusy(false)
  }
  const quitar = async () => {
    if (!await confirmar(`¿Quitar el bloqueo${bloqueo.motivo ? ` «${bloqueo.motivo}»` : ''}? Esas fechas volverán a quedar libres para agendar.`)) return
    setBusy(true)
    try {
      const lista = await guardarBloqueos(clinica, (l) => l.filter(x => !mismoBloqueo(x, bloqueo)))
      toast.success('Bloqueo quitado')
      onGuardado(lista)
    } catch (e) { toast.error(e.message || 'No se pudo quitar el bloqueo') }
    setBusy(false)
  }

  const elegirInicio = (iso) => { setFecha(iso); if (hastaFecha && hastaFecha < iso) setHastaFecha(iso) }
  const enRango = modo === 'rango' ? (iso) => iso >= fecha && iso <= (hastaFecha || fecha) : undefined

  return (
    <Modal title={editando ? 'Editar bloqueo' : 'Bloquear agenda'} subtitle="Se marcan en el calendario y al agendar una cita." onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label htmlFor="bloqueo-titulo" style={etiqueta}>Título</label>
          <Input id="bloqueo-titulo" value={titulo} onChange={setTitulo} maxLength={MAX_TITULO} placeholder="Viaje, capacitación, congreso…" autoComplete="off" />
          <div role="group" aria-label="Títulos rápidos" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {TITULOS_RAPIDOS.map(t => <button key={t} type="button" aria-pressed={titulo === t} onClick={() => setTitulo(t)} style={chip(titulo === t)}>{t}</button>)}
          </div>
        </div>

        <div>
          <span style={etiqueta}>Fecha</span>
          <Segmentos valor={modo} onChange={setModo} opciones={[{ value: 'dia', label: 'Un día' }, { value: 'rango', label: 'Varios días' }]} />
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <MiniCalendario etiqueta={modo === 'rango' ? 'Desde' : 'Día'} valor={fecha} onElegir={elegirInicio} enRango={enRango} />
            {modo === 'rango' && <MiniCalendario etiqueta="Hasta" valor={hastaFecha} vacio="Elegir último día" minimo={fecha} onElegir={setHastaFecha} enRango={enRango} />}
          </div>
        </div>

        <div>
          <span style={etiqueta}>Horario</span>
          <Segmentos valor={horario} onChange={setHorario} opciones={[{ value: 'todo', label: 'Todo el día' }, { value: 'horas', label: 'Horas específicas' }]} />
          {horario === 'horas' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, color: C.g600 }}>De</span>
              <div style={{ width: 110 }}><Select aria-label="Hora de inicio" value={desde} onChange={setDesde}>{HORAS_BLOQUEO.map(h => <option key={h}>{h}</option>)}</Select></div>
              <span style={{ fontSize: 13.5, color: C.g600 }}>a</span>
              <div style={{ width: 110 }}><Select aria-label="Hora de fin" value={hasta} onChange={setHasta}>{HORAS_BLOQUEO.map(h => <option key={h}>{h}</option>)}</Select></div>
            </div>
          )}
        </div>

        {citasEnPeriodo > 0 && (
          <div role="status" style={{ background: C.amberLight, color: C.amber, borderRadius: 18, padding: '10px 14px', fontSize: 13.5, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon name="alerta" size={17} style={{ flexShrink: 0 }} />
            <span>Hay {citasEnPeriodo} {citasEnPeriodo === 1 ? 'cita agendada' : 'citas agendadas'} en ese período. El bloqueo no {citasEnPeriodo === 1 ? 'la cancela' : 'las cancela'}.</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 4 }}>
          {editando && <Button variant="danger" icon="eliminar" disabled={busy} onClick={quitar} style={{ marginRight: 'auto' }}>Quitar bloqueo</Button>}
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button icon="candado" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar bloqueo'}</Button>
        </div>
      </div>
    </Modal>
  )
}

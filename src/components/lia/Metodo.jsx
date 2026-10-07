import { C } from '../../lib/theme'
import { useLia } from '../../hooks/useLia'
import { Card } from '../ui/Varios'
import { Campo, Input, Select, Textarea } from '../ui/Campos'
import { Icon } from '../ui/Icon'
import { Interruptor, Titulo } from './Comunes'

const quitarBtn = { width: 34, height: 34, borderRadius: 9, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', color: C.g500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
const agregarBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 2px', border: 'none', background: 'none', color: C.purple, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }

// Editable list of short rules (closing, when to hand over, never)
function Lista({ ruta, valores, set, placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {valores.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}><Textarea rows={1} value={v} onChange={x => set(`${ruta}.${i}`, x)} placeholder={placeholder} aria-label={placeholder} /></div>
          <button style={quitarBtn} aria-label="Quitar" onClick={() => set(ruta, valores.filter((_, j) => j !== i))}><Icon name="cerrar" size={15} /></button>
        </div>
      ))}
      <div><button style={agregarBtn} onClick={() => set(ruta, [...valores, ''])}><Icon name="mas" size={15} />Agregar</button></div>
    </div>
  )
}

export function Metodo() {
  const { cfg, set } = useLia()
  const M = cfg.metodo, nombreLia = cfg.nombre || 'Lía'
  return (
    <>
      <div style={{ fontSize: 14, color: C.g500, lineHeight: 1.6, maxWidth: '75ch' }}>
        {nombreLia} no improvisa: sigue esta guía en cada conversación. Lo que cambie aquí lo aplica desde el siguiente mensaje, y lo puede comprobar en Probar.
      </div>

      <Titulo sub="Cómo lo reconoce y qué hace con cada uno.">Qué responder a cada tipo de paciente</Titulo>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {M.tipos.map((t, i) => (
          <Card key={t.id || i}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
              <div style={{ flex: 1 }}><Input value={t.nombre} onChange={v => set(`metodo.tipos.${i}.nombre`, v)} aria-label="Nombre del tipo de paciente" /></div>
              <button style={quitarBtn} aria-label="Quitar tipo de paciente" onClick={() => set('metodo.tipos', M.tipos.filter((_, j) => j !== i))}><Icon name="cerrar" size={15} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Campo label="Lo reconoce porque…"><Textarea rows={2} value={t.reconoce} onChange={v => set(`metodo.tipos.${i}.reconoce`, v)} /></Campo>
              <Campo label={`Qué hace ${nombreLia}`}><Textarea rows={3} value={t.hace} onChange={v => set(`metodo.tipos.${i}.hace`, v)} /></Campo>
            </div>
          </Card>
        ))}
        <button onClick={() => set('metodo.tipos', [...M.tipos, { id: 't' + Math.random().toString(36).slice(2, 7), nombre: 'Nuevo tipo de paciente', reconoce: '', hace: '' }])}
          style={{ border: `1.5px dashed ${C.g300}`, borderRadius: 12, background: 'none', minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.g500, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Icon name="mas" size={17} />Agregar tipo de paciente
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '0 16px' }}>
        <div>
          <Titulo sub="Para que la conversación termine en una cita en su agenda.">Cómo cerrar la cita</Titulo>
          <Card><Lista ruta="metodo.cierre" valores={M.cierre} set={set} placeholder="Regla para cerrar la cita" /></Card>
        </div>
        <div>
          <Titulo sub="Cuándo y cómo vuelve a escribir a quien no respondió.">Insistir sin hostigar</Titulo>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
              <Campo label="Máximo de recontactos">
                <Select value={String(M.insistir.max)} onChange={v => set('metodo.insistir.max', Number(v))}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} {n === 1 ? 'mensaje' : 'mensajes'}</option>)}
                </Select>
              </Campo>
              <Campo label="Desde"><Input type="time" value={M.insistir.desde} onChange={v => set('metodo.insistir.desde', v)} /></Campo>
              <Campo label="Hasta"><Input type="time" value={M.insistir.hasta} onChange={v => set('metodo.insistir.hasta', v)} /></Campo>
            </div>
            <div style={{ margin: '14px 0' }}><Interruptor id="insistir-domingo" checked={M.insistir.domingo} onChange={v => set('metodo.insistir.domingo', v)} label="Puede escribir en domingo" /></div>
            <Campo label="Si el paciente dice que no"><Textarea rows={2} value={M.insistir.no} onChange={v => set('metodo.insistir.no', v)} /></Campo>
          </Card>
        </div>
        <div>
          <Titulo sub="Le avisa al momento y deja de contestar ese tema.">Cuándo le pasa la conversación a usted</Titulo>
          <Card><Lista ruta="metodo.pasar" valores={M.pasar} set={set} placeholder="Caso que le pasa a usted" /></Card>
        </div>
        <div>
          <Titulo sub="Límites que no cruza aunque el paciente insista.">Lo que {nombreLia} nunca hace</Titulo>
          <Card><Lista ruta="metodo.nunca" valores={M.nunca} set={set} placeholder="Algo que nunca hace" /></Card>
        </div>
      </div>
    </>
  )
}

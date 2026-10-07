import { C } from '../lib/theme'
import { fmtQ } from '../lib/formato'
import { Campo, Input, Select } from './ui/Campos'

const OTRO = '__otro__'

// Service picker for a consultation type: choose from the clinic's price list or type a new one; fills the price
// valor = { servicioId, servicio, precio }
export function ServicioCampos({ tipo, servicios, valor, onChange, conPrecio = true, conPrecios = true }) {
  const opciones = servicios.filter(s => s.activo && s.categoria === tipo)
  const detalle = tipo === 'Cirugía' ? 'Tipo de cirugía' : tipo === 'Procedimiento' ? 'Tipo de procedimiento' : 'Servicio'
  const escribiendo = valor.servicioId === OTRO || (!valor.servicioId && !!valor.servicio)
  const seleccion = escribiendo ? OTRO : (valor.servicioId || '')

  const elegir = (id) => {
    if (id === OTRO) return onChange({ servicioId: OTRO, servicio: '', precio: '' })
    const s = opciones.find(o => o.id === id)
    onChange(s ? { servicioId: s.id, servicio: s.nombre, precio: String(s.precio) } : { servicioId: '', servicio: '', precio: '' })
  }

  return (
    <>
      <Campo label={detalle} ayuda={opciones.length ? undefined : 'Puede guardar sus servicios y precios en Configuración → Tarifas'}>
        {opciones.length > 0 ? (
          <Select value={seleccion} onChange={elegir}>
            <option value="">Seleccione…</option>
            {opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}{conPrecios && Number(o.precio) ? ` — ${fmtQ(o.precio)}` : ''}</option>)}
            <option value={OTRO}>Otro (escribir)…</option>
          </Select>
        ) : (
          <Input value={valor.servicio} onChange={v => onChange({ servicioId: OTRO, servicio: v, precio: valor.precio })} placeholder={tipo === 'Cirugía' ? 'Ej. Rinoplastía' : 'Escriba el servicio'} />
        )}
      </Campo>
      {opciones.length > 0 && escribiendo && (
        <Campo label={`Escriba el ${detalle.toLowerCase()}`}>
          <Input value={valor.servicio} onChange={v => onChange({ ...valor, servicioId: OTRO, servicio: v })} />
        </Campo>
      )}
      {conPrecio && (
        <Campo label="Precio (Q)" ayuda={<span style={{ color: C.g400 }}>Se registra como cobro pendiente del paciente</span>}>
          <Input type="number" min="0" step="0.01" value={valor.precio} onChange={v => onChange({ ...valor, precio: v })} placeholder="0.00" />
        </Campo>
      )}
    </>
  )
}

// Normalizes the picker value for saving
export function servicioParaGuardar(valor) {
  const catalogo = valor.servicioId && valor.servicioId !== OTRO ? valor.servicioId : null
  return { servicio_id: catalogo, servicio: valor.servicio?.trim() || null, precio: Number(valor.precio) || 0 }
}

export const servicioInicial = (tipo, servicios, cita) => {
  if (cita) return { servicioId: cita.servicio_id || (cita.servicio ? OTRO : ''), servicio: cita.servicio || '', precio: '' }
  const ops = servicios.filter(s => s.activo && s.categoria === tipo)
  // a single fixed rate for the type (e.g. "Primera consulta Q300") is picked automatically
  return ops.length === 1 ? { servicioId: ops[0].id, servicio: ops[0].nombre, precio: String(ops[0].precio) } : { servicioId: '', servicio: '', precio: '' }
}

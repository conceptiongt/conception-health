// Assistant permissions, chosen by the administrator (Configuración → Usuarios y permisos).
// The database enforces finanzas, configuracion and eliminar (RLS); the rest are hidden in the app.
export const PERMISOS = [
  { k: 'expedientes', label: 'Ver y editar expedientes clínicos', ayuda: 'Diagnósticos, recetas, notas y fotos de cada paciente', defecto: true },
  { k: 'finanzas', label: 'Ver cobros, pagos, saldos y todos los precios', ayuda: 'Pagos y saldos, ventas en Inicio y estados de cuenta. Sin esto solo ve los precios que usted marque en Tarifas', defecto: false },
  { k: 'inventario', label: 'Usar el inventario', ayuda: 'Productos, entradas, salidas, traslados y conteos', defecto: true },
  { k: 'costos', label: 'Ver costos del inventario', ayuda: 'Precio de cada producto y valor del inventario', defecto: false },
  { k: 'compras', label: 'Hacer órdenes de compra', ayuda: 'Pedir a proveedores y registrar órdenes que ya llegaron, con sus montos. No le muestra el costo de los productos en el inventario', defecto: false },
  { k: 'exportar', label: 'Descargar e imprimir reportes', ayuda: 'Excel, PDF e impresión de listas y reportes', defecto: true },
  { k: 'eliminar_citas', label: 'Eliminar citas', ayuda: 'Siempre pide el motivo; queda en el historial de citas eliminadas', defecto: true },
  { k: 'eliminar', label: 'Eliminar pacientes y expedientes', defecto: false },
  { k: 'configuracion', label: 'Cambiar la configuración', ayuda: 'Marca, tarifas, ficha clínica y sedes', defecto: false },
]
export const permisosIniciales = () => Object.fromEntries(PERMISOS.map(p => [p.k, p.defecto]))

export const esAdmin = (perfil) => perfil?.rol === 'dueno'
// permissions added later fall back to their default for assistants saved before them
// ('compras' used to be part of 'costos', so it inherits it)
export const puede = (perfil, k) => {
  if (esAdmin(perfil)) return true
  const p = perfil?.permisos || {}
  if (k in p) return !!p[k]
  if (k === 'compras' && 'costos' in p) return !!p.costos
  return !!PERMISOS.find(x => x.k === k)?.defecto
}

// Price of a service: assistants without "finanzas" only see the ones the administrator marked in Tarifas
export const verPrecio = (perfil, servicio) => puede(perfil, 'finanzas') || !!servicio?.visible_asistente

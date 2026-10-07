// Assistant permissions, chosen by the administrator (Configuración → Usuarios y permisos).
// The database enforces finanzas, configuracion and eliminar (RLS); the rest are hidden in the app.
export const PERMISOS = [
  { k: 'expedientes', label: 'Ver y editar expedientes clínicos', ayuda: 'Diagnósticos, recetas, notas y fotos de cada paciente', defecto: true },
  { k: 'finanzas', label: 'Ver cobros, pagos, saldos y precios', ayuda: 'Pagos y saldos, ventas en Inicio y estados de cuenta', defecto: false },
  { k: 'inventario', label: 'Usar el inventario', ayuda: 'Productos, entradas, compras y conteos', defecto: true },
  { k: 'eliminar', label: 'Eliminar pacientes y citas', defecto: false },
  { k: 'configuracion', label: 'Cambiar la configuración', ayuda: 'Marca, tarifas, ficha clínica y sedes', defecto: false },
]
export const permisosIniciales = () => Object.fromEntries(PERMISOS.map(p => [p.k, p.defecto]))

export const esAdmin = (perfil) => perfil?.rol === 'dueno'
export const puede = (perfil, k) => esAdmin(perfil) || !!perfil?.permisos?.[k]

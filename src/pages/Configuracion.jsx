import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { C, COLOR_BASE, aplicarMarca } from '../lib/theme'
import { TIPOS_CITA } from '../lib/constantes'
import { fmtQ } from '../lib/formato'
import { urlLogo, iniciales } from '../lib/marca'
import { useDatos } from '../hooks/useDatos'
import { Encabezado, Card, Segmentos, Badge } from '../components/ui/Varios'
import { Button } from '../components/ui/Button'
import { Campo, Input, Select, filtroStyle } from '../components/ui/Campos'
import { Icon } from '../components/ui/Icon'
import { toast } from '../components/ui/Toast'
import { VinculoStudio } from '../components/VinculoStudio'
import { SelectorColor } from '../components/SelectorColor'
import { SedeModal } from '../components/inventario/Formularios'

export function Configuracion() {
  const { servicios, perfil, recargar, acc } = useDatos()
  return (
    <>
      <Encabezado titulo="Configuración" subtitulo="Marca de su consultorio, sedes y tarifas" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Marca />
        {acc?.inventario && <Sedes />}
        <Tarifas servicios={servicios} clinicaId={perfil.clinica_id} onCambio={recargar} />
        <VinculoStudio />
      </div>
    </>
  )
}

// ─── Name, logo and color: used in the menu, the screens and every PDF ───
function Marca() {
  const { clinica, recargarSesion } = useDatos()
  const [nombre, setNombre] = useState(clinica?.nombre || '')
  const [color, setColor] = useState(clinica?.color || COLOR_BASE)
  const [busy, setBusy] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const logo = urlLogo(clinica)
  const cambiado = nombre.trim() !== (clinica?.nombre || '') || color.toUpperCase() !== (clinica?.color || COLOR_BASE).toUpperCase()

  const elegirColor = (c) => { setColor(c); aplicarMarca(c) } // live preview
  const guardar = async () => {
    if (!nombre.trim()) { toast.error('Escriba el nombre'); return }
    setBusy(true)
    const { error } = await supabase.from('clinicas').update({ nombre: nombre.trim(), color: color.toUpperCase() }).eq('id', clinica.id)
    setBusy(false)
    if (error) { toast.error('No se pudo guardar'); return }
    toast.success('Marca actualizada')
    recargarSesion()
  }
  const descartar = () => { setNombre(clinica?.nombre || ''); setColor(clinica?.color || COLOR_BASE); aplicarMarca(clinica?.color) }

  const subirLogo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Elija una imagen (PNG, JPG o SVG)'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('El logo debe pesar menos de 2 MB'); return }
    setSubiendo(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${clinica.id}/logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { contentType: file.type })
    if (!error) {
      const anterior = clinica.logo_path
      const { error: e2 } = await supabase.from('clinicas').update({ logo_path: path }).eq('id', clinica.id)
      if (!e2 && anterior) await supabase.storage.from('logos').remove([anterior])
      if (e2) toast.error('No se pudo guardar el logo')
      else { toast.success('Logo actualizado'); recargarSesion() }
    } else toast.error('No se pudo subir el logo')
    setSubiendo(false)
  }
  const quitarLogo = async () => {
    if (!confirm('¿Quitar el logo? Se mostrarán las iniciales del consultorio.')) return
    const anterior = clinica.logo_path
    await supabase.from('clinicas').update({ logo_path: null }).eq('id', clinica.id)
    if (anterior) await supabase.storage.from('logos').remove([anterior])
    toast.success('Logo quitado'); recargarSesion()
  }

  return (
    <Card title="Marca" right={cambiado && <div style={{ display: 'flex', gap: 8 }}><Button variant="ghost" size="sm" onClick={descartar}>Descartar</Button><Button size="sm" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button></div>}>
      <div style={{ fontSize: 13.5, color: C.g500, marginBottom: 18 }}>Su nombre, logo y color aparecen en el menú, en los botones y en todos los documentos PDF que imprima.</div>
      <div className="config-marca">
        <div>
          <Campo label="Nombre del consultorio o doctor"><Input value={nombre} onChange={setNombre} /></Campo>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: C.g600, margin: '18px 0 8px' }}>Logotipo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 84, height: 84, borderRadius: 24, border: `1px solid ${C.line}`, background: C.g50, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {logo ? <img src={logo} alt="Logo" style={{ maxWidth: '86%', maxHeight: '86%', objectFit: 'contain' }} />
                : <span style={{ width: 52, height: 52, borderRadius: 16, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{iniciales(nombre)}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.g200}`, background: '#fff', cursor: subiendo ? 'default' : 'pointer', fontSize: 13 }}>
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={subirLogo} disabled={subiendo} style={{ display: 'none' }} />
                <Icon name="subir" size={15} />{subiendo ? 'Subiendo…' : logo ? 'Cambiar logo' : 'Subir logo'}
              </label>
              {logo && <Button variant="texto" size="sm" onClick={quitarLogo}>Quitar logo</Button>}
              <span style={{ fontSize: 12, color: C.g400 }}>PNG con fondo transparente, máx. 2 MB</span>
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: C.g600, marginBottom: 8 }}>Color principal</div>
          <SelectorColor valor={color} onChange={elegirColor} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, padding: 12, borderRadius: 16, background: C.g50, border: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: C.g500 }}>Vista previa:</span>
            <Button size="sm">Botón principal</Button>
            <Button size="sm" variant="soft">Seleccionado</Button>
            <Badge color={color} bg={C.purpleMid}>Etiqueta</Badge>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── Locations (Max / Ultra): used for patients, appointments, payments and inventory ───
function Sedes() {
  const { sedes, recargar } = useDatos()
  const [editando, setEditando] = useState(undefined)
  return (
    <Card title="Sedes" right={<Button size="sm" variant="ghost" icon="mas" onClick={() => setEditando(null)}>Nueva sede</Button>}>
      <div style={{ fontSize: 13.5, color: C.g500, marginBottom: 12 }}>Cada paciente y cita puede llevar su sede, y en cada pantalla puede ver solo una sede o todas.</div>
      {sedes.length === 0 ? <div style={{ color: C.g400, fontSize: 13.5 }}>Aún no hay sedes. Ej. «Guatemala» y «Petén».</div> : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sedes.map(s => (
            <button key={s.id} onClick={() => setEditando(s)} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5 }}>
              <Icon name="sede" size={15} style={{ color: C.purple }} />{s.nombre}
              <span style={{ fontSize: 12, color: C.g400 }}>{s.tipo === 'departamental' ? 'Departamental' : 'Ciudad'}</span>
              <Icon name="editar" size={13} style={{ color: C.g400 }} />
            </button>
          ))}
        </div>
      )}
      {editando !== undefined && <SedeModal sede={editando} onClose={() => setEditando(undefined)} onGuardado={() => { setEditando(undefined); recargar() }} />}
    </Card>
  )
}

// ─── Price list: one compact searchable table ───
function Tarifas({ servicios, clinicaId, onCambio }) {
  const [buscar, setBuscar] = useState('')
  const [cat, setCat] = useState('')
  const [nuevo, setNuevo] = useState({ categoria: 'Procedimiento', nombre: '', precio: '' })
  const [editando, setEditando] = useState(null) // { id, nombre, precio, categoria }

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
    const { error } = await supabase.from('servicios').update({ nombre: editando.nombre.trim(), precio: Number(editando.precio) || 0, categoria: editando.categoria }).eq('id', editando.id)
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

  const q = buscar.trim().toLowerCase()
  const lista = servicios
    .filter(s => (!cat || s.categoria === cat) && (!q || s.nombre.toLowerCase().includes(q) || s.categoria.toLowerCase().includes(q)))
    .sort((a, b) => TIPOS_CITA.indexOf(a.categoria) - TIPOS_CITA.indexOf(b.categoria) || a.nombre.localeCompare(b.nombre, 'es'))
  const btn = { width: 30, height: 30, borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer', color: C.g500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
  const th = { padding: '9px 14px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: C.g500, background: C.g50, borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
  const td = { padding: '8px 14px', borderTop: `1px solid ${C.g100}`, verticalAlign: 'middle' }
  let previa = null

  return (
    <Card title={`Tarifas (${servicios.length})`}>
      <div style={{ fontSize: 13.5, color: C.g500, marginBottom: 14 }}>Al registrar una cita se llena el precio y se crea el cobro del paciente.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0,1fr) 140px auto', gap: 8, alignItems: 'end', marginBottom: 16 }} className="tarifa-nueva">
        <Campo label="Tipo"><Select value={nuevo.categoria} onChange={v => setNuevo(p => ({ ...p, categoria: v }))}>{TIPOS_CITA.map(t => <option key={t}>{t}</option>)}</Select></Campo>
        <Campo label="Servicio"><Input value={nuevo.nombre} onChange={v => setNuevo(p => ({ ...p, nombre: v }))} placeholder="Ej. Rinoplastía" onKeyDown={e => { if (e.key === 'Enter') agregar() }} /></Campo>
        <Campo label="Precio (Q)"><Input type="number" min="0" step="0.01" value={nuevo.precio} onChange={v => setNuevo(p => ({ ...p, precio: v }))} placeholder="0.00" onKeyDown={e => { if (e.key === 'Enter') agregar() }} /></Campo>
        <Button icon="mas" onClick={agregar}>Agregar</Button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Icon name="buscar" size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.g400 }} />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar servicio…" style={{ ...filtroStyle, width: '100%', paddingLeft: 32 }} />
        </div>
        <Segmentos valor={cat} onChange={setCat} opciones={[{ value: '', label: 'Todas', n: servicios.length }, ...TIPOS_CITA.map(t => ({ value: t, label: t, n: servicios.filter(s => s.categoria === t).length }))]} />
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead><tr><th style={th}>Servicio</th><th style={th}>Tipo</th><th style={{ ...th, textAlign: 'right' }}>Precio</th><th style={{ ...th, width: 80 }} /></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={4} style={{ padding: 26, textAlign: 'center', color: C.g400 }}>{servicios.length ? 'Ninguna tarifa coincide' : 'Aún no hay tarifas'}</td></tr>}
            {lista.map(s => {
              const grupo = !cat && !q && s.categoria !== previa
              previa = s.categoria
              return [
                grupo && <tr key={'g' + s.categoria}><td colSpan={4} style={{ padding: '8px 14px 6px', fontSize: 12, color: C.purple, fontWeight: 500, background: '#fff', borderTop: `1px solid ${C.g100}` }}>{s.categoria}</td></tr>,
                editando?.id === s.id ? (
                  <tr key={s.id}>
                    <td style={td}><Input value={editando.nombre} onChange={v => setEditando(p => ({ ...p, nombre: v }))} /></td>
                    <td style={td}><Select value={editando.categoria} onChange={v => setEditando(p => ({ ...p, categoria: v }))}>{TIPOS_CITA.map(t => <option key={t}>{t}</option>)}</Select></td>
                    <td style={td}><Input type="number" min="0" step="0.01" value={editando.precio} onChange={v => setEditando(p => ({ ...p, precio: v }))} /></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><Button size="sm" onClick={guardar}>Guardar</Button> <Button size="sm" variant="texto" onClick={() => setEditando(null)}>Cancelar</Button></td>
                  </tr>
                ) : (
                  <tr key={s.id} className="fila">
                    <td style={td}>{s.nombre}</td>
                    <td style={{ ...td, color: C.g500 }}>{s.categoria}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 500, whiteSpace: 'nowrap' }}>{fmtQ(s.precio)}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button style={btn} className="btn-ghost" title="Editar" onClick={() => setEditando({ id: s.id, nombre: s.nombre, precio: String(s.precio), categoria: s.categoria })}><Icon name="editar" size={15} /></button>
                      <button style={{ ...btn, color: C.red }} className="btn-ghost" title="Eliminar" onClick={() => eliminar(s)}><Icon name="eliminar" size={15} /></button>
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

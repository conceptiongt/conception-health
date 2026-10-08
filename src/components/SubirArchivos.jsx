import { useRef } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'

const EXT_IMAGEN = /\.(jpe?g|png|gif|webp|heic|heif)$/i
// some phones send photos without a type; recognise them by their name
export const tipoArchivo = (f) => f.type || (EXT_IMAGEN.test(f.name) ? (/\.hei[cf]$/i.test(f.name) ? 'image/heic' : 'image/jpeg') : /\.pdf$/i.test(f.name) ? 'application/pdf' : '')
export const archivoValido = (f) => { const t = tipoArchivo(f); return t.startsWith('image/') || t === 'application/pdf' }

// Uploads photos/PDFs of a patient (optionally tied to a consultation); returns how many failed
export async function subirArchivos(files, { clinicaId, pacienteId, citaId = null, etapa = 'estudio', fecha, notas = null }) {
  let errores = 0
  for (const file of files) {
    const tipo = tipoArchivo(file)
    const ext = tipo === 'application/pdf' ? 'pdf' : ((file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg')
    const path = `${clinicaId}/${pacienteId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('expedientes').upload(path, file, { contentType: tipo })
    if (error) { errores++; continue }
    const { error: e2 } = await supabase.from('archivos').insert({
      clinica_id: clinicaId, paciente_id: pacienteId, cita_id: citaId, etapa, fecha, notas, path, mime: tipo,
      nombre: (file.name || 'archivo').replace(/[<>]/g, '').slice(0, 200),
    })
    if (e2) { errores++; await supabase.storage.from('expedientes').remove([path]) }
  }
  return errores
}

// Two buttons: choose photos or PDFs from the device, or take a photo with the camera (phones and tablets)
export function BotonesSubir({ onArchivos, ocupado, texto = 'Elegir fotos o PDF' }) {
  const elegir = useRef(null), camara = useRef(null)
  const recibir = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (files.some(f => !archivoValido(f))) { toast.error('Solo se aceptan fotos o archivos PDF'); return }
    if (files.some(f => f.size > 25 * 1024 * 1024)) { toast.error('Cada archivo debe pesar menos de 25 MB'); return }
    onArchivos(files)
  }
  const estilo = { flex: '1 1 200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, border: `2px dashed ${C.g300}`, background: C.g50, cursor: ocupado ? 'default' : 'pointer', fontWeight: 600, fontSize: 14, color: ocupado ? C.purple : C.g600, fontFamily: 'inherit' }
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <input ref={elegir} type="file" accept="image/*,application/pdf,.heic,.heif" multiple onChange={recibir} style={{ display: 'none' }} />
      <input ref={camara} type="file" accept="image/*" capture="environment" onChange={recibir} style={{ display: 'none' }} />
      <button type="button" disabled={ocupado} onClick={() => elegir.current.click()} style={estilo}><Icon name="subir" size={18} />{ocupado || texto}</button>
      <button type="button" disabled={!!ocupado} onClick={() => camara.current.click()} style={{ ...estilo, flex: '0 1 180px' }}><Icon name="camara" size={18} />Tomar foto</button>
    </div>
  )
}

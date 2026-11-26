import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'
import { useDatos } from '../hooks/useDatos'
import { esAdmin } from '../lib/permisos'
import { Card, Badge, Tabla } from './ui/Varios'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { Icon } from './ui/Icon'
import { toast } from './ui/Toast'
import { confirmar } from './ui/Confirmar'

export const fmtMomento = (d) => d ? new Date(d).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

// Never select codigo_hash: the database does not even grant that column to the browser.
const COLUMNAS = 'id, creado_por, creado_nombre, creado_at, vence_at, usado_at, usado_nombre, revocado_at, terminado_at'

// One shared request for the history: it is also the probe that tells whether the support feature is installed in the database.
let consulta = null
const pedirAccesos = (forzar = false) => {
  if (!consulta || forzar) consulta = Promise.resolve(supabase.from('soporte_accesos').select(COLUMNAS).order('creado_at', { ascending: false }).limit(50)).catch(error => ({ data: null, error }))
  return consulta
}
// True when the support feature is live (owners only; anyone else is treated as not available). Cached, one network request.
export const soporteDisponible = () => pedirAccesos().then(({ error }) => !error)

// vigente / vencido / cancelado / terminado
export function estadoAcceso(a, ahora = Date.now()) {
  if (a.revocado_at) return 'cancelado'
  if (a.terminado_at) return 'terminado'
  if (new Date(a.vence_at).getTime() <= ahora) return 'vencido'
  return 'vigente'
}
const ESTILO = {
  vigente: { color: C.green, bg: C.greenLight, label: 'Vigente' },
  vencido: { color: C.g600, bg: C.g100, label: 'Vencido' },
  cancelado: { color: C.red, bg: C.redLight, label: 'Cancelado' },
  terminado: { color: C.g600, bg: C.g100, label: 'Terminado' },
}

// Configuración → «Acceso de soporte»: the clinic owner generates the code Conception's support needs to enter, and sees the history.
export function SoporteAcceso() {
  const { perfil } = useDatos()
  const admin = esAdmin(perfil)
  const [filas, setFilas] = useState(null) // null: loading
  const [disponible, setDisponible] = useState(true) // false while the database part is not installed yet
  const [codigo, setCodigo] = useState(null) // { texto, vence } shown once
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await pedirAccesos(true)
    if (error) { setDisponible(false); setFilas([]); return }
    setDisponible(true); setFilas(data || [])
  }, [])
  useEffect(() => {
    if (!admin) return
    // first load reuses the shared request (also used by DatosSeguridad); later reloads force a fresh one
    pedirAccesos().then(({ data, error }) => { if (error) { setDisponible(false); setFilas([]) } else { setDisponible(true); setFilas(data || []) } })
  }, [admin])
  if (!admin) return null

  const activo = (filas || []).find(a => estadoAcceso(a) === 'vigente')

  const generar = async () => {
    if (activo && !await confirmar({
      titulo: 'Ya hay un código vigente',
      mensaje: `Si genera uno nuevo, el anterior se cancela${activo.usado_at ? ' y se cierra la sesión de soporte que está en curso' : ''}.`,
      aceptar: 'Generar código nuevo',
    })) return
    setBusy(true)
    const { data, error } = await supabase.rpc('soporte_generar')
    setBusy(false)
    if (error || !data) { toast.error('No se pudo generar el código. Intente de nuevo.'); cargar(); return }
    setCodigo({ texto: data, vence: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })
    cargar()
  }
  const cancelar = async () => {
    if (!await confirmar({ mensaje: '¿Cancelar el acceso de soporte?\n\nEl código dejará de servir y, si soporte está dentro de su clínica, su sesión se cierra de inmediato.', aceptar: 'Cancelar acceso' })) return
    setBusy(true)
    const { error } = await supabase.rpc('soporte_revocar')
    setBusy(false)
    if (error) { toast.error('No se pudo cancelar el acceso'); return }
    toast.success('Acceso de soporte cancelado')
    cargar()
  }

  return (
    <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 34, height: 34, borderRadius: 11, background: C.purpleMid, color: 'var(--acento-fuerte)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="candado" size={18} /></span>
      Acceso de soporte
    </span>}>
      <div style={{ fontSize: 13.5, color: C.g500, lineHeight: 1.55, marginBottom: 14 }}>El equipo de soporte de Conception solo puede entrar a su clínica con un código que usted genera. Vence en 24 horas y puede cancelarlo cuando quiera.</div>

      {!disponible ? (
        <div style={{ background: C.g50, border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 14px', fontSize: 13.5, color: C.g600 }}>Disponible pronto.</div>
      ) : <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <Button icon="candado" onClick={generar} disabled={busy || filas === null}>Generar código de soporte</Button>
          {activo && (
            <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: C.g700 }}>
              <Badge color={ESTILO.vigente.color} bg={ESTILO.vigente.bg}>Código vigente</Badge>
              <span>Vence {fmtMomento(activo.vence_at)}{activo.usado_at ? <> · <strong>en uso por {activo.usado_nombre}</strong></> : ' · aún no se ha usado'}</span>
              <Button size="sm" variant="danger" onClick={cancelar} disabled={busy}>Cancelar acceso</Button>
            </div>
          )}
        </div>

        <div style={{ fontSize: 14, fontWeight: 600, color: C.black, marginBottom: 8 }}>Historial de accesos</div>
        {filas === null ? <div style={{ color: C.g400, fontSize: 13.5 }}>Cargando…</div> : (
          <Tabla
            columnas={['Creado', 'Creado por', 'Usado', 'Agente', 'Estado']}
            vacio="Aún no se ha generado ningún código."
            filas={filas.map(a => {
              const e = estadoAcceso(a); const s = ESTILO[e]
              return { key: a.id, celdas: [fmtMomento(a.creado_at), a.creado_nombre || '—', a.usado_at ? fmtMomento(a.usado_at) : 'No usado', a.usado_nombre || '—', <Badge key="e" color={s.color} bg={s.bg}>{s.label}</Badge>] }
            })}
          />
        )}
        <div style={{ fontSize: 12, color: C.g400, marginTop: 8 }}>Vigente: puede usarse hasta que venza. Terminado: soporte salió de su clínica. Cancelado: usted lo canceló o generó uno nuevo.</div>
      </>}

      {codigo && (
        <Modal title="Código de soporte" subtitle="Entréguelo solo a quien le está dando soporte" onClose={() => setCodigo(null)} maxWidth={460}>
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 'clamp(26px, 8vw, 38px)', fontWeight: 700, letterSpacing: '0.08em', color: C.black, background: C.g50, border: `1px solid ${C.line}`, borderRadius: 16, padding: '18px 10px', userSelect: 'all', overflowWrap: 'anywhere' }}>{codigo.texto}</div>
            <div style={{ fontSize: 13.5, color: C.g600, marginTop: 12 }}>Vence {fmtMomento(codigo.vence)} (24 horas).</div>
            <div style={{ fontSize: 13, color: C.amber, background: C.amberLight, borderRadius: 12, padding: '10px 12px', marginTop: 12, lineHeight: 1.5 }}>Cópielo ahora: por seguridad no se vuelve a mostrar. Si lo pierde, genere uno nuevo.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => setCodigo(null)}>Cerrar</Button>
            <Button icon="copiar" onClick={async () => {
              try { await navigator.clipboard.writeText(codigo.texto); toast.success('Código copiado') } catch { toast.error('No se pudo copiar; selecciónelo y cópielo a mano') }
            }}>Copiar</Button>
          </div>
        </Modal>
      )}
    </Card>
  )
}

import { C, SERIF, SHADOW, GLASS } from '../../lib/theme'

// Initials of a name ("María López" → "ML")
export const iniciales = (nombre) => (String(nombre || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase()

// Round avatar with initials, tinted with the clinic accent (or the dark variant used on navy panels)
export function Avatar({ nombre, size = 40, oscuro = false }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 600, letterSpacing: '0.02em', fontFamily: 'inherit',
      background: oscuro ? '#2C4468' : C.purpleLight, color: oscuro ? '#FFFFFF' : 'var(--acento-oscuro)',
    }}>{iniciales(nombre)}</span>
  )
}

// Large glass panel with an optional light headline, small uppercase eyebrow and right-side slot
export function Panel({ titulo, eyebrow, derecha, children, style, className }) {
  return (
    <section className={className} style={{ ...GLASS, borderRadius: 28, padding: 'clamp(18px, 2.2vw, 28px)', boxShadow: SHADOW, minWidth: 0, ...style }}>
      {(titulo || eyebrow || derecha) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {titulo && <h2 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 400, color: C.black, margin: eyebrow ? '4px 0 0' : 0, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{titulo}</h2>}
          </div>
          {derecha}
        </div>
      )}
      {children}
    </section>
  )
}

// Clickable block that is also reachable with the keyboard
export function Tocable({ onClick, children, className = '', style, label }) {
  if (!onClick) return <div className={className} style={style}>{children}</div>
  return (
    <div role="button" tabIndex={0} aria-label={label} className={`${className} tocable`} style={{ ...style, cursor: 'pointer' }}
      onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e) } }}>
      {children}
    </div>
  )
}

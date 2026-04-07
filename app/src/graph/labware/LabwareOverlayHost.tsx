import type { ReactNode } from 'react'

interface LabwareOverlayHostProps {
  title: string
  subtitle: string
  accent?: 'blue' | 'amber' | 'violet'
  footer?: ReactNode
}

const ACCENT_COLORS = {
  blue: '#0969da',
  amber: '#9a6700',
  violet: '#8250df',
} as const

export function LabwareOverlayHost({
  title,
  subtitle,
  accent = 'blue',
  footer,
}: LabwareOverlayHostProps) {
  const accentColor = ACCENT_COLORS[accent]

  return (
    <div className="labware-overlay-host">
      <strong style={{ color: accentColor }}>{title}</strong>
      <p>{subtitle}</p>
      {footer}

      <style>{`
        .labware-overlay-host {
          pointer-events: none;
          position: absolute;
          top: 0.75rem;
          left: 0.75rem;
          max-width: min(20rem, calc(100% - 1.5rem));
          padding: 0.7rem 0.8rem;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid rgba(208, 215, 222, 0.9);
          box-shadow: 0 8px 24px rgba(31, 35, 40, 0.08);
          backdrop-filter: blur(10px);
          z-index: 2;
        }

        .labware-overlay-host strong {
          display: block;
          margin-bottom: 0.2rem;
          font-size: 0.82rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .labware-overlay-host p {
          margin: 0;
          color: #57606a;
          font-size: 0.78rem;
          line-height: 1.4;
        }
      `}</style>
    </div>
  )
}

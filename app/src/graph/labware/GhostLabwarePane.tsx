/**
 * GhostLabwarePane - Displays proposed labware additions as dimmed cards.
 * 
 * Each ghost labware is rendered with 50% opacity, dashed border, and a "Proposed" badge.
 * If format is missing, shows a stub card with just the recordId and reason.
 */

import type { FC } from 'react'
import type { GhostLabware } from './DualLabwarePane'

interface GhostLabwarePaneProps {
  ghostLabwares: GhostLabware[]
}

interface GhostLabwareCardProps {
  ghost: GhostLabware
}

/**
 * Renders a single ghost labware card.
 * If format is available, could render a LabwareCanvas (not implemented yet).
 * Otherwise shows a stub card with recordId and reason.
 */
const GhostLabwareCard: FC<GhostLabwareCardProps> = ({ ghost }) => {
  return (
    <div
      className="ghost-labware-card"
      style={{
        opacity: 0.5,
        border: '2px dashed #be4bdb',
        borderRadius: 6,
        padding: 8,
        position: 'relative',
        background: '#f8f9fa',
        marginBottom: 8,
      }}
    >
      <span
        className="ghost-labware-card__badge"
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: '#be4bdb',
          color: 'white',
          fontSize: 10,
          padding: '2px 6px',
          borderRadius: 10,
        }}
      >
        Proposed
      </span>
      {ghost.format ? (
        <div className="ghost-labware-card__canvas-placeholder">
          <div style={{ fontSize: 12, color: '#666' }}>
            {ghost.title ?? ghost.recordId}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            {ghost.format.rows}x{ghost.format.cols} labware
          </div>
        </div>
      ) : (
        <div className="ghost-labware-card__stub">
          <div style={{ fontWeight: 600, fontSize: 12 }}>
            {ghost.title ?? ghost.recordId}
          </div>
          {ghost.reason ? (
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              {ghost.reason}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * GhostLabwarePane component - displays all ghost labwares as dimmed cards.
 * Returns null if no ghost labwares are provided.
 */
export const GhostLabwarePane: FC<GhostLabwarePaneProps> = ({ ghostLabwares }) => {
  if (ghostLabwares.length === 0) return null

  return (
    <div className="dual-pane__ghost-container" style={{ marginTop: 16 }}>
      {ghostLabwares.map((gl) => (
        <GhostLabwareCard key={gl.recordId} ghost={gl} />
      ))}
    </div>
  )
}

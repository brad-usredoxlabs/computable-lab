/**
 * Well component - Renders an individual well in the plate canvas.
 * Handles click events for selection with keyboard modifiers.
 */

import { useCallback, type MouseEvent } from 'react'
import type { WellId } from '../../types/plate'
import { useSelection } from '../context/SelectionContext'

interface WellProps {
  wellId: WellId
  x: number
  y: number
  radius: number
  hasContent?: boolean
  contentColor?: string
}

/**
 * Well - SVG circle representing a single plate well
 */
export function Well({
  wellId,
  x,
  y,
  radius,
  hasContent = false,
  contentColor,
}: WellProps) {
  const { isSelected, isHighlighted, selectWell } = useSelection()

  const selected = isSelected(wellId)
  const highlighted = isHighlighted(wellId)

  const handleClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      // Determine selection mode based on modifier keys
      let mode: 'single' | 'add' | 'range' = 'single'
      if (event.shiftKey) {
        mode = 'range'
      } else if (event.ctrlKey || event.metaKey) {
        mode = 'add'
      }

      selectWell(wellId, mode)
    },
    [wellId, selectWell]
  )

  // Determine well fill color
  let fillColor = '#f5f5f5' // Empty well (light gray)
  if (hasContent) {
    fillColor = contentColor || '#4dabf7' // Content color or default blue
  }

  // Determine stroke color and width based on state
  let strokeColor = '#dee2e6' // Default border
  let strokeWidth = 1
  if (selected) {
    strokeColor = '#228be6' // Primary selection blue
    strokeWidth = 2
  } else if (highlighted) {
    strokeColor = '#fab005' // Highlight yellow
    strokeWidth = 2
  }

  return (
    <g className="well" data-well-id={wellId}>
      {/* Well circle */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        onClick={handleClick}
        style={{ cursor: 'pointer' }}
      />
      {/* Selection ring (shown when selected) */}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={radius + 3}
          fill="none"
          stroke="#228be6"
          strokeWidth={1}
          strokeDasharray="3,2"
          pointerEvents="none"
        />
      )}
      {/* Hover highlight (CSS handles this via :hover) */}
    </g>
  )
}

/**
 * CSS styles for Well component (to be added to stylesheet)
 * 
 * .well circle:hover {
 *   filter: brightness(0.95);
 * }
 * 
 * .well[data-selected="true"] circle {
 *   stroke: #228be6;
 *   stroke-width: 2;
 * }
 */

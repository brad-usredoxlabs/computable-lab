import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Labware } from '../../types/labware'
import { isTipRackType } from '../../types/labware'
import type { WellId } from '../../types/plate'
import type { LabwareOrientation } from '../types'
import { useLongPress } from '../lib/useLongPress'

interface WellGeometry {
  wellId: WellId
  cx: number
  cy: number
  rx: number
  ry: number
  shape: 'circle' | 'rect' | 'tip'
}

export interface ComputedWellLayout {
  width: number
  height: number
  wells: WellGeometry[]
}

interface WellGridProps {
  labware: Labware
  orientation: LabwareOrientation
  size: number // long-edge size in CSS pixels
  hoveredWellId: WellId | null
  selectedWellIds: ReadonlySet<WellId>
  /**
   * Wells that are written/read by AI-proposed preview events. Rendered with
   * a purple "ghost" overlay so the user can see at the well level which
   * cells the floating Accept button will commit.
   */
  previewWellIds?: ReadonlySet<WellId>
  onHover: (wellId: WellId | null, event: React.MouseEvent | null) => void
  onWellClick?: (wellId: WellId, event: React.MouseEvent) => void
  onWellContextMenu?: (wellId: WellId, event: React.MouseEvent) => void
}

// SBS labware long edge ≈ 127 mm, short edge ≈ 85 mm. We model the canvas
// in mm space then scale to pixels via `size`.
const FRAME_LONG_MM = 127
const FRAME_SHORT_MM = 85
const FRAME_PADDING_MM = 8

const EMPTY_WELLS: ReadonlySet<WellId> = new Set()

export function WellGrid({
  labware,
  orientation,
  size,
  hoveredWellId,
  selectedWellIds,
  previewWellIds = EMPTY_WELLS,
  onHover,
  onWellClick,
  onWellContextMenu,
}: WellGridProps) {
  const layout = useMemo(() => computeLayout(labware, orientation), [labware, orientation])

  const pxPerMm = size / FRAME_LONG_MM
  const widthPx = layout.width * pxPerMm
  const heightPx = layout.height * pxPerMm

  const isTipRack = isTipRackType(labware.labwareType)

  // Touch long-press → context menu. We attach a single handler at the
  // SVG level and walk the touch target up to a `[data-well-id]` element
  // so we don't have to call `useLongPress` per well (hooks can't run
  // inside .map). Desktop right-click still flows through onContextMenu
  // on individual wells.
  const longPress = useLongPress((event) => {
    if (!onWellContextMenu) return
    const target = event.target as Element | null
    const node = target?.closest?.('[data-well-id]') as Element | null
    const wellId = node?.getAttribute('data-well-id')
    if (!wellId) return
    onWellContextMenu(wellId, event as unknown as React.MouseEvent)
  })

  return (
    <svg
      className="well-grid"
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      onMouseLeave={() => onHover(null, null)}
      {...longPress.handlers}
    >
      <rect
        x={0.5}
        y={0.5}
        width={layout.width - 1}
        height={layout.height - 1}
        rx={4}
        className="well-grid__frame"
      />
      {layout.wells.map((well) => {
        const hovered = well.wellId === hoveredWellId
        const selected = selectedWellIds.has(well.wellId)
        const previewed = previewWellIds.has(well.wellId)
        const interactive: CSSProperties = onWellClick ? { cursor: 'pointer' } : {}
        const common = {
          'data-well-id': well.wellId,
          'data-hovered': hovered ? 'true' : 'false',
          'data-selected': selected ? 'true' : 'false',
          'data-preview': previewed ? 'true' : 'false',
          'data-tip': isTipRack ? 'true' : 'false',
          onMouseEnter: (event: React.MouseEvent) => onHover(well.wellId, event),
          onMouseMove: (event: React.MouseEvent) => onHover(well.wellId, event),
          onClick: onWellClick
            ? (event: React.MouseEvent) => {
                // After a long-press, the OS still dispatches a synthetic
                // click. Drop it so we don't both open the context menu
                // AND select the well.
                if (longPress.consumeDidFire()) {
                  event.preventDefault()
                  return
                }
                onWellClick(well.wellId, event)
              }
            : undefined,
          onContextMenu: onWellContextMenu
            ? (event: React.MouseEvent) => {
                event.preventDefault()
                onWellContextMenu(well.wellId, event)
              }
            : undefined,
          style: interactive,
        }
        if (well.shape === 'tip') {
          return (
            <path
              key={well.wellId}
              d={`M ${well.cx - well.rx} ${well.cy - well.ry} L ${well.cx + well.rx} ${well.cy - well.ry} L ${well.cx} ${well.cy + well.ry} Z`}
              className="well-grid__tip"
              {...common}
            />
          )
        }
        if (well.shape === 'rect') {
          return (
            <rect
              key={well.wellId}
              x={well.cx - well.rx}
              y={well.cy - well.ry}
              width={well.rx * 2}
              height={well.ry * 2}
              rx={Math.min(well.rx, well.ry) * 0.3}
              className="well-grid__well"
              {...common}
            />
          )
        }
        return (
          <circle
            key={well.wellId}
            cx={well.cx}
            cy={well.cy}
            r={Math.min(well.rx, well.ry)}
            className="well-grid__well"
            {...common}
          />
        )
      })}
    </svg>
  )
}

function computeLayout(labware: Labware, orientation: LabwareOrientation): ComputedWellLayout {
  const isPortrait = orientation === 'portrait'
  const width = isPortrait ? FRAME_SHORT_MM : FRAME_LONG_MM
  const height = isPortrait ? FRAME_LONG_MM : FRAME_SHORT_MM
  const innerW = width - FRAME_PADDING_MM * 2
  const innerH = height - FRAME_PADDING_MM * 2
  const isTipRack = isTipRackType(labware.labwareType)

  const wells: WellGeometry[] = []
  const addressing = labware.addressing

  if (addressing.type === 'grid') {
    const rows = addressing.rowLabels ?? []
    const cols = addressing.columnLabels ?? []
    const visualRows = isPortrait ? cols : rows
    const visualCols = isPortrait ? rows : cols
    const cellW = innerW / visualCols.length
    const cellH = innerH / visualRows.length
    const wellRx = Math.max(1.2, Math.min(cellW, cellH) * 0.4)
    const wellRy = wellRx
    for (let r = 0; r < visualRows.length; r += 1) {
      for (let c = 0; c < visualCols.length; c += 1) {
        const rowLabel = isPortrait ? rows[c] : rows[r]
        const colLabel = isPortrait ? cols[r] : cols[c]
        if (!rowLabel || !colLabel) continue
        const wellId = `${rowLabel}${colLabel}`
        wells.push({
          wellId,
          cx: FRAME_PADDING_MM + c * cellW + cellW / 2,
          cy: FRAME_PADDING_MM + r * cellH + cellH / 2,
          rx: wellRx,
          ry: wellRy,
          shape: isTipRack ? 'tip' : 'circle',
        })
      }
    }
  } else if (addressing.type === 'linear') {
    const labels = addressing.linearLabels ?? []
    const linearAxis = labware.linearAxis ?? 'x'
    const visualAxis = isPortrait ? (linearAxis === 'x' ? 'y' : 'x') : linearAxis
    if (visualAxis === 'x') {
      const cellW = innerW / labels.length
      const wellRx = Math.max(2, cellW * 0.4)
      const wellRy = innerH * 0.4
      labels.forEach((label, i) => {
        wells.push({
          wellId: label,
          cx: FRAME_PADDING_MM + i * cellW + cellW / 2,
          cy: height / 2,
          rx: wellRx,
          ry: wellRy,
          shape: 'rect',
        })
      })
    } else {
      const cellH = innerH / labels.length
      const wellRy = Math.max(2, cellH * 0.4)
      const wellRx = innerW * 0.4
      labels.forEach((label, i) => {
        wells.push({
          wellId: label,
          cx: width / 2,
          cy: FRAME_PADDING_MM + i * cellH + cellH / 2,
          rx: wellRx,
          ry: wellRy,
          shape: 'rect',
        })
      })
    }
  } else {
    // Single-well reservoir / tube.
    wells.push({
      wellId: '1',
      cx: width / 2,
      cy: height / 2,
      rx: innerW * 0.42,
      ry: innerH * 0.42,
      shape: 'rect',
    })
  }

  return { width, height, wells }
}

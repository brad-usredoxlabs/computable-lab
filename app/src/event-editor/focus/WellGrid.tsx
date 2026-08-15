import { useEffect, useMemo, useRef } from 'react'
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
  /**
   * Optional per-well protocol-planning step status. When present, each well
   * gets a `data-protocol-step-status` attribute ('past' dimmed, 'current'
   * highlighted) so the deck shows which step the user is localizing now vs
   * already-done steps.
   */
  protocolStepStatus?: ReadonlyMap<WellId, 'current' | 'past'>
  /** Wells with committed or preview-computed material/volume state. */
  occupiedWellIds?: ReadonlySet<WellId>
  /**
   * Rack positions that hold a tube (empty or filled). Distinguishes an empty
   * slot (no tube) from an empty tube and a filled tube in the focus view.
   */
  tubeWellIds?: ReadonlyMap<WellId, { sizeLabel: string; maxVolume_uL: number }>
  /**
   * Per-well fill/stroke keyed on composition signature: replicates share a
   * hue, distinct conditions differ. Applied as inline style so the hue tracks
   * data; preview/hover states and the selection ring still take precedence.
   */
  compositionStyles?: ReadonlyMap<WellId, { fill: string; stroke: string }>
  onHover: (wellId: WellId | null, event: React.MouseEvent | null) => void
  onWellClick?: (wellId: WellId, event: React.MouseEvent) => void
  onWellContextMenu?: (wellId: WellId, event: React.MouseEvent) => void
  onWellRangeSelect?: (anchorWellId: WellId, targetWellId: WellId, event: React.PointerEvent) => void
}

// SBS labware long edge ≈ 127 mm, short edge ≈ 85 mm. We model the canvas
// in mm space then scale to pixels via `size`.
const FRAME_LONG_MM = 127
const FRAME_SHORT_MM = 85
const DEFAULT_FRAME_PADDING_MM = 8
const GRID_FRAME_PADDING_MM = 3.5

const EMPTY_WELLS: ReadonlySet<WellId> = new Set()
const EMPTY_TUBES: ReadonlyMap<WellId, { sizeLabel: string; maxVolume_uL: number }> = new Map()

export function WellGrid({
  labware,
  orientation,
  size,
  hoveredWellId,
  selectedWellIds,
  previewWellIds = EMPTY_WELLS,
  protocolStepStatus,
  occupiedWellIds = EMPTY_WELLS,
  tubeWellIds = EMPTY_TUBES,
  compositionStyles,
  onHover,
  onWellClick,
  onWellContextMenu,
  onWellRangeSelect,
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
    const wellId = wellIdFromEventTarget(event.target)
    if (!wellId) return
    onWellContextMenu(wellId, event as unknown as React.MouseEvent)
  })

  const dragRef = useRef<{
    pointerId: number
    anchorWellId: WellId
    lastWellId: WellId
    startX: number
    startY: number
    dragging: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const nativeDragListenersRef = useRef<{
    move: (event: PointerEvent) => void
    finish: (event: PointerEvent) => void
  } | null>(null)

  const removeNativeDragListeners = () => {
    const listeners = nativeDragListenersRef.current
    if (!listeners) return
    window.removeEventListener('pointermove', listeners.move, true)
    window.removeEventListener('pointerup', listeners.finish, true)
    window.removeEventListener('pointercancel', listeners.finish, true)
    nativeDragListenersRef.current = null
  }

  useEffect(() => removeNativeDragListeners, [])

  const updatePointerDrag = (event: React.PointerEvent<SVGSVGElement> | PointerEvent, svg: SVGSVGElement) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !onWellRangeSelect) return
    const wellId = wellIdFromPointerEvent(event, svg)
    if (!wellId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.dragging && dx * dx + dy * dy < 36) return
    const wasDragging = drag.dragging
    drag.dragging = true
    suppressClickRef.current = true
    if (wellId === drag.lastWellId && wasDragging) return
    drag.lastWellId = wellId
    event.preventDefault()
    onWellRangeSelect(drag.anchorWellId, wellId, event as unknown as React.PointerEvent)
  }

  const finishPointerDrag = (event: React.PointerEvent<SVGSVGElement> | PointerEvent, svg: SVGSVGElement) => {
    longPress.handlers.onPointerUp(event as unknown as React.PointerEvent)
    const drag = dragRef.current
    if (drag?.pointerId === event.pointerId) {
      svg.releasePointerCapture?.(event.pointerId)
      dragRef.current = null
    }
    removeNativeDragListeners()
  }

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    longPress.handlers.onPointerDown(event)
    if (!onWellRangeSelect) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const svg = event.currentTarget
    const wellId = wellIdFromPointerEvent(event, svg)
    if (!wellId) return
    dragRef.current = {
      pointerId: event.pointerId,
      anchorWellId: wellId,
      lastWellId: wellId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    }
    svg.setPointerCapture?.(event.pointerId)

    removeNativeDragListeners()
    const move = (nativeEvent: PointerEvent) => {
      longPress.handlers.onPointerMove(nativeEvent as unknown as React.PointerEvent)
      updatePointerDrag(nativeEvent, svg)
    }
    const finish = (nativeEvent: PointerEvent) => finishPointerDrag(nativeEvent, svg)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    nativeDragListenersRef.current = { move, finish }
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    longPress.handlers.onPointerMove(event)
    updatePointerDrag(event, event.currentTarget)
  }

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    finishPointerDrag(event, event.currentTarget)
  }

  const handlePointerLeave = (event: React.PointerEvent<SVGSVGElement>) => {
    longPress.handlers.onPointerLeave(event)
  }

  return (
    <svg
      className="well-grid"
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      onMouseLeave={() => onHover(null, null)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerLeave}
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
        const stepStatus = protocolStepStatus?.get(well.wellId)
        const occupied = occupiedWellIds.has(well.wellId)
        const hasTube = tubeWellIds.has(well.wellId)
        const interactive: CSSProperties = onWellClick ? { cursor: 'pointer' } : {}
        // Composition hue (inline) shows what's in the well. It yields to the
        // preview overlay and hover feedback (both transient/CSS-driven), and
        // its stroke yields to the amber selection ring so a selected well
        // still reads as selected while keeping its composition fill.
        const composition =
          well.shape !== 'tip' && !previewed && !hovered
            ? compositionStyles?.get(well.wellId)
            : undefined
        if (composition) {
          interactive.fill = composition.fill
          if (!selected) interactive.stroke = composition.stroke
        }
        const common = {
          'data-well-id': well.wellId,
          'data-hovered': hovered ? 'true' : 'false',
          'data-selected': selected ? 'true' : 'false',
          'data-preview': previewed ? 'true' : 'false',
          'data-protocol-step-status': stepStatus ?? undefined,
          'data-occupied': occupied ? 'true' : 'false',
          'data-tube': hasTube ? 'true' : 'false',
          'data-tip': isTipRack ? 'true' : 'false',
          onMouseEnter: (event: React.MouseEvent) => onHover(well.wellId, event),
          onMouseMove: (event: React.MouseEvent) => onHover(well.wellId, event),
          onClick: onWellClick
            ? (event: React.MouseEvent) => {
                // After a long-press, the OS still dispatches a synthetic
                // click. Drop it so we don't both open the context menu
                // AND select the well.
                if (longPress.consumeDidFire() || suppressClickRef.current) {
                  suppressClickRef.current = false
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
  const addressing = labware.addressing
  const isTipRack = isTipRackType(labware.labwareType)
  const framePadding = addressing.type === 'grid' && !isTipRack
    ? GRID_FRAME_PADDING_MM
    : DEFAULT_FRAME_PADDING_MM
  const innerW = width - framePadding * 2
  const innerH = height - framePadding * 2

  const wells: WellGeometry[] = []

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
          cx: framePadding + c * cellW + cellW / 2,
          cy: framePadding + r * cellH + cellH / 2,
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
          cx: framePadding + i * cellW + cellW / 2,
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
          cy: framePadding + i * cellH + cellH / 2,
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

function wellIdFromEventTarget(target: EventTarget | null): WellId | null {
  const node = target instanceof Element ? target.closest('[data-well-id]') : null
  return node?.getAttribute('data-well-id') ?? null
}

function wellIdFromPointerEvent(
  event: React.PointerEvent<SVGSVGElement> | PointerEvent,
  svg: SVGSVGElement,
): WellId | null {
  const direct = wellIdFromEventTarget(event.target)
  if (direct) return direct

  const hit = document.elementFromPoint(event.clientX, event.clientY)
  if (!hit || !svg.contains(hit)) return null
  return wellIdFromEventTarget(hit)
}

import type { DragEvent } from 'react'
import type { Labware } from '../../types/labware'
import { LABWARE_TYPE_ICONS } from '../../types/labware'
import type { EventEditorPlacement, LabwareOrientation } from '../types'

interface LabwareTileProps {
  labware: Labware
  placement: EventEditorPlacement
  orientation: LabwareOrientation
  variant: 'slot' | 'lawn'
  width?: number
  height?: number
  /** True when this tile is a proposed AI placement (rendered as a ghost). */
  ghost?: boolean
  /**
   * True when this committed tile is targeted by a preview event — used to
   * draw attention to the labware the user should drill into to inspect the
   * proposal before accepting.
   */
  affected?: boolean
  onRemove?: () => void
  onRotate?: () => void
  onFocus?: () => void
}

const SLOT_LANDSCAPE = { w: 126, h: 80 }
const SLOT_PORTRAIT = { w: 80, h: 126 }
const LAWN_LANDSCAPE = { w: 110, h: 70 }
const LAWN_PORTRAIT = { w: 70, h: 110 }

export function LabwareTile({
  labware,
  placement,
  orientation,
  variant,
  width,
  height,
  ghost = false,
  affected = false,
  onRemove,
  onRotate,
  onFocus,
}: LabwareTileProps) {
  const sized =
    width && height
      ? { w: width, h: height }
      : variant === 'slot'
        ? orientation === 'portrait'
          ? SLOT_PORTRAIT
          : SLOT_LANDSCAPE
        : orientation === 'portrait'
          ? LAWN_PORTRAIT
          : LAWN_LANDSCAPE

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData(
      'application/x-event-editor-placement',
      placement.placementId,
    )
    event.dataTransfer.effectAllowed = 'move'
  }

  const tileTitle = ghost
    ? `${labware.name} · proposed — click to drill in and inspect, then Accept to keep`
    : affected
      ? `${labware.name} · affected by preview — click to inspect`
      : `${labware.name} · ${labware.labwareType} (${orientation}) — click to focus`

  return (
    <div
      className="tile"
      data-variant={variant}
      data-orientation={orientation}
      data-ghost={ghost ? 'true' : 'false'}
      data-affected={affected && !ghost ? 'true' : 'false'}
      draggable={!ghost}
      onDragStart={ghost ? undefined : handleDragStart}
      onClick={(event) => {
        if (!onFocus) return
        // Ignore clicks that originated on a control button.
        if ((event.target as HTMLElement).closest('.tile__btn')) return
        event.stopPropagation()
        onFocus()
      }}
      style={{ width: sized.w, height: sized.h }}
      title={tileTitle}
    >
      <span className="tile__icon" aria-hidden>{LABWARE_TYPE_ICONS[labware.labwareType]}</span>
      <span className="tile__name">{labware.name}</span>
      {ghost ? <span className="tile__ghost-tag">Proposed</span> : null}
      {!ghost && affected ? <span className="tile__affected-tag">Preview</span> : null}
      {!ghost ? (
        <div className="tile__controls" onMouseDown={(e) => e.stopPropagation()}>
          {onRotate ? (
            <button
              type="button"
              className="tile__btn"
              onClick={(e) => {
                e.stopPropagation()
                onRotate()
              }}
              title="Rotate (portrait ↔ landscape)"
            >⟲</button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              className="tile__btn tile__btn--danger"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              title="Remove"
            >×</button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

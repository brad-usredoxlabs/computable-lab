import { useState, type DragEvent } from 'react'
import { getDeckSlotLockedOrientation, getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import type { PlatformSlotManifest } from '../../types/platformRegistry'
import { useEventEditor } from '../EventEditorContext'
import { resolveOrientation, validatePlacement } from '../lib/placementRules'
import { AddLabwareDialog } from './AddLabwareDialog'
import { LabwareTile } from './LabwareTile'
import type { EventEditorPlacement, LabwareOrientation } from '../types'
import type { Labware } from '../../types/labware'

interface DeckSlotProps {
  slot: PlatformSlotManifest
}

export function DeckSlot({ slot }: DeckSlotProps) {
  const { state, actions } = useEventEditor()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isDragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)

  const orientationLock = getDeckSlotLockedOrientation(slot)
  const reachable = slot.reachable !== false
  const isStaging = slot.stagingOnly === true
  const isTrash = slot.kind === 'trash'
  const canHoldLabware = !isTrash && reachable && slot.kind !== 'special'

  const placement = state.placements.find(
    (p): p is EventEditorPlacement & { location: { kind: 'slot'; slotId: string } } =>
      p.location.kind === 'slot' && p.location.slotId === slot.id,
  )
  const labware = placement ? state.labwares[placement.labwareId] : null

  const platform = getPlatformManifest(state.platforms, state.platformId)
  const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)

  const title = [
    `Slot ${slot.id}`,
    slot.label,
    orientationLock ? `orientation: ${orientationLock} (locked)` : null,
    isStaging ? 'staging — gripper only' : null,
    !canHoldLabware && !isTrash && !isStaging ? 'not pipette-reachable' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  function handleClick() {
    if (!canHoldLabware || placement) return
    setDialogOpen(true)
  }

  function handlePick(picked: Labware) {
    if (!platform || !variant) return
    const validation = validatePlacement({
      platform,
      variant,
      location: { kind: 'slot', slotId: slot.id },
      labware: picked,
    })
    if (!validation.ok) {
      setDropError(validation.errors.join(' '))
      return
    }
    const orientation = resolveOrientation(validation, undefined, picked)
    actions.placeNewLabware(picked, { kind: 'slot', slotId: slot.id }, orientation)
    setDropError(null)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!canHoldLabware) return
    if (!event.dataTransfer.types.includes('application/x-event-editor-placement')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
    if (!platform || !variant || !canHoldLabware) return
    const placementId = event.dataTransfer.getData('application/x-event-editor-placement')
    if (!placementId) return
    const moving = state.placements.find((p) => p.placementId === placementId)
    if (!moving) return
    if (moving.location.kind === 'slot' && moving.location.slotId === slot.id) return
    const movingLabware = state.labwares[moving.labwareId]
    if (!movingLabware) return
    const validation = validatePlacement({
      platform,
      variant,
      location: { kind: 'slot', slotId: slot.id },
      labware: movingLabware,
      desiredOrientation: moving.orientation,
    })
    if (!validation.ok) {
      setDropError(validation.errors.join(' '))
      return
    }
    const orientation = resolveOrientation(validation, moving.orientation, movingLabware)
    actions.movePlacement(moving.placementId, { kind: 'slot', slotId: slot.id }, orientation)
    setDropError(null)
  }

  function handleRemove() {
    if (placement) actions.removePlacement(placement.placementId)
  }

  function handleRotate() {
    if (!placement || !labware || !platform || !variant) return
    const next: LabwareOrientation = placement.orientation === 'portrait' ? 'landscape' : 'portrait'
    const validation = validatePlacement({
      platform,
      variant,
      location: { kind: 'slot', slotId: slot.id },
      labware,
      desiredOrientation: next,
    })
    if (!validation.ok) {
      setDropError(validation.errors.join(' '))
      return
    }
    const orientation = resolveOrientation(validation, next, labware)
    actions.movePlacement(placement.placementId, placement.location, orientation)
  }

  return (
    <div
      className="slot"
      data-kind={slot.kind}
      data-staging={isStaging ? 'true' : 'false'}
      data-reachable={reachable ? 'true' : 'false'}
      data-orientation={slot.orientationMode ?? 'flippable'}
      data-occupied={placement ? 'true' : 'false'}
      data-dragover={isDragOver ? 'true' : 'false'}
      style={{ gridRow: slot.row, gridColumn: slot.col }}
      title={title}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="slot__id">{slot.id}</span>
      {placement && labware ? (
        <LabwareTile
          labware={labware}
          placement={placement}
          orientation={placement.orientation}
          variant="slot"
          onRemove={handleRemove}
          onRotate={!orientationLock ? handleRotate : undefined}
          onFocus={() => actions.setFocus(placement.placementId)}
        />
      ) : (
        <>
          <span className="slot__label">
            {canHoldLabware ? <span className="slot__add">+ add</span> : slot.label ?? slot.kind}
          </span>
          {isStaging ? <span className="slot__badge">staging</span> : null}
          {orientationLock === 'portrait' ? <span className="slot__badge">portrait</span> : null}
        </>
      )}
      {dropError ? (
        <div className="slot__error" onAnimationEnd={() => setDropError(null)}>
          {dropError}
        </div>
      ) : null}
      <AddLabwareDialog
        open={dialogOpen}
        contextLabel={`Slot ${slot.id}`}
        onClose={() => setDialogOpen(false)}
        onPick={handlePick}
      />
    </div>
  )
}

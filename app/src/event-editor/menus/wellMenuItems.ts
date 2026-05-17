import type { ContextMenuItem } from './ContextMenu'
import type { Labware } from '../../types/labware'
import type { WellId } from '../../types/plate'
import type { TipState } from '../types'
import type { EventEditorActions } from '../EventEditorContext'
import { formatVolume, getWellState, type LabwareStates } from '../../graph/lib/eventGraph'

interface BuildArgs {
  labware: Labware
  labwareStates: LabwareStates
  targetWells: WellId[]
  tip: TipState
  actions: EventEditorActions
  onClearSelection: () => void
  onInspect?: (wellId: WellId) => void
}

export function buildWellMenuItems({
  labware,
  labwareStates,
  targetWells,
  tip,
  actions,
  onClearSelection,
  onInspect,
}: BuildArgs): { title: string; items: ContextMenuItem[] } {
  const labwareId = labware.labwareId
  const single = targetWells.length === 1
  const title = single
    ? `Well ${targetWells[0]}`
    : `${targetWells.length} wells (${targetWells[0]}…${targetWells[targetWells.length - 1]})`

  // Cumulative volume across target wells (informs aspirate visibility).
  let anyHasVolume = false
  let firstNonEmptyLabel: string | null = null
  let firstNonEmptyVolume = 0
  for (const wellId of targetWells) {
    const wellState = getWellState(labwareStates, labwareId, wellId)
    if (wellState.volume_uL > 0) {
      anyHasVolume = true
      if (firstNonEmptyLabel === null) {
        firstNonEmptyLabel = wellState.materials[0]?.materialRef ?? 'liquid'
        firstNonEmptyVolume = wellState.volume_uL
      }
    }
  }

  const items: ContextMenuItem[] = []

  // ---- Aspirate (tip empty, well(s) have volume) ----
  items.push({
    id: 'aspirate',
    label: 'Aspirate…',
    icon: '🩸',
    detail: tip.kind === 'loaded' ? 'tip loaded' : !anyHasVolume ? 'empty' : undefined,
    disabled: tip.kind === 'loaded' || !anyHasVolume,
    onSelect: () => {
      const fallback = firstNonEmptyVolume > 0 ? String(firstNonEmptyVolume) : '50'
      const input = window.prompt(`Aspirate volume (µL) from ${title}:`, fallback)
      if (input === null) return
      const volume_uL = Number(input)
      if (!Number.isFinite(volume_uL) || volume_uL <= 0) return
      actions.applyAspirate({
        labwareId,
        wells: targetWells,
        volume_uL,
        sourceLabel: firstNonEmptyLabel
          ? `${formatVolume(volume_uL)} ${firstNonEmptyLabel}`
          : formatVolume(volume_uL),
      })
    },
  })

  // ---- Dispense (tip loaded) ----
  items.push({
    id: 'dispense',
    label: tip.kind === 'loaded' ? `Dispense ${formatVolume(tip.volume_uL)}` : 'Dispense',
    icon: '⬇️',
    detail: tip.kind === 'loaded' ? tip.sourceLabel : 'tip empty',
    disabled: tip.kind !== 'loaded',
    onSelect: () => {
      actions.applyDispense({ destLabwareId: labwareId, destWells: targetWells })
    },
  })

  // ---- Add material ----
  items.push({
    id: 'add-material',
    label: single ? 'Add material…' : 'Add material to all…',
    icon: '💧',
    onSelect: () => {
      const materialRef = window.prompt(`Material to add to ${title}:`, 'DMEM')
      if (!materialRef) return
      const volumeInput = window.prompt('Volume (µL):', '100')
      if (volumeInput === null) return
      const volume_uL = Number(volumeInput)
      if (!Number.isFinite(volume_uL) || volume_uL <= 0) return
      actions.applyAddMaterial({ labwareId, wells: targetWells, materialRef, volume_uL })
    },
  })

  // ---- Mix ----
  items.push({
    id: 'mix',
    label: single ? 'Mix' : 'Mix all',
    icon: '🔄',
    onSelect: () => {
      actions.appendEvent({
        eventId: `evt-${Date.now()}-mix`,
        event_type: 'mix',
        details: { labwareId, wells: targetWells },
      })
    },
  })

  // ---- Inspect (single only) ----
  if (single && onInspect) {
    items.push({
      id: 'inspect',
      label: 'Inspect well',
      icon: '🔍',
      onSelect: () => onInspect(targetWells[0] as WellId),
    })
  }

  // ---- Multi-well only: planned but not yet wired ----
  if (!single) {
    items.push({
      id: 'repeat-dispense',
      label: 'Repeat dispense from…',
      icon: '🔁',
      detail: 'coming soon',
      disabled: true,
    })
    items.push({
      id: 'serial-dilution',
      label: 'Serial dilution',
      icon: '⚙️',
      detail: 'coming soon',
      disabled: true,
    })
  }

  items.push({
    id: 'clear-selection',
    label: 'Clear selection',
    icon: '✕',
    onSelect: onClearSelection,
  })

  return { title, items }
}

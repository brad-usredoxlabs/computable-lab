import type { Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import type { WellId } from '../../types/plate'
import type { EventEditorPreview } from '../EventEditorContext'
import type { LabwareStates, WellComputedState } from '../../graph/lib/eventGraph'

export function eventsWithPreviewState(
  committedEvents: PlateEvent[],
  preview: EventEditorPreview | null,
): PlateEvent[] {
  if (!preview || preview.previewEvents.length === 0) return committedEvents
  return [...committedEvents, ...preview.previewEvents]
}

export function labwareMapWithPreviewState(
  committedLabwares: Record<string, Labware>,
  preview: EventEditorPreview | null,
): Map<string, Labware> {
  const labwareMap = new Map<string, Labware>()
  for (const lw of Object.values(committedLabwares)) labwareMap.set(lw.labwareId, lw)
  for (const lw of Object.values(preview?.previewLabwares ?? {})) labwareMap.set(lw.labwareId, lw)
  return labwareMap
}

function wellHasVisibleState(state: WellComputedState): boolean {
  return state.volume_uL > 0 || state.materials.length > 0 || state.harvested
}

export function occupiedWellsForLabware(
  labwareStates: LabwareStates | null,
  labwareId: string | undefined,
): Set<WellId> {
  const occupied = new Set<WellId>()
  if (!labwareStates || !labwareId) return occupied
  const wellStates = labwareStates.get(labwareId)
  if (!wellStates) return occupied
  for (const [wellId, state] of wellStates.entries()) {
    if (wellHasVisibleState(state)) occupied.add(wellId)
  }
  return occupied
}

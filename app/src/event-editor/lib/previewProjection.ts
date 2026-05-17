import { getAffectedWells } from '../../types/events'
import type { PlateEvent } from '../../types/events'
import type { WellId } from '../../types/plate'
import type { EventEditorPlacement } from '../types'
import type { EventEditorPreview } from '../EventEditorContext'

/**
 * Per-labware index of which wells are written/read by preview events.
 *
 * Built once per preview at the page level and passed down so WellGrid and
 * LabwareFocus don't have to re-walk events for every well.
 */
export interface PreviewWellIndex {
  /** labwareId → set of WellIds touched by at least one preview event. */
  byLabware: Map<string, Set<WellId>>
  /** Every preview event, grouped by the labwareId it touches. */
  eventsByLabware: Map<string, PlateEvent[]>
}

const EMPTY_WELLS: ReadonlySet<WellId> = new Set()

export function buildPreviewWellIndex(preview: EventEditorPreview | null): PreviewWellIndex {
  const byLabware = new Map<string, Set<WellId>>()
  const eventsByLabware = new Map<string, PlateEvent[]>()
  if (!preview) return { byLabware, eventsByLabware }

  for (const event of preview.previewEvents) {
    const labwareIds = collectEventLabwareIds(event)
    const wells = getAffectedWells(event)
    for (const labwareId of labwareIds) {
      if (!byLabware.has(labwareId)) byLabware.set(labwareId, new Set())
      const set = byLabware.get(labwareId)!
      for (const w of wells) set.add(w)
      if (!eventsByLabware.has(labwareId)) eventsByLabware.set(labwareId, [])
      eventsByLabware.get(labwareId)!.push(event)
    }
  }
  return { byLabware, eventsByLabware }
}

/**
 * Set of labwareIds touched by at least one preview event — committed labware
 * tiles use this to show an "affected" outline so the user knows where to
 * drill in.
 */
export function previewAffectedLabwareIds(index: PreviewWellIndex): ReadonlySet<string> {
  return new Set(index.byLabware.keys())
}

export function previewWellsForLabware(
  index: PreviewWellIndex,
  labwareId: string,
): ReadonlySet<WellId> {
  return index.byLabware.get(labwareId) ?? EMPTY_WELLS
}

/**
 * Look up a preview placement that anchors to a specific deck slot. Returns
 * null when nothing in the current preview targets that slot.
 */
export function previewPlacementForSlot(
  preview: EventEditorPreview | null,
  slotId: string,
): EventEditorPlacement | null {
  if (!preview) return null
  return (
    preview.previewPlacements.find(
      (p) => p.location.kind === 'slot' && p.location.slotId === slotId,
    ) ?? null
  )
}

/**
 * Preview placements anchored to the freeform lawn surface.
 */
export function previewLawnPlacements(
  preview: EventEditorPreview | null,
): EventEditorPlacement[] {
  if (!preview) return []
  return preview.previewPlacements.filter((p) => p.location.kind === 'lawn')
}

/**
 * Walk an event's details for any labwareId references. Mirrors the shape
 * walked by `getAffectedWells` so the two functions stay in sync.
 */
function collectEventLabwareIds(event: PlateEvent): string[] {
  const details = event.details as Record<string, unknown>
  const out: string[] = []
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0) out.push(value)
  }
  push(details.labwareId)
  push(details.source_labwareId)
  push(details.dest_labwareId)
  const source = details.source as { labwareId?: unknown } | undefined
  const target = details.target as { labwareId?: unknown } | undefined
  push(source?.labwareId)
  push(target?.labwareId)
  return [...new Set(out)]
}

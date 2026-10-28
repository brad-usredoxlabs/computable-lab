/**
 * buildEventWellIndex — L2-SUITE-A-uifix1 D4: the DECK's per-labware well
 * footprint index, data-driven from the EVENT RECORD (staged OR committed).
 *
 * Why: the per-labware well index existed for the FOCUS surface only
 * (wellStateProjection.ts, computed from LabwareStates); the deck tiles
 * consumed `previewIndex.byLabware.has(labwareId)` — a binary tile-level
 * flag from PREVIEW events alone — and the tile/glyph had no per-well
 * input, so the well SET never reached the tile at any point (staged or
 * committed). The gate: a 42-well add_material (B1:H6) staged OR accepted
 * left the deck plate tile showing 96 visually identical, unmarked wells
 * (data-affected="true" count 0 in both the staged AND the accepted shot —
 * the accepted shot proves the index must cover COMMITTED events, not only
 * the preview).
 *
 * The walker mirrors previewProjection's previewEvents discipline
 * (collectEventLabwareIds + getAffectedWells, types/events.ts:450) over
 * COMMITTED events + the preview's events, so source/dest labware
 * references (transfers affect both sides) and every well-bearing details
 * shape ride the SAME extraction the focus surface already trusts.
 */
import { getAffectedWells } from '../../types/events'
import type { PlateEvent } from '../../types/events'
import type { WellId } from '../../types/plate'
import type { EventEditorPreview } from '../EventEditorContext'

/** labwareId → the set of WellIds touched by at least one committed or
 *  preview event on that labware (empty set is never stored). */
export function buildEventWellIndex(
  committedEvents: PlateEvent[],
  preview: EventEditorPreview | null,
): Map<string, Set<WellId>> {
  const byLabware = new Map<string, Set<WellId>>()

  const add = (event: PlateEvent) => {
    const details = event.details as Record<string, unknown>
    // The labware references, mirroring collectEventLabwareIds
    // (previewProjection.ts) so the two walkers stay in sync.
    const ids: string[] = []
    const push = (value: unknown) => {
      if (typeof value === 'string' && value.length > 0) ids.push(value)
    }
    push(details.labwareId)
    push(details.source_labwareId)
    push(details.dest_labwareId)
    const source = details.source as { labwareId?: unknown; wells?: unknown; well?: unknown } | undefined
    const target = details.target as { labwareId?: unknown; wells?: unknown; well?: unknown } | undefined
    push(source?.labwareId)
    push(target?.labwareId)
    const unique = [...new Set(ids)]
    const all = getAffectedWells(event)
    // Per-side well extraction: a transfer marks the SOURCE labware with
    // the source-side wells and the TARGET labware with the target-side
    // wells (the event's full set belongs to the vessel it names — an
    // add_material's details.labwareId — not to both sides of a move).
    const stringWells = (value: unknown): WellId[] =>
      Array.isArray(value)
        ? value.filter((w): w is WellId => typeof w === 'string')
        : typeof value === 'string'
          ? [value]
          : []
    const srcWells = stringWells(source?.wells ?? details.source_wells ?? source?.well)
    const dstWells = stringWells(target?.wells ?? details.dest_wells ?? target?.well)
    for (const labwareId of unique) {
      const isSourceRef =
        labwareId === source?.labwareId || labwareId === details.source_labwareId
      const isTargetRef =
        labwareId === target?.labwareId || labwareId === details.dest_labwareId
      let wells: WellId[]
      if (isSourceRef && srcWells.length > 0) wells = srcWells
      else if (isTargetRef && dstWells.length > 0) wells = dstWells
      else wells = all
      let set = byLabware.get(labwareId)
      if (!set) {
        set = new Set()
        byLabware.set(labwareId, set)
      }
      for (const well of wells) set.add(well)
    }
  }

  for (const event of committedEvents) add(event)
  for (const event of preview?.previewEvents ?? []) add(event)
  return byLabware
}

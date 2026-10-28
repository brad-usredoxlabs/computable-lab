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
import type { AiResolvedLabware } from '../../types/ai'
import type { EventEditorPreview } from '../EventEditorContext'

/** labwareId → the set of WellIds touched by at least one committed or
 *  preview event on that labware (empty set is never stored).
 *
 *  L2-SUITE-A-uifix2 A: `turnOfferBinding` is the JUST-COMMITTED turn's
 *  resolved-labware OFFER (the AiResolvedLabware list that rides the turn's
 *  draft payload and is consumed client-side by the preview path —
 *  draftPreview.ts's resolved arm keys the editor labware by recordId). It is
 *  the client-side attribution source for COMMITTED events that carry wells
 *  but NO explicit labware reference (the compiled add_material:
 *  `details.wells` but no `labwareId` at event or details level). Such an
 *  event attributes to the offer's recordId — the vessel the pipeline bound
 *  it against. NO server record-shape change. The STAGED (preview) arm reads
 *  its own binding off `preview.resolvedLabwares` (the same offer object the
 *  preview was built from) — both arms MUST mark (orch ruling); the
 *  accepted-then-reloaded arm is OUT (the offer is not persisted to the
 *  record — it rides defect 5 / the deck-variant item).
 *
 *  Attribution is single-vessel only: when the turn offers exactly one vessel,
 *  every offer-less event acts on it. When the turn offers MULTIPLE vessels an
 *  offer-less event's target is genuinely ambiguous and we attribute to NOTHING
 *  (we never guess which of several vessels an un-bound event hits). An event
 *  WITH an explicit labware reference always self-attributes and is never
 *  re-routed by the offer. The P7 mix arm is OUT of scope (WELLSET-RESOLVER-1's
 *  remit): a mix carries a labwareId but NO wells, so it is left untouched —
 *  never fabricated. */
export function buildEventWellIndex(
  committedEvents: PlateEvent[],
  preview: EventEditorPreview | null,
  turnOfferBinding?: AiResolvedLabware[],
): Map<string, Set<WellId>> {
  const byLabware = new Map<string, Set<WellId>>()

  // The turn's single-vessel offer — the only case where an offer-less event's
  // target is unambiguous. Multiple offers => no guess (see the header).
  // Per arm: the STAGED arm's binding is the preview's own resolvedLabwares
  // (the offer rides the SAME draft payload that built this preview); the
  // COMMITTED arm's is `turnOfferBinding` — the binding captured at commit
  // time (the preview's OWN resolvedLabwares, the one that was live when these
  // committed events were staged). It rides the committed batch as a unit so a
  // later turn committing over it cannot re-route an earlier turn's events.
  const singleVesselOffer = (binding?: AiResolvedLabware[] | null): string | null => {
    const ids = (binding ?? [])
      .map((offer) => offer.recordId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    return new Set(ids).size === 1 ? ids[0] : null
  }
  const stagedOffer = singleVesselOffer(preview?.resolvedLabwares)
  const committedOffer = singleVesselOffer(turnOfferBinding)

  const add = (event: PlateEvent, offerRecordId: string | null) => {
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
    // L2-SUITE-A-uifix2 A: an event that carries wells but names NO labware
    // (the compiled add_material: details.wells with no labwareId at event or
    // details level) attributes to the turn's single-vessel offer — the vessel
    // the pipeline bound it against (resolvedLabwares rides the SAME turn's
    // draft payload; the preview path already consumes it to key the editor
    // labware by recordId). Multiple offers => ambiguous target => attribute
    // to nothing (never guess). An event WITH an explicit reference self-
    // attributed above and is never re-routed here (unique is non-empty).
    if (unique.length === 0 && offerRecordId !== null && all.length > 0) {
      let set = byLabware.get(offerRecordId)
      if (!set) {
        set = new Set()
        byLabware.set(offerRecordId, set)
      }
      for (const well of all) set.add(well)
    }
  }

  for (const event of committedEvents) add(event, committedOffer)
  for (const event of preview?.previewEvents ?? []) add(event, stagedOffer)
  return byLabware
}

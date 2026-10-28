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

/** L2-SUITE-A-uifix2 FIX3 (advc1 defect 3): the per-batch OFFER BINDING is
 *  TRI-STATE — `null` alone conflated "no offer" with "multiple offers" and
 *  let the placed-vessel fallback GUESS on the genuinely-ambiguous case:
 *    - a string recordId   : the batch's SINGLE-vessel offer (attribution);
 *    - the ABSENT entry     : the batch carried NO offer (fallback allowed);
 *    - the ambiguous marker : the batch offered MORE THAN ONE distinct vessel
 *                             (fallback FORBIDDEN — never guess).
 *  The marker is a shared token (never a recordId), exported so the reducer
 *  that captures the binding at commit time and any future reader speak the
 *  same tri-state. (Pre-fix shape: `Record<string, string | null>` — kept as
 *  the first two arms of this one; callers passing the old shape still mean
 *  exactly what they meant: a recordId or "no offer".) */
export const OFFER_BINDING_AMBIGUOUS = Symbol('offer-binding-ambiguous')

type OfferBindingValue = string | null | typeof OFFER_BINDING_AMBIGUOUS

/** labwareId → the set of WellIds touched by at least one committed or
 *  preview event on that labware (empty set is never stored).
 *
 *  L2-SUITE-A-uifix2 A: the resolved-labware OFFER (the AiResolvedLabware list
 *  that rides the turn's draft payload and is consumed client-side by the
 *  preview path — draftPreview.ts's resolved arm keys the editor labware by
 *  recordId) is the client-side attribution source for COMMITTED events that
 *  carry wells but NO explicit labware reference (the compiled add_material:
 *  `details.wells` but no `labwareId` at event or details level). NO server
 *  record-shape change.
 *
 *  L2-SUITE-A-uifix2-fix1 [D1]: the binding is PER-BATCH, not per-deck. The
 *  STAGED (preview) arm reads its own binding off `preview.resolvedLabwares`
 *  (a preview is a single turn's batch, so one offer covers all its events).
 *  The COMMITTED arm reads `committedOfferByEvent` — a map from eventId to the
 *  offer recordId that was LIVE when THAT event's batch was staged — so a
 *  second accepted turn can neither re-route an earlier turn's wells onto its
 *  own vessel nor erase them when its batch carries no offer. The pre-fix
 *  single top-level field (one offer applied to ALL committed events) is the
 *  defect this fixes. The accepted-then-reloaded arm is OUT (the offer is not
 *  persisted to the record — it rides defect 5 / the deck-variant item).
 *
 *  Attribution is single-vessel only: an offer-less event attributes to the
 *  single vessel its OWN batch's binding offers. When a batch offers MULTIPLE
 *  vessels (or none) the target is genuinely ambiguous and the event attributes
 *  to NOTHING (we never guess). An event WITH an explicit labware reference
 *  always self-attributes and is never re-routed by the offer. The P7 mix arm
 *  is OUT of scope (WELLSET-RESOLVER-1's remit): a mix carries a labwareId but
 *  NO wells, so it is left untouched — never fabricated. */
export function buildEventWellIndex(
  committedEvents: PlateEvent[],
  preview: EventEditorPreview | null,
  /** L2-SUITE-A-uifix2-fix1 [D1]: PER-BATCH committed binding — a map from
   *  eventId to the offer recordId that was live when THAT event's batch was
   *  staged (the preview's own resolvedLabwares). The binding rides each
   *  committed batch, so a later turn committing over it cannot re-route (or
   *  erase) an earlier turn's events. Absent/empty entry = "no offer" (the
   *  event self-attributes, or attribute-less events attribute to nothing).
   *  L2-SUITE-A-uifix2 FIX3 (advc1 defect 3): TRI-STATE — the value may also
   *  be the OFFER_BINDING_AMBIGUOUS marker (the batch offered >1 distinct
   *  vessel: the placed-vessel fallback is then FORBIDDEN — never guess). */
  committedOfferByEvent?: Record<string, OfferBindingValue>,
  /** L2-SUITE-A-uifix2 FIX2 (D2): the ids of the labware vessels CURRENTLY
   *  PLACED on the deck (committed placements — the tiles that exist). A
   *  well-bearing event with NO explicit labware reference AND no per-batch
   *  offer binding (the REAL committed shape of an accepted add_material
   *  targeting an already-placed plate: details.wells, no labwareId anywhere)
   *  attributes to the deck's SINGLE placed vessel — the vessel the tile
   *  carries. Multiple (distinct) placed vessels => genuinely ambiguous =>
   *  attribute to NOTHING (never guess). Zero placed vessels => nothing to
   *  attribute to. Absent/empty = "the deck holds no placed vessels" (the
   *  pre-fix behavior holds byte-for-byte). */
  placedLabwareIds?: string[],
  /** L2-SUITE-A-uifix2 FIX3 (advc1 defect 3): per-event AMBIGUOUS-OFFER
   *  marker — eventId → true when THAT event's batch offered MORE THAN ONE
   *  distinct vessel (captured at commit time, when the batch's
   *  resolvedLabwares were still visible). For such an event the
   *  placed-vessel fallback is FORBIDDEN — the target is genuinely
   *  ambiguous (never guess); an absent entry means the batch carried no
   *  offer (the D2 fallback is allowed). Equivalent to carrying the
   *  OFFER_BINDING_AMBIGUOUS marker in `committedOfferByEvent` — both are
   *  honored. */
  committedOfferAmbiguousByEvent?: Record<string, boolean>,
): Map<string, Set<WellId>> {
  const byLabware = new Map<string, Set<WellId>>()

  // The batch's offer, TRI-STATE (L2-SUITE-A-uifix2 FIX3, advc1 defect 3):
  // the single-vessel recordId, or the AMBIGUOUS marker when the batch
  // offered MORE THAN ONE distinct vessel — that is the case this module
  // documents as "genuinely ambiguous ... attributes to NOTHING". Pre-fix
  // both "zero offers" and "multiple offers" collapsed to null and the
  // placed-vessel fallback GUESSED on the multiple case. Per arm: the STAGED
  // arm's binding is the preview's own resolvedLabwares (a preview is one
  // turn's batch, so one offer covers all its events); the COMMITTED arm's
  // is this event's OWN entry in `committedOfferByEvent` (the binding
  // captured when ITS batch was staged — the fix for the pre-fix single
  // global field that re-routed/erased an earlier turn's events, D1) or its
  // `committedOfferAmbiguousByEvent` marker (captured at the same time —
  // the binding is not persisted, so the ambiguity must ride the batch too).
  const offerOfBatch = (
    binding?: AiResolvedLabware[] | null,
  ): string | typeof OFFER_BINDING_AMBIGUOUS | null => {
    const ids = (binding ?? [])
      .map((offer) => offer.recordId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    const distinct = new Set(ids)
    if (distinct.size > 1) return OFFER_BINDING_AMBIGUOUS
    return distinct.size === 1 ? (ids[0] as string) : null
  }
  const stagedOffer = offerOfBatch(preview?.resolvedLabwares)
  const committedOfferOf = (eventId: string): OfferBindingValue => {
    const bound = committedOfferByEvent?.[eventId]
    if (bound === OFFER_BINDING_AMBIGUOUS) return OFFER_BINDING_AMBIGUOUS
    if (typeof bound === 'string' && bound.length > 0) return bound
    if (committedOfferAmbiguousByEvent?.[eventId] === true) return OFFER_BINDING_AMBIGUOUS
    return null
  }

  const add = (event: PlateEvent, offer: string | typeof OFFER_BINDING_AMBIGUOUS | null) => {
    // The offer's recordId for attribution — the AMBIGUOUS marker means
    // "no guess": the event attributes to NOTHING (it still self-attributes
    // above when it carries an explicit labware reference).
    const offerRecordId: string | null = offer === OFFER_BINDING_AMBIGUOUS ? null : offer
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
    } else if (
      unique.length === 0
      && offer !== OFFER_BINDING_AMBIGUOUS
      && offerRecordId === null
      && all.length > 0
    ) {
      // L2-SUITE-A-uifix2 FIX2 (D2): the REAL committed shape — an accepted
      // add_material targeting an ALREADY-PLACED plate carries wells but NO
      // explicit labware reference AND no per-batch offer binding (the draft
      // carried no resolvedLabware offer for the existing vessel). The deck's
      // own tile list is the attribution source: a SINGLE placed vessel makes
      // the target unambiguous (the plate the tile carries); multiple distinct
      // placed vessels are genuinely ambiguous => attribute to NOTHING
      // (never guess); zero placed vessels => nothing to attribute to.
      // L2-SUITE-A-uifix2 FIX3 (advc1 defect 3): the fallback fires ONLY on
      // "no offer binding" — an AMBIGUOUS offer (the batch offered several
      // vessels) is exactly the case that attributes to NOTHING.
      const placed = new Set(
        (placedLabwareIds ?? [])
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      )
      if (placed.size === 1) {
        const [vesselId] = placed
        let set = byLabware.get(vesselId)
        if (!set) {
          set = new Set()
          byLabware.set(vesselId, set)
        }
        for (const well of all) set.add(well)
      }
    }
  }

  for (const event of committedEvents) add(event, committedOfferOf(event.eventId))
  for (const event of preview?.previewEvents ?? []) add(event, stagedOffer)
  return byLabware
}

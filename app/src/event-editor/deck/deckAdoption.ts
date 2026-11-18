/**
 * deckAdoption — the SHARED deck adoption core (L2-CHAT-1 FIX3 D1).
 *
 * One staged AI preview, ONE adopter. The materialize/persist ordering the
 * deck bar's PreviewActionBar.handleAccept performed (PreviewActionBar.tsx,
 * cycle-2: lines 75-130) is extracted here so BOTH accept paths commit the
 * FULL staged preview identically:
 *
 *   1. ontology SIGN-OFF GATE — unsigned decisionNeeded terms refuse the
 *      adoption (never silently materialize; the caller refuses visibly);
 *   2. RECORDS-FIRST creations (materializeAcceptedRecordCreations) — the
 *      ADDs materialize before the graph so an accepted placement points at
 *      a record rather than at a ghost;
 *   3. ontology mint (materializeAcceptedOntologyBindings);
 *   4. event ref rewrite (rewriteAcceptedOntologyRefs);
 *   5. durable persist (persistAcceptedEventGraph) of the WHOLE graph —
 *      events + previewLabwares + previewPlacements;
 *   6. the editor's commit (commit_preview) — which nulls the preview, so a
 *      second commit by either path is a no-op (one adopter stays one) —
 *      then the caller's post-adoption hook (workspace tab bind / route
 *      navigate on the deck bar; nothing on the chat Apply).
 *
 * Consumed by:
 *  - PreviewActionBar.handleAccept (the deck bar's Accept — same ordering);
 *  - the `onPreviewAccept` accept seam (useAiChat), which DeckSurfaceChat /
 *    RunSurfaceChatBridge wire from the editor state via this module.
 */
import type { Equipment } from '../../types/equipment'
import type { Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import type { AiRecordCreation, DraftOntologyBinding } from '../../types/ai'
import type { EventEditorPlacement } from '../types'
import {
  persistAcceptedEventGraph,
  type PersistAcceptedEventGraphResult,
} from '../eventGraphPersistence'
import {
  materializeAcceptedOntologyBindings,
  rewriteAcceptedOntologyRefs,
  type TermDecision,
} from './acceptedOntologyBindings'
import { materializeAcceptedRecordCreations } from './acceptedRecordCreations'
import {
  findUnplaceableLabware,
  mintPlacedLabwareInstances,
} from './labwareInstanceMint'

/** u2ghostgate re-export: the pure pre-check the shared adoption core runs
 *  before ANY write (the deck keys of placed labwares with no resolvable
 *  definition record id — a non-empty list refuses the accept). */
export { findUnplaceableLabware }

/** A proposed ontology term that requires the scientist's sign-off (gate on
 *  Accept). Ported verbatim from PreviewActionBar — the gate lives HERE, in
 *  one place, so both accept paths apply the identical rule. */
export function bindingNeedsDecision(b: { minted?: boolean; requiresReview?: boolean; draftOnly?: boolean }): boolean {
  return Boolean(b.minted || b.requiresReview || b.draftOnly)
}

/** The full staged preview shape the adoption commits. The editor's
 *  EventEditorPreview satisfies this structurally. */
export interface DeckPreviewLike {
  previewEvents: PlateEvent[]
  previewLabwares: Record<string, Labware>
  previewEquipments?: Record<string, Equipment>
  previewPlacements: EventEditorPlacement[]
  ontologyBindings?: DraftOntologyBinding[]
  recordCreations?: AiRecordCreation[]
  sourcePrompt?: string
  /**
   * L2-P1B-PRODUCT-IDENTITY-1: the RESOLVED product (vendor-product record id)
   * the placed labware carries, when the preview resolved one. Threaded to the
   * mint so the instance ALSO names the specific product alongside its
   * definition. Absent / empty → the instance is definition-only.
   */
  productRecordId?: string
}

/** The live editor state the adoption persists against + commits into. */
export interface DeckAdoptionState {
  eventGraphId: string | null
  runId: string | null
  platformId?: string
  variantId?: string
  events: PlateEvent[]
  labwares: Record<string, Labware>
  equipments: Record<string, Equipment>
  placements: EventEditorPlacement[]
}

/** Caller-supplied wiring: the sign-off decisions, the editor commit, and
 *  the post-adoption hook. */
export interface DeckAdoptionContext {
  termDecisions: Record<string, TermDecision>
  commit: (previewEvents: PlateEvent[], persisted: PersistAcceptedEventGraphResult) => void
  onAdopted?: (persisted: PersistAcceptedEventGraphResult) => void
}

/** Refused at the ontology sign-off gate (`blocked` = unsigned decisionNeeded
 *  terms), or at the ghost-gate (`blocked` = placed labwares with no
 *  resolvable definition record id); or the full adoption's counts + the
 *  persisted graph (for the caller's navigation / tab binding). Structurally
 *  assignable to useAiChat's DeckAdoptionOutcome (the accept seam's return
 *  type) — no import between the two modules (keeps shared/hooks free of
 *  event-editor imports). */
export type DeckAdoptionResult =
  | {
      adopted: false
      blocked: number
      /** u3ghostfix D3: WHY the accept was refused — the caller words its
       *  message from this. A ghost-gate refusal is not an ontology one;
       *  telling the user to sign off terms would be a false instruction.
       *  Optional only so legacy/decorative refusal stubs stay assignable;
       *  both refusal sites here always set it. */
      reason?: 'ontology-signoff' | 'unplaceable-labware'
      /** Ghost-gate only: the deck keys that could not name a definition. */
      unplaceable?: string[]
    }
  | {
      adopted: true
      eventCount: number
      placementCount: number
      labwareCount: number
      /** L2-P1-LABWARE-INSTANCE-RECORD-1 u1inst: the labware-instance ids
       *  minted for the placed labwares. Optional on the type (the shared
       *  DeckAdoptionOutcome contract is consumed by pre-existing useAiChat
       *  mocks); adoptStagedPreview always populates it. */
      instanceIds?: string[]
      persisted: PersistAcceptedEventGraphResult
    }

/** Refuse an accept whose placed labwares cannot name their DEFINITION record
 *  id — each key named in the log, in the sign-off gate's shape, before any
 *  write (a visible gap, never a guess). */
function refuseUnplaceableLabware(keys: string[]): DeckAdoptionResult {
  for (const key of keys) {
    console.warn(
      `[labware instance] ${key} was placed without a resolvable labware definition record id — the accept is refused until it resolves (no ghost labware is persisted).`,
    )
  }
  return {
    adopted: false,
    blocked: keys.length,
    reason: 'unplaceable-labware',
    unplaceable: keys,
  }
}

/**
 * Commit the FULL staged preview — events + previewLabwares +
 * previewPlacements + recordCreations + ontologyBindings — with the deck
 * bar's exact materialize/persist ordering.
 */
export async function adoptStagedPreview(
  preview: DeckPreviewLike,
  state: DeckAdoptionState,
  ctx: DeckAdoptionContext,
): Promise<DeckAdoptionResult> {
  // 1. Sign-off gate (NOT bypassable): every minted/requiresReview/draftOnly
  //    term needs a recorded decision before anything materializes.
  const unsigned = (preview.ontologyBindings ?? []).filter(
    (b) => bindingNeedsDecision(b) && !ctx.termDecisions[b.curie],
  )
  if (unsigned.length > 0) {
    return { adopted: false, blocked: unsigned.length, reason: 'ontology-signoff' }
  }

  // 1b. Ghost-gate (L2-P1-LABWARE-INSTANCE-RECORD-1 u2ghostgate; r10 defect 4):
  //     a placed labware whose DEFINITION record id cannot resolve mints no
  //     instance (labwareInstanceMint) — yet the persist below writes the
  //     WHOLE previewLabwares map. The pre-check IS the mint's rule projected
  //     one step earlier (creations resolve by NAME, not deck key), so a
  //     legitimate "create this plate and place it" accept still passes.
  const unplaceable = findUnplaceableLabware(preview.previewLabwares, preview.recordCreations)
  if (unplaceable.length > 0) return refuseUnplaceableLabware(unplaceable)

  // 2. The ADDs first: records the lab does not have become real records
  //    here (records-first: an existing match is reused with a warning).
  const creations = await materializeAcceptedRecordCreations(preview.recordCreations, {
    equipments: preview.previewEquipments ?? {},
    labwares: preview.previewLabwares,
  })
  for (const warning of creations.warnings) console.warn(`[record creation] ${warning}`)

  // 2b. One labware-instance per placed labware (L2-P1-LABWARE-INSTANCE-RECORD-1
  //     u1inst): after the records-first DEFINITION creations (the definition
  //     exists first) and before the durable persist below.
  const minted = await mintPlacedLabwareInstances({
    previewLabwares: preview.previewLabwares,
    materialized: creations.materialized ?? [],
    // L2-P1B-PRODUCT-IDENTITY-1: a placement that resolved a specific product
    // carries it through to the instance; absent → the instance is
    // definition-only (vendorProductRef omitted).
    productRecordId: preview.productRecordId,
  })
  for (const warning of minted.warnings) console.warn(`[labware instance] ${warning}`)

  // 2c. The mint's OWN answer gates step 5 (u3ghostfix D2): the pre-check at
  //     1b can be wrong about step 2 — a definition CREATE can fail (the
  //     materializer only warns and leaves the vessel without a recordId), so
  //     the mint skips that key. Persisting anyway would write exactly the
  //     ghost labware this unit exists to remove: refuse before the durable
  //     write, with nothing added to the accepted graph.
  if (minted.skipped.length > 0) return refuseUnplaceableLabware(minted.skipped)

  // Keep the durable placement -> instance -> definition chain in the graph
  // and in the preview the editor commits. Previously the instance IDs only
  // appeared in this function's return value and were lost on reload.
  for (const [key, instanceRecordId] of Object.entries(minted.instanceBindings)) {
    preview.previewLabwares[key] = { ...preview.previewLabwares[key]!, instanceRecordId }
  }

  // 3. Ontology mint under the signed-off decisions.
  const materialized = await materializeAcceptedOntologyBindings(
    preview.ontologyBindings,
    undefined,
    ctx.termDecisions,
  )

  // 4. Rewrite the accepted events' ontology refs to the minted records.
  const acceptedEvents = rewriteAcceptedOntologyRefs(preview.previewEvents, materialized)

  // 5. Durable persist of the whole graph (events + labwares + placements).
  const persisted = await persistAcceptedEventGraph({
    eventGraphId: state.eventGraphId,
    runId: state.runId,
    events: [...state.events, ...acceptedEvents],
    labwares: { ...state.labwares, ...preview.previewLabwares },
    placements: [...state.placements, ...preview.previewPlacements],
    ...(state.runId ? { platformId: state.platformId, variantId: state.variantId } : {}),
    // Auto-capture seam: only when the preview was produced by an AI prompt
    // do we POST one corpus pair on the durable save.
    ...(preview.sourcePrompt ? { corpusUserPrompt: preview.sourcePrompt } : {}),
  })

  // 6. The editor commit (commit_preview) — preview nulls INSIDE the reducer,
  //    so a subsequent commit by either accept path is a no-op (one adopter
  //    stays one). Then the caller's post-adoption hook.
  ctx.commit(acceptedEvents, persisted)
  ctx.onAdopted?.(persisted)

  return {
    adopted: true,
    eventCount: acceptedEvents.length,
    placementCount: preview.previewPlacements.length,
    labwareCount: Object.keys(preview.previewLabwares).length,
    instanceIds: minted.instanceIds,
    persisted,
  }
}

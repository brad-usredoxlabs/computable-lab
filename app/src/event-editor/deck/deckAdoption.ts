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

/** Refused at the sign-off gate (`blocked` = unsigned decisionNeeded terms),
 *  or the full adoption's counts + the persisted graph (for the caller's
 *  navigation / tab binding). Structurally assignable to useAiChat's
 *  DeckAdoptionOutcome (the accept seam's return type) — no import between
 *  the two modules (keeps shared/hooks free of event-editor imports). */
export type DeckAdoptionResult =
  | { adopted: false; blocked: number }
  | {
      adopted: true
      eventCount: number
      placementCount: number
      labwareCount: number
      persisted: PersistAcceptedEventGraphResult
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
  if (unsigned.length > 0) return { adopted: false, blocked: unsigned.length }

  // 2. The ADDs first: records the lab does not have become real records
  //    here (records-first: an existing match is reused with a warning).
  const creations = await materializeAcceptedRecordCreations(preview.recordCreations, {
    equipments: preview.previewEquipments ?? {},
    labwares: preview.previewLabwares,
  })
  for (const warning of creations.warnings) console.warn(`[record creation] ${warning}`)

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
    persisted,
  }
}

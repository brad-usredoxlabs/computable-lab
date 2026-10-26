/**
 * REVISE-GHOST-1 fix 2 (advc cycle-2 Defect 1 + architect ruling
 * REVISEGHOST1-fix2-wall-predicate-jurisdiction): the ONE "produced nothing"
 * rule for the chat draft leg — a single pure predicate, one place, no
 * scattered per-channel branches.
 *
 * The defect this closes: the honest wall fired on `success + zero events +
 * zero cards` while IGNORING the other deliverable channels a done result can
 * carry (recordCreations, labwareAdditions, labwareRequirements,
 * equipmentRequirements, deckLayout). A create_record / labware-requirement /
 * deckLayout success turn DID deliver a proposal, yet the wall false-fired,
 * reset the sidebar, and DISCARDED the proposal (the arm returned before
 * draft-ready/setPreview).
 *
 * Pinned relationship (Ruling 1/3): CLIENT ⊇ SERVER canonical, never ==. The
 * server's 7-channel guard (draftArgDiagnostics.draftProducedNothingOnServer,
 * extracted L2-FREEFORM-1 H5 from the draft-tool arm's inline `const
 * emptyResult =` check) counts the 7 canonical channels — events,
 * clarificationRequests, error, labwareAdditions, labwareRequirements,
 * recordCreations, deckLayout. This client predicate counts those 7 PLUS
 * exactly two sanctioned client-superset members:
 *   - equipmentRequirements — a client-surface deliverable; the client
 *     mounts ghosts from it via the buildPreviewFromDraft seam and the
 *     destination-asserting honestWall negative proves setPreview +
 *     previewPlacements > 0;
 *   - proseDeliverable (L2-FREEFORM-1 H5, OQ3 ruling) — the server's
 *     structural marker for a doc-discussion prose answer (the prose body
 *     rides clarificationNeeded; the marker makes the deliverable structural
 *     so this predicate never walls a legitimate paragraph of answer).
 * The AiTabPanel.honestWall drift-pin test asserts the superset
 * mechanically (server helper + per-channel functional legs), so a
 * divergence fails the app suite, not a live dogfood.
 *
 * protocolEdit is DELIBERATELY NOT a predicate term (Ruling 1): it is a
 * client-surface-aware channel — the server emits ops without knowing whether
 * a protocol identity is attached, so only the client's protocolEdit ARM
 * (AiTabPanel.tsx) knows whether the turn reached the protocol-edit review
 * surface. A mappable envelope dispatches its own protocolDiff draft-ready and
 * returns inside the arm; the only protocolEdit turn that can reach this
 * predicate is the fall-through remnant (identity-less / unmappable envelope),
 * which delivered NOTHING and must be judged empty so the wall fires — never
 * an empty ChangesPanel with a live "Apply to run" (spec §1 mandate).
 * Jurisdiction is arm order, not a delivery-marking flag.
 */
import type { AssistDraftResult } from './assistStream'

export function draftProducedNothing(result: AssistDraftResult): boolean {
  return (
    !(result.events?.length ?? 0) &&
    !(result.clarificationRequests?.length ?? 0) &&
    !result.error &&
    !(result.labwareAdditions?.length ?? 0) &&
    !(result.labwareRequirements?.length ?? 0) &&
    !(result.equipmentRequirements?.length ?? 0) &&
    !(result.recordCreations?.length ?? 0) &&
    !result.deckLayout &&
    // L2-FREEFORM-1 H5 (OQ3): a doc-discussion prose answer IS a deliverable
    // (the marker rides the success arm only) — never "produced nothing".
    !result.proseDeliverable
  )
}

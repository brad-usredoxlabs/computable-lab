/**
 * REVISE-GHOST-1 fix 1 (advc cycle-1 D1): the ONE "produced nothing" rule for
 * the chat draft leg — a single pure predicate, one place, no scattered
 * per-channel branches.
 *
 * The defect this closes: the honest wall fired on `success + zero events +
 * zero cards` while IGNORING the other deliverable channels a done result can
 * carry (recordCreations, labwareAdditions, labwareRequirements,
 * equipmentRequirements, deckLayout, protocolEdit). A create_record /
 * labware-requirement / deckLayout success turn DID deliver a proposal, yet the
 * wall false-fired, reset the sidebar, and DISCARDED the proposal (the arm
 * returned before draft-ready/setPreview).
 *
 * The rule mirrors the server's canonical predicate — `agentDraftProducedNothing`
 * in server/src/ai/draftArgDiagnostics.ts, consumed by the orchestrator's
 * empty-draft guard (AgentOrchestrator.ts) — over the SAME channel set, so the
 * two layers cannot drift on what "empty" means: a done result produced nothing
 * only when EVERY deliverable channel is empty AND no error is already carried.
 * A turn that delivered ANY proposal payload is not empty, on either side.
 * (The client cannot import server modules across the workspace boundary; the
 * AiTabPanel.honestWall drift-pin test compares the two predicates' channel
 * sets mechanically so a divergence fails the app suite, not a live dogfood.)
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
    !(result.protocolEdit?.ops?.length ?? 0)
  )
}

/**
 * clarificationAnswerPrompt — the clarification-answer prompt builders.
 *
 * L2-CHAT-UI-1 LEG D (spec §3 step 1): MOVED VERBATIM out of
 * event-editor/right-pane/ai/AiTabPanel.tsx:53-77 (which dies in the leg's
 * deletion commit — campaign bait 11: move the helpers BEFORE the deletion or
 * the build breaks). Pure string builders, zero React deps — the byte-identical
 * move is the point: no signature change (exactOptionalPropertyTypes discipline:
 * any widening to `| undefined` would be a defect), same fallback chain, same
 * sentence shape `Use ${value} for ${target}.`.
 *
 * Live consumer at move time: src/agent/ChatLog.tsx (clarification answer
 * text). The universal pane (HarnessChatPane → ChatLog onClarificationPick)
 * answers a clarification through the NEXT chat turn with this prompt.
 */
import type { AiClarificationAnswer, AiClarificationRequest } from '../../types/ai'

export function clarificationAnswerPrompt(
  answer: AiClarificationAnswer,
  request: AiClarificationRequest,
): string {
  const target = request.entityType ?? request.kind
  const value = answer.mentionToken ?? answer.label ?? answer.value ?? answer.optionId ?? 'answer'
  return `Use ${value} for ${target}.`
}

/** Combine a batch of clarification answers into a single prompt sentence-set. */
export function clarificationAnswersPrompt(
  answers: AiClarificationAnswer[],
  requests: AiClarificationRequest[],
): string {
  const byId = new Map(requests.map((r) => [r.id, r]))
  return answers
    .map((a) => {
      const req = byId.get(a.requestId)
      const target = req?.entityType ?? req?.kind ?? 'material'
      const value = a.mentionToken ?? a.label ?? a.value ?? a.optionId ?? 'answer'
      return `Use ${value} for ${target}.`
    })
    .join(' ')
}

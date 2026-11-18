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

/**
 * L2-P1-AMBIGUOUS-OPTIONS-1 / u2refcarry — a choice the person made travels
 * as the record they chose, not as prose the server re-guesses. When the
 * answer holds a record identity (the option's `ref` — the picker's real
 * shape `{ kind, id, type?, label? }`, the identity in `id`, never a mint),
 * the sentence names the record id so the server never re-resolves the
 * ambiguous label a second time (gate r11: click → identical question →
 * "no proposal" loop).
 */
function recordIdentity(answer: AiClarificationAnswer): string | undefined {
  const ref = answer.ref
  if (ref === undefined) return undefined
  const id = ref.id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

/** The value the sentence names — the EXACT fallback chain, plus the record
 *  id in parens when the answer holds a record identity. A mention-token
 *  answer is byte-unchanged: the token already names the identity, so no
 *  second one is appended (the `Use [[type:id|label]] for X.` wire form is
 *  pinned). */
function answerValue(answer: AiClarificationAnswer): string {
  const value = answer.mentionToken ?? answer.label ?? answer.value ?? answer.optionId ?? 'answer'
  const identity = answer.mentionToken === undefined ? recordIdentity(answer) : undefined
  return identity === undefined ? value : `${value} (${identity})`
}

export function clarificationAnswerPrompt(
  answer: AiClarificationAnswer,
  request: AiClarificationRequest,
): string {
  const target = request.entityType ?? request.kind
  return `Use ${answerValue(answer)} for ${target}.`
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
      return `Use ${answerValue(a)} for ${target}.`
    })
    .join(' ')
}

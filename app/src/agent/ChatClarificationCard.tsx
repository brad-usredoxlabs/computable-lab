/**
 * ChatClarificationCard — the chat-host analogue of the deck's ClarificationPanel
 * (protocol/ClarificationPanel.tsx:123-241): ONE bordered card per SENTENCE (the
 * message), one slot per FACT (request), one Submit.
 *
 * L2-CLARIFY-CARD-1 (P4). The pre-fix chat host rendered each unresolved fact as
 * its OWN card (ChatLog.tsx renderTypedClarification) with its OWN one-click
 * answer — so a sentence that named TWO unresolved nouns ("Add 100 ul of
 * clofibrate to 1 mM X") fired TWO independent answer turns, TWO answered rows,
 * and no way to answer the sentence as one unit. The deck already solved this
 * (one panel, one <section> per fact, answers ride the request's own identity).
 * This is the chat-host version of that same grouping: it does NOT invent a
 * second model — it mirrors the panel's slot identity (request.slot), prompt-
 * once-per-slot, per-slot picker keyed by request.id (the same single-open,
 * request.id query-reset law), and adds the ONE Submit the panel defers to the
 * host.
 *
 * Never-guess (spec item 8): nothing auto-answers, nothing pre-selects a
 * candidate, and Submit never fires for an unanswered slot.
 *
 * Single-open invariant (spec item 9): the card mounts no picker open; each
 * picker keeps the module single-open store (ClarificationPicker.tsx:50-97)
 * untouched. Grouping N pickers under one card does not regress the uifix2
 * stack-open pin — the pickers are still keyed by request.id, still
 * open-on-request, and the store still holds at most ONE open key.
 */
import { useEffect, useState } from 'react'
import type { AiClarificationAnswer, AiClarificationRequest } from '../types/ai'
import { clarificationAnswersPrompt } from '../shared/hooks/clarificationAnswerPrompt'
import { ClarificationPicker, requestHasPicker } from '../event-editor/right-pane/ai/ClarificationPicker'
import { ParameterAnswerInput } from '../event-editor/right-pane/ai/ParameterAnswerInput'
// L2-CLARIFY-TARGET-1 (Change 2 + 4, RE-PIN NOTE S2): the two declared-slot
// answer surfaces — the ASSUMED-VALUE quantity chip and the TARGET-WELL slot.
// They mount as the FIRST arms of the per-slot control ternary (the declared
// kind wins over the generic picker/options/typed fallback) and ride the
// card's existing `record(request, answer)` sink — no new state, no new
// Submit, no change to `allAnswered`.
import { ClarifyAssumedChip } from './ClarifyAssumedChip'
import { ClarifyWellTargetSlot } from './ClarifyWellTargetSlot'

export interface ChatClarificationCardProps {
  /** The unresolved facts for ONE sentence (the message), in wire order. */
  requests: AiClarificationRequest[]
  /**
   * The turn's identity (message.id + ordered request ids). A NEW fold REPLACES
   * the card (the panel's turnKey staleness argument, ClarificationPanel.tsx:58-64):
   * the picks reset when the turnKey changes, so an answered-then-re-barred
   * sentence never inherits a stale pick from the prior fold.
   */
  turnKey: string
  /**
   * Prompts already shown OUTSIDE this card that the card must not re-print —
   * the render-side dedupe seed (the single-request arm's BGATE-FIX D3 rule,
   * ChatLog.tsx `shownPrompts`). A section prints its prompt only when no
   * earlier section has shown that exact sentence (intra-card dedupe for a
   * shared prompt string).
   *
   * L2-CLARIFY-CARD-1 (advc-c3 D2, fix3): the grouped host passes an EMPTY set
   * — the bubble is NOT a seed source for the card. The card is the
   * deterministic OWNER of every grouped prompt (it prints slot 1, not just
   * slot N), and the host's bubble suppresses a verbatim duplicate instead
   * (ChatLog.tsx `bubbleIsOwnedPrompt`). Passing the first prompt here is what
   * made the card hide slot 1 unconditionally — on a bubble that did not carry
   * that sentence the question was printed ZERO times.
   *
   * READ-ONLY (advc-c1 D1, fix1): the card dedupes against a LOCAL copy
   * seeded from this prop — it NEVER mutates the Set the parent owns.
   * (Mutating it during render is what dropped every per-slot prompt on the
   * mount effect's re-render — the BLOCKER.)
   */
  shownPrompts: Set<string>
  disabled?: boolean
  /**
   * Answer the WHOLE sentence in one turn: the batch answer sentence (the
   * already-exported clarificationAnswersPrompt — the server folds the array in
   * ONE turn with zero model calls), the slot-ordered structured answers, and
   * the requests they answer. Absent -> the Submit button is not offered.
   */
  onClarificationSubmit?: (
    answerText: string,
    answers: AiClarificationAnswer[],
    requests: AiClarificationRequest[],
  ) => void
  /**
   * L2-CLARIFY-TARGET-1 UI-gate fix 1 / D2 (ruling Q2): the host's current
   * well selection as PLAIN WELL-ADDRESS DATA (a sorted `readonly string[]`
   * mapped at the host seam from `EventEditorContext.state.selection`).
   * Threaded to the grouped card's target-well slot. Absent (a non-deck host)
   * -> the slot's context fallback is used.
   */
  selectedWells?: readonly string[]
}

export function ChatClarificationCard({
  requests,
  turnKey,
  shownPrompts,
  disabled,
  onClarificationSubmit,
  selectedWells,
}: ChatClarificationCardProps) {
  // The one pick per slot, keyed by the request's OWN identity (the same
  // request.id the picker + the panel use). Never prefilled (never-guess).
  const [picks, setPicks] = useState<Record<string, AiClarificationAnswer>>({})

  // The panel's turnKey staleness argument, verbatim: a new fold replaces the
  // card, so a fresh turnKey clears the prior fold's picks (never a stale
  // answer rides into a new sentence).
  useEffect(() => {
    setPicks({})
  }, [turnKey])

  if (requests.length === 0) return null

  // L2-CLARIFY-CARD-1 (advc-c3 D2, fix3): the card OWNS its prompts. It
  // renders EVERY slot's prompt ONCE (an EMPTY seed from the host — the bubble
  // is not a seed source) with intra-card dedupe for a shared prompt string.
  // The bubble side of the "exactly once" invariant lives in ChatLog.tsx
  // (bubbleIsOwnedPrompt: the bubble is omitted when it verbatim carries a
  // prompt the card owns — the live first-ask shape, useAiChat.ts:1543).
  // The pre-fix seed (the identity seed, or message.content) HAD the card hide
  // slot 1 whenever the bubble carried that sentence — and, on a bubble that
  // did not carry it, left the question printed ZERO times (the D2 defect).
  // Owning the print makes it deterministic: same slot set => same prompts,
  // never twice, never zero.
  //
  // READ-ONLY (advc-c1 D1, fix1): the dedupe runs against a LOCAL copy seeded
  // from this prop — the card NEVER mutates the Set the parent owns. (Mutating
  // it during render is what dropped every per-slot prompt on the mount
  // effect's re-render — the BLOCKER.)
  const promptShown = new Set<string>(shownPrompts)

  const record = (request: AiClarificationRequest, answer: AiClarificationAnswer) => {
    setPicks((prev) => ({ ...prev, [request.id]: answer }))
  }

  // Submit is enabled only when EVERY slot has a pick (the
  // ProtocolLocalizationThread.tsx:765-772 rule: disabled until every slot is
  // answered). Nothing auto-answers, so an unanswered slot keeps it disabled.
  const allAnswered = requests.every((r) => picks[r.id] != null)
  const answers: AiClarificationAnswer[] = allAnswered
    ? requests.map((r) => picks[r.id]!)
    : []

  const submit = () => {
    if (!allAnswered || !onClarificationSubmit || disabled) return
    // The batch sentence is the ALREADY-exported, currently-unused builder
    // (clarificationAnswerPrompt.ts:28-41) — one source, slot-ordered. The wire
    // field is already an array; the server folds the batch in one turn.
    onClarificationSubmit(clarificationAnswersPrompt(answers, requests), answers, requests)
  }

  return (
    <div className="chat-clarification-card" data-testid="chat-clarification-card">
      <p className="chat-clarification-card__title">
        Answer the unresolved facts — {requests.length} slot{requests.length === 1 ? '' : 's'}
      </p>
      {requests.map((request) => {
        const options = request.options ?? []
        const hasPicker = requestHasPicker(request)
        // BGATE-FIX D3 (the single-request arm's rule, ChatLog.tsx
        // shownPrompts) — for the GROUPED card the host passes an EMPTY seed
        // (advc-c3 D2, fix3): the card OWNS its prompts and the dedupe is
        // INTRA-CARD (a shared prompt string prints once, not per slot). The
        // answer controls are never gated. advc-c1 D1 (fix1): the check ADDS
        // to the local `promptShown` copy, never to the prop (a render must
        // not mutate its inputs — see the dedupe comment above).
        const promptAlreadyShown = promptShown.has(request.prompt)
        if (!promptAlreadyShown) promptShown.add(request.prompt)
        // L2-CLARIFY-TARGET-1 (RE-PIN NOTE S2): the DECLARED-slot answer
        // surfaces ride the card's existing `record(request, answer)` sink and
        // sit as the FIRST arms of the per-slot control ternary — a request
        // with a `clarifyControl` (kind 'quantity' / 'wells') uses ITS declared
        // surface, not the generic picker/options/typed fallback. No new
        // state, no new Submit, `allAnswered` unchanged.
        const controlKind = request.clarifyControl?.kind
        const declaredAnswer = (answer: AiClarificationAnswer) => record(request, answer)
        return (
          <section
            key={request.id}
            className="chat-clarification-card__slot"
            data-testid="chat-clarification-slot"
            data-request-id={request.id}
          >
            {request.slot !== undefined ? (
              <span className="chat-clarification-card__slot-identity" data-testid="chat-clarification-slot-identity">
                {request.slot}
              </span>
            ) : null}
            {!promptAlreadyShown ? (
              <p className="chat-clarification-card__prompt">{request.prompt}</p>
            ) : null}
            {/* Exactly ONE answer surface per slot (spec item 2): the DECLARED
                slot control first (TARGET-1: the assumed-value quantity chip /
                the target-well slot, both riding `record`), then the picker
                (the same per-slot picker identity law the panel documents),
                else the numbered options, else the typed parameter box. */}
            {controlKind === 'quantity' && request.clarifyControl ? (
              <ClarifyAssumedChip
                requestId={request.id}
                control={request.clarifyControl}
                onAnswer={declaredAnswer}
                disabled={disabled}
              />
            ) : controlKind === 'wells' && request.clarifyControl ? (
              <ClarifyWellTargetSlot
                requestId={request.id}
                onAnswer={declaredAnswer}
                disabled={disabled}
                selectedWells={selectedWells}
              />
            ) : hasPicker ? (
              <ClarificationPicker
                key={request.id}
                request={request}
                onPick={(answer) => record(request, answer)}
              />
            ) : options.length > 0 ? (
              <ol className="chat-clarification-card__options">
                {options.map((option, optionIndex) => {
                  const answer = {
                    requestId: request.id,
                    optionId: option.id,
                    label: option.label,
                    ...(option.ref !== undefined ? { ref: option.ref } : {}),
                  } satisfies AiClarificationAnswer
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        className="chat-clarification-card__option"
                        disabled={disabled}
                        data-testid={`chat-clarification-option-${request.id}`}
                        onClick={() => record(request, answer)}
                      >
                        {optionIndex + 1}. {option.label}
                      </button>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <ParameterAnswerInput
                requestId={request.id}
                placeholder="Type your answer…"
                disabled={disabled}
                onAnswer={(answer) => record(request, { requestId: request.id, value: answer.value, label: answer.label })}
              />
            )}
          </section>
        )
      })}
      {onClarificationSubmit ? (
        <button
          type="button"
          className="chat-clarification-card__submit"
          data-testid="chat-clarification-submit"
          disabled={disabled || !allAnswered}
          onClick={submit}
        >
          Submit answers
        </button>
      ) : null}
    </div>
  )
}

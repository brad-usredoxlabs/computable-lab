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
   * Prompts the bubble has already printed (message.content) — render-side
   * dedupe, the single-request arm's BGATE-FIX D3 rule (ChatLog.tsx
   * shownPrompts). A section prints its prompt only when the bubble and no
   * earlier section have shown that exact sentence. Pass [] for a standalone
   * card (no bubble to dedupe against).
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
}

export function ChatClarificationCard({
  requests,
  turnKey,
  shownPrompts,
  disabled,
  onClarificationSubmit,
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
        // BGATE-FIX D3 (the single-request arm's rule, ChatLog.tsx shownPrompts):
        // the bubble already printed message.content; a section prints its
        // prompt only when the bubble and no earlier section have shown that
        // exact sentence. The answer controls are never gated.
        const promptAlreadyShown = shownPrompts.has(request.prompt)
        if (!promptAlreadyShown) shownPrompts.add(request.prompt)
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
            {/* Exactly ONE answer surface per slot (spec item 2): the picker
                (the same per-slot picker identity law the panel documents),
                else the numbered options, else the typed parameter box. */}
            {hasPicker ? (
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

/**
 * ChatLog — the shared conversation log + composer for the harness chat pane
 * (promoted from sequences/SequenceChat.tsx, HARNESS-SEQ-1).
 *
 * The scroll spine (followLatest + ResizeObserver + resize-vs-user-scroll
 * disambiguation) and the pinned selectors (`sequence-chat` root class,
 * role=log name=Conversation, 'Review action' with the originating request,
 * 'Latest messages ↓' pill, textarea labelled 'Message') are kept verbatim —
 * e2e/sequence-chat-scroll.spec.ts pins them.
 *
 * A clarification turn (ChatMessage.clarification) renders as the prompt plus
 * its numbered options as buttons; picking one answers through the host's
 * onClarificationPick (the next chat turn), never a blocking card. The answer
 * text reuses lane 2's exported clarificationAnswerPrompt — import-only.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { AiClarification, AiClarificationAnswer, AiClarificationRequest, ChatMessage } from '../types/ai'
import { clarificationAnswerPrompt } from '../shared/hooks/clarificationAnswerPrompt'
import { ClarificationPicker, requestHasPicker } from '../event-editor/right-pane/ai/ClarificationPicker'
// L2-CLARIFY-TARGET-1 (UI-gate fix1 / R1.5): the typed-answer fallback for a
// request whose menu yields ZERO options (no declared slot, no options, no
// picker) — the same component the grouped card falls back to
// (ChatClarificationCard.tsx:243), so the single-request arm offers ONE
// vocabulary for the typed answer, never a second control.
import { ParameterAnswerInput } from '../event-editor/right-pane/ai/ParameterAnswerInput'
// L2-CLARIFY-TARGET-1 (Change 2 + 4, RE-PIN NOTE S3): the declared-slot answer
// surfaces mount in the TYPED arm too (the n===1 single-fact turn goes through
// renderTypedClarification, not the grouped card). Same components as the card;
// the answer rides the existing onClarificationPick sink (clarificationAnswerPrompt).
import { ClarifyAssumedChip } from './ClarifyAssumedChip'
import { ClarifyWellTargetSlot } from './ClarifyWellTargetSlot'
import { ChatClarificationCard } from './ChatClarificationCard'
import { ANSWER_KIND_WORD } from '../shared/taptab/slashMenu/tokens'
import './ChatLog.css'

export interface ChatLogProps {
  messages: ChatMessage[]
  isStreaming: boolean
  prompt: string
  onPromptChange: (value: string) => void
  onSend: () => void
  onCancel: () => void
  /** Host review handler; absent -> the Review-action button is omitted. */
  onReview?: (proposal: Record<string, unknown>, userRequest?: string) => void
  /** Answer a clarification option as the next chat turn; absent -> options are not offered. */
  /**
   * ANSWER-CHANNEL: the third argument is the STRUCTURED answer (the picker's
   * own `{requestId, label, mentionToken, ref}`) and the fourth the request it
   * answers. The first argument stays the human sentence the scientist sees in
   * the transcript. Callers MUST forward the structured pair to the turn —
   * carrying only the sentence (the pre-fix behaviour) makes the server
   * re-draft the ambiguous noun instead of folding the choice, which loops.
   */
  onClarificationPick?: (
    answerText: string,
    answer: AiClarificationAnswer,
    request: AiClarificationRequest,
  ) => void
  /**
   * L2-CLARIFY-CARD-1 (P4) — answer a WHOLE sentence (a message with MULTIPLE
   * unresolved facts) in ONE turn. The first argument is the batch answer
   * sentence (the card builds it from the already-exported
   * clarificationAnswersPrompt — one source), the second the slot-ordered
   * structured answers, the third the requests they answer. The host forwards
   * the array to the turn ({ clarificationAnswers: answers }) and the server
   * folds the batch in ONE turn with zero model calls (AgentOrchestrator.ts
   * clarificationAnswers array fold). Rendered ONLY for
   * `clarificationRequests.length > 1` (the grouped card); the single-request
   * and legacy arms keep the immediate one-click path (onClarificationPick).
   * Absent -> no grouped card is offered (the single-arm regression lock).
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
   * Threaded to the target-well slot (both the single-request arm and the
   * grouped card). Absent (a non-deck host) -> the slot's context fallback
   * is used, so the universal pane's public API acquires no event-editor type
   * and no non-deck caller breaks.
   */
  selectedWells?: readonly string[]
}

/** Shape the exported lane-2 answer helper expects, built from the message's clarification. */
function clarificationRequest(clarification: AiClarification): AiClarificationRequest {
  return {
    id: clarification.id ?? 'clarification',
    // AiClarification.entityType is always present and is what the helper
    // reads first; 'general' is the neutral member of the request union.
    kind: 'general',
    prompt: clarification.prompt,
    entityType: clarification.entityType,
    menuProvider: clarification.menuProvider ?? 'choice',
    options: clarification.options,
    ...(clarification.query !== undefined ? { query: clarification.query } : {}),
    ...(clarification.allowCreateLocal !== undefined ? { allowCreateLocal: clarification.allowCreateLocal } : {}),
  }
}

/**
 * L2-CHAT-UI-1 LEG A (A4) — clarify-then-compact, as a PURE render-time
 * derivation over the messages array (no reducer state, no surface
 * branching). A clarification turn (carrying `clarification` and/or
 * `clarificationRequests`) is ANSWERED iff a following user message exists:
 * answering sends the answer as the next chat turn (HarnessChatPane ->
 * useAiChat appends the user message), so the answer is the
 * immediately-following user turn by construction. Generic adjacency rule —
 * one predicate gates BOTH arms (the uifix1 F1 single-arm gate: both the
 * legacy block and the typed requests come off the same answered state).
 */
function isClarificationAnswered(messages: ChatMessage[], index: number): boolean {
  return messages[index + 1]?.role === 'user'
}

/** The question's prompt for the compact row (typed arm first — canonical). */
function clarificationQuestion(message: ChatMessage): string | undefined {
  return message.clarificationRequests?.[0]?.prompt ?? message.clarification?.prompt
}

/**
 * L2-CLARIFY-CARD-1 (advc-c4 D1, fix run 3, ORCH AMENDMENT 2 §3) — THE ONE
 * predicate that decides whether a typed clarification request renders a
 * PROMPT. The single-request arm (renderTypedClarification below) and the
 * grouped card (ChatClarificationCard) both read a request's OWN shape —
 * `options.length > 0 || requestHasPicker(request)` — never its prompt text.
 * The bubble-suppression arm (bubbleIsOwnedPrompt) must key on this SAME
 * render decision, not on the request COUNT: the server emits
 * `menuProvider: 'choice'`, `options: []` for any fact whose argument
 * declares no domain (shorthandChat.ts:883-887, 903-907 — `volumeUl` is
 * `kind: quantity` with no domain), and for that shape NEITHER arm renders a
 * prompt (renderTypedClarification returns null; the grouped card, mounted
 * only for 2+ requests, has no answer surface for it). A count-keyed
 * suppression deleted the bubble question for exactly that shape — the
 * question printed ZERO times and the assistant row rendered empty (the
 * reviewer's probe: base = 1 print, HEAD = 0 prints). Deriving the
 * suppression from this predicate restores BASE behaviour for a request the
 * card cannot render (the bubble prints the question once, the documented
 * contract of the sibling arm at :213-215) while keeping it suppressed for a
 * request the card actually prints (the live first-ask shape: content ===
 * the owned prompt; never twice, never zero). One copy of the rule —
 * both arms call it; no prose sniffing, no prompt-text matching.
 */
function requestRendersPrompt(request: AiClarificationRequest): boolean {
  return (request.options ?? []).length > 0 || requestHasPicker(request)
}

/**
 * L2-CLARIFY-TARGET-1 (fix1/D2, adversarial l2t0230) — THE ONE extended
 * render decision, used by BOTH the single-request render guard AND the
 * bubble-suppression arm. A request renders an OWNED prompt when it either
 * has the shared options/picker surface (`requestRendersPrompt`) OR a
 * DECLARED `clarifyControl` slot (kind 'quantity' / 'wells') — the single
 * n===1 gap: a `clarifyControl` request has NO options and NO picker, so the
 * base `requestRendersPrompt` alone would (a) drop the single-fact turn as
 * unanswerable (the render guard) and (b) leave the bubble UN-suppressed even
 * though the card renders the prompt → the question printed TWICE (the
 * reviewer's probe: EXACT PROMPT NODE COUNT = 2 for one assistant message +
 * one `clarifyControl` request with `options: []`). Deriving BOTH the guard
 * and the bubble-suppression from this ONE predicate restores the CARD-1
 * invariant ("never twice, never zero") for the new surface with ONE copy of
 * the rule. For a request WITHOUT `clarifyControl` (every legacy
 * options/picker shape) this reduces to `requestRendersPrompt` — byte-identical
 * behaviour, so the CARD-1 pins are untouched.
 *
 * L2-CLARIFY-TARGET-1 (UI-gate fix1 / R1.5) — the ZERO-OPTION typed arm: a
 * request with NO declared slot, NO options and NO picker (the live 1/10
 * `kind: 'parameter'` / `menuProvider: 'choice'` shape — a parameter the model
 * must be TYPED, e.g. a volume) renders its OWN prompt through the
 * `ParameterAnswerInput` fallback (the SAME surface the grouped card falls
 * back to, ChatClarificationCard.tsx:243) instead of the render guard bailing
 * and leaving the question with no actionable control. It must be added to
 * this SHARED predicate — not just the guard — because the bubble-suppression
 * arm (:486) keys on the SAME rule: if only the guard changed, the card would
 * print the prompt AND the bubble would print its verbatim copy → the question
 * twice (the D2 double-print, re-opened for this shape). For EVERY shape that
 * was un-renderable before (no slot + no options + no picker) the guard and
 * the suppression agree: the card owns the print, the bubble suppresses.
 */
function requestRendersOwnedPrompt(request: AiClarificationRequest): boolean {
  if (request.clarifyControl != null || requestRendersPrompt(request)) return true
  // R1.5 zero-option typed arm: no slot, NO options, NO picker → the typed
  // answer input is the request's OWN answer surface (the grouped card's
  // exact final fallback). A 'general'/'parameter' question a menu cannot
  // answer from a list is still answerable by typing — never a dead card.
  return (request.options ?? []).length === 0
}

/**
 * L2-CLARIFY-PICKER-1 (P2, W5) — the human-facing ANSWER sentence. The picker
 * sends the agent `Use [[material:…|…]] for material.` (byte-stable wire
 * contract — clarificationAnswerPrompt.ts is untouched), but the TRANSCRIPT
 * row must never leak that wiki-markup to the scientist. Each mention token
 * `[[type:id|label]]` reads as `label (kind-word id)`, the kind word being the
 * existing ontology term for the mention kind (concept / formulation /
 * instance / aliquot / vendor-product — no new vocabulary). A plain-text
 * answer (no token) renders exactly as written.
 */
const MENTION_TOKEN_RE = /\[\[([A-Za-z][\w-]*):([^\][|]*)(?:\|([^\]]*))?\]\]/g
// L2-CLARIFY-PICKER-1 P2 (advc-c1 DEFECT 3): the kind-word table is the ONE
// shared vocabulary in ./tokens (ANSWER_KIND_WORD) — the answered row and the
// per-row consequence line both read from it, so a row's id/kind never gets a
// second human rendering. (No local copy: that was the duplicate vocabulary.)

export function clarificationAnsweredText(content: string): string {
  if (!content.includes('[[')) return content
  return content.replace(MENTION_TOKEN_RE, (_m, type: string, id: string, label?: string) => {
    const name = (label ?? id).trim() || id
    return `${name} (${ANSWER_KIND_WORD[type] ?? type} ${id})`
  })
}

/**
 * L2-CLARIFY-PICKER-1 P2 (advc-c1 DEFECT 4) — the human-facing BUBBLE text.
 * The picker's answer turn is stored verbatim as the user message (the wire
 * prompt `Use [[material:…|…]] for material.` is byte-stable for the AGENT —
 * clarificationAnswerPrompt.ts + server/src/ai untouched), but the TRANSCRIPT
 * bubble must never show the scientist their own raw wiki-markup. Format the
 * mention tokens with the SAME readable-token helper as the answered row
 * (`[[type:id|label]]` -> `label (kind-word id)`); token-free text is a no-op.
 */
export function clarificationBubbleText(content: string): string {
  return clarificationAnsweredText(content)
}

export function ChatLog({ messages, isStreaming, prompt, onPromptChange, onSend, onCancel, onReview, onClarificationPick, onClarificationSubmit, selectedWells }: ChatLogProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const viewportRef = useRef({ width: 0, height: 0 })
  const [following, setFollowing] = useState(true)
  const latestUserId = [...messages].reverse().find(message => message.role === 'user')?.id
  const previousUserId = useRef(latestUserId)

  const followLatest = useCallback(() => {
    followingRef.current = true
    setFollowing(true)
    const scroller = scrollerRef.current
    if (scroller) {
      viewportRef.current = { width: scroller.clientWidth, height: scroller.clientHeight }
      scroller.scrollTop = scroller.scrollHeight
    }
  }, [])

  // Includes hydration, new messages, and text updates to an existing streaming reply.
  useLayoutEffect(() => {
    const sentPrompt = latestUserId !== previousUserId.current
    previousUserId.current = latestUserId
    if (followingRef.current || sentPrompt) followLatest()
  }, [messages, latestUserId, followLatest])

  // Pane resizing and line wrapping can move the bottom without changing messages.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (followingRef.current) followLatest()
      else viewportRef.current = { width: scroller.clientWidth, height: scroller.clientHeight }
    })
    observer.observe(scroller)
    observer.observe(content)
    return () => observer.disconnect()
  }, [followLatest])

  function onScroll() {
    const scroller = scrollerRef.current
    if (!scroller) return
    // Resizing can emit a scroll event before ResizeObserver runs. That event
    // must not be mistaken for the reader deliberately leaving the bottom.
    const resized = viewportRef.current.width !== scroller.clientWidth || viewportRef.current.height !== scroller.clientHeight
    if (followingRef.current && resized) {
      followLatest()
      return
    }
    viewportRef.current = { width: scroller.clientWidth, height: scroller.clientHeight }
    const atBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 32
    followingRef.current = atBottom
    setFollowing(atBottom)
  }

  /**
   * A clarification turn is a PROMPT plus something to choose. The box must
   * never render empty: a typed clarifier (no `clarification.options`) used to
   * produce a bordered box containing only an empty <ol> — on a phone that
   * reads as a mangled grey rectangle under the question.
   */
  function renderClarificationBlock(message: ChatMessage) {
    const clarification = message.clarification!
    // L2-SUITE-A-uifix3 [D3-CHROME] (regate-5 defect 3, chrome slice): a
    // THREAD-RESTORED message (the useAiChat getThread hydrate marks it
    // `restored: true`) renders NEITHER the picker NOR the option buttons —
    // its answer inputs belong to live staged cards only. A restored
    // menu-backed clarifier (options: [], menuProvider '/l'/'/m') otherwise
    // falls through to the picker arm below and mounts the real
    // ClarificationPicker, whose search input ALWAYS renders (only the
    // popover is open-gated) — the gate's 8 bare <input placeholder="Search
    // labware…"> boxes floating above "You …" with no question. The question
    // text itself is the message content, already rendered in the main loop
    // (`<p>{message.content}</p>`), so "render neither" preserves the record
    // of what was asked while dropping the dead chrome. Live turns carry no
    // `restored` flag and render byte-unchanged (the controls pin this).
    if (message.restored) return null
    const options = clarification.options ?? []
    const request = clarificationRequest(clarification)
    const promptDiffers = message.content !== clarification.prompt
    if (options.length === 0) {
      // No literal options — but a MENU-BACKED clarifier ("the draft names
      // 'unobtainium' … choose what it is") is answerable through the picker.
      // The server persists exactly this shape (options: [], menuProvider '/m',
      // query, allowCreateLocal), so rendering nothing left the question
      // unanswerable, and rendering the empty <ol> left a mangled grey box.
      if (!onClarificationPick || !requestHasPicker(request)) return null
      return <div className="chat-log-clarification" key={`clar-${message.id}`}>
        {promptDiffers && <p>{clarification.prompt}</p>}
        <ClarificationPicker
          request={request}
          onPick={(answer) => onClarificationPick(clarificationAnswerPrompt(answer, request), answer, request)}
        />
      </div>
    }
    return <div className="chat-log-clarification" key={`clar-${message.id}`}>
      {promptDiffers && <p>{clarification.prompt}</p>}
      {onClarificationPick && <ol className="chat-log-clarification-options">
        {options.map((option, optionIndex) => {
          const answer = {
            requestId: clarification.id ?? message.id,
            optionId: option.id,
            label: option.label,
            ...(option.ref !== undefined ? { ref: option.ref } : {}),
          } satisfies AiClarificationAnswer
          return <li key={option.id}>
            <button onClick={() => onClarificationPick(clarificationAnswerPrompt(answer, request), answer, request)}>{optionIndex + 1}. {option.label}</button>
          </li>
        })}
      </ol>}
    </div>
  }

  /**
   * Typed (menu-backed) clarifications: the question carries its own options or
   * a picker. Ignoring them left the pane showing a question with no way to
   * answer it — the old pane rendered them through QuestionsPanel.
   *
   * BGATE-FIX D3 (render-side dedupe, owned-file only): the done arm sets
   * message.content to the clarification prompt (useAiChat.ts:1419), so an
   * UNCONDITIONAL <p>{request.prompt}</p> printed the same sentence again under
   * the bubble paragraph — the gate measured the question twice/thrice per
   * turn. Mirror the block arm's existing promptDiffers rule (:151, the
   * restored-chrome lock depends on it) and extend it across SIBLING request
   * cards sharing one prompt string: a card shows the prompt paragraph only
   * when neither the bubble nor an earlier card has already shown that exact
   * sentence. The answer controls are never gated.
   */
  function renderTypedClarification(
    messageId: string,
    request: AiClarificationRequest,
    shownPrompts: Set<string>,
  ) {
    const options = request.options ?? []
    // L2-CLARIFY-TARGET-1 (RE-PIN NOTE S3): the n===1 gap. A request that
    // carries a `clarifyControl` (kind 'quantity' / 'wells') renders its OWN
    // declared answer surface (the chip / the target-well slot) — it has NO
    // options and NO picker, so the shared requestRendersPrompt predicate
    // (the bubble-suppression arm keys on the SAME rule) would otherwise DROP
    // it here and leave the single-fact V2 turn unanswerable. The guard is
    // EXTENDED to allow `clarifyControl != null`; the predicate itself is
    // UNCHANGED (the bubble-suppression arm must keep working), so the prompt
    // still renders once (shownPrompts) and the bubble-suppression decision is
    // untouched. One additive answer-surface arm is added below.
    const hasDeclaredSlot = request.clarifyControl != null
    // advc-c4 D1 (fix run 3) + fix1/D2: the render decision is the SHARED
    // requestRendersOwnedPrompt predicate — the SAME extended rule the
    // bubble-suppression arm keys on (ONE copy: `clarifyControl != null ||`
    // options/picker || the R1.5 zero-option typed arm). No second copy of the
    // options/picker check.
    if (!requestRendersOwnedPrompt(request)) return null
    const hasPicker = requestHasPicker(request)
    const promptAlreadyShown = shownPrompts.has(request.prompt)
    if (!promptAlreadyShown) shownPrompts.add(request.prompt)
    return <div className="chat-log-clarification" key={`req-${messageId}-${request.id}`} data-testid={`chat-log-request-${request.id}`}>
      {!promptAlreadyShown && <p>{request.prompt}</p>}
      {/* Exactly ONE answer surface per request (the grouped card's law,
          ChatClarificationCard.tsx:193-249): the DECLARED slot control first
          (TARGET-1's quantity chip / target-well slot), then the numbered
          options, then the picker, else the typed parameter box. A request the
          menu cannot answer from a list (no slot, no options, no picker — the
          live 1/10 `kind:'parameter'`/`menuProvider:'choice'` shape) must still
          be answerable by TYPING: the ParameterAnswerInput is the SAME component
          the grouped card falls back to — one vocabulary for the typed answer,
          never a second control, never a card with no actionable control (R1.5).
          The answer rides the existing onClarificationPick sink
          (clarificationAnswerPrompt — the same wire the options/picker arms use). */}
      {hasDeclaredSlot && onClarificationPick && request.clarifyControl?.kind === 'quantity' ? (
        <ClarifyAssumedChip
          requestId={request.id}
          control={request.clarifyControl}
          onAnswer={(answer) => onClarificationPick(clarificationAnswerPrompt(answer, request), answer, request)}
        />
      ) : hasDeclaredSlot && onClarificationPick && request.clarifyControl?.kind === 'wells' ? (
        <ClarifyWellTargetSlot
          requestId={request.id}
          onAnswer={(answer) => onClarificationPick(clarificationAnswerPrompt(answer, request), answer, request)}
          selectedWells={selectedWells}
        />
      ) : options.length > 0 && onClarificationPick ? (
        <ol className="chat-log-clarification-options">
          {options.map((option, optionIndex) => {
            const answer = {
              requestId: request.id,
              optionId: option.id,
              label: option.label,
              ...(option.ref !== undefined ? { ref: option.ref } : {}),
            } satisfies AiClarificationAnswer
            return <li key={option.id}>
              <button onClick={() => onClarificationPick(clarificationAnswerPrompt(answer, request), answer, request)}>{optionIndex + 1}. {option.label}</button>
            </li>
          })}
        </ol>
      ) : hasPicker && onClarificationPick ? (
        <ClarificationPicker
          key={request.id}
          request={request}
          onPick={(answer) => onClarificationPick(clarificationAnswerPrompt(answer, request), answer, request)}
        />
      ) : options.length === 0 && !hasPicker && onClarificationPick ? (
        <ParameterAnswerInput
          requestId={request.id}
          onAnswer={(answer) => onClarificationPick(clarificationAnswerPrompt(answer, request), answer, request)}
        />
      ) : null}
    </div>
  }

  return <aside className="sequences-page sequence-chat">
    <h2>AI Chat</h2>
    <p className="sequence-hint">Ask for an edit, a draft or a navigation. Review proposed actions before applying them.</p>
    <div className="sequence-chat-messages" ref={scrollerRef} onScroll={onScroll} role="log" aria-label="Conversation" aria-live="polite" tabIndex={0}>
      <div className="sequence-chat-content" ref={contentRef}>
        {messages.map((message, index) => {
          // L2-CHAT-UI-1 LEG A (A1): directional bubbles — the row wrap is a
          // CLASS addition (the pinned DOM structure: .sequence-chat root,
          // role=log, the composer, the 'Review action' button, the message
          // prose — is untouched); the accessible author name stays the
          // <strong>You/Assistant</strong> label inside the row.
          const bubbleClass = message.role === 'user'
            ? 'chat-log-msg chat-log-msg--user'
            : message.role === 'system'
              ? 'chat-log-msg chat-log-msg--system'
              : 'chat-log-msg chat-log-msg--assistant'
          // L2-CHAT-UI-1 LEG A (A4): the ONE answered predicate (pure
          // render-time derivation over the messages array — see
          // isClarificationAnswered). Answered -> both bulky arms come off
          // the DOM and ONE compact row stands in for them. Unanswered ->
          // the arms below render byte-unchanged.
          const hasClarification = Boolean(message.clarification) || Boolean(message.clarificationRequests?.length)
          const answered = hasClarification && isClarificationAnswered(messages, index)
          const answerMessage = answered ? messages.slice(index + 1).find((m) => m.role === 'user') : undefined
          // BGATE-FIX D3 (render-side dedupe — see renderTypedClarification):
          // the typed cards print a prompt only when it is NOT already on
          // screen.
          // L2-CLARIFY-CARD-1 (browser-gate fix3, advc-c3 D1 + D2 — ORCH RULING 2):
          // the card OWNS its prompts. The bubble shows the PLAIN question on a
          // first ask but the clarification_loop escalation on a repeat ask
          // (useAiChat flips message.content), so seeding the dedupe from
          // message.content made the card's visible prompts — and its hash —
          // FLIP between wordings for an IDENTICAL slot set (2 distinct hashes
          // per 10 draws; 9 of 10 gate draws are single-request), and re-print
          // the first slot's question once the bubble stopped carrying its
          // exact text (the double-print). An identity seed (the first request's
          // prompt) is deterministic but HIDEs the prompt whenever the bubble
          // does not carry it — the D2 zero-print (a card that always dedupes
          // its own prompt is a question that is printed ZERO times on a
          // loop-text bubble). So the card OWNS the print: an EMPTY seed means
          // the card renders EVERY prompt ONCE (intra-card dedupe for a shared
          // string), independent of the bubble's wording — the same slot set
          // renders byte-identically no matter what the bubble carries. The
          // BUBBLE side of the invariant lives in `bubbleIsOwnedPrompt` below:
          // when the bubble verbatim carries a prompt the card owns (the live
          // first-ask shape, useAiChat.ts:1543) it is suppressed, so the
          // sentence is on screen EXACTLY ONCE — never twice (the double-print)
          // and never zero (the card's owner slot always prints). (ORCH RULING 2
          // authorizes the seed-derivation change in the single arm — the seed
          // no longer reads message.content; nothing else in the single arm
          // changes — renderTypedClarification's dedupe logic is untouched.)
          const shownPrompts = new Set<string>()
          const groupedShownPrompts = new Set<string>()
          // D2 (advc-c3 fix3): the card is the deterministic OWNER of the typed
          // message's prompts, so the bubble must not double-print the one it
          // carries verbatim (the live first-ask shape, useAiChat.ts:1543:
          // content === the first request's prompt).
          // advc-c4 D1 (fix run 3, ORCH AMENDMENT 2 §3): the suppression is
          // derived from the SAME decision that decides a prompt actually
          // RENDERS, not from the request COUNT. Which decision applies is
          // the message's own arm:
          //   - grouped arm (this map renders ChatClarificationCard): the
          //     card renders EVERY request's prompt unconditionally (its slot
          //     answer surface falls back to the parameter box), so any
          //     verbatim-owned prompt is card-printed — suppress (the pre-fix
          //     behaviour, which is correct THERE: the card always owns the
          //     print, so suppression can never zero it);
          //   - single arm (renderTypedClarification per request): a prompt
          //     renders only when requestRendersPrompt(r) holds (the shared
          //     options/picker rule the arm's guard calls). For a request the
          //     card renders NOTHING for (`choice`/`options: []`/no picker —
          //     the shape the server emits for every non-domain argument,
          //     e.g. `volumeUl`) the card owns NO print, so the bubble KEEPS
          //     BASE behaviour: it prints the question once, exactly as the
          //     sibling arm's documented contract at :213-215 requires.
          //     Suppressing on count deleted that question for precisely that
          //     shape (base = 1 print, HEAD = 0 prints, empty assistant row —
          //     the reviewer's probe).
          // A loop-escalation bubble (the repeat-ask content) matches no
          // prompt, so it is printed as-is and the card still prints every
          // renderable prompt — exactly once each. The legacy block arm (no
          // clarificationRequests) keeps its own promptDiffers dedupe and is
          // never suppressed here.
          const rendersGroupedCard = (message.clarificationRequests?.length ?? 0) > 1
            && onClarificationSubmit !== undefined
          const typedCardRendersOwnedPrompt = !answered
            && (message.clarificationRequests ?? []).some(
              (r) => r.prompt === message.content && (rendersGroupedCard || requestRendersOwnedPrompt(r)),
            )
          const bubbleIsOwnedPrompt = typedCardRendersOwnedPrompt
          return <div key={message.id} className={bubbleClass}>
          <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
          {message.shorthand !== undefined && (
            // L2-CHAT-UI-1 LEG A (A2): the scientist-intent shorthand —
            // VERBATIM in a <pre>, marked off above the content, read-only
            // (OQ-3 ruled: no edit/recompile round-trip in the universal card).
            <div className="chat-log-intent-card" data-testid="chat-log-intent-card">
              <div className="chat-log-intent-card__label">Scientist-intent shorthand (exactly what the compiler ran)</div>
              <pre className="chat-log-intent-card__body" data-testid="chat-log-intent-card-body">{message.shorthand}</pre>
            </div>
          )}
          {/* L2-CLARIFY-PICKER-1 P2 (advc-c1 DEFECT 4): the bubble renders the
              mention tokens as the SAME readable-token sentence as the
              answered row — the raw `[[material:…]]` wiki-markup the picker
              sends to the agent (byte-stable wire) never shows the scientist
              their own turn. Token-free content passes through unchanged.
              L2-CLARIFY-CARD-1 (advc-c3 D2, fix3): the bubble is OMITTED when
              it verbatim carries a prompt the grouped card OWNS (the live
              first-ask shape) — the card is the single owner of that sentence,
              so printing it here too would be the double-print. Every other
              bubble (loop escalation, a prose answer, a non-verbatim content)
              prints as-is. */}
          {!bubbleIsOwnedPrompt ? <p>{clarificationBubbleText(message.content)}</p> : null}
          {message.sequenceProposal && onReview && <button onClick={() => onReview(message.sequenceProposal!, message.sequenceProposalRequest ?? messages.slice(0, index).reverse().find(m => m.role === 'user')?.content)}>Review action</button>}
          {/* L2-SUITE-A-uifix1 F1: exactly ONE clarification arm per message.
              When the typed requests ride the message (the universal done
              arm feeds BOTH fields from one payload — useAiChat done arm),
              the typed arm is canonical: it renders EVERY request as a
              card. The legacy block arm then renders the same first
              request a SECOND time (the gate's blocks=2 pickers=2). It
              stays for messages carrying only the legacy field (hydrated
              history / legacy surfaces that never populate
              clarificationRequests).
              L2-CHAT-UI-1 LEG A (A4) additionally gates BOTH arms on the
              same answered predicate: an answered clarifier renders the
              compact row instead (the bulky picker/option list must be
              ABSENT from the DOM, not hidden). */}
          {answered ? (
            <div className="chat-log-clarification-answered" data-testid="chat-log-clarification-answered">
              Answered: {answerMessage ? clarificationAnsweredText(answerMessage.content) : ''} — {clarificationQuestion(message)}
            </div>
          ) : (
            <>
              {message.clarification && !(message.clarificationRequests?.length) && renderClarificationBlock(message)}
              {message.clarificationRequests && message.clarificationRequests.length > 1 && onClarificationSubmit ? (
                // L2-CLARIFY-CARD-1 (P4): ONE card per sentence (one slot per
                // fact, one Submit, one answered row). The single-request and
                // legacy arms below keep the immediate one-click path
                // (regression lock: ChatLog.test.tsx:131 toHaveBeenCalledTimes(1)
                // and 20+ single-slot pins — the map stays for length === 1 and
                // for hosts that offer no batch submit).
                <ChatClarificationCard
                  key={`card-${message.id}`}
                  requests={message.clarificationRequests}
                  turnKey={`${message.id}:${message.clarificationRequests.map((r) => r.id).join('|')}`}
                  shownPrompts={groupedShownPrompts}
                  onClarificationSubmit={onClarificationSubmit}
                  selectedWells={selectedWells}
                />
              ) : (
                message.clarificationRequests?.map((request) => renderTypedClarification(message.id, request, shownPrompts))
              )}
            </>
          )}
        </div>
        })}
      </div>
    </div>
    {!following && <button className="sequence-chat-latest" onClick={followLatest}>Latest messages <span aria-hidden="true">↓</span></button>}
    <label>Message<textarea rows={4} value={prompt} onChange={event => onPromptChange(event.target.value)}/></label>
    <button disabled={isStreaming || !prompt.trim()} onClick={onSend}>Send</button>
    {isStreaming && <button data-testid="interpreting-stop" onClick={onCancel}>Cancel</button>}
  </aside>
}

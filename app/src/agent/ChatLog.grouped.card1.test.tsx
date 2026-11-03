/**
 * L2-CLARIFY-CARD-1 (P4) RED — one card per sentence (one slot per fact, one
 * Submit, one answered row) in the chat host.
 *
 * Pre-fix (base tip): a message whose clarificationRequests.length > 1 renders
 * ONE `chat-log-clarification` CARD PER REQUEST (the renderTypedClarification
 * map) — each with its OWN one-click answer (onClarificationPick) — so a
 * two-noun sentence fired TWO independent answer turns, TWO answered rows, and
 * no way to answer the sentence as one unit. This test fails today (two
 * cards, no chat-clarification-card, no submit) and passes only when Change 1
 * lands (ONE grouped card, ONE submit, one batch answer turn).
 *
 * The picker is mocked to a deterministic fake (the card under test is the
 * GROUPING + submit gating + batch sentence — the picker's own mint/search
 * behaviour is pinned separately in ChatClarificationCard.mint.test.tsx).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { clarificationAnswersPrompt } from '../shared/hooks/clarificationAnswerPrompt'
import { ChatLog } from './ChatLog'

// Deterministic fake picker: one pick button per slot; clicking it answers that
// slot with a mention token (the card records the pick; Submit then fires).
vi.mock('../event-editor/right-pane/ai/ClarificationPicker', () => {
  function FakePicker(props: { request: AiClarificationRequest; onPick: (a: unknown) => void }) {
    const r = props.request
    const noun = r.query ?? 'picked'
    return (
      <div data-testid={`fake-picker-${r.id}`}>
        <button
          type="button"
          data-testid={`fake-pick-${r.id}`}
          onClick={() =>
            props.onPick({
              requestId: r.id,
              label: noun,
              mentionToken: `[[material:MAT-${r.id}|${noun}]]`,
            })
          }
        >
          pick
        </button>
      </div>
    )
  }
  return {
    ClarificationPicker: FakePicker,
    requestHasPicker: (req: AiClarificationRequest) => ['/m', '/l', '/e'].includes(req.menuProvider),
  }
})

afterEach(cleanup)

const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }

// The two-noun sentence shape (tour3.json scenarios[3] — clofibrate + solvent):
// the bubble shows the FIRST prompt (message.content); the card must dedupe it
// and print only the second (BGATE-FIX D3).
const req1: AiClarificationRequest = {
  id: 'req-1',
  kind: 'material',
  prompt: 'Which material is the clofibrate stock?',
  entityType: 'material',
  menuProvider: '/m',
  query: '1 mM Clofibrate in DMSO',
  slot: 'material',
  options: [],
  allowCreateLocal: true,
}
const req2: AiClarificationRequest = {
  id: 'req-2',
  kind: 'material',
  prompt: 'Which material is the solvent?',
  entityType: 'material',
  menuProvider: '/m',
  query: 'solvent',
  slot: 'material',
  options: [],
  allowCreateLocal: true,
}

const fakeAnswer = (r: AiClarificationRequest) => ({
  requestId: r.id,
  label: r.query ?? 'picked',
  mentionToken: `[[material:MAT-${r.id}|${r.query ?? 'picked'}]]`,
})

const clarMessage: ChatMessage = {
  id: 'm1',
  role: 'assistant',
  content: req1.prompt,
  clarificationRequests: [req1, req2],
  timestamp: 0,
}

describe('L2-CLARIFY-CARD-1 (P4): one card per sentence, one Submit, one answered row', () => {
  it('renders ONE grouped card with TWO slot sections and ONE submit (not two per-request cards)', () => {
    const onSubmit = vi.fn()
    const onPick = vi.fn()
    render(<ChatLog {...props} onClarificationSubmit={onSubmit} onClarificationPick={onPick} messages={[clarMessage]} />)

    // ONE card, TWO slots, ONE submit — NOT the pre-fix two-cards/no-submit.
    expect(screen.getAllByTestId('chat-clarification-card')).toHaveLength(1)
    expect(screen.getAllByTestId('chat-clarification-slot')).toHaveLength(2)
    expect(screen.getAllByTestId('chat-clarification-submit')).toHaveLength(1)
    // The pre-fix per-request card is gone (the map did not render for this).
    expect(document.querySelector('.chat-log-clarification')).toBeNull()
  })

  it('D1 (advc-c1 fix1) / D2 (advc-c3 fix3): the card is the OWNER of the first slot prompt — it prints BOTH slot prompts once (the bubble that carried the first prompt verbatim is stripped), and the prompts survive a card-local re-render', () => {
    const onSubmit = vi.fn()
    const onPick = vi.fn()
    const { container } = render(<ChatLog {...props} onClarificationSubmit={onSubmit} onClarificationPick={onPick} messages={[clarMessage]} />)

    // The card owns the first slot's prompt (deterministic, D2): slot 1 prints
    // req1's question, slot 2 prints req2's — each ONCE. The bubble's content
    // IS req1.prompt (the live first-ask shape, useAiChat.ts:1543), so the
    // bubble paragraph would double-print it: it is stripped, and the card is
    // the single owner. Pre-fix (advc-c1 D1) the card MUTATED the shownPrompts
    // prop during render and the mount effect's re-render dropped every
    // <p class=chat-clarification-card__prompt>; pre-fix2 (advc-c3 D2) the
    // card hid slot 1 unconditionally (zero prints when the bubble did not
    // carry the sentence). Both are wrong — exactly once is the invariant.
    const promptTexts = () =>
      Array.from(container.querySelectorAll('.chat-clarification-card__prompt')).map((p) => p.textContent)
    expect(promptTexts()).toEqual([req1.prompt, req2.prompt])

    // Each prompt sentence appears EXACTLY ONCE on screen (bubble + card),
    // not merely "present" — the double-print (twice) AND the zero-print
    // (absent) are both defects.
    const countOnScreen = (text: string) =>
      Array.from(container.querySelectorAll('p')).filter((p) => p.textContent === text).length
    expect(countOnScreen(req1.prompt)).toBe(1)
    expect(countOnScreen(req2.prompt)).toBe(1)
    // advc-c4 D3 (fix run 3): the exact-<p> count scores 0 for a prompt
    // re-printed INSIDE a longer paragraph — the substring count over the
    // whole container is the backstop (a double-print embedded in a prose
    // preface would still count here).
    const substringCount = (text: string) => (container.textContent ?? '').split(text).length - 1
    expect(substringCount(req1.prompt)).toBe(1)
    expect(substringCount(req2.prompt)).toBe(1)

    // After a pick (a card-local re-render): the prompts must SURVIVE.
    fireEvent.click(screen.getByTestId('fake-pick-req-1'))
    expect(promptTexts()).toEqual([req1.prompt, req2.prompt])
    expect(countOnScreen(req1.prompt)).toBe(1)

    // After the second pick: still there.
    fireEvent.click(screen.getByTestId('fake-pick-req-2'))
    expect(promptTexts()).toEqual([req1.prompt, req2.prompt])
    expect(countOnScreen(req1.prompt)).toBe(1)
    expect(countOnScreen(req2.prompt)).toBe(1)
  })

  it('keeps the submit disabled until BOTH slots are picked, then answers the sentence ONCE with the batch builder (never onClarificationPick)', () => {
    const onSubmit = vi.fn()
    const onPick = vi.fn()
    render(<ChatLog {...props} onClarificationSubmit={onSubmit} onClarificationPick={onPick} messages={[clarMessage]} />)

    const submit = () => screen.getByTestId('chat-clarification-submit') as HTMLButtonElement
    // Never-guess: nothing is prefilled, so the submit is disabled at first.
    expect(submit().disabled).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()

    // Pick slot 1 only: still one slot unanswered -> still disabled.
    fireEvent.click(screen.getByTestId('fake-pick-req-1'))
    expect(submit().disabled).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()

    // Pick slot 2: both answered -> enabled.
    fireEvent.click(screen.getByTestId('fake-pick-req-2'))
    expect(submit().disabled).toBe(false)

    // Submit: ONE turn, a 2-element slot-ordered array, the batch sentence from
    // the ALREADY-exported builder — and the single-slot path is NOT called.
    fireEvent.click(submit())
    const expectedAnswers = [fakeAnswer(req1), fakeAnswer(req2)]
    const expectedSentence = clarificationAnswersPrompt(expectedAnswers, [req1, req2])
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(expectedSentence, expectedAnswers, [req1, req2])
    expect(onPick).not.toHaveBeenCalled()
  })

  it('after the batch turn renders EXACTLY ONE answered row (count, not textContent)', () => {
    const messages: ChatMessage[] = [
      clarMessage,
      { id: 'm2', role: 'user', content: 'the batch answer sentence', timestamp: 1 },
    ]
    render(<ChatLog {...props} onClarificationSubmit={vi.fn()} onClarificationPick={vi.fn()} messages={messages} />)
    // One batch submit = one user message = one answered row.
    expect(screen.getAllByTestId('chat-log-clarification-answered')).toHaveLength(1)
    // The grouped card is off the DOM once answered (the compact row stands in).
    expect(screen.queryByTestId('chat-clarification-card')).toBeNull()
  })

  it('D-1/D-4 (browser-gate fix2) + D2 (fix3): the grouped card is IDENTICAL across the first-ask and loop-escalation bubble wording (identity-driven dedupe, never message.content) AND each prompt sentence is on screen EXACTLY ONCE in both wordings — never twice, never zero', () => {
    // The browser gate measured 2 distinct hashes per 10 identical draws: the
    // card's dedupe seeded from message.content flips when the bubble wording
    // flips (first-ask = the plain question; repeat-ask = the clarification_loop
    // escalation, which does NOT carry either prompt sentence). Same slot set,
    // two bubble wordings -> the card must be byte-identical (D-1) and each
    // prompt sentence must appear EXACTLY ONCE on screen (D-4's invariant is
    // "exactly once", not "absent from the card": the card owns the first
    // slot's prompt; the bubble must not double-print it, and the loop text
    // must not leave it unprinted).
    const visible = (messages: ChatMessage[]) => {
      const { container, unmount } = render(
        <ChatLog {...props} onClarificationSubmit={vi.fn()} onClarificationPick={vi.fn()} messages={messages} />,
      )
      const cardPrompts = Array.from(container.querySelectorAll('.chat-clarification-card__prompt')).map((p) => p.textContent)
      const onScreen = (text: string) =>
        Array.from(container.querySelectorAll('p')).filter((p) => p.textContent === text).length
      // advc-c4 D3 (fix run 3): substring occurrences over the row text —
      // the backstop for a prompt re-printed inside a LONGER paragraph (the
      // exact-<p> count scores 0 for that).
      const rowEl = container.querySelector('.chat-log-msg--assistant') as HTMLElement
      const onScreenSubstring = (text: string) => (rowEl.textContent ?? '').split(text).length - 1
      // advc-c4 D3: POSITIVE assertion on the bubble paragraph — capture
      // presence explicitly, never a `?? ''` fallback that passes vacuously
      // when no non-card <p> exists. The bubble <p> is a DIRECT CHILD of the
      // row (the card's own <p>s — title and slots — are nested deeper, so
      // `p:not(.chat-clarification-card__prompt)` wrongly matched the card
      // title and the presence test was a false positive).
      const bubble = rowEl.querySelector(':scope > p')
      const result = {
        cardPrompts,
        bubbleExists: bubble !== null,
        bubbleContent: bubble?.textContent ?? '',
        count1: onScreen(req1.prompt),
        count2: onScreen(req2.prompt),
        count1Substring: onScreenSubstring(req1.prompt),
        count2Substring: onScreenSubstring(req2.prompt),
      }
      unmount()
      return result
    }
    // First-ask: the bubble carries the PLAIN question (the first request's prompt) —
    // the live shape (useAiChat.ts:1543: content = result.clarification.prompt).
    const firstAsk: ChatMessage = { id: 'm1', role: 'assistant', content: req1.prompt, clarificationRequests: [req1, req2], timestamp: 0 }
    // Repeat-ask: the bubble carries the clarification_loop escalation — the live
    // server text (clarificationLoopAsk.ts:94), which does NOT carry either prompt
    // sentence. The card must still print both prompts (exactly once each).
    const repeatAsk: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: 'clarification_loop: the draft names "1 mM Clofibrate in DMSO" (reason: unknown-noun), which the lab spine could not bind, and the SAME question has now been asked twice; a third identical card will not help. (2 questions looped this turn.) Answer the card (a pick is applied directly and ends the loop) or name an existing lab term explicitly; nothing was applied.',
      clarificationRequests: [req1, req2],
      timestamp: 0,
    }
    const first = visible([firstAsk])
    const repeat = visible([repeatAsk])

    // D-1: the CARD is byte-identical across the two bubble wordings.
    expect(repeat.cardPrompts).toEqual(first.cardPrompts)
    // The card owns BOTH prompts (the first slot is no longer hidden).
    expect(first.cardPrompts).toEqual([req1.prompt, req2.prompt])
    // Exactly once on screen in BOTH wordings — the first-ask bubble is
    // stripped (it carried req1.prompt verbatim, so it would double-print),
    // and the loop-text bubble does not suppress the card. The exact-<p>
    // counts AND the substring backstops agree (advc-c4 D3).
    expect(first.count1).toBe(1)
    expect(first.count2).toBe(1)
    expect(repeat.count1).toBe(1)
    expect(repeat.count2).toBe(1)
    expect(first.count1Substring).toBe(1)
    expect(first.count2Substring).toBe(1)
    expect(repeat.count1Substring).toBe(1)
    expect(repeat.count2Substring).toBe(1)
    // advc-c4 D3: the bubble paragraph's PRESENCE is asserted positively —
    // the first-ask bubble is ABSENT (the card owns the print; the `?? ''`
    // fallback used to pass vacuously when no non-card <p> existed), and the
    // loop-ask bubble is PRESENT and is the server's escalation text.
    expect(first.bubbleExists).toBe(false)
    expect(repeat.bubbleExists).toBe(true)
    expect(repeat.bubbleContent).toContain('clarification_loop:')
  })

  it('regression lock: a SINGLE request keeps the immediate one-click path and renders NO grouped card / NO submit', () => {
    const onSubmit = vi.fn()
    const onPick = vi.fn()
    const single: ChatMessage = {
      id: 'm-single',
      role: 'assistant',
      content: req1.prompt,
      clarificationRequests: [req1],
      timestamp: 0,
    }
    render(<ChatLog {...props} onClarificationSubmit={onSubmit} onClarificationPick={onPick} messages={[single]} />)

    // The grouped card + submit are absent for the single-request arm.
    expect(screen.queryByTestId('chat-clarification-card')).toBeNull()
    expect(screen.queryByTestId('chat-clarification-submit')).toBeNull()
    // The single-slot one-click path answers through onClarificationPick (the
    // pre-fix contract — 20+ pins depend on it).
    fireEvent.click(screen.getByTestId('fake-pick-req-1'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][2].id).toBe('req-1')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

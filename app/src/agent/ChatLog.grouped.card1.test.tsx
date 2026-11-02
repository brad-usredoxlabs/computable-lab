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

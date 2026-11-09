/**
 * L2-SUITE-A-uifix1 [F1] RED — the D3 fix makes ChatLog render every
 * clarification TWICE. The universal done arm (useAiChat.ts:1230-1240) sets
 * BOTH the legacy `clarification` field AND the typed `clarificationRequests`
 * on the same message (one payload, two fields — the D3 leg pins this shape),
 * and ChatLog rendered both arms UNCONDITIONALLY (ChatLog.tsx:196 legacy
 * block + :197 typed arm). Adversarial-gate render probe:
 *   ADVC-PROBE-P4 blocks=2 answerButtons=2
 *   ADVC-PROBE-P5 blocks=2 pickers=2
 *
 * This lock pins ONE card per request on a both-fields message — the exact
 * done-payload shape the D3 leg produces — for both the P4 option-bearing
 * shape and the P5 menu-backed (picker) shape, and pins that the answer
 * routes through the typed arm (the typed requests are the canonical shape;
 * the legacy field is the compatibility shape for hydrated history).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'

// The typed arm renders the real ClarificationPicker (menu-backed shape);
// mock it to the same contract the production picker exposes (.message-log__
// clarification-picker root + onPick) so the mount stays cheap and
// deterministic in jsdom.
const mockPicker = vi.hoisted(() => vi.fn((props: { request: { id: string }; onPick: (a: { label: string }) => void }) => (
  <div className="message-log__clarification-picker" data-testid={`mock-picker-${props.request.id}`}>
    <button data-testid={`pick-${props.request.id}`} onClick={() => props.onPick({ label: 'choice' })}>
      pick
    </button>
  </div>
)))

vi.mock('../event-editor/right-pane/ai/ClarificationPicker', () => ({
  ClarificationPicker: mockPicker,
  requestHasPicker: () => true,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }
const message = (id: string, role: ChatMessage['role'], content = id): ChatMessage => ({ id, role, content, timestamp: 0 })

// The D3 done-payload shape: the SAME request on both fields (exactly what
// the done arm produces: typed requests verbatim + the legacy shape derived
// from the first request).
const P4_REQUEST: AiClarificationRequest = {
  id: 'req-p4',
  kind: 'material',
  prompt: 'The declared composition fractions sum to 110 percent',
  entityType: 'material',
  menuProvider: 'choice',
  options: [
    { id: 'opt-a', label: 'Alpha' },
    { id: 'opt-b', label: 'Beta' },
  ],
}
const P5_REQUEST: AiClarificationRequest = {
  id: 'req-p5',
  kind: 'material',
  prompt: 'The draft names "clofibrate" — choose what it is',
  entityType: 'material',
  menuProvider: '/m',
  options: [],
  allowCreateLocal: true,
}

describe('ChatLog — L2-SUITE-A-uifix1 F1: a message carrying BOTH clarification fields renders ONE card', () => {
  it('P4 option-bearing shape: one block, exactly one option button per option, answer routed through the typed arm', () => {
    const onClarificationPick = vi.fn()
    const msg: ChatMessage = {
      ...message('both-1', 'assistant', P4_REQUEST.prompt),
      clarificationRequests: [P4_REQUEST],
      clarification: {
        id: 'req-p4',
        prompt: P4_REQUEST.prompt,
        entityType: 'material',
        menuProvider: 'choice',
        options: P4_REQUEST.options,
      },
    }
    render(<ChatLog {...props} onClarificationPick={onClarificationPick} messages={[message('u', 'user', 'q'), msg]} />)

    // THE F1 CLAIM: ONE clarification block for the one request.
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(1)
    // …and exactly ONE answer button per option (the gate saw 2x2).
    expect(screen.getAllByRole('button', { name: '1. Alpha' }).length).toBe(1)
    expect(screen.getAllByRole('button', { name: '2. Beta' }).length).toBe(1)
    // The answer routes through the typed arm (its request id — not the
    // legacy field's id, which happens to match here; the arm is the one
    // rendering the button).
    // LEG D re-pin: with the AiTabPanel mock block removed (spec §2.3), the
    // REAL clarificationAnswerPrompt (shared/hooks) builds the sentence from
    // request.entityType — production behavior, `Use ${value} for ${target}.`
    // — so the expected string carries the entity type, not the request id the
    // dead mock interpolated.
    fireEvent.click(screen.getByRole('button', { name: '1. Alpha' }))
    expect(onClarificationPick).toHaveBeenCalledTimes(1)
    // ANSWER-CHANNEL: the sentence is arg 1; the STRUCTURED answer (with the
    // chosen record's ref) and its request ride args 2-3 so the host can put
    // them on the wire — carrying the sentence alone is the loop regression.
    expect(onClarificationPick).toHaveBeenCalledWith(
      'Use Alpha for material.',
      expect.objectContaining({ requestId: 'req-p4', label: 'Alpha' }),
      expect.objectContaining({ id: 'req-p4' }),
    )
  })

  it('P5 menu-backed shape: one block, exactly ONE picker', () => {
    const onClarificationPick = vi.fn()
    const msg: ChatMessage = {
      ...message('both-2', 'assistant', P5_REQUEST.prompt),
      clarificationRequests: [P5_REQUEST],
      clarification: {
        id: 'req-p5',
        prompt: P5_REQUEST.prompt,
        entityType: 'material',
        menuProvider: '/m',
        options: [],
        allowCreateLocal: true,
      },
    }
    render(<ChatLog {...props} onClarificationPick={onClarificationPick} messages={[message('u2', 'user', 'q'), msg]} />)

    // THE F1 CLAIM: ONE picker (the gate saw two identical pickers).
    expect(document.querySelectorAll('.message-log__clarification-picker').length).toBe(1)
    // …one block total, and picking answers through the typed arm.
    // LEG D re-pin: the REAL clarificationAnswerPrompt builds the sentence
    // from request.entityType (production behavior) — not the request id the
    // removed AiTabPanel mock interpolated.
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(1)
    fireEvent.click(screen.getByTestId('pick-req-p5'))
    expect(onClarificationPick).toHaveBeenCalledTimes(1)
    // ANSWER-CHANNEL: structured answer + request ride args 2-3 (see P4).
    expect(onClarificationPick).toHaveBeenCalledWith(
      'Use choice for material.',
      expect.objectContaining({ label: 'choice' }),
      expect.objectContaining({ id: 'req-p5' }),
    )
  })

  it('control: a legacy-only message (no typed requests) still renders the legacy block arm', () => {
    const onClarificationPick = vi.fn()
    const msg: ChatMessage = {
      ...message('legacy-only', 'assistant', 'Which enzyme should cut this?'),
      clarification: {
        id: 'clar-1',
        prompt: 'Which enzyme should cut this?',
        entityType: 'sequence',
        options: [{ id: 'opt-1', label: 'EcoRI' }],
      },
    }
    render(<ChatLog {...props} onClarificationPick={onClarificationPick} messages={[msg]} />)
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(1)
    expect(screen.getByRole('button', { name: '1. EcoRI' })).not.toBeNull()
  })

  it('control: a typed-requests-only message still renders the typed arm', () => {
    const onClarificationPick = vi.fn()
    const msg: ChatMessage = {
      ...message('typed-only', 'assistant', P5_REQUEST.prompt),
      clarificationRequests: [P5_REQUEST],
    }
    render(<ChatLog {...props} onClarificationPick={onClarificationPick} messages={[msg]} />)
    expect(document.querySelectorAll('.message-log__clarification-picker').length).toBe(1)
    expect(document.querySelectorAll('.chat-log-clarification').length).toBe(1)
  })
})

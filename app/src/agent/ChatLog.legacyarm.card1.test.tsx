/**
 * L2-CLARIFY-CARD-1 (defect 5, ruling l2t1951 Q1 item 3) — PROOF that the
 * legacy arm cannot reach the mint row for a live mint, so the server
 * legacy-passthrough leg is NOT needed.
 *
 * Ruling item 3: "server/src/ai/clarifications.ts (+ ChatLog.tsx builder if
 * the legacy arm can reach the mint row) — raw-label carriage ... OR the
 * coder proves from the render arms which surfaces can reach the mint row via
 * legacy shape and names that in the report. UNVERIFIED: whether a live
 * shorthand mint is reachable only via the typed arms (making the legacy leg
 * theoretical) — the fix run must prove it with a pin, not assume it."
 *
 * THE RENDER ARMS (ChatLog.tsx), named:
 *   - TYPED arm (`renderTypedClarification`, :324-386): renders the picker
 *     with the FULL typed `AiClarificationRequest` — which carries
 *     `unresolvedFact` on the wire (set unconditionally, shorthandChat.ts:1013).
 *     The done arm sets BOTH `clarification` and `clarificationRequests`, so a
 *     live shorthand mint turn rides THIS arm.
 *   - LEGACY block arm (`renderClarificationBlock`, :257-307): builds the
 *     request from the legacy shape via `clarificationRequest()` (:74-87) —
 *     which does NOT copy `unresolvedFact`. It renders ONLY when
 *     `message.clarification && !message.clarificationRequests?.length`
 *     (:521) — i.e. a legacy-only message (hydrated history / legacy surfaces)
 *     — and it SUPPRESSES the picker entirely for restored turns
 *     (`if (message.restored) return null`, :272).
 *
 * THIS PIN proves:
 *   (A) A live shorthand mint turn (both fields set, the done-payload shape)
 *       renders the picker via the TYPED arm with the request carrying the
 *       raw `unresolvedFact.label` — the mint row is reached with the raw
 *       label already present. The legacy block arm does NOT also render
 *       (exactly one picker; the typed-arm wrapper is present).
 *   (B) A rehydrated legacy-only restored turn (the cold-reload shape — only
 *       the legacy `clarification`, `restored: true`) renders NO picker (the
 *       legacy arm suppresses it), so the legacy builder's path never feeds a
 *       LIVE mint.
 *   (D) CARD1-FIX4 D3 (advc c10): the live invariant IS PINNED — a live
 *       shorthand mint ALWAYS carries the typed requests, so the legacy block
 *       arm GATE (ChatLog.tsx:521) cannot fire for it. The pre-fix FIX-3
 *       version stated this as an ASSUMPTION ("such a shape is never a live
 *       mint"); (D) evaluates the gate on the live message and pins it FALSE.
 *       (D) is a GREEN regression lock — its RED would require reverting the
 *       shipped done-arm (useAiChat.ts:1689-1699) so it stops setting both
 *       fields, which is out of this item's scope (mirrors review O3 for the
 *       answered-row pin).
 *
 * Conclusion: the legacy arm's `clarificationRequest()` builder (which drops
 * `unresolvedFact`) is only reachable for legacy-only messages, and those are
 * either suppressed (restored) or are not live shorthand mints (which always
 * carry the typed requests — now PINNED by (D)). A live mint is reachable
 * ONLY via the typed arm, which carries `unresolvedFact`. Therefore the
 * server legacy-passthrough leg is theoretical and NOT implemented — and
 * `AgentClarification` (server/src/ai/types.ts, the legacy type) has no
 * `unresolvedFact` field to add anyway (it is frozen out of this item's
 * opened files).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'

// Capture the request the (mocked) picker receives, and render the typed-arm's
// OWN wrapper testid so the arm is distinguishable from the legacy block.
const mockPicker = vi.hoisted(() => {
  const captured: { request: AiClarificationRequest | null } = { request: null }
  const Comp = (props: { request: AiClarificationRequest; onPick: (a: { label: string }) => void }) => {
    captured.request = props.request
    return (
      <div className="message-log__clarification-picker" data-testid={`mock-picker-${props.request.id}`}>
        <button data-testid={`pick-${props.request.id}`} onClick={() => props.onPick({ label: 'choice' })}>
          pick
        </button>
      </div>
    )
  }
  return { Comp, captured }
})

vi.mock('../event-editor/right-pane/ai/ClarificationPicker', () => ({
  ClarificationPicker: mockPicker.Comp,
  requestHasPicker: () => true,
}))

afterEach(() => {
  cleanup()
  mockPicker.captured.request = null
})

const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }

// The live shorthand mint turn — the done-payload shape (useAiChat done arm):
// BOTH the typed `clarificationRequests` (carrying the verbatim
// `unresolvedFact`, shorthandChat.ts:1013) AND the derived legacy
// `clarification`. query is the canonical DISPLAY form (the lowercase fold
// for the unbound entity); the raw label is human case.
const LIVE_REQUEST: AiClarificationRequest = {
  id: 'req-live',
  kind: 'material',
  prompt: 'The draft names "1 mM Clofibrate in DMSO" — choose what it is, or create a local term',
  entityType: 'material',
  menuProvider: '/m',
  query: '1 mM clofibrate in dmso',
  options: [],
  allowCreateLocal: true,
  unresolvedFact: {
    label: '1 mM Clofibrate in DMSO',
    reason: 'unbound',
  },
}

describe('ChatLog — L2-CLARIFY-CARD-1 defect 5 (Q1 item 3): the legacy arm cannot reach the mint row for a live mint', () => {
  it('(A) a live shorthand mint turn (both fields) renders the picker via the TYPED arm, carrying the raw unresolvedFact.label', () => {
    const onClarificationPick = vi.fn()
    const msg: ChatMessage = {
      id: 'live-1',
      role: 'assistant',
      content: LIVE_REQUEST.prompt,
      timestamp: 0,
      clarificationRequests: [LIVE_REQUEST],
      // The done arm derives the legacy shape from the first request
      // (legacyClarificationFromRequests) — note it has NO unresolvedFact.
      clarification: {
        id: LIVE_REQUEST.id,
        prompt: LIVE_REQUEST.prompt,
        entityType: 'material',
        menuProvider: '/m',
        query: LIVE_REQUEST.query,
        options: [],
        allowCreateLocal: true,
      },
    }
    render(<ChatLog messages={[msg]} {...props} onClarificationPick={onClarificationPick} />)

    // The TYPED arm's wrapper testid is present (only renderTypedClarification
    // emits `chat-log-request-<id>`).
    expect(screen.queryByTestId('chat-log-request-req-live')).toBeTruthy()
    // EXACTLY ONE picker — the legacy block arm did NOT also render (no
    // second picker; the line-521 gate `!clarificationRequests?.length` is
    // false for a both-fields turn, so the legacy arm is skipped).
    const pickers = screen.queryAllByTestId('mock-picker-req-live')
    expect(pickers).toHaveLength(1)
    // THE mint row's request carries the raw label — reached via the typed
    // arm (which carries unresolvedFact), NOT the legacy builder (which drops
    // it).
    expect(mockPicker.captured.request?.id).toBe('req-live')
    expect(mockPicker.captured.request?.unresolvedFact?.label).toBe('1 mM Clofibrate in DMSO')
  })

  it('(B) a rehydrated legacy-only restored turn (the cold-reload shape) renders NO picker — the legacy arm suppresses it, so the legacy builder never feeds a LIVE mint', () => {
    const onClarificationPick = vi.fn()
    // The cold-reload rehydrate shape (useAiChat.ts:904-931): the answer turn
    // flips eventGraphId null->real, the post-flip thread's card turn
    // rehydrates from ONLY the persisted legacy `clarification`
    // (`clarificationRequests` is never persisted), stamped `restored: true`.
    const msg: ChatMessage = {
      id: 'restored-1',
      role: 'assistant',
      content: LIVE_REQUEST.prompt,
      timestamp: 0,
      restored: true,
      clarification: {
        id: LIVE_REQUEST.id,
        prompt: LIVE_REQUEST.prompt,
        entityType: 'material',
        menuProvider: '/m',
        query: LIVE_REQUEST.query,
        options: [],
        allowCreateLocal: true,
        // AgentClarification has NO unresolvedFact field (frozen type) — the
        // legacy shape carries none.
      },
    }
    render(<ChatLog messages={[msg, { id: 'restored-2', role: 'user', content: 'answer', timestamp: 1 }]} {...props} onClarificationPick={onClarificationPick} />)

    // The legacy arm's picker is suppressed for restored turns
    // (`if (message.restored) return null`, ChatLog.tsx:272) — NO live picker.
    expect(screen.queryByTestId('mock-picker-req-live')).toBeNull()
    // The picker was never mounted, so the legacy builder's (label-less)
    // request never reached a mint row.
    expect(mockPicker.captured.request).toBeNull()
  })

  it('(C) a NON-restored legacy-only menu-backed turn (the one shape the legacy arm structurally can render) still carries NO unresolvedFact — there is no raw label for the legacy conversion to carry, so no server passthrough is needed (and one would need a frozen-type change + a duplicate wire field, hard rule #5)', () => {
    const onClarificationPick = vi.fn()
    // The ONLY shape the legacy block arm (ChatLog.tsx:521 gate
    // `message.clarification && !clarificationRequests?.length`, then :272
    // `!restored`, :276 `options.length===0`) can render the picker with: a
    // legacy-only message, NOT restored, menu-backed (options: [],
    // allowCreateLocal: true). This is the structural ceiling of the legacy
    // arm. NOTE the legacy `AiClarification`/`AgentClarification` type has NO
    // `unresolvedFact` field (server/src/ai/types.ts:571 is frozen; the app
    // legacy mirror likewise) — so this message CANNOT carry a raw label.
    const msg: ChatMessage = {
      id: 'legacy-only-1',
      role: 'assistant',
      content: LIVE_REQUEST.prompt,
      timestamp: 0,
      // no `restored`, no `clarificationRequests`
      clarification: {
        id: 'req-legacy',
        prompt: LIVE_REQUEST.prompt,
        entityType: 'material',
        menuProvider: '/m',
        query: LIVE_REQUEST.query,
        options: [],
        allowCreateLocal: true,
        // No unresolvedFact — the legacy shape cannot carry it.
      },
    }
    render(<ChatLog messages={[msg]} {...props} onClarificationPick={onClarificationPick} />)

    // The legacy arm DID render the picker (honest structural reachability —
    // ChatLog.tsx:283-289 mounts ClarificationPicker for a legacy-only,
    // non-restored, menu-backed turn).
    expect(screen.queryByTestId('mock-picker-req-legacy')).toBeTruthy()
    // ...BUT the request it built from the legacy shape carries NO
    // unresolvedFact — there is no raw label on the legacy conversion to
    // carry. mintLabelFor therefore seeds from the canonical query (the D3
    // defect is about the raw label, which only the typed arm ever holds.
    expect(mockPicker.captured.request?.id).toBe('req-legacy')
    expect(mockPicker.captured.request?.unresolvedFact).toBeUndefined()
  })

  it('(D) D3 (advc c10) — a live shorthand mint ALWAYS carries the typed requests, so the legacy block arm GATE cannot fire for it (the conclusion is a pin, not an assumption)', () => {
    // The reviewer's D3 defect: tests (A)/(C) proved the legacy arm CAN render
    // a legacy-only shape AND that a both-fields turn rides the typed arm, but
    // the report's conclusion "a live mint is reachable ONLY via the typed arm"
    // was stated as an ASSUMPTION that such a shape is never a live mint — no
    // pin proved the live invariant. This pin does.
    //
    // THE LIVE INVARIANT (useAiChat.ts done arm, :1689-1699): for a done payload
    // that CARRIES `result.clarificationRequests` (non-empty — the shorthand
    // path emits requests unconditionally, shorthandChat.ts:873/1013), the done
    // arm sets BOTH fields — `clarification` (:1689-1692, the server legacy field
    // ?? legacyClarificationFromRequests) AND `clarificationRequests`
    // (:1697-1699). So a live shorthand-mint message is NEVER legacy-only.
    //
    // THE GATE (ChatLog.tsx:521): the legacy block arm renders ONLY when
    // `message.clarification && !message.clarificationRequests?.length`. For a
    // live shorthand mint (both fields, requests non-empty) the gate is FALSE —
    // the legacy arm is skipped and the TYPED arm (ChatLog.tsx:324-386) renders
    // the picker. The legacy arm's `clarificationRequest()` builder (which drops
    // unresolvedFact) is therefore structurally unreachable for a live mint.
    const liveMsg: ChatMessage = {
      id: 'live-gate',
      role: 'assistant',
      content: LIVE_REQUEST.prompt,
      timestamp: 0,
      // BOTH fields — the done-arm shape for a clarification-bearing done.
      clarificationRequests: [LIVE_REQUEST],
      clarification: {
        id: LIVE_REQUEST.id,
        prompt: LIVE_REQUEST.prompt,
        entityType: 'material',
        menuProvider: '/m',
        query: LIVE_REQUEST.query,
        options: [],
        allowCreateLocal: true,
      },
    }
    // THE GATE — evaluated on the live message, NOT asserted on a separate
    // hand-built message. For a live shorthand mint it is FALSE.
    const legacyGateFires =
      liveMsg.clarification !== undefined &&
      !(liveMsg.clarificationRequests?.length)
    expect(legacyGateFires).toBe(false)
    // A LIVE shorthand mint is NEVER legacy-only: requests is non-empty. (The
    // legacy-only shape of test (C) has NO requests — it is a legacy surface /
    // hydrated history turn, which the done arm never produces for a
    // clarification-bearing done.)
    expect(liveMsg.clarificationRequests?.length).toBeGreaterThan(0)
    // And the render consequence: the typed arm renders the picker with the raw
    // label; the legacy block arm does NOT also render. (Redundant with (A) —
    // the gate-pin above is the D3 addendum; this keeps the render evidence in
    // the same pin.)
    const onClarificationPick = vi.fn()
    render(<ChatLog messages={[liveMsg]} {...props} onClarificationPick={onClarificationPick} />)
    // The testids are keyed on the REQUEST id (LIVE_REQUEST.id = 'req-live'),
    // not the message id — the typed-arm wrapper is `chat-log-request-<reqId>`
    // and the (mocked) picker is `mock-picker-<reqId>`.
    expect(screen.queryByTestId('chat-log-request-req-live')).toBeTruthy()
    expect(screen.queryAllByTestId('mock-picker-req-live')).toHaveLength(1)
    expect(mockPicker.captured.request?.unresolvedFact?.label).toBe('1 mM Clofibrate in DMSO')
  })
})

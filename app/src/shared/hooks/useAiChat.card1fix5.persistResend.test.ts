/**
 * L2-CLARIFY-CARD-1 (DEFECT 6, ruling l2t1951 Q2 units 2-3) — the PERSIST +
 * RE-SEND leg pin.
 *
 * Defect 6: the compacted Answered row disappears on a cold reload (1→0). The
 * render leg (unit 1, the answered-row lock) is GREEN; the actual fix is that
 * the requestId-keyed ANSWERED-STATE survives the reload — the answer user
 * message persists `metadata.clarificationAnswers` (unit 2) and every
 * subsequent send of that thread RE-SENDS the answered requestIds (unit 3) so
 * the shipped server drop (AgentOrchestrator.ts:3085-3098, P9a-pinned) closes
 * the re-open leg with ZERO server change.
 *
 * Two pins here (the storage boundary — the `metadata.clarificationAnswers`
 * write + hydrate read — is locked by the two-turn + reload server-boundary
 * pin):
 *   (A) the PURE `unionClarificationAnswers` seam: requestId-keyed dedup,
 *       fresh-supersedes-persisted, empty→fresh-ask wire shape, stable order.
 *   (B) the INTEGRATION flow through `sendPrompt`: an answer submission
 *       records the structured answer on the user message (the persist
 *       carrier), and a FOLLOW-UP send re-sends that answered requestId to the
 *       stream — so the server drop sees the id again after a reload.
 *
 * These are the meaningful failing/passing checks for the persist + re-send
 * legs: (B) is RED against a hook that never carries / never re-sends
 * `clarificationAnswers` (the pre-fix shape), and GREEN once the carrier +
 * re-send union are wired.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAiChat, unionClarificationAnswers } from './useAiChat'
import type { AiClarificationAnswer } from '../../types/ai'
import type { AiContext } from '../../types/aiContext'

// Mock the aiClient module (the same seam useAiChat.empty.test.ts uses).
vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))
vi.mock('../lib/aiPromptMentions', async () => {
  const actual = await vi.importActual<typeof import('../lib/aiPromptMentions')>('../lib/aiPromptMentions')
  return actual
})

const mockAiContext: AiContext = {
  surface: 'event-editor',
  summary: 'Test summary',
  surfaceContext: {},
}

/** A `done` event so each send completes its assistant turn (the isStreaming
 *  gate releases, allowing the follow-up send). */
const DONE = () => ({
  type: 'done',
  success: true,
  events: [],
  labwareAdditions: [],
  result: { success: true, events: [], labwareAdditions: [] },
})

describe('L2-CLARIFY-CARD-1 defect 6 (ruling l2t1951 Q2 unit 3) — unionClarificationAnswers seam', () => {
  const ans = (requestId: string, value: string): AiClarificationAnswer => ({ requestId, label: value, value })

  it('an EMPTY persisted set is the byte-identical fresh-ask wire shape (the re-send is a no-op when nothing is answered)', () => {
    const fresh = [ans('req-1', 'Clofibrate')]
    const out = unionClarificationAnswers([], fresh)
    // the re-send is a NO-OP: the fresh set rides through untouched, in order.
    expect(out).toEqual(fresh)
    expect(out.map((a) => a.requestId)).toEqual(['req-1'])
    // and the all-empty case is the empty fresh-ask wire shape.
    expect(unionClarificationAnswers([], [])).toEqual([])
  })

  it('a persisted answer is RE-SENT when the follow-up carries NO fresh answer (the reload re-send)', () => {
    const persisted = [ans('req-1', 'Clofibrate')]
    expect(unionClarificationAnswers(persisted, [])).toEqual([ans('req-1', 'Clofibrate')])
  })

  it('a fresh answer SUPERTYPES a persisted one for the SAME requestId (requestId-keyed, fresh wins)', () => {
    const persisted = [ans('req-1', 'old value')]
    const fresh = [ans('req-1', 'new value')]
    const out = unionClarificationAnswers(persisted, fresh)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual(ans('req-1', 'new value')) // fresh value supersedes
    // the superseded answer keeps the persisted POSITION (replacement, not append)
    expect(out[0].requestId).toBe('req-1')
  })

  it('UNIONS distinct requestIds: persisted + fresh that was NOT already persisted', () => {
    const persisted = [ans('req-1', 'A')]
    const fresh = [ans('req-2', 'B')]
    const out = unionClarificationAnswers(persisted, fresh)
    expect(out.map((a) => a.requestId)).toEqual(['req-1', 'req-2'])
    expect(out).toHaveLength(2)
  })

  it('is keyed on requestId ONLY (never prose): two answers with the same requestId collapse to one (the last)', () => {
    const persisted = [ans('req-1', 'from persisted prose')]
    const fresh = [ans('req-1', 'from fresh prose'), ans('req-1', 'another fresh prose')]
    const out = unionClarificationAnswers(persisted, fresh)
    expect(out).toHaveLength(1)
    expect(out[0].value).toBe('another fresh prose') // the last one wins
  })

  it('preserves the persisted FIRST-SEEN order for the re-sent set', () => {
    const persisted = [ans('req-b', 'B'), ans('req-a', 'A')]
    const fresh = [ans('req-c', 'C')]
    const out = unionClarificationAnswers(persisted, fresh)
    expect(out.map((a) => a.requestId)).toEqual(['req-b', 'req-a', 'req-c'])
  })
})

describe('L2-CLARIFY-CARD-1 defect 6 (ruling l2t1951 Q2 units 2-3) — persist carrier + re-send through sendPrompt', () => {
  it('an answer submission records the structured answer on the user message (the persist carrier), and a follow-up send RE-SENDS the answered requestId', async () => {
    const { streamAssist } = await import('../api/aiClient')
    const sa = streamAssist as ReturnType<typeof vi.fn>
    // Every send completes with a done event so the follow-up send is allowed.
    sa.mockImplementation(async function* () {
      yield DONE()
    })

    const { result } = renderHook(() =>
      useAiChat({
        aiContext: mockAiContext,
        onAcceptEvent: vi.fn(),
        onAddLabwareFromRecord: vi.fn(),
      })
    )

    // TURN 1 (the answer): the structured answer rides the answer turn.
    const answer: AiClarificationAnswer = {
      requestId: 'req-clofibrate',
      label: '1 mM Clofibrate in DMSO',
      value: '1 mM Clofibrate in DMSO',
    }
    result.current.sendPrompt('Use 1 mM Clofibrate in DMSO for req-clofibrate.', undefined, {
      clarificationAnswers: [answer],
    })
    // flush the async turn to FULL completion (isStreaming false — the
    // follow-up send is gated on `if (isStreaming) return`, useAiChat.ts:1130).
    await waitFor(() => {
      expect(sa).toHaveBeenCalledTimes(1)
      expect(result.current.isStreaming).toBe(false)
    })

    // (unit 2) the ANSWER USER MESSAGE carries the structured answer — the
    // source of the persisted `metadata.clarificationAnswers`.
    const answerMsg = result.current.messages.find((m) => m.role === 'user')
    expect(answerMsg?.clarificationAnswers).toEqual([answer])

    // the answer turn sent the fresh answer to the stream.
    expect(sa.mock.calls[0][7]).toEqual([answer])

    // TURN 2 (the follow-up, e.g. after a cold reload the thread rehydrates the
    // answer, and a new prompt is sent): the follow-up carries NO fresh answer,
    // yet RE-SENDS the answered requestId (the re-send leg — unit 3).
    sa.mockClear()
    result.current.sendPrompt('Now draft the formulation.', undefined, {})
    await waitFor(() => {
      expect(sa).toHaveBeenCalledTimes(1)
    })
    // the re-sent set carries the answered requestId (requestId-keyed; the
    // server drop AgentOrchestrator.ts:3085-3098 closes the re-open on it).
    const resent = sa.mock.calls[0][7]
    expect(Array.isArray(resent)).toBe(true)
    expect(resent.map((a: AiClarificationAnswer) => a.requestId)).toContain('req-clofibrate')
    expect(resent).toEqual([answer])
  })

  it('a follow-up on a thread with NO answered request re-sends the byte-identical fresh-ask wire shape (no spurious clarificationAnswers)', async () => {
    const { streamAssist } = await import('../api/aiClient')
    const sa = streamAssist as ReturnType<typeof vi.fn>
    sa.mockImplementation(async function* () {
      yield DONE()
    })
    const { result } = renderHook(() =>
      useAiChat({
        aiContext: mockAiContext,
        onAcceptEvent: vi.fn(),
        onAddLabwareFromRecord: vi.fn(),
      })
    )

    result.current.sendPrompt('Draft the formulation.')
    await waitFor(() => {
      expect(sa).toHaveBeenCalledTimes(1)
    })
    // the fresh-ask wire shape: clarificationAnswers is an EMPTY array (aiClient
    // guards every clarificationAnswers field on .length > 0 → no wire change).
    expect(sa.mock.calls[0][7]).toEqual([])
  })
})

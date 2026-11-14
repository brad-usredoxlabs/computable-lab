/**
 * L2-P1-RELOAD-CLARIFIER-1 / u2surviveriders — the TYPED clarificationRequests
 * array survives a cold reload.
 *
 * Pending intent is not a record (PENDING-DRAFT-PERSISTENCE §2.6): a half-filled
 * clarification form lives on the parked prompt's checkpoint, restored on reload,
 * and never gets a record id. The clarification QUESTION is restored from persisted
 * message metadata — it is NOT re-derived, NOT re-asked, and nothing auto-answers.
 *
 * Defect (prompt-1 gate F5): the typed `clarificationRequests` array rode the
 * assistant message LIVE (useAiChat.ts done arm :1978) but the persist builder
 * (:1337) and the hydrate mapper (:1252) handled only the legacy `clarification`
 * and the answered `clarificationAnswers` — so a reload mid-card dropped the typed
 * requests (3 slots -> 0, no Submit, nothing answerable). This unit extends the
 * EXISTING persist/hydrate rider pair: persist writes `metadata.clarificationRequests`,
 * hydrate reads it back VERBATIM.
 *
 * The trap this pins (SECOND AUTHORITY): re-deriving the request set on hydrate — or
 * re-asking the server — mints a second card with different ids and silently changes
 * the offered options. The deep-equal below (ids/prompts/options/menuProvider/
 * clarifyControl) + the ZERO-stream-on-hydrate assert catch exactly that.
 *
 * Round-trip semantics (brief a→b): test 1 drives the LIVE turn persisting into the
 * (mocked) store and pins the persisted document; test 2 (the cold-reload arm) feeds
 * a fresh hook over the SAME (scope, threadId) the EXACT document the persist leg
 * writes (the shared THREE fixture) and deep-equals the rehydrated array against it.
 * The hydrate leg is seeded independently so the mutation probe (delete BOTH riders)
 * fails at the hydrate assertion — hydrated array `undefined` where 3 was expected —
 * rather than staying green (vacuous) or failing only at the persist stage.
 *
 * NOTE: this file is `.ts` (not `.tsx`) per the unit's named-file contract, so the
 * answered-arm render uses `createElement` (no JSX tokens) — the SAME shipped ChatLog
 * the existing answeredrow pin drives, which is the only faithful way to assert the
 * module-private `isClarificationAnswered` predicate (ChatLog.tsx:127, not exported)
 * is true without re-implementing it.
 */
import { createElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor, render, screen, cleanup } from '@testing-library/react'
import type { AiContext } from '../../types/aiContext'
import type { AiClarificationRequest, ChatMessage } from '../../types/ai'
import { useAiChat } from './useAiChat'
import { ChatLog } from '../../agent/ChatLog'

const mocked = vi.hoisted(() => ({
  getThread: vi.fn(),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  listThreads: vi.fn().mockResolvedValue({ threads: [] }),
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))
vi.mock('../api/aiThreadClient', () => ({
  getThread: mocked.getThread,
  appendThreadMessage: mocked.appendThreadMessage,
  listThreads: mocked.listThreads,
}))
vi.mock('../api/aiClient', () => ({ streamAssist: mocked.streamAssist, getAiHealth: mocked.getAiHealth }))
vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    listRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

const aiContext: AiContext = { surface: 'event-editor', summary: 'test', surfaceContext: {} }
const logProps = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onReview: vi.fn() }

// THREE typed requests (the live done arm's shape). Each carries the fields the
// hydrate must restore VERBATIM: id, prompt, options, menuProvider, clarifyControl.
// THIS is the document the persist leg writes and the cold-reload arm reads back.
const THREE: AiClarificationRequest[] = [
  { id: 'req-1', kind: 'material', prompt: 'Which material is the clofibrate stock?', menuProvider: '/m', query: 'clofibrate', options: [{ id: 'o1', label: 'Clofibrate (1 mM)' }] },
  { id: 'req-2', kind: 'material', prompt: 'Which solvent?', menuProvider: '/m', options: [], clarifyControl: { kind: 'quantity', label: 'Volume', value: 250, unit: 'uL', source: 'draft', question: 'How much?' } },
  { id: 'req-3', kind: 'well-selection', prompt: 'Which well?', menuProvider: 'choice', options: [], clarifyControl: { kind: 'wells', question: 'Which well?' } },
]

beforeEach(() => {
  mocked.getThread.mockReset()
  mocked.appendThreadMessage.mockReset()
  mocked.appendThreadMessage.mockResolvedValue(undefined)
  mocked.streamAssist.mockReset()
})

describe('u2surviveriders — typed clarificationRequests survive a cold reload', () => {
  it('(a) PERSIST: a live turn carrying THREE requests reaches the appendThreadMessage metadata VERBATIM', async () => {
    mocked.getThread.mockResolvedValue({ messages: [] })
    mocked.streamAssist.mockImplementation(async function* () {
      yield { type: 'done', result: { success: true, notes: [], clarificationRequests: THREE } } as never
    })
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))
    await waitFor(() => expect(result.current.messages.length).toBe(0))
    await act(async () => { result.current.sendPrompt('draft a two-noun sentence') })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
    // the LIVE assistant turn carried the typed requests (the done arm rode them).
    const assistant = result.current.messages.find((m) => m.role === 'assistant')
    expect(assistant?.clarificationRequests).toEqual(THREE)
    // the sync effect's assistant append wrote them into metadata (PERSIST leg).
    await waitFor(() => {
      const ap = mocked.appendThreadMessage.mock.calls.map((c) => c[1]?.message).find((m) => m?.role === 'assistant')
      expect(ap?.metadata).toMatchObject({ clarificationRequests: THREE })
    }, { timeout: 4000 })
  })

  it('(b+c) COLD RELOAD: a fresh hook over the same (scope, threadId) restores the SAME 3 requests; NO auto-answer, NO stream/POST on hydrate', async () => {
    // the document the live turn wrote into the store: the typed array, verbatim.
    const persisted: Record<string, unknown> = { clarificationRequests: THREE }
    const createdAt = new Date().toISOString()
    mocked.getThread.mockResolvedValue({ messages: [{ role: 'assistant', content: THREE[0].prompt, createdAt, metadata: persisted }] })
    // a reload never re-asks the model: the stream is a no-op for this arm.
    mocked.streamAssist.mockImplementation(async function* () {})
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))
    await waitFor(() => expect(result.current.messages.length).toBe(1))
    const hydrated = result.current.messages[0]!
    // (b) deep-equal the rehydrated array to the persisted array — ids/prompts/
    // options/menuProvider/clarifyControl UNCHANGED, length 3, NOT re-derived.
    expect(hydrated.clarificationRequests).toEqual(THREE)
    expect(hydrated.clarificationRequests).toHaveLength(3)
    expect(hydrated.clarificationRequests!.map((r) => r.id)).toEqual(['req-1', 'req-2', 'req-3'])
    // (c) nothing auto-answered and nothing re-asked on hydrate: no answer user
    // message appeared, and NO POST/stream fired (nothing re-asked the server,
    // and the already-persisted turn was NOT re-posted — no duplicate on reload).
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(0)
    expect(mocked.streamAssist).not.toHaveBeenCalled()
    expect(mocked.appendThreadMessage).not.toHaveBeenCalled()
  })

  it('(d) ANSWERED arm: the SAME restored card + a following answer collapses to the compact row (the shipped answered predicate is true)', async () => {
    const persisted: Record<string, unknown> = { clarificationRequests: THREE }
    mocked.getThread.mockResolvedValue({ messages: [{ role: 'assistant', content: THREE[0].prompt, createdAt: new Date().toISOString(), metadata: persisted }] })
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))
    await waitFor(() => expect(result.current.messages.length).toBe(1))
    const card = result.current.messages[0]!
    expect(card.clarificationRequests).toEqual(THREE) // the rehydrated card turn
    const answer: ChatMessage = { id: 'persisted-1-ans', role: 'user', content: 'Use the first option for each slot.', timestamp: Date.now() }
    render(createElement(ChatLog, { ...logProps, onClarificationSubmit: vi.fn(), messages: [card, answer] }))
    // the shipped isClarificationAnswered predicate (a following user turn) is
    // true: the bulky grouped card is GONE and ONE compact answered row stands in.
    expect(screen.queryByTestId('chat-clarification-card')).toBeNull()
    expect(screen.getAllByTestId('chat-log-clarification-answered')).toHaveLength(1)
    cleanup()
  })
})

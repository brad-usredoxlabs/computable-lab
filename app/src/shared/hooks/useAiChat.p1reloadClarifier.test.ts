/**
 * L2-P1-RELOAD-CLARIFIER-1 / unit cardsurvive — a grouped clarification CARD
 * (multiple `clarificationRequests`) must SURVIVE a reload: the LIVE turn puts
 * the array on the assistant message (useAiChat.ts:1899) and ChatLog renders
 * the ONE grouped card from it UNGATED (ChatLog.tsx:589). Before this unit the
 * persist leg wrote only the legacy singular `metadata.clarification`
 * (useAiChat.ts:1251) and the hydrate leg read back ONLY that singular field
 * (useAiChat.ts:1169) — `grep -c "metadata.clarificationRequests" useAiChat.ts`
 * = 0 — so a reload mid-card restored the transcript with the card DESTROYED
 * (gate r2 §6 durability leg, served rev ddc9f2ef: 3 slots -> 0).
 *
 * Ruling: .hermes/plans/decisions/PENDING-DRAFT-PERSISTENCE-l2-20261113.md —
 * "Pending intent is not a record" (context §2.6): the question is restored
 * from the PERSISTED message metadata, never re-derived and never re-asked.
 * The second-authority bait this test exists to catch: re-deriving the
 * requests from the thread's user answers, or re-asking the server on
 * hydrate, would mint a SECOND card with different ids. So (b) deep-equals the
 * hydrated array against the persisted array (ids/prompts/options/
 * menuProvider/clarifyControl byte-identical, length 3) and asserts ZERO extra
 * appendThreadMessage (POST) and ZERO streamAssist (POST /ai/**) calls between
 * persist and hydrate. The idiom is the neighbouring `clarificationAnswers`
 * rider pair (L2-CLARIFY-CARD-1 defect 6) — copied, not re-invented.
 *
 * (a) PERSIST leg: one live assistant turn carrying THREE
 *     `clarificationRequests` reaches the fake thread store's
 *     `metadata.clarificationRequests` via the hook's sync effect; the
 *     grouped card renders live (3 slots + ONE Submit).
 * (b) COLD-RELOAD arm: a FRESH hook instance over the same store
 *     (endpoint 'event-editor' -> same (scope, threadId) tab key) hydrates
 *     the message back WITH its `clarificationRequests` — deep-equal to the
 *     persisted array — and the SAME card re-renders.
 * (c) NEGATIVE: hydrate auto-answers NOTHING (no NEW answer message, no POST,
 *     no POST /stream).
 * (d) ANSWERED arm: with a following user message the turn collapses to the
 *     compact answered row via ChatLog's SHIPPED predicate —
 *     `isClarificationAnswered` (ChatLog.tsx:127) is module-private (NOT
 *     exported; the repository wins over the brief's "import" line), so the
 *     arm is pinned through the real ChatLog render — the exact seam
 *     ChatLog.answeredrow.reload.card1.test.tsx locks — not re-implemented.
 *
 * Mutation probe (brief): deleting ONLY the two added riders (persist :1251
 * neighbour + hydrate :1169 neighbour) turns (a) RED on the store's missing
 * key and (b)/(c) RED on the hydrated array being `undefined` (length 0 vs 3).
 * Harness shape: useAiChat.hydration.test.ts (jsdom is the vitest default).
 * NOTE: this file is `.ts` (the brief's mandated name) and therefore renders
 * via React.createElement, never JSX.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, render, screen, waitFor, cleanup, within, act } from '@testing-library/react'
import * as React from 'react'
import type { AiContext } from '../../types/aiContext'
import type { AiClarificationRequest, ChatMessage } from '../../types/ai'
import { streamAssist } from '../api/aiClient'
import { ChatLog } from '../../agent/ChatLog'

const mocked = vi.hoisted(() => ({
  getThread: vi.fn(),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
  // Slash-menu resolvers: the real ClarificationPicker mounts (the material
  // slot); stub its data so the closed-state jsdom mount is deterministic —
  // the same stub seam ChatLog.answeredrow.reload.card1.test.tsx uses.
  resolveMaterial: vi.fn(),
  resolveLabware: vi.fn(),
  resolveEquipment: vi.fn(),
  groundMaterialRef: vi.fn(),
  mintLocalTerm: vi.fn(),
}))

vi.mock('../api/aiThreadClient', () => ({
  getThread: mocked.getThread,
  appendThreadMessage: mocked.appendThreadMessage,
}))
vi.mock('../api/aiClient', () => ({
  streamAssist: mocked.streamAssist,
  getAiHealth: mocked.getAiHealth,
}))
vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
    mintLocalTerm: (a: string, b: string, c?: string) => mocked.mintLocalTerm(a, b, c),
  },
}))
vi.mock('../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, c: unknown) => mocked.resolveMaterial(q, c),
  resolveLabware: (q: string, c: unknown) => mocked.resolveLabware(q, c),
  resolveEquipment: (q: string, c: unknown) => mocked.resolveEquipment(q, c),
  mintLocalTermLabel: (q: string) => `Create material record "${q}" in the lab (new record)`,
}))
vi.mock('../../event-editor/lib/groundMaterialRef', () => ({
  groundMaterialRef: (ref: unknown) => mocked.groundMaterialRef(ref),
}))

import { useAiChat } from './useAiChat'

const aiContext: AiContext = { surface: 'run-workspace', summary: 'test', surfaceContext: {} }
const ENDPOINT = 'event-editor' as const

/** The card the LIVE turn produces: THREE typed requests — a menu-backed
 *  material slot (real picker; requestHasPicker true via /m), a non-picker
 *  parameter slot that OFFERS numbered option rows (requestHasPicker false —
 *  menuProvider 'choice' is not /l /e /m and kind is not labware — so the
 *  card's control ternary reaches the options arm), and a `clarifyControl`
 *  quantity slot (the declared-surface chip). Distinct prompts: the grouped
 *  card prints each once (intra-card dedupe). */
const CARD: AiClarificationRequest[] = [
  {
    id: 'req-deepwell',
    kind: 'material',
    prompt: 'Which 96-well deep-well plate should the plate be made of?',
    entityType: 'material',
    menuProvider: '/m',
    query: '96 well deep well plate',
    allowCreateLocal: true,
    options: [],
  },
  {
    id: 'req-pipette',
    kind: 'parameter',
    prompt: 'Which pipette head should the transfer use?',
    menuProvider: 'choice',
    options: [
      { id: 'head-8', label: '8-channel head' },
      { id: 'head-96', label: '96-channel head' },
    ],
  },
  {
    id: 'req-volume',
    kind: 'parameter',
    prompt: 'How many microliters per well?',
    menuProvider: 'choice',
    options: [],
    clarifyControl: {
      kind: 'quantity',
      label: 'volume per well',
      value: 100,
      unit: 'uL',
      source: 'declared',
      question: 'How many microliters per well?',
    },
  },
]

const CARD_TURN_CONTENT = CARD[0]!.prompt // the done arm content fallback

type StoredMessage = { role: string; content: string; createdAt?: string; metadata?: Record<string, unknown> }

let store: { messages: StoredMessage[] }

function storeAssistant(): StoredMessage | undefined {
  return store.messages.find((m) => m.role === 'assistant')
}

function renderChatLog(messages: ChatMessage[]): void {
  render(
    React.createElement(ChatLog, {
      messages,
      isStreaming: false,
      prompt: '',
      onPromptChange: vi.fn(),
      onSend: vi.fn(),
      onCancel: vi.fn(),
      onReview: vi.fn(),
      onClarificationPick: vi.fn(),
      onClarificationSubmit: vi.fn(),
    }),
  )
}

beforeEach(() => {
  store = { messages: [] }
  mocked.getThread.mockReset()
  mocked.getThread.mockImplementation(async () => ({ messages: [...store.messages] }))
  mocked.appendThreadMessage.mockReset()
  mocked.appendThreadMessage.mockImplementation(async (_ep, input) => {
    store.messages.push(input.message) // the fake thread store
  })
  vi.mocked(mocked.streamAssist).mockReset()
  vi.mocked(mocked.streamAssist).mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [], clarificationRequests: CARD } } as never
  })
})

afterEach(() => {
  cleanup()
  mocked.resolveMaterial.mockReset()
  mocked.resolveLabware.mockReset()
  mocked.resolveEquipment.mockReset()
  mocked.groundMaterialRef.mockReset()
  mocked.mintLocalTerm.mockReset()
})

async function runTurn(result: { current: ReturnType<typeof useAiChat> }, prompt: string): Promise<void> {
  await act(async () => {
    result.current.sendPrompt(prompt)
  })
  await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
  await waitFor(() => expect(storeAssistant()).toBeDefined(), { timeout: 4000 })
}

describe('L2-P1-RELOAD-CLARIFIER-1 / cardsurvive — the grouped card rides persist + hydrate', () => {
  it('(a) PERSIST: the live 3-slot turn persists metadata.clarificationRequests (key-absent on the user row; the legacy rider survives)', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: ENDPOINT }))
    await runTurn(result, 'Add 100 ul of my compound to a 96-well deep-well plate')

    // The grouped card is LIVE: ONE card, three slots, ONE Submit (ungated).
    const liveAssistant = result.current.messages.find((m) => m.role === 'assistant')!
    renderChatLog([liveAssistant])
    expect(screen.getByTestId('chat-clarification-card')).toBeDefined()
    expect(screen.getAllByTestId('chat-clarification-slot')).toHaveLength(3)
    expect(screen.getAllByTestId('chat-clarification-slot')[1]!.getAttribute('data-request-id')).toBe('req-pipette')
    expect(screen.getByTestId('chat-clarification-submit')).toBeDefined()

    // The sync effect's assistant append carried the WHOLE array (the persist
    // rider) — this is the document a reload must restore FROM.
    const persisted = storeAssistant()!
    expect(persisted.metadata).toBeDefined()
    expect(persisted.metadata!.clarificationRequests).toEqual(CARD)

    // The key is ABSENT (never `undefined`) on the user row — byte-identical
    // plain-prompt persistence, same discipline as the neighbouring riders.
    const userRow = store.messages.find((m) => m.role === 'user')!
    expect(userRow.metadata).toBeUndefined()

    // The legacy singular rider (useAiChat.ts:1251) is UNCHANGED by this unit:
    // the live turn derives it from the requests (legacyClarificationFrom-
    // Requests, first request) and it still rides.
    expect((persisted.metadata!.clarification as { prompt?: string })?.prompt).toBe(CARD_TURN_CONTENT)
  })

  it('(b) COLD RELOAD + (c) NEGATIVE: a FRESH hook over the same store rehydrates the SAME card (deep-equal) and auto-answers NOTHING', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: ENDPOINT }))
    await runTurn(result, 'Add 100 ul of my compound to a 96-well deep-well plate')
    const persisted = storeAssistant()!
    const persistedArray = persisted.metadata!.clarificationRequests
    const appendsAfterPersist = mocked.appendThreadMessage.mock.calls.length
    const streamsAfterPersist = vi.mocked(mocked.streamAssist).mock.calls.length

    // The cold-reload arm: a FRESH hook instance over the same (scope,
    // threadId) — same endpoint, same tab-thread key — hydrates from the
    // store: the question user row + the assistant card row (2 rows).
    const fresh = renderHook(() => useAiChat({ aiContext, endpoint: ENDPOINT }))
    await waitFor(() => expect(fresh.result.current.messages.length).toBe(2), { timeout: 4000 })
    const rehydrated = fresh.result.current.messages.find((m) => m.role === 'assistant')!
    expect(rehydrated.role).toBe('assistant')
    // THE second-authority check: the rehydrated array is the PERSISTED array
    // (deep equality — ids, prompts, options, menuProvider, clarifyControl
    // byte-identical, length 3), never a re-derived second card.
    expect(rehydrated.clarificationRequests).toEqual(persistedArray)
    expect(rehydrated.clarificationRequests).toHaveLength(3)
    expect(rehydrated.clarificationRequests!.map((r) => r.id)).toEqual([
      'req-deepwell',
      'req-pipette',
      'req-volume',
    ])
    // The legacy singular rider (useAiChat.ts:1169) still rides back.
    expect(rehydrated.clarification).toBeDefined()
    expect(rehydrated.clarification!.prompt).toBe(CARD_TURN_CONTENT)
    expect(rehydrated.clarification!.menuProvider).toBe('/m')

    // (c) NEGATIVE — nothing auto-answered: NO message appeared beyond the
    // persisted 2, no answer was invented, and ZERO extra network calls
    // between persist and hydrate (no POST append, no POST /stream — the
    // question is NOT re-asked on hydrate).
    expect(fresh.result.current.messages).toHaveLength(2)
    expect(fresh.result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1)
    expect(fresh.result.current.isStreaming).toBe(false)
    expect(mocked.appendThreadMessage.mock.calls.length).toBe(appendsAfterPersist)
    expect(vi.mocked(mocked.streamAssist).mock.calls.length).toBe(streamsAfterPersist)

    // The SAME grouped card re-renders from the rehydrated message (the render
    // arm is ungated by `restored`, so no render change was needed): 3 slots,
    // the same prompts, the options slot keeps its offered options, ONE Submit.
    renderChatLog(fresh.result.current.messages)
    const card = screen.getByTestId('chat-clarification-card')
    const slots = within(card).getAllByTestId('chat-clarification-slot')
    expect(slots).toHaveLength(3)
    expect(slots[0]!.getAttribute('data-request-id')).toBe('req-deepwell')
    expect(slots[1]!.getAttribute('data-request-id')).toBe('req-pipette')
    expect(slots[2]!.getAttribute('data-request-id')).toBe('req-volume')
    // The offered-option rows SURVIVE (AC1: a slot that offers options still
    // shows them) — the second slot's 2 option buttons, un-invented.
    expect(within(slots[1]!).getAllByTestId('chat-clarification-option-req-pipette')).toHaveLength(2)
    expect(screen.getByText('Which 96-well deep-well plate should the plate be made of?')).toBeDefined()
    expect(screen.getByText('Which pipette head should the transfer use?')).toBeDefined()
    expect(screen.getByText('How many microliters per well?')).toBeDefined()
    expect(screen.getByTestId('chat-clarification-submit')).toBeDefined()
  })

  it('(d) ANSWERED arm: a rehydrated thread with a FOLLOWING user answer collapses to the ONE compact answered row (the shipped predicate, via the real ChatLog render)', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: ENDPOINT }))
    await runTurn(result, 'Add 100 ul of my compound to a 96-well deep-well plate')
    const answer = 'Use the 96-channel head and 100 uL per well.'
    store.messages.push({ role: 'user', content: answer, metadata: {} }) // the answered turn

    const fresh = renderHook(() => useAiChat({ aiContext, endpoint: ENDPOINT }))
    await waitFor(() => expect(fresh.result.current.messages.length).toBe(3), { timeout: 4000 })
    const cardMsg = fresh.result.current.messages.find((m) => m.role === 'assistant')!
    expect(cardMsg.clarificationRequests).toHaveLength(3)

    // The SHIPPED answered-row predicate (module-private in ChatLog.tsx:127 —
    // a following user message) collapses the turn: ONE compact row carrying
    // the question, and the bulky grouped card / Submit are OFF the DOM.
    renderChatLog(fresh.result.current.messages)
    const rows = screen.getAllByTestId('chat-log-clarification-answered')
    expect(rows).toHaveLength(1)
    expect(rows[0]!).toHaveTextContent('Which 96-well deep-well plate should the plate be made of?')
    expect(screen.queryByTestId('chat-clarification-card')).toBeNull()
    expect(screen.queryByTestId('chat-clarification-submit')).toBeNull()
  })

  it('(key-absent discipline) a plain turn with NO requests persists no metadata key at all', async () => {
    vi.mocked(mocked.streamAssist).mockImplementation(async function* () {
      yield { type: 'text_delta', delta: 'noted the plate plan.' } as never
      yield { type: 'done', result: { success: true, notes: [] } } as never
    })
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: ENDPOINT }))
    await act(async () => {
      result.current.sendPrompt('Just note the plate plan for the record')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
    await waitFor(() => expect(storeAssistant()).toBeDefined(), { timeout: 4000 })
    const persisted = storeAssistant()!
    expect(persisted.metadata).toBeUndefined() // key ABSENT — never `{}`
    expect(persisted.metadata?.clarificationRequests).toBeUndefined()
  })
})

/**
 * Thread hydration must restore a persisted CLARIFIER with its answering
 * surface. The server stores the clarification under `metadata.clarification`
 * (verbatim AiClarification: prompt, entityType, menuProvider, query,
 * allowCreateLocal, options). Hydration used to rebuild only sequenceProposal*,
 * so a reloaded clarifier lost `menuProvider`/`query`/`options` — the question
 * stayed on screen with nothing to pick from, and ChatLog (before it was
 * guarded) rendered a bordered EMPTY box. Observed live 2026-10-18 on a phone.
 *
 * L2-CHAT-UI-1 LEG A FIX RUN 1 (advc cycle-1 D1): the SHORTHAND round-trip is
 * pinned here in BOTH directions — spec §8.5 bait #5 ("a card that vanishes on
 * reload — a silent behavior loss the reload tests must pin both directions"):
 *  - HYDRATE: a persisted assistant message with `metadata.shorthand` comes
 *    back WITH its `shorthand` field (the intent card survives the reload);
 *  - PERSIST: a done result carrying `result.shorthand` reaches the
 *    appendThreadMessage payload's `metadata` object — and a done WITHOUT
 *    shorthand persists with NO metadata key (key-absent discipline).
 * Mutation controls: commenting out the hydrate ride (useAiChat.ts
 * `typeof m.metadata?.shorthand === 'string'`) turns the hydrate test RED;
 * commenting out the persist ride (`if (m.shorthand) metadata.shorthand =
 * m.shorthand`) turns the persist test RED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AiContext } from '../../types/aiContext'
import { streamAssist } from '../api/aiClient'

const mocked = vi.hoisted(() => ({
  getThread: vi.fn(),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
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
  },
}))

import { useAiChat } from './useAiChat'

const aiContext: AiContext = { surface: 'run-workspace', summary: 'test', surfaceContext: {} }

const PERSISTED_CLARIFIER = {
  id: 'm-1',
  role: 'assistant' as const,
  content: 'The draft names "unobtainium" — choose what it is.',
  createdAt: new Date().toISOString(),
  metadata: {
    clarification: {
      id: 'unresolved-1',
      prompt: 'The draft names "unobtainium" — choose what it is.',
      entityType: 'material',
      menuProvider: '/m',
      query: 'unobtainium',
      allowCreateLocal: true,
      options: [],
    },
  },
}

beforeEach(() => {
  mocked.getThread.mockReset()
  mocked.getThread.mockResolvedValue({ messages: [PERSISTED_CLARIFIER] })
  mocked.appendThreadMessage.mockReset()
  mocked.appendThreadMessage.mockResolvedValue(undefined)
  vi.mocked(streamAssist).mockReset()
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [] } } as never
  })
})

describe('useAiChat thread hydration — clarifiers', () => {
  it('restores the persisted clarification with its menu provider and query', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))

    await waitFor(() => expect(result.current.messages.length).toBe(1))
    const clarification = result.current.messages[0]!.clarification
    expect(clarification).toBeDefined()
    expect(clarification!.menuProvider).toBe('/m')
    expect(clarification!.query).toBe('unobtainium')
    expect(clarification!.allowCreateLocal).toBe(true)
  })
})

describe('useAiChat thread hydration — shorthand round-trip (LEG A FIX RUN 1, spec §8.5 bait #5)', () => {
  const SHORTHAND_DOC = 'protocol:\n  steps:\n    - pipette 20 ul into plate A\n'

  const PERSISTED_SHORTHAND = {
    id: 'm-9',
    role: 'assistant' as const,
    content: 'Proposal ready for review in the sequence workspace.',
    createdAt: new Date().toISOString(),
    metadata: {
      shorthand: SHORTHAND_DOC,
    },
  }

  it('HYDRATE: a persisted assistant message with metadata.shorthand comes back WITH its shorthand (the intent card survives a reload)', async () => {
    mocked.getThread.mockResolvedValue({ messages: [PERSISTED_SHORTHAND] })

    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))

    await waitFor(() => expect(result.current.messages.length).toBe(1))
    // The hydrated message carries the shorthand VERBATIM — key-present on
    // the ChatMessage, so ChatLog renders the intent card for the restored
    // turn (a dropped ride here = a card that silently vanishes on reload).
    expect(result.current.messages[0]!.shorthand).toBe(SHORTHAND_DOC)
  })

  it('PERSIST: a done result carrying shorthand reaches the appendThreadMessage metadata — and a done WITHOUT shorthand persists key-absent', async () => {
    mocked.getThread.mockResolvedValue({ messages: [] })
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield { type: 'text_delta', delta: 'drafted the protocol' } as never
      yield {
        type: 'done',
        result: { success: true, notes: [], shorthand: SHORTHAND_DOC },
      } as never
    })

    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))
    await waitFor(() => expect(result.current.messages.length).toBe(0))
    await act(async () => {
      result.current.sendPrompt('draft a protocol that pipettes 20 ul into plate A')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })
    // The turn itself rode the shorthand (done arm): the assistant message
    // the pane renders carries it before any persistence is involved.
    const assistant = result.current.messages.find((m) => m.role === 'assistant')
    expect(assistant?.shorthand).toBe(SHORTHAND_DOC)

    // The sync effect's append for the assistant turn carried
    // metadata.shorthand — the PERSIST half of the round-trip (the HYDRATE
    // test above is the other half: persist + hydrate together is what makes
    // the card survive a reload; either ride alone loses it). The assistant
    // turn's CONTENT is the accumulated prose — the shorthand rides in
    // metadata, so look up the append by role, not content.
    await waitFor(() => expect(mocked.appendThreadMessage).toHaveBeenCalled(), { timeout: 4000 })
    const assistantAppend = vi
      .mocked(mocked.appendThreadMessage)
      .mock.calls.map((c) => c[1]!.message)
      .find((m) => m.role === 'assistant')
    expect(assistantAppend).toBeDefined()
    expect(assistantAppend!.metadata).toMatchObject({ shorthand: SHORTHAND_DOC })

    // Key-absent direction (the conditional `if (m.shorthand)` is what keeps
    // this honest): the USER message's append carries no metadata.shorthand.
    const userAppend = vi
      .mocked(mocked.appendThreadMessage)
      .mock.calls.map((c) => c[1]!.message)
      .find((m) => m.role === 'user')
    expect(userAppend).toBeDefined()
    expect(userAppend!.metadata).toBeUndefined()
  })
})

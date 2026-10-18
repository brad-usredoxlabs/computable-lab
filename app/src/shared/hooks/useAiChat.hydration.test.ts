/**
 * Thread hydration must restore a persisted CLARIFIER with its answering
 * surface. The server stores the clarification under `metadata.clarification`
 * (verbatim AiClarification: prompt, entityType, menuProvider, query,
 * allowCreateLocal, options). Hydration used to rebuild only sequenceProposal*,
 * so a reloaded clarifier lost `menuProvider`/`query`/`options` — the question
 * stayed on screen with nothing to pick from, and ChatLog (before it was
 * guarded) rendered a bordered EMPTY box. Observed live 2026-10-18 on a phone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { AiContext } from '../../types/aiContext'

const mocked = vi.hoisted(() => ({
  getThread: vi.fn(),
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/aiThreadClient', () => ({
  getThread: mocked.getThread,
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
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

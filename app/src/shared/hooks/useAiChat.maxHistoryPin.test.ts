/**
 * L2-THREAD-SCOPED-1 — MAX_HISTORY pin (spec §4.6): NO code change, a pin.
 *
 * The model context is the TAIL of the tab's OWN thread: a hydrated
 * 25-message thread => `streamAssist` receives EXACTLY the last 20
 * user/assistant messages (MAX_HISTORY_MESSAGES = 20, .slice(-20) over the
 * hook-local messages — 1:1 with the thread after hydration). Per-tab keying
 * makes the tail tail-N of the TAB's thread automatically; this pin keeps the
 * invariant honest through future refactors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AiContext } from '../../types/aiContext'

const mocked = vi.hoisted(() => ({
  getThread: vi.fn(),
  appendThreadMessage: vi.fn().mockResolvedValue({ messages: [] }),
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

import { streamAssist } from '../api/aiClient'
import { useAiChat } from './useAiChat'

const aiContext: AiContext = { surface: 'run-workspace', summary: 'test', surfaceContext: {} }

// 25 persisted messages (odd count: the last one is a user message).
const PERSISTED_25: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }> = Array.from(
  { length: 25 },
  (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `persisted msg ${i + 1}`,
    createdAt: new Date(Date.UTC(2026, 9, 28, 0, 0, i)).toISOString(),
  }),
)

beforeEach(() => {
  mocked.getThread.mockReset()
  mocked.getThread.mockResolvedValue({ messages: PERSISTED_25 })
  vi.mocked(streamAssist).mockImplementation(async function* () {
    yield { type: 'done', result: { success: true, notes: [] } }
  } as never)
})

describe('useAiChat — MAX_HISTORY is tail-N of the thread (L2-THREAD-SCOPED-1 §4.6)', () => {
  it('a hydrated 25-message thread => streamAssist receives exactly the last 20', async () => {
    const { result } = renderHook(() => useAiChat({ aiContext, endpoint: 'event-editor' }))
    // Hydration completes: the hook-local messages ARE the thread's 25.
    await waitFor(() => expect(result.current.messages.length).toBe(25))

    await act(async () => {
      result.current.sendPrompt('next turn')
    })
    await waitFor(() => expect(streamAssist).toHaveBeenCalled(), { timeout: 4000 })

    const historyArg = vi.mocked(streamAssist).mock.calls[0]![3]
    expect(Array.isArray(historyArg)).toBe(true)
    const history = historyArg as Array<{ role: string; content: string }>
    // Exactly the last 20 of the 25 hydrated messages — the tail-N invariant.
    expect(history).toHaveLength(20)
    expect(history.map((m) => m.content)).toEqual(
      PERSISTED_25.slice(-20).map((m) => m.content),
    )
    // The FIRST 5 hydrated messages are NOT in the model context.
    expect(history.some((m) => m.content === 'persisted msg 1')).toBe(false)
    expect(history.some((m) => m.content === 'persisted msg 5')).toBe(false)
    expect(history[0]?.content).toBe('persisted msg 6')
    expect(history[history.length - 1]?.content).toBe('persisted msg 25')
  })
})

/**
 * Verifies the Foundry review chat hook streams text deltas into the latest
 * assistant message and surfaces errors without losing the user turn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    streamFoundryReviewChat: vi.fn(),
  },
}))

import { apiClient, type FoundryReviewChatEvent } from '../shared/api/client'
import { useFoundryReviewChat } from './useFoundryReviewChat'

async function* yieldEvents(events: FoundryReviewChatEvent[]): AsyncGenerator<FoundryReviewChatEvent> {
  for (const e of events) yield e
}

describe('useFoundryReviewChat', () => {
  beforeEach(() => {
    vi.mocked(apiClient.streamFoundryReviewChat).mockReset()
  })

  it('appends user prompt and accumulates streamed text deltas into one assistant turn', async () => {
    vi.mocked(apiClient.streamFoundryReviewChat).mockImplementation(() =>
      yieldEvents([
        { type: 'text_delta', delta: 'Hel' },
        { type: 'text_delta', delta: 'lo!' },
      ]),
    )
    const { result } = renderHook(() =>
      useFoundryReviewChat({ protocolId: 'p', variant: 'manual_tubes' }),
    )

    await act(async () => {
      await result.current.submit('hi there')
    })

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false)
    })
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'hi there' })
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', content: 'Hello!' })
  })

  it('hydrates messages from initialTranscript', () => {
    const { result } = renderHook(() =>
      useFoundryReviewChat({
        protocolId: 'p',
        variant: 'manual_tubes',
        initialTranscript: [
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'a1' },
        ],
      }),
    )
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]?.content).toBe('q1')
  })

  it('captures stream errors without losing the user turn', async () => {
    vi.mocked(apiClient.streamFoundryReviewChat).mockImplementation(() =>
      yieldEvents([{ type: 'error', message: 'thunderbeast unreachable' }]),
    )
    const { result } = renderHook(() =>
      useFoundryReviewChat({ protocolId: 'p', variant: 'manual_tubes' }),
    )

    await act(async () => {
      await result.current.submit('hi')
    })

    expect(result.current.error).toBe('thunderbeast unreachable')
    // user turn is preserved; placeholder pending assistant turn is dropped
    expect(result.current.messages.some((m) => m.role === 'user' && m.content === 'hi')).toBe(true)
  })

  it('ignores empty submissions', async () => {
    const { result } = renderHook(() =>
      useFoundryReviewChat({ protocolId: 'p', variant: 'manual_tubes' }),
    )
    await act(async () => {
      await result.current.submit('   ')
    })
    expect(result.current.messages).toHaveLength(0)
    expect(apiClient.streamFoundryReviewChat).not.toHaveBeenCalled()
  })
})

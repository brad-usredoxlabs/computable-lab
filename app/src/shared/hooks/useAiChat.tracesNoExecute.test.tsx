/**
 * PB-CH-6 — tool-traces-never-execute: a trace-only turn (tool_call /
 * tool_result / agent_action frames) must trigger ZERO writes: no
 * /drafts/accept, no session PUT, no compile, and no extra /ai/assist/stream
 * fetch. The agent_action frame here has NO callback registered, so it must
 * surface as the NAMED system bubble — visible, and still zero writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import { apiClient } from '../api/client'
import type { AiContext } from '../../types/aiContext'

vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
    compileWorkstateDraft: vi.fn(),
    acceptWorkstateDraft: vi.fn(),
  },
}))

const aiContext: AiContext = {
  surface: 'analysis',
  summary: 'test surface',
  surfaceContext: {},
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  fetchSpy = vi.fn()
  fetchSpy.mockImplementation(() => Promise.reject(new Error('no fetch allowed in this test')))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAiChat — traces never execute', () => {
  it('tool_call/tool_result/agent_action frames fire ZERO accept/compile/session writes', async () => {
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield { type: 'tool_call', toolName: 'agent_intent', args: { intent: 'compose_workstate' } } as never
      yield { type: 'tool_result', toolName: 'agent_intent', success: true, durationMs: 0 } as never
      yield { type: 'agent_action', action: { action: 'open-surface', surface: 'analysis' } } as never
      yield { type: 'done', result: { success: true, notes: [] } } as never
    })

    const { result } = renderHook(() => useAiChat({ aiContext }))
    act(() => {
      result.current.sendPrompt('just show me the trace')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))

    // Zero writes of any kind.
    expect(apiClient.compileWorkstateDraft).not.toHaveBeenCalled()
    expect(apiClient.acceptWorkstateDraft).not.toHaveBeenCalled()
    const writeUrls = fetchSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/drafts/accept') || u.includes('/session') || u.includes('/drafts/compile') || u.includes('/ai/assist/stream'))
    expect(writeUrls).toEqual([])

    // The unrouted agent_action frame is VISIBLE (named bubble), not swallowed.
    const bubble = result.current.messages.find((m) => m.role === 'system' && m.content.includes('workspace action'))
    expect(bubble).toBeDefined()
  })
})

/**
 * PB-CH-6 — envelope variant A: the generic stack's existing text/draft
 * behavior must stay byte-identical after the channel-envelope branches land.
 * Pins the arms the 26-test baseline already covers at the frame level:
 * status/text_delta accumulation, draft → preview events, the
 * pipeline_diagnostics system bubble, the empty-success system message, and
 * the error arm. If the channel wiring perturbs any of these, this file dies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import type { AiContext } from '../../types/aiContext'

vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
  },
}))

const aiContext: AiContext = {
  surface: 'literature',
  summary: 'test surface',
  surfaceContext: {},
}

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — text/draft compatibility (unchanged arms)', () => {
  it('status + text_delta accumulate into the assistant message; done closes the turn', async () => {
    frames(
      { type: 'status', message: 'Prompt received.' },
      { type: 'text_delta', delta: 'Hello ' },
      { type: 'text_delta', delta: 'world' },
      { type: 'done', result: { success: true, events: [], notes: ['done note'] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))
    act(() => {
      result.current.sendPrompt('hi')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    const assistant = result.current.messages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toContain('Hello world')
    expect(assistant?.content).toContain('done note')
  })

  it('draft frame + done events populate previewEvents (draft arm unchanged)', async () => {
    const event = { eventId: 'e-1', event_type: 'transfer', details: {} }
    frames(
      { type: 'draft', events: [event] },
      { type: 'done', result: { success: true, events: [event], notes: [] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))
    act(() => {
      result.current.sendPrompt('draft something')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(result.current.previewEvents.length).toBe(1)
    expect(result.current.previewEventStates.get('e-1')).toBe('pending')
  })

  it('pipeline_diagnostics still produces its system bubble (arm unchanged)', async () => {
    frames(
      {
        type: 'pipeline_diagnostics',
        outcome: 'gap',
        diagnostics: [{ pass_id: 'p1', code: 'MISSING', severity: 'warning', message: 'no labware' }],
      },
      { type: 'done', result: { success: true, events: [], notes: [] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))
    act(() => {
      result.current.sendPrompt('do it')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    const bubble = result.current.messages.find((m) => m.role === 'system' && m.content.includes('Pipeline did not produce events'))
    expect(bubble).toBeDefined()
    expect(bubble!.content).toContain('p1.MISSING')
  })

  it('empty-success system message unchanged', async () => {
    frames({ type: 'done', result: { success: true, events: [], notes: [] } })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    act(() => {
      result.current.sendPrompt('anything')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    const bubble = result.current.messages.find((m) => m.role === 'system' && m.content.includes('did not propose any changes'))
    expect(bubble).toBeDefined()
  })

  it('error arm unchanged', async () => {
    frames({ type: 'error', message: 'boom' })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    act(() => {
      result.current.sendPrompt('anything')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    const assistant = result.current.messages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toContain('Error: boom')
  })
})

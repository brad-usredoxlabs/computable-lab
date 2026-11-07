/**
 * SEQ-ANSWER-CONTRACT-1 d4client — D4: answer-delivered suppression
 *
 * The server streams answer text via text_delta frames then closes with
 * done(events=[]). Without a guard, the client renders both the answer AND
 * a system bubble "did not propose any changes" — a flat contradiction.
 *
 * Fix: derive answerDelivered from per-turn accumulated text_delta deltas
 * (trimmed, non-empty) and gate both the honestWall and bubble on it.
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
  surface: 'run-workspace',
  summary: 'Run workspace: RUN-1',
  surfaceContext: { runId: 'RUN-1', eventGraphId: 'EG-1' },
}

function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('D4: answer-delivered suppression', () => {
  it('P1 — text_delta + empty done: no false bubble, no honestWall, answer preserved', async () => {
    frames(
      { type: 'text_delta', delta: 'The doubling time is 30 hours.' },
      { type: 'done', result: { success: true, events: [], notes: [] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('What is the doubling time?')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })

    const assistant = result.current.messages.find((m) => m.role === 'assistant')!
    // The answer must survive — the fix must not eat the answer
    expect(assistant.content).toContain('The doubling time is 30 hours.')
    // The false bubble must be absent
    expect(result.current.messages.some(
      (m) => m.role === 'system' && m.content === 'AI completed the task but did not propose any changes.',
    )).toBe(false)
    // The honest wall must be null
    expect(result.current.honestWall).toBeNull()
  })

  it('P2 — empty done without text_delta: bubble present, wall non-null (non-vacuity)', async () => {
    frames({ type: 'done', result: { success: true, events: [], notes: [] } })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('do nothing observable')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })

    // This test must pass BEFORE and AFTER the fix — non-vacuity
    expect(result.current.messages.some(
      (m) => m.content === 'AI completed the task but did not propose any changes.',
    )).toBe(true)
    expect(result.current.honestWall).not.toBeNull()
  })

  it('P3 — clarificationRequests done: unchanged (no bubble, wall null)', async () => {
    frames({
      type: 'done',
      result: {
        success: true,
        events: [],
        notes: [],
        clarificationRequests: [{
          id: 'req-1',
          kind: 'material',
          prompt: 'Which material?',
          origin: 'harness',
          entityType: 'material',
          menuProvider: 'choice',
          query: 'DMEM',
          options: [{ id: 'o-1', label: 'DMEM', snippet: '' }],
        }],
      },
    })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('Add medium')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })

    expect(result.current.honestWall).toBeNull()
    expect(result.current.messages.some(
      (m) => m.content === 'AI completed the task but did not propose any changes.',
    )).toBe(false)
  })

  it('P4 — events-bearing done: unchanged (no bubble, wall null)', async () => {
    frames({
      type: 'done',
      result: {
        success: true,
        events: [{ event_id: 'e1', event_type: 'add_material', details: { well: 'A1' } }],
        notes: [],
      },
    })
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('Add material')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })

    expect(result.current.honestWall).toBeNull()
    expect(result.current.messages.some(
      (m) => m.content === 'AI completed the task but did not propose any changes.',
    )).toBe(false)
  })

  it('P5 — whitespace-only text_delta: still produces bubble/wall (not an answer)', async () => {
    frames(
      { type: 'text_delta', delta: '   \n  ' },
      { type: 'done', result: { success: true, events: [], notes: [] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))
    await act(async () => {
      result.current.sendPrompt('whitespace answer')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })

    expect(result.current.messages.some(
      (m) => m.content === 'AI completed the task but did not propose any changes.',
    )).toBe(true)
    expect(result.current.honestWall).not.toBeNull()
  })
})

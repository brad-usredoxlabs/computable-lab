/**
 * L2-CHAT-1 FIX3 D4 (cycle-3 residual contract) — both dishonest channels,
 * no dead panes:
 *
 *  D4a — a success that carries ONLY proposed labware (no events) is a
 *       REPORTED wall that NAMES the channel ("proposed N new labware,
 *       which this surface cannot mount without events") — the old wall
 *       gate's !hasLabware suppression is gone;
 *  D4b — result.clarificationRequests copy onto the assistant message so
 *       ChatLog's existing arm (ChatLog.tsx:197) renders the typed
 *       questions, and they count as ASKED questions (the wall cannot
 *       claim "asked no questions" beside them).
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiChat } from './useAiChat'
import type { AiContext } from '../../types/aiContext'
import { streamAssist } from '../api/aiClient'

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

describe('useAiChat — L2-CHAT-1 FIX3 D4: both dishonest channels, no dead panes', () => {
  it('D4a: a labwareAdditions-only success is a REPORTED wall that NAMES the channel', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          notes: [],
          labwareAdditions: [
            { recordId: 'rec-a', reason: 'new plate A' },
            { recordId: 'rec-b', reason: 'new plate B' },
          ],
        },
      },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))

    await act(async () => {
      result.current.sendPrompt('add two new plates')
    })
    await waitFor(() => expect(result.current.honestWall).toBeTruthy())
    expect(result.current.honestWall).toContain(
      'proposed 2 new labware, which this surface cannot mount without events',
    )
    expect(result.current.honestWall).toContain('Draft produced no events')
    expect(result.current.hasPreview).toBe(false)
  })

  it('D4b: clarificationRequests ride the message AND are not wall-suppressed', async () => {
    frames(
      { type: 'status', message: 'working' },
      {
        type: 'done',
        result: {
          success: true,
          notes: [],
          clarificationRequests: [
            {
              id: 'cr-1',
              kind: 'material',
              prompt: 'Which reagent to add?',
              entityType: 'material',
              menuProvider: '/m',
            },
          ],
        },
      },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))

    await act(async () => {
      result.current.sendPrompt('add the lysis reagent')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false))

    // The typed questions ride the assistant message — ChatLog's existing
    // arm (ChatLog.tsx:197) renders them; a done carrying only these is NOT
    // a dead pane.
    const withRequests = result.current.messages.find((m) => m.clarificationRequests?.length)
    expect(withRequests).toBeTruthy()
    expect(withRequests!.clarificationRequests).toEqual(
      expect.arrayContaining([expect.objectContaining({ prompt: 'Which reagent to add?' })]),
    )
    // They count as ASKED questions — the wall must not claim "asked no
    // questions" beside them.
    expect(result.current.honestWall).toBeNull()
  })
})

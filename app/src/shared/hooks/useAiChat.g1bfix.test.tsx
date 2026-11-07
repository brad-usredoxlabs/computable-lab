/**
 * SEQ-ANSWER-CONTRACT-1 g1bfix1 — D2 + D3 RED probes: a delivered navigation
 * agent_action must NOT trigger "No events generated." in the assistant bubble
 * (D2) and must NOT fire the honest wall (D3).
 *
 * D2 root cause: buildAssistantContent case 'done' appends "No events generated."
 * when events === 0 and modelText === 0, regardless of whether notes carried
 * a delivered-action acknowledgement. Fix: suppress the tail when notes exist.
 *
 * D3 root cause: the honest-wall gate at :1869 lacks the navActionDelivered
 * escape that its sibling bubble gate at :1936 already has.
 * Fix: add && !navActionDelivered to :1869.
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

const NAV_FRAME = {
  type: 'agent_action',
  action: {
    action: 'open-surface',
    surface: 'sequences',
    target: { kind: 'sequence-tab', tab: 'Assay' },
  },
}

const NAV_DONE = {
  type: 'done',
  result: {
    success: true,
    events: [],
    notes: ['Action sent — see the workspace.'],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SEQ-ANSWER-CONTRACT-1 g1bfix1 — D2: nav-delivered turn must not claim "No events generated."', () => {
  it('D2: assistant bubble contains the note but NOT "No events generated." when nav was delivered', async () => {
    frames(NAV_FRAME, NAV_DONE)
    // Handler applies the nav (undefined = accepted)
    const onAgentAction = vi.fn(() => undefined)
    const { result } = renderHook(() => useAiChat({ aiContext, onAgentAction }))
    await act(async () => {
      result.current.sendPrompt('Switch to the Assay tab.')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })

    // Find the assistant message (role !== 'user' && !== 'system')
    const assistantMsg = result.current.messages.find(
      (m) => m.role !== 'user' && m.role !== 'system',
    )
    expect(assistantMsg).toBeDefined()
    const content = assistantMsg!.content

    // The note MUST appear
    expect(content).toContain('Action sent — see the workspace.')
    // The stale tail must NOT appear
    expect(content).not.toContain('No events generated.')
  })
})

describe('SEQ-ANSWER-CONTRACT-1 g1bfix1 — D3: nav-delivered turn must not fire the honest wall', () => {
  it('D3: honestWall is null when a nav action was delivered', async () => {
    frames(NAV_FRAME, NAV_DONE)
    const onAgentAction = vi.fn(() => undefined)
    const { result } = renderHook(() => useAiChat({ aiContext, onAgentAction }))
    await act(async () => {
      result.current.sendPrompt('Switch to the Assay tab.')
    })
    await waitFor(() => expect(result.current.isStreaming).toBe(false), { timeout: 4000 })

    // The wall must be suppressed because navActionDelivered is true
    expect(result.current.honestWall).toBeNull()
  })
})

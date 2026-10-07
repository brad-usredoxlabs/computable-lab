/**
 * PB-CH-6 — RED-first: the generic stack (useAiChat + types/ai.ts) must
 * understand the wave-1 channel envelopes (workstate_proposal / agent_action)
 * instead of silently dropping them.
 *
 * Today `streamAssist` already passes ANY JSON frame through parseSSEBlock,
 * but AiStreamEvent has no member for the two channel frames and useAiChat's
 * event loop falls through them — the exact silent-drop defect class PB-CH-6
 * closes. These tests pin the sanctioned behavior:
 *  - a workstate_proposal frame fires onWorkstateProposal with the VERBATIM
 *    payload (no reshaping, no validation here — /api/drafts/compile is the
 *    trust boundary);
 *  - an agent_action frame fires onAgentAction with the verbatim envelope;
 *  - NO callback registered ⇒ the frame surfaces as a NAMED system bubble —
 *    never swallowed (task verbatim: "never a silent no-op control").
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

/** Drive a canned frame sequence through the mocked streamAssist generator. */
function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

const WORKSTATE_FRAME = {
  type: 'workstate_proposal',
  workstate: {
    operation: 'compose-workstate',
    tabs: [{ surface: 'analysis', title: 'Analysis' }],
    activeTab: { index: 0 },
  },
}

const AGENT_ACTION_FRAME = {
  type: 'agent_action',
  action: { action: 'open-surface', surface: 'analysis' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — channel envelope callbacks (PB-CH-6)', () => {
  it('workstate_proposal frame fires onWorkstateProposal with the verbatim payload', async () => {
    frames(
      { type: 'status', message: 'working' },
      WORKSTATE_FRAME,
      { type: 'done', result: { success: true, notes: ['Proposed a workspace — review the card to accept; nothing was written.'] } },
    )
    const onWorkstateProposal = vi.fn()
    const { result } = renderHook(() => useAiChat({ aiContext, onWorkstateProposal }))

    act(() => {
      result.current.sendPrompt('compose the workspace: open the analysis surface')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(onWorkstateProposal).toHaveBeenCalledTimes(1)
    expect(onWorkstateProposal).toHaveBeenCalledWith(WORKSTATE_FRAME.workstate)
  })

  it('agent_action frame fires onAgentAction with the verbatim envelope', async () => {
    frames(
      AGENT_ACTION_FRAME,
      { type: 'done', result: { success: true, notes: [] } },
    )
    const onAgentAction = vi.fn()
    const { result } = renderHook(() => useAiChat({ aiContext, onAgentAction }))

    act(() => {
      result.current.sendPrompt('open the analysis surface')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(onAgentAction).toHaveBeenCalledTimes(1)
    expect(onAgentAction).toHaveBeenCalledWith(AGENT_ACTION_FRAME.action)
  })

  it('workstate_proposal with NO callback registered surfaces a NAMED system bubble — the frame is never swallowed', async () => {
    frames(
      WORKSTATE_FRAME,
      { type: 'done', result: { success: true, notes: [] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))

    act(() => {
      result.current.sendPrompt('compose the workspace')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    const systemBubble = result.current.messages.find(
      (m) => m.role === 'system' && m.content.includes('workspace change'),
    )
    expect(systemBubble).toBeDefined()
    expect(systemBubble!.content).toContain('cannot show proposal cards')
  })

  it('agent_action with NO callback registered surfaces a NAMED system bubble — the frame is never swallowed', async () => {
    frames(
      AGENT_ACTION_FRAME,
      { type: 'done', result: { success: true, notes: [] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))

    act(() => {
      result.current.sendPrompt('open something')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    const systemBubble = result.current.messages.find(
      (m) => m.role === 'system' && m.content.includes('workspace action'),
    )
    expect(systemBubble).toBeDefined()
  })

  it('a throwing callback does not break the turn (pipeline_diagnostics wrapper style)', async () => {
    frames(
      WORKSTATE_FRAME,
      { type: 'text_delta', delta: 'still streaming text' },
      { type: 'done', result: { success: true, notes: ['ok'] } },
    )
    const onWorkstateProposal = vi.fn(() => {
      throw new Error('card mount exploded')
    })
    const { result } = renderHook(() => useAiChat({ aiContext, onWorkstateProposal }))

    act(() => {
      result.current.sendPrompt('compose the workspace')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(onWorkstateProposal).toHaveBeenCalledTimes(1)
    // The turn completed normally despite the callback throwing.
    const assistant = result.current.messages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toContain('still streaming text')
    expect(assistant?.content).not.toContain('Error:')
  })
})

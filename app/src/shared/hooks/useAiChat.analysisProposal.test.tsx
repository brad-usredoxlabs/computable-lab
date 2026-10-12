/**
 * PB-CH-5 repair — RED-first: the generic stack (useAiChat + types/ai.ts)
 * must understand the `analysis_proposal` frame (the channel PB-CH-5
 * introduced) instead of silently dropping it.
 *
 * Today the server emits {type:'analysis_proposal', analysis}
 * (AgentOrchestrator.ts:2337; the assistStream.ts union carries the member at
 * :259 — the run-page path works) but AiStreamEvent has NO member for it and
 * useAiChat's event loop falls through the frame — the exact silent-drop
 * defect class PB-6 closes, on the /analysis mount (evidence:
 * decisions/PB-CH-5-analysis-proposal-drop-finding.md). These tests pin the
 * sanctioned behavior, mirroring useAiChat.channelEnvelopes.test.tsx exactly:
 *  - an analysis_proposal frame fires onAnalysisProposal with the VERBATIM
 *    analysis payload (no reshaping, no validation here — the trust boundary
 *    is POST /api/drafts/compile, Ajv + canAccept);
 *  - NO callback registered ⇒ the frame surfaces as a NAMED system bubble —
 *    never swallowed ("missing capability = explicit tested behavior, never a
 *    silent no-op");
 *  - a throwing callback ⇒ system line, turn continues (never-break-the-turn
 *    wrapper, same style as the workstate_proposal branch).
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
  surface: 'analysis',
  summary: 'test surface',
  surfaceContext: {},
}

/** Drive a canned frame sequence through the mocked streamAssist generator. */
function frames(...events: Array<Record<string, unknown>>) {
  vi.mocked(streamAssist).mockImplementation(async function* () {
    for (const e of events) yield e as never
  })
}

// The VERBATIM server frame (AgentOrchestrator.ts:2337 emits
// {type:'analysis_proposal', analysis}; the analysis-intent shape per
// submitSuggestionTool.ts:591-593 — verbs and terms only).
const ANALYSIS_FRAME = {
  type: 'analysis_proposal',
  analysis: {
    operation: 'compose-analysis',
    target: { revision: { term: 'ros-method' }, newRun: true },
    focus: 'run',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAiChat — analysis_proposal envelope (PB-CH-5 repair)', () => {
  it('analysis_proposal frame fires onAnalysisProposal with the verbatim analysis payload', async () => {
    frames(
      { type: 'status', message: 'working' },
      ANALYSIS_FRAME,
      { type: 'done', result: { success: true, notes: ['Proposed an analysis — review the card; nothing executed.'] } },
    )
    const onAnalysisProposal = vi.fn()
    const { result } = renderHook(() => useAiChat({ aiContext, onAnalysisProposal }))

    act(() => {
      result.current.sendPrompt('create a new analysis run that analyzes the results of run RUN-42')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(onAnalysisProposal).toHaveBeenCalledTimes(1)
    expect(onAnalysisProposal).toHaveBeenCalledWith(ANALYSIS_FRAME.analysis)
  })

  it('analysis_proposal with NO callback registered surfaces a NAMED system bubble — the frame is never swallowed', async () => {
    frames(
      ANALYSIS_FRAME,
      { type: 'done', result: { success: true, notes: [] } },
    )
    const { result } = renderHook(() => useAiChat({ aiContext }))

    act(() => {
      result.current.sendPrompt('compose an analysis')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    const systemBubble = result.current.messages.find(
      (m) => m.role === 'system' && m.content.includes('proposed an analysis'),
    )
    expect(systemBubble).toBeDefined()
    expect(systemBubble!.content).toContain('cannot show proposal cards')
    expect(systemBubble!.content).toContain('Nothing was written.')
  })

  it('a throwing onAnalysisProposal does not break the turn (workstate-branch wrapper style)', async () => {
    frames(
      ANALYSIS_FRAME,
      { type: 'text_delta', delta: 'still streaming text' },
      { type: 'done', result: { success: true, notes: ['ok'] } },
    )
    const onAnalysisProposal = vi.fn(() => {
      throw new Error('analysis card mount exploded')
    })
    const { result } = renderHook(() => useAiChat({ aiContext, onAnalysisProposal }))

    act(() => {
      result.current.sendPrompt('compose an analysis')
    })

    await waitFor(() => expect(result.current.isStreaming).toBe(false))
    expect(onAnalysisProposal).toHaveBeenCalledTimes(1)
    // The turn completed normally despite the callback throwing.
    const assistant = result.current.messages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toContain('still streaming text')
    expect(assistant?.content).not.toContain('Error:')
    // Mirrors the workstate branch's wrapper wording (the existing test pins
    // the workstate wording; the analysis wrapper keeps the same shape).
    const systemLine = result.current.messages.find(
      (m) => m.role === 'system' && m.content.includes('proposal card could not open'),
    )
    expect(systemLine).toBeDefined()
  })
})

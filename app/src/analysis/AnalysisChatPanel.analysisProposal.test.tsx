/**
 * PB-CH-5 repair — RED-first at the mount level: on the /analysis mount an
 * analysis_proposal frame must reach the flow with the 'analysis' adapter
 * (AnalysisChatPanel registers onAnalysisProposal ->
 * flow.proposeWorkstate('analysis', intent) — the same adapter-parameter
 * discipline AiTabPanel.tsx:635-637 already uses; 'analysis' is a valid
 * WorkstateAdapter there).
 *
 * Pre-fix the frame is silently DROPPED on this mount (useAiChat has no
 * analysis_proposal branch — evidence:
 * decisions/PB-CH-5-analysis-proposal-drop-finding.md; orchgate5 receipt:
 * server SSE carried the frame, the page rendered 0 cards).
 *
 * Conventions mirror AnalysisPage.chat.test.tsx (streamAssist frame mock) and
 * analysisChat.health.test.tsx (AnalysisChatPanel unit render). The flow hook
 * is SPYED at its module (spec-preferred seam): the assertion is the exact
 * (adapter, verbatim intent) call, not card rendering.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { AnalysisChatPanel } from './AnalysisChatPanel'
import { streamAssist } from '../shared/api/aiClient'

vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
    compileWorkstateDraft: vi.fn(),
    acceptWorkstateDraft: vi.fn(),
  },
}))

// Spy the flow hook at its module (the spec-preferred seam): the mount-level
// assertion is proposeWorkstate('analysis', <verbatim intent>) — the card
// machinery itself is already pinned by AnalysisPage.chat.test.tsx.
const mocks = vi.hoisted(() => ({
  proposeWorkstate: vi.fn(),
  handleAgentAction: vi.fn(),
  rejectWorkstate: vi.fn(),
}))

vi.mock('../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: mocks.proposeWorkstate,
    acceptWorkstate: vi.fn(),
    rejectWorkstate: mocks.rejectWorkstate,
    handleAgentAction: mocks.handleAgentAction,
  }),
}))

// The VERBATIM server frame (AgentOrchestrator.ts:2337 emits
// {type:'analysis_proposal', analysis}; analysis-intent shape per
// submitSuggestionTool.ts:591-593).
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

describe('AnalysisChatPanel — analysis_proposal reaches the flow (PB-CH-5 repair)', () => {
  it('an analysis_proposal frame calls flow.proposeWorkstate with adapter "analysis" and the verbatim intent', async () => {
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield ANALYSIS_FRAME as never
      yield { type: 'done', result: { success: true, notes: ['Proposed an analysis — review the card; nothing executed.'] } } as never
    })

    render(
      <ThemeProvider>
        <MemoryRouter>
          <AnalysisChatPanel />
        </MemoryRouter>
      </ThemeProvider>,
    )

    const input = await screen.findByTestId('analysis-chat-input')
    fireEvent.change(input, { target: { value: 'create a new analysis run that analyzes the results of run RUN-42' } })
    fireEvent.click(screen.getByTestId('analysis-chat-send'))

    await waitFor(() => expect(mocks.proposeWorkstate).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(mocks.proposeWorkstate).toHaveBeenCalledWith('analysis', ANALYSIS_FRAME.analysis)
  })
})

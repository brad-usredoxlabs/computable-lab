/**
 * PB-CH-6 — Analysis mount honesty + the Analysis-local chat.
 *
 * 1) The mount (with the chat panel now in the right pane) still fires ONLY
 *    listAnalysisRevisions/listAnalysisRuns — no execute/promote/assist/
 *    compile at mount (the PB-CH-5 no-execute spy test stays green; this is
 *    the chat-panel-aware version of the same accounting).
 * 2) The chat panel is VISIBLE (data-testid="analysis-chat-panel") and the
 *    existing analysis-ai-author box stays byte-identical.
 * 3) A workstate_proposal frame from the chat renders the proposal card
 *    INSIDE the panel (compiling slot first, review card after the compile).
 * 4) Accept goes through the flow → the executor (mocked at its module, the
 *    AiTabPanel.workstate.test.tsx precedent) with the attestation + identity.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { AnalysisPage } from './AnalysisPage'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

const mocks = vi.hoisted(() => ({
  streamFrames: null as null | Array<Record<string, unknown>>,
  healthAvailable: true,
  executeTier1: vi.fn(),
  applyAcceptedWorkstate: vi.fn(),
}))

vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(async function* () {
    for (const frame of mocks.streamFrames ?? []) yield frame as never
  }),
  getAiHealth: vi.fn(() => Promise.resolve({ available: mocks.healthAvailable })),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listAnalysisRevisions: vi.fn(),
    listAnalysisRuns: vi.fn(),
    createAnalysisRevision: vi.fn(),
    createAnalysisRun: vi.fn(),
    executeAnalysisRun: vi.fn(),
    getAnalysisRun: vi.fn(),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [
      { id: 'run', label: 'Run', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'] },
    ] }),
    draftAnalysisRevision: vi.fn(),
    promoteAnalysisArtifact: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
    compileWorkstateDraft: vi.fn(),
    acceptWorkstateDraft: vi.fn(),
  },
}))

vi.mock('../shared/session/useWorkstateExecutor', () => ({
  useWorkstateExecutor: () => ({
    executeTier1: mocks.executeTier1,
    applyAcceptedWorkstate: mocks.applyAcceptedWorkstate,
  }),
}))

const INTENT = { operation: 'compose-workstate', tabs: [{ surface: 'analysis', title: 'Analysis' }], activeTab: { index: 0 } }
// Test-controlled compile gate: the mock returns this promise; the test calls
// release() only after it has OBSERVED the compiling slot.
type CompiledOk = Awaited<ReturnType<typeof apiClient.compileWorkstateDraft>>
let compileGate: Promise<CompiledOk> = Promise.resolve(undefined as unknown as CompiledOk)
let release: () => void = () => undefined
const COMPILED_OK = {
  draftId: 'DRAFT-A1',
  revision: 1,
  reviewHash: 'd'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    sessionDocument: { version: 1, tabs: [{ kind: 'run', runId: 'RUN-42', title: 'ROS run' }], activeTabId: null },
    summary: 'Open the ROS run',
  },
}

function wrap(ui: React.ReactNode) {
  return <ThemeProvider><OpenTabsProvider><MemoryRouter>{ui}</MemoryRouter></OpenTabsProvider></ThemeProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.streamFrames = null
  mocks.healthAvailable = true
  mocks.executeTier1.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
  mocks.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [], total: 0 })
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [], total: 0 })
  // Compile resolves only when the TEST releases it (a deferred, not a timer):
  // under full-suite load a setTimeout can resolve before findByTestId's first
  // poll, which would skip past the `compiling` slot (NO accept control).
  let releaseCompile: (v: CompiledOk) => void = () => undefined
  compileGate = new Promise<CompiledOk>((resolve) => { releaseCompile = resolve })
  vi.mocked(apiClient.compileWorkstateDraft).mockImplementation(() => compileGate)
  release = () => releaseCompile(COMPILED_OK)
  vi.mocked(apiClient.acceptWorkstateDraft).mockResolvedValue(COMPILED_OK.result)
})

describe('AnalysisPage chat mount (PB-CH-6)', () => {
  it('mount fires ONLY listAnalysisRevisions + listAnalysisRuns — no assist/compile/execute/promote', async () => {
    render(wrap(<AnalysisPage />))
    expect(await screen.findByTestId('analysis-page')).toBeDefined()
    expect(apiClient.listAnalysisRevisions).toHaveBeenCalledTimes(1)
    expect(apiClient.listAnalysisRuns).toHaveBeenCalledTimes(1)
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.promoteAnalysisArtifact).not.toHaveBeenCalled()
    expect(apiClient.draftAnalysisRevision).not.toHaveBeenCalled()
    expect(apiClient.compileWorkstateDraft).not.toHaveBeenCalled()
    expect(apiClient.acceptWorkstateDraft).not.toHaveBeenCalled()
  })

  it('the chat panel is mounted in the right pane and the analysis-ai-author box is intact', async () => {
    render(wrap(<AnalysisPage />))
    expect(await screen.findByTestId('analysis-chat-panel')).toBeDefined()
    expect(screen.getByTestId('analysis-ai-author')).toBeDefined()
    expect(screen.getByTestId('analysis-ai-prompt')).toBeDefined()
    expect(screen.getByTestId('analysis-ai-author-btn')).toBeDefined()
  })

  it('a workstate_proposal frame renders the card INSIDE the panel: compiling slot, then review card after the compile', async () => {
    mocks.streamFrames = [
      { type: 'workstate_proposal', workstate: INTENT },
      { type: 'done', result: { success: true, notes: ['Proposed a workspace — review the card to accept; nothing was written.'] } },
    ]
    render(wrap(<AnalysisPage />))
    const input = await screen.findByTestId('analysis-chat-input')
    fireEvent.change(input, { target: { value: 'compose the workspace: open the analysis surface' } })
    fireEvent.click(screen.getByTestId('analysis-chat-send'))

    // Compiling slot first — NO accept control until the server answers.
    expect(await screen.findByTestId('workstate-card-compiling')).toBeDefined()
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()

    // NOW the fake server answers: the review card with Accept lands.
    release()
    expect(await screen.findByTestId('workstate-card')).toBeDefined()
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledWith({ adapter: 'workstate', intent: INTENT })
    const accept = screen.getByTestId('workstate-card-accept')
    // The card rides inside the chat panel.
    expect(screen.getByTestId('analysis-chat-panel').contains(accept)).toBe(true)

    await act(async () => {
      fireEvent.click(accept)
    })
    expect(apiClient.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(apiClient.acceptWorkstateDraft).toHaveBeenCalledWith({
      draftId: 'DRAFT-A1',
      revision: 1,
      reviewHash: 'd'.repeat(64),
    })
    expect(mocks.applyAcceptedWorkstate).toHaveBeenCalledWith(
      COMPILED_OK.result,
      { accepted: true },
      { draftId: 'DRAFT-A1', revision: 1, reviewHash: 'd'.repeat(64) },
    )
    // Spent card: controls disappear.
    expect(await screen.findByTestId('workstate-card-applied')).toBeDefined()
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
  })

  it('reject on the mounted path = zero writes (no accept call, card gone)', async () => {
    mocks.streamFrames = [
      { type: 'workstate_proposal', workstate: INTENT },
      { type: 'done', result: { success: true, notes: [] } },
    ]
    render(wrap(<AnalysisPage />))
    const input = await screen.findByTestId('analysis-chat-input')
    fireEvent.change(input, { target: { value: 'compose the workspace' } })
    fireEvent.click(screen.getByTestId('analysis-chat-send'))
    release()
    const reject = await screen.findByTestId('workstate-card-reject')
    fireEvent.click(reject)
    expect(screen.queryByTestId('workstate-card')).toBeNull()
    expect(apiClient.acceptWorkstateDraft).not.toHaveBeenCalled()
  })

  it('an agent_action frame with the flow mounted goes through executeTier1 (no second executor here)', async () => {
    mocks.streamFrames = [
      { type: 'agent_action', action: { action: 'open-surface', surface: 'run', target: { kind: 'run', id: 'RUN-42' } } },
      { type: 'done', result: { success: true, notes: [] } },
    ]
    render(wrap(<AnalysisPage />))
    const input = await screen.findByTestId('analysis-chat-input')
    fireEvent.change(input, { target: { value: 'open the analysis surface' } })
    fireEvent.click(screen.getByTestId('analysis-chat-send'))
    await screen.findByText('open the analysis surface')
    // The stream mock is an async generator — the frame lands after the user
    // echo. Wait for the executor call, do not assert synchronously.
    await waitFor(() => expect(mocks.executeTier1).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(apiClient.compileWorkstateDraft).not.toHaveBeenCalled()
  })
})

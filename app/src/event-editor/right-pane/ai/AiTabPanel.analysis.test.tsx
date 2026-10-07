/**
 * PB-CH-5 — the analysis INTENT rides the EXISTING compile→card→accept/reject
 * flow with adapter 'analysis' (one constant, not a fork).
 *
 * Criteria pinned here (spec matrix "card lifecycle by contract"):
 *  - an analysis_proposal event alone renders NO accept control — only the
 *    "compiling…" slot — until the compile response arrives;
 *  - the compile call carries adapter:'analysis' + the intent verbatim (the
 *    ONLY flow delta vs workstate);
 *  - canAccept:false → summary + diagnostics, NO accept control;
 *  - Accept posts exactly {draftId,revision,reviewHash} (adapter-blind
 *    identity triple), hands the FLAT body to applyAcceptedWorkstate, and
 *    issues ZERO /ai/assist/stream fetches;
 *  - Reject creates/moves nothing (zero apiClient calls, store identity);
 *  - source-pin: the panel calls the SAME handlers for both adapters — the
 *    card/accept/reject code paths are shared, not forked (one
 *    handleWorkstateProposal, one accept, one reject; `adapter` is a
 *    parameter).
 *
 * Harness: AiTabPanel.workstate.test.tsx precedent (option-capturing
 * useChatThread mock + mocked apiClient store).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'
import { OpenTabsProvider, useOpenTabs, type OpenTabsState } from '../../../shared/shell/OpenTabsContext'
import { useSessionSync } from '../../../shared/session/useSessionSync'
import type { SurfaceSpec } from '../../../shared/surfaces'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 0,
      fingerprints: [''],
      getPage: () => Promise.resolve(null),
      destroy: () => undefined,
    }),
    destroy: () => undefined,
  })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class {
    render() {
      return Promise.resolve()
    }
  },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

const mocks = vi.hoisted(() => ({
  chatOptions: null as null | {
    onAgentAction?: (action: unknown) => string | undefined
    onWorkstateProposal?: (intent: Record<string, unknown>) => void
    onAnalysisProposal?: (intent: Record<string, unknown>) => void
    onDraftResult?: (result: unknown, prompt: string) => void
  },
  executeTier1: vi.fn(),
  applyAcceptedWorkstate: vi.fn(),
  compileWorkstateDraft: vi.fn(),
  acceptWorkstateDraft: vi.fn(),
  getSession: vi.fn(),
  putSession: vi.fn(),
  focusedStep: { current: null as null | { stepId: string; label: string; ordinal?: number } },
  protocolIdentity: { current: null as null | { recordId: string; title?: string; sha?: string } },
  openTabsState: { current: null as OpenTabsState | null },
}))

const REGISTRY = [
  { id: 'surface-run', label: 'Renamed run surface', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'], selectableKinds: [] },
] as unknown as SurfaceSpec[]

vi.mock('./useChatThread', () => ({
  useChatThread: (options: {
    onAgentAction?: (action: unknown) => string | undefined
    onWorkstateProposal?: (intent: Record<string, unknown>) => void
    onAnalysisProposal?: (intent: Record<string, unknown>) => void
    onDraftResult?: (result: unknown, prompt: string) => void
  }) => {
    mocks.chatOptions = options
    return {
      state: { messages: [], pending: null, status: null, error: null, trace: [], protocolCandidate: undefined },
      isStreaming: false,
      send: vi.fn(async () => undefined),
      stop: vi.fn(),
      reset: vi.fn(),
      clearProtocolCandidate: vi.fn(),
    }
  },
}))

vi.mock('../../../shared/session/useWorkstateExecutor', () => ({
  useWorkstateExecutor: () => ({
    executeTier1: mocks.executeTier1,
    applyAcceptedWorkstate: mocks.applyAcceptedWorkstate,
  }),
}))

vi.mock('../../../shared/surfaces/registry', () => ({
  useSurfaceRegistry: () => REGISTRY,
  loadSurfaceRegistry: () => Promise.resolve(REGISTRY),
}))

vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => ({
    protocol: mocks.protocolIdentity.current,
    steps: [],
    resources: { labwares: [], equipment: [] },
    focusedStep: mocks.focusedStep.current,
    setFocusedStep: vi.fn(),
  }),
}))

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    warmAiContext: vi.fn(async () => null),
    getAiWarmStatus: vi.fn(async () => null),
    getSurfaces: vi.fn(async () => ({ surfaces: REGISTRY })),
    compileWorkstateDraft: (...args: unknown[]) => mocks.compileWorkstateDraft(...(args as [])),
    acceptWorkstateDraft: (...args: unknown[]) => mocks.acceptWorkstateDraft(...(args as [])),
    getSession: (...args: unknown[]) => mocks.getSession(...(args as [])),
    putSession: (...args: unknown[]) => mocks.putSession(...(args as [])),
  },
}))

import { AiTabPanel } from './AiTabPanel'

const ANALYSIS_INTENT = {
  operation: 'compose-analysis',
  target: {
    revision: { term: 'ROS mitochondrial flux analysis' },
    newRun: { title: 'Fresh ROS run', inputs: { trace: { term: 'Seahorse trace file' } } },
  },
  focus: 'run',
}

const COMPILED_OK = {
  draftId: 'DRAFT-11',
  revision: 1,
  reviewHash: 'd'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    version: 1,
    sessionDocument: {
      version: 1,
      tabs: [
        { id: 'record:ANR-000042', kind: 'record', recordId: 'ANR-000042', type: 'analysis-run', title: 'Fresh ROS run' },
      ],
      activeTabId: 'record:ANR-000042',
    },
    summary: 'Open the ROS analysis with a queued fresh run',
    resolvedTerms: [
      { term: 'ROS mitochondrial flux analysis', curieOrRecordId: 'ANR-000041', label: 'ROS mitochondrial flux analysis' },
    ],
  },
}

const FLAT_ACCEPT_BODY = COMPILED_OK.result

function StoreProbe() {
  const tabs = useOpenTabs()
  mocks.openTabsState.current = tabs.state
  return null
}

function SyncMount() {
  useSessionSync()
  return null
}

function renderPanel() {
  const base = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
      <OpenTabsProvider>
        <SyncMount />
        <StoreProbe />
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: {
              ...base,
              tabs: [{ id: 't1', kind: 'deck' as const, eventGraphId: 'EVG-1', title: 'Deck' }],
              activeTabId: 't1',
            } as ReturnType<typeof defaultWorkspaceState>,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>,
  )
}

async function settlePushBaseline() {
  await act(async () => {
    vi.advanceTimersByTime(600)
  })
  mocks.putSession.mockClear()
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  vi.spyOn(window, 'confirm').mockImplementation(() => false)
  mocks.chatOptions = null
  mocks.executeTier1.mockReset()
  mocks.executeTier1.mockReturnValue({ ok: true, kind: 'focused', diagnostics: [] })
  mocks.applyAcceptedWorkstate.mockReset()
  mocks.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
  mocks.compileWorkstateDraft.mockReset()
  mocks.acceptWorkstateDraft.mockReset()
  mocks.getSession.mockReset()
  mocks.getSession.mockResolvedValue({
    session: { version: 1, userId: 'default', tabs: [], activeTabId: null, updatedAt: '2026-10-07T00:00:00.000Z' },
  })
  mocks.putSession.mockReset()
  mocks.putSession.mockResolvedValue({ session: { updatedAt: '2026-10-07T00:00:01.000Z' } })
  mocks.openTabsState.current = null
  mocks.focusedStep.current = null
  mocks.protocolIdentity.current = { recordId: 'PRT-000123', title: 'ROS assay' }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function mount() {
  renderPanel()
  await act(async () => {
    await Promise.resolve()
  })
  await settlePushBaseline()
}

describe('AiTabPanel — analysis card (shared flow, adapter is the only delta)', () => {
  it('the mount wires onAnalysisProposal alongside onWorkstateProposal (both present, one flow)', async () => {
    await mount()
    expect(typeof mocks.chatOptions?.onWorkstateProposal).toBe('function')
    expect(typeof mocks.chatOptions?.onAnalysisProposal).toBe('function')
  })

  it('an analysis_proposal event alone renders NO accept control (compiling slot); the compile call carries adapter:"analysis" + the intent verbatim', async () => {
    await mount()
    let resolveCompile: (v: unknown) => void = () => undefined
    mocks.compileWorkstateDraft.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCompile = resolve }),
    )

    await act(async () => {
      mocks.chatOptions?.onAnalysisProposal?.(ANALYSIS_INTENT)
    })

    expect(mocks.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.compileWorkstateDraft).toHaveBeenCalledWith({ adapter: 'analysis', intent: ANALYSIS_INTENT })
    expect(screen.getByTestId('workstate-card-compiling')).toBeTruthy()
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()

    await act(async () => {
      resolveCompile(COMPILED_OK)
      await Promise.resolve()
    })
    // Actionable ONLY after the canAccept:true compile response.
    expect(screen.getByTestId('workstate-card-accept')).toBeTruthy()
    expect(screen.getByTestId('workstate-card').textContent).toContain('queued fresh run')
  })

  it('canAccept:false analysis compile renders summary + diagnostics and NO accept control', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue({
      draftId: 'DRAFT-12',
      revision: 1,
      reviewHash: 'e'.repeat(64),
      canAccept: false,
      diagnostics: [
        { code: 'UNRESOLVED_TERM', severity: 'error', message: 'target.revision: term "bogus analysis" resolves to nothing in this lab' },
      ],
      result: { summary: 'Open the bogus analysis' },
    })

    await act(async () => {
      mocks.chatOptions?.onAnalysisProposal?.(ANALYSIS_INTENT)
      await Promise.resolve()
    })

    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
    expect(screen.getByTestId('workstate-card').textContent).toContain('resolves to nothing in this lab')
  })

  it('Accept of an analysis card posts exactly {draftId,revision,reviewHash} (adapter-blind), hands the FLAT body to applyAcceptedWorkstate, ZERO /ai/assist/stream fetch', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)
    mocks.acceptWorkstateDraft.mockResolvedValue(FLAT_ACCEPT_BODY)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await act(async () => {
      mocks.chatOptions?.onAnalysisProposal?.(ANALYSIS_INTENT)
      await Promise.resolve()
    })
    fireEvent.click(screen.getByTestId('workstate-card-accept'))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledWith({
      draftId: 'DRAFT-11',
      revision: 1,
      reviewHash: 'd'.repeat(64),
    })
    expect(mocks.applyAcceptedWorkstate).toHaveBeenCalledTimes(1)
    expect(mocks.applyAcceptedWorkstate).toHaveBeenCalledWith(
      FLAT_ACCEPT_BODY,
      { accepted: true },
      { draftId: 'DRAFT-11', revision: 1, reviewHash: 'd'.repeat(64) },
    )
    // No AI call at accept time — the accept path issues ZERO /ai/assist/stream.
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).not.toContain('assist/stream')
    }
    // Spent card: controls disappear.
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
    expect(screen.getByTestId('workstate-card').textContent).toContain('Applied')
  })

  it('Reject of an analysis card creates/moves nothing: zero apiClient calls, store reference identity, zero pushes', async () => {
    await mount()
    mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)

    await act(async () => {
      mocks.chatOptions?.onAnalysisProposal?.(ANALYSIS_INTENT)
      await Promise.resolve()
    })
    const storeBefore = mocks.openTabsState.current
    const compileCallsBefore = mocks.compileWorkstateDraft.mock.calls.length

    fireEvent.click(screen.getByTestId('workstate-card-reject'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByTestId('workstate-card')).toBeNull()
    expect(mocks.compileWorkstateDraft.mock.calls.length).toBe(compileCallsBefore)
    expect(mocks.acceptWorkstateDraft).not.toHaveBeenCalled()
    expect(mocks.openTabsState.current).toBe(storeBefore)
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mocks.putSession).not.toHaveBeenCalled()
  })

  it('source-pin: card/accept/reject paths are SHARED, not forked — one proposal handler taking the adapter as a parameter', () => {
    const source = readFileSync('src/event-editor/right-pane/ai/AiTabPanel.tsx', 'utf8')
    // Exactly ONE proposal handler and ONE draft-card accept handler exist
    // (no analysis fork; handleProtocolAccept is the pre-existing protocol-edit
    // flow, untouched by PB-CH-5).
    const proposalHandlers = source.match(/const handle\w*Proposal = useCallback/g) ?? []
    expect(proposalHandlers).toHaveLength(1)
    const acceptHandlers = source.match(/const handle\w*(Workstate|Analysis)Accept = useCallback/g) ?? []
    expect(acceptHandlers).toHaveLength(1)
    // The adapter is a PARAMETER of the shared flow, and both mounts pass
    // their constant into the SAME handler.
    expect(source).toContain("adapter: 'workstate' | 'analysis'")
    expect(source).toContain("handleWorkstateProposal(intent, 'workstate')")
    expect(source).toContain("handleWorkstateProposal(intent, 'analysis')")
    // The compile call site passes the parameter — no second literal 'workstate'
    // call site remains (grep precedent: the shared flow, not a fork).
    const compileCallSites = source.match(/compileWorkstateDraft\(\{[\s\S]{0,80}?adapter/g) ?? []
    expect(compileCallSites).toHaveLength(1)
  })
})

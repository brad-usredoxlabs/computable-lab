/**
 * QMS7-7 — the record-drafting INTENT rides the EXISTING compile→card→accept
 * flow with adapter 'record-drafting' (one constant, not a fork), mounted on
 * the universal panel (the /registry host renders the same RightPane →
 * AiTabPanel). Harness: AiTabPanel.analysis.test.tsx precedent (option-capturing
 * useChatThread mock + mocked apiClient store).
 *
 * Criteria pinned here (spec QMS7-7 matrix, "card lifecycle by contract"):
 *  - the panel wires onRecordDraftProposal ALONGSIDE onWorkstateProposal /
 *    onAnalysisProposal — one handleWorkstateProposal, one flow (source-pin);
 *  - a record_draft_proposal event alone renders NO accept control — only the
 *    "compiling…" slot — until the compile response arrives;
 *  - the compile call carries adapter:'record-drafting' + the intent verbatim
 *    (the ONLY flow delta vs workstate/analysis);
 *  - the compiled recordFields ride into the card: the ui-v1 LABELS with their
 *    values render in the review card (AC-1's "Title / Material Type fields
 *    populated");
 *  - canAccept:false → summary + diagnostics, NO accept control;
 *  - Accept posts exactly {draftId,revision,reviewHash} (adapter-blind
 *    identity triple), hands the FLAT body to applyAcceptedWorkstate, and
 *    issues ZERO /ai/assist/stream fetches;
 *  - Reject creates/moves nothing (zero apiClient calls).
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
    onRecordDraftProposal?: (intent: Record<string, unknown>) => void
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
  { id: 'registry', label: 'Renamed registry surface', path: '/registry', params: {}, objectTypes: [], selectableKinds: [] },
] as unknown as SurfaceSpec[]

vi.mock('./useChatThread', () => ({
  useChatThread: (options: {
    onAgentAction?: (action: unknown) => string | undefined
    onWorkstateProposal?: (intent: Record<string, unknown>) => void
    onAnalysisProposal?: (intent: Record<string, unknown>) => void
    onRecordDraftProposal?: (intent: Record<string, unknown>) => void
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

const RECORD_INTENT = {
  operation: 'compose-record',
  kind: 'training-material',
  fields: { title: 'Pipetting safety basics', materialType: 'slide_deck' },
}

const COMPILED_OK = {
  draftId: 'DRAFT-77',
  revision: 1,
  reviewHash: 'e'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    recordId: 'TRM-000001',
    summary: 'Proposed training-material draft "Pipetting safety basics" (TRM-000001) — review the fields; nothing is written until you accept.',
    // The ui-v1 projection vocabulary (labels from training-material.ui.yaml,
    // the select value rendered with the ui option label) — never TS literals.
    recordFields: [
      { label: 'Title', value: 'Pipetting safety basics' },
      { label: 'Material Type', value: 'Slide Deck' },
    ],
    sessionDocument: { version: 1, tabs: [{ kind: 'registry', title: 'Registry' }], activeTabId: 'registry' },
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
              tabs: [{ id: 't1', kind: 'registry' as const }],
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
  mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)
  mocks.acceptWorkstateDraft.mockReset()
  mocks.acceptWorkstateDraft.mockResolvedValue(FLAT_ACCEPT_BODY)
  mocks.getSession.mockReset()
  mocks.getSession.mockResolvedValue({ session: null })
  mocks.putSession.mockReset()
  mocks.putSession.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('AiTabPanel — record-drafting card (shared flow, adapter is the only delta)', () => {
  it('the mount wires onRecordDraftProposal alongside onWorkstateProposal and onAnalysisProposal (all present, one flow)', () => {
    renderPanel()
    expect(mocks.chatOptions?.onWorkstateProposal).toBeTypeOf('function')
    expect(mocks.chatOptions?.onAnalysisProposal).toBeTypeOf('function')
    expect(mocks.chatOptions?.onRecordDraftProposal).toBeTypeOf('function')
  })

  it('source-pin: the panel routes the record-draft proposal through the SAME handleWorkstateProposal (adapter is a parameter, not a fork)', () => {
    renderPanel()
    const source = readFileSync('src/event-editor/right-pane/ai/AiTabPanel.tsx', 'utf8')
    expect(source).toContain("handleWorkstateProposal(intent, 'record-drafting')")
    // Still ONE flow hook and ONE card component — no second proposal system.
    // (The JSX render site only: the file's prose mentions of the component
    // name are not render sites, so the pattern anchors on the JSX open tag.)
    expect(source.match(/useWorkstateProposalFlow\(\)/g)?.length).toBe(1)
    expect(source.match(/<WorkstateProposalCard\n/g)?.length).toBe(1)
  })

  it('a record_draft_proposal event alone renders the compiling slot — NO accept control until the compile answers', async () => {
    let resolveCompile: (v: unknown) => void = () => undefined
    mocks.compileWorkstateDraft.mockImplementationOnce(() => new Promise((resolve) => { resolveCompile = resolve }))
    renderPanel()
    await settlePushBaseline()

    act(() => {
      mocks.chatOptions!.onRecordDraftProposal!(RECORD_INTENT)
    })
    expect(screen.getByTestId('workstate-card-compiling')).toBeTruthy()
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()

    // The compile call carries the adapter constant + the intent VERBATIM.
    expect(mocks.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.compileWorkstateDraft).toHaveBeenCalledWith({ adapter: 'record-drafting', intent: RECORD_INTENT })

    await act(async () => { resolveCompile(COMPILED_OK) })
    expect(screen.getByTestId('workstate-card-accept')).toBeTruthy()
  })

  it('the compiled recordFields render on the review card with their ui-v1 labels and values (AC-1)', async () => {
    renderPanel()
    await settlePushBaseline()

    act(() => {
      mocks.chatOptions!.onRecordDraftProposal!(RECORD_INTENT)
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    const card = screen.getByTestId('workstate-card')
    expect(card.textContent).toContain('Title')
    expect(card.textContent).toContain('Pipetting safety basics')
    expect(card.textContent).toContain('Material Type')
    expect(card.textContent).toContain('Slide Deck')
    // The identity chrome is the compiled draft (adapter-blind).
    expect(card.textContent).toContain('DRAFT-77')
  })

  it('canAccept:false ⇒ summary + diagnostics and NO accept control (a blocked record proposal cannot be accepted)', async () => {
    mocks.compileWorkstateDraft.mockResolvedValueOnce({
      draftId: 'DRAFT-78',
      revision: 1,
      reviewHash: 'f'.repeat(64),
      canAccept: false,
      diagnostics: [{ code: 'DRAFT_INVALID', message: 'STAGED_CREATE_REJECTED /fields: the staged create was rejected by the schema/lint gate. Nothing was written.' }],
      result: {},
    })
    renderPanel()
    await settlePushBaseline()

    act(() => {
      mocks.chatOptions!.onRecordDraftProposal!(RECORD_INTENT)
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    const card = screen.getByTestId('workstate-card')
    expect(card.textContent).toContain('schema/lint gate')
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
    expect(screen.getByTestId('workstate-card-reject')).toBeTruthy()
  })

  it('Accept posts the identity triple ONLY, hands the FLAT body to the executor, and issues ZERO stream fetches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderPanel()
    await settlePushBaseline()

    act(() => {
      mocks.chatOptions!.onRecordDraftProposal!(RECORD_INTENT)
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    fireEvent.click(screen.getByTestId('workstate-card-accept'))
    await act(async () => { vi.advanceTimersByTime(10) })

    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledWith({
      draftId: 'DRAFT-77',
      revision: 1,
      reviewHash: 'e'.repeat(64),
    })
    expect(mocks.applyAcceptedWorkstate).toHaveBeenCalledTimes(1)
    expect(mocks.applyAcceptedWorkstate.mock.calls[0]?.[0]).toEqual(FLAT_ACCEPT_BODY)
    // ZERO AI calls during accept, ever.
    const assistCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('assist'))
    expect(assistCalls).toHaveLength(0)
    // Spent card: controls disappear.
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
  })

  it('Reject creates/moves nothing: zero apiClient calls beyond the compile, card gone', async () => {
    renderPanel()
    await settlePushBaseline()

    act(() => {
      mocks.chatOptions!.onRecordDraftProposal!(RECORD_INTENT)
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    fireEvent.click(screen.getByTestId('workstate-card-reject'))
    await act(async () => { vi.advanceTimersByTime(10) })

    expect(screen.queryByTestId('workstate-card')).toBeNull()
    expect(mocks.acceptWorkstateDraft).not.toHaveBeenCalled()
  })
})

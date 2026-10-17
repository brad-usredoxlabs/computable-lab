/**
 * QMS7-7 FIX1 (adv-review D3, spec Design item 5(a) / reviewer-bait 3) —
 * the SILENT-RETARGET component pin.
 *
 * The spec names it: "pin with a component test copying the RecordRegistryPage
 * :165-176 activeTab-keyed-reset pattern: switching tabs with a pending card
 * either preserves the card verbatim or clears it via the activeTab-keyed
 * reset; it must NEVER re-target silently."
 *
 * The diff previously carried only the SERVER-side 409-path pin
 * (useWorkstateProposalFlow.test.tsx 'silent-retarget guard'). This file is
 * the missing COMPONENT pin: a pending record-draft proposal card on the
 * universal panel must survive a workspace tab switch VERBATIM — same draft
 * identity chrome, same summary, same compiled recordFields, same landing
 * tabs — with ZERO new compiles and ZERO accepts. The card never re-targets
 * itself to the newly active tab; the only sanctioned ways a pending proposal
 * changes are the user's own Reject/Accept or a superseding proposal through
 * the existing compileSeqRef/pendingDraftRef path (zero new state).
 *
 * Harness: AiTabPanel.recordDraft.test.tsx precedent (option-capturing
 * useChatThread mock + mocked apiClient store) + a WorkspaceProbe that
 * captures the provider's own activateTab — the same tab-switch machinery the
 * registry strip uses (WorkspaceContext.activateTab → reducer 'activate-tab').
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useWorkspace, WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'
import { OpenTabsProvider } from '../../../shared/shell/OpenTabsContext'
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
  workspace: { current: null as ReturnType<typeof useWorkspace> | null },
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
    recordFields: [
      { label: 'Title', value: 'Pipetting safety basics' },
      { label: 'Material Type', value: 'Slide Deck' },
    ],
    sessionDocument: { version: 1, tabs: [{ kind: 'registry', title: 'Registry' }], activeTabId: 'registry' },
  },
}

/** Captures the provider's own context (activateTab = the strip's tab-switch
 *  machinery, the same dispatch the registry page's tabs use). */
function WorkspaceProbe() {
  mocks.workspace.current = useWorkspace()
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
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: {
              ...base,
              tabs: [
                { id: 'registry', kind: 'registry' as const, title: 'Registry' },
                { id: 'details:STU-000001', kind: 'project-details' as const, title: 'Project details' },
              ],
              activeTabId: 'registry',
            } as ReturnType<typeof defaultWorkspaceState>,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <WorkspaceProbe />
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
  mocks.workspace.current = null
  mocks.executeTier1.mockReset()
  mocks.executeTier1.mockReturnValue({ ok: true, kind: 'focused', diagnostics: [] })
  mocks.applyAcceptedWorkstate.mockReset()
  mocks.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
  mocks.compileWorkstateDraft.mockReset()
  mocks.compileWorkstateDraft.mockResolvedValue(COMPILED_OK)
  mocks.acceptWorkstateDraft.mockReset()
  mocks.acceptWorkstateDraft.mockResolvedValue(COMPILED_OK.result)
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

describe('AiTabPanel — record-draft pending card vs workspace tab switch (QMS7-7 silent-retarget pin)', () => {
  it('a tab switch PRESERVES the pending record-draft card VERBATIM — same identity, summary, fields, landing tabs — and fires ZERO new compiles or accepts', async () => {
    renderPanel()
    await settlePushBaseline()

    act(() => {
      mocks.chatOptions!.onRecordDraftProposal!(RECORD_INTENT)
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    const cardBefore = screen.getByTestId('workstate-card')
    const textBefore = cardBefore.textContent
    expect(textBefore).toContain('DRAFT-77')
    expect(textBefore).toContain('Pipetting safety basics')
    expect(textBefore).toContain('Slide Deck')
    expect(mocks.compileWorkstateDraft).toHaveBeenCalledTimes(1)

    // The tab switch: the provider's own activateTab (reducer 'activate-tab')
    // — the same machinery the registry strip uses.
    const ws = mocks.workspace.current
    expect(ws).not.toBeNull()
    act(() => {
      ws!.activateTab('details:STU-000001')
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    // The active tab really changed (the switch is real, not a no-op render).
    expect(mocks.workspace.current!.state.activeTabId).toBe('details:STU-000001')

    // The card is PRESERVED VERBATIM: same DOM node, same text — identity
    // chrome, summary, recordFields and landing tabs unchanged. It did NOT
    // re-target to the newly active tab and it was not silently dropped.
    const cardAfter = screen.getByTestId('workstate-card')
    expect(cardAfter).toBe(cardBefore)
    expect(cardAfter.textContent).toBe(textBefore)
    expect(cardAfter.textContent).toContain('DRAFT-77')
    expect(screen.getByTestId('workstate-card-record-fields').textContent).toContain('Slide Deck')

    // Preserved means UNTOUCHED: no re-compile, no accept, no executor call.
    expect(mocks.compileWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.acceptWorkstateDraft).not.toHaveBeenCalled()
    expect(mocks.applyAcceptedWorkstate).not.toHaveBeenCalled()
  })

  it('the preserved card keeps its Accept/Reject controls bound to the ORIGINAL compiled draft identity (accept posts the same triple after the tab switch)', async () => {
    renderPanel()
    await settlePushBaseline()

    act(() => {
      mocks.chatOptions!.onRecordDraftProposal!(RECORD_INTENT)
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    const ws = mocks.workspace.current
    act(() => {
      ws!.activateTab('details:STU-000001')
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    // The controls survived the switch and still target the compiled draft.
    fireEvent.click(screen.getByTestId('workstate-card-accept'))
    await act(async () => { vi.advanceTimersByTime(10) })
    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.acceptWorkstateDraft).toHaveBeenCalledWith({
      draftId: 'DRAFT-77',
      revision: 1,
      reviewHash: 'e'.repeat(64),
    })
  })

  it("a tab switch never re-targets the card's landing tabs: the compiled sessionDocument tabs render unchanged (registry landing, not the newly active tab)", async () => {
    renderPanel()
    await settlePushBaseline()

    act(() => {
      mocks.chatOptions!.onRecordDraftProposal!(RECORD_INTENT)
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    const tabsList = screen.getByText('Registry')
    expect(tabsList).toBeTruthy()

    const ws = mocks.workspace.current
    act(() => {
      ws!.activateTab('details:STU-000001')
    })
    await act(async () => { vi.advanceTimersByTime(10) })

    // The card's landing tab is still the compiled registry landing — the
    // card did NOT adopt the newly active tab as its target.
    expect(screen.getByTestId('workstate-card').textContent).toContain('Registry')
    expect(mocks.compileWorkstateDraft).toHaveBeenCalledTimes(1)
  })
})

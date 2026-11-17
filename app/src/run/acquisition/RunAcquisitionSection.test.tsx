// @vitest-environment jsdom
/**
 * L2-RUN-ACQUISITION-SECTION-1 (unit u1acqdoor) — RED/GREEN pin for the
 * RUN-OWNED acquisition section + the toolbar "Data" affordance.
 *
 * The run is the provenance record (RUN-IS-THE-PROVENANCE-RECORD, BRAD 2026-11-14):
 * an acquisition attaches to the RUN, not to an instrument-sequence accident.
 * This unit gives the run surface its OWN always-present data door:
 *   - the section mounts on EVERY kind-'run' record (never gated on a
 *     sequence probe — the GcRunSheetSection gating defect is NOT recreated),
 *   - its empty state says nothing is attached yet and offers the attach
 *     affordance (the run-scoped register body names the run via sourceRunRef
 *     + eventGraphRef + assayType — the door's run-scoped path; a run with no
 *     sequence still attaches),
 *   - the toolbar's "Data" affordance opens THIS section on the SAME route
 *     (the URL never leaves /runs/<id>; the legacy /runs/<id>/editor/results
 *     LINK is removed — the ROUTE itself is retired later by
 *     L2-LEGACY-EDITOR-RETIREMENT-1).
 *
 * Mocked heavy: the deck providers + the shell + the GC companion (pinned to
 * a marker so its OWN sequence probe never counts — the acquisition section
 * is the only listRecordsByKind caller). The page's OWN getRecordWithUI +
 * the section's listRecordsByKind('acquisition-package') stay real (mocked
 * at the client seam).
 *
 * Mock specifiers resolve relative to THIS file (app/src/run/acquisition/):
 * the run/ components are ../, everything under src/{graph,event-editor,
 * agent,shared} is ../../.
 *
 * RED on base: the section component + the "Data" affordance do not exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const { mocks, mockUseParams } = vi.hoisted(() => ({
  mocks: {
    getRecordWithUI: vi.fn(),
    listRecordsByKind: vi.fn(),
    registerAcquisitionPackage: vi.fn(),
    getConfig: vi.fn(),
    buildPlanGraph: vi.fn(),
  },
  mockUseParams: vi.fn(),
}))

// Partial mock: override useParams with a controllable mock, keep everything else real.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-router-dom')
  return { ...actual, useParams: mockUseParams }
})

// The deck stack + shell are OUT of scope: mock the heavy providers to inert
// elements (the page's OWN getRecordWithUI stays real — that is the
// kind/methodEventGraphId input).
vi.mock('../RunWorkspaceShell', () => ({
  RunWorkspaceShell: ({
    children,
    viewerToolbar,
  }: {
    children: React.ReactNode
    viewerToolbar?: React.ReactNode
  }) => (
    <div data-testid="rwp-shell">
      <div data-testid="rwp-toolbar">{viewerToolbar}</div>
      {children}
    </div>
  ),
}))
vi.mock('../lib/mode-toggle', () => ({
  useModeToggle: () => ({ mode: 'plan', setMode: vi.fn() }),
  ModeToggle: () => <span data-testid="rwp-mode-toggle">plan</span>,
}))
vi.mock('../../graph/execution/ExecutionView', () => ({
  ExecutionView: () => <div data-testid="rwp-execution-view">execution</div>,
}))
vi.mock('../../event-editor/viewer/deck/DeckViewer', () => ({
  DeckViewer: () => <div data-testid="rwp-deck-viewer">deck</div>,
}))
vi.mock('../../event-editor/viewer/deck/DeckToolbar', () => ({
  DeckToolbar: () => <span data-testid="rwp-deck-toolbar">deck-toolbar</span>,
}))
vi.mock('../../event-editor/EventEditorContext', () => ({
  EventEditorProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rwp-event-editor">{children}</div>
  ),
}))
vi.mock('../../event-editor/workspace/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rwp-workspace">{children}</div>
  ),
}))
vi.mock('../../agent/HarnessChatPane', () => ({
  HarnessChatPane: () => <div data-testid="rwp-chat">chat</div>,
}))
vi.mock('../RunNavPane', () => ({
  RunNavPane: () => <div data-testid="rwp-nav">nav</div>,
}))
vi.mock('../RunProtocolStepsLoader', () => ({
  RunProtocolStepsLoader: () => null,
}))
vi.mock('../RunProtocolList', () => ({
  RunProtocolList: () => null,
}))
vi.mock('../RunPlanGraphBuild', () => ({
  RunPlanGraphBuild: () => null,
}))
// The GC companion: pinned to a marker so its OWN sequence probe never
// counts. The acquisition section is the ONLY listRecordsByKind caller here.
vi.mock('../gc/GcRunSheetSection', () => ({
  GcRunSheetSection: () => <div data-testid="gc-run-sheet">gc-companion</div>,
}))
// The universal-chat machinery (DeckChatSlice + SurfaceChatBridge) reads the
// event editor + the chat registry — out of scope for the data-door test. Stub
// to inert (the gc-section lock uses the same posture: it never asserts on the
// chat). The page's OWN getRecordWithUI + the section's listRecordsByKind stay
// real (mocked at the client seam).
vi.mock('../../event-editor/deck/DeckChatSlice', () => ({
  DeckChatSlice: () => null,
}))
vi.mock('../../shared/shell/SurfaceChatBridge', () => ({
  SurfaceChatBridge: () => null,
}))
vi.mock('../../agent/ChatFocusContext', () => ({
  ChatFocusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../../event-editor/protocol/ProtocolSelectionContext', () => ({
  ProtocolSelectionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rwp-protocol">{children}</div>
  ),
}))
vi.mock('../../event-editor/protocol/ProtocolPreviewBridge', () => ({
  ProtocolPreviewBridge: () => null,
}))
vi.mock('../../event-editor/focus/FocusModalsProvider', () => ({
  FocusModalsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rwp-focus">{children}</div>
  ),
}))
// The universal-chat machinery (the ONE registrar + the deck slice publisher
// + the working-focus carrier) is OUT of scope for the data-door test: stub it
// to inert so the page's chat never does real work (the gc-section lock uses
// the same posture — it never asserts on the chat). The page's OWN
// getRecordWithUI + the section's listRecordsByKind stay real.
vi.mock('../../event-editor/deck/DeckChatSlice', () => ({
  DeckChatSlice: () => null,
}))
vi.mock('../../shared/shell/SurfaceChatBridge', () => ({
  SurfaceChatBridge: () => null,
}))
vi.mock('../../agent/ChatFocusContext', () => ({
  ChatFocusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../RoleBindingProposalsPanel', () => ({
  RoleBindingProposalsPanel: () => null,
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecordWithUI: mocks.getRecordWithUI,
    listRecordsByKind: mocks.listRecordsByKind,
    registerAcquisitionPackage: mocks.registerAcquisitionPackage,
    getConfig: mocks.getConfig,
    getRecord: vi.fn(),
    buildPlanGraph: mocks.buildPlanGraph,
    getAnalysisRun: vi.fn(),
    getPackageAnalysisInputs: vi.fn(),
    createAnalysisRun: vi.fn(),
    executeAnalysisRun: vi.fn(),
    updateRecord: vi.fn(),
    getRoleBindingProposals: vi.fn(),
    getProtocolContext: vi.fn(async () => null),
    getSurfaces: vi.fn(async () => []),
  },
  api: {
    workspace: { get: vi.fn(async () => null) },
    ai: { health: vi.fn(async () => ({ ok: false })) },
  },
  ApiError: class extends Error {},
  AcquisitionPackageClientError: class {},
}))

// The page module is imported DYNAMICALLY so the RED commit is type-clean
// (no static import of a not-yet-written module); it is present at GREEN.
const { RunWorkspacePage } = await import('../RunWorkspacePage')

const RUN_ID = 'RUN-ACQ-PAGE-1'
const EG_ID = 'EG-ACQ-PAGE-1'

function runEnvelope(payload: Record<string, unknown>) {
  return { record: { recordId: RUN_ID, schemaId: 'run', payload }, uiSpec: null, schema: null }
}

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="location-probe">{loc.pathname}</span>
}

function renderPage(runId: string = RUN_ID, listFixture: { records: unknown[]; total: number } = { records: [], total: 0 }) {
  mockUseParams.mockReturnValue({ runId })
  mocks.getRecordWithUI.mockResolvedValue(
    runEnvelope({ kind: 'run', studyId: 'STU-1', methodEventGraphId: EG_ID, title: 'Acq run' }),
  )
  // The section's ONE listRecordsByKind('acquisition-package') reads THIS fixture
  // (the default is the zero-package door; a test may pass attached packages).
  mocks.listRecordsByKind.mockResolvedValue(listFixture)
  mocks.registerAcquisitionPackage.mockReset()
  mocks.getConfig.mockResolvedValue({ storageDevices: [{ id: 'dev-1', label: 'NAS device', default: true }] })
  return render(
    <MemoryRouter initialEntries={[`/runs/${runId}`]}>
      <Routes>
        <Route path="/runs/:runId" element={<RunWorkspacePage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

function acquisitionSection() {
  return document.getElementById('run-acquisition')
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockUseParams.mockReset()
  mocks.listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
  mocks.getRecordWithUI.mockReset()
  mocks.registerAcquisitionPackage.mockReset()
  mocks.getConfig.mockResolvedValue({ storageDevices: [{ id: 'dev-1', label: 'NAS device', default: true }] })
})

describe('u1acqdoor — the run-owned acquisition section + the toolbar Data affordance', () => {
  it('(a) on a kind-run record with ZERO linked packages: the section + empty state + attach affordance render (the data door is always present)', async () => {
    renderPage()
    const section = (await screen.findByTestId('run-acquisition-section')) as HTMLElement
    // The section is the ONE always-present door (not gated on a sequence
    // probe): it fired its own single listRecordsByKind('acquisition-package').
    expect(section).toBeTruthy()
    expect(section.id).toBe('run-acquisition')
    expect(await screen.findByTestId('run-acquisition-empty')).toBeTruthy()
    expect(
      screen.getByText('No instrument data attached to this run yet'),
    ).toBeTruthy()
    expect(screen.getByTestId('run-acquisition-attach')).toBeTruthy()
    // The ONLY acquisition read is the existing records API (no second store,
    // no new read method — the GC companion is pinned to a marker here).
    await waitFor(() => {
      expect(mocks.listRecordsByKind).toHaveBeenCalledWith('acquisition-package', 1000)
    })
  })

  it('(b1) clicking the attach affordance opens the run-scoped form (device + .D directory + Register)', async () => {
    renderPage()
    await screen.findByTestId('run-acquisition-attach')
    fireEvent.click(screen.getByTestId('run-acquisition-attach'))
    expect(await screen.findByTestId('run-acquisition-attach-form')).toBeTruthy()
    expect(screen.getByTestId('run-acquisition-attach-device')).toBeTruthy()
    expect(screen.getByTestId('run-acquisition-attach-directory')).toBeTruthy()
    expect(screen.getByTestId('run-acquisition-attach-register')).toBeTruthy()
  })

  it('(b2) the run-scoped register body names the RUN (sourceRunRef) + the run method graph (eventGraphRef) + assayType — the door run-scoped path (a run with no sequence still attaches)', async () => {
    renderPage()
    await screen.findByTestId('run-acquisition-attach')
    fireEvent.click(screen.getByTestId('run-acquisition-attach'))
    await screen.findByTestId('run-acquisition-attach-form')
    fireEvent.change(screen.getByTestId('run-acquisition-attach-directory'), {
      target: { value: 'machine1/RES1.D' },
    })
    // u2fix: the assay starts UNSELECTED — an explicit choice is required.
    fireEvent.change(screen.getByTestId('run-acquisition-attach-assay'), {
      target: { value: 'gc_ms' },
    })
    mocks.registerAcquisitionPackage.mockResolvedValue({
      packageRecordId: 'ACQP-NEW-1',
      packagePayload: {},
      entryRecordId: '',
    })
    fireEvent.click(screen.getByTestId('run-acquisition-attach-register'))
    await waitFor(() => {
      expect(mocks.registerAcquisitionPackage).toHaveBeenCalledTimes(1)
    })
    const body = mocks.registerAcquisitionPackage.mock.calls[0][0] as Record<string, unknown>
    expect(body.deviceId).toBe('dev-1')
    expect(body.directoryKey).toBe('machine1/RES1.D')
    expect(body.sourceRunRef).toEqual({ kind: 'record', id: RUN_ID, type: 'run' })
    expect(body.eventGraphRef).toEqual({ kind: 'record', id: EG_ID, type: 'event-graph' })
    expect(body.assayType).toBe('gc_ms')
    expect(body.entryRef).toBeUndefined()
    expect(body.materialRef).toBeUndefined()
  })

  it('(c) the non-empty list renders each attached package (record id + device/directory + created) with no invented chrome', async () => {
    const fixture = {
      records: [
        {
          recordId: 'ACQP-1',
          schemaId: 'acq',
          payload: {
            kind: 'acquisition-package',
            title: 'pkg1',
            sourceRunRef: { kind: 'record', id: RUN_ID, type: 'run' },
            storageDeviceId: 'dev-a',
            directoryKey: 'machine1/RES1.D',
            registeredAt: '2026-11-15T10:00:00.000Z',
          },
        },
        {
          recordId: 'ACQP-2',
          schemaId: 'acq',
          payload: {
            kind: 'acquisition-package',
            title: 'pkg2',
            sourceRunRef: { kind: 'record', id: RUN_ID, type: 'run' },
            storageDeviceId: 'dev-b',
            directoryKey: 'machine2/RES2.D',
            registeredAt: '2026-11-16T11:00:00.000Z',
          },
        },
        // A package naming a DIFFERENT run must NOT appear (the filter is
        // sourceRunRef.id === this run).
        {
          recordId: 'ACQP-OTHER',
          schemaId: 'acq',
          payload: {
            kind: 'acquisition-package',
            title: 'other-run pkg',
            sourceRunRef: { kind: 'record', id: 'RUN-OTHER-9', type: 'run' },
            storageDeviceId: 'dev-c',
            directoryKey: 'machine3/RES9.D',
            registeredAt: '2026-11-16T12:00:00.000Z',
          },
        },
      ],
      total: 3,
    }
    renderPage(RUN_ID, fixture)
    // Wait for the LIST to render (the section mounts in the loading state —
    // showing the empty state — before listRecordsByKind resolves; only once the
    // packages arrive does the empty state clear and the list appear).
    const section = await screen.findByText('ACQP-1')
    expect(screen.queryByTestId('run-acquisition-empty')).toBeNull()
    expect(screen.getByText('ACQP-1').closest('section')?.getAttribute('data-testid')).toBe('run-acquisition-section')
    expect(section.closest('section')!.textContent).toContain('ACQP-2')
    // The other run's package is filtered OUT (sourceRunRef names a different run).
    expect(section.closest('section')!.textContent).not.toContain('ACQP-OTHER')
    expect(section.closest('section')!.textContent).toContain('dev-a')
    expect(section.closest('section')!.textContent).toContain('machine1/RES1.D')
    expect(section.closest('section')!.textContent).toContain('dev-b')
    expect(section.closest('section')!.textContent).toContain('machine2/RES2.D')
    // The created timestamps (the package records carry registeredAt).
    expect(section.closest('section')!.textContent).toContain('2026-11-15T10:00:00.000Z')
    expect(section.closest('section')!.textContent).toContain('2026-11-16T11:00:00.000Z')
    // u2fix (defect 1, decision rule 4 "one run, many instruments"): a run that
    // ALREADY has attached packages still shows the attach control — the
    // second readout is reachable on the non-empty list.
    const attachBtn = screen.getByTestId('run-acquisition-attach')
    expect(attachBtn).toBeTruthy()
    fireEvent.click(attachBtn)
    const form = await screen.findByTestId('run-acquisition-attach-form')
    expect(form).toBeTruthy()
    fireEvent.change(screen.getByTestId('run-acquisition-attach-directory'), {
      target: { value: 'machine2/RES2.D' },
    })
    fireEvent.change(screen.getByTestId('run-acquisition-attach-assay'), {
      target: { value: 'gc_fid' },
    })
    mocks.registerAcquisitionPackage.mockResolvedValue({
      packageRecordId: 'ACQP-NEW-2',
      packagePayload: {},
      entryRecordId: '',
    })
    fireEvent.click(screen.getByTestId('run-acquisition-attach-register'))
    // A SECOND register call through the SAME run-scoped write (one method).
    await waitFor(() => {
      expect(mocks.registerAcquisitionPackage).toHaveBeenCalledTimes(1)
    })
    const second = mocks.registerAcquisitionPackage.mock.calls[0][0] as Record<string, unknown>
    expect(second.deviceId).toBe('dev-1')
    expect(second.directoryKey).toBe('machine2/RES2.D')
    expect(second.sourceRunRef).toEqual({ kind: 'record', id: RUN_ID, type: 'run' })
    expect(second.eventGraphRef).toEqual({ kind: 'record', id: EG_ID, type: 'event-graph' })
    expect(second.assayType).toBe('gc_fid')
  })

  it('(b3) u2fix: register WITHOUT selecting an assay is refused — no register call, visible error; after selecting it registers', async () => {
    renderPage()
    await screen.findByTestId('run-acquisition-attach')
    fireEvent.click(screen.getByTestId('run-acquisition-attach'))
    await screen.findByTestId('run-acquisition-attach-form')
    fireEvent.change(screen.getByTestId('run-acquisition-attach-directory'), {
      target: { value: 'machine1/RES1.D' },
    })
    // The assay select starts UNSELECTED (empty value + a disabled placeholder
    // option) — the user never touches it.
    const assaySelect = screen.getByTestId('run-acquisition-attach-assay') as HTMLSelectElement
    expect(assaySelect.value).toBe('')
    fireEvent.click(screen.getByTestId('run-acquisition-attach-register'))
    await screen.findByTestId('run-acquisition-attach-error')
    expect(screen.getByTestId('run-acquisition-attach-error').textContent).toBeTruthy()
    // Refused: NO register call fired.
    expect(mocks.registerAcquisitionPackage).not.toHaveBeenCalled()
    // After selecting an assay, the same form registers.
    fireEvent.change(assaySelect, { target: { value: 'qpcr' } })
    mocks.registerAcquisitionPackage.mockResolvedValue({
      packageRecordId: 'ACQP-NEW-3',
      packagePayload: {},
      entryRecordId: '',
    })
    fireEvent.click(screen.getByTestId('run-acquisition-attach-register'))
    await waitFor(() => {
      expect(mocks.registerAcquisitionPackage).toHaveBeenCalledTimes(1)
    })
    const body = mocks.registerAcquisitionPackage.mock.calls[0][0] as Record<string, unknown>
    expect(body.assayType).toBe('qpcr')
    expect(body.sourceRunRef).toEqual({ kind: 'record', id: RUN_ID, type: 'run' })
  })

  it('(d) the toolbar Data affordance opens the section on the SAME route (no navigation away from /runs/<id>)', async () => {
    renderPage()
    await screen.findByTestId('run-acquisition-section')
    const before = screen.getByTestId('location-probe').textContent
    expect(before).toBe(`/runs/${RUN_ID}`)
    // No legacy link into the editor results route survives on the run surface.
    expect(screen.queryByTestId('run-toolbar-legacy-results-link')).toBeNull()
    fireEvent.click(screen.getByTestId('run-toolbar-data'))
    // The affordance lands in the section on the SAME route: the section gains
    // focus (via requestAnimationFrame) and the URL stays /runs/<id> (a ?section
    // param may be appended, but the PATH never leaves the run surface).
    const section = await screen.findByTestId('run-acquisition-section')
    await waitFor(() => {
      expect(document.activeElement).toBe(section)
    })
    const after = screen.getByTestId('location-probe').textContent
    expect(after).toBe(before)
    expect(after).toBe(`/runs/${RUN_ID}`)
  })

  it('(e) a non-\'run\' kind names its kind and renders NO acquisition section / attach affordance', async () => {
    mockUseParams.mockReturnValue({ runId: 'ANLR-1' })
    mocks.getRecordWithUI.mockResolvedValue({
      record: { recordId: 'ANLR-1', schemaId: 'analysis-run', payload: { kind: 'analysis-run', studyId: 'STU-1', title: 'an analysis run' } },
      uiSpec: null,
      schema: null,
    })
    render(
      <MemoryRouter initialEntries={['/runs/ANLR-1']}>
        <Routes>
          <Route path="/runs/:runId" element={<RunWorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByTestId('rwp-shell')
    // The kind it resolved is named (one-line label).
    expect(screen.queryByText(/analysis-run/)).toBeTruthy()
    // NO acquisition section, empty state, or attach affordance.
    expect(acquisitionSection()).toBeNull()
    expect(screen.queryByTestId('run-acquisition-section')).toBeNull()
    expect(screen.queryByTestId('run-acquisition-empty')).toBeNull()
    expect(screen.queryByTestId('run-acquisition-attach')).toBeNull()
    // u2fix (defect 2): the toolbar Data affordance is gated on runKind ===
    // 'run' — a non-'run' record shows NO Data button (and no acquisition
    // section).
    expect(screen.queryByTestId('run-toolbar-data')).toBeNull()
  })

  it('(f) an unresolvable id (404) preserves current not-found behaviour: shell renders, NO section, NO guessed kind label', async () => {
    mockUseParams.mockReturnValue({ runId: 'RUN-GONE-1' })
    mocks.getRecordWithUI.mockRejectedValue(new Error('404: not found'))
    mocks.listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    render(
      <MemoryRouter initialEntries={['/runs/RUN-GONE-1']}>
        <Routes>
          <Route path="/runs/:runId" element={<RunWorkspacePage />} />
        </Routes>
      </MemoryRouter>,
    )
    // The page falls back to the scratch study and renders the shell
    // (the current not-found behaviour — unchanged by this unit).
    await screen.findByTestId('rwp-shell')
    // The kind is UNRESOLVED (null) — no section, and no guessed kind label.
    expect(screen.queryByTestId('run-acquisition-section')).toBeNull()
    expect(screen.queryByTestId('run-acquisition-attach')).toBeNull()
    expect(screen.queryByTestId('run-kind-label')).toBeNull()
  })
})

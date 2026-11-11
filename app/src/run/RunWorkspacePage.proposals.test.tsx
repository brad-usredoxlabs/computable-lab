/**
 * L2-SUBPROTO-EXPAND-1 (unit f4plr) — RED/GREEN pin for the role-binding proposals
 * panel on RunWorkspacePage. The panel must receive the resolved planned-run id,
 * not the raw run id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from '../shared/api/errors'
import { AiPanelProvider } from '../shared/context/AiPanelContext'
import { ThemeProvider } from '../shared/shell/useTheme'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { RunWorkspacePage } from './RunWorkspacePage'

const mocks = vi.hoisted(() => ({
  getRecordWithUI: vi.fn(),
  getRoleBindingProposals: vi.fn(),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(async () => ({ payload: { studyId: 'STU-1', methodEventGraphId: 'EG-1', title: 'Run' } })),
    getRecordWithUI: mocks.getRecordWithUI,
    getRoleBindingProposals: mocks.getRoleBindingProposals,
    workspace: { get: vi.fn(async () => null) },
    ai: { health: vi.fn(async () => ({ ok: false })) },
    getSurfaces: vi.fn(async () => []),
    getProtocolContext: vi.fn(async () => null),
    buildPlanGraph: vi.fn(),
    listRecordsByKind: vi.fn(async () => ({ records: [], total: 0 })),
    listAnalysisRevisions: vi.fn(async () => ({ revisions: [], total: 0 })),
  },
  api: { workspace: { get: vi.fn(async () => null) }, ai: { health: vi.fn(async () => ({ ok: false })) } },
  ApiError: class extends Error {},
}))

vi.mock('../event-editor/workspace/WorkspaceContext', () => {
  const value = {
    state: { studyId: 'STU-1' }, ready: true, error: null,
    openTab: vi.fn(), closeTab: vi.fn(), activateTab: vi.fn(), renameTab: vi.fn(),
    bindDeckTab: vi.fn(), setRightPaneMode: vi.fn(), setRightPaneCollapsed: vi.fn(),
    setPaneWidths: vi.fn(), reload: vi.fn(async () => {}),
  }
  return {
    WorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useWorkspace: () => value, useOptionalWorkspace: () => value,
  }
})

vi.mock('../event-editor/EventEditorContext', () => ({
  EventEditorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useEventEditor: () => ({
    state: {
      eventGraphId: 'EG-1', title: 'EG-1', runId: 'RUN-1', platforms: [],
      selections: [], selection: null, runDeck: null,
      history: { past: [], future: [] },
      tipState: { kind: 'empty' }, labwares: {}, equipments: {},
      focusPlacementId: null, placements: [], events: [],
      preview: null, previewEvents: [], previewPlacements: [],
      previewLabwares: [], previewRevision: null, reviewState: null,
    },
    actions: {
      setPreview: vi.fn(), commitPreview: vi.fn(), clearPreview: vi.fn(),
      applyPreviewLabware: vi.fn(), applyPreviewPlacement: vi.fn(),
      dropPreviewEvent: vi.fn(), discardPreviewLabware: vi.fn(),
      discardPreviewPlacement: vi.fn(), setReviewState: vi.fn(),
      setReviewEventIds: vi.fn(), setDraftRevision: vi.fn(),
    },
    draftEvents: [], draftPlacements: [],
  }),
  useOptionalEventEditor: () => null,
  isDeckSetupLocked: () => false,
}))

vi.mock('../event-editor/protocol/ProtocolPreviewBridge', () => ({ ProtocolPreviewBridge: () => null }))
vi.mock('../event-editor/focus/FocusModalsProvider', () => ({
  FocusModalsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

vi.mock('../shared/api/aiThreadClient', () => ({
  listThreads: vi.fn(async () => []),
  createThread: vi.fn(async () => ({ id: 't1' })),
  getThread: vi.fn(async () => ({ id: 't1' })),
  listMessages: vi.fn(async () => []),
  streamMessage: vi.fn(async function* () {}),
  cancelMessage: vi.fn(async () => {}),
  appendThreadMessage: vi.fn(async () => {}),
  deleteThread: vi.fn(async () => {}),
  renameThread: vi.fn(async () => {}),
  setThreadPinned: vi.fn(async () => {}),
}))

vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(async function* () {}),
  getAiHealth: vi.fn(async () => ({ available: true })),
}))

vi.mock('../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null, proposeWorkstate: vi.fn(), acceptWorkstate: vi.fn(),
    rejectWorkstate: vi.fn(), handleAgentAction: vi.fn(),
  }),
}))

vi.mock('../event-editor/eventGraphPersistence', () => ({
  persistAcceptedEventGraph: vi.fn(async () => ({ eventGraphId: 'EG-1' })),
}))

const fourRoleProjection = {
  protocols: [{
    protocolId: 'PROTO-1',
    roles: [
      { roleId: 'source', roleKind: 'labware' as const, state: 'proposed' as const, candidates: [{ recordId: 'LW-1', recordKind: 'labware', label: 'Plate' }], bound: undefined, reason: undefined },
      { roleId: 'reagent', roleKind: 'material' as const, state: 'proposed' as const, candidates: [{ recordId: 'MAT-1', recordKind: 'material', label: 'Reagent' }], bound: undefined, reason: undefined },
      { roleId: 'enzyme', roleKind: 'material' as const, state: 'proposed' as const, candidates: [{ recordId: 'MAT-2', recordKind: 'material', label: 'Enzyme' }], bound: undefined, reason: undefined },
      { roleId: 'detector', roleKind: 'material' as const, state: 'proposed' as const, candidates: [{ recordId: 'MAT-3', recordKind: 'material', label: 'Detector' }], bound: undefined, reason: undefined },
    ],
  }],
}

function notPlannedRunError() {
  return new ApiError({ status: 400, code: 'HTTP_400', message: "NOT_A_PLANNED_RUN: Record 'RUN-1' is not a planned-run" })
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })
beforeEach(() => { mocks.getRecordWithUI.mockReset(); mocks.getRoleBindingProposals.mockReset() })

function mountPage(runId: string) {
  return render(
    <MemoryRouter initialEntries={[`/runs/${runId}`]}>
      <OpenTabsProvider>
        <Routes>
          <Route path="/runs/:runId" element={
            <ThemeProvider>
              <AiPanelProvider>
                <RunWorkspacePage />
              </AiPanelProvider>
            </ThemeProvider>
          } />
        </Routes>
      </OpenTabsProvider>
    </MemoryRouter>,
  )
}

describe('RunWorkspacePage — role-binding proposals panel (f4plr)', () => {
  it('(1) run with plannedRunRef → panel called with PLR-1, renders proposals', async () => {
    mocks.getRecordWithUI.mockResolvedValue({
      record: { recordId: 'RUN-1', schemaId: 'run', payload: { kind: 'run', studyId: 'STU-1', methodEventGraphId: 'EG-1', title: 'Test Run', plannedRunRef: { id: 'PLR-1' } } },
      uiSpec: null, schema: null,
    })
    mocks.getRoleBindingProposals.mockImplementation(async (id: string) => {
      if (id === 'PLR-1') return fourRoleProjection
      throw notPlannedRunError()
    })

    mountPage('RUN-1')

    await waitFor(() => {
      expect(mocks.getRoleBindingProposals).toHaveBeenLastCalledWith('PLR-1')
    }, { timeout: 3000 })

    await waitFor(() => {
      expect(screen.queryByTestId('role-binding-proposals')).not.toBeNull()
    }, { timeout: 3000 })

    expect(mocks.getRoleBindingProposals).toHaveBeenCalledTimes(1)
  })

  it('(2) self-PLR: kind is "planned-run" → panel called with the runId itself', async () => {
    mocks.getRecordWithUI.mockResolvedValue({
      record: { recordId: 'PLR-9', schemaId: 'run', payload: { kind: 'planned-run', studyId: 'STU-1', methodEventGraphId: 'EG-1' } },
      uiSpec: null, schema: null,
    })
    mocks.getRoleBindingProposals.mockImplementation(async (id: string) => {
      if (id === 'PLR-9') return fourRoleProjection
      throw notPlannedRunError()
    })

    mountPage('PLR-9')

    await waitFor(() => {
      expect(mocks.getRoleBindingProposals).toHaveBeenLastCalledWith('PLR-9')
    }, { timeout: 3000 })

    await waitFor(() => {
      expect(screen.queryByTestId('role-binding-proposals')).not.toBeNull()
    }, { timeout: 3000 })

    expect(mocks.getRoleBindingProposals).toHaveBeenCalledTimes(1)
  })

  it('(3) neither plannedRunRef nor kind "planned-run" → no panel, no throw', async () => {
    mocks.getRecordWithUI.mockResolvedValue({
      record: { recordId: 'RUN-NOPLR', schemaId: 'run', payload: { kind: 'run', studyId: 'STU-1', methodEventGraphId: 'EG-1', title: 'No PLR' } },
      uiSpec: null, schema: null,
    })

    const { container } = mountPage('RUN-NOPLR')

    await waitFor(() => {
      expect(container.textContent).not.toContain('Loading run')
    }, { timeout: 3000 })

    expect(mocks.getRoleBindingProposals).not.toHaveBeenCalled()
    expect(screen.queryByTestId('role-binding-proposals')).toBeNull()
  })
})

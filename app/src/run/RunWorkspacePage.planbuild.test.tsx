/**
 * L2-SUBPROTOCOL-EXPAND-1 (unit u6planmount) — ROUTE-LEVEL pin for the
 * plan-graph build door.
 *
 * The door landed on trunk in u6builddoor (be8e6a4b): `RunPlanGraphBuild`
 * renders `data-testid="run-build-plan-graph"` and is mounted in the ROUTED
 * page's viewerToolbar (RunWorkspacePage.tsx:233). This lock mounts the ROUTED
 * page (not the component, and not the unimported graph/RunWorkspacePage.tsx
 * dead page) and proves:
 *   (1) Plan mode is the route's default surface AND the control is reachable
 *       there, and clicking it calls apiClient.buildPlanGraph with the
 *       record's plannedRunRef.id and renders the returned graphId;
 *   (2) a run with NO plannedRunRef renders NO control (no dead control).
 * Mutation probe: deleting the toolbar mount line makes leg (1) RED.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { mocks } = vi.hoisted(() => ({
  mocks: { getRecordWithUI: vi.fn(), buildPlanGraph: vi.fn() },
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(async () => ({ payload: { studyId: 'STU-1', methodEventGraphId: 'EG-1', title: 'Run' } })),
    getRecordWithUI: mocks.getRecordWithUI,
    buildPlanGraph: mocks.buildPlanGraph,
    workspace: { get: vi.fn(async () => null) },
    ai: { health: vi.fn(async () => ({ ok: false })) },
    getSurfaces: vi.fn(async () => []),
    getProtocolContext: vi.fn(async () => null),
    getRoleBindingProposals: vi.fn(async () => ({ protocols: [] })),
    listRecordsByKind: vi.fn(async () => ({ records: [], total: 0 })),
    getConfig: vi.fn(async () => ({ storageDevices: [] })),
  },
  api: { workspace: { get: vi.fn(async () => null) }, ai: { health: vi.fn(async () => ({ ok: false })) } },
  ApiError: class extends Error {},
}))

// Deck/chat/nav stack is out of scope: inert stubs only. The mode toggle and
// RunPlanGraphBuild stay REAL (the surface under test).
vi.mock('./RunWorkspaceShell', () => ({
  RunWorkspaceShell: ({ children, viewerToolbar }: { children: React.ReactNode; viewerToolbar?: React.ReactNode }) => (
    <div data-testid="rwp-shell">
      <div data-testid="rwp-toolbar">{viewerToolbar}</div>
      {children}
    </div>
  ),
}))
vi.mock('../event-editor/viewer/deck/DeckViewer', () => ({
  DeckViewer: () => <div data-testid="rwp-deck-viewer">deck</div>,
}))
vi.mock('../event-editor/viewer/deck/DeckToolbar', () => ({ DeckToolbar: () => <span data-testid="rwp-deck-toolbar" /> }))
vi.mock('../event-editor/deck/DeckChatSlice', () => ({ DeckChatSlice: () => null }))
vi.mock('../shared/shell/SurfaceChatBridge', () => ({ SurfaceChatBridge: () => null }))
vi.mock('../agent/HarnessChatPane', () => ({ HarnessChatPane: () => null }))
vi.mock('../agent/ChatFocusContext', () => ({
  ChatFocusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('./RunNavPane', () => ({ RunNavPane: () => null }))
vi.mock('./RunProtocolStepsLoader', () => ({ RunProtocolStepsLoader: () => null }))
vi.mock('./RunProtocolList', () => ({ RunProtocolList: () => null }))
vi.mock('./RoleBindingProposalsPanel', () => ({ RoleBindingProposalsPanel: () => null }))
vi.mock('./gc/GcRunSheetSection', () => ({ GcRunSheetSection: () => null }))
vi.mock('../event-editor/protocol/ProtocolSelectionContext', () => ({
  ProtocolSelectionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../event-editor/workspace/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWorkspace: () => ({ state: { studyId: 'STU-1' }, ready: true, error: null }),
  useOptionalWorkspace: () => ({ state: { studyId: 'STU-1' }, ready: true, error: null }),
}))
vi.mock('../event-editor/EventEditorContext', () => ({
  EventEditorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../event-editor/protocol/ProtocolPreviewBridge', () => ({ ProtocolPreviewBridge: () => null }))
vi.mock('../event-editor/focus/FocusModalsProvider', () => ({
  FocusModalsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { AiPanelProvider } from '../shared/context/AiPanelContext'
import { ThemeProvider } from '../shared/shell/useTheme'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { RunWorkspacePage } from './RunWorkspacePage'

function envelope(payload: Record<string, unknown>) {
  return { record: { recordId: 'RUN-1', schemaId: 'run', payload }, uiSpec: null, schema: null }
}

function renderRoutedPage() {
  return render(
    <MemoryRouter initialEntries={['/runs/RUN-1']}>
      <OpenTabsProvider>
        <ThemeProvider>
          <AiPanelProvider>
            <Routes>
              <Route path="/runs/:runId" element={<RunWorkspacePage />} />
            </Routes>
          </AiPanelProvider>
        </ThemeProvider>
      </OpenTabsProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.getRecordWithUI.mockReset()
  mocks.buildPlanGraph.mockReset()
})
afterEach(() => cleanup())

describe('RunWorkspacePage — plan-graph build door on the ROUTED Plan surface (u6planmount)', () => {
  it('(1) Plan/Design is the default surface and the control builds the planned run graph', async () => {
    mocks.getRecordWithUI.mockResolvedValue(envelope({
      kind: 'run', studyId: 'STU-1', methodEventGraphId: 'EG-1', title: 'Run', plannedRunRef: { id: 'PLRUN-7' },
    }))
    mocks.buildPlanGraph.mockResolvedValue({ graphId: 'EG-BUILT-9', reused: false })

    renderRoutedPage()
    const button = await screen.findByTestId('run-build-plan-graph')

    // The leg must not pass on the Execute surface: Plan is the route's
    // default mode and its pane (DeckViewer) is mounted.
    expect(screen.getByTestId('rwp-deck-viewer')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Design' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Execute' }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(button)
    await waitFor(() => expect(apiClient.buildPlanGraph).toHaveBeenCalledWith('PLRUN-7'))
    expect(apiClient.buildPlanGraph).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('EG-BUILT-9')).toBeTruthy()
  })

  it('(2) a run with NO plannedRunRef renders NO control (no dead control)', async () => {
    mocks.getRecordWithUI.mockResolvedValue(envelope({
      kind: 'run', studyId: 'STU-1', methodEventGraphId: 'EG-1', title: 'Run',
    }))

    renderRoutedPage()
    expect(await screen.findByTestId('rwp-deck-viewer')).toBeTruthy()
    // Three mount reads: page studyId resolution, page planned-run resolution,
    // and RunPlanGraphBuild's own resolution — wait for all to settle.
    await waitFor(() => expect(mocks.getRecordWithUI.mock.calls.length).toBeGreaterThanOrEqual(3))
    expect(screen.queryByTestId('run-build-plan-graph')).toBeNull()
  })
})

/**
 * L2-PROMPT2-FIXTURE-BOARD-1 UNIT 4 — Deep-link route activates the named deck tab.
 *
 * At base, the deep-link effect (ProjectWorkspacePage.tsx:206-218) calls
 * ws.openTab({...}) WITHOUT the activate flag. When the server returns a
 * workspace state whose activeTabId is a DIFFERENT deck tab (the legacy
 * fixture tab), the deep-link effect adds the named tab but the legacy
 * tab stays active — the stated URL intent loses to the server's remembered
 * activeTabId.
 *
 * Fix: pass `true` as ws.openTab's second argument so the deep-linked
 * tab is activated deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../shared/shell/useTheme'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import type { WorkspaceAction } from '../workspace/reducer'
import type { WorkspaceState } from '../workspace/types'

const mockWorkspaceState: WorkspaceState = {
  version: 3,
  studyId: 'STU-1',
  tabs: [
    {
      id: 'tab-deck-EVG-cellrox-legacy',
      kind: 'deck',
      eventGraphId: 'EVG-cellrox-legacy',
      title: 'EVG-cellrox-legacy',
    },
    {
      id: 'tab-deck-EVG-deep-link',
      kind: 'deck',
      eventGraphId: 'EVG-deep-link',
      title: 'EVG-deep-link',
    },
  ],
  activeTabId: 'tab-deck-EVG-cellrox-legacy',
  rightPaneMode: 'ai',
  rightPaneCollapsed: false,
  paneWidths: { left: 0.6, right: 0.4 },
}

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn().mockResolvedValue({
      recordId: 'STU-1', payload: { title: 'Test Study', kind: 'study' },
    }),
    loadWorkspace: vi.fn().mockResolvedValue({ state: mockWorkspaceState }),
    saveWorkspace: vi.fn().mockResolvedValue({ state: mockWorkspaceState }),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

vi.mock('../right-pane/find/FindTabPanel', () => ({
  FindTabPanel: () => <div data-testid="find-tab-panel" />,
}))

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined,
    }),
    destroy: () => undefined,
  })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))
vi.mock('../right-pane/ai/useChatThread', () => ({
  useChatThread: () => ({
    state: { messages: [], pending: null, status: null, error: null },
    isStreaming: false,
    send: vi.fn(), stop: vi.fn(), reset: vi.fn(), clearProtocolCandidate: vi.fn(),
  }),
}))

vi.mock('../../shared/api/aiThreadClient', () => ({
  listThreads: vi.fn(async () => []),
  createThread: vi.fn(async () => ({ id: 't1' })),
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  appendThreadMessage: vi.fn(async () => {}),
}))
vi.mock('../../shared/api/aiClient', () => ({
  streamAssist: vi.fn(async function* () {}),
  getAiHealth: vi.fn(async () => ({ available: false })),
}))
vi.mock('../../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: vi.fn(), acceptWorkstate: vi.fn(), rejectWorkstate: vi.fn(),
    handleAgentAction: vi.fn(),
  }),
}))

vi.mock('../viewer/Viewer', () => ({
  Viewer: () => <div data-testid="viewer" />,
}))
vi.mock('../EventEditorContext', () => ({
  EventEditorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../focus/FocusModalsProvider', () => ({
  FocusModalsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../viewer/ViewerToolbar', () => ({
  ViewerToolbar: () => null,
}))
vi.mock('../deck/DeckChatSlice', () => ({
  DeckChatSlice: () => null,
}))
vi.mock('../protocol/ProtocolSelectionContext', () => ({
  ProtocolSelectionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../protocol/ProtocolPreviewBridge', () => ({
  ProtocolPreviewBridge: () => null,
}))
vi.mock('../../shared/shell/WorkspaceTabStrip', () => ({
  WorkspaceTabStrip: () => <div data-testid="tab-strip" />,
}))
vi.mock('../create/RecordCreatePanel', () => ({
  RecordCreatePanel: () => <div data-testid="record-create" />,
}))
vi.mock('../create/RecordEditPanel', () => ({
  RecordEditPanel: () => <div data-testid="record-edit" />,
}))
vi.mock('../execution/ExecutionTabShell', () => ({
  ExecutionTabShell: () => <div data-testid="execution" />,
}))
vi.mock('../../collections/ProjectCollectionView', () => ({
  ProjectCollectionView: () => <div data-testid="project-collection" />,
}))
vi.mock('../../collections/RunCollectionView', () => ({
  RunCollectionView: () => <div data-testid="run-collection" />,
}))
vi.mock('../../collections/LabCollectionView', () => ({
  LabCollectionView: () => <div data-testid="lab-collection" />,
}))

// Spy on the reducer to capture open-tab actions with their activate flag.
const openTabActions: Array<{ tabId: string; activate?: boolean }> = []

vi.mock('../workspace/reducer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workspace/reducer')>()
  return {
    ...actual,
    workspaceReducer: (state: WorkspaceState, action: WorkspaceAction): WorkspaceState => {
      if (action.type === 'open-tab') {
        openTabActions.push({ tabId: action.tab.id, activate: action.activate })
      }
      return actual.workspaceReducer(state, action)
    },
  }
})

import { ProjectWorkspacePage } from './ProjectWorkspacePage'

describe('ProjectWorkspacePage — deep-link activates deck tab (L2-PROMPT2-FIXTURE-BOARD-1 U4)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    openTabActions.length = 0
  })
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('deep-link effect passes activate=true to ws.openTab for the named graph tab', { timeout: 30_000 }, async () => {
    render(
      <MemoryRouter initialEntries={['/project/STU-1/event-graph/EVG-deep-link']}>
        <ThemeProvider>
          <OpenTabsProvider>
            <AiPanelProvider>
              <Routes>
                <Route path="/project/:studyId/event-graph/:eventGraphId" element={<ProjectWorkspacePage />} />
              </Routes>
            </AiPanelProvider>
          </OpenTabsProvider>
        </ThemeProvider>
      </MemoryRouter>,
    )

    // The deep-link effect fires when ws.ready becomes true.
    // At base (RED): the open-tab action for the deep-link tab has no activate flag
    // (activate is undefined), so the reducer defaults to activate=true but the
    // workspace's activeTabId was already set to the legacy tab by the loadWorkspace
    // response — and the open-tab reducer only activates if activate is truthy or
    // the tab is new. Since the deep-link tab already exists in the loaded state,
    // it replaces without activating.
    //
    // With the fix (GREEN): ws.openTab is called with activate=true, so the
    // reducer sets activeTabId to the deep-link tab.
    await waitFor(() => {
      const action = openTabActions.find((a) => a.tabId === 'tab-deck-EVG-deep-link')
      expect(action).toBeTruthy()
      expect(action!.activate).toBe(true)
    }, { timeout: 20_000 })
  })
})

/**
 * QMS7-1 — /registry hosted in the unified workspace shell (spec D1).
 *
 * RED AT BASE BY DESIGN: at the pre-item tip /registry renders
 * RecordRegistryPage bare — no GlobalNavbar, no workspace tab strip, no
 * RightPane — and the module under test (RegistryHostPage) does not exist.
 *
 * Pins (spec §RED-FIRST TEST PLAN + orchestrator rulings OQ1/OQ2/OQ3):
 *  1. shell composition: global-navbar + workspace-tab-strip + right-pane.
 *  2. registration: exactly ONE 'registry' tab in the strip after mount.
 *  3. idempotence: remount (refresh simulation) still yields exactly one.
 *  4. AI context: selecting a record re-targets the WorkspaceProvider's own
 *     active tab to {kind:'record-edit', recordId}; Cancel returns it to
 *     project-details (no stale target); NO SURFACE_AI_REQUEST_EVENT fires
 *     on selection (OQ2 ruling); the OpenTabs strip gains no per-record tab.
 *  5. layout: the hand-rolled h-[calc(100vh-4rem)] root is replaced by a
 *     pane-filling height (h-full min-h-0), keeping the bounded list parent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from './useTheme'
import { OpenTabsProvider } from './OpenTabsContext'
import { defaultWorkspaceState, type WorkspaceState } from '../../event-editor/workspace/types'
import { SURFACE_AI_REQUEST_EVENT } from '../../shared/context/SurfaceContext'

// ---------------------------------------------------------------------------
// Mocks — same combobox/editor stub shapes the existing RecordRegistryPage
// suites use, so the selection flow under test is the real page logic.
// ---------------------------------------------------------------------------

const mocked = vi.hoisted(() => ({
  mockOnSelect: null as
    | ((record: { recordId: string; schemaId: string; payload: Record<string, unknown>; isNew: boolean }) => void)
    | null,
  mockOnUpdate: null as ((payload: Record<string, unknown>, dirty: boolean) => void) | null,
  lastWsState: null as WorkspaceState | null,
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    // RecordRegistryPage data flow
    listRecordsByKind: vi.fn().mockResolvedValue({
      records: [
        {
          recordId: 'rec-1',
          schemaId: 'test-schema',
          payload: { name: 'Test Record', kind: 'person', schemaId: 'test-schema' },
        },
      ],
    }),
    searchRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    getSchemas: vi.fn().mockResolvedValue([]),
    getRecordEditorProjection: vi.fn().mockResolvedValue({
      schemaId: 'test-schema',
      recordId: 'rec-1',
      title: 'Test Record',
      blocks: [{ id: 'b1', kind: 'section', label: 'Section 1', slotIds: ['s1'] }],
      slots: [{ id: 's1', path: 'name', label: 'Name', widget: 'text' }],
      diagnostics: [],
    }),
    getEditorDraftProjection: vi.fn().mockResolvedValue({
      schemaId: 'test-schema',
      recordId: '',
      title: 'New Record',
      blocks: [{ id: 'b1', kind: 'section', label: 'Section 1', slotIds: ['s1'] }],
      slots: [{ id: 's1', path: 'name', label: 'Name', widget: 'text' }],
      diagnostics: [],
    }),
    getValidTransitions: vi.fn().mockResolvedValue({ transitions: [] }),
    getRecord: vi.fn().mockResolvedValue({ recordId: 'rec-1', schemaId: 'test-schema', payload: {} }),
    createDraftCopy: vi.fn(),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    createRecord: vi.fn().mockResolvedValue(undefined),
    createSignature: vi.fn(),
    listRecordRevisions: vi.fn().mockResolvedValue({ records: [] }),
    // WorkspaceProvider persistence (per-study workspace.yaml)
    loadWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-scratch') }),
    saveWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-scratch') }),
    // SurfaceIndicator chrome
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

// pdfjs crashes jsdom (DOMMatrix) via RunInEventEditorButton's import chain —
// same seam the existing AiTabPanel suites use.
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

// The chat thread must not open an SSE fetch in a component test.
vi.mock('../../event-editor/right-pane/ai/useChatThread', () => ({
  useChatThread: () => ({
    state: { messages: [], pending: null, status: null, error: null },
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    clearProtocolCandidate: vi.fn(),
  }),
}))

vi.mock('../../components/registry/RecordSearchCombobox', async () => {
  // Probe seam: the combobox renders inside the host's WorkspaceProvider on
  // every state, so capturing the context here observes the SAME live tab
  // state the AI panel's context memo reads (AiTabPanel activeTab deps).
  const { useOptionalWorkspace: useWs } = await import(
    '../../event-editor/workspace/WorkspaceContext'
  )
  return {
    RecordSearchCombobox: ({
      placeholder,
      onSelect,
    }: {
      kinds: string[]
      schemaId: string
      placeholder?: string
      onSelect: (record: { recordId: string; schemaId: string; payload: Record<string, unknown>; isNew: boolean }) => void
      disabled?: boolean
    }) => {
      mocked.mockOnSelect = onSelect ?? null
      const ws = useWs()
      mocked.lastWsState = ws ? ws.state : null
      return (
        <div data-testid="record-search-combobox">
          <input data-testid="search-input" placeholder={placeholder} />
          <button
            data-testid="search-local-btn"
            onClick={() =>
              mocked.mockOnSelect?.({
                recordId: 'rec-1',
                schemaId: 'test-schema',
                payload: { name: 'Test Record', kind: 'person', schemaId: 'test-schema' },
                isNew: false,
              })
            }
          >
            Search Local
          </button>
          <button
            data-testid="search-new-btn"
            onClick={() =>
              mocked.mockOnSelect?.({
                recordId: '',
                schemaId: 'test-schema',
                payload: { name: 'New Record', schemaId: 'test-schema' },
                isNew: true,
              })
            }
          >
            New Record
          </button>
        </div>
      )
    },
  }
})

vi.mock('../../components/registry/CsvImportModal', () => ({
  CsvImportModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="csv-import-modal">CSV Import</div> : null,
}))

vi.mock('../../components/registry/RelatedRecordsCard', () => ({
  RelatedRecordsCard: ({ recordId }: { recordId: string }) => (
    <div data-testid="related-records-card">Related records for {recordId}</div>
  ),
}))

vi.mock('../../editor/taptab/TapTabEditor', () => ({
  ProjectionTapTabEditor: ({
    data,
    onUpdate,
  }: {
    blocks: Array<{ id: string; kind: string }>
    slots: Array<{ id: string; path: string; label: string; widget: string }>
    data: Record<string, unknown>
    disabled?: boolean
    onUpdate?: (payload: Record<string, unknown>, dirty: boolean) => void
  }) => {
    mocked.mockOnUpdate = onUpdate ?? null
    if (onUpdate) onUpdate(data, Object.keys(data).length > 0)
    return (
      <div data-testid="projection-taptab-editor">
        <span data-testid="editor-data">Editing: {JSON.stringify(data)}</span>
      </div>
    )
  },
}))

import { RegistryHostPage } from './RegistryHostPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderHost() {
  return render(
    <MemoryRouter initialEntries={['/registry']}>
      <ThemeProvider>
        <OpenTabsProvider>
          <RegistryHostPage />
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

function activeTabOf(state: WorkspaceState | null): { id: string; kind: string; recordId?: string } | null {
  if (!state) return null
  const tab = state.tabs.find((t) => t.id === state.activeTabId)
  if (!tab) return null
  return {
    id: tab.id,
    kind: tab.kind,
    ...(tab.kind === 'record-edit' ? { recordId: tab.recordId } : {}),
  }
}

async function waitForRegistryLoaded() {
  await waitFor(() => expect(screen.getByText('Test Record')).toBeTruthy())
}

const surfaceAiRequests: Event[] = []
let surfaceListener: (e: Event) => void

describe('RegistryHostPage — /registry in the unified workspace shell (QMS7-1)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    surfaceAiRequests.length = 0
    surfaceListener = (e: Event) => surfaceAiRequests.push(e)
    window.addEventListener(SURFACE_AI_REQUEST_EVENT, surfaceListener)
  })

  afterEach(() => {
    cleanup()
    window.removeEventListener(SURFACE_AI_REQUEST_EVENT, surfaceListener)
    window.localStorage.clear()
  })

  it('renders the workspace shell around the registry: navbar + tab strip + right pane', async () => {
    renderHost()
    await waitForRegistryLoaded()
    expect(screen.getByTestId('global-navbar')).toBeTruthy()
    expect(screen.getByTestId('workspace-tab-strip')).toBeTruthy()
    expect(screen.getByTestId('right-pane')).toBeTruthy()
    // The registry page itself is reparented into the left pane, unchanged.
    expect(screen.getByTestId('record-search-combobox')).toBeTruthy()
  })

  it('registers exactly ONE registry tab in the strip on mount', async () => {
    renderHost()
    await waitForRegistryLoaded()
    const tabs = screen.getAllByTestId(/^workspace-tab-registry/)
    expect(tabs.length).toBe(1)
    expect(tabs[0]!.textContent).toContain('Registry')
  })

  it('remount (refresh simulation) keeps exactly one registry tab — no duplicate', async () => {
    const first = renderHost()
    await waitForRegistryLoaded()
    expect(screen.getAllByTestId(/^workspace-tab-registry/).length).toBe(1)
    first.unmount()
    // A refresh re-hydrates the OpenTabs store from storage and the host
    // re-registers; the reducer's re-registration no-op guard must collapse
    // this to a single tab (no hand-rolled "already registered?" check).
    renderHost()
    await waitForRegistryLoaded()
    expect(screen.getAllByTestId(/^workspace-tab-registry/).length).toBe(1)
  })

  it('selection re-targets the AI context live: record-edit on select, project-details on cancel', async () => {
    renderHost()
    await waitForRegistryLoaded()

    // Baseline target: the WorkspaceProvider's default project-details tab.
    expect(activeTabOf(mocked.lastWsState)?.kind).toBe('project-details')

    fireEvent.click(screen.getByTestId('search-local-btn'))
    await waitFor(() => expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy())
    await waitFor(() => {
      const active = activeTabOf(mocked.lastWsState)
      expect(active?.kind).toBe('record-edit')
      expect(active?.recordId).toBe('rec-1')
    })

    // OQ2 ruling: selection is a live pointer via ws.openTab, NOT a chat turn.
    expect(surfaceAiRequests.length).toBe(0)

    // Ruling C: the strip gains NO per-record tab — only the registry tab.
    expect(screen.getAllByTestId(/^workspace-tab-registry/).length).toBe(1)
    expect(screen.queryByTestId('workspace-tab-record:rec-1')).toBeNull()

    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => {
      const active = activeTabOf(mocked.lastWsState)
      expect(active?.kind).toBe('project-details')
    })
    // No stale target left behind, and still no chat turn fired.
    expect(activeTabOf(mocked.lastWsState)?.recordId).toBeUndefined()
    expect(surfaceAiRequests.length).toBe(0)
  })

  it('create mode does NOT mint a record tab (record-create stays out)', async () => {
    renderHost()
    await waitForRegistryLoaded()
    fireEvent.click(screen.getByTestId('search-new-btn'))
    await waitFor(() => expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy())
    expect(activeTabOf(mocked.lastWsState)?.kind).not.toBe('record-create')
    expect(screen.queryByTestId('workspace-tab-create:person')).toBeNull()
  })

  it('drops the hand-rolled viewport-height root for a pane-filling height', async () => {
    const { container } = renderHost()
    await waitForRegistryLoaded()
    const divs = Array.from(container.querySelectorAll('div'))
    // The old hand-rolled calc(100vh-4rem) root is gone…
    expect(divs.some((d) => String(d.className).includes('calc(100vh'))).toBe(false)
    // …replaced by a pane-filling height so the list's overflow-y-auto keeps
    // a bounded parent (spec LAYOUT bait).
    expect(divs.some((d) => String(d.className).includes('h-full') && String(d.className).includes('min-h-0'))).toBe(true)
  })
})

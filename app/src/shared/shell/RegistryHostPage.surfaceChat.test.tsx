/**
 * L2-CHAT-UI-1 LEG C1 (RED pin) — /registry gains the UNIVERSAL chat.
 *
 * At base RegistryHostPage mounts <RightPane /> with NO registrar, so
 * RightPane's panelSlot?.chat is null and the AI tab renders the legacy
 * AiTabPanel (RightPane.tsx:95-105). Pin: once the surface registers a chat
 * through the bridge, the AI arm renders HarnessChatPane with a WORKING
 * chat — the composer ENABLED (not the 'No surface has registered a chat'
 * empty state, HarnessChatPane.tsx:136-146, and not the legacy ai-tab DOM).
 *
 * Mock posture: same seams RegistryHostPage.test.tsx proves (combobox/editor
 * stubs, pdfjs + useChatThread for the RightPane import chain) PLUS the
 * run-surface chat seams (aiThreadClient / aiClient /
 * useWorkstateProposalFlow — RunWorkspacePage.surface.test.tsx idiom). The
 * tree is wrapped in AiPanelProvider because main.tsx wraps the routed app
 * in one (main.tsx:15-42); WITHOUT a provider the bridge honestly registers
 * nothing and the pages keep the legacy fallback (the host-page suites
 * render provider-free and must stay green).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from './useTheme'
import { OpenTabsProvider } from './OpenTabsContext'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { defaultWorkspaceState } from '../../event-editor/workspace/types'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    searchRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    getSchemas: vi.fn().mockResolvedValue([]),
    getRecordEditorProjection: vi.fn().mockResolvedValue({
      schemaId: 'test-schema', recordId: '', title: 'x', blocks: [], slots: [], diagnostics: [],
    }),
    getEditorDraftProjection: vi.fn().mockResolvedValue({
      schemaId: 'test-schema', recordId: '', title: 'x', blocks: [], slots: [], diagnostics: [],
    }),
    getValidTransitions: vi.fn().mockResolvedValue({ transitions: [] }),
    getRecord: vi.fn().mockResolvedValue({ recordId: 'rec-1', schemaId: 'test-schema', payload: {} }),
    createDraftCopy: vi.fn(),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    createRecord: vi.fn().mockResolvedValue(undefined),
    createSignature: vi.fn(),
    listRecordRevisions: vi.fn().mockResolvedValue({ records: [] }),
    loadWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-scratch') }),
    saveWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-scratch') }),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

vi.mock('../../components/registry/RecordSearchCombobox', () => ({
  RecordSearchCombobox: ({ placeholder }: { placeholder?: string }) => (
    <div data-testid="record-search-combobox">
      <input data-testid="search-input" placeholder={placeholder} />
    </div>
  ),
}))
vi.mock('../../components/registry/RelatedRecordsCard', () => ({
  RelatedRecordsCard: ({ recordId }: { recordId: string }) => (
    <div data-testid="related-records-card">Related records for {recordId}</div>
  ),
}))
vi.mock('../../editor/taptab/TapTabEditor', () => ({
  ProjectionTapTabEditor: () => <div data-testid="projection-taptab-editor" />,
}))

// RightPane imports AiTabPanel statically regardless of which arm renders —
// the legacy chain seams from RegistryHostPage.test.tsx.
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
vi.mock('../../event-editor/right-pane/ai/useChatThread', () => ({
  useChatThread: () => ({
    state: { messages: [], pending: null, status: null, error: null },
    isStreaming: false,
    send: vi.fn(), stop: vi.fn(), reset: vi.fn(), clearProtocolCandidate: vi.fn(),
  }),
}))

// The universal-chat seams (RunWorkspacePage.surface.test.tsx idiom).
vi.mock('../../shared/api/aiThreadClient', () => ({
  listThreads: vi.fn(async () => []),
  createThread: vi.fn(async () => ({ id: 't1' })),
  // REJECT (not resolve(null)): a resolved null makes useAiChat's hydrate
  // effect fail the turn. The ghost/registry-lock suites use this posture.
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

import { RegistryHostPage } from './RegistryHostPage'

function renderHost() {
  return render(
    <MemoryRouter initialEntries={['/registry']}>
      <ThemeProvider>
        <OpenTabsProvider>
          <AiPanelProvider>
            <RegistryHostPage />
          </AiPanelProvider>
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('RegistryHostPage — universal chat bridge (L2-CHAT-UI-1 LEG C1)', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('AI tab renders HarnessChatPane with a WORKING chat (composer enabled, no empty state)', { timeout: 30_000 }, async () => {
    renderHost()
    const pane = await screen.findByTestId('harness-chat-pane', {}, { timeout: 20_000 })
    // Honest negative: NOT the no-registration empty state, NOT the legacy ai-tab DOM.
    expect(screen.queryByText(/No surface has registered a chat/)).toBeNull()
    expect(screen.queryByTestId('ai-tab')).toBeNull()
    // The composer is ENABLED: typing enables Send (the empty-state composer is
    // hard-disabled — HarnessChatPane.tsx:143-144).
    const textarea = screen.getByLabelText('Message')
    expect((textarea as HTMLTextAreaElement).disabled).toBe(false)
    fireEvent.change(textarea, { target: { value: 'what records exist?' } })
    const send = Array.from(pane.querySelectorAll('button')).find((b) => b.textContent === 'Send')
    expect(send).toBeTruthy()
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false))
  })
})

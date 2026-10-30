/**
 * L2-CHAT-UI-1 LEG C2 (RED pin) — /record/:recordId gains the UNIVERSAL chat.
 *
 * At base RecordHostPage mounts <RightPane /> with NO registrar → legacy
 * AiTabPanel arm. Pin: with an AiPanelProvider present (main.tsx wraps the
 * routed app in one), the AI tab renders HarnessChatPane with the composer
 * ENABLED — not the empty state, not the legacy ai-tab DOM.
 *
 * Mock posture: RecordHostPage.share.test.tsx seams (apiClient, taptab
 * barrel) MINUS its RightPane stub — this pin needs the REAL RightPane —
 * plus the universal-chat seams (RunWorkspacePage.surface.test.tsx idiom).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './useTheme'
import { OpenTabsProvider } from './OpenTabsContext'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { defaultWorkspaceState } from '../../event-editor/workspace/types'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn().mockResolvedValue({
      recordId: 'rec-1',
      payload: { name: 'Test Record', kind: 'local-protocol', studyId: 'STU-1' },
    }),
    getRecordEditorProjection: vi.fn().mockResolvedValue({
      schemaId: 'test-schema', recordId: 'rec-1', title: 'Test Record',
      blocks: [{ id: 'b1', kind: 'section', label: 'Section 1', slotIds: ['s1'] }],
      slots: [{ id: 's1', path: 'name', label: 'Name', widget: 'text' }],
      diagnostics: [],
    }),
    getEditorDraftProjection: vi.fn().mockResolvedValue({
      schemaId: 'test-schema', recordId: '', title: 'New record', blocks: [], slots: [], diagnostics: [],
    }),
    getAccessPolicy: vi.fn().mockResolvedValue(null),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    loadWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-1') }),
    saveWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-1') }),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

vi.mock('../../editor/taptab', () => ({
  ProjectionTapTabEditor: () => <div data-testid="projection-taptab-editor" />,
  serializeDocument: (_json: unknown, fallback: unknown) => fallback,
}))

// RightPane imports AiTabPanel statically regardless of the rendered arm —
// the legacy chain seams (RegistryHostPage.test.tsx idiom).
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

// LEG D rider D2: assert the registrar's scope/endpoint (a silently dropped
// scope = cross-record thread bleed would otherwise stay green). Wrap the REAL
// useSurfaceChat (keep its registration side-effect) and capture the
// (endpoint, scope) it forwards.
const surfaceChatCalls = vi.hoisted(
  () => [] as Array<{ endpoint?: string; scope?: string }>,
)
vi.mock('../../agent/useSurfaceChat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agent/useSurfaceChat')>()
  return {
    ...actual,
    useSurfaceChat: (opts: Parameters<typeof actual.useSurfaceChat>[0]) => {
      surfaceChatCalls.push(opts as { endpoint?: string; scope?: string })
      return actual.useSurfaceChat(opts)
    },
  }
})

import { RecordHostPage } from './RecordHostPage'

function renderHost() {
  return render(
    <MemoryRouter initialEntries={['/record/rec-1']}>
      <ThemeProvider>
        <OpenTabsProvider>
          <AiPanelProvider>
            <Routes>
              <Route path="/record/:recordId" element={<RecordHostPage />} />
            </Routes>
          </AiPanelProvider>
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('RecordHostPage — universal chat bridge (L2-CHAT-UI-1 LEG C2)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    surfaceChatCalls.length = 0
  })
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('AI tab renders HarnessChatPane with a WORKING chat (composer enabled, no empty state)', { timeout: 30_000 }, async () => {
    renderHost()
    const pane = await screen.findByTestId('harness-chat-pane', {}, { timeout: 20_000 })
    expect(screen.queryByText(/No surface has registered a chat/)).toBeNull()
    expect(screen.queryByTestId('ai-tab')).toBeNull()
    const textarea = screen.getByLabelText('Message')
    expect((textarea as HTMLTextAreaElement).disabled).toBe(false)
    fireEvent.change(textarea, { target: { value: 'summarize this record' } })
    const send = Array.from(pane.querySelectorAll('button')).find((b) => b.textContent === 'Send')
    expect(send).toBeTruthy()
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false))
    // LEG D rider D2: the registrar's scope/endpoint ARE asserted — the record
    // EDIT page forwards the recordId as the thread scope (RecordHostPage.tsx:
    // scope = recordId when editing, omitted for create mode). endpoint
    // 'browser' (the bridge's constant). A regression that silently drops the
    // recordId scope (cross-record thread bleed) changes this capture.
    expect(surfaceChatCalls.length).toBeGreaterThan(0)
    expect(surfaceChatCalls[0]!.endpoint).toBe('browser')
    expect(surfaceChatCalls[0]!.scope).toBe('rec-1')
  })
})

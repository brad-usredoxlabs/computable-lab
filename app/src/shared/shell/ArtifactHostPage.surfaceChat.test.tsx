/**
 * L2-CHAT-UI-1 LEG C3 (RED pin) — /artifact/:kind/:artifactId gains the
 * UNIVERSAL chat.
 *
 * At base ArtifactHostPage mounts <RightPane /> with NO registrar → legacy
 * AiTabPanel arm. Pin: with an AiPanelProvider present, the AI tab renders
 * HarnessChatPane with the composer ENABLED — not the empty state, not the
 * legacy ai-tab DOM.
 *
 * The heavy viewers (PdfViewer / DocumentEditor) are stubbed — the artifact
 * RENDERERS are not under test here (behavior preservation = the page keeps
 * mounting them, pinned by the page diff); this pin is the right-pane chat
 * registration. Universal-chat seams: RunWorkspacePage.surface.test.tsx
 * idiom; legacy AiTabPanel chain: RegistryHostPage.test.tsx idiom.
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
      recordId: 'ART-1',
      payload: { artifactId: 'ART-1', kind: 'document', title: 'Assay write-up', studyId: 'STU-1' },
    }),
    loadWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-1') }),
    saveWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-1') }),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

vi.mock('../../event-editor/viewer/pdf/PdfViewer', () => ({
  PdfViewer: () => <div data-testid="pdf-viewer" />,
}))
vi.mock('../../event-editor/viewer/document/DocumentEditor', () => ({
  DocumentEditor: () => <div data-testid="document-editor" />,
}))
vi.mock('../../event-editor/viewer/ViewerToolbar', () => ({
  ViewerToolbar: () => <div data-testid="viewer-toolbar" />,
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

import { ArtifactHostPage } from './ArtifactHostPage'

function renderHost() {
  return render(
    <MemoryRouter initialEntries={['/artifact/document/ART-1']}>
      <ThemeProvider>
        <OpenTabsProvider>
          <AiPanelProvider>
            <Routes>
              <Route path="/artifact/:kind/:artifactId" element={<ArtifactHostPage />} />
            </Routes>
          </AiPanelProvider>
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('ArtifactHostPage — universal chat bridge (L2-CHAT-UI-1 LEG C3)', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('AI tab renders HarnessChatPane with a WORKING chat (composer enabled, no empty state)', { timeout: 30_000 }, async () => {
    renderHost()
    const pane = await screen.findByTestId('harness-chat-pane', {}, { timeout: 20_000 })
    expect(screen.queryByText(/No surface has registered a chat/)).toBeNull()
    expect(screen.queryByTestId('ai-tab')).toBeNull()
    // The artifact's own renderer stays mounted (behavior preservation: the
    // bridge bolt-on does not displace the viewer).
    expect(screen.getByTestId('document-editor')).toBeTruthy()
    const textarea = screen.getByLabelText('Message')
    expect((textarea as HTMLTextAreaElement).disabled).toBe(false)
    fireEvent.change(textarea, { target: { value: 'what does this document say?' } })
    const send = Array.from(pane.querySelectorAll('button')).find((b) => b.textContent === 'Send')
    expect(send).toBeTruthy()
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false))
  })
})

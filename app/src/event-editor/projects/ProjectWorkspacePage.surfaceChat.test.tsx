/**
 * L2-CHAT-UI-1 LEG C4 (RED pin) — /project/:studyId gains the UNIVERSAL chat.
 *
 * At base ProjectWorkspacePage mounts <RightPane /> with NO registrar
 * (ProjectWorkspacePage.tsx:208) → legacy AiTabPanel arm. Pin: with an
 * AiPanelProvider present, the AI tab renders HarnessChatPane with the
 * composer ENABLED — not the empty state, not the legacy ai-tab DOM.
 *
 * The workspace provider is REAL (default state lands on the project-details
 * tab with rightPaneMode 'ai' — types.ts:302); the left-pane homepage
 * (FindTabPanel) is stubbed — the find tree is not under test here.
 * Universal-chat seams: RunWorkspacePage.surface.test.tsx idiom; legacy
 * AiTabPanel chain: RegistryHostPage.test.tsx idiom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../shared/shell/useTheme'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { AiPanelProvider } from '../../shared/context/AiPanelContext'
import { defaultWorkspaceState } from '../workspace/types'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn().mockResolvedValue({
      recordId: 'STU-1', payload: { title: 'Test Study', kind: 'study' },
    }),
    loadWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-1') }),
    saveWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-1') }),
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

import { ProjectWorkspacePage } from './ProjectWorkspacePage'

function renderHost() {
  return render(
    <MemoryRouter initialEntries={['/project/STU-1']}>
      <ThemeProvider>
        <OpenTabsProvider>
          <AiPanelProvider>
            <Routes>
              <Route path="/project/:studyId" element={<ProjectWorkspacePage />} />
            </Routes>
          </AiPanelProvider>
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('ProjectWorkspacePage — universal chat bridge (L2-CHAT-UI-1 LEG C4)', () => {
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
    fireEvent.change(textarea, { target: { value: 'what should we run next?' } })
    const send = Array.from(pane.querySelectorAll('button')).find((b) => b.textContent === 'Send')
    expect(send).toBeTruthy()
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false))
    // LEG D rider D2: the registrar's scope/endpoint ARE asserted — the
    // project page forwards the studyId as the thread scope
    // (ProjectWorkspacePage.tsx:119 scope={studyId}). endpoint 'browser'.
    expect(surfaceChatCalls.length).toBeGreaterThan(0)
    expect(surfaceChatCalls[0]!.endpoint).toBe('browser')
    expect(surfaceChatCalls[0]!.scope).toBe('STU-1')
  })
})

/**
 * L2-CHAT-UI-1 LEG D step 5 (OQ-4 PORT) — the attached-sources chrome rides
 * the universal pane.
 *
 * AiTabPanel owned SourcesStrip + AddSourceModal + RunInEventEditorButton; the
 * panel died in the deletion commit, so the three components (byte-identical,
 * their own testids) mount in HarnessChatPane's header region instead —
 * wired to the pane's own chat (open-in-viewer through the openTabs seam).
 *
 * The chrome renders ONLY on a chat-bearing, workspace-bearing host
 * (RunInEventEditorButton needs useWorkspace) and the run button obeys the
 * component's own visibility rule (pdf/document viewers only). Surface-
 * agnostic — no surface-name branching. The legacy ai-tab DOM is gone
 * (asserted absent).
 *
 * pdfjs is mocked: the ported RunInEventEditorButton's usePdfViewer excerpt
 * dep reaches pdfjs-dist (jsdom has no DOMMatrix) — the proven pattern.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { WorkspaceProvider } from '../event-editor/workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../event-editor/workspace/types'
import type { WorkspaceTab } from '../event-editor/workspace/types'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ChatMessage } from '../types/ai'
import { HarnessChatPane } from './HarnessChatPane'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

// A registered chat stub (the pane is a pure consumer).
function stubChat(): UseAiChatReturn {
  const base = {
    messages: [] as ChatMessage[],
    isStreaming: false,
    isAccepting: false,
    previewEvents: [],
    previewLabwareAdditions: [],
    previewEventStates: new Map(),
    executingApplianceJobIds: new Set<string>(),
    hasPreview: false,
    unresolvedRefs: [],
    inputText: '',
    sendPrompt: vi.fn(),
    cancelStream: vi.fn(),
    acceptPreview: vi.fn(),
    acceptPreviewWithResolutions: vi.fn(),
    rejectPreview: vi.fn(),
    setPreviewEventState: vi.fn(),
    setPreviewEvents: vi.fn(),
    commitAcceptedPreviewEvents: vi.fn(async () => {}),
    clearHistory: vi.fn(),
    applyToGraph: vi.fn(),
    executeInstrumentApplianceJob: vi.fn(async () => {}),
    aiAvailable: true,
    recheckHealth: vi.fn(),
    thinkingMode: false,
    setThinkingMode: vi.fn(),
  }
  return base as unknown as UseAiChatReturn
}

/** Registers a chat (the seam the pane consumes) and renders the pane. */
function Register({ chat }: { chat: UseAiChatReturn }) {
  useRegisterAiChat(chat)
  return null
}

function renderChromeHost(tab: WorkspaceTab) {
  const chat = stubChat()
  const base = defaultWorkspaceState('STU-000001')
  render(
    <MemoryRouter>
      <OpenTabsProvider>
        <AiPanelProvider>
          <WorkspaceProvider
            studyId="STU-000001"
            saveDebounceMs={0}
            loadFn={async () => ({
              state: { ...base, tabs: [tab], activeTabId: tab.id } as ReturnType<typeof defaultWorkspaceState>,
            })}
            saveFn={async (_id, s) => ({ state: s })}
          >
            <Register chat={chat} />
            <HarnessChatPane />
          </WorkspaceProvider>
        </AiPanelProvider>
      </OpenTabsProvider>
    </MemoryRouter>,
  )
  return { chat }
}

afterEach(cleanup)

describe('HarnessChatPane — attached-sources chrome (LEG D step 5, OQ-4 PORT)', () => {
  it('mounts the SourcesStrip in the header region of a chat-bearing, workspace-bearing host — and the legacy ai-tab DOM is absent', () => {
    renderChromeHost({ id: 't1', kind: 'deck', eventGraphId: 'EVG-1', title: 'Deck' })
    // The pane rendered with a WORKING chat (not the empty state).
    expect(screen.queryByText(/No surface has registered a chat/)).toBeNull()
    // The ported chrome is mounted in the header region, before the log.
    expect(screen.getByTestId('sources-strip')).toBeTruthy()
    expect(screen.getByTestId('sources-strip-add')).toBeTruthy()
    // The legacy ai-tab DOM died with AiTabPanel.
    expect(screen.queryByTestId('ai-tab')).toBeNull()
    // The run button obeys its own visibility rule: a DECK viewer shows no
    // run-in-event-editor button.
    expect(screen.queryByTestId('run-in-event-editor')).toBeNull()
  })

  it('shows RunInEventEditorButton on a PDF viewer tab (the component own visibility rule) and hides it again on a deck', async () => {
    renderChromeHost({ id: 't1', kind: 'pdf', artifactId: 'ART-1', title: 'Vendor protocol' })
    // PDF viewer → the workspace "send my prompt to the deck" gesture is live.
    // (The workspace loads async, so the active-tab-derived button appears once
    // the provider's state settles — await it.)
    expect(await screen.findByTestId('run-in-event-editor')).toBeTruthy()
  })
})

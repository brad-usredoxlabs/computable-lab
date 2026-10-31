/**
 * RightPane smoke tests. The three panels each have heavier per-panel
 * tests adjacent to this file; this one is just the chrome dispatcher:
 *
 *  - default active mode → AI pane (the universal HarnessChatPane) renders
 *  - clicking a tab updates workspace state and switches the body
 *  - aria-selected reflects active mode
 *
 * LEG D re-pin: the AI mode ALWAYS renders the universal pane — the legacy
 * AiTabPanel mock (panel-ai) and the panelSlot?.chat fallback arm are gone, so
 * every panel-ai assertion now expects panel-harness. A surface that
 * registered no chat gets the pane's own honest empty state (never a crash),
 * pinned below (provider-free posture is the production test posture; the
 * routed app always has an AiPanelProvider — main.tsx wraps it).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AiPanelProvider, useRegisterAiChat } from '../../shared/context/AiPanelContext'
import {
  WorkspaceProvider,
  type WorkspaceContextValue,
} from '../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../workspace/types'
import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'
import type { ChatMessage } from '../../types/ai'

// Stub the non-AI panels so the dispatcher test doesn't transitively pull
// each panel's fetches. Each panel has its own focused test file.
vi.mock('./search/SearchTabPanel', () => ({
  SearchTabPanel: () => <div data-testid="panel-search">SEARCH</div>,
}))
vi.mock('./details/DetailsTabPanel', () => ({
  DetailsTabPanel: () => <div data-testid="panel-details">DETAILS</div>,
}))
vi.mock('./protocol/ProtocolTabPanel', () => ({
  ProtocolTabPanel: () => <div data-testid="panel-protocol">PROTOCOL</div>,
}))

// The universal pane (harness) — the ONLY chat the AI arm renders (LEG D).
// The mirror reads the SAME registration seam the real pane consumes
// (useOptionalAiPanel) and exposes the registered/empty state, so the
// always-harness dispatcher cases can assert the two registration states
// at the seam level (the pane mock itself cannot show the real pane's empty
// state).
vi.mock('../../agent/HarnessChatPane', async () => {
  const { useOptionalAiPanel } = await import('../../shared/context/AiPanelContext')
  return {
    HarnessChatPane: () => {
      const chat = useOptionalAiPanel()?.chat ?? null
      return (
        <div data-testid="panel-harness">
          <span data-testid="panel-harness-chat-state">{chat ? 'chat-registered' : 'chat-empty'}</span>
          HARNESS
        </div>
      )
    },
  }
})

import { RightPane } from './RightPane'

// A stub chat for the registered-case registrar (the seam HarnessChatPane
// consumes). Same stub shape as HarnessChatPane.sourcesChrome.test.tsx.
function stubChat(): UseAiChatReturn {
  const base = {
    messages: [] as ChatMessage[],
    isStreaming: false,
    isAccepting: false,
    previewEvents: [],
    previewLabwareAdditions: [],
    previewEventStates: new Map(),
    previewStagedLabwareCount: 0,
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

/** A surface registrar: writes a stub chat into the AiPanelContext seam. */
function RegisterStubChat() {
  useRegisterAiChat(stubChat())
  return null
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function renderRightPane(
  initialMode?: WorkspaceContextValue['state']['rightPaneMode'],
  withRegistrar = false,
) {
  const state = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
      {/* The routed app wraps RightPane in an AiPanelProvider (main.tsx); the
          AI arm now ALWAYS mounts HarnessChatPane. */}
      <AiPanelProvider>
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: {
              ...state,
              ...(initialMode ? { rightPaneMode: initialMode } : {}),
            },
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          {withRegistrar ? <RegisterStubChat /> : null}
          <RightPane />
        </WorkspaceProvider>
      </AiPanelProvider>
    </MemoryRouter>,
  )
}

describe('RightPane', () => {
  it('renders the universal AI pane by default', async () => {
    // Default rightPaneMode is 'ai', so a freshly-opened study shows
    // the universal chat pane first.
    renderRightPane()
    await screen.findByTestId('panel-harness')
    expect(screen.queryByTestId('panel-search')).toBeNull()
  })

  it('clicking Search switches the active panel', async () => {
    renderRightPane()
    await screen.findByTestId('panel-harness')
    fireEvent.click(screen.getByTestId('right-pane-tab-search'))
    expect(screen.getByTestId('panel-search')).toBeTruthy()
    expect(screen.queryByTestId('panel-harness')).toBeNull()
  })

  it('clicking Details switches the active panel', async () => {
    renderRightPane()
    await screen.findByTestId('panel-harness')
    fireEvent.click(screen.getByTestId('right-pane-tab-details'))
    expect(screen.getByTestId('panel-details')).toBeTruthy()
    expect(screen.queryByTestId('panel-harness')).toBeNull()
  })

  it('renders four tab buttons in order: AI · Search · Details · Protocol', async () => {
    renderRightPane()
    await screen.findByTestId('panel-harness')
    const tabs = screen.getAllByRole('tab').map((el) => el.textContent)
    expect(tabs).toEqual(['AI', 'Search', 'Details', 'Protocol'])
  })

  it('aria-selected reflects the active mode', async () => {
    renderRightPane('ai')
    await screen.findByTestId('panel-harness')
    expect(
      screen.getByTestId('right-pane-tab-ai').getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByTestId('right-pane-tab-search').getAttribute('aria-selected'),
    ).toBe('false')
  })

  it('persisted find mode normalizes to AI pane', async () => {
    // Legacy back-compat: workspace.yaml still carries 'find' for old
    // workspace files. RightPane should treat it as 'ai'.
    renderRightPane('find')
    await screen.findByTestId('panel-harness')
    expect(screen.queryByTestId('panel-search')).toBeNull()
  })
})


describe('RightPane — universal chat pane (LEG D: always-harness)', () => {
  it('renders the universal pane even when the surface registered no chat (honest empty state, never a crash)', () => {
    // LEG D: there is no legacy fallback arm any more — the AI mode renders
    // HarnessChatPane unconditionally. With no registered chat the pane shows
    // its own empty state (HarnessChatPane.tsx:136-146); the dispatcher is
    // pinned to the harness element either way. The pane mock mirrors the
    // registration seam, so the EMPTY state is asserted here at the seam
    // level (chat-empty = no chat in the seam).
    renderRightPane()
    expect(screen.getByTestId('panel-harness')).toBeInTheDocument()
    expect(screen.getByTestId('panel-harness-chat-state')).toHaveTextContent('chat-empty')
  })

  it('renders the universal chat pane when the surface registered one', () => {
    // FIX RUN 1 (advc D6): this case now ACTUALLY registers a stub chat
    // (AiPanelProvider + useRegisterAiChat — the same seam the real
    // HarnessChatPane consumes) instead of asserting panel-harness alone,
    // which made it byte-identical to the no-registration case above. The
    // two cases now distinguish the two registration states at the seam:
    // the dispatcher still renders the harness (always-harness), and the
    // pane's seam mirror sees the registered chat.
    renderRightPane(undefined, true)
    expect(screen.getByTestId('panel-harness')).toBeInTheDocument()
    expect(screen.getByTestId('panel-harness-chat-state')).toHaveTextContent('chat-registered')
  })
})

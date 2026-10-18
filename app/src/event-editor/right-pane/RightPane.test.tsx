/**
 * RightPane smoke tests. The three panels each have heavier per-panel
 * tests adjacent to this file; this one is just the chrome dispatcher:
 *
 *  - default active mode → AI panel renders
 *  - clicking a tab updates workspace state and switches the body
 *  - aria-selected reflects active mode
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  WorkspaceProvider,
  type WorkspaceContextValue,
} from '../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../workspace/types'

// Stub the panels so the dispatcher test doesn't transitively pull each
// panel's fetches. Each panel has its own focused test file.
vi.mock('./ai/AiTabPanel', () => ({
  AiTabPanel: () => <div data-testid="panel-ai">AI</div>,
}))
vi.mock('./search/SearchTabPanel', () => ({
  SearchTabPanel: () => <div data-testid="panel-search">SEARCH</div>,
}))
vi.mock('./details/DetailsTabPanel', () => ({
  DetailsTabPanel: () => <div data-testid="panel-details">DETAILS</div>,
}))
vi.mock('./protocol/ProtocolTabPanel', () => ({
  ProtocolTabPanel: () => <div data-testid="panel-protocol">PROTOCOL</div>,
}))

// The universal pane (harness) — what a surface with a REGISTERED chat shows.
vi.mock('../../agent/HarnessChatPane', () => ({
  HarnessChatPane: () => <div data-testid="panel-harness">HARNESS</div>,
}))

// Which chat the shared AI-panel slot holds. `null` models a surface that has
// not registered one.
const panelSlot = vi.hoisted(() => ({ chat: null as unknown }))
vi.mock('../../shared/context/AiPanelContext', () => ({
  useOptionalAiPanel: () => ({ chat: panelSlot.chat }),
  useAiPanel: () => ({ chat: panelSlot.chat }),
}))

import { RightPane } from './RightPane'

beforeEach(() => {
  window.localStorage.clear()
  panelSlot.chat = null
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function renderRightPane(initialMode?: WorkspaceContextValue['state']['rightPaneMode']) {
  const state = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
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
        <RightPane />
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}

describe('RightPane', () => {
  it('renders the AI panel by default', async () => {
    // Default rightPaneMode is 'ai', so a freshly-opened study shows
    // the AI panel first.
    renderRightPane()
    await screen.findByTestId('panel-ai')
    expect(screen.queryByTestId('panel-search')).toBeNull()
  })

  it('clicking Search switches the active panel', async () => {
    renderRightPane()
    await screen.findByTestId('panel-ai')
    fireEvent.click(screen.getByTestId('right-pane-tab-search'))
    expect(screen.getByTestId('panel-search')).toBeTruthy()
    expect(screen.queryByTestId('panel-ai')).toBeNull()
  })

  it('clicking Details switches the active panel', async () => {
    renderRightPane()
    await screen.findByTestId('panel-ai')
    fireEvent.click(screen.getByTestId('right-pane-tab-details'))
    expect(screen.getByTestId('panel-details')).toBeTruthy()
    expect(screen.queryByTestId('panel-ai')).toBeNull()
  })

  it('renders four tab buttons in order: AI · Search · Details · Protocol', async () => {
    renderRightPane()
    await screen.findByTestId('panel-ai')
    const tabs = screen.getAllByRole('tab').map((el) => el.textContent)
    expect(tabs).toEqual(['AI', 'Search', 'Details', 'Protocol'])
  })

  it('aria-selected reflects the active mode', async () => {
    renderRightPane('ai')
    await screen.findByTestId('panel-ai')
    expect(
      screen.getByTestId('right-pane-tab-ai').getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByTestId('right-pane-tab-search').getAttribute('aria-selected'),
    ).toBe('false')
  })

  it('persisted find mode normalizes to AI panel', async () => {
    // Legacy back-compat: workspace.yaml still carries 'find' for old
    // workspace files. RightPane should treat it as 'ai'.
    renderRightPane('find')
    await screen.findByTestId('panel-ai')
    expect(screen.queryByTestId('panel-search')).toBeNull()
  })
})


describe('RightPane — universal chat pane', () => {
  it('falls back to the legacy AI panel when the surface registered no chat', () => {
    panelSlot.chat = null
    renderRightPane()
    expect(screen.getByTestId('panel-ai')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-harness')).toBeNull()
  })

  it('renders the universal chat pane when the surface registered one', () => {
    panelSlot.chat = { messages: [], isStreaming: false, sendPrompt: () => {}, cancelStream: () => {} }
    renderRightPane()
    expect(screen.getByTestId('panel-harness')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-ai')).toBeNull()
  })
})

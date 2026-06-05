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
vi.mock('./find/FindTabPanel', () => ({
  FindTabPanel: () => <div data-testid="panel-find">FIND</div>,
}))

import { RightPane } from './RightPane'

beforeEach(() => {
  window.localStorage.clear()
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
  it('renders the Find panel by default', async () => {
    // Phase 12: defaultWorkspaceState lands on 'find' so a freshly-
    // opened study shows the in-project tree first instead of an empty
    // chat. AI is one click away.
    renderRightPane()
    await screen.findByTestId('panel-find')
    expect(screen.queryByTestId('panel-ai')).toBeNull()
  })

  it('clicking AI switches the active panel', async () => {
    renderRightPane()
    await screen.findByTestId('panel-find')
    fireEvent.click(screen.getByTestId('right-pane-tab-ai'))
    expect(screen.getByTestId('panel-ai')).toBeTruthy()
    expect(screen.queryByTestId('panel-find')).toBeNull()
  })

  it('clicking Search switches the active panel', async () => {
    renderRightPane()
    await screen.findByTestId('panel-find')
    fireEvent.click(screen.getByTestId('right-pane-tab-search'))
    expect(screen.getByTestId('panel-search')).toBeTruthy()
  })

  it('aria-selected reflects the active mode', async () => {
    renderRightPane('find')
    await screen.findByTestId('panel-find')
    expect(
      screen.getByTestId('right-pane-tab-find').getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen.getByTestId('right-pane-tab-ai').getAttribute('aria-selected'),
    ).toBe('false')
  })
})

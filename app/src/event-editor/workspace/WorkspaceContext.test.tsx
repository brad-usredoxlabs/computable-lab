/**
 * Smoke tests for WorkspaceProvider — verifies that:
 *  - the provider loads initial state from the (mocked) server on mount
 *  - the consumer renders that state once load resolves
 *  - state mutations trigger a single debounced save
 *  - load failures still mark `ready=true` so the UI doesn't spin forever
 *
 * Uses the `loadFn` / `saveFn` injection seams on WorkspaceProvider so the
 * tests don't depend on the real apiClient / fetch.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  defaultWorkspaceState,
  type WorkspaceState,
} from './types'
import { useWorkspace, WorkspaceProvider } from './WorkspaceContext'

afterEach(() => {
  cleanup()
})

function Consumer() {
  const ws = useWorkspace()
  return (
    <div>
      <div data-testid="ready">{ws.ready ? 'ready' : 'pending'}</div>
      <div data-testid="study">{ws.state.studyId}</div>
      <div data-testid="mode">{ws.state.rightPaneMode}</div>
      <div data-testid="tab-count">{ws.state.tabs.length}</div>
      <div data-testid="active-tab">{ws.state.activeTabId ?? '-'}</div>
      <div data-testid="error">{ws.error ?? '-'}</div>
      <button
        type="button"
        data-testid="open-deck"
        onClick={() =>
          ws.openTab({
            id: 'deck-1',
            kind: 'deck',
            eventGraphId: 'EVG-1',
            title: 'Run 1',
          })
        }
      >
        open
      </button>
      <button
        type="button"
        data-testid="switch-mode"
        onClick={() => ws.setRightPaneMode('browse')}
      >
        browse
      </button>
    </div>
  )
}

describe('WorkspaceProvider', () => {
  it('loads initial state from the server on mount', async () => {
    const state: WorkspaceState = {
      ...defaultWorkspaceState('STU-000001'),
      rightPaneMode: 'browse',
      tabs: [
        {
          id: 'existing',
          kind: 'pdf',
          artifactId: 'ART-1',
          title: 'Existing tab',
        },
      ],
      activeTabId: 'existing',
    }
    const loadFn = vi.fn(async () => ({ state }))
    const saveFn = vi.fn(async (_studyId: string, s: WorkspaceState) => ({ state: s }))

    render(
      <WorkspaceProvider
        studyId="STU-000001"
        loadFn={loadFn}
        saveFn={saveFn}
        saveDebounceMs={20}
      >
        <Consumer />
      </WorkspaceProvider>,
    )

    expect(screen.getByTestId('ready').textContent).toBe('pending')
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('ready'),
    )
    expect(screen.getByTestId('mode').textContent).toBe('browse')
    expect(screen.getByTestId('tab-count').textContent).toBe('1')
    expect(loadFn).toHaveBeenCalledWith('STU-000001')
    // No save should have fired yet — initial load is not echoed back.
    expect(saveFn).not.toHaveBeenCalled()
  })

  it('debounces saves on rapid state changes', async () => {
    const state: WorkspaceState = defaultWorkspaceState('STU-000001')
    const loadFn = vi.fn(async () => ({ state }))
    const saveFn = vi.fn(async (_studyId: string, s: WorkspaceState) => ({ state: s }))

    render(
      <WorkspaceProvider
        studyId="STU-000001"
        loadFn={loadFn}
        saveFn={saveFn}
        saveDebounceMs={50}
      >
        <Consumer />
      </WorkspaceProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('ready'),
    )

    // Two changes within the debounce window — saveFn should fire once.
    act(() => {
      screen.getByTestId('switch-mode').click()
    })
    act(() => {
      screen.getByTestId('open-deck').click()
    })

    await waitFor(
      () => expect(saveFn).toHaveBeenCalledTimes(1),
      { timeout: 200 },
    )
    const saved = saveFn.mock.calls[0][1] as WorkspaceState
    expect(saved.rightPaneMode).toBe('browse')
    expect(saved.tabs).toHaveLength(1)
    expect(saved.activeTabId).toBe('deck-1')
  })

  it('marks ready even when the initial load fails', async () => {
    const loadFn = vi.fn(async () => {
      throw new Error('network down')
    })
    const saveFn = vi.fn(async (_studyId: string, s: WorkspaceState) => ({ state: s }))

    render(
      <WorkspaceProvider
        studyId="STU-000001"
        loadFn={loadFn}
        saveFn={saveFn}
        saveDebounceMs={0}
      >
        <Consumer />
      </WorkspaceProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('ready').textContent).toBe('ready'),
    )
    expect(screen.getByTestId('error').textContent).toContain('network down')
    // Default state should still be available, not a spinner-forever.
    expect(screen.getByTestId('study').textContent).toBe('STU-000001')
    expect(screen.getByTestId('mode').textContent).toBe('ai')
  })

  it('reloads when studyId prop changes', async () => {
    const loadFn = vi.fn(async (studyId: string) => ({
      state: { ...defaultWorkspaceState(studyId), rightPaneMode: 'browse' as const },
    }))
    const saveFn = vi.fn(async (_studyId: string, s: WorkspaceState) => ({ state: s }))

    const { rerender } = render(
      <WorkspaceProvider
        studyId="STU-000001"
        loadFn={loadFn}
        saveFn={saveFn}
        saveDebounceMs={20}
      >
        <Consumer />
      </WorkspaceProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('study').textContent).toBe('STU-000001'))
    expect(loadFn).toHaveBeenCalledWith('STU-000001')

    rerender(
      <WorkspaceProvider
        studyId="STU-000002"
        loadFn={loadFn}
        saveFn={saveFn}
        saveDebounceMs={20}
      >
        <Consumer />
      </WorkspaceProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('study').textContent).toBe('STU-000002'))
    expect(loadFn).toHaveBeenCalledWith('STU-000002')
  })
})

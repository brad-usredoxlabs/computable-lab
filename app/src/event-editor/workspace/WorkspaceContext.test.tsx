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
  type WorkspaceTab,
} from './types'
import { useWorkspace, WorkspaceProvider } from './WorkspaceContext'
import { useRef, useEffect } from 'react'

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
        onClick={() => ws.setRightPaneMode('find')}
      >
        find
      </button>
    </div>
  )
}

describe('WorkspaceProvider', () => {
  it('loads initial state from the server on mount', async () => {
    const state: WorkspaceState = {
      ...defaultWorkspaceState('STU-000001'),
      rightPaneMode: 'find',
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
    expect(screen.getByTestId('mode').textContent).toBe('find')
    // loadFn returns state with its tabs field explicitly set to one pdf,
    // overriding defaultWorkspaceState's project-details seed. The
    // workspace provider trusts what the server hands it; the
    // project-details auto-insert lives in ProjectWorkspacePage, not here.
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
    expect(saved.rightPaneMode).toBe('find')
    // Phase 12: defaultWorkspaceState seeds a project-details tab, and
    // `open-deck` adds the deck on top — so we expect 2 tabs (details + deck).
    expect(saved.tabs).toHaveLength(2)
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
    // DefaultWorkspaceState rightPaneMode is 'ai' (find was deprecated).
    expect(screen.getByTestId('mode').textContent).toBe('ai')
  })

  it('reloads when studyId prop changes', async () => {
    const loadFn = vi.fn(async (studyId: string) => ({
      state: { ...defaultWorkspaceState(studyId), rightPaneMode: 'find' as const },
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

  /** RED pin for FIXTURE-BOARD ruling §Ruling 1-2:
   * The first frame where ready === true must show the route-named tab,
   * never the stale sidecar activeTabId. This test proves the flake
   * (or validates the fix once the routeActivation prop is wired). */
  it('routeActivation overrides stale sidecar activeTabId before first ready frame', async () => {
    // Record every render frame where ready flips to true
    const observedFrames: Array<{ ready: boolean; activeTabId: string | null }> = []
    function FrameRecorder() {
      const ws = useWorkspace()
      const ref = useRef(observedFrames)
      useEffect(() => {
        ref.current.push({ ready: ws.ready, activeTabId: ws.state.activeTabId })
      })
      return null
    }

    // Sidecar returns a stale activeTabId (legacy tab)
    const staleState: WorkspaceState = {
      ...defaultWorkspaceState('STU-000001'),
      tabs: [
        { id: 'tab-deck-EVG-legacy', kind: 'deck', eventGraphId: 'EVG-legacy', title: 'EVG-legacy' },
        { id: 'tab-deck-EVG-fixture', kind: 'deck', eventGraphId: 'EVG-fixture', title: 'EVG-fixture' },
      ],
      activeTabId: 'tab-deck-EVG-legacy', // stale — should NOT win first paint
    }
    const routeTab: WorkspaceTab = {
      id: 'tab-deck-EVG-fixture',
      kind: 'deck',
      eventGraphId: 'EVG-fixture',
      title: 'EVG-fixture',
    }
    const loadFn = vi.fn(async () => ({ state: staleState }))
    const saveFn = vi.fn(async (_studyId: string, s: WorkspaceState) => ({ state: s }))

    render(
      <WorkspaceProvider
        studyId="STU-000001"
        loadFn={loadFn}
        saveFn={saveFn}
        saveDebounceMs={0}
        routeActivation={{ tab: routeTab, activate: true }}
      >
        <FrameRecorder />
      </WorkspaceProvider>,
    )

    await waitFor(() => {
      const readyFrames = observedFrames.filter((f) => f.ready)
      expect(readyFrames.length).toBeGreaterThan(0)
      // The FIRST ready frame must NOT show the stale tab
      expect(readyFrames[0].activeTabId).toBe('tab-deck-EVG-fixture')
      // No ready frame should ever show the stale id
      expect(readyFrames.some((f) => f.activeTabId === 'tab-deck-EVG-legacy')).toBe(false)
    })
  })
})

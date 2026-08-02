/**
 * Pure-reducer tests for the workspace state machine.
 *
 * The reducer is intentionally side-effect-free, so these run without React
 * or jsdom. Covers the contract that the UI depends on:
 *  - opening a tab activates it by default
 *  - opening an already-open tab updates its title without dupe
 *  - closing the active tab falls back to the right neighbor then the left
 *  - replace overrides everything (used on initial load from the server)
 *  - exhaustiveness — adding a new action type must update the reducer
 */

import { describe, expect, it } from 'vitest'
import { defaultWorkspaceState, type WorkspaceState } from './types'
import { workspaceReducer } from './reducer'

describe('workspaceReducer', () => {
  // Phase 12 made `defaultWorkspaceState` seed a project-details tab so
  // the workspace always has a landing surface. The reducer tests pre-date
  // that and are about reducer mechanics, not default seeding — start
  // from an empty tabs/activeTabId so length assertions stay focused.
  const emptyBase = (): WorkspaceState => ({
    ...defaultWorkspaceState('STU-000001'),
    tabs: [],
    activeTabId: null,
  })
  const base = emptyBase()

  describe('open-tab', () => {
    it('appends a new tab and activates it by default', () => {
      const next = workspaceReducer(base, {
        type: 'open-tab',
        tab: {
          id: 'tab-1',
          kind: 'deck',
          eventGraphId: 'EVG-1',
          title: 'Run 1',
        },
      })
      expect(next.tabs).toHaveLength(1)
      expect(next.activeTabId).toBe('tab-1')
    })

    it('does not activate when activate=false', () => {
      const next = workspaceReducer(base, {
        type: 'open-tab',
        tab: {
          id: 'tab-1',
          kind: 'deck',
          eventGraphId: 'EVG-1',
          title: 'Run 1',
        },
        activate: false,
      })
      expect(next.tabs).toHaveLength(1)
      expect(next.activeTabId).toBeNull()
    })

    it('updating an existing tab id replaces its content without duplicating', () => {
      const seeded = workspaceReducer(base, {
        type: 'open-tab',
        tab: {
          id: 'tab-1',
          kind: 'pdf',
          artifactId: 'ART-1',
          title: 'Old title',
        },
      })
      const next = workspaceReducer(seeded, {
        type: 'open-tab',
        tab: {
          id: 'tab-1',
          kind: 'pdf',
          artifactId: 'ART-1',
          title: 'New title',
        },
      })
      expect(next.tabs).toHaveLength(1)
      expect(next.tabs[0].title).toBe('New title')
    })
  })

  describe('close-tab', () => {
    const threeTabs = workspaceReducer(
      workspaceReducer(
        workspaceReducer(base, {
          type: 'open-tab',
          tab: { id: 't1', kind: 'deck', eventGraphId: 'EVG-1', title: 'A' },
        }),
        {
          type: 'open-tab',
          tab: { id: 't2', kind: 'deck', eventGraphId: 'EVG-2', title: 'B' },
        },
      ),
      {
        type: 'open-tab',
        tab: { id: 't3', kind: 'deck', eventGraphId: 'EVG-3', title: 'C' },
      },
    )

    it('removes the tab', () => {
      const next = workspaceReducer(threeTabs, { type: 'close-tab', tabId: 't2' })
      expect(next.tabs.map((t) => t.id)).toEqual(['t1', 't3'])
    })

    it('falls back to right neighbor when closing the active tab', () => {
      const middleActive = { ...threeTabs, activeTabId: 't2' }
      const next = workspaceReducer(middleActive, {
        type: 'close-tab',
        tabId: 't2',
      })
      expect(next.activeTabId).toBe('t3')
    })

    it('falls back to left neighbor when closing the rightmost active tab', () => {
      const rightActive = { ...threeTabs, activeTabId: 't3' }
      const next = workspaceReducer(rightActive, {
        type: 'close-tab',
        tabId: 't3',
      })
      expect(next.activeTabId).toBe('t2')
    })

    it('activeTabId becomes null when closing the last tab', () => {
      const single = workspaceReducer(base, {
        type: 'open-tab',
        tab: { id: 'only', kind: 'deck', eventGraphId: 'EVG', title: 'Only' },
      })
      const next = workspaceReducer(single, {
        type: 'close-tab',
        tabId: 'only',
      })
      expect(next.tabs).toHaveLength(0)
      expect(next.activeTabId).toBeNull()
    })

    it('leaves activeTabId untouched when closing a different tab', () => {
      const rightActive = { ...threeTabs, activeTabId: 't1' }
      const next = workspaceReducer(rightActive, {
        type: 'close-tab',
        tabId: 't3',
      })
      expect(next.activeTabId).toBe('t1')
    })
  })

  describe('activate-tab', () => {
    it('ignores unknown tab ids (UI safety net)', () => {
      const next = workspaceReducer(base, {
        type: 'activate-tab',
        tabId: 'does-not-exist',
      })
      expect(next).toBe(base)
    })

    it('activates an existing tab', () => {
      const seeded = workspaceReducer(base, {
        type: 'open-tab',
        tab: { id: 't1', kind: 'deck', eventGraphId: 'EVG-1', title: 'A' },
        activate: false,
      })
      const next = workspaceReducer(seeded, {
        type: 'activate-tab',
        tabId: 't1',
      })
      expect(next.activeTabId).toBe('t1')
    })
  })

  describe('rename-tab', () => {
    it('updates only the matching tab title', () => {
      const seeded = workspaceReducer(base, {
        type: 'open-tab',
        tab: { id: 't1', kind: 'deck', eventGraphId: 'EVG-1', title: 'Old' },
      })
      const next = workspaceReducer(seeded, {
        type: 'rename-tab',
        tabId: 't1',
        title: 'New',
      })
      expect(next.tabs[0].title).toBe('New')
    })
  })

  describe('right pane', () => {
    it('changes mode', () => {
      const next = workspaceReducer(base, {
        type: 'set-right-pane-mode',
        mode: 'find',
      })
      expect(next.rightPaneMode).toBe('find')
    })

    it('can still be set to legacy find mode (reducer stores whatever)', () => {
      const next = workspaceReducer(base, {
        type: 'set-right-pane-mode',
        mode: 'ai',
      })
      expect(next.rightPaneMode).toBe('ai')
    })

    it('toggles collapsed', () => {
      const next = workspaceReducer(base, {
        type: 'set-right-pane-collapsed',
        collapsed: true,
      })
      expect(next.rightPaneCollapsed).toBe(true)
    })
  })

  describe('set-pane-widths', () => {
    it('replaces both widths', () => {
      const next = workspaceReducer(base, {
        type: 'set-pane-widths',
        left: 0.7,
        right: 0.3,
      })
      expect(next.paneWidths).toEqual({ left: 0.7, right: 0.3 })
    })
  })

  describe('replace', () => {
    it('overrides the whole state', () => {
      const swapped = workspaceReducer(base, {
        type: 'replace',
        state: {
          version: 3,
          studyId: 'STU-OTHER',
          tabs: [
            {
              id: 'x',
              kind: 'document',
              artifactId: 'ART-9',
              title: 'Other doc',
            },
          ],
          activeTabId: 'x',
          rightPaneMode: 'search',
          rightPaneCollapsed: true,
          paneWidths: { left: 0.5, right: 0.5 },
        },
      })
      expect(swapped.studyId).toBe('STU-OTHER')
      expect(swapped.tabs).toHaveLength(1)
      expect(swapped.rightPaneMode).toBe('search')
    })
  })
})

/**
 * Tests for OpenTabsContext — session-level tab store.
 */

import { describe, it, expect } from 'vitest'
import { openTabsReducer, type OpenTabsState } from './OpenTabsContext'
import type { WorkspaceTab, BreadcrumbItem } from '../../event-editor/workspace/types'

const projectTab: WorkspaceTab = {
  id: 'project:STU-1',
  kind: 'project',
  studyId: 'STU-1',
  title: 'DHVC',
}

const runTab: WorkspaceTab = {
  id: 'run:RUN-1',
  kind: 'run',
  runId: 'RUN-1',
  title: 'First Titration',
}

const claimTab: WorkspaceTab = {
  id: 'claim:CLM-1',
  kind: 'claim',
  claimId: 'CLM-1',
  title: 'Cytation 5 quantifies dsDNA',
}

const emptyState: OpenTabsState = { tabs: [], activeTabId: null, history: [], historyCursor: -1 }

/** Build an OpenTabState for a single tab with the per-tab content history. */
function tabEntry(tab: WorkspaceTab, mode: 'find' | 'ai' | 'protocol' = 'find', breadcrumb: BreadcrumbItem[] = []): OpenTabsState['tabs'][number] {
  return { tab, activeRightPaneMode: mode, breadcrumb, contentHistory: [tab], contentCursor: 0 }
}

const sampleCrumb: BreadcrumbItem = {
  label: 'DHVC Project',
  entityType: 'project',
  id: 'STU-1',
  route: '/project/STU-1',
}

const sampleCrumb2: BreadcrumbItem = {
  label: 'First Titration',
  entityType: 'run',
  id: 'RUN-1',
  route: '/project/STU-1/run/RUN-1',
}

describe('openTabsReducer', () => {
  it('opens a new tab and activates it', () => {
    const next = openTabsReducer(emptyState, { type: 'open', tab: projectTab })
    expect(next.tabs).toHaveLength(1)
    expect(next.tabs[0]?.tab.id).toBe('project:STU-1')
    expect(next.activeTabId).toBe('project:STU-1')
  })

  it('opens a tab without activating when activate=false', () => {
    const state: OpenTabsState = {
      tabs: [tabEntry(projectTab)],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, { type: 'open', tab: runTab, activate: false })
    expect(next.tabs).toHaveLength(2)
    expect(next.activeTabId).toBe('project:STU-1')
  })

  it('opens a duplicate tab id — replaces and activates', () => {
    const state: OpenTabsState = {
      tabs: [tabEntry(projectTab, 'find', [sampleCrumb])],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const updatedTab: WorkspaceTab = {
      ...projectTab,
      title: 'DHVC Updated',
    }
    const next = openTabsReducer(state, { type: 'open', tab: updatedTab })
    expect(next.tabs).toHaveLength(1)
    expect(next.tabs[0]?.tab.title).toBe('DHVC Updated')
    // Breadcrumb should be preserved on dedup
    expect(next.tabs[0]?.breadcrumb).toEqual([sampleCrumb])
  })

  it('closes a tab and falls back to sibling', () => {
    const state: OpenTabsState = {
      tabs: [
        tabEntry(projectTab),
        tabEntry(runTab, 'protocol'),
      ],
      activeTabId: 'run:RUN-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, { type: 'close', tabId: 'run:RUN-1' })
    expect(next.tabs).toHaveLength(1)
    expect(next.activeTabId).toBe('project:STU-1')
  })

  it('closes the last tab and sets activeTabId to null', () => {
    const state: OpenTabsState = {
      tabs: [tabEntry(projectTab)],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, { type: 'close', tabId: 'project:STU-1' })
    expect(next.tabs).toHaveLength(0)
    expect(next.activeTabId).toBe(null)
  })

  it('activates an existing tab', () => {
    const state: OpenTabsState = {
      tabs: [
        tabEntry(projectTab),
        tabEntry(claimTab, 'ai'),
      ],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, { type: 'activate', tabId: 'claim:CLM-1' })
    expect(next.activeTabId).toBe('claim:CLM-1')
  })

  it('rejects activation of unknown tab', () => {
    const state: OpenTabsState = {
      tabs: [tabEntry(projectTab)],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, { type: 'activate', tabId: 'unknown' })
    expect(next.activeTabId).toBe('project:STU-1')
  })

  it('sets right-pane mode per tab', () => {
    const state: OpenTabsState = {
      tabs: [
        tabEntry(projectTab),
        tabEntry(runTab, 'protocol'),
      ],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, {
      type: 'set-right-pane-mode',
      tabId: 'project:STU-1',
      mode: 'ai',
    })
    expect(next.tabs[0]?.activeRightPaneMode).toBe('ai')
    expect(next.tabs[1]?.activeRightPaneMode).toBe('protocol')
  })

  it('renames a tab', () => {
    const state: OpenTabsState = {
      tabs: [tabEntry(projectTab)],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, {
      type: 'rename',
      tabId: 'project:STU-1',
      title: 'New Title',
    })
    expect(next.tabs[0]?.tab.title).toBe('New Title')
  })

  // ── Breadcrumb tests ──

  it('opens with seedBreadcrumb and stores it', () => {
    const next = openTabsReducer(emptyState, {
      type: 'open',
      tab: projectTab,
      seedBreadcrumb: [sampleCrumb],
    })
    expect(next.tabs[0]?.breadcrumb).toEqual([sampleCrumb])
  })

  it('opens without seedBreadcrumb defaults to empty array', () => {
    const next = openTabsReducer(emptyState, { type: 'open', tab: projectTab })
    expect(next.tabs[0]?.breadcrumb).toEqual([])
  })

  it('navigate-active grows the active tab content history (per-tab trail)', () => {
    const state: OpenTabsState = {
      tabs: [tabEntry(projectTab, 'ai')],
      activeTabId: 'project:STU-1',
      history: [], historyCursor: -1,
    }
    const n1 = openTabsReducer(state, { type: 'navigate-active', tab: runTab, crumb: sampleCrumb })
    expect(n1.tabs[0]?.contentHistory).toHaveLength(2) // [project, run]
    expect(n1.tabs[0]?.contentCursor).toBe(1)
    const n2 = openTabsReducer(n1, { type: 'navigate-active', tab: claimTab })
    expect(n2.tabs[0]?.contentHistory).toHaveLength(3)
    expect(n2.tabs[0]?.contentCursor).toBe(2)
  })

  it('within-back/within-forward move within the ACTIVE tab only', () => {
    const n1 = openTabsReducer({ tabs: [tabEntry(projectTab, 'ai')], activeTabId: 'project:STU-1', history: [], historyCursor: -1 }, { type: 'navigate-active', tab: runTab })
    const n2 = openTabsReducer(n1, { type: 'navigate-active', tab: claimTab })
    expect(n2.tabs[0]?.tab.kind).toBe('claim')
    // Back twice → claim → run → project
    const b1 = openTabsReducer(n2, { type: 'within-back' })
    expect(b1.tabs[0]?.tab.kind).toBe('run')
    const b2 = openTabsReducer(b1, { type: 'within-back' })
    expect(b2.tabs[0]?.tab.kind).toBe('project')
    expect(b2.tabs[0]?.contentCursor).toBe(0)
    // Back at the start is a no-op.
    expect(openTabsReducer(b2, { type: 'within-back' })).toEqual(b2)
    // Forward returns to run then claim.
    const f1 = openTabsReducer(b2, { type: 'within-forward' })
    expect(f1.tabs[0]?.tab.kind).toBe('run')
    const f2 = openTabsReducer(f1, { type: 'within-forward' })
    expect(f2.tabs[0]?.tab.kind).toBe('claim')
    expect(openTabsReducer(f2, { type: 'within-forward' })).toEqual(f2)
  })

  it('BUG-REGRESSION: clicking an already-open entity from a NEW tab stays in that new tab (no revert, no duplicate)', () => {
    // Setup: the run is already open as tab 1 (id base `run:RUN-1`).
    const tab1 = { ...tabEntry(runTab) }
    tab1.tab = runTab // base id run:RUN-1
    const state: OpenTabsState = {
      tabs: [{ ...tab1, activeRightPaneMode: 'protocol' }],
      activeTabId: 'run:RUN-1',
      history: ['run:RUN-1'], historyCursor: 0,
    }
    // User clicks "+" → a fresh splash tab becomes active.
    const splash = { id: 'splash:1', kind: 'splash' as const, title: 'New Tab' }
    const afterPlus = openTabsReducer(state, { type: 'open', tab: splash })
    expect(afterPlus.tabs).toHaveLength(2)
    expect(afterPlus.activeTabId).toBe('splash:1')

    // From the splash tab, click the (already-open) run → navigate-active.
    const afterClick = openTabsReducer(afterPlus, { type: 'navigate-active', tab: runTab })
    // STILL exactly two tabs — we did NOT create a third, and did NOT switch
    // the active slot back to the original run tab.
    expect(afterClick.tabs).toHaveLength(2)
    // The active slot is a NEW run (not the original run:RUN-1) — differs by fresh id.
    expect(afterClick.activeTabId).not.toBe('run:RUN-1')
    // Both tabs hold the run entity but with DISTINCT slot ids (no duplicate key).
    const ids = afterClick.tabs.map((t) => t.tab.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('navigate-active replaces the ACTIVE tab content in place without creating a new tab', () => {
    const state: OpenTabsState = {
      tabs: [
        tabEntry(runTab, 'protocol'),
        tabEntry(projectTab, 'ai'),
      ],
      activeTabId: 'run:RUN-1',
      history: ['run:RUN-1'], historyCursor: 0,
    }
    const next = openTabsReducer(state, {
      type: 'navigate-active',
      tab: claimTab,
      crumb: { label: 'First Titration', entityType: 'run', id: 'RUN-1', route: '/runs/RUN-1' },
    })
    // Still exactly TWO tabs — no new top-level tab was created.
    expect(next.tabs).toHaveLength(2)
    // The run (active) slot's content changed to the claim tab. We mint a fresh
    // id so an entity already open in another tab does NOT collide/re-activate.
    const active = next.tabs.find((t) => t.tab.kind === 'claim' && t.tab.claimId === 'CLM-1')
    expect(active).toBeDefined()
    expect(next.activeTabId).toBe(active!.tab.id)
    // The OTHER (project) tab is untouched — we did NOT re-activate it.
    expect(next.tabs.find((t) => t.tab.id === 'project:STU-1')).toBeDefined()
    // activeTabId moved to the new content's id, not the other tab.
    expect(next.activeTabId).not.toBe('project:STU-1')
    // Crumb appended to the active slot.
    expect(active?.breadcrumb).toEqual([{ label: 'First Titration', entityType: 'run', id: 'RUN-1', route: '/runs/RUN-1' }])
  })

  it('navigate-active with no active tab falls back to opening a new tab', () => {
    const next = openTabsReducer(emptyState, {
      type: 'navigate-active',
      tab: claimTab,
      crumb: { label: 'Claim', entityType: 'claim', id: 'CLM-1', route: '/claims/CLM-1' },
    })
    expect(next.tabs).toHaveLength(1)
    expect(next.activeTabId).toBe(claimTab.id)
  })

  it('navigate replaces tab content and appends a crumb', () => {
    const state: OpenTabsState = {
      tabs: [tabEntry(projectTab, 'ai', [sampleCrumb])],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, {
      type: 'navigate',
      tabId: 'project:STU-1',
      tab: runTab,
      crumb: sampleCrumb2,
    })
    expect(next.tabs[0]?.tab.id).toBe('run:RUN-1')
    expect(next.tabs[0]?.breadcrumb).toEqual([sampleCrumb, sampleCrumb2])
  })

  it('navigate without crumb keeps breadcrumb unchanged', () => {
    const state: OpenTabsState = {
      tabs: [tabEntry(projectTab, 'ai', [sampleCrumb])],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, {
      type: 'navigate',
      tabId: 'project:STU-1',
      tab: runTab,
    })
    expect(next.tabs[0]?.tab.id).toBe('run:RUN-1')
    expect(next.tabs[0]?.breadcrumb).toEqual([sampleCrumb])
  })

  it('navigate skips tabs that do not match tabId', () => {
    const state: OpenTabsState = {
      tabs: [
        tabEntry(projectTab, 'ai'),
        tabEntry(claimTab, 'ai'),
      ],
      activeTabId: 'project:STU-1',
      history: [],
      historyCursor: -1,
    }
    const next = openTabsReducer(state, {
      type: 'navigate',
      tabId: 'claim:CLM-1',
      tab: runTab,
      crumb: sampleCrumb2,
    })
    // project tab unchanged
    expect(next.tabs[0]?.tab.id).toBe('project:STU-1')
    expect(next.tabs[0]?.breadcrumb).toEqual([])
    // claim tab navigated
    expect(next.tabs[1]?.tab.id).toBe('run:RUN-1')
    expect(next.tabs[1]?.breadcrumb).toEqual([sampleCrumb2])
  })
})

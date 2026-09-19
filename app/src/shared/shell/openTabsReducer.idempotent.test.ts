/**
 * navigate-active idempotence (bug: "Maximum update depth exceeded" in
 * WorkspaceShellHost / ProjectWorkspacePage).
 *
 * A host page re-registers its tab on mount:
 *   openTabs.navigateActiveTab({ id: projectTabId(studyId), kind: 'project', ... })
 * Two things made that fatal instead of idempotent:
 *  1. the effect depended on the whole context object, whose identity changes on
 *     every state change, and
 *  2. 'navigate-active' for the ALREADY-ACTIVE entity returned a brand-new state
 *     object even when nothing had changed — so the effect re-fired forever.
 *
 * These tests pin the reducer invariant that makes any host page's mount effect
 * safe: a no-op navigation returns the IDENTICAL state (no re-render, no churn).
 */
import { describe, expect, it } from 'vitest'
import { openTabsReducer, type OpenTabsState } from './OpenTabsContext'
import type { WorkspaceTab } from '../../event-editor/workspace/types'

const projectTab: WorkspaceTab = { id: 'project:STU-1', kind: 'project', studyId: 'STU-1', title: 'DHVC' }

function stateWithProject(title = 'DHVC'): OpenTabsState {
  const tab: WorkspaceTab = { ...projectTab, title }
  return {
    tabs: [{ tab, activeRightPaneMode: 'ai', breadcrumb: [], contentHistory: [tab], contentCursor: 0 }],
    activeTabId: tab.id,
    history: [tab.id],
    historyCursor: 0,
  }
}

describe('navigate-active on the already-active entity is a no-op', () => {
  it('returns the identical state object when nothing changed', () => {
    const state = stateWithProject()
    const next = openTabsReducer(state, { type: 'navigate-active', tab: projectTab })
    expect(next).toBe(state)
  })

  it('does not grow the tab content trail on a repeat registration', () => {
    const state = stateWithProject()
    const once = openTabsReducer(state, { type: 'navigate-active', tab: projectTab })
    const twice = openTabsReducer(once, { type: 'navigate-active', tab: projectTab })
    expect(twice).toBe(once)
    expect((twice ?? state).tabs[0]!.contentHistory).toHaveLength(1)
  })

  it('still updates when the title resolves (the study-title fetch)', () => {
    const state = stateWithProject('STU-1')
    const next = openTabsReducer(state, {
      type: 'navigate-active',
      tab: { ...projectTab, title: 'DHVC' },
    })
    expect(next).not.toBe(state)
    expect(next.tabs[0]!.tab.title).toBe('DHVC')
  })

  it('still records a breadcrumb when one is supplied', () => {
    const state = stateWithProject()
    const next = openTabsReducer(state, {
      type: 'navigate-active',
      tab: projectTab,
      crumb: { label: 'Projects', entityType: 'collection' },
    })
    expect(next).not.toBe(state)
    expect(next.tabs[0]!.breadcrumb).toHaveLength(1)
  })

  it('still navigates when the active slot holds a DIFFERENT entity', () => {
    const state = stateWithProject()
    const run: WorkspaceTab = { id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'Run' }
    const next = openTabsReducer(state, { type: 'navigate-active', tab: run })
    expect(next.activeTabId).not.toBe(state.activeTabId)
    const nextActive = next.tabs.find((t) => t.tab.id === next.activeTabId)!
    expect(nextActive.tab.kind).toBe('run')
  })
})

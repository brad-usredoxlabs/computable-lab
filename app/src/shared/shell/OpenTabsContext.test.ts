/**
 * Tests for OpenTabsContext — session-level tab store.
 */

import { describe, it, expect } from 'vitest'
import { openTabsReducer, type OpenTabsState } from './OpenTabsContext'
import type { WorkspaceTab } from '../../event-editor/workspace/types'

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

const emptyState: OpenTabsState = { tabs: [], activeTabId: null }

describe('openTabsReducer', () => {
  it('opens a new tab and activates it', () => {
    const next = openTabsReducer(emptyState, { type: 'open', tab: projectTab })
    expect(next.tabs).toHaveLength(1)
    expect(next.tabs[0]?.tab.id).toBe('project:STU-1')
    expect(next.activeTabId).toBe('project:STU-1')
  })

  it('opens a tab without activating when activate=false', () => {
    const state: OpenTabsState = {
      tabs: [{ tab: projectTab, activeRightPaneMode: 'find' }],
      activeTabId: 'project:STU-1',
    }
    const next = openTabsReducer(state, { type: 'open', tab: runTab, activate: false })
    expect(next.tabs).toHaveLength(2)
    expect(next.activeTabId).toBe('project:STU-1')
  })

  it('opens a duplicate tab id — replaces and activates', () => {
    const state: OpenTabsState = {
      tabs: [{ tab: projectTab, activeRightPaneMode: 'find' }],
      activeTabId: 'project:STU-1',
    }
    const updatedTab: WorkspaceTab = {
      ...projectTab,
      title: 'DHVC Updated',
    }
    const next = openTabsReducer(state, { type: 'open', tab: updatedTab })
    expect(next.tabs).toHaveLength(1)
    expect(next.tabs[0]?.tab.title).toBe('DHVC Updated')
  })

  it('closes a tab and falls back to sibling', () => {
    const state: OpenTabsState = {
      tabs: [
        { tab: projectTab, activeRightPaneMode: 'find' },
        { tab: runTab, activeRightPaneMode: 'protocol' },
      ],
      activeTabId: 'run:RUN-1',
    }
    const next = openTabsReducer(state, { type: 'close', tabId: 'run:RUN-1' })
    expect(next.tabs).toHaveLength(1)
    expect(next.activeTabId).toBe('project:STU-1')
  })

  it('closes the last tab and sets activeTabId to null', () => {
    const state: OpenTabsState = {
      tabs: [{ tab: projectTab, activeRightPaneMode: 'find' }],
      activeTabId: 'project:STU-1',
    }
    const next = openTabsReducer(state, { type: 'close', tabId: 'project:STU-1' })
    expect(next.tabs).toHaveLength(0)
    expect(next.activeTabId).toBe(null)
  })

  it('activates an existing tab', () => {
    const state: OpenTabsState = {
      tabs: [
        { tab: projectTab, activeRightPaneMode: 'find' },
        { tab: claimTab, activeRightPaneMode: 'ai' },
      ],
      activeTabId: 'project:STU-1',
    }
    const next = openTabsReducer(state, { type: 'activate', tabId: 'claim:CLM-1' })
    expect(next.activeTabId).toBe('claim:CLM-1')
  })

  it('rejects activation of unknown tab', () => {
    const state: OpenTabsState = {
      tabs: [{ tab: projectTab, activeRightPaneMode: 'find' }],
      activeTabId: 'project:STU-1',
    }
    const next = openTabsReducer(state, { type: 'activate', tabId: 'unknown' })
    expect(next.activeTabId).toBe('project:STU-1')
  })

  it('sets right-pane mode per tab', () => {
    const state: OpenTabsState = {
      tabs: [
        { tab: projectTab, activeRightPaneMode: 'find' },
        { tab: runTab, activeRightPaneMode: 'protocol' },
      ],
      activeTabId: 'project:STU-1',
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
      tabs: [{ tab: projectTab, activeRightPaneMode: 'find' }],
      activeTabId: 'project:STU-1',
    }
    const next = openTabsReducer(state, {
      type: 'rename',
      tabId: 'project:STU-1',
      title: 'New Title',
    })
    expect(next.tabs[0]?.tab.title).toBe('New Title')
  })
})

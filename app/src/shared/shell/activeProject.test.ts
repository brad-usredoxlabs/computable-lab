/**
 * activeProjectFromTabs — "which project am I in?" from the open-tabs store.
 */
import { describe, expect, it } from 'vitest'
import { activeProjectFromTabs } from './activeProject'
import type { OpenTabsState } from './OpenTabsContext'
import type { WorkspaceTab } from '../../event-editor/workspace/types'

const project = (id: string, studyId: string, title: string): WorkspaceTab => ({
  id,
  kind: 'project',
  studyId,
  title,
})

const claim = (id: string): WorkspaceTab => ({ id, kind: 'claim', claimId: 'CLM-1', title: 'a claim' })

function tabEntry(tab: WorkspaceTab) {
  return {
    tab,
    activeRightPaneMode: 'chat',
    breadcrumb: [],
    contentHistory: [tab],
    contentCursor: 0,
  }
}

function state(
  tabs: WorkspaceTab[],
  activeTabId: string | null,
  history: string[] = [],
): OpenTabsState {
  return {
    tabs: tabs.map(tabEntry),
    activeTabId,
    history,
    historyCursor: history.length - 1,
  } as unknown as OpenTabsState
}

describe('activeProjectFromTabs', () => {
  it('returns null with no state or no project tabs', () => {
    expect(activeProjectFromTabs(null)).toBeNull()
    expect(activeProjectFromTabs(state([claim('t1')], 't1'))).toBeNull()
  })

  it('prefers the active tab when it is a project', () => {
    const s = state(
      [project('p1', 'STU-1', 'First'), project('p2', 'STU-2', 'Second')],
      'p2',
    )
    expect(activeProjectFromTabs(s)).toEqual({ studyId: 'STU-2', title: 'Second' })
  })

  it('falls back to the most recently visited project tab when the active tab is not a project', () => {
    // p1 visited, then p2, then the user clicked away to a claim tab.
    const s = state([project('p1', 'STU-1', 'First'), project('p2', 'STU-2', 'Second'), claim('c1')], 'c1', [
      'p1',
      'p2',
      'c1',
    ])
    expect(activeProjectFromTabs(s)).toEqual({ studyId: 'STU-2', title: 'Second' })
  })

  it('falls back to the last open project tab when there is no visit history', () => {
    const s = state([project('p1', 'STU-1', 'First'), project('p2', 'STU-2', 'Second'), claim('c1')], 'c1')
    expect(activeProjectFromTabs(s)).toEqual({ studyId: 'STU-2', title: 'Second' })
  })
})

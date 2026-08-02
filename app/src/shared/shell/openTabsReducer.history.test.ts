import { describe, expect, it } from 'vitest'
import { openTabsReducer, type OpenTabsState } from './OpenTabsContext'
import type { WorkspaceTab } from '../../event-editor/workspace/types'

const empty: OpenTabsState = { tabs: [], activeTabId: null, history: [], historyCursor: -1 }

function tab(id: string): WorkspaceTab {
  return { id, kind: 'run', runId: id, title: id }
}

function open(state: OpenTabsState, id: string, activate = true): OpenTabsState {
  return openTabsReducer(state, { type: 'open', tab: tab(id), ...(activate ? { activate } : {}) })
}
function activate(state: OpenTabsState, id: string): OpenTabsState {
  return openTabsReducer(state, { type: 'activate', tabId: id })
}
function back(state: OpenTabsState): OpenTabsState {
  return openTabsReducer(state, { type: 'back' })
}
function forward(state: OpenTabsState): OpenTabsState {
  return openTabsReducer(state, { type: 'forward' })
}

describe('OpenTabs across-tab history', () => {
  it('records a visit when the active tab changes; re-activating the current tab is a no-op (refresh-safe)', () => {
    let s = open(empty, 'A') // A active, history=[A]
    s = open(s, 'B') // B active, history=[A,B]
    s = open(s, 'C') // C active, history=[A,B,C]
    expect(s.history).toEqual(['A', 'B', 'C'])
    expect(s.historyCursor).toBe(2)

    // Simulate a host page re-registering the current tab after refresh:
    const afterRefresh = open(s, 'C')
    expect(afterRefresh.history).toEqual(['A', 'B', 'C'])
    expect(afterRefresh.historyCursor).toBe(2)
  })

  it('back moves to previous tab; forward moves forward again', () => {
    let s = open(open(open(empty, 'A'), 'B'), 'C') // [A,B,C] cur=2
    s = back(s)
    expect(s.activeTabId).toBe('B')
    expect(s.historyCursor).toBe(1)
    s = back(s)
    expect(s.activeTabId).toBe('A')
    expect(s.historyCursor).toBe(0)
    // At the start — back is a no-op
    expect(back(s).activeTabId).toBe('A')

    s = forward(s)
    expect(s.activeTabId).toBe('B')
    expect(s.historyCursor).toBe(1)
    s = forward(s)
    expect(s.activeTabId).toBe('C')
    expect(s.historyCursor).toBe(2)
    // At the end — forward is a no-op
    expect(forward(s).activeTabId).toBe('C')
  })

  it('navigating to a new tab after a back truncates the forward history', () => {
    let s = open(open(open(empty, 'A'), 'B'), 'C') // [A,B,C] cur=2
    s = back(s) // cur=1 at B
    s = open(s, 'D') // visit D → truncates C, [A,B,D] cur=2
    expect(s.history).toEqual(['A', 'B', 'D'])
    expect(s.historyCursor).toBe(2)
    // Forward is now exhausted (C was truncated)
    expect(forward(s).activeTabId).toBe('D')
  })

  it('activation via the strip records a visit', () => {
    let s = open(open(empty, 'A'), 'B')
    s = activate(s, 'A')
    expect(s.activeTabId).toBe('A')
    expect(s.history).toEqual(['A', 'B', 'A'])
    expect(s.historyCursor).toBe(2)
  })

  it('back/forward skip closed tabs', () => {
    let s = open(open(open(empty, 'A'), 'B'), 'C') // [A,B,C] cur=2
    // Close B (remove from tabs), keeping it in history
    s = openTabsReducer(s, { type: 'close', tabId: 'B' })
    s = back(s) // target B, but B is closed → skip to A
    expect(s.activeTabId).toBe('A')
    s = forward(s) // from A, skip B (closed) → C
    expect(s.activeTabId).toBe('C')
  })

  it('closing the active tab does not push the neighbor onto history', () => {
    let s = open(open(open(empty, 'A'), 'B'), 'C') // active C, [A,B,C]
    s = openTabsReducer(s, { type: 'close', tabId: 'C' })
    // neighbor B becomes active but history is unchanged (len 3, cur 2)
    expect(s.activeTabId).toBe('B')
    expect(s.history).toEqual(['A', 'B', 'C'])
    expect(s.historyCursor).toBe(2)
  })

  it('back then a mount-time re-registration of the target does not pollute history', () => {
    // Simulate: run page opens run → click zymo tab → Back → run page remounts
    // and re-registers the (now-active) run tab.
    let s = open(open(empty, 'A'), 'B') // B active, [A,B]
    s = back(s) // A active, cursor 0
    expect(s.history).toEqual(['A', 'B'])
    expect(s.historyCursor).toBe(0)
    s = open(s, 'A') // re-registration of active A → no-op
    expect(s.history).toEqual(['A', 'B'])
    expect(s.historyCursor).toBe(0)
    // Forward is available (B is ahead)
    s = forward(s)
    expect(s.activeTabId).toBe('B')
    expect(s.historyCursor).toBe(1)
  })
})

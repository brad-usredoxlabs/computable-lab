/**
 * Pure reducer for WorkspaceState. Kept separate from the React Context so
 * the transitions are unit-testable without rendering anything, and so the
 * persistence layer (debounced save in WorkspaceContext) can subscribe to
 * state changes via a single chokepoint.
 *
 * All actions return a new state object (immutability) so React `useState`
 * can detect a change with reference equality.
 */

import type {
  WorkspaceRightPaneMode,
  WorkspaceState,
  WorkspaceTab,
} from './types'

export type WorkspaceAction =
  | { type: 'open-tab'; tab: WorkspaceTab; activate?: boolean }
  | { type: 'close-tab'; tabId: string }
  | { type: 'activate-tab'; tabId: string }
  | { type: 'rename-tab'; tabId: string; title: string }
  | { type: 'bind-deck-tab'; tabId: string; eventGraphId: string }
  | { type: 'set-right-pane-mode'; mode: WorkspaceRightPaneMode }
  | { type: 'set-right-pane-collapsed'; collapsed: boolean }
  | { type: 'set-pane-widths'; left: number; right: number }
  | { type: 'replace'; state: WorkspaceState }

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case 'open-tab': {
      // Open is idempotent on id — if a tab with that id already exists,
      // just activate it (and optionally update the title/refs by replacing
      // the existing entry with the new one).
      const existingIndex = state.tabs.findIndex((t) => t.id === action.tab.id)
      const nextTabs =
        existingIndex >= 0
          ? state.tabs.map((t, i) => (i === existingIndex ? action.tab : t))
          : [...state.tabs, action.tab]
      const shouldActivate = action.activate ?? true
      return {
        ...state,
        tabs: nextTabs,
        activeTabId: shouldActivate ? action.tab.id : state.activeTabId,
      }
    }

    case 'close-tab': {
      const nextTabs = state.tabs.filter((t) => t.id !== action.tabId)
      // If we closed the active tab, fall back to the right neighbor first,
      // then the left, then null. This matches browser-tab UX.
      let nextActive = state.activeTabId
      if (state.activeTabId === action.tabId) {
        const closedIndex = state.tabs.findIndex((t) => t.id === action.tabId)
        const right = nextTabs[closedIndex]
        const left = nextTabs[closedIndex - 1]
        nextActive = right?.id ?? left?.id ?? null
      }
      return { ...state, tabs: nextTabs, activeTabId: nextActive }
    }

    case 'activate-tab': {
      // Reject activation of an unknown tab — caller bug; leave state alone
      // rather than dangling an activeTabId that doesn't resolve to a tab.
      if (!state.tabs.some((t) => t.id === action.tabId)) return state
      return { ...state, activeTabId: action.tabId }
    }

    case 'rename-tab': {
      const nextTabs = state.tabs.map((t) =>
        t.id === action.tabId ? { ...t, title: action.title } : t,
      )
      return { ...state, tabs: nextTabs }
    }

    case 'bind-deck-tab': {
      // A fresh canvas persisted its graph for the first time: bind the tab
      // to the saved record so tab switches and reloads rehydrate it.
      const nextTabs = state.tabs.map((t) =>
        t.id === action.tabId && t.kind === 'deck'
          ? { ...t, eventGraphId: action.eventGraphId }
          : t,
      )
      return { ...state, tabs: nextTabs }
    }

    case 'set-right-pane-mode':
      return { ...state, rightPaneMode: action.mode }

    case 'set-right-pane-collapsed':
      return { ...state, rightPaneCollapsed: action.collapsed }

    case 'set-pane-widths':
      return {
        ...state,
        paneWidths: { left: action.left, right: action.right },
      }

    case 'replace':
      // Used on initial load from the server and during a force-refresh.
      // Preserves the structural identity of unrelated fields by replacing
      // the whole object.
      return action.state

    default: {
      // Exhaustiveness check at compile time.
      const _exhaustive: never = action
      return _exhaustive ?? state
    }
  }
}

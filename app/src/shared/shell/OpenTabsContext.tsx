/**
 * OpenTabsContext — session-level store for all open workspace tabs.
 *
 * Replaces the study-only useOpenStudies + per-study WorkspaceContext with
 * a unified tab store that supports projects, runs, claims, and lab entities.
 *
 * Persists to localStorage (session-level, per-user, like the old
 * openStudiesStorage). The right-pane mode is stored per-tab so switching
 * tabs restores the right-pane selection.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.2, §12.4
 */

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react'
import type { WorkspaceRightPaneMode, WorkspaceTab } from '../../event-editor/workspace/types'

export interface OpenTabState {
  tab: WorkspaceTab
  activeRightPaneMode: WorkspaceRightPaneMode
}

export interface OpenTabsState {
  tabs: OpenTabState[]
  activeTabId: string | null
}

export type OpenTabsAction =
  | { type: 'open'; tab: WorkspaceTab; activate?: boolean }
  | { type: 'close'; tabId: string }
  | { type: 'activate'; tabId: string }
  | { type: 'rename'; tabId: string; title: string }
  | { type: 'set-right-pane-mode'; tabId: string; mode: WorkspaceRightPaneMode }
  | { type: 'replace'; state: OpenTabsState }

export function openTabsReducer(state: OpenTabsState, action: OpenTabsAction): OpenTabsState {
  switch (action.type) {
    case 'open': {
      const existingIndex = state.tabs.findIndex((t) => t.tab.id === action.tab.id)
      const shouldActivate = action.activate ?? true
      if (existingIndex >= 0) {
        // Replace the existing tab (updates refs) and optionally activate.
        const nextTabs = state.tabs.map((t, i) =>
          i === existingIndex ? { ...t, tab: action.tab } : t,
        )
        return {
          ...state,
          tabs: nextTabs,
          activeTabId: shouldActivate ? action.tab.id : state.activeTabId,
        }
      }
      const newEntry: OpenTabState = {
        tab: action.tab,
        activeRightPaneMode: defaultRightPaneMode(action.tab),
      }
      return {
        tabs: [...state.tabs, newEntry],
        activeTabId: shouldActivate ? action.tab.id : state.activeTabId,
      }
    }
    case 'close': {
      const nextTabs = state.tabs.filter((t) => t.tab.id !== action.tabId)
      let nextActive = state.activeTabId
      if (state.activeTabId === action.tabId) {
        const closedIndex = state.tabs.findIndex((t) => t.tab.id === action.tabId)
        const right = nextTabs[closedIndex]
        const left = nextTabs[closedIndex - 1]
        nextActive = right?.tab.id ?? left?.tab.id ?? null
      }
      return { tabs: nextTabs, activeTabId: nextActive }
    }
    case 'activate': {
      if (!state.tabs.some((t) => t.tab.id === action.tabId)) return state
      return { ...state, activeTabId: action.tabId }
    }
    case 'rename': {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.tab.id === action.tabId ? { ...t, tab: { ...t.tab, title: action.title } } : t,
        ),
      }
    }
    case 'set-right-pane-mode': {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.tab.id === action.tabId
            ? { ...t, activeRightPaneMode: action.mode }
            : t,
        ),
      }
    }
    case 'replace':
      return action.state
    default: {
      const _exhaustive: never = action
      return _exhaustive ?? state
    }
  }
}

function defaultRightPaneMode(tab: WorkspaceTab): WorkspaceRightPaneMode {
  switch (tab.kind) {
    case 'project':
    case 'project-details':
      return 'find'
    case 'run':
    case 'execution':
      return 'protocol'
    case 'claim':
      return 'ai'
    case 'lab-entity':
      return 'find'
    case 'deck':
      return 'ai'
    case 'pdf':
      return 'ai'
    case 'document':
      return 'ai'
    case 'record-create':
      return 'ai'
    case 'record-edit':
      return 'ai'
    case 'collection':
    case 'splash':
      return 'find'
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? 'ai'
    }
  }
}

// ── localStorage persistence ──────────────────────────────────────────

const STORAGE_KEY = 'cl-open-tabs'

interface StoredTabEntry {
  tab: WorkspaceTab
  activeRightPaneMode: WorkspaceRightPaneMode
}

interface StoredState {
  tabs: StoredTabEntry[]
  activeTabId: string | null
}

function loadFromStorage(userId?: string): OpenTabsState {
  const key = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { tabs: [], activeTabId: null }
    const parsed = JSON.parse(raw) as StoredState
    if (!Array.isArray(parsed.tabs)) return { tabs: [], activeTabId: null }
    return {
      tabs: parsed.tabs.map((t) => ({
        tab: t.tab,
        activeRightPaneMode: t.activeRightPaneMode ?? 'ai',
      })),
      activeTabId: parsed.activeTabId ?? null,
    }
  } catch {
    return { tabs: [], activeTabId: null }
  }
}

function saveToStorage(state: OpenTabsState, userId?: string) {
  const key = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY
  try {
    const toStore: StoredState = {
      tabs: state.tabs.map((t) => ({
        tab: t.tab,
        activeRightPaneMode: t.activeRightPaneMode,
      })),
      activeTabId: state.activeTabId,
    }
    localStorage.setItem(key, JSON.stringify(toStore))
  } catch {
    // localStorage might be full or unavailable — silently ignore.
  }
}

// ── Context ──────────────────────────────────────────────────────────

export interface OpenTabsContextValue {
  state: OpenTabsState
  openTab: (tab: WorkspaceTab, activate?: boolean) => void
  closeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  renameTab: (tabId: string, title: string) => void
  setRightPaneMode: (tabId: string, mode: WorkspaceRightPaneMode) => void
}

const OpenTabsContext = createContext<OpenTabsContextValue | null>(null)

export interface OpenTabsProviderProps {
  /** Optional user ID for per-user localStorage keys. */
  userId?: string
  children: ReactNode
}

export function OpenTabsProvider({ userId, children }: OpenTabsProviderProps) {
  const [state, dispatch] = useReducer(openTabsReducer, { tabs: [], activeTabId: null })

  // Load from localStorage on mount
  useEffect(() => {
    dispatch({ type: 'replace', state: loadFromStorage(userId) })
  }, [userId])

  // Persist to localStorage on state change
  useEffect(() => {
    saveToStorage(state, userId)
  }, [state, userId])

  const value: OpenTabsContextValue = {
    state,
    openTab: useCallback((tab: WorkspaceTab, activate?: boolean) => {
      dispatch({ type: 'open', tab, ...(activate !== undefined ? { activate } : {}) })
    }, []),
    closeTab: useCallback((tabId: string) => {
      dispatch({ type: 'close', tabId })
    }, []),
    activateTab: useCallback((tabId: string) => {
      dispatch({ type: 'activate', tabId })
    }, []),
    renameTab: useCallback((tabId: string, title: string) => {
      dispatch({ type: 'rename', tabId, title })
    }, []),
    setRightPaneMode: useCallback((tabId: string, mode: WorkspaceRightPaneMode) => {
      dispatch({ type: 'set-right-pane-mode', tabId, mode })
    }, []),
  }

  return <OpenTabsContext.Provider value={value}>{children}</OpenTabsContext.Provider>
}

export function useOpenTabs(): OpenTabsContextValue {
  const ctx = useContext(OpenTabsContext)
  if (!ctx) throw new Error('useOpenTabs must be used inside <OpenTabsProvider>')
  return ctx
}

/** Like useOpenTabs, but returns null outside a Provider. For components
 *  shared between the workspace shell and standalone routes. */
export function useOptionalOpenTabs(): OpenTabsContextValue | null {
  return useContext(OpenTabsContext)
}

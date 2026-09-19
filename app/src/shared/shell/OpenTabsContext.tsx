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
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type { BreadcrumbItem, WorkspaceRightPaneMode, WorkspaceTab } from '../../event-editor/workspace/types'
import { getCurrentUserId } from '../api/base'

export interface OpenTabState {
  tab: WorkspaceTab
  activeRightPaneMode: WorkspaceRightPaneMode
  /** Each tab's origin trail ("how I got here"), oldest → most recent. */
  breadcrumb: BreadcrumbItem[]
  /**
   * This tab's own visited-content trail (browser-model Back/Forward), oldest →
   * newest. `contentCursor` is the index of the current content.
   */
  contentHistory: WorkspaceTab[]
  contentCursor: number
}

export interface OpenTabsState {
  tabs: OpenTabState[]
  activeTabId: string | null
  /**
   * Global across-tab visit history (browser-style Back/Forward). Ordered
   * ids of tabs the user has visited, oldest → newest. `historyCursor` is
   * the index of the current active tab (-1 when empty).
   */
  history: string[]
  historyCursor: number
}

export type OpenTabsAction =
  | { type: 'open'; tab: WorkspaceTab; activate?: boolean; seedBreadcrumb?: BreadcrumbItem[] }
  | { type: 'navigate'; tabId: string; tab: WorkspaceTab; crumb?: BreadcrumbItem }
  /**
   * Browser-model in-place navigation: replace the ACTIVE tab's content with
   * `tab`, minting a fresh unique slot id so an entity already open in another
   * tab never collides with / re-activates that tab. Does not create a new tab
   * and does not switch to a different existing tab.
   */
  | { type: 'navigate-active'; tab: WorkspaceTab; crumb?: BreadcrumbItem }
  | { type: 'close'; tabId: string }
  | { type: 'activate'; tabId: string }
  | { type: 'rename'; tabId: string; title: string }
  | { type: 'set-right-pane-mode'; tabId: string; mode: WorkspaceRightPaneMode }
  | { type: 'replace'; state: OpenTabsState }
  | { type: 'back' }
  | { type: 'forward' }
  /** Move the ACTIVE tab back/forward within ITS OWN content history. */
  | { type: 'within-back' }
  | { type: 'within-forward' }

/**
 * Record a visit to `newActive` on the across-tab history. Returns the next
 * history/historyCursor, or an identity when the tab is unchanged. Crucially,
 * a no-op when the ACTIVE tab id is unchanged — that's what keeps a host page's
 * mount-time re-registration (openTab of the already-active tab after a refresh
 * or Back/Forward) from polluting the Back stack. Guarding on activeTabId
 * rather than the cursor makes this robust even when the cursor is transiently
 * out of alignment with the tab.
 */
function recordVisit(
  state: OpenTabsState,
  newActive: string,
): { history: string[]; historyCursor: number } {
  if (state.activeTabId === newActive) {
    return { history: state.history, historyCursor: state.historyCursor }
  }
  const keep = state.history.slice(0, state.historyCursor + 1)
  keep.push(newActive)
  return { history: keep, historyCursor: keep.length - 1 }
}

/** Resolve the back target id (skipping closed tabs), or null. */
export function backTargetId(state: OpenTabsState): string | null {
  let c = state.historyCursor - 1
  while (c >= 0 && !state.tabs.some((t) => t.tab.id === state.history[c])) c--
  return c >= 0 ? state.history[c] : null
}

/** Resolve the forward target id (skipping closed tabs), or null. */
export function forwardTargetId(state: OpenTabsState): string | null {
  let c = state.historyCursor + 1
  while (c < state.history.length && !state.tabs.some((t) => t.tab.id === state.history[c])) c++
  return c < state.history.length ? state.history[c] : null
}

/** Create a fresh tab state entry; its current content is the history's first entry. */
function newOpenTabState(tab: WorkspaceTab, seedBreadcrumb?: BreadcrumbItem[]): OpenTabState {
  return {
    tab,
    activeRightPaneMode: defaultRightPaneMode(tab),
    breadcrumb: seedBreadcrumb ?? [],
    contentHistory: [tab],
    contentCursor: 0,
  }
}

export function openTabsReducer(state: OpenTabsState, action: OpenTabsAction): OpenTabsState {
  switch (action.type) {
    case 'open': {
      const existingIndex = state.tabs.findIndex((t) => t.tab.id === action.tab.id)
      const shouldActivate = action.activate ?? true
      let nextTabs: OpenTabState[]
      if (existingIndex >= 0) {
        // Replace the existing tab (updates refs) and optionally activate.
        nextTabs = state.tabs.map((t, i) =>
          i === existingIndex ? { ...t, tab: action.tab } : t,
        )
      } else {
        const newEntry = newOpenTabState(action.tab, action.seedBreadcrumb)
        nextTabs = [...state.tabs, newEntry]
      }
      if (!shouldActivate) {
        return { ...state, tabs: nextTabs }
      }
      if (existingIndex >= 0) {
        // Re-registration of an ALREADY-OPEN tab (a host page re-opening it on
        // mount after a reload or Back/Forward navigation). Activate it, but do
        // NOT record a history step — it isn't a new visit. This is what keeps
        // reloads and Back/Forward from polluting the Back stack even when the
        // re-registration lands before another queued action (e.g. 'back').
        return { ...state, tabs: nextTabs, activeTabId: action.tab.id }
      }
      const visit = recordVisit(state, action.tab.id)
      return {
        ...state,
        tabs: nextTabs,
        activeTabId: action.tab.id,
        history: visit.history,
        historyCursor: visit.historyCursor,
      }
    }
    case 'navigate-active': {
      // Replace the ACTIVE tab's content in place. If there's no active tab
      // (nothing open yet), fall back to opening a fresh tab.
      const idx = state.tabs.findIndex((t) => t.tab.id === state.activeTabId)
      const { tab, crumb } = action
      if (idx < 0) {
        const newEntry = newOpenTabState(tab, crumb ? [crumb] : undefined)
        const visit = recordVisit(state, action.tab.id)
        return {
          ...state,
          tabs: [...state.tabs, newEntry],
          activeTabId: action.tab.id,
          history: visit.history,
          historyCursor: visit.historyCursor,
        }
      }
      // If the active slot already holds the SAME entity (its id is the base id
      // before any freshness suffix), keep the same slot id — this makes host
      // mount re-registration idempotent and navigation within a tab stable.
      const activeTabId = state.activeTabId
      const isSameEntity =
        activeTabId !== null && (activeTabId === tab.id || activeTabId.startsWith(`${tab.id}:`))
      if (isSameEntity) {
        // The active slot already holds this entity. Preserve the slot's OWN
        // id (which may be a freshly-minted one) so we never collide with an
        // already-open tab carrying the base id. Keep content + crumb + trail.
        const keptTab = { ...tab, id: activeTabId as string }
        const nextTabs = state.tabs.map((entry, i) =>
          i === idx
            ? {
                ...entry,
                tab: keptTab,
                breadcrumb: crumb ? entry.breadcrumb.concat([crumb]) : entry.breadcrumb,
                // Push this navigation onto the tab's own content trail.
                contentHistory: [...entry.contentHistory, keptTab],
                contentCursor: entry.contentHistory.length,
              }
            : entry,
        )
        return { ...state, tabs: nextTabs }
      }
      // Mint a fresh unique slot id so navigating to an entity that is ALREADY
      // open in another tab never collides with (or re-activates) that tab.
      // Keeps the same slot position in the strip; only the content changes.
      const freshId = `${tab.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
      const freshTab = { ...tab, id: freshId }
      const nextTabs = state.tabs.map((entry, i) =>
        i === idx
          ? {
              ...entry,
              tab: freshTab,
              breadcrumb: crumb ? entry.breadcrumb.concat([crumb]) : entry.breadcrumb,
              contentHistory: [...entry.contentHistory, tab],
              contentCursor: entry.contentHistory.length,
            }
          : entry,
      )
      return { ...state, tabs: nextTabs, activeTabId: freshId }
    }
    case 'within-back': {
      // Move the ACTIVE tab back one step in its own content trail, restoring
      // that content. Does not touch other tabs or the global history — each
      // tab has independent Back/Forward. Mint a fresh id so the restored
      // content stays a distinct slot (never collides with another open tab).
      const idx = state.tabs.findIndex((t) => t.tab.id === state.activeTabId)
      if (idx < 0) return state
      const entry = state.tabs[idx]
      const prev = entry.contentCursor - 1
      if (prev < 0) return state
      const target = entry.contentHistory[prev]
      const freshId = `${target.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
      const nextTabs = state.tabs.map((e, i) =>
        i === idx
          ? { ...e, tab: { ...target, id: freshId }, contentCursor: prev }
          : e,
      )
      return { ...state, tabs: nextTabs, activeTabId: freshId }
    }
    case 'within-forward': {
      const idx = state.tabs.findIndex((t) => t.tab.id === state.activeTabId)
      if (idx < 0) return state
      const entry = state.tabs[idx]
      const next = entry.contentCursor + 1
      if (next >= entry.contentHistory.length) return state
      const target = entry.contentHistory[next]
      const freshId = `${target.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
      const nextTabs = state.tabs.map((e, i) =>
        i === idx
          ? { ...e, tab: { ...target, id: freshId }, contentCursor: next }
          : e,
      )
      return { ...state, tabs: nextTabs, activeTabId: freshId }
    }
    case 'close': {
      const nextTabs = state.tabs.filter((t) => t.tab.id !== action.tabId)
      let nextActive: string | null = state.activeTabId
      if (state.activeTabId === action.tabId) {
        const closedIndex = state.tabs.findIndex((t) => t.tab.id === action.tabId)
        const right = nextTabs[closedIndex]
        const left = nextTabs[closedIndex - 1]
        nextActive = right?.tab.id ?? left?.tab.id ?? null
      }
      // Don't record a visit here — closing picks a neighbor, which should not
      // become a Back target immediately after closing.
      return { tabs: nextTabs, activeTabId: nextActive, history: state.history, historyCursor: state.historyCursor }
    }
    case 'activate': {
      if (!state.tabs.some((t) => t.tab.id === action.tabId)) return state
      const visit = recordVisit(state, action.tabId)
      return {
        ...state,
        activeTabId: action.tabId,
        history: visit.history,
        historyCursor: visit.historyCursor,
      }
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
    case 'navigate': {
      const crumbOk = action.crumb && action.crumb.label
      return {
        ...state,
        tabs: state.tabs.map((entry) =>
          entry.tab.id === action.tabId
            ? { ...entry, tab: action.tab, breadcrumb: crumbOk ? entry.breadcrumb.concat([action.crumb as BreadcrumbItem]) : entry.breadcrumb }
            : entry,
        ),
      }
    }
    case 'back': {
      let c = state.historyCursor - 1
      while (c >= 0 && !state.tabs.some((t) => t.tab.id === state.history[c])) c--
      if (c < 0) return state
      return { ...state, activeTabId: state.history[c], historyCursor: c }
    }
    case 'forward': {
      let c = state.historyCursor + 1
      while (c < state.history.length && !state.tabs.some((t) => t.tab.id === state.history[c])) c++
      if (c >= state.history.length) return state
      return { ...state, activeTabId: state.history[c], historyCursor: c }
    }
    case 'replace':
      return action.state
    default: {
      const _exhaustive: never = action
      return _exhaustive ?? state
    }
  }
}

/** Sensible right-pane default for a tab kind (exported for the session loader). */
export function defaultRightPaneMode(tab: WorkspaceTab): WorkspaceRightPaneMode {
  switch (tab.kind) {
    case 'project':
    case 'project-details':
      return 'ai'
    case 'run':
    case 'execution':
      return 'protocol'
    case 'claim':
      return 'ai'
    case 'lab-entity':
      return 'ai'
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
      return 'ai'
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? 'ai'
    }
  }
}

// ── localStorage persistence (per-user; the server session is the source of
//    truth for cross-device attach — this is the first-paint cache) ────────

const STORAGE_KEY = 'cl-open-tabs'

interface StoredTabEntry {
  tab: WorkspaceTab
  activeRightPaneMode: WorkspaceRightPaneMode
  breadcrumb?: BreadcrumbItem[]
  contentHistory?: WorkspaceTab[]
  contentCursor?: number
}

interface StoredState {
  tabs: StoredTabEntry[]
  activeTabId: string | null
  history?: string[]
  historyCursor?: number
  /** Wall clock of the last write, for adopt-newer reconciliation. */
  updatedAt?: string
}

export const EMPTY_TABS_STATE: OpenTabsState = {
  tabs: [],
  activeTabId: null,
  history: [],
  historyCursor: -1,
}

/** Resolve the storage key: explicit userId wins, else the signed-in user. */
export function tabsStorageKey(userId?: string): string {
  const uid = userId ?? getCurrentUserId() ?? undefined
  return uid ? `${STORAGE_KEY}:${uid}` : STORAGE_KEY
}

/**
 * localStorage accessor. The app runs in a browser; under jsdom (tests) Node's
 * own experimental global `localStorage` can shadow jsdom's, so prefer the
 * window's explicitly. Returns null when storage is unavailable.
 */
function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

/** Read the persisted session. Exported so tests and the sync hook share one reader. */
export function loadFromStorage(userId?: string): OpenTabsState {
  try {
    const raw = storage()?.getItem(tabsStorageKey(userId))
    if (!raw) return EMPTY_TABS_STATE
    const parsed = JSON.parse(raw) as StoredState
    if (!Array.isArray(parsed.tabs)) return EMPTY_TABS_STATE
    return {
      tabs: parsed.tabs.map((t) => {
        const entry = {
          tab: t.tab,
          activeRightPaneMode: t.activeRightPaneMode ?? 'ai',
          breadcrumb: t.breadcrumb ?? [],
        }
        // Migrate older persisted tabs to the per-tab content history model.
        const contentHistory = Array.isArray(t.contentHistory) && t.contentHistory.length > 0
          ? t.contentHistory
          : [t.tab]
        const contentCursor = typeof t.contentCursor === 'number' && t.contentCursor >= 0
          ? Math.min(t.contentCursor, contentHistory.length - 1)
          : contentHistory.length - 1
        return { ...entry, contentHistory, contentCursor }
      }),
      activeTabId: parsed.activeTabId ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      historyCursor: typeof parsed.historyCursor === 'number' ? parsed.historyCursor : -1,
    }
  } catch {
    return EMPTY_TABS_STATE
  }
}

/** Write the persisted session (best-effort; localStorage may be unavailable). */
export function saveToStorage(state: OpenTabsState, userId?: string): void {
  try {
    const toStore: StoredState = {
      tabs: state.tabs.map((t) => ({
        tab: t.tab,
        activeRightPaneMode: t.activeRightPaneMode,
        breadcrumb: t.breadcrumb,
        contentHistory: t.contentHistory,
        contentCursor: t.contentCursor,
      })),
      activeTabId: state.activeTabId,
      history: state.history,
      historyCursor: state.historyCursor,
      updatedAt: new Date().toISOString(),
    }
    storage()?.setItem(tabsStorageKey(userId), JSON.stringify(toStore))
  } catch {
    // localStorage might be full or unavailable — silently ignore.
  }
}

// ── Context ──────────────────────────────────────────────────────────

export interface OpenTabsContextValue {
  state: OpenTabsState
  openTab: (tab: WorkspaceTab, activate?: boolean, seedBreadcrumb?: BreadcrumbItem[]) => void
  /** Browser-model in-place navigation: replace the ACTIVE tab's content. */
  navigateActiveTab: (tab: WorkspaceTab, crumb?: BreadcrumbItem) => void
  navigateTab: (tabId: string, tab: WorkspaceTab, crumb?: BreadcrumbItem) => void
  closeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  renameTab: (tabId: string, title: string) => void
  setRightPaneMode: (tabId: string, mode: WorkspaceRightPaneMode) => void
  /** Whether a Back/Forward target exists in the across-tab history. */
  canGoBack: boolean
  canGoForward: boolean
  /** Move to the previous/next visited tab (no history write). The caller
   *  navigates to the target — see backTargetId/forwardTargetId. */
  back: () => void
  forward: () => void
  /** Whether the ACTIVE tab can go back/forward within its OWN content trail. */
  canGoBackWithin: boolean
  canGoForwardWithin: boolean
  /** Move within the ACTIVE tab's own content trail. */
  withinBack: () => void
  withinForward: () => void
  /** Replace the ENTIRE session (server attach, session-YAML apply). */
  replaceState: (state: OpenTabsState) => void
}

const OpenTabsContext = createContext<OpenTabsContextValue | null>(null)

export interface OpenTabsProviderProps {
  /** Optional user ID for per-user localStorage keys. */
  userId?: string
  children: ReactNode
}

export function OpenTabsProvider({ userId, children }: OpenTabsProviderProps) {
  // Hydrate SYNCHRONOUSLY on the first render: HomeRedirect and every host
  // page's mount effect read `state` during that render, so a useEffect-based
  // load would (a) route the user to /splash and (b) let the persist effect
  // below write the EMPTY pre-hydration state over the stored session (which,
  // under StrictMode's double-invoked effects, wiped it on every page load).
  const resolvedUserId = userId ?? getCurrentUserId() ?? undefined
  const [state, dispatch] = useReducer(openTabsReducer, resolvedUserId, loadFromStorage)
  const hydratedRef = useRef(false)

  // A user switch re-reads that user's session instead of bleeding the
  // previous user's tabs into the new one. (The switcher also reloads.)
  useEffect(() => {
    dispatch({ type: 'replace', state: loadFromStorage(resolvedUserId) })
  }, [resolvedUserId])

  // Persist on change — never before hydration, or the first render's empty
  // state wipes the stored session.
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      return
    }
    saveToStorage(state, resolvedUserId)
  }, [state, resolvedUserId])

  // Stable dispatch callbacks (memoized once, independent of `state`).
  const openTab = useCallback((tab: WorkspaceTab, activate?: boolean, seedBreadcrumb?: BreadcrumbItem[]) => {
    dispatch({ type: 'open', tab, ...(activate !== undefined ? { activate } : {}), ...(seedBreadcrumb ? { seedBreadcrumb } : {}) })
  }, [])
  const navigateTab = useCallback((tabId: string, tab: WorkspaceTab, crumb?: BreadcrumbItem) => {
    dispatch({ type: 'navigate', tabId, tab, ...(crumb ? { crumb } : {}) })
  }, [])
  const navigateActiveTab = useCallback((tab: WorkspaceTab, crumb?: BreadcrumbItem) => {
    dispatch({ type: 'navigate-active', tab, ...(crumb ? { crumb } : {}) })
  }, [])
  const closeTab = useCallback((tabId: string) => {
    dispatch({ type: 'close', tabId })
  }, [])
  const activateTab = useCallback((tabId: string) => {
    dispatch({ type: 'activate', tabId })
  }, [])
  const renameTab = useCallback((tabId: string, title: string) => {
    dispatch({ type: 'rename', tabId, title })
  }, [])
  const setRightPaneMode = useCallback((tabId: string, mode: WorkspaceRightPaneMode) => {
    dispatch({ type: 'set-right-pane-mode', tabId, mode })
  }, [])
  const back = useCallback(() => dispatch({ type: 'back' }), [])
  const forward = useCallback(() => dispatch({ type: 'forward' }), [])
  const withinBack = useCallback(() => dispatch({ type: 'within-back' }), [])
  const withinForward = useCallback(() => dispatch({ type: 'within-forward' }), [])
  const replaceState = useCallback((next: OpenTabsState) => dispatch({ type: 'replace', state: next }), [])

  // Memoize so the context object's identity only changes when `state`
  // changes. Consumers that put the context object in effect deps (or that
  // dispatch inside such an effect) must not re-fire on every provider
  // render — a fresh object identity per render turned those into infinite
  // update loops.
  const value: OpenTabsContextValue = useMemo(() => ({
    state,
    openTab,
    navigateTab,
    navigateActiveTab,
    closeTab,
    activateTab,
    renameTab,
    setRightPaneMode,
    canGoBack: backTargetId(state) !== null,
    canGoForward: forwardTargetId(state) !== null,
    back,
    forward,
    canGoBackWithin: (() => {
      const e = state.tabs.find((t) => t.tab.id === state.activeTabId)
      return e ? e.contentCursor > 0 : false
    })(),
    canGoForwardWithin: (() => {
      const e = state.tabs.find((t) => t.tab.id === state.activeTabId)
      return e ? e.contentCursor < e.contentHistory.length - 1 : false
    })(),
    withinBack,
    withinForward,
    replaceState,
  }), [state, openTab, navigateTab, navigateActiveTab, closeTab, activateTab, renameTab, setRightPaneMode, back, forward, withinBack, withinForward, replaceState])

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

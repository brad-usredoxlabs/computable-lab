/**
 * WorkspaceContext — per-study UI workspace state for the event-editor.
 *
 * Holds the open viewer tabs, the active tab id, the right-pane mode
 * (AI/Search/Browse), the right-pane collapse state, and the pane widths.
 *
 * On mount: loads `records/studies/<studyId>/workspace.yaml` from the
 * server (returns a default state when absent).
 *
 * On change: persists the state back to the server via a 500ms debounced
 * save. Last-writer-wins by design — pane widths and the active mode are
 * low-stakes values where strict ordering doesn't matter, and the debounce
 * caps concurrent writes from drag-resize sequences.
 *
 * The *open-studies list* — which studies have a tab in the topbar — is
 * NOT in this context. It's a per-user browser-session concept and lives
 * in `openStudiesStorage` (localStorage). This context is per-active-study.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { apiClient } from '../../shared/api/client'
import {
  defaultWorkspaceState,
  type WorkspaceRightPaneMode,
  type WorkspaceState,
  type WorkspaceTab,
} from './types'
import { workspaceReducer, type WorkspaceAction } from './reducer'

export interface WorkspaceContextValue {
  /** The current state for the active study. */
  state: WorkspaceState
  /** Whether the initial load from the server has resolved. */
  ready: boolean
  /** Surface the last error from load/save, if any. UI may display or ignore. */
  error: string | null
  /** Tab management. */
  openTab: (tab: WorkspaceTab, activate?: boolean) => void
  closeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  renameTab: (tabId: string, title: string) => void
  /** Right pane controls. */
  setRightPaneMode: (mode: WorkspaceRightPaneMode) => void
  setRightPaneCollapsed: (collapsed: boolean) => void
  /** Pane widths from the resizer drag handler. */
  setPaneWidths: (left: number, right: number) => void
  /** Force a re-read from the server (used after an external write). */
  reload: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export interface WorkspaceProviderProps {
  studyId: string
  /**
   * Debounce window for server-side persistence (ms). Defaults to 500ms
   * which matches the plan's recommendation; pull this down to 0 in tests
   * to make saves synchronous.
   */
  saveDebounceMs?: number
  /**
   * Optional override for the load function (test seam). Falls back to
   * `apiClient.loadWorkspace`.
   */
  loadFn?: (studyId: string) => Promise<{ state: WorkspaceState }>
  /**
   * Optional override for the save function (test seam). Falls back to
   * `apiClient.saveWorkspace`.
   */
  saveFn?: (
    studyId: string,
    state: WorkspaceState,
  ) => Promise<{ state: WorkspaceState }>
  children: ReactNode
}

export function WorkspaceProvider({
  studyId,
  saveDebounceMs = 500,
  loadFn,
  saveFn,
  children,
}: WorkspaceProviderProps) {
  const [state, dispatch] = useReducer(
    workspaceReducer,
    defaultWorkspaceState(studyId),
  )
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs so the save effect can read the latest functions without
  // re-subscribing every render.
  const loadFnRef = useRef(loadFn)
  const saveFnRef = useRef(saveFn)
  loadFnRef.current = loadFn
  saveFnRef.current = saveFn

  // Track whether the current state was just loaded from the server. We
  // suppress the save effect immediately after a load so we don't echo
  // identical content back to the server on mount.
  const justLoadedRef = useRef(false)
  // Track an in-flight save timer so we can clear/reschedule it on rapid
  // state changes (drag-resize).
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const fn = loadFnRef.current ?? apiClient.loadWorkspace
      const result = await fn(studyId)
      // The server may return WorkspaceStateApi (looser tab shape) — narrow
      // here. parseWorkspaceState on the server already validated, so we
      // trust the runtime shape.
      const next = result.state as WorkspaceState
      justLoadedRef.current = true
      dispatch({ type: 'replace', state: next })
      setReady(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to load workspace: ${message}`)
      // Even on error, mark ready so the UI renders with the default state
      // rather than spinning forever.
      setReady(true)
    }
  }, [studyId])

  // Reset and reload when studyId changes (switching tabs in the topbar).
  useEffect(() => {
    setReady(false)
    dispatch({ type: 'replace', state: defaultWorkspaceState(studyId) })
    void load()
  }, [studyId, load])

  // Persist on every state change (after initial load), debounced.
  useEffect(() => {
    if (!ready) return
    if (justLoadedRef.current) {
      justLoadedRef.current = false
      return
    }
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
    }
    const fn = saveFnRef.current ?? apiClient.saveWorkspace
    if (saveDebounceMs <= 0) {
      void fn(studyId, state).catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        setError(`Failed to save workspace: ${message}`)
      })
      return
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void fn(studyId, state).catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        setError(`Failed to save workspace: ${message}`)
      })
    }, saveDebounceMs)

    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [state, ready, studyId, saveDebounceMs])

  // Stable callback identities — important because they end up as deps in
  // child components (tabs row, splitter handler).
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      ready,
      error,
      openTab: (tab, activate) =>
        dispatch({ type: 'open-tab', tab, ...(activate !== undefined ? { activate } : {}) }),
      closeTab: (tabId) => dispatch({ type: 'close-tab', tabId }),
      activateTab: (tabId) => dispatch({ type: 'activate-tab', tabId }),
      renameTab: (tabId, title) =>
        dispatch({ type: 'rename-tab', tabId, title }),
      setRightPaneMode: (mode) =>
        dispatch({ type: 'set-right-pane-mode', mode }),
      setRightPaneCollapsed: (collapsed) =>
        dispatch({ type: 'set-right-pane-collapsed', collapsed }),
      setPaneWidths: (left, right) =>
        dispatch({ type: 'set-pane-widths', left, right }),
      reload: load,
    }),
    [state, ready, error, load],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

/**
 * Read the workspace context. Throws if used outside a Provider — the
 * loud-fail is intentional; silent default state would mask plumbing bugs.
 */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}

/** Convenience: dispatch raw actions (for advanced consumers and tests). */
export function workspaceActionFor(
  ctx: WorkspaceContextValue,
  action: WorkspaceAction,
): void {
  switch (action.type) {
    case 'open-tab':
      ctx.openTab(action.tab, action.activate)
      return
    case 'close-tab':
      ctx.closeTab(action.tabId)
      return
    case 'activate-tab':
      ctx.activateTab(action.tabId)
      return
    case 'rename-tab':
      ctx.renameTab(action.tabId, action.title)
      return
    case 'set-right-pane-mode':
      ctx.setRightPaneMode(action.mode)
      return
    case 'set-right-pane-collapsed':
      ctx.setRightPaneCollapsed(action.collapsed)
      return
    case 'set-pane-widths':
      ctx.setPaneWidths(action.left, action.right)
      return
    case 'replace':
      // External replace bypasses the context API by design — use reload().
      void ctx.reload()
      return
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

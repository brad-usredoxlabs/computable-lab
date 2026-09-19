/**
 * useSessionSync — attach the local tab store to the persisted server session.
 *
 * tmux semantics, last-writer-wins:
 *  - BOOT: localStorage already served first paint (synchronous hydration in
 *    OpenTabsProvider) + GET /api/session. Adopt the server copy when it is
 *    newer than our last push, or when we have nothing local (first load on a
 *    second device).
 *  - PUSH: debounce 500ms after any local change → PUT /api/session.
 *  - ATTACH: on window focus / visibilitychange, GET and adopt if the server
 *    moved ahead of our last local write.
 *
 * The AI-emittable session document has its own entry point (useApplySessionDocument)
 * — both funnel into OpenTabsContext.replaceState, so there is ONE writer.
 */
import { useCallback, useEffect, useRef } from 'react'
import { apiClient } from '../api/client'
import { useOpenTabs } from '../shell/OpenTabsContext'
import type { OpenTabsState } from '../shell/OpenTabsContext'
import { tabPath } from '../shell/WorkspaceTabStrip'
import { sessionDocumentToState, sessionFromYaml, sessionTabsToState, sessionToYaml } from './sessionYaml'
import { stableTabId } from './tabId'

const PUSH_DEBOUNCE_MS = 500
/** Wall clock of our last successful push — the adopt-newer comparison basis. */
const LAST_PUSH_KEY = 'cl-open-tabs:lastPushedAt'

export interface SessionSyncOptions {
  /**
   * Called after the store adopts a REMOTE session, with the route of its active
   * tab. Attaching to a session should put you where that session is — the
   * caller (inside the router) navigates. Kept as a callback so this hook stays
   * router-free and unit-testable.
   */
  onAdopt?: (activeTabPath: string | null) => void
}

/** Route of a session's active tab (null when it has none / no route). */
function activeTabPath(state: OpenTabsState): string | null {
  const active = state.tabs.find((t) => t.tab.id === state.activeTabId)
  return active ? tabPath(active.tab) : null
}

/** Apply an AI-emitted (or shared) session document to the live store. */
export function useApplySessionDocument(): (yaml: string) => void {
  const { replaceState } = useOpenTabs()
  return useCallback(
    (yaml: string) => {
      const doc = sessionFromYaml(yaml)
      replaceState(sessionDocumentToState(doc, stableTabId))
    },
    [replaceState],
  )
}

export function useSessionSync(options: SessionSyncOptions = {}): void {
  const { state, replaceState } = useOpenTabs()
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyingRemote = useRef(false)
  const tabsRef = useRef(state)

  tabsRef.current = state
  const lastPushedPayload = useRef<string | null>(null)
  const onAdopt = options.onAdopt
  const onAdoptRef = useRef(onAdopt)
  onAdoptRef.current = onAdopt

  const adopt = useCallback(
    (tabs: unknown[], activeTabId: string | null, updatedAt: string) => {
      applyingRemote.current = true
      const next = sessionTabsToState(tabs, activeTabId)
      replaceState(next)
      try {
        window.localStorage.setItem(LAST_PUSH_KEY, updatedAt)
      } catch {
        // storage unavailable — the in-memory comparison below still applies
      }
      applyingRemote.current = false
      // Attaching to a session should land you where that session is.
      onAdoptRef.current?.(activeTabPath(next))
    },
    [replaceState],
  )

  // BOOT + ATTACH
  useEffect(() => {
    let cancelled = false
    const pull = async (boot: boolean) => {
      try {
        const { session } = await apiClient.getSession()
        if (cancelled) return
        if (session.tabs.length === 0) return
        let lastPush: string | null = null
        try {
          lastPush = window.localStorage.getItem(LAST_PUSH_KEY)
        } catch {
          lastPush = null
        }
        const serverAhead = !lastPush || Date.parse(session.updatedAt) > Date.parse(lastPush)
        const localEmpty = tabsRef.current.tabs.length === 0
        if (boot ? serverAhead || localEmpty : serverAhead) {
          adopt(session.tabs, session.activeTabId, session.updatedAt)
        }
      } catch {
        // Offline / backend down: localStorage already served first paint.
      }
    }
    void pull(true)
    const onFocus = () => {
      void pull(false)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [adopt])

  // PUSH (debounced) — skipped for state adopted from the server.
  useEffect(() => {
    if (applyingRemote.current) {
      applyingRemote.current = false
      return
    }
    const payload = sessionToYaml(state)
    if (payload === lastPushedPayload.current) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      lastPushedPayload.current = payload
      const doc = sessionFromYaml(payload)
      void apiClient
        .putSession({ tabs: doc.tabs, activeTabId: doc.activeTabId ?? null })
        .then(({ session }) => {
          try {
            window.localStorage.setItem(LAST_PUSH_KEY, session.updatedAt)
          } catch {
            // ignore
          }
        })
        .catch(() => {
          // Offline: localStorage still holds the session; the next change retries.
          lastPushedPayload.current = null
        })
    }, PUSH_DEBOUNCE_MS)
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
    }
  }, [state])
}

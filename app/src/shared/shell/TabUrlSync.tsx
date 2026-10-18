/**
 * TabUrlSync — keeps URL ⇄ workspace-tab state bidirectionally in sync
 * (UCX-2, cl:workspace-strip-binding).
 *
 * Lives INSIDE BrowserRouter (mounted in App.tsx beside SessionSync) because
 * it uses router hooks; the OpenTabsProvider sits ABOVE the router and cannot
 * (App.tsx) — that layering split is deliberate: the provider hydrates from
 * plain window.location.search, this component does the router-side sync.
 *
 * STATE → URL: effect writes `ws`/`wsa` into the CURRENT pathname's search via
 * navigate(..., {replace:true}) — NEVER push: the strip owns its own
 * Back/Forward (reducer history/cursor + WorkspaceTabStrip's path navigations);
 * a push would double-book history. Foreign params (recordId, view, source...)
 * survive via URLSearchParams merge. Eligibility is DERIVED from existing data
 * (tabPath over the OPEN strip + the resume routes), not a route whitelist —
 * which makes /literature, /sequences, /chat, /settings byte-identical (their
 * pathname is no tab's tabPath).
 *
 * URL → STATE: watches location.search for a `ws` that DIFFERS from the last
 * search this component wrote (ref-tracked); on an external change (pasted
 * link, back/forward onto an older entry, manual edit) it replaceStates the
 * decoded strip. Malformed → state is NOT touched and a visible dismissable
 * banner names MALFORMED_WS_PARAM. Never throws (render-nothing convention,
 * workstateExecutor.ts sibling).
 *
 * Loop defenses (both pinned by TabUrlSync.test.tsx): the no-op guard
 * (desired search === current search) and the ref-tracked lastWritten.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useOpenTabs } from './OpenTabsContext'
import { tabPath } from './WorkspaceTabStrip'
import {
  WS_PARAM,
  WSA_PARAM,
  decodeWorkspaceParams,
  encodeWorkspaceParams,
  type WorkspaceParamDiagnostic,
} from '../session/urlSession'

/** The ws/wsa fragment of a search string, normalized for comparison. */
function wsFragment(search: string): string | null {
  const params = new URLSearchParams(search)
  if (!params.has(WS_PARAM)) return null
  const out = new URLSearchParams()
  out.set(WS_PARAM, params.get(WS_PARAM) as string)
  const wsa = params.get(WSA_PARAM)
  if (wsa !== null) out.set(WSA_PARAM, wsa)
  return out.toString()
}

/** URLSearchParams-normalized form of a search string ('?a:b' and '?a%3Ab'
 *  are the SAME search — comparisons must be on the normalized form). */
function normalizeSearch(search: string): string {
  return new URLSearchParams(search).toString()
}

export function TabUrlSync() {
  const { state, replaceState } = useOpenTabs()
  const navigate = useNavigate()
  const location = useLocation()
  const lastWrittenRef = useRef<string | null>(null)
  // Refs mirror the diagnostic/adoption synchronously: the STATE→URL effect
  // runs in the SAME commit as the URL→STATE effect, and a state variable
  // would still be stale there (the strip write would rewrite a malformed URL
  // and then the adoption branch would clear the banner).
  const diagnosticRef = useRef<WorkspaceParamDiagnostic | null>(null)
  const pendingAdoptionRef = useRef(false)
  const [diagnostic, setDiagnostic] = useState<WorkspaceParamDiagnostic | null>(null)

  const desired = encodeWorkspaceParams(state)

  // Eligibility derived from existing data: sync is active only where the
  // pathname IS one of the open tabs' tabPath (or a resume route). No TS
  // route table — a data consequence of tabPath.
  const eligible =
    location.pathname === '/' ||
    location.pathname === '/splash' ||
    state.tabs.some((t) => tabPath(t.tab) === location.pathname)

  // URL → STATE: adopt an external strip change; surface a malformed diagnostic.
  useEffect(() => {
    pendingAdoptionRef.current = false
    const fragment = wsFragment(location.search)
    if (fragment === null) return
    const normalized = normalizeSearch(location.search)
    if (lastWrittenRef.current === normalized) return
    // Already reflected by the live state (provider hydration or our own
    // write): adopt the search as seen, do not re-dispatch.
    if (fragment === desired) {
      lastWrittenRef.current = normalized
      diagnosticRef.current = null
      setDiagnostic(null)
      return
    }
    const decoded = decodeWorkspaceParams(location.search)
    diagnosticRef.current = decoded.diagnostic ?? null
    setDiagnostic(decoded.diagnostic ?? null)
    if (decoded.state) {
      lastWrittenRef.current = normalized
      pendingAdoptionRef.current = true
      replaceState(decoded.state)
    }
  }, [location.search, desired, replaceState])

  // STATE → URL: replace-only write of the strip into the current search.
  useEffect(() => {
    if (!eligible) return
    // A malformed link the user has not dismissed yet is NOT silently
    // rewritten — the banner owns that URL until it is fixed or dismissed.
    if (diagnosticRef.current !== null) return
    // An adoption just dispatched replaceState; the re-render carrying the
    // adopted state is in flight — writing the PRE-adoption state back would
    // ping-pong the strip.
    if (pendingAdoptionRef.current) {
      pendingAdoptionRef.current = false
      return
    }
    const merged = new URLSearchParams(location.search)
    merged.delete(WS_PARAM)
    merged.delete(WSA_PARAM)
    if (desired) {
      const desiredParams = new URLSearchParams(desired)
      for (const [key, value] of desiredParams) merged.set(key, value)
    }
    const mergedStr = merged.toString()
    const desiredSearch = mergedStr ? `?${mergedStr}` : ''
    // No-op guard: prevents the state→URL→state feedback loop. Compare the
    // NORMALIZED search WITHOUT the '?' prefix (normalizeSearch never has one).
    if (mergedStr === normalizeSearch(location.search)) return
    lastWrittenRef.current = mergedStr
    navigate(`${location.pathname}${desiredSearch}`, { replace: true })
  }, [eligible, desired, location.pathname, location.search, navigate])

  if (diagnostic === null) return null
  return (
    <div
      role="status"
      data-testid="ws-param-diagnostic"
      style={{
        padding: '0.5rem 1rem',
        background: 'var(--cl-color-warning-bg, #fff4ce)',
        color: 'var(--cl-color-text, #1c1c1c)',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
      }}
    >
      <span>
        {diagnostic.code}: {diagnostic.message}
      </span>
      <button type="button" onClick={() => setDiagnostic(null)}>
        Dismiss
      </button>
    </div>
  )
}

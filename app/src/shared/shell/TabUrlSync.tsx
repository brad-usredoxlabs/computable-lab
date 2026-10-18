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
 * Banner ownership (advc-UCX2-l2t0655 defect 1): the banner owns a malformed
 * URL — the strip is NOT written over it — until it is fixed OR DISMISSED.
 * Dismissal releases ownership of THAT search only: the banner stays hidden,
 * the STATE→URL effect resumes writing, and the corrected search replaces the
 * malformed one on the next strip change. A DIFFERENT malformed link re-arms
 * the banner (dismissal is not a session-wide mute).
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
  // The exact ws/wsa fragment the user dismissed. Ownership of a malformed
  // link ends at dismissal, but ONLY for that link — a new malformed link
  // (a different fragment) re-arms the banner.
  const dismissedFragmentRef = useRef<string | null>(null)
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
      dismissedFragmentRef.current = null
      setDiagnostic(null)
      return
    }
    const decoded = decodeWorkspaceParams(location.search)
    if (decoded.diagnostic && dismissedFragmentRef.current === fragment) {
      // DEFECT 1 FIX: this exact malformed link was already dismissed, so its
      // ownership is released: the banner does NOT re-arm on a re-run of this
      // effect (the old code re-set diagnosticRef + setDiagnostic here, which
      // popped the banner back AND kept the STATE→URL guard dead for the rest
      // of the session), and the dismissed link is inert for URL→STATE — it
      // must not re-adopt (stomp) the live strip. STATE→URL now owns the
      // search and the corrected strip replaces the malformed one.
      diagnosticRef.current = null
      lastWrittenRef.current = normalized
      return
    }
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
    // Dismissal (below) clears diagnosticRef, so sync RESUMES from the next
    // strip change and the corrected search replaces the malformed one.
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
      <button
        type="button"
        onClick={() => {
          // DEFECT 1 FIX: dismissal RELEASES the banner's ownership of this
          // malformed link — diagnosticRef is cleared (the STATE→URL guard
          // stops early-returning, so sync resumes and the corrected search
          // replaces the malformed one on the next strip change) and the
          // dismissed fragment is remembered so this effect does not re-arm
          // the banner for the SAME link.
          dismissedFragmentRef.current = wsFragment(location.search)
          diagnosticRef.current = null
          setDiagnostic(null)
        }}
      >
        Dismiss
      </button>
    </div>
  )
}

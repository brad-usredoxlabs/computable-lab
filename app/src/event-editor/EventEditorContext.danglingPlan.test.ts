// @vitest-environment node
/**
 * danglingplan (L2-SUBPROTOCOL-EXPAND-1, unit 1/1) — a 404 on the run's
 * `methodEventGraphId` is a STALE POINTER, not a transport failure: the
 * editor must say so honestly (named graph id + the way back to the run)
 * instead of painting a red "Failed to load: ... NOT_FOUND" splash over the
 * whole surface (browser gate g3 G3-D4: both run and PLR point at
 * EVG-2026-09-06-run-template-method-4fb3621f, which 404s).
 *
 * RED at HEAD: the LoadState union has no 'missing', and the catch in the
 * graph-load effect (EventEditorContext.tsx:1532) formats EVERY failure as
 * load_error — so a NOT_FOUND-shaped rejection lands in loadState 'error'
 * with the red splash. The last leg (a genuine 500) is a regression guard:
 * it passes at HEAD and must keep passing after the fix.
 *
 * Harness: node environment (this file drives the context reducer + the two
 * surface components only — no route/stack needed), with a JSDOM window so
 * react-dom/client can commit. The graph loader is the seam the item names
 * (`loadAcceptedEventGraph(eventGraphId)` calls `apiClient.loadEventGraph`),
 * spied here to reject with the NOT_FOUND-shaped error the server sends.
 * Platforms stay pending so the surfaces never reach the ready branch (this
 * unit only degrades the load failure — the deck itself is not in scope).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
// jsdom ships no bundled .d.ts (no @types/jsdom in the store) — the import is
// the only untyped one in this file. The DOM is only a commit surface for the
// two surface components under test (AppShell's theme effect + react-dom's
// commit). The item mandates `// @vitest-environment node`, so we build the
// window by hand rather than letting vitest supply one.
// @ts-expect-error deliberate: jsdom has no type declarations in this store
import { JSDOM } from 'jsdom'
import { apiClient } from '../shared/api/client'
import { ThemeProvider } from '../shared/shell'
import {
  EventEditorProvider,
  useEventEditor,
  type EventEditorState,
} from './EventEditorContext'
import { EventEditorShell } from './EventEditorShell'
import { DeckViewer } from './viewer/deck/DeckViewer'

const GRAPH_ID = 'EVG-2026-09-06-run-template-method-4fb3621f'
const RUN_ID = 'RUN-2026-09-06-run-kt2a'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5174/',
})
;(globalThis as Record<string, unknown>).window = dom.window
;(globalThis as Record<string, unknown>).document = dom.window.document
// Node ≥ 21 already exposes a getter-only `navigator` global — keep it.
if (typeof (globalThis as Record<string, unknown>).navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'danglingplan-test' },
    configurable: true,
    writable: true,
  })
}

/** The state under test, as seen from inside the provider tree. */
function Probe() {
  const { state } = useEventEditor()
  ;(globalThis as Record<string, unknown>)['danglingPlanState'] = state
  return null
}

/** Poll until `check` passes or the budget runs out (effects settle async). */
async function waitFor(check: () => boolean, budgetMs = 8000): Promise<void> {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 25))
  }
}

/**
 * Wait until the failure branch is fully settled: the load has left
 * 'loading' AND the separate `set_run` effect has committed the run id
 * (the missing surface renders the run link from state.runId). Effects
 * settle async, so waiting on the load alone can snapshot a frame before
 * runId has landed.
 */
async function waitForSettled(runId: string | null, loadState: string): Promise<void> {
  await waitFor(() => {
    const s = (globalThis as Record<string, unknown>)['danglingPlanState'] as
      | { loadState: string; runId: string | null }
      | undefined
    if (!s) return false
    return s.loadState === loadState && (runId === null || s.runId === runId)
  })
}

/**
 * Mount the editor surfaces with a graph loader that rejects with
 * `graphError`, and wait for the failure branch to fully settle (load left
 * 'loading' AND the run id committed). Returns the last committed editor
 * state observed by the probe plus the `#root` innerHTML snapshotted BEFORE
 * unmount (the surface lives in the committed tree; querying the live DOM
 * after unmount sees the emptied root).
 */
async function mountWithGraphError(
  graphError: unknown,
  runId: string | null,
  settledLoadState: string,
): Promise<{ state: EventEditorState | undefined; surface: string; html: string }> {
  vi.spyOn(apiClient, 'loadEventGraph').mockRejectedValue(graphError)
  // Pending forever: the surfaces stay in the load-failure branch (this unit
  // degrades that branch only — the ready deck is not in scope here).
  vi.spyOn(apiClient, 'getPlatforms').mockReturnValue(new Promise(() => {}))
  vi.spyOn(apiClient, 'getRecord').mockResolvedValue({ recordId: RUN_ID, schemaId: 'run/v1', payload: {} })
  vi.spyOn(apiClient, 'updateRecord').mockRejectedValue(new Error('updateRecord must never be called'))
  const root: Root = createRoot(dom.window.document.getElementById('root')!)
  // children live in the props object: ProviderProps declares `children`
  // (required), so createElement(Provider, { runId, eventGraphId, children }).
  const children = [
    React.createElement(Probe, { key: 'probe' }),
    React.createElement(EventEditorShell, { key: 'shell' }),
    React.createElement(DeckViewer, { key: 'viewer' }),
  ] as React.ReactNode
  root.render(
    React.createElement(
      ThemeProvider,
      null,
      React.createElement(
        EventEditorProvider,
        { runId: runId ?? undefined, eventGraphId: GRAPH_ID, children },
      ),
    ),
  )
  await waitForSettled(runId, settledLoadState)
  // One settle beat so the failure branch is fully committed before readout.
  await new Promise((r) => setTimeout(r, 40))
  const state = (globalThis as Record<string, unknown>)['danglingPlanState'] as EventEditorState | undefined
  // Snapshot the committed tree BEFORE unmount clears it.
  const html = dom.window.document.getElementById('root')?.innerHTML ?? ''
  const surface = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  root.unmount()
  return { state, surface, html }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as Record<string, unknown>)['danglingPlanState']
  dom.window.document.getElementById('root')!.innerHTML = ''
})

describe('danglingplan — a NOT_FOUND on the run plan graph degrades honestly', () => {
  it('a 404 on the plan graph lands in loadState missing with the named graph id (no red splash)', async () => {
    // The NOT_FOUND-shaped rejection the server sends (ApiError wire shape:
    // "<token>: <message>" — 404 with `error: 'NOT_FOUND'` / `Record not found: <id>`).
    const { state, surface, html } = await mountWithGraphError(
      new Error(`NOT_FOUND: Record not found: ${GRAPH_ID}`),
      RUN_ID,
      'missing',
    )
    expect(state, 'provider state never reached the probe (RED at HEAD)').toBeTruthy()
    if (!state) return
    // The dangling plan is a NAMED state — not the generic 'error' splash.
    expect(state.loadState).toBe('missing')
    // The missing graph is named, and the generic failure message is cleared.
    expect(state.missingGraphId).toBe(GRAPH_ID)
    expect(state.loadError).toBeNull()
    // The surface names the exact graph id and says it does not exist yet.
    expect(surface).toContain(GRAPH_ID)
    expect(surface).toContain('does not exist yet')
    // It offers the way back to the run (pre-unmount committed tree).
    expect(html).toContain(`<a class="splash--missing-link" href="/runs/${RUN_ID}">`)
    // It does NOT paint the red "Failed to load" splash.
    expect(surface).not.toContain('Failed to load')
    expect(html).not.toContain('splash--error')
    // Degradation only: the run record was never written.
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })

  it('a genuine server failure (500) keeps the existing error splash (the missing branch must not swallow real errors)', async () => {
    const { state, surface, html } = await mountWithGraphError(
      Object.assign(new Error('INTERNAL_ERROR: boom'), { status: 500 }),
      RUN_ID,
      'error',
    )
    expect(state, 'provider state never reached the probe').toBeTruthy()
    if (!state) return
    expect(state.loadState).toBe('error')
    expect(state.loadError).toContain('event graph')
    expect(surface).toContain('Failed to load')
    // The genuine error keeps the existing red splash; the missing branch
    // did not swallow it.
    expect(html).toContain('splash--error')
    expect(html).not.toContain('splash--missing')
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })
})

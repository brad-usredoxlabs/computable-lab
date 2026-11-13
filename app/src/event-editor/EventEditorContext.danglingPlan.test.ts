// @vitest-environment node
/** danglingplan (L2-SUBPROTOCOL-EXPAND-1): a 404 on the run's methodEventGraphId is a STALE POINTER,
 * not a transport failure — the editor must land in a named `missing` load state (graph id + way
 * back to the run) instead of the red "Failed to load: ... NOT_FOUND" splash (gate g3 G3-D4).
 * RED at HEAD: LoadState has no 'missing' and the load effect formats every failure as load_error.
 * Drives the context with a mocked graph loader (loadEventGraph rejects); node env, JSDOM surface. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
// @ts-expect-error deliberate: jsdom ships no type declarations in this store
import { JSDOM } from 'jsdom'
import { apiClient } from '../shared/api/client'
import { EventEditorProvider, useEventEditor, type EventEditorState } from './EventEditorContext'

const GRAPH_ID = 'EVG-2026-09-06-run-template-method-4fb3621f'
const RUN_ID = 'RUN-2026-09-06-run-kt2a'
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5174/' })
;(globalThis as Record<string, unknown>).window = dom.window
;(globalThis as Record<string, unknown>).document = dom.window.document
const el = () => dom.window.document.getElementById('root')!

let seen: EventEditorState | undefined
function Probe() {
  const { state } = useEventEditor()
  seen = state
  return null
}

/** Mount the provider with a graph loader that rejects `graphError` and poll the committed state
 * until it settles into the expected load branch with the run id present (platforms stay pending
 * so the surfaces never reach the ready branch). getRecord is mocked, updateRecord spied — it
 * must never fire (display-only unit; the run record is not written). Throws on timeout. */
async function settle(graphError: unknown, wantLoadState: 'missing' | 'error'): Promise<EventEditorState> {
  vi.spyOn(apiClient, 'loadEventGraph').mockRejectedValue(graphError)
  vi.spyOn(apiClient, 'getPlatforms').mockReturnValue(new Promise(() => {}))
  vi.spyOn(apiClient, 'getRecord').mockResolvedValue({ recordId: RUN_ID, schemaId: 'run/v1', payload: {} })
  vi.spyOn(apiClient, 'updateRecord').mockRejectedValue(new Error('no run-record writes in this unit'))
  const root = createRoot(el())
  root.render(
    React.createElement(EventEditorProvider, { runId: RUN_ID, eventGraphId: GRAPH_ID, children: React.createElement(Probe) }),
  )
  const deadline = Date.now() + 8000
  while (Date.now() < deadline && !(seen && seen.loadState === wantLoadState && seen.runId === RUN_ID)) {
    await new Promise((r) => setTimeout(r, 25))
  }
  root.unmount()
  if (!seen) throw new Error(`settle timed out waiting for loadState '${wantLoadState}' (RED at HEAD)`)
  return seen
}

afterEach(() => {
  vi.restoreAllMocks()
  seen = undefined
  el().innerHTML = ''
})

describe('danglingplan — a NOT_FOUND on the run plan graph degrades honestly', () => {
  it('a 404 on the plan graph lands in loadState missing with the named graph id (no red splash)', async () => {
    const s = await settle(new Error(`NOT_FOUND: Record not found: ${GRAPH_ID}`), 'missing')
    expect(s.loadState).toBe('missing') // not 'error' — the red splash branch cannot fire
    expect(s.missingGraphId).toBe(GRAPH_ID)
    expect(s.loadError).toBeNull()
    expect(s.runId).toBe(RUN_ID) // the way back to the run is present
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })

  it('a genuine server failure (500) keeps the existing error splash (not swallowed)', async () => {
    const s = await settle(Object.assign(new Error('INTERNAL_ERROR: boom'), { status: 500 }), 'error')
    expect(s.loadState).toBe('error')
    expect(s.loadError).toContain('event graph')
    expect(s.missingGraphId).toBeNull()
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })
})

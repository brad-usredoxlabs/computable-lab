/**
 * L2-THREAD-SCOPED-1 FIX RUN 2 — D2(b): promoteThread's header set (spec §4.5
 * "pin with an app test that promoteThread sends the header", amendment A-1
 * "scope travels with all four thread routes"; cycle-2 review found NO test
 * asserted a promote request's headers at all).
 *
 * The REAL aiThreadClient + the REAL per-(tab, scope) mint (threadTabIds)
 * run against a captured fetch: the pin is the WIRE headers, by case —
 *  - scoped opts (a deck-shaped surface): x-cl-thread-scope == the scope AND
 *    x-cl-thread-id == the tab's minted id FOR that scope (the map entry);
 *  - no-scope opts (instance-less surface): NO x-cl-thread-scope header at
 *    all (never an empty value), x-cl-thread-id == the "" map entry.
 * The identity headers the client always composes (x-user-id, x-cl-session)
 * are pinned once as well — promote must not silently drop them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getThreadTabId, promoteThread } from './aiThreadClient'
import { setCurrentUserId, setSessionToken } from './base'

interface CapturedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}
const capture: CapturedCall[] = []

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = Object.fromEntries(
    Object.entries(init?.headers ?? {}).map(([k, v]) => [String(k), String(v)]),
  )
  capture.push({ url, method, headers, body: typeof init?.body === 'string' ? init.body : '' })
  return {
    ok: true,
    status: 200,
    json: async () => ({ recordId: 'REC-promoted', promotedAt: '2026-10-29T00:00:00.000Z' }),
  }
})
vi.stubGlobal('fetch', fetchMock)

const TAB_ID_KEY = 'cl.ai-thread-tab-ids'
const readMap = (): Record<string, string> => JSON.parse(sessionStorage.getItem(TAB_ID_KEY) ?? '{}')

beforeEach(() => {
  sessionStorage.clear()
  capture.length = 0
  setCurrentUserId('USR-TEST')
  setSessionToken('SES-TEST')
})

describe('aiThreadClient.promoteThread — header set (spec §4.5 pin)', () => {
  it('a scoped promote carries x-cl-thread-scope + the scope\'s minted x-cl-thread-id', async () => {
    const id = await promoteThread(
      'event-editor',
      { title: 'Deck thread', recordId: 'REC-target' },
      { scope: 'EVG-promote-A' },
    )
    expect(id.recordId).toBe('REC-promoted')

    expect(capture).toHaveLength(1)
    const call = capture[0]!
    expect(call.method).toBe('POST')
    expect(call.url).toContain('/api/ai/threads/event-editor/promote')
    // Scope travels (A-1: all four routes).
    expect(call.headers['x-cl-thread-scope']).toBe('EVG-promote-A')
    // The id is the tab's mint FOR THAT SCOPE — the same id a get/append on
    // the scope carries (the transport and the promote agree, bait #7).
    expect(call.headers['x-cl-thread-id']).toBe(getThreadTabId('EVG-promote-A'))
    expect(readMap()['EVG-promote-A']).toBe(call.headers['x-cl-thread-id'])
    // Identity headers survive the promote.
    expect(call.headers['x-user-id']).toBe('USR-TEST')
    expect(call.headers['x-cl-session']).toBe('SES-TEST')
    // The fake captures the RAW init.headers object, so the literal key the
    // client composes is pinned (the client sends 'Content-Type').
    expect(call.headers['Content-Type']).toBe('application/json')
  })

  it('an instance-less promote (no opts.scope) sends NO x-cl-thread-scope header', async () => {
    await promoteThread('browser', { title: 'Flat thread', recordId: 'REC-flat' })

    expect(capture).toHaveLength(1)
    const call = capture[0]!
    expect(call.method).toBe('POST')
    expect(call.url).toContain('/api/ai/threads/browser/promote')
    // Never an empty/undefined scope value — the server places the thread
    // under its reserved "_" segment by ABSENCE of the header.
    expect('x-cl-thread-scope' in call.headers).toBe(false)
    expect(call.headers['x-cl-thread-id']).toBe(getThreadTabId(undefined))
    expect(readMap()['']).toBe(call.headers['x-cl-thread-id'])
  })
})

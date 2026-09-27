/**
 * LabSyncClient tests — fake fetchImpl captures RequestInfo/init.
 */
import { describe, expect, it, vi } from 'vitest'
import type { LabSyncWireEvent } from './types.js'
import { LabSyncClient } from './LabSyncClient.js'

const TOKEN = 'sekrit-token-9f3a'
const BASE = 'http://127.0.0.1:8787'

type FetchCall = { url: string; init: RequestInit }

function makeFetch(responder: (url: string, init: RequestInit) => Response) {
  const calls: FetchCall[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const merged = init ?? {}
    calls.push({ url, init: merged })
    return responder(url, merged)
  })
  return { fn: fn as unknown as typeof globalThis.fetch, calls }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function headersOf(init: RequestInit): Record<string, string> {
  const h = init.headers
  if (!h) throw new Error('no headers set')
  if (Array.isArray(h)) return Object.fromEntries(h)
  if (h instanceof Headers) return Object.fromEntries(h.entries())
  return { ...h }
}

function bodyOf(init: RequestInit): unknown {
  expect(typeof init.body).toBe('string')
  return JSON.parse(init.body as string)
}

const evt = (id: string, cursor: number): LabSyncWireEvent => ({
  event_id: id,
  cursor,
  type: 'order.created',
  occurred_at: '2026-09-26T17:42:31-04:00',
  payload: { order_remote_id: `tyfored_${id}` },
})

describe('LabSyncClient.events', () => {
  it('GETs the right URL with cursor+wait params and auth headers; returns parsed EventsPage', async () => {
    const page = { ok: true, events: [evt('evt_TYF_000123', 123)], cursor: 123 }
    const { fn, calls } = makeFetch(() => json(page))
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn })

    const result = await client.events(120, 30)

    expect(calls.length).toBe(1)
    expect(calls[0].url).toBe(`${BASE}/lab-sync/events?cursor=120&wait=30`)
    expect(calls[0].init.method ?? 'GET').toBe('GET')
    const headers = headersOf(calls[0].init)
    expect(headers['X-LAB-TOKEN']).toBe(TOKEN)
    expect(headers['content-type']).toBe('application/json')
    expect(result).toEqual({ events: page.events, cursor: 123 })
  })

  it('passes through an empty stream: returned cursor equals requested cursor, events []', async () => {
    const { fn } = makeFetch(() => json({ ok: true, events: [], cursor: 120 }))
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn })

    const result = await client.events(120)

    expect(result).toEqual({ events: [], cursor: 120 })
  })

  it('omits the wait param when wait is not given (server default 0)', async () => {
    const { fn, calls } = makeFetch(() => json({ ok: true, events: [], cursor: 5 }))
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn })
    await client.events(5)
    expect(calls[0].url).toBe(`${BASE}/lab-sync/events?cursor=5`)
  })
})

describe('LabSyncClient.ack', () => {
  it('POSTs {cursor} and returns acked_cursor', async () => {
    const { fn, calls } = makeFetch(() => json({ ok: true, acked_cursor: 18273 }))
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn })

    const result = await client.ack(18273)

    expect(calls.length).toBe(1)
    expect(calls[0].url).toBe(`${BASE}/lab-sync/ack`)
    expect(calls[0].init.method).toBe('POST')
    expect(bodyOf(calls[0].init)).toEqual({ cursor: 18273 })
    const headers = headersOf(calls[0].init)
    expect(headers['X-LAB-TOKEN']).toBe(TOKEN)
    expect(result).toEqual({ ok: true, acked_cursor: 18273 })
  })
})

describe('LabSyncClient.ingest', () => {
  const out: LabSyncWireEvent[] = [
    { event_id: 'evt_CL_008199', type: 'report.released', payload: {} },
  ]

  it('POSTs {events} and returns applied/duplicated/unknown verbatim', async () => {
    const res = { ok: true, applied: ['evt_CL_008199'], duplicated: ['evt_CL_1'], unknown: ['evt_CL_2'] }
    const { fn, calls } = makeFetch(() => json(res))
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn })

    const result = await client.ingest(out)

    expect(calls.length).toBe(1)
    expect(calls[0].url).toBe(`${BASE}/lab-sync/ingest`)
    expect(calls[0].init.method).toBe('POST')
    expect(bodyOf(calls[0].init)).toEqual({ events: out })
    expect(headersOf(calls[0].init)['X-LAB-TOKEN']).toBe(TOKEN)
    expect(result).toEqual(res)
  })

  it('throws on an empty batch before any fetch call (batch is 1..100)', async () => {
    const { fn, calls } = makeFetch(() => json({ ok: true, applied: [], duplicated: [], unknown: [] }))
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn })

    await expect(client.ingest([])).rejects.toThrow()
    expect(calls.length).toBe(0)
    expect(fn).not.toHaveBeenCalled()
  })

  it('normalizes ok:true missing arrays to [] (defensive)', async () => {
    const { fn } = makeFetch(() => json({ ok: true }))
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn })
    const result = await client.ingest(out)
    expect(result).toEqual({ ok: true, applied: [], duplicated: [], unknown: [] })
  })
})

describe('LabSyncClient error handling', () => {
  it('401 throws an error mentioning 401 without leaking the token', async () => {
    const { fn } = makeFetch(() => json({ ok: false, error: 'unauthorized' }, 401))
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn })

    const err = await client.events(0).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    const message = (err as Error).message
    expect(message).toContain('401')
    expect(message).not.toContain(TOKEN)
  })

  it('ok:false body missing acked_cursor is treated as an error (throws, message may include body)', async () => {
    const { fn } = makeFetch(() => json({ ok: false, error: 'stale cursor' }))
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn })

    const err = await client.ack(10).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('stale cursor')
  })

  it('network errors propagate (worker retries)', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const client = new LabSyncClient({ baseUrl: BASE, token: TOKEN, fetchImpl: fn as unknown as typeof globalThis.fetch })
    await expect(client.events(0)).rejects.toThrow('fetch failed')
  })

  it('trailing slash on baseUrl does not double-slash the path', async () => {
    const { fn, calls } = makeFetch(() => json({ ok: true, acked_cursor: 1 }))
    const client = new LabSyncClient({ baseUrl: `${BASE}/`, token: TOKEN, fetchImpl: fn })
    await client.ack(1)
    expect(calls[0].url).toBe(`${BASE}/lab-sync/ack`)
  })
})

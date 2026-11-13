// @vitest-environment node
// d3authclose: pins that apiClient.loadEventGraph FAILS CLOSED on a 404 from
// /records/:id — that 404 may be a genuinely missing record OR an access
// denial (the record route denies as NOT_FOUND, byte-identical to absence),
// so the client must reject instead of re-reading through the /ui/record
// route, which performs no access check. Non-404 faults (500, network) must
// keep surfacing as faults and never trigger a second route.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiClient } from './client'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const payload = (id: string) => ({ id, events: [], labwares: [] })

describe('apiClient.loadEventGraph (d3authclose)', () => {
  it('a 404 from /records/:id rejects and NEVER re-reads via /ui/record (deny-404)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 }))

    await expect(apiClient.loadEventGraph('EVG-1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/records/EVG-1')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('/ui/record/')
  })

  it('does NOT fall back on non-404 faults — a 500 still rejects', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }))

    await expect(apiClient.loadEventGraph('EVG-2')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('/ui/record/EVG-2')
  })

  it('keeps the single /records/:id request on the happy path', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ record: { recordId: 'EVG-3', schemaId: 'event-graph', payload: payload('EVG-3') } }), {
        status: 200,
      })
    )

    const result = await apiClient.loadEventGraph('EVG-3')

    expect(result).toEqual(payload('EVG-3'))
    expect(result.runId).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/records/EVG-3')
  })
})

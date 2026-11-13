// @vitest-environment node
// d3loadpath: pins apiClient.loadEventGraph's 404-only fallback to the
// /ui/record/:id envelope. The /records/:id route 404s for per-run plan
// graphs (they are filed under records/runs/<run>/event-graphs/ and are not
// listed by /records), while GET /ui/record/:id returns their envelope —
// so a run's own plan graph must load instead of surfacing as missing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiClient } from './client'
import { ApiError } from './errors'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const payload = (id: string) => ({ id, events: [], labwares: [] })

describe('apiClient.loadEventGraph (d3loadpath)', () => {
  it('falls back to /ui/record/:id when /records/:id 404s (per-run plan graph)', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            record: { recordId: 'EVG-1', schemaId: 'event-graph', payload: payload('EVG-1'), meta: {} },
            uiSpec: null,
            schema: null,
          }),
          { status: 200 }
        )
      )

    const result = await apiClient.loadEventGraph('EVG-1')

    expect(result.id).toBe('EVG-1')
    expect(result.events).toEqual([])
    expect(result.labwares).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/ui/record/EVG-1')
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

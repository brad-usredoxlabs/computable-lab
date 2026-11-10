// @vitest-environment node
/**
 * Pin the buildPlanGraph client route.
 *
 * The component test mocks apiClient, so it stays green if the route literal
 * drifts. This test exercises the real client call against a mocked fetch and
 * asserts the outbound URL suffix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'

const fetchSpy = vi.fn()

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response
}

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiClient.buildPlanGraph route pin', () => {
  it('POSTs /runs/:plannedRunId/plan-graph with no body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { success: true, graphId: 'EVG-abc123' }))

    const result = await apiClient.buildPlanGraph('PLR 1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toMatch(/\/runs\/PLR%201\/plan-graph$/)

    expect(result.success).toBe(true)
    expect(result.graphId).toBe('EVG-abc123')
  })
})

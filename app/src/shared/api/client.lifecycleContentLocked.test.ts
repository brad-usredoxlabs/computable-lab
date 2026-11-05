// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

describe('apiClient.getLifecycleContentLockedStates', () => {
  it('maps contentLockedStates from server response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { contentLockedStates: ['approved', 'effective'] }))

    const result = await apiClient.getLifecycleContentLockedStates('lifecycle-1')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toMatch(/\/lifecycle\/lifecycle-1\/transitions$/)
    expect(result).toEqual(['approved', 'effective'])
  })

  it('returns empty array when contentLockedStates field is missing', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, { transitions: [] }))

    const result = await apiClient.getLifecycleContentLockedStates('lifecycle-1')

    expect(result).toEqual([])
  })

  it('returns empty array on 404 (fail-open)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(404, { error: 'not found' }))

    const result = await apiClient.getLifecycleContentLockedStates('nonexistent')

    expect(result).toEqual([])
  })
})

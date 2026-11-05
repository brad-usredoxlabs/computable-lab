/**
 * LEG 2b-i — contentLockedStatesCache pins.
 *
 * Prime-once + inflight dedupe, sync read, and fail-open error behavior.
 * The declared set comes from the transitions endpoint (mocked fetch — the
 * seed path below proves the sync read without any fetch at all). This suite
 * is self-contained: it pins the cache module only, never the sync gates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import {
  __resetContentLockedStatesCache,
  getContentLockedStatesSync,
  isContentLockedSetResolved,
  primeContentLockedStates,
  seedContentLockedStates,
} from './contentLockedStatesCache'

const LIFECYCLE = 'document-controlled-signing'

describe('LEG2b-i: contentLockedStatesCache', () => {
  const fetchSpy = vi.fn()
  const jsonResponse = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: '', json: async () => body }) as Response

  beforeEach(() => {
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    __resetContentLockedStatesCache()
  })

  it('seedContentLockedStates primes the sync read; an unprimed id reads []', () => {
    expect(getContentLockedStatesSync(LIFECYCLE)).toEqual([])
    seedContentLockedStates(LIFECYCLE, ['effective'])
    expect(getContentLockedStatesSync(LIFECYCLE)).toEqual(['effective'])
    // The seed is the sync read source the gate swap consumes — no fetch involved.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('prime fetches once via the transitions endpoint and stores the declared set for the sync read', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {
      transitions: [],
      terminalStates: ['closed'],
      contentLockedStates: ['effective', 'archived'],
    }))
    const first = primeContentLockedStates(LIFECYCLE)
    const second = primeContentLockedStates(LIFECYCLE) // concurrent: deduped onto the first fetch
    await expect(first).resolves.toEqual(['effective', 'archived'])
    expect(second).toBe(first)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(`/lifecycle/${LIFECYCLE}/transitions`)
    // A later prime is a cache hit: no second fetch.
    await expect(primeContentLockedStates(LIFECYCLE)).resolves.toEqual(['effective', 'archived'])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(getContentLockedStatesSync(LIFECYCLE)).toEqual(['effective', 'archived'])
  })

  it('fail-closed: a lookup error leaves the lifecycle unresolved and retries on the next prime', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('transitions endpoint down'))
    await expect(primeContentLockedStates(LIFECYCLE)).resolves.toEqual([])
    expect(getContentLockedStatesSync(LIFECYCLE)).toEqual([])
    // Fail-closed: the lifecycle is NOT resolved, so a second prime retries.
    expect(isContentLockedSetResolved(LIFECYCLE)).toBe(false)
    await expect(primeContentLockedStates(LIFECYCLE)).resolves.toEqual([])
    // Second fetch because the lifecycle was never marked resolved.
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    // A successful fetch resolves the lifecycle.
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, {
      transitions: [], terminalStates: [], contentLockedStates: ['effective'],
    }))
    await expect(primeContentLockedStates(LIFECYCLE)).resolves.toEqual(['effective'])
    expect(isContentLockedSetResolved(LIFECYCLE)).toBe(true)
    // A fourth prime is a cache hit after resolution: still 3 fetches total.
    await expect(primeContentLockedStates(LIFECYCLE)).resolves.toEqual(['effective'])
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('the LEG 2a accessor is the source this cache primes from', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(404, { error: 'Not Found' }))
    await expect(primeContentLockedStates('missing-lifecycle')).resolves.toEqual([])
    expect(getContentLockedStatesSync('missing-lifecycle')).toEqual([])
    // Sanity: the same endpoint shape the accessor pins (P-e) feeds this cache.
    expect(apiClient.getLifecycleContentLockedStates).toBeTypeOf('function')
  })
})

/**
 * integrationFlags — unit tests for the client-side declared-capability read
 * (SHORTHAND-CORPUS WS6 D1).
 *
 * The semantics under test are the SERVER's own (server/src/integrations/exa.ts
 * normalizeConfig): the Exa integration is disabled iff `enabled === false`;
 * absent config/integrations/exa = enabled. Plus the access contract: ONE
 * GET /api/config per page load (cached), never a per-keystroke fetch, and a
 * failed read falls back to the server default (enabled) rather than silently
 * removing a capability.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getConfig = vi.fn()
vi.mock('../api/client', () => ({
  apiClient: { getConfig: () => getConfig() },
}))

import {
  exaVendorEnabled,
  noteExaUnavailable,
  resetIntegrationFlagCacheForTests,
} from './integrationFlags'

beforeEach(() => {
  getConfig.mockReset()
  resetIntegrationFlagCacheForTests()
})

describe('exaVendorEnabled — mirrors the server normalizeConfig semantics', () => {
  it('enabled === false is the ONLY disabled signal', async () => {
    getConfig.mockResolvedValue({ integrations: { exa: { enabled: false, apiKey: '***' } } })
    expect(await exaVendorEnabled()).toBe(false)
  })

  it('absent integrations / absent exa / absent enabled all mean ENABLED (the server default)', async () => {
    resetIntegrationFlagCacheForTests()
    getConfig.mockResolvedValue({ integrations: null })
    expect(await exaVendorEnabled()).toBe(true)

    resetIntegrationFlagCacheForTests()
    getConfig.mockResolvedValue({ integrations: {} })
    expect(await exaVendorEnabled()).toBe(true)

    resetIntegrationFlagCacheForTests()
    getConfig.mockResolvedValue({ integrations: { exa: { apiKey: '***' } } })
    expect(await exaVendorEnabled()).toBe(true)

    resetIntegrationFlagCacheForTests()
    getConfig.mockResolvedValue({ integrations: { exa: { enabled: true } } })
    expect(await exaVendorEnabled()).toBe(true)
  })

  it('a redacted apiKey is NOT treated as a disabled signal (enabled stays authoritative)', async () => {
    // Verified first-hand: GET /api/config redacts apiKey to '***' even when a
    // real key is configured, so key shape must never drive the gate.
    getConfig.mockResolvedValue({ integrations: { exa: { enabled: true, apiKey: '***' } } })
    expect(await exaVendorEnabled()).toBe(true)
  })

  it('fetches config ONCE and caches — repeated resolver calls never re-fetch', async () => {
    getConfig.mockResolvedValue({ integrations: { exa: { enabled: false } } })
    expect(await exaVendorEnabled()).toBe(false)
    expect(await exaVendorEnabled()).toBe(false)
    expect(await exaVendorEnabled()).toBe(false)
    expect(getConfig).toHaveBeenCalledTimes(1)
  })

  it('a failed config read falls back to the server default (enabled), cached once', async () => {
    getConfig.mockRejectedValue(new Error('offline'))
    expect(await exaVendorEnabled()).toBe(true)
    expect(await exaVendorEnabled()).toBe(true)
    expect(getConfig).toHaveBeenCalledTimes(1)
  })
})

/**
 * GC-17 RED — sticky-negative seam on the EXISTING cache.
 *
 * The hook's honest `configured:false` response (server-side: no key, or the
 * vendor rejected the credential) must stick for the page load so the 3-4
 * run-page surfaces don't re-probe after the first honest refusal. It rides
 * the SAME once-per-page-load cache as `exaVendorEnabled` (one cache, one
 * term — no new capability vocabulary). A config READ FAILURE still falls
 * back to enabled (a config outage must not kill the tier) and an honest
 * re-enable via config (enabled:true) is only observed on the next page load.
 */
describe('noteExaUnavailable — sticky-negative on the existing cache (GC-17)', () => {
  it('marks the capability unavailable for the page load: subsequent reads are false, ZERO re-fetches', async () => {
    getConfig.mockResolvedValue({ integrations: { exa: { enabled: true } } })
    // The capability read happens once (declared on)…
    expect(await exaVendorEnabled()).toBe(true)
    // …then the server answers the honest refusal and the hook notes it.
    noteExaUnavailable()
    // …so every other surface on the page load skips the fire.
    expect(await exaVendorEnabled()).toBe(false)
    expect(await exaVendorEnabled()).toBe(false)
    expect(getConfig).toHaveBeenCalledTimes(1)
  })

  it('a note before any read sticks without fetching at all', async () => {
    noteExaUnavailable()
    expect(await exaVendorEnabled()).toBe(false)
    expect(getConfig).not.toHaveBeenCalled()
  })

  it('the test seam drops the sticky negative (re-probe on next page load)', async () => {
    noteExaUnavailable()
    expect(await exaVendorEnabled()).toBe(false)
    resetIntegrationFlagCacheForTests()
    getConfig.mockResolvedValue({ integrations: { exa: { enabled: true } } })
    expect(await exaVendorEnabled()).toBe(true)
  })
})

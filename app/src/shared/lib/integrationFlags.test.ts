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

import { exaVendorEnabled, resetIntegrationFlagCacheForTests } from './integrationFlags'

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

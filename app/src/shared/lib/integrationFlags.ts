/**
 * integrationFlags — the client-side read of DECLARED integration capability
 * flags (SHORTHAND-CORPUS WS6 fix, D1).
 *
 * Business rules stay in data: the server config (`integrations.exa`) declares
 * whether the Exa vendor search is on. The client mirrors the server's OWN
 * semantics — server/src/integrations/exa.ts normalizeConfig: the integration
 * is disabled iff `enabled === false`; absent config = enabled — instead of
 * inventing a local policy. GET /api/config redacts apiKey to '***' even when
 * a real key is set (verified first-hand on the lane backend), so `enabled`
 * is the only honest client-side signal; the client never guesses key validity.
 *
 * The app has no bootstrap config store (useConfig is a per-mount Settings
 * fetch — verified: no ConfigProvider/configStore exists), so this is the
 * sanctioned fetch-ONCE-and-cache access: one GET /api/config per page load,
 * shared by every slash-menu resolver — never a per-keystroke fetch. A failed
 * read falls back to the server default (enabled) so a config outage never
 * silently removes a capability.
 */
import { apiClient } from '../api/client'

let exaEnabledPromise: Promise<boolean> | null = null

/**
 * Whether the vendor Exa capability is declared on. Resolved once per page
 * load and cached; mirrors normalizeConfig: disabled iff `enabled === false`.
 */
export function exaVendorEnabled(): Promise<boolean> {
  if (!exaEnabledPromise) {
    exaEnabledPromise = apiClient
      .getConfig()
      .then((config) => config.integrations?.exa?.enabled !== false)
      .catch(() => true)
  }
  return exaEnabledPromise
}

/** Test seam: drop the cached read so a suite can re-declare the flag. */
export function resetIntegrationFlagCacheForTests(): void {
  exaEnabledPromise = null
}

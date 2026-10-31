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
 * GC-17 sticky-negative: once the server has answered the capability question
 * with an honest refusal (`configured:false` — no key, or the vendor rejected
 * the credential), the capability is FALSE for the rest of the page load. The
 * run page has 3-4 vendor-search surfaces; without this they would each
 * re-probe and each 502. It lives in THIS cache (one cache, one term) — a page
 * reload re-probes (a pasted-in valid key heals without a redeploy).
 */
let exaUnavailableSticky = false

/**
 * Whether the vendor Exa capability is declared on. Resolved once per page
 * load and cached; mirrors normalizeConfig: disabled iff `enabled === false`.
 * Returns false for the page load after an honest refusal has been noted via
 * `noteExaUnavailable` (GC-17 sticky-negative) — a config READ FAILURE still
 * falls back to the server default (enabled): a config outage never silently
 * removes a capability.
 */
export function exaVendorEnabled(): Promise<boolean> {
  if (exaUnavailableSticky) {
    return Promise.resolve(false)
  }
  if (!exaEnabledPromise) {
    // A read FAILURE (network rejection OR an un-stubbed client, which throws
    // synchronously) falls back to the server default (enabled) — a config
    // outage must never silently remove a capability. The try/catch covers the
    // synchronous-throw case so callers can rely on this always resolving.
    let read: Promise<boolean>
    try {
      read = apiClient
        .getConfig()
        .then((config) => config.integrations?.exa?.enabled !== false)
    } catch {
      read = Promise.resolve(true)
    }
    exaEnabledPromise = read.catch(() => true)
  }
  return exaEnabledPromise
}

/**
 * GC-17: mark the Exa capability unavailable for the rest of the page load
 * after the server answered the capability question with an honest refusal
 * (`configured:false`). Callers: the vendor-Exa search hook, ONLY on a
 * `configured:false` response — never on a 502-class outage (a blip must not
 * silently kill the tier for the session).
 */
export function noteExaUnavailable(): void {
  exaUnavailableSticky = true
}

/** Test seam: drop the cached read AND the sticky negative so a suite can re-declare the flag. */
export function resetIntegrationFlagCacheForTests(): void {
  exaEnabledPromise = null
  exaUnavailableSticky = false
}

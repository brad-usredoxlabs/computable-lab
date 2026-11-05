/**
 * LEG 2b-i — synchronous declared-set cache for the protocol-step gates.
 *
 * `protocolStepEditing.ts` runs on SYNCHRONOUS call sites (step editor + the
 * AI applier's declared-role ops) that cannot await. The declared
 * content-locked set still comes from `GET /lifecycle/<id>/transitions`
 * (`apiClient.getLifecycleContentLockedStates`, LEG 2a) — this module only
 * PRIMES a module-level cache that the synchronous gates then read.
 *
 * Mirrors the `useMaterialProfiles.ts` cache precedent: fetch once per
 * lifecycleId, share across every surface instance. The declared set is the
 * server's; no state literals live here. Fail-closed: an unresolved or failed
 * set causes the sync gate to throw a named error rather than degrading to
 * an empty set — the lock cannot be bypassed by an empty cache.
 */
import { apiClient } from '../api/client'

const cache = new Map<string, string[]>()
const inflight = new Map<string, Promise<string[]>>()
const resolved = new Set<string>()

/**
 * Prime the synchronous read cache for one lifecycleId.
 * Cache hit -> the stored set. Concurrent calls dedupe onto one fetch.
 * On success the lifecycleId is marked resolved. On error the fetch resolves []
 * but the lifecycleId is NOT marked resolved — the sync gate will fail closed.
 */
export function primeContentLockedStates(lifecycleId: string): Promise<string[]> {
  const hit = cache.get(lifecycleId)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(lifecycleId)
  if (pending) return pending
  const started = apiClient
    .getLifecycleContentLockedStates(lifecycleId)
    .then((states) => {
      cache.set(lifecycleId, states)
      resolved.add(lifecycleId)
      return states
    })
    .catch(() => {
      return [] as string[]
    })
    .finally(() => {
      inflight.delete(lifecycleId)
    })
  inflight.set(lifecycleId, started)
  return started
}

/** Synchronous cache read for the sync protocol gates; [] when unprimed. */
export function getContentLockedStatesSync(lifecycleId: string): string[] {
  return cache.get(lifecycleId) ?? []
}

/** Test-only: seed the sync read cache without a fetch (production plumbing, not a state literal). */
export function seedContentLockedStates(lifecycleId: string, states: string[]): void {
  cache.set(lifecycleId, states)
  resolved.add(lifecycleId)
}

/** Test-only: clear the module cache between tests. */
export function __resetContentLockedStatesCache(): void {
  cache.clear()
  inflight.clear()
  resolved.clear()
}

/** Returns whether the declared-set for this lifecycleId has been successfully resolved. */
export function isContentLockedSetResolved(lifecycleId: string): boolean {
  return resolved.has(lifecycleId)
}

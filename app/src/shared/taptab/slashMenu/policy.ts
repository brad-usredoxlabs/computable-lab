/**
 * L2-CLARIFY-PICKER-1 P1 — module-level cached loader for the declared
 * candidate-ranking policy.
 *
 * The resolvers are non-React, so this mirrors the `useMaterialProfiles`
 * cache idiom (app/src/shared/material-intent/useMaterialProfiles.ts) WITHOUT
 * a React hook: fetch the policy once via the extended `listMaterialProfiles`
 * and share it across every resolver invocation in the session. The registry
 * is static for a session, so one GET is the whole cost.
 *
 * ABSENT declaration (the server omits `candidateRanking`) => null: the
 * comparator then keeps its resolver-emitted order (no ranking, no fallback
 * table). A fetch failure (offline / 404) is likewise null — the picker degrades
 * to today's behavior rather than fabricating a ranking (the never-fabricate
 * rule).
 *
 * Test hooks: `__resetCandidateRankingPolicy` (clear the cache between tests)
 * and `__setCandidateRankingPolicy` (seed a deterministic policy without a
 * fetch).
 */
import { apiClient } from '../../api/client'
import type { CandidateRankingPolicy } from './clarifyPickerRanking'

type Stored =
  | { kind: 'none' }
  | { kind: 'policy'; policy: CandidateRankingPolicy }

let cache: Stored | null = null
let inflight: Promise<Stored> | null = null

function fetchPolicy(): Promise<Stored> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = apiClient
      .listMaterialProfiles()
      .then((res) => {
        // OQ1: the response carries the declared policy (structural identity
        // with CandidateRankingPolicy); ABSENT when the registry declares none.
        const ranking = res.candidateRanking
        const stored: Stored = ranking
          ? { kind: 'policy', policy: ranking }
          : { kind: 'none' }
        cache = stored
        return stored
      })
      .catch(() => {
        // A fetch failure degrades to NO ranking (the picker keeps its
        // resolver-emitted order). Never fabricate a table.
        const stored: Stored = { kind: 'none' }
        cache = stored
        return stored
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/**
 * The declared candidate-ranking policy, or null when the registry declares
 * none (or the fetch failed). Awaited once per resolver first-paint; the cache
 * makes subsequent calls synchronous.
 */
export async function getCandidateRankingPolicy(): Promise<CandidateRankingPolicy | null> {
  const stored = await fetchPolicy()
  return stored.kind === 'policy' ? stored.policy : null
}

/** Test-only: clear the module cache between tests. */
export function __resetCandidateRankingPolicy(): void {
  cache = null
  inflight = null
}

/** Test-only: seed a deterministic policy (or null) without a fetch. */
export function __setCandidateRankingPolicy(policy: CandidateRankingPolicy | null): void {
  cache = policy ? { kind: 'policy', policy } : { kind: 'none' }
  inflight = null
}

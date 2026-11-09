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
import type { CandidateRankingPolicy, SelectionPolicy } from './clarifyPickerRanking'

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

/**
 * L2-MATERIAL-SELECTION-POLICY-1 — cached loader for material-selection-policy
 * records. Fetches from `GET /records?kind=material-selection-policy` and maps
 * each envelope's payload to a client-side SelectionPolicy. Malformed entries
 * are silently dropped (the picker must never throw on a bad record).
 *
 * Fetch failure => empty array: the picker keeps all candidates and focuses by
 * canBeDefault alone (never fabricates a policy).
 *
 * Duplicate `only` guard: throws when two records claim `selection: only` for
 * the same material concept — mirrors the server-side contract from
 * normalizeMaterialSelectionPolicies (MaterialSelectionPolicy.ts:51-60). The
 * load-path guard carries this obligation because LintEngine supports record
 * scope only (LintEngine.ts:143); a cross-record lint rule cannot express it.
 */
type SelectionKind = 'only' | 'default' | 'alternative'
type RefKind = 'ontology' | 'record'

/**
 * Discriminates a guard error from a fetch failure so the loader's .catch
 * can re-throw the guard but still fail-open on genuine network errors.
 */
export class PolicyGuardError extends Error {}

/**
 * Guard: throw when two `only` policies claim the same material concept.
 * Mirrors normalizeMaterialSelectionPolicies (MaterialSelectionPolicy.ts:51-60)
 * — same concept key `kind:id`, error names BOTH recordIds.
 */
function guardDuplicateOnlyPolicies(policies: SelectionPolicy[]): void {
  const conceptToOnlyIds = new Map<string, string[]>()
  for (const p of policies) {
    if (p.selection !== 'only') continue
    const key = `${p.material_ref.kind}:${p.material_ref.id}`
    const existing = conceptToOnlyIds.get(key)
    if (existing === undefined) {
      conceptToOnlyIds.set(key, [p.recordId])
    } else {
      existing.push(p.recordId)
    }
  }
  for (const [conceptKey, ids] of conceptToOnlyIds) {
    if (ids.length > 1) {
      throw new PolicyGuardError(
        `Duplicate 'only' selection for material concept ${conceptKey}: ` +
          `${ids[0]} and ${ids[1]}`,
      )
    }
  }
}

let selCache: SelectionPolicy[] | null = null
let selInflight: Promise<SelectionPolicy[]> | null = null

function fetchSelectionPolicies(): Promise<SelectionPolicy[]> {
  if (selCache) return Promise.resolve(selCache)
  if (!selInflight) {
    selInflight = apiClient
      .listRecordsByKind('material-selection-policy')
      .then((res) => {
        const policies: SelectionPolicy[] = []
        for (const envelope of res.records ?? []) {
          const payload = envelope.payload as Record<string, unknown> | undefined
          const mr = payload?.material_ref as { kind?: string; id?: string } | undefined
          const vpr = payload?.vendor_product_ref as { kind?: string; id?: string } | undefined
          const sel = payload?.selection as string | undefined
          if (
            !mr || !vpr || typeof sel !== 'string' ||
            !['only', 'default', 'alternative'].includes(sel) ||
            !(mr.kind === 'ontology' || mr.kind === 'record') ||
            !(vpr.kind === 'ontology' || vpr.kind === 'record')
          ) {
            continue
          }
          policies.push({
            recordId: envelope.recordId,
            material_ref: { kind: mr.kind as RefKind, id: mr.id! },
            vendor_product_ref: { kind: vpr.kind as RefKind, id: vpr.id! },
            selection: sel as SelectionKind,
          })
        }
        guardDuplicateOnlyPolicies(policies)
        selCache = policies
        return policies
      })
      .catch((err) => {
        // PolicyGuardError (duplicate-only) must propagate to the caller;
        // a genuine fetch failure stays fail-open.
        if (err instanceof PolicyGuardError) throw err
        // Fetch failure => no policies (fail-open, never fabricate)
        selCache = []
        return []
      })
      .finally(() => {
        selInflight = null
      })
  }
  return selInflight
}

/**
 * The declared material selection policies, or [] when none are declared or
 * the fetch failed. Awaited once per resolver first-paint; the cache makes
 * subsequent calls synchronous.
 */
export async function getMaterialSelectionPolicies(): Promise<SelectionPolicy[]> {
  return fetchSelectionPolicies()
}

/** Test-only: clear the module cache between tests. */
export function __resetMaterialSelectionPolicies(): void {
  selCache = null
  selInflight = null
}

/** Test-only: seed deterministic policies without a fetch. */
export function __setMaterialSelectionPolicies(policies: SelectionPolicy[]): void {
  guardDuplicateOnlyPolicies(policies)
  selCache = policies
  selInflight = null
}

/** Test-only: reset all policy caches. */
export function __resetAllPolicies(): void {
  cache = null
  inflight = null
  selCache = null
  selInflight = null
}

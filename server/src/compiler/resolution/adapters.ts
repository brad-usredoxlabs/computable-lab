/**
 * SPINE-3 candidate adapters — generic CandidateAdapter wrappers over the
 * resolvers that already exist (§5.3). The engine edits NONE of them; it
 * adapts them. Every adapter carries the honest `failed` bit: a lookup that
 * THROWS is recorded, never silently emptied (lookup error != unknown noun).
 *
 * Adapter ids ('spine', 'labware-hint', 'registry', 'role-address') and reason
 * codes are adapter identity, not domain policy — the engine still never
 * branches on a verb, class, or domain NAME.
 */
import { defaultRoleResolver } from '../roles/RoleResolver.js';
import { ONTOLOGY_DOMAINS } from '../../ontology/domains.js';
import { suggestExistingTerms, type TermLike } from '../../materials/termReconciliation.js';
import type { ProviderHit, RankedCandidate, ResolveOptions, ResolveProvider, ResolveTier } from '../../resolve/types.js';
import type { CandidateAdapter, TierOutcome } from './types.js';

/** The slice of ResolveSpine the engine needs (resolveDraftMaterials' own
 *  SpineLike seam, :29-31 — tests need no server). Typed against the real
 *  ResolveOptions so level/kinds flow to the spine's own bonuses. */
export interface EngineSpineLike {
  resolve(term: string, opts?: ResolveOptions): Promise<readonly RankedCandidate[]>;
}

// ---------------------------------------------------------------------------
// Honest failure capture
// ---------------------------------------------------------------------------

/**
 * ResolveSpine.runProvider swallows provider errors to empty (:148-149) and
 * SPINE-3 MUST NOT change that (UI/agent consumers depend on it). So the
 * engine wraps each provider BEFORE handing it to the spine: the wrapper
 * records `failed` on a shared tracker without altering ResolveSpine itself.
 */
export function createFailureTrackingProvider(
  inner: ResolveProvider,
  tracker: { failed: boolean; message?: string | undefined },
): ResolveProvider {
  return async (term, limit, signal) => {
    try {
      return await inner(term, limit, signal);
    } catch (error) {
      tracker.failed = true;
      tracker.message = error instanceof Error ? error.message : String(error);
      return [];
    }
  };
}

function candidateFromHit(hit: ProviderHit, tier: ResolveTier, source: RankedCandidate['source'], score: number): RankedCandidate {
  return {
    curie: hit.curie,
    label: hit.label,
    namespace: hit.namespace ?? (hit.curie.includes(':') ? hit.curie.split(':')[0]! : ''),
    tier,
    level: hit.level ?? 'unknown',
    score,
    source,
    ...(hit.uri ? { uri: hit.uri } : {}),
    ...(hit.definition ? { definition: hit.definition } : {}),
    ...(hit.termKind ? { termKind: hit.termKind } : {}),
    ...(hit.domain ? { domain: hit.domain } : {}),
  };
}

// ---------------------------------------------------------------------------
// spineAdapter — wraps a SpineLike (resolveDraftMaterials' own seam, :29-31)
// ---------------------------------------------------------------------------

export function createSpineAdapter(
  spine: EngineSpineLike,
  tracker: { failed: boolean; message?: string | undefined },
): CandidateAdapter {
  return {
    id: 'spine',
    async gather(label, req): Promise<TierOutcome> {
      tracker.failed = false;
      tracker.message = undefined;
      try {
        const candidates = await spine.resolve(label, {
          // Compiler hot-path doctrine (ResolveOptions.localOnly): resolution
          // stays fast and offline-safe inside the engine pass.
          localOnly: true,
          ...(req.wantLevel ? { level: req.wantLevel } : {}),
        });
        const outcome: TierOutcome = { candidates: [...candidates], failed: tracker.failed };
        if (tracker.failed) {
          outcome.failedBy = 'spine';
          outcome.error = tracker.message ?? 'spine provider failed';
        }
        return outcome;
      } catch (error) {
        return {
          candidates: [],
          failed: true,
          failedBy: 'spine',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// labwareHintAdapter — wraps the searchLabwareByHint-shaped lookup
// (ChatbotCompilePasses.ts:1537+ dep shape). A throwing callback sets
// `failed`, never silent-empty.
// ---------------------------------------------------------------------------

export interface LabwareHintMatch {
  recordId: string;
  title: string;
}

export function createLabwareHintAdapter(
  searchLabwareByHint: (hint: string) => Promise<readonly LabwareHintMatch[]>,
): CandidateAdapter {
  return {
    id: 'labware-hint',
    async gather(label): Promise<TierOutcome> {
      try {
        const matches = await searchLabwareByHint(label);
        return {
          candidates: matches.map((m) =>
            candidateFromHit(
              { curie: m.recordId, label: m.title, namespace: 'local', level: 'unknown' },
              1,
              'local-record',
              1.0,
            ),
          ),
          failed: false,
        };
      } catch (error) {
        return {
          candidates: [],
          failed: true,
          failedBy: 'labware-hint',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// registryAdapter — exact-match evidence over the findByName registry shapes
// (NounPhraseResolver deps). EVIDENCE tier only; never auto-wins at ambiguity.
// ---------------------------------------------------------------------------

export interface RegistryAdapterDeps {
  labwareDefinitionRegistry: { findByName: (name: string) => { recordId: string } | undefined };
  compoundClassRegistry: { findByName: (name: string) => { recordId: string } | undefined };
}

export function createRegistryAdapter(deps: RegistryAdapterDeps): CandidateAdapter {
  return {
    id: 'registry',
    async gather(label): Promise<TierOutcome> {
      try {
        const hits: RankedCandidate[] = [];
        const lw = deps.labwareDefinitionRegistry.findByName(label);
        if (lw) hits.push(candidateFromHit({ curie: lw.recordId, label, namespace: 'local', level: 'unknown' }, 1, 'local-record', 0.9));
        const cp = deps.compoundClassRegistry.findByName(label);
        if (cp) hits.push(candidateFromHit({ curie: cp.recordId, label, namespace: 'local', level: 'unknown' }, 1, 'local-record', 0.9));
        return { candidates: hits, failed: false };
      } catch (error) {
        return {
          candidates: [],
          failed: true,
          failedBy: 'registry',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// roleAddressAdapter — defaultRoleResolver for address-kind arguments ONLY.
// Empty expansion is UNKNOWN ADDRESS (→ clarification), stricter than the
// pipeline's unknown-role pass-through; the strictness is engine policy (§5.3).
// ---------------------------------------------------------------------------

export interface RoleAddressContext {
  orientation: 'landscape' | 'portrait';
  labwareType: string;
  args?: Record<string, unknown>;
}

export function createRoleAddressAdapter(ctx?: Partial<RoleAddressContext>): CandidateAdapter {
  const context: RoleAddressContext = {
    orientation: ctx?.orientation ?? 'landscape',
    labwareType: ctx?.labwareType ?? '96-well-plate',
    ...(ctx?.args ? { args: ctx.args } : {}),
  };
  return {
    id: 'role-address',
    async gather(label): Promise<TierOutcome> {
      try {
        const addresses = defaultRoleResolver(label, context);
        // Addresses are carried as tier-1 candidates whose curie is the role
        // label; the strategy turns `addresses` into the binding payload.
        return {
          candidates: addresses.map((address) =>
            candidateFromHit(
              { curie: `local:well:${address}`, label: address, namespace: 'local', level: 'unknown' },
              1,
              'local-record',
              1.0,
            ),
          ),
          failed: false,
        };
      } catch (error) {
        return {
          candidates: [],
          failed: true,
          failedBy: 'role-address',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// ontologyAdapter — the DECLARED domain tag → ONTOLOGY_DOMAINS (domains.ts) →
// namespace filter over spine candidates. NO TS domain→ontology literals here;
// the map lives in data. No new ontology search.
// ---------------------------------------------------------------------------

/** Namespace prefixes an ontology domain's primary ontology produces (e.g.
 *  chemical -> CHEBI via the ONTOLOGY_DOMAINS primary 'chebi'). Local tiers
 *  (namespace 'local') are NEVER filtered — the lab's own records always
 *  remain eligible (prefer what the lab already has). */
export function declaredNamespacesForDomain(domain: string | undefined): Set<string> | undefined {
  if (!domain) return undefined;
  const config = (ONTOLOGY_DOMAINS as Record<string, { primary: string }>)[domain];
  if (!config) return undefined; // a domain tag with no ontology declaration imposes no filter
  const primary = config.primary.toUpperCase();
  const namespaces = new Set<string>([primary, 'local']);
  for (const ols of (ONTOLOGY_DOMAINS as Record<string, { olsOntologies?: string[] }>)[domain]?.olsOntologies ?? []) {
    namespaces.add(ols.toUpperCase());
  }
  return namespaces;
}

export function filterCandidatesByDeclaredDomain(
  candidates: RankedCandidate[],
  domain: string | undefined,
): { eligible: RankedCandidate[]; rejected: RankedCandidate[] } {
  const namespaces = declaredNamespacesForDomain(domain);
  if (!namespaces) return { eligible: candidates, rejected: [] };
  const eligible: RankedCandidate[] = [];
  const rejected: RankedCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.tier === 5) {
      eligible.push(candidate); // the mint affordance is not a namespace claim
      continue;
    }
    if (namespaces.has(candidate.namespace.toUpperCase())) eligible.push(candidate);
    else rejected.push(candidate);
  }
  return { eligible, rejected };
}

// ---------------------------------------------------------------------------
// Hint evidence + near-miss suggestions (§5.4)
// ---------------------------------------------------------------------------

/** Near-miss typos surface as suggestExistingTerms evidence in a clarification
 *  (never merged, never auto-linked — termReconciliation doctrine: link on a
 *  match, SUGGEST on a near miss). The engine consumes this in its
 *  unknown-noun clarification arm via deps.termsForSuggestions. */
export function nearMissSuggestions(label: string, terms: readonly TermLike[]): Array<{ label: string; confidence: number }> {
  return suggestExistingTerms(label, terms).map((suggestion) => ({
    label: suggestion.term.preferredLabel,
    confidence: Math.max(0, 1 - suggestion.distance / 10),
  }));
}

// ---------------------------------------------------------------------------
// hint-evidence adapter — wraps lowerProtocolIntentLabwareCandidates VERBATIM
// (the §6 hint-parity surface). The adapter must not "improve" wording: the
// {hint, reason, deckSlot?} objects pass through byte-for-byte, key ABSENCE
// preserved (compact() discipline).
// ---------------------------------------------------------------------------

import { lowerProtocolIntentLabwareCandidates } from '../protocolIntent/ProtocolIntentLowering.js';
import type { ProtocolIntent } from '../protocolIntent/ProtocolIntent.js';

export function createHintEvidenceAdapter(intent: ProtocolIntent): CandidateAdapter {
  return {
    id: 'hint-evidence',
    async gather(): Promise<TierOutcome> {
      try {
        const candidates = lowerProtocolIntentLabwareCandidates(intent);
        return { candidates: candidates as unknown as RankedCandidate[], failed: false };
      } catch (error) {
        return {
          candidates: [],
          failed: true,
          failedBy: 'hint-evidence',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}



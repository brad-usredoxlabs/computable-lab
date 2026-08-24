/**
 * Types for the resolve() spine — the single term-resolution path shared by
 * the compiler, the UI/copilot, and the agent.
 *
 * Resolution walks a five-tier hierarchy and always returns CURIE-typed
 * candidates. The output is never bare free text: an external ontology hit
 * carries its ontology CURIE; an existing local record carries a `local:`
 * CURIE; and tier 5 returns a "mint a new local term" affordance.
 */

/** Resolution tiers, in priority order (lower = preferred). */
export type ResolveTier = 0 | 1 | 2 | 3 | 4 | 5;

/** Material-hierarchy layer a candidate sits at (see materials-are-a-hierarchy). */
export type MaterialLevel = 'concept' | 'spec' | 'instance' | 'aliquot' | 'unknown';

/** Provider source identifiers, one per tier. */
export type ResolveSource =
  | 'canonical-term' // tier 0 (canonical term node — alias-first)
  | 'local-record' //   tier 1
  | 'oak' //            tier 2 (on-box local ontology service)
  | 'ols4' //           tier 3 (remote EBI OLS4)
  | 'vendor' //         tier 4
  | 'mint'; //          tier 5 (affordance, not a search hit)

/**
 * A raw hit from a single provider, before tier/score are attached.
 */
export interface ProviderHit {
  /** CURIE, e.g. "CHEBI:16236" or "local:MAT-…". Empty for the mint affordance. */
  curie: string;
  label: string;
  /** Namespace/prefix, e.g. "CHEBI", "local". Derived from the CURIE when omitted. */
  namespace?: string;
  /** Full IRI, when available. */
  uri?: string;
  /** Material layer, when the provider knows it (records do; ontologies = concept). */
  level?: MaterialLevel;
  /** Term definition / description text, when the provider has one. */
  definition?: string;
}

/**
 * A ranked, CURIE-typed resolution candidate returned by the spine.
 */
export interface RankedCandidate {
  curie: string;
  label: string;
  namespace: string;
  tier: ResolveTier;
  level: MaterialLevel;
  /** 0..~1.1; higher = better. Tier dominates, then match quality. */
  score: number;
  source: ResolveSource;
  uri?: string;
  /** Term definition / description text, when the source ontology or record has one. */
  definition?: string;
  /** Present only on the tier-5 affordance: the free text to mint locally. */
  mint?: { label: string; domain?: string };
}

/**
 * Per-call resolution options.
 */
export interface ResolveOptions {
  /** Active surface / grounding profile (biases level + ontology selection). */
  surface?: string;
  /** Restrict to candidate kinds (e.g. ['material','labware']). */
  kinds?: string[];
  /** Bias toward a material layer (concept/spec/instance/aliquot). */
  level?: MaterialLevel;
  /** Max candidates to return (default 20). */
  limit?: number;
  /**
   * Skip remote tiers (OLS4, vendor) — local records + OAK only. Used by the
   * compiler so resolution stays fast and offline-safe in the hot path.
   */
  localOnly?: boolean;
}

/**
 * A tier provider: given a term, return raw hits. Failures should be thrown;
 * the spine isolates them so one failing tier never discards the others.
 */
export type ResolveProvider = (
  term: string,
  limit: number,
  signal: AbortSignal,
) => Promise<ProviderHit[]>;

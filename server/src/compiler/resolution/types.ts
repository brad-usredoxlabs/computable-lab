/**
 * SPINE-3 resolution engine — types.
 *
 * One pass-internal resolution door for scientist-intent nouns. The engine
 * gathers typed candidates through ADAPTERS over the resolvers that already
 * exist and evaluates the SPINE-2 vocabulary's declared argument contracts and
 * policies. It performs NO store writes, NO minting, NO pipeline mutation
 * (mint stays behind MaterialGrounding/EnsureTerm; the spine's tier-5 mint
 * affordance is an AFFORDANCE the engine may OFFER, never a binding).
 *
 * Engine law (inherited from SPINE-2 vocabulary.ts): the engine never branches
 * on a verb, class, or domain NAME. Strategy selection/order/presence come
 * from `policies().strategyOrder`; argument specificity comes from
 * `argContracts(verb)`; the domain bridge is the ONTOLOGY_DOMAINS data.
 */
import type { MaterialLevel, RankedCandidate } from '../../resolve/types.js';
import type { TermLike } from '../../materials/termReconciliation.js';
import type { ScientistIntentArgContract } from '../scientistIntent/vocabulary.js';
import type { MaterialEligibilityPolicy } from './eligibility/policy.js';
import type {
  ScientistIntent,
  ScientistIntentActionLocation,
  ScientistIntentUnresolvedFact,
} from '../scientistIntent/types.js';

/** The request is contract + slot, never verb-name (§5.2). */
export interface ResolutionRequest {
  verb: string;
  argument: string;
  /** The biologist's words, preserved verbatim. */
  label: string;
  /** argContracts(verb)[argument] — the declared contract this request rides. */
  declared: ScientistIntentArgContract;
  actionIndex?: number;
  actionLocation?: ScientistIntentActionLocation;
  /** The doc's expected*Domain slot for this argument (when carried). */
  expectedDomain?: string;
  /** Layer the consuming context needs (SPINE-4 supplies via deps.levelFor). */
  wantLevel?: MaterialLevel;
  /** Hint evidence for this argument (provenance-carrying, never identity). */
  hints?: Array<{ label: string; reason: string }>;
  /** MATRES-ELIG (spec §7.2): vendor-scoped identifiers DECLARED in the
   *  utterance context (the review interaction supplies these; compilation
   *  supplies none — absence is a declared state, never an inference). The
   *  eligibility envelope carries them verbatim; a catalog-shaped token with
   *  no declared scope elicits scope (AC-3), never a fabricated identity. */
  scopedIdentifiers?: readonly string[];
}

/** Honest error bit: a failing tier is NOT an empty tier (§5.6). */
export interface TierOutcome {
  candidates: RankedCandidate[];
  failed: boolean;
  /** Adapter id that failed (when failed). */
  failedBy?: string;
  error?: string;
}

/** Generic adapter over an existing resolver entry point (§5.3). */
export interface CandidateAdapter {
  id: string;
  gather(label: string, req: ResolutionRequest): Promise<TierOutcome>;
}

/** A strategy implementation: gathers candidates for a contract, and (for the
 *  ambiguity arm) decides what an in-band multi-candidate set means. */
export interface ResolutionStrategy {
  id: string;
  /** Applicability is decided from the DECLARED contract data only. */
  applies(contract: ScientistIntentArgContract): boolean;
  gather(req: ResolutionRequest, ctx: StrategyContext): Promise<StrategyOutcome>;
  /** Ambiguity arm: 'clarify' | 'top' — chosen by DATA (ambiguity.strategyRef). */
  resolveAmbiguity(): 'clarify' | 'top';
}

export interface StrategyContext {
  adapters: Map<string, CandidateAdapter>;
  /** Adapter ids this strategy consumes (strategy internals; ids are data). */
  adapterIds: string[];
  /** The strategy id named by policies().hintAuthority.strategyRef gets hints. */
  hintStrategyId: string;
}

export interface StrategyOutcome {
  candidates: RankedCandidate[];
  failures: EngineFailure[];
  traces: string[];
}

export interface EngineFailure {
  kind: 'lookup_error';
  adapter: string;
  term: string;
  message: string;
}

/** A bound noun: identity is a CURIE/recordId from tier 0/1 (or an address
 *  expansion for `wells` contracts). Never a mint, never a bare hint. */
export interface BoundNoun {
  verb: string;
  argument: string;
  label: string;
  curie?: string;
  resolvedLabel?: string;
  tier?: number;
  level?: MaterialLevel;
  confidence: number;
  source?: string;
  addresses?: string[];
  actionIndex?: number;
}

/** Clarifications ARE SPINE-1's frozen ScientistIntentUnresolvedFact (§5.6).
 *  MATRES-ELIG (spec §7.4.4, D6): the candidate entry gains ADDITIVE optional
 *  disclosure members — `tier`, `referentLevel`, and the three eligibility
 *  verdict enums — emitted via CONDITIONAL SPREAD only (exactOptionalProperty-
 *  Types: absent-or-value, never :undefined). The frozen members (label/
 *  confidence/ref) are unchanged; readers that ignore the new keys are
 *  unaffected (OQ-4 ruling: additive spread, app option-bind goldens as the
 *  halt gate). The disclosure lives HERE (the engine's own fact shape), not in
 *  SPINE-1's frozen type. */
export interface EligibilityVerdictFact {
  display: 'pass' | 'fail' | 'incomplete';
  suppress: 'pass' | 'fail' | 'incomplete';
  bind: 'pass' | 'fail' | 'incomplete';
  /** The policy ids that decided each verdict (reason refs, §7.4.4). */
  policyIds: { display: string; suppress: string; bind: string };
  /** Role tag carried by the deciding bind policy (P4 identity role, bait §9). */
  bindRole?: string;
}

export interface ClarificationCandidateFact {
  label: string;
  confidence?: number;
  ref?: string;
  tier?: number;
  referentLevel?: string;
  eligibility?: EligibilityVerdictFact;
}

export type Clarification = Omit<ScientistIntentUnresolvedFact, 'candidates'> & {
  candidates?: ClarificationCandidateFact[];
};

export interface EngineOutcome {
  bindings: BoundNoun[];
  clarifications: Clarification[];
  failures: EngineFailure[];
  /** Deterministic audit lines (level-mismatch / domain-mismatch naming). */
  traces: string[];
}

export interface EngineDeps {
  adapters: CandidateAdapter[];
  /** Strategy registry keyed by the DATA ids in policies().strategyOrder. */
  strategies: Map<string, ResolutionStrategy>;
  /** Layer requirement per (verb, argument) — SPINE-4's profile-derived seam. */
  levelFor?: (verb: string, argument: string) => MaterialLevel | undefined;
  /** READ-ONLY term list for near-miss clarification evidence (§5.4). The
   *  engine never writes; suggestions are evidence, never applied. */
  termsForSuggestions?: () => Promise<readonly TermLike[]>;
  /** MATRES-ELIG (spec §7.4): the loaded material-eligibility POLICY document
   *  (schema/scientist-intent/material-eligibility/, loaded PER call — never
   *  process-cached). Absent = the engine runs its pre-ELIG behavior byte-
   *  identically (the eligibility arms are inert without the data). The engine
   *  holds NO policy branch: every tier/level/verdict value it consults is
   *  read from this document through the eligibility modules. */
  eligibility?: MaterialEligibilityPolicy;
}

export type { ScientistIntent };

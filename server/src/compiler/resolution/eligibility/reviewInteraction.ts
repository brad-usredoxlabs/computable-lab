/**
 * MATRES-ELIG review-interaction seam (spec §8.2, D2/D4).
 *
 * The enrichment leg runs in the REVIEW INTERACTION against the EXISTING
 * spine through the EXISTING options (localOnly) — no new endpoint, no new
 * engine, no new tier machinery, and NOTHING here reaches a compile. The
 * tier-legality data decides WHICH opts the caller passes (AC-2's request-
 * construction half: a demanded level whose legal query tiers are disjoint
 * from the data's remoteTiers gets the spine's existing localOnly clamp);
 * the eligibility verdicts (§7.1) are computed LOCALLY over the returned
 * candidates — only the candidate FETCH is networked, and it happens in the
 * interactive surface.
 *
 * D4 decision recorded: the ResolveSpine tier-list construction gains NO
 * domain branch (no `allowedTiers` hook was added — the generic data read
 * here filters at the caller instead, the spec's second acceptable option).
 */
import type { RankedCandidate, ResolveOptions } from '../../../resolve/types.js';
import type { ScientistIntentArgContract } from '../../scientistIntent/vocabulary.js';
import { buildEligibilityEnvelope, demandedReferentLevel } from './facts.js';
import { evaluateCandidateEligibility, type CandidateEligibility } from './evaluate.js';
import { reviewInteractionCallOptions, type MaterialEligibilityPolicy } from './policy.js';

/** Structural view of the existing spine (the same shape the resolve_nouns
 *  pass injects) — the review interaction calls the REAL spine. */
export interface ReviewInteractionSpine {
  resolve(term: string, opts?: ResolveOptions): Promise<RankedCandidate[]>;
}

export interface ReviewInteractionCandidate {
  candidate: RankedCandidate;
  eligibility: CandidateEligibility;
}

export interface ReviewInteractionOutcome {
  /** The spine call options the tier-legality DATA produced (AC-2). */
  callOptions: ResolveOptions;
  /** Demanded referent level the options were keyed on. */
  demandedLevel: string;
  candidates: ReviewInteractionCandidate[];
  /** True iff some returned candidate is sufficient-to-suppress PASS — a
   *  VERDICT, never a side effect of truncation or tier presence (M1). */
  suppressed: boolean;
  traces: string[];
}

export async function reviewInteractionCandidates(opts: {
  policy: MaterialEligibilityPolicy;
  spine: ReviewInteractionSpine;
  label: string;
  contract: ScientistIntentArgContract;
  campaignMode?: string;
  /** Vendor-scope identifiers DECLARED in the utterance context (never
   *  inferred from a token's shape). */
  scopedIdentifiers?: readonly string[];
  spineOptions?: ResolveOptions;
}): Promise<ReviewInteractionOutcome> {
  const demandedLevel = demandedReferentLevel(opts.policy, opts.contract);
  const legalityOptions = reviewInteractionCallOptions(
    opts.policy,
    demandedLevel,
    opts.campaignMode,
  );
  const callOptions: ResolveOptions = {
    ...(opts.spineOptions ?? {}),
    ...legalityOptions,
  };

  const candidates = await opts.spine.resolve(opts.label, callOptions);

  const traces: string[] = [
    `review-interaction: demanded level '${demandedLevel}' -> spine options ${JSON.stringify(legalityOptions)}`,
  ];
  const enriched: ReviewInteractionCandidate[] = candidates.map((candidate) => {
    const envelope = buildEligibilityEnvelope({
      policy: opts.policy,
      candidate,
      contract: opts.contract,
      ...(opts.campaignMode !== undefined ? { campaignMode: opts.campaignMode } : {}),
      ...(opts.scopedIdentifiers !== undefined ? { utteranceScopedIdentifiers: opts.scopedIdentifiers } : {}),
    });
    const eligibility = evaluateCandidateEligibility(opts.policy, envelope);
    for (const trace of eligibility.traces) {
      traces.push(`${candidate.curie || candidate.label}: ${trace}`);
    }
    return { candidate, eligibility };
  });

  const suppressed = enriched.some((entry) => entry.eligibility.suppress.state === 'pass');
  return { callOptions, demandedLevel, candidates: enriched, suppressed, traces };
}

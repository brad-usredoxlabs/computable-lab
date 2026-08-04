/**
 * MaterialResolution — the typed outcome of resolving a material mention.
 *
 * Models resolution as a discriminated union of distinct outcomes. Crucially,
 * a tier-5 "mint a new local term" affordance is NOT a weak ontology hit with a
 * low score — it is a first-class `new_local_proposed` outcome that downstream
 * assurance treats as a hard blocker. This avoids the trap of averaging a
 * questionable noun binding into a passing aggregate score.
 *
 * The union is the single source of truth consumed by the assurance module
 * (`server/src/ai/assurance.ts`). Nothing here represents the aggregate itself;
 * this is purely per-material resolution evidence.
 */

/** A plausible candidate for an ambiguous material reference. */
export interface MaterialCandidate {
  /** CURIE or local recordId, when known. */
  id: string;
  /** Display label. */
  label: string;
  /** Which resolution tier produced it (1=local record … 4=vendor). */
  tier?: 1 | 2 | 3 | 4;
  /** Resolve-spine score (tier base + match bonus). */
  score?: number;
  /** Material-hierarchy level, when the provider knows it. */
  level?: 'concept' | 'spec' | 'instance' | 'aliquot' | 'unknown';
}

export type MaterialResolution =
  | {
      /** Resolved to a concrete local identity the compiler can use. */
      status: 'resolved';
      /** The local recordId (e.g. `MAT-…` or `ALQ-…`). */
      localId: string;
      /** Resolution tier: 1=local record, 2=OAK, 3=OLS4, 4=vendor. */
      tier: 1 | 2 | 3 | 4;
      /** Resolve-spine score (tier base + match bonus), 0..~1.1. */
      score: number;
      /** Human label for display. */
      mention?: string;
    }
  | {
      /** Two or more plausible candidates with no clear winner. */
      status: 'ambiguous';
      candidates: MaterialCandidate[];
      /** The text the user supplied. */
      mention?: string;
    }
  | {
      /** Resolution could only be satisfied by minting a new local term. */
      status: 'new_local_proposed';
      /** The free-text term the lab would need to mint. */
      mention: string;
      /** Local proposal id, when one was generated. */
      proposalId?: string;
    }
  | {
      /** No candidate and no mint path — could not be grounded. */
      status: 'unresolved';
      mention: string;
    };

/**
 * A "clear winner" exists when the best candidate beats the runner-up by at
 * least this margin. Reuses the spine's tier-gap convention (0.2 tier gap,
 * 0.15 max match bonus) so an exact local hit clearly beats a remote exact hit.
 */
export const CLEAR_WINNER_MARGIN = 0.15;

/** True when a candidate set has a clear winner (as opposed to ambiguous). */
export function hasClearWinner(candidates: MaterialCandidate[]): boolean {
  if (candidates.length === 0) return false;
  const sorted = [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const winner = sorted[0]!;
  const runnerUpScore = sorted.length > 1 ? sorted[1]!.score ?? 0 : -Infinity;
  return (winner.score ?? 0) - runnerUpScore >= CLEAR_WINNER_MARGIN;
}

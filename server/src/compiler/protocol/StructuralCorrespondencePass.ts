/**
 * StructuralCorrespondencePass
 *
 * Checks that two sequences of step verbs correspond structurally.
 * The positional verb-equality check: upper and lower sequences must have
 * identical length and position-wise equal verb strings.
 *
 * This is a pure function module with no side effects.
 */

export interface StructuralMismatch {
  position: number;
  upperVerb: string | undefined;
  lowerVerb: string | undefined;
  reason: string;
}

export interface StructuralCorrespondenceResult {
  ok: boolean;
  mismatches: StructuralMismatch[];
}

/**
 * Input for four-layer structural correspondence check.
 * Each layer is optional; missing layers cause the corresponding pair to be skipped.
 */
export interface FourLayerInput {
  global?: readonly string[];
  local?: readonly string[];
  planned?: readonly string[];
  executed?: readonly string[];
}

/**
 * Result for a single pair comparison in the four-layer check.
 */
export interface PairResult {
  pair: 'global->local' | 'local->planned' | 'planned->executed';
  skipped?: true;
  reason?: string;
  ok?: boolean;
  mismatches?: StructuralMismatch[];
}

/**
 * Result of the four-layer structural correspondence check.
 */
export interface FourLayerResult {
  ok: boolean;                 // true iff all non-skipped pairs are ok
  pairs: PairResult[];         // always exactly 3 entries in fixed order
}

/**
 * Pure check: upper and lower sequences must have identical length and
 * position-wise equal verb strings.
 *
 * Returns ok: true iff both conditions hold.
 * Otherwise returns the list of mismatches. Report the FIRST length mismatch
 * as a single entry (the extra/missing tail), and verb mismatches at every
 * position where they occur.
 */
export function checkStructuralCorrespondence(
  upperSteps: readonly string[],
  lowerSteps: readonly string[],
): StructuralCorrespondenceResult {
  const mismatches: StructuralMismatch[] = [];

  const upperLen = upperSteps.length;
  const lowerLen = lowerSteps.length;
  const maxLen = Math.max(upperLen, lowerLen);
  const minLen = Math.min(upperLen, lowerLen);

  // Check for length mismatch first
  if (upperLen !== lowerLen) {
    // Report the first position where the shorter sequence ends
    mismatches.push({
      position: minLen,
      upperVerb: upperSteps[minLen],
      lowerVerb: lowerSteps[minLen],
      reason: `Length mismatch: upper has ${upperLen} step(s), lower has ${lowerLen} step(s). Extra/missing at position ${minLen}.`,
    });
    return { ok: false, mismatches };
  }

  // Check position-wise verb equality
  for (let i = 0; i < maxLen; i += 1) {
    const upperVerb = upperSteps[i];
    const lowerVerb = lowerSteps[i];

    if (upperVerb !== lowerVerb) {
      mismatches.push({
        position: i,
        upperVerb,
        lowerVerb,
        reason: `Verb mismatch at position ${i}: "${upperVerb}" vs "${lowerVerb}".`,
      });
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Check structural correspondence across four layers: global, local, planned, executed.
 * Evaluates three adjacent pairs: global->local, local->planned, planned->executed.
 * If either side of a pair is missing, that pair is marked as skipped with a reason.
 * Returns ok: true iff all non-skipped pairs are ok (vacuously true if all skipped).
 */
export function checkFourLayerCorrespondence(layers: FourLayerInput): FourLayerResult {
  const pairs: PairResult[] = [];

  // Pair 1: global -> local
  if (layers.global === undefined || layers.local === undefined) {
    const reason = layers.global === undefined
      ? 'global layer not provided'
      : 'local layer not provided';
    pairs.push({ pair: 'global->local', skipped: true, reason });
  } else {
    const result = checkStructuralCorrespondence(layers.global, layers.local);
    pairs.push({ pair: 'global->local', ok: result.ok, mismatches: result.mismatches });
  }

  // Pair 2: local -> planned
  if (layers.local === undefined || layers.planned === undefined) {
    const reason = layers.local === undefined
      ? 'local layer not provided'
      : 'planned layer not provided';
    pairs.push({ pair: 'local->planned', skipped: true, reason });
  } else {
    const result = checkStructuralCorrespondence(layers.local, layers.planned);
    pairs.push({ pair: 'local->planned', ok: result.ok, mismatches: result.mismatches });
  }

  // Pair 3: planned -> executed
  if (layers.planned === undefined || layers.executed === undefined) {
    const reason = layers.planned === undefined
      ? 'planned layer not provided'
      : 'executed layer not provided';
    pairs.push({ pair: 'planned->executed', skipped: true, reason });
  } else {
    const result = checkStructuralCorrespondence(layers.planned, layers.executed);
    pairs.push({ pair: 'planned->executed', ok: result.ok, mismatches: result.mismatches });
  }

  // ok is true iff all non-skipped pairs are ok
  const nonSkippedOk = pairs
    .filter(p => !p.skipped)
    .every(p => p.ok === true);

  return { ok: nonSkippedOk, pairs };
}

/**
 * assurance.ts — prompt-level resolution assurance.
 *
 * Implements the gate hierarchy. The aggregate score is NEVER the sole gate:
 * hard/semantic blockers and per-critical-slot confidence checks run first and
 * can force CONFIRM even when the aggregate is high. This prevents strong clause
 * coverage / clean validation from washing out a questionable noun binding.
 *
 *   decision =
 *     hardBlockers.length === 0 &&
 *     criticalBindings.every(b => b.confidence >= threshold) &&
 *     aggregateScore >= threshold
 *       ? 'RESOLVE'
 *       : 'CONFIRM'
 *
 * The score itself is heuristic and UNCALIBRATED — we call it "assurance", not
 * "probability". It exists to explain pauses, rank borderline prompts, and
 * calibrate signal mappings over time. Blockers/degraders are authoritative
 * for the decision.
 */

import type { MaterialResolution, MaterialCandidate } from './MaterialResolution.js';

export type FindingDisposition = 'BLOCK' | 'REDUCE_ASSURANCE' | 'INFORMATIONAL';

export type AssuranceFindingCode =
  | 'UNRESOLVED_REFERENCE'
  | 'LOW_BINDING_CONFIDENCE'
  | 'AMBIGUOUS_BINDING'
  | 'NEW_LOCAL_ENTITY'
  | 'MISSING_REQUIRED_QUANTITY'
  | 'VALIDATION_ERROR';

export interface AssuranceFinding {
  code: AssuranceFindingCode;
  disposition: FindingDisposition;
  /** Event / slot path, when known (e.g. 'events[0].details.material_ref'). */
  path?: string;
  /** The user-supplied term or mention that triggered the finding. */
  mention?: string;
  /** Confidence/score that failed a threshold, when applicable. */
  score?: number;
  /** Candidate ids for ambiguity findings. */
  candidateIds?: string[];
  message: string;
}

export interface AssuranceResult {
  /** 0..1 aggregate assurance (heuristic, uncalibrated — never the sole gate). */
  score: number;
  threshold: number;
  decision: 'RESOLVE' | 'CONFIRM';
  /** BLOCK findings — any present forces CONFIRM. */
  blockers: AssuranceFinding[];
  /** REDUCE_ASSURANCE / INFORMATIONAL findings — lower score, don't block alone. */
  degraders: AssuranceFinding[];
  /** Per-slot minimum for critical bindings (materials, cell lines, batches). */
  criticalSlotMinimum?: number;
}

export interface CriticalBinding {
  /** The user-supplied term. */
  mention: string;
  /** Resolution the compile reached for this binding. */
  resolution: MaterialResolution;
  /** Confidence estimate 0..1 for this specific binding. */
  confidence: number;
  /** Optional candidates when the resolution is ambiguous. */
  candidates?: MaterialCandidate[];
}

export interface AssuranceInput {
  /** Per-slot resolution outcomes for critical (identity) bindings. */
  criticalBindings: CriticalBinding[];
  /** All material resolutions (incl. non-critical) for scoring. */
  materialResolutions?: MaterialResolution[];
  /** 0..1 fraction of clauses resolved with no residual. */
  deterministicCompleteness: number;
  /** 0..1 fraction of required quantities/parameters present. */
  quantityCompleteness: number;
  /** Number of validation findings that are errors (each is a hard blocker). */
  validationErrorCount: number;
  /** 0..1 multiplier representing validation cleanliness (1 = no error). */
  validationQuality: number;
  /** Number of unresolved references surfaced by the compiler. */
  unresolvedRefCount: number;
  /** Whether any external CURIE is unverified (not in resolved context). */
  hasUnverifiedCurie?: boolean;
  /** Whether the event slot needs a physical batch/instance but got a definition. */
  hasTypeMismatch?: boolean;
  /** Threshold to resolve (default provided by caller; encoded in result). */
  threshold: number;
  /** Per-slot minimum for critical bindings (defaults to threshold). */
  criticalSlotMinimum?: number;
}

/** Score a single resolved material outcome (only status 'resolved' contributes). */
function resolvedScore(r: MaterialResolution): number | undefined {
  if (r.status !== 'resolved') return undefined;
  // tier 1 exact local ≈ 1.0 … tier 4 vendor ≈ 0.5.
  const tierFloor: Record<number, number> = { 1: 1.0, 2: 0.95, 3: 0.9, 4: 0.7 };
  return tierFloor[r.tier] ?? 0.7;
}

/** Confidence for a critical binding from its MaterialResolution. */
export function bindingConfidence(resolution: MaterialResolution): number {
  switch (resolution.status) {
    case 'resolved':
      return resolvedScore(resolution) ?? 0.7;
    case 'ambiguous':
      // Highest candidate is a ceiling; no clear winner → below threshold by design.
      return Math.max(...resolution.candidates.map((c) => c.score ?? 0), 0);
    case 'new_local_proposed':
      return 0;
    case 'unresolved':
      return 0;
  }
}

/**
 * Compute assurance. Pure, no IO.
 */
export function computeAssurance(input: AssuranceInput): AssuranceResult {
  const threshold = input.threshold;
  const criticalSlotMinimum = input.criticalSlotMinimum ?? threshold;
  const blockers: AssuranceFinding[] = [];
  const degraders: AssuranceFinding[] = [];

  // ---- 1. Hard / semantic gates (BLOCK) --------------------------------

  if (input.unresolvedRefCount > 0) {
    blockers.push({
      code: 'UNRESOLVED_REFERENCE',
      disposition: 'BLOCK',
      message: `${input.unresolvedRefCount} reference(s) could not be resolved.`,
    });
  }

  if (input.hasUnverifiedCurie) {
    blockers.push({
      code: 'UNRESOLVED_REFERENCE',
      disposition: 'BLOCK',
      message: 'A material/term was grounded from an unverified external CURIE.',
    });
  }

  for (const binding of input.criticalBindings) {
    const r = binding.resolution;
    if (r.status === 'unresolved') {
      blockers.push({
        code: 'UNRESOLVED_REFERENCE',
        disposition: 'BLOCK',
        mention: binding.mention ?? r.mention,
        message: `"${binding.mention ?? r.mention}" could not be resolved to any candidate.`,
      });
    } else if (r.status === 'new_local_proposed') {
      blockers.push({
        code: 'NEW_LOCAL_ENTITY',
        disposition: 'BLOCK',
        mention: r.mention,
        message: `"${r.mention}" would create a new local vocabulary term — requires confirmation.`,
      });
    } else if (r.status === 'ambiguous') {
      blockers.push({
        code: 'AMBIGUOUS_BINDING',
        disposition: 'BLOCK',
        mention: binding.mention,
        candidateIds: r.candidates.map((c) => c.id),
        message: `"${binding.mention}" has multiple plausible candidates with no clear winner.`,
      });
    }
  }

  // Quantity + type-mismatch + validation blockers.
  if (input.quantityCompleteness < 1) {
    blockers.push({
      code: 'MISSING_REQUIRED_QUANTITY',
      disposition: 'BLOCK',
      message: 'One or more required quantities/parameters are missing on an entity that needs them.',
    });
  }
  if (input.hasTypeMismatch) {
    blockers.push({
      code: 'VALIDATION_ERROR',
      disposition: 'BLOCK',
      message: 'A resolved entity type does not satisfy the event slot (e.g. definition where a physical batch is required).',
    });
  }
  if (input.validationErrorCount > 0) {
    blockers.push({
      code: 'VALIDATION_ERROR',
      disposition: 'BLOCK',
      message: `${input.validationErrorCount} validation error(s) present.`,
    });
  }

  // ---- 2. Per-critical-slot confidence check ---------------------------

  for (const binding of input.criticalBindings) {
    const r = binding.resolution;
    if (r.status !== 'resolved') continue; // non-resolved already blocked above
    const conf = bindingConfidence(r);
    if (conf < criticalSlotMinimum) {
      blockers.push({
        code: 'LOW_BINDING_CONFIDENCE',
        disposition: 'BLOCK',
        mention: r.mention ?? binding.mention,
        score: conf,
        ...(binding.mention ? { path: `critical-binding:${binding.mention}` } : {}),
        message: `Critical binding "${r.mention ?? binding.mention}" resolved at confidence ${conf.toFixed(2)} (below ${criticalSlotMinimum}).`,
      });
    }
  }

  // ---- 3. Aggregate score (explanation/ranking only, never the sole gate) --

  const resolutions = input.materialResolutions?.length
    ? input.materialResolutions
    : input.criticalBindings.map((b) => b.resolution);
  const resolvedOnly = resolutions.filter((r) => r.status === 'resolved');
  const grounded =
    resolvedOnly.length > 0
      ? resolvedOnly.reduce((acc, r) => acc + (resolvedScore(r) ?? 0), 0) / resolvedOnly.length
      : resolutions.length === 0
        ? 1
        : 0; // any mint/ambiguous/unresolved present but zero resolved → 0 grounded

  const score = Math.min(
    1,
    Math.max(
      0,
      0.25 * input.deterministicCompleteness
        + 0.35 * grounded
        + 0.15 * input.quantityCompleteness
        + 0.15 * input.validationQuality
        + 0.1 * (input.unresolvedRefCount === 0 ? 1 : 0)
        - 0.1 * input.validationErrorCount,
    ),
  );

  const decision =
    blockers.length === 0 &&
    input.criticalBindings.every((b) => bindingConfidence(b.resolution) >= criticalSlotMinimum) &&
    score >= threshold
      ? 'RESOLVE'
      : 'CONFIRM';

  return {
    score,
    threshold,
    decision,
    blockers,
    degraders,
    ...(criticalSlotMinimum !== threshold ? { criticalSlotMinimum } : {}),
  };
}

/**
 * MATRES-ELIG — the three-state eligibility evaluator (spec §7.1, D1).
 *
 * Three-state semantics WITHOUT an interpreter change: the shipped lint DSL
 * (evaluatePredicate, PredicateEvaluator.ts:894) stays byte-identical; this
 * module rides it and resolves the third state ONCE, generically, with zero
 * domain knowledge:
 *
 *   - a policy's `requires` (evidence-completeness guard) that does not PASS
 *     ⇒ verdict INCOMPLETE (missing evidence; the evaluator's reason rides).
 *   - `requires` PASS + a declared `custodyGuard` (P4 disjointness) that does
 *     not PASS ⇒ FAIL (overlap) or INCOMPLETE (guard evidence unresolved) —
 *     the guard is EVALUATED, never decorative (fix-run 1 D1).
 *   - `requires` PASS + guard PASS + `assert` FAIL ⇒ FAIL.
 *   - all arms PASS ⇒ PASS.
 *   - INCOMPLETE is ABSORBING under all/any/not: a leaf whose evidence path
 *     cannot resolve is INCOMPLETE (never a silent false, never a silent pass);
 *     all ⇒ FAIL if any FAIL, else INCOMPLETE if any INCOMPLETE, else PASS;
 *     any ⇒ PASS if any PASS (the PASS resolves the disjunction), else
 *     INCOMPLETE if any INCOMPLETE, else FAIL; not ⇒ INCOMPLETE propagates,
 *     otherwise the state inverts. (Bait §4: evaluating not(INCOMPLETE) as
 *     FAIL or PASS silently collapses the third state — this helper is the
 *     single resolution point, unit-tested including nested not(all(any(…))).)
 *
 * The allIn/noneIn VACUOUS-PASS law (lint-v1:243-244: an empty SELECTION
 * passes vacuously) is never leaned on for a missing-evidence case: every
 * assert that reads an evidence path is gated by a `requires` guard FIRST in
 * the policy data (§7.1), and a leaf whose operand path does not resolve is
 * INCOMPLETE here, not a vacuous pass. Membership asserts over SCALAR paths
 * (candidate.tier, candidate.referentLevel) always select exactly one value —
 * never vacuous.
 *
 * The confidence band is NOT a predicate input (§8): no score, no tier-order
 * arithmetic appears in this module.
 */
import { evaluatePredicate } from '../../../lint/PredicateEvaluator.js';
import { pathExists } from '../../../lint/PathResolver.js';
import type { EligibilityPolicy, MaterialEligibilityPolicy } from './policy.js';
import type { EligibilityEnvelope } from './facts.js';

export type EligibilityState = 'pass' | 'fail' | 'incomplete';

export interface TriState {
  state: EligibilityState;
  reason: string;
}

interface PredicateNode {
  op?: string;
  path?: string;
  collectionPath?: string;
  not?: unknown;
  predicates?: unknown[];
}

/**
 * Evaluate one DSL predicate tree in three states over `data`. Composite ops
 * recurse with the absorbing law; leaves delegate to the shipped evaluator and
 * classify a FALSE whose operand path could not resolve as INCOMPLETE (missing
 * evidence) rather than a mismatch.
 */
export function evaluateTriState(predicate: unknown, data: unknown): TriState {
  const pred = (predicate ?? {}) as PredicateNode;

  if (pred.op === 'all' && Array.isArray(pred.predicates)) {
    let sawIncomplete = false;
    const reasons: string[] = [];
    for (const sub of pred.predicates) {
      const r = evaluateTriState(sub, data);
      if (r.state === 'fail') return { state: 'fail', reason: `all: ${r.reason}` };
      if (r.state === 'incomplete') sawIncomplete = true;
      reasons.push(r.reason);
    }
    if (sawIncomplete) return { state: 'incomplete', reason: `all: unresolved evidence — ${reasons.join('; ')}` };
    return { state: 'pass', reason: `all: ${reasons.join('; ')}` };
  }

  if (pred.op === 'any' && Array.isArray(pred.predicates)) {
    let sawIncomplete = false;
    const reasons: string[] = [];
    for (const sub of pred.predicates) {
      const r = evaluateTriState(sub, data);
      // A PASS branch resolves the disjunction; an INCOMPLETE branch stays
      // unresolved only while no PASS has been found.
      if (r.state === 'pass') return { state: 'pass', reason: `any: ${r.reason}` };
      if (r.state === 'incomplete') sawIncomplete = true;
      reasons.push(r.reason);
    }
    if (sawIncomplete) return { state: 'incomplete', reason: `any: unresolved evidence — ${reasons.join('; ')}` };
    return { state: 'fail', reason: `any: ${reasons.join('; ')}` };
  }

  if (pred.op === 'not' && pred.not !== undefined) {
    const sub = evaluateTriState(pred.not, data);
    if (sub.state === 'incomplete') {
      return { state: 'incomplete', reason: `not: ${sub.reason}` };
    }
    return {
      state: sub.state === 'pass' ? 'fail' : 'pass',
      reason: `not (${sub.reason})`,
    };
  }

  // Leaf: the shipped evaluator is the boolean authority.
  const result = evaluatePredicate(predicate as Parameters<typeof evaluatePredicate>[0], data);
  if (result.result) {
    return { state: 'pass', reason: result.reason ?? 'holds' };
  }
  // FALSE — distinguish a declared mismatch from missing evidence: a leaf
  // whose operand path(s) do not resolve could not be evaluated at all.
  if (typeof pred.path === 'string' && !pathExists(data, pred.path)) {
    return {
      state: 'incomplete',
      reason: `missing evidence: path '${pred.path}' does not resolve (${result.reason ?? 'not found'})`,
    };
  }
  if (typeof pred.collectionPath === 'string' && !pathExists(data, pred.collectionPath)) {
    return {
      state: 'incomplete',
      reason: `missing evidence: collectionPath '${pred.collectionPath}' does not resolve (${result.reason ?? 'not found'})`,
    };
  }
  return { state: 'fail', reason: result.reason ?? 'fails' };
}

/** One policy's verdict for one envelope (null = the `when` guard made it
 *  not-applicable).
 *
 * FIX-RUN 1 D1 (adversarial review l2t2050, spec §7.3 P4): the declared
 * `custodyGuard` is EVALUATED, not decorative. Evaluation order: `when`
 * (applicability) -> `requires` (completeness) -> `custodyGuard` (the P4
 * disjointness gate) -> `assert` (business predicate). A guard that FAILs
 * makes the policy verdict FAIL even when the assert itself would PASS —
 * this is exactly the reviewer's mutated shape (an assert treating a
 * custody-never tier as positive evidence); the guard decides. A guard that
 * is INCOMPLETE (its evidence path does not resolve) propagates the third
 * state — never a silent pass. The three-state law applies to the guard
 * exactly as to the other arms. Completeness still gates FIRST: a candidate
 * with missing evidence is INCOMPLETE before the guard reads it (AC-2's
 * unknown-level remote hit stays an incomplete possibility). */
export function evaluateEligibilityPolicy(
  policy: EligibilityPolicy,
  envelope: EligibilityEnvelope,
): (TriState & { policyId: string; role?: string }) | null {
  if (policy.when !== undefined) {
    const guard = evaluatePredicate(policy.when as Parameters<typeof evaluatePredicate>[0], envelope);
    if (!guard.result) return null;
  }

  const requires = evaluateTriState(policy.requires, envelope);
  if (requires.state !== 'pass') {
    return {
      state: 'incomplete',
      reason: `requires unmet (${requires.reason})`,
      policyId: policy.id,
      ...(policy.role !== undefined ? { role: policy.role } : {}),
    };
  }

  if (policy.custodyGuard !== undefined) {
    const custody = evaluateTriState(policy.custodyGuard, envelope);
    if (custody.state === 'fail') {
      return {
        state: 'fail',
        reason: `custody guard unmet (${custody.reason})`,
        policyId: policy.id,
        ...(policy.role !== undefined ? { role: policy.role } : {}),
      };
    }
    if (custody.state === 'incomplete') {
      return {
        state: 'incomplete',
        reason: `custody guard unresolved (${custody.reason})`,
        policyId: policy.id,
        ...(policy.role !== undefined ? { role: policy.role } : {}),
      };
    }
  }

  const assertion = evaluateTriState(policy.assert, envelope);
  if (assertion.state === 'pass') {
    return {
      state: 'pass',
      reason: assertion.reason,
      policyId: policy.id,
      ...(policy.role !== undefined ? { role: policy.role } : {}),
    };
  }
  if (assertion.state === 'incomplete') {
    return {
      state: 'incomplete',
      reason: `assert unresolved (${assertion.reason})`,
      policyId: policy.id,
      ...(policy.role !== undefined ? { role: policy.role } : {}),
    };
  }
  return {
    state: 'fail',
    reason: assertion.reason,
    policyId: policy.id,
    ...(policy.role !== undefined ? { role: policy.role } : {}),
  };
}

/** One class verdict: FAIL if any applicable policy FAILs; else INCOMPLETE if
 *  any INCOMPLETEs; else PASS (the LAST applicable PASS decides, keeping the
 *  role tag of the most specific policy). NO applicable policy for a class ⇒
 *  INCOMPLETE (no declared basis — never a silent pass). The role tag of the
 *  deciding policy survives into the verdict (bait §9: the identity role rides
 *  from policy data into the payload). */
export interface ClassVerdict extends TriState {
  policyId: string;
  role?: string;
}

export interface CandidateEligibility {
  display: ClassVerdict;
  suppress: ClassVerdict;
  bind: ClassVerdict;
  /** Deterministic audit lines for the engine's existing traces channel. */
  traces: string[];
}

const NO_POLICY_REASON = 'no applicable eligibility policy declares this verdict';

export function evaluateCandidateEligibility(
  policy: MaterialEligibilityPolicy,
  envelope: EligibilityEnvelope,
): CandidateEligibility {
  const byClass = new Map<string, Array<TriState & { policyId: string; role?: string }>>();
  for (const cls of policy.verdictClasses()) byClass.set(cls, []);
  for (const p of policy.policies()) {
    const verdict = evaluateEligibilityPolicy(p, envelope);
    if (verdict === null) continue;
    byClass.get(p.verdict)?.push(verdict);
  }

  const traces: string[] = [];
  const resolveClass = (cls: string): ClassVerdict => {
    const verdicts = byClass.get(cls) ?? [];
    if (verdicts.length === 0) {
      return { state: 'incomplete', reason: NO_POLICY_REASON, policyId: 'none' };
    }
    const fail = verdicts.find((v) => v.state === 'fail');
    const incomplete = verdicts.find((v) => v.state === 'incomplete');
    const decided = fail ?? incomplete ?? verdicts[verdicts.length - 1]!;
    for (const v of verdicts) {
      traces.push(`eligibility: ${cls}=${v.state} via ${v.policyId}: ${v.reason}`);
    }
    return {
      state: decided.state,
      reason: decided.reason,
      policyId: decided.policyId,
      ...(decided.role !== undefined ? { role: decided.role } : {}),
    };
  };

  return {
    display: resolveClass('eligible-to-display'),
    suppress: resolveClass('sufficient-to-suppress'),
    bind: resolveClass('authorized-to-bind'),
    traces,
  };
}

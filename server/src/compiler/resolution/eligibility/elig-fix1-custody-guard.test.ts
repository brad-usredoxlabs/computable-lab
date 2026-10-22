/**
 * MATRES-ELIG FIX-RUN 1, D1 (adversarial review l2t2050) — the P4 custody
 * guardrail must be LIVE, not decorative.
 *
 * Defect: evaluateEligibilityPolicy evaluated only when/requires/assert and
 * NEVER read policy.custodyGuard (declared, schema-required, lint-required —
 * dead data). The reviewer PROVED a bind policy whose assert treats a
 * custody-NEVER tier as POSITIVE evidence (allIn candidate.tier
 * demanded.custodyNeverTiers) passed Ajv AND lint with zero violations.
 *
 * Fix contract this file pins (RED at HEAD a71c021c):
 *  1. evaluateEligibilityPolicy EVALUATES custodyGuard: a non-PASS guard
 *     (fail OR incomplete) makes the policy verdict non-PASS — even when the
 *     assert itself would PASS (the reviewer's mutated shape).
 *  2. The shipped data's bind policies keep passing their guards (no
 *     regression: a legitimate tier-1 accepted reference still binds).
 *  3. The tier-3/4 candidate's bind FAIL reason names the CUSTODY GUARD
 *     (the guard is what decided, not an incidental assert arm).
 *
 * The lint half of D1 (the shape-forbidding rule E8) is pinned in
 * src/schema/MaterialEligibilitySchemas.test.ts (the triplet contract home).
 */
import { describe, expect, it } from 'vitest';
import { evaluateEligibilityPolicy, evaluateCandidateEligibility } from './evaluate.js';
import { buildEligibilityEnvelope } from './facts.js';
import { loadMaterialEligibility } from './policy.js';
import type { EligibilityEnvelope } from './facts.js';
import type { ScientistIntentArgContract } from '../../scientistIntent/vocabulary.js';

const policy = () => loadMaterialEligibility();

const vendorProductContract: ScientistIntentArgContract = {
  name: 'material',
  kind: 'resolvable',
  required: false,
  domain: 'material',
  levels: ['vendor-product'],
};

describe('elig-fix1 D1 — custodyGuard is evaluated, not decorative', () => {
  it('reviewer mutation shape: a bind policy whose assert PASSES on a custody-never tier is FAIL because the custodyGuard decides (RED at HEAD: the guard was never read and the verdict was PASS)', () => {
    // The exact mutated shape the reviewer proved slipped through: the assert
    // treats tier 4 as positive evidence (equals / allIn-style membership),
    // while the declared custodyGuard disjointness says tier 4 is never
    // custody evidence. The guard must decide.
    const envelope = {
      demanded: { custodyNeverTiers: [3, 4] },
      candidate: { tier: 4, curie: 'vendor:CAT-99' },
    } as unknown as EligibilityEnvelope;
    const verdict = evaluateEligibilityPolicy(
      {
        id: 'unit-mutated-bind-shape',
        verdict: 'authorized-to-bind',
        custodyGuard: { op: 'noneIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' },
        requires: { op: 'exists', path: 'candidate.curie' },
        assert: { op: 'equals', path: 'candidate.tier', value: 4 }, // the assert WOULD pass
      },
      envelope,
    );
    expect(verdict).not.toBeNull();
    expect(verdict!.state).toBe('fail');
    expect(verdict!.reason).toContain('custody guard');
    expect(verdict!.policyId).toBe('unit-mutated-bind-shape');
  });

  it('custodyGuard INCOMPLETE propagates: a guard whose evidence path does not resolve is INCOMPLETE, never a silent pass (three-state law applies to the guard too)', () => {
    const envelope = {
      demanded: {}, // demanded.custodyNeverTiers ABSENT — the guard cannot resolve
      candidate: { tier: 1, curie: 'local:MAT-1' },
    } as unknown as EligibilityEnvelope;
    const verdict = evaluateEligibilityPolicy(
      {
        id: 'unit-guard-unresolved',
        verdict: 'authorized-to-bind',
        custodyGuard: { op: 'noneIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' },
        requires: { op: 'exists', path: 'candidate.curie' },
        assert: { op: 'exists', path: 'candidate.curie' },
      },
      envelope,
    );
    expect(verdict).not.toBeNull();
    expect(verdict!.state).toBe('incomplete');
    expect(verdict!.reason).toContain('custody guard');
  });

  it('shipped data, tier-3 vendor-product candidate: the bind FAIL reason names the CUSTODY GUARD (the guard is the deciding arm, not an incidental assert noneIn)', () => {
    const pol = policy();
    const envelope = buildEligibilityEnvelope({
      policy: pol,
      contract: vendorProductContract,
      candidate: {
        curie: 'vendor:CAT-77',
        label: 'Trypsin-EDTA 1x 500mL',
        namespace: 'vendor',
        tier: 3,
        level: 'vendor-product',
        score: 0.8,
        source: 'ols4',
      },
    });
    const eligibility = evaluateCandidateEligibility(pol, envelope);
    expect(eligibility.bind.state).toBe('fail');
    expect(eligibility.bind.reason).toContain('custody guard');
  });

  it('no regression: a legitimate tier-1 accepted reference still passes its custodyGuard and binds PASS', () => {
    const pol = policy();
    const envelope = buildEligibilityEnvelope({
      policy: pol,
      contract: vendorProductContract,
      candidate: {
        curie: 'local:MAT-accepted',
        label: 'Accepted Trypsin reference',
        namespace: 'local',
        tier: 1,
        level: 'unknown',
        termKind: 'vendor',
        score: 1.0,
        source: 'local-record',
      },
    });
    const eligibility = evaluateCandidateEligibility(pol, envelope);
    expect(eligibility.bind.state).toBe('pass');
  });
});

/**
 * MATRES-ELIG AC-4 (verified-by): a missing-evidence candidate evaluates
 * INCOMPLETE, not MATCH.
 *
 * Covers the spec's bait list directly (§11):
 *  - bait §3 vacuous allIn: an allIn whose collectionPath does not resolve is
 *    INCOMPLETE with a NAMED-PATH reason — never the empty-selection vacuous
 *    PASS (lint-v1:243-244) and never a silent mismatch.
 *  - bait §4 INCOMPLETE under not/all/any: the absorbing propagation rule,
 *    unit-tested directly including the nested not(all(any(…))) case.
 *  - bait §5 unknown level: a tier-0/tier-2 hit whose level is the undeclared
 *    spelling yields INCOMPLETE on the bind predicates — never PASS-by-default,
 *    never a crash.
 *  - requires-unmet ⇒ INCOMPLETE before any assert runs (the completeness
 *    guard law: every evidence path is gated BEFORE the business predicate).
 *  - no applicable policy for a class ⇒ INCOMPLETE (no declared basis — never
 *    a silent pass).
 */
import { describe, expect, it } from 'vitest';
import { evaluateTriState, evaluateEligibilityPolicy, evaluateCandidateEligibility } from './evaluate.js';
import { buildEligibilityEnvelope } from './facts.js';
import { loadMaterialEligibility } from './policy.js';
import type { EligibilityEnvelope } from './facts.js';
import type { ScientistIntentArgContract } from '../../scientistIntent/vocabulary.js';

const policy = () => loadMaterialEligibility();

const unconstrainedContract: ScientistIntentArgContract = {
  name: 'material',
  kind: 'resolvable',
  required: false,
  domain: 'material',
};

const instanceContract: ScientistIntentArgContract = {
  name: 'material',
  kind: 'resolvable',
  required: false,
  domain: 'material',
  levels: ['instance'],
};

describe('elig-ac4 incomplete (missing evidence => INCOMPLETE, never MATCH)', () => {
  it('bait 3 vacuous allIn: an unresolved collectionPath is INCOMPLETE with a named-path reason, never a vacuous pass', () => {
    const r = evaluateTriState(
      { op: 'allIn', path: 'candidate.referentLevel', collectionPath: 'demanded.allowedLevels' },
      { candidate: { referentLevel: 'instance' } }, // demanded.allowedLevels ABSENT
    );
    expect(r.state).toBe('incomplete');
    expect(r.reason).toContain("collectionPath 'demanded.allowedLevels' does not resolve");
  });

  it('bait 4 absorbing propagation: not(INCOMPLETE) is INCOMPLETE; all-with-any-INCOMPLETE is INCOMPLETE; any-with-a-PASS resolves to PASS', () => {
    const data = { a: { present: true } }; // 'b.missing' never resolves
    const notCase = evaluateTriState({ op: 'not', not: { op: 'exists', path: 'b.missing' } }, data);
    expect(notCase.state).toBe('incomplete');

    const allCase = evaluateTriState(
      { op: 'all', predicates: [{ op: 'exists', path: 'a.present' }, { op: 'exists', path: 'b.missing' }] },
      data,
    );
    expect(allCase.state).toBe('incomplete');

    const anyCase = evaluateTriState(
      { op: 'any', predicates: [{ op: 'exists', path: 'b.missing' }, { op: 'exists', path: 'a.present' }] },
      data,
    );
    expect(anyCase.state).toBe('pass');

    // The spec's named nested case: not(all(any(…))) — an INCOMPLETE leaf
    // survives all the way through three composite levels.
    const nested = evaluateTriState(
      { op: 'not', not: { op: 'all', predicates: [{ op: 'any', predicates: [{ op: 'exists', path: 'b.missing' }] }] } },
      data,
    );
    expect(nested.state).toBe('incomplete');
  });

  it('requires-unmet gates BEFORE the assert: an unmet completeness guard is INCOMPLETE even when the assert would pass', () => {
    const p = () => policy();
    const verdict = evaluateEligibilityPolicy(
      {
        id: 'unit-requires-gate',
        verdict: 'authorized-to-bind',
        requires: { op: 'exists', path: 'candidate.curie' },
        assert: { op: 'equals', path: 'candidate.tier', value: 1 },
      },
      { candidate: { tier: 1 } } as unknown as EligibilityEnvelope, // curie ABSENT
    );
    expect(verdict).not.toBeNull();
    expect(verdict!.state).toBe('incomplete');
    expect(verdict!.reason).toContain('requires unmet');
    expect(verdict!.policyId).toBe('unit-requires-gate');
    void p;
  });

  it('bait 5 unknown level: a tier-0 concept/unknown hit is INCOMPLETE on bind predicates for a demanded-level contract, never PASS-by-default', () => {
    const pol = policy();
    const envelope = buildEligibilityEnvelope({
      policy: pol,
      contract: instanceContract,
      candidate: {
        curie: 'CHEBI:12345',
        label: 'trypsin',
        namespace: 'CHEBI',
        tier: 0,
        level: 'unknown', // ProviderHit.level optional, records-only (resolve/types.ts:38)
        score: 0.9,
        source: 'canonical-term',
      },
    });
    const eligibility = evaluateCandidateEligibility(pol, envelope);
    expect(eligibility.bind.state).toBe('incomplete');
    expect(eligibility.suppress.state).toBe('incomplete');
    // The INCOMPLETE reason names the missing evidence, not a mismatch.
    expect(eligibility.bind.reason + eligibility.suppress.reason).toContain('candidate.levelDeclared');
  });

  it('an undeclared-level candidate under an UNCONSTRAINED demand still binds via the declared presence law (backwards-compatible)', () => {
    const pol = policy();
    const envelope = buildEligibilityEnvelope({
      policy: pol,
      contract: unconstrainedContract,
      candidate: {
        curie: 'local:MAT-1',
        label: 'Trypsin',
        namespace: 'local',
        tier: 1,
        level: 'unknown',
        score: 0.9,
        source: 'local-record',
      },
    });
    const eligibility = evaluateCandidateEligibility(pol, envelope);
    expect(eligibility.bind.state).toBe('pass');
    expect(eligibility.suppress.state).toBe('pass');
  });

  it('no applicable policy for a class => INCOMPLETE (never a silent pass)', () => {
    const pol = policy();
    // A candidate whose tier makes the identity-role policy inapplicable AND
    // whose demanded legality row is missing (unknown campaign mode) leaves
    // the display class decided only by the ordinary policy — instead, drive
    // the no-basis arm directly with a mutated policy instance: drop every
    // display policy from a fixture-loaded copy.
    const mutated = loadMaterialEligibility({
      path: 'src/compiler/resolution/eligibility/__fixtures__/material-eligibility-nodisplay.yaml',
    });
    const envelope = buildEligibilityEnvelope({
      policy: mutated,
      contract: unconstrainedContract,
      candidate: {
        curie: 'local:MAT-1',
        label: 'Trypsin',
        namespace: 'local',
        tier: 1,
        level: 'unknown',
        score: 0.9,
        source: 'local-record',
      },
    });
    const eligibility = evaluateCandidateEligibility(mutated, envelope);
    expect(eligibility.display.state).toBe('incomplete');
    expect(eligibility.display.reason).toContain('no applicable eligibility policy');
    // bind/suppress still decide from the shipped policies in the fixture.
    expect(eligibility.bind.state).toBe('pass');
  });
});

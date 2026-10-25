/**
 * MATRES-ELIG AC-1 (verified-by): an approximate-level local candidate does
 * NOT suppress an exact demanded-level remote candidate in the
 * review-interaction spine call.
 *
 * Mechanism (spec §12): a fake local provider yields a tier-1 CONCEPT-level
 * candidate; a fake remote (tier-3) provider yields the exact demanded-level
 * candidate. The vocabulary's DECLARED `levels: [instance]` slot makes the
 * demand exact. The policy verdicts: the concept candidate's
 * sufficient-to-suppress FAILS (its own referent level is not the demanded
 * level) ⇒ the engine's strategy loop CONTINUES (the pre-ELIG early-return on
 * `inBand >= 1` is replaced by the suppress VERDICT, §7.4.3) ⇒ the remote
 * candidate reaches the clarification payload, and the suppression verdict
 * trace is present. The raw remote hit is never bindable (P4: tier 3 is a
 * custody-never tier) — it lands as an incomplete possibility, never a bind.
 *
 * Zero policy literals in this test's engine deps: the tier/level/verdict
 * values the engine consults all ride the shipped eligibility DATA.
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../../scientistIntent/vocabulary.js';
import { createFailureTrackingProvider, createSpineAdapter } from '../adapters.js';
import { buildStrategyRegistry } from '../strategies.js';
import { resolveNoun } from '../resolutionEngine.js';
import type { EngineDeps, ResolutionRequest } from '../types.js';
import { loadMaterialEligibility } from './policy.js';
import type { RankedCandidate } from '../../../resolve/types.js';

const shippedVocab = () => loadScientistIntentVocabulary();

/** The demanded-level contract: the vocabulary's DECLARED single-member
 *  `levels` allowed-set IS the exact demand (memo Q1 binding rule). */
const exactInstanceContract: ResolutionRequest['declared'] = {
  name: 'material',
  kind: 'resolvable',
  required: false,
  domain: 'material',
  levels: ['instance'],
};

function request(over: Partial<ResolutionRequest> & { label: string }): ResolutionRequest {
  const base = {
    verb: 'add_material',
    argument: 'material',
    declared: exactInstanceContract,
    actionIndex: 0,
    ...over,
  };
  return {
    ...base,
    actionLocation: base.actionLocation ?? {
      actionIndex: base.actionIndex ?? 0,
      action: base.verb as never,
      argument: base.argument,
    },
  };
}

describe('elig-ac1 suppression', () => {
  it('elig-ac1: approximate-level local candidate does NOT suppress the exact demanded-level remote candidate', async () => {
    const vocab = shippedVocab();
    const tracker = { failed: false };
    // Local tier-1 candidate at the APPROXIMATE level (a concept record).
    const spine = {
      resolve: async () => [
        {
          curie: 'local:MAT-approx',
          label: 'Trypsin',
          namespace: 'local',
          tier: 1 as const,
          level: 'concept' as const,
          score: 1.02,
          source: 'local-record' as const,
        },
      ],
    };
    const strategies = buildStrategyRegistry();
    // The remote leg: a tier-3 exact demanded-level candidate (the shape a
    // review-interaction spine call returns at the demanded level).
    const remoteExact: RankedCandidate = {
      curie: 'CHEBI:1001',
      label: 'Trypsin-EDTA 1x solution',
      namespace: 'CHEBI',
      tier: 3,
      level: 'instance',
      score: 0.75,
      source: 'ols4',
    };
    strategies.set('ontology_resolution', {
      id: 'ontology_resolution',
      applies: (contract) => contract.kind === 'resolvable',
      gather: async () => ({ candidates: [remoteExact], failures: [], traces: [] }),
      resolveAmbiguity: () => 'clarify',
    });
    const deps: EngineDeps = {
      adapters: [createSpineAdapter(spine, tracker)],
      strategies,
      eligibility: loadMaterialEligibility(),
    };

    const outcome = await resolveNoun(request({ label: 'Trypsin' }), vocab, deps);

    // The loop CONTINUED: the remote candidate reached the outcome.
    expect(outcome.bindings).toEqual([]);
    expect(outcome.clarifications).toHaveLength(1);
    const clarification = outcome.clarifications[0]!;
    // The data-named incomplete-possibility reason (never a bind, never silent).
    expect(clarification.reason).toBe('eligibility-incomplete');
    const candidates = (clarification.candidates ?? []) as Array<Record<string, unknown>>;
    const remote = candidates.find((c) => c['label'] === 'Trypsin-EDTA 1x solution');
    expect(remote, 'exact demanded-level remote candidate must reach the payload').toBeDefined();
    // §7.4.4 disclosure: the candidate states its own facts.
    expect(remote!['tier']).toBe(3);
    expect(remote!['referentLevel']).toBe('instance');
    const eligibility = remote!['eligibility'] as Record<string, unknown>;
    expect(eligibility['suppress']).toBe('pass');
    expect(eligibility['bind']).toBe('fail');

    // The suppression verdict trace is present for BOTH candidates: the local
    // approximate candidate FAILED to suppress (the AC-1 root), the remote
    // exact candidate passed.
    const suppressFail = outcome.traces.find(
      (t) => t.includes('local:MAT-approx') && t.includes('sufficient-to-suppress=fail'),
    );
    expect(suppressFail, 'approximate candidate must carry a suppress FAIL verdict trace').toBeDefined();
    expect(suppressFail!).toContain('suppress-demanded-level-match');
    const suppressPass = outcome.traces.find(
      (t) => t.includes('CHEBI:1001') && t.includes('sufficient-to-suppress=pass'),
    );
    expect(suppressPass).toBeDefined();
  });

  it('elig-ac1 control: with NO eligibility data the engine keeps its pre-ELIG presence law byte-identically', async () => {
    const vocab = shippedVocab();
    const tracker = { failed: false };
    const spine = {
      resolve: async () => [
        {
          curie: 'local:MAT-approx',
          label: 'Trypsin',
          namespace: 'local',
          tier: 1 as const,
          level: 'concept' as const,
          score: 1.02,
          source: 'local-record' as const,
        },
      ],
    };
    const deps: EngineDeps = {
      adapters: [createSpineAdapter(spine, tracker)],
      strategies: buildStrategyRegistry(),
    };
    const outcome = await resolveNoun(request({ label: 'Trypsin' }), vocab, deps);
    // Pre-ELIG: the single in-band candidate binds (presence law), no
    // eligibility traces, no disclosure keys.
    expect(outcome.bindings).toHaveLength(1);
    expect(outcome.bindings[0]!.curie).toBe('local:MAT-approx');
    expect(outcome.traces.some((t) => t.includes('sufficient-to-suppress'))).toBe(false);
  });
});

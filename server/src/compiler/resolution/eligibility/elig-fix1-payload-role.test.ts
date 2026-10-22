/**
 * MATRES-ELIG FIX-RUN 1, D3 (adversarial review l2t2050) — the DISPLAY
 * identity role must reach the engine clarification payload.
 *
 * Defect: resolutionEngine.ts verdictFact() surfaced only bindRole;
 * EligibilityVerdictFact had no display-role member, so the
 * display-identity-only-role policy's role tag survived on the internal
 * CandidateEligibility (AC-2 asserted it there) but was DROPPED from the
 * PANEL-facing payload.
 *
 * Fix contract this file pins (RED at HEAD a71c021c): the role tag survives
 * from policy data into the payload for BOTH verdict classes —
 *  - an identity-only-tier candidate (tier 3, display PASS via
 *    display-identity-only-role) carries eligibility.displayRole
 *    'catalog-identity' in the clarification candidate entry;
 *  - an accepted tier-1 identity reference (bind PASS via
 *    bind-accepted-identity-reference) carries eligibility.bindRole
 *    'catalog-identity'.
 * exactOptionalPropertyTypes: the key is ABSENT or a value — asserted via
 * Object.keys, never toEqual-with-undefined.
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

const vendorProductContract: ResolutionRequest['declared'] = {
  name: 'material',
  kind: 'resolvable',
  required: false,
  domain: 'material',
  levels: ['vendor-product'],
};

function request(over: Partial<ResolutionRequest> & { label: string }): ResolutionRequest {
  const base = {
    verb: 'add_material',
    argument: 'material',
    declared: vendorProductContract,
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

/** Identity-only-tier remote hit: display PASSes via display-identity-only-role
 *  (tier 3 is in the vendor-product row's identityOnlyTiers); bind FAILs (P4). */
const remoteIdentity: RankedCandidate = {
  curie: 'vendor:CAT-1',
  label: 'Trypsin-EDTA 1x solution',
  namespace: 'vendor',
  tier: 3,
  level: 'vendor-product',
  score: 0.75,
  source: 'ols4',
};

/** Accepted identity reference (§8.3 shape): a local record whose OWN kind
 *  (termKind 'vendor') declares its vendor-product level; bind PASSes via
 *  bind-accepted-identity-reference with the identity role tag. */
const acceptedReference: RankedCandidate = {
  curie: 'local:MAT-accepted',
  label: 'Accepted Trypsin reference',
  namespace: 'local',
  tier: 1,
  level: 'unknown',
  termKind: 'vendor',
  score: 1.0,
  source: 'local-record',
};

describe('elig-fix1 D3 — the identity role tag survives policy -> payload for BOTH classes', () => {
  it('display role: an identity-only-tier candidate carries eligibility.displayRole in the clarification payload (RED at HEAD: verdictFact dropped it)', async () => {
    const tracker = { failed: false };
    const spine = { resolve: async () => [] as RankedCandidate[] };
    const strategies = buildStrategyRegistry();
    strategies.set('ontology_resolution', {
      id: 'ontology_resolution',
      applies: (contract) => contract.kind === 'resolvable',
      gather: async () => ({ candidates: [remoteIdentity, acceptedReference], failures: [], traces: [] }),
      resolveAmbiguity: () => 'clarify',
    });
    const deps: EngineDeps = {
      adapters: [createSpineAdapter(spine, tracker)],
      strategies,
      eligibility: loadMaterialEligibility(),
    };

    const outcome = await resolveNoun(request({ label: 'Trypsin-EDTA 1x solution' }), shippedVocab(), deps);

    expect(outcome.bindings).toEqual([]);
    expect(outcome.clarifications).toHaveLength(1);
    const candidates = (outcome.clarifications[0]!.candidates ?? []) as Array<Record<string, unknown>>;

    const remote = candidates.find((c) => c['label'] === 'Trypsin-EDTA 1x solution');
    expect(remote).toBeDefined();
    const remoteEligibility = remote!['eligibility'] as Record<string, unknown>;
    expect(remoteEligibility['display']).toBe('pass');
    expect(remoteEligibility['bind']).toBe('fail');
    // THE D3 PIN: the display role tag survives from the policy data into the
    // PANEL-facing payload.
    expect(remoteEligibility['displayRole']).toBe('catalog-identity');
    expect(remoteEligibility['policyIds']).toMatchObject({ display: 'display-identity-only-role' });

    const accepted = candidates.find((c) => c['label'] === 'Accepted Trypsin reference');
    expect(accepted).toBeDefined();
    const acceptedEligibility = accepted!['eligibility'] as Record<string, unknown>;
    expect(acceptedEligibility['bind']).toBe('pass');
    // The bind role survives (unchanged from the prior run — pinned here as
    // the BOTH-classes half of the fix).
    expect(acceptedEligibility['bindRole']).toBe('catalog-identity');
    expect(acceptedEligibility['policyIds']).toMatchObject({ bind: 'bind-accepted-identity-reference' });
    // exactOptionalPropertyTypes: a class whose deciding policy carries NO role
    // emits NO role key — absence asserted via Object.keys, never undefined.
    expect(Object.keys(acceptedEligibility)).not.toContain('displayRole');
    expect(Object.keys(remoteEligibility)).not.toContain('bindRole');
  });
});

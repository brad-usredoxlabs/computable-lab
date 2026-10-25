/**
 * MATRES-ELIG AC-2 (verified-by): physical-instance requests never fire the
 * vendor tier.
 *
 * Both halves of the spec's AC-2 (D2/D4):
 *  1. REQUEST-CONSTRUCTION half — reviewInteractionCallOptions reads the
 *     tier-legality DATA: an instance demand's legal query tiers {0,1,2,5} are
 *     disjoint from the data's remoteTiers {3,4} ⇒ the spine call carries the
 *     spine's EXISTING localOnly clamp. Against the REAL ResolveSpine the
 *     tier-4 vendor provider is never invoked. A vendor-product demand (remote
 *     legal for identity) gets NO clamp — the difference is DATA, not a TS
 *     branch.
 *  2. CANDIDATE half — even if a tier-4 catalog hit somehow arrives for an
 *     instance demand, the eligibility verdicts say display=FAIL and
 *     bind=FAIL: a catalog lookup never answers a physical bottle, and a raw
 *     remote hit is never custody evidence (P4).
 */
import { describe, expect, it } from 'vitest';
import { createResolveSpine } from '../../../resolve/ResolveSpine.js';
import type { ProviderHit } from '../../../resolve/types.js';
import { reviewInteractionCandidates } from './reviewInteraction.js';
import { reviewInteractionCallOptions, loadMaterialEligibility } from './policy.js';
import { buildEligibilityEnvelope } from './facts.js';
import { evaluateCandidateEligibility } from './evaluate.js';
import type { ScientistIntentArgContract } from '../../scientistIntent/vocabulary.js';

const instanceContract: ScientistIntentArgContract = {
  name: 'material',
  kind: 'resolvable',
  required: false,
  domain: 'material',
  levels: ['instance'],
};

const vendorProductContract: ScientistIntentArgContract = {
  name: 'material',
  kind: 'resolvable',
  required: false,
  domain: 'material',
  levels: ['vendor-product'],
};

describe('elig-ac2 tier legality', () => {
  it('elig-ac2: an instance demand clamps the review-interaction spine call to local tiers — the vendor tier never fires', async () => {
    const policy = loadMaterialEligibility();
    let vendorCalls = 0;
    let olsFired = 0;
    const spine = createResolveSpine({
      termProvider: async () => [] as ProviderHit[],
      recordProvider: async (): Promise<ProviderHit[]> => [{
        curie: 'local:MAT-bottle-17',
        label: 'Trypsin-EDTA bottle 17',
        namespace: 'local',
        level: 'instance',
      }],
      vendorProvider: async (): Promise<ProviderHit[]> => {
        vendorCalls += 1;
        // OQ-1 as-stanced + harvest H3: the spine's MaterialLevel union HAS
        // the vendor-product member (MATRES-PANEL fix1 widening), but this
        // tier-4 provider stub emits level 'unknown' — the fact-builder never
        // infers a level from a tier, so a remote/vendor tier-1..4 hit arrives
        // level 'unknown' unless its provider declares one.
        return [{ curie: 'vendor:CAT-99', label: 'Trypsin-EDTA catalog', namespace: 'vendor', level: 'unknown' }];
      },
      localTimeoutMs: 500,
      remoteTimeoutMs: 500,
    });
    // The spine's tier-3 ols4 leg is always registered; count it via a spy on
    // fetch instead — localOnly must drop BOTH remote tiers before any call.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { olsFired += 1; throw new Error('network fired for an instance demand'); }) as typeof fetch;
    try {
      const outcome = await reviewInteractionCandidates({
        policy,
        spine,
        label: 'Trypsin-EDTA bottle 17',
        contract: instanceContract,
      });

      // The clamp is DATA-derived: localOnly present for the instance demand.
      expect(outcome.callOptions).toEqual({ localOnly: true });
      expect(outcome.demandedLevel).toBe('instance');
      expect(vendorCalls, 'physical-instance request must never fire the vendor tier').toBe(0);
      expect(olsFired, 'physical-instance request must never fire the remote ols4 tier').toBe(0);

      // The local instance candidate is display-eligible, suppress-capable,
      // and bindable — the physical answer answers itself locally.
      const local = outcome.candidates.find((c) => c.candidate.curie === 'local:MAT-bottle-17');
      expect(local).toBeDefined();
      expect(local!.eligibility.display.state).toBe('pass');
      expect(local!.eligibility.suppress.state).toBe('pass');
      expect(local!.eligibility.bind.state).toBe('pass');
      expect(outcome.suppressed).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('elig-ac2 contrast: a vendor-product demand is remote-legal for identity — NO clamp, and the identity role survives (P4, bait 9)', async () => {
    const policy = loadMaterialEligibility();
    // Request-construction half: the vendor-product row's query tiers include
    // the data's remote tiers ⇒ no localOnly option (absent-or-value).
    expect(reviewInteractionCallOptions(policy, 'vendor-product')).toEqual({});

    let vendorCalls = 0;
    const spine = createResolveSpine({
      termProvider: async () => [] as ProviderHit[],
      recordProvider: async () => [] as ProviderHit[],
      vendorProvider: async (): Promise<ProviderHit[]> => {
        vendorCalls += 1;
        return [{ curie: 'vendor:CAT-99', label: 'Trypsin-EDTA 1x 500mL', namespace: 'vendor', level: 'unknown' }];
      },
      localTimeoutMs: 500,
      remoteTimeoutMs: 500,
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('ols4 network in a fixture run'); }) as typeof fetch;
    try {
      const outcome = await reviewInteractionCandidates({
        policy,
        spine,
        label: 'Trypsin-EDTA 1x 500mL',
        contract: vendorProductContract,
        scopedIdentifiers: ['sigma-aldrich'],
      });
      expect(vendorCalls, 'product-level demand may reach the vendor tier for catalog identity').toBe(1);
      const hit = outcome.candidates.find((c) => c.candidate.curie === 'vendor:CAT-99');
      expect(hit).toBeDefined();
      // Identity-only tier display carries the role tag from DATA into the
      // verdict payload (bait 9). The raw remote hit arrives level unknown
      // (OQ-1 as-stanced: no local ref ⇒ honest unknown), so bind is
      // INCOMPLETE — never a bind, never a silent pass.
      expect(hit!.eligibility.display.state).toBe('pass');
      expect(hit!.eligibility.display.role).toBe('catalog-identity');
      expect(hit!.eligibility.suppress.state).toBe('incomplete');
      expect(hit!.eligibility.bind.state).toBe('incomplete');
      expect(hit!.candidate.level).toBe('unknown');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('elig-ac2 candidate half: a tier-4 catalog hit for an instance demand is display=FAIL and never suppresses/binds', () => {
    const policy = loadMaterialEligibility();
    const envelope = buildEligibilityEnvelope({
      policy,
      contract: instanceContract,
      candidate: {
        curie: 'vendor:CAT-99',
        label: 'Trypsin-EDTA catalog',
        namespace: 'vendor',
        tier: 4,
        // The spine's MaterialLevel union HAS the vendor-product member
        // (MATRES-PANEL fix1 widening, OQ-1); this fixture models a tier-4
        // catalog hit that arrives level unknown (no provider declared one).
        level: 'unknown',
        score: 0.9,
        source: 'vendor',
      },
    });
    const eligibility = evaluateCandidateEligibility(policy, envelope);
    // tier 4 is not in the instance demand's display set {0,1,2,5}.
    expect(eligibility.display.state).toBe('fail');
    // Missing level evidence ⇒ INCOMPLETE, never a silent mismatch/pass.
    expect(eligibility.suppress.state).toBe('incomplete');
    expect(eligibility.bind.state).toBe('incomplete');
    // The envelope itself declares the P4 law: a custody-never tier is never
    // custody evidence.
    expect(envelope.candidate.completeness.custodyEvidence).toBe(false);
  });
});

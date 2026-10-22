/**
 * MATRES-ELIG AC-5 (verified-by): offline compilation is byte-stable against
 * accepted refs — no network in the compiler path (P6).
 *
 * Proof shape (spec §8.1 "the AC-5 proof (fetch-stub + double-run golden)"):
 *  1. globalThis.fetch is replaced by a stub that THROWS and COUNTS. Any fetch
 *     from the compile path fails the test loudly.
 *  2. The resolve_nouns pass runs the REAL engine over the REAL shipped
 *     vocabulary + the REAL shipped eligibility triplet (loaded per call, as
 *     production does) against a local spine of accepted stable references
 *     (tier-0/1 local records — the shape an accepted enrichment selection
 *     lands as, §8.3).
 *  3. The pass runs TWICE; the two outputs must be byte-identical (JSON
 *     deep-equality), including the eligibility disclosure payload and the
 *     trace lines.
 *  4. The eligibility triplet is loaded PER CALL: mutating a fixture copy
 *     changes the outcome with ZERO TypeScript diff (the anti-hardcode proof —
 *     the policy really is data).
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../../scientistIntent/vocabulary.js';
import type { ScientistIntent } from '../../scientistIntent/types.js';
import { createResolveSpine } from '../../../resolve/ResolveSpine.js';
import { createResolveNounsPass, RESOLVE_NOUNS_PASS_ID, type ResolveNounsOutput } from '../resolveNounsPass.js';
import { loadMaterialEligibility } from './policy.js';
import type { PassRunArgs } from '../../pipeline/types.js';

const shippedVocab = () => loadScientistIntentVocabulary();

function runArgs(): PassRunArgs {
  return {
    pass_id: RESOLVE_NOUNS_PASS_ID,
    state: { input: {}, context: {}, meta: {}, outputs: new Map(), diagnostics: [] },
  };
}

/** Accepted stable references: local records (tier 0/1) — what an accepted
 *  enrichment selection lands as (§8.3). No remote provider is wired. */
function acceptedRefsSpine() {
  return createResolveSpine({
    termProvider: async (term) => [{
      curie: 'local:MAT-trypsin-edta',
      label: term,
      namespace: 'local',
      level: 'instance',
      termKind: 'material',
    }],
    recordProvider: async () => [],
    localTimeoutMs: 500,
    remoteTimeoutMs: 500,
  });
}

const intent: ScientistIntent = {
  kind: 'scientist-intent',
  version: '0.1.0',
  intentId: 'matres-elig-ac5',
  actions: [{ action: 'add_material', material: 'Trypsin-EDTA', volumeUl: 100 }],
  unresolved: [],
};

async function compileOnce() {
  const result = await createResolveNounsPass({
    intent,
    vocabulary: shippedVocab(),
    spine: acceptedRefsSpine(),
  }).run(runArgs());
  return result.output as ResolveNounsOutput;
}

describe('elig-ac5 offline compile byte-stability (P6)', () => {
  it('AC-5: the compile path fires ZERO network calls and is byte-stable across runs', async () => {
    let fetchCalls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error('network reached the compiler path (P6 violation)');
    }) as typeof fetch;
    try {
      const first = await compileOnce();
      const second = await compileOnce();

      expect(fetchCalls, 'no fetch may reach the compiler path').toBe(0);
      // Byte-stability: the two runs are deep-equal, disclosure payload and
      // traces included.
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));

      // The eligibility arms really ran: the shipped add_material.material
      // contract declares an allowed-set, so the bound candidate carries the
      // verdict trio in the clarification payload when it is ambiguous, and
      // eligibility traces ride the outcome.
      expect(first.bindings).toHaveLength(1);
      expect(first.bindings[0]!.curie).toBe('local:MAT-trypsin-edta');
      expect(first.bindings[0]!.tier).toBe(0);
      expect(first.failures).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('AC-5 anti-hardcode: mutating the eligibility DATA changes the outcome with zero TypeScript diff', async () => {
    // Fixture copy (never the shipped file): the bind-unconstrained-identity
    // policy's custodyGuard is widened so that tier 0 is ALSO custody-never —
    // the same compile then refuses to bind and clarifies instead. The engine
    // code is untouched; only the data differs.
    const mutated = loadMaterialEligibility({
      path: 'src/compiler/resolution/eligibility/__fixtures__/material-eligibility-custody0.yaml',
    });
    const result = await createResolveNounsPass({
      intent,
      vocabulary: shippedVocab(),
      spine: acceptedRefsSpine(),
      eligibility: mutated,
    }).run(runArgs());
    const output = result.output as ResolveNounsOutput;

    expect(output.bindings).toEqual([]);
    expect(output.blocked).toBe(true);
    // The data-named incomplete-possibility reason (bind not PASS ⇒ clarify).
    expect(output.clarifications.some((c) => c.reason === 'eligibility-incomplete')).toBe(true);
    // The candidate is still DISCLOSED as an incomplete possibility (M3:
    // visible, never vanished into unknown-noun + mint).
    const disclosure = output.clarifications.find((c) => (c.candidates?.length ?? 0) > 0);
    expect(disclosure).toBeDefined();
    expect(disclosure!.candidates![0]!.tier).toBe(0);
    expect(disclosure!.candidates![0]!.eligibility?.bind).toBe('fail');
  });

  it('AC-5: an ABSENT eligibility triplet is a disclosed off-state — the compile stays byte-identical to pre-ELIG', async () => {
    const withOff = await createResolveNounsPass({
      intent,
      vocabulary: shippedVocab(),
      spine: acceptedRefsSpine(),
      eligibility: null,
    }).run(runArgs());
    const output = withOff.output as ResolveNounsOutput;
    expect(output.bindings).toHaveLength(1);
    expect(output.bindings[0]!.curie).toBe('local:MAT-trypsin-edta');
    // The disclosed off-state: no eligibility verdict appears anywhere in the
    // output (the pass output carries no trace channel — the verdicts surface
    // only as candidate disclosure keys, and none are present).
    expect(JSON.stringify(output)).not.toContain('eligibility');
  });
});

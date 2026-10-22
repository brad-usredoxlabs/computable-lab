/**
 * MATRES-ELIG AC-3 (verified-by): a catalog-shaped token elicits vendor scope
 * rather than fabricating product identity.
 *
 * The gate is DATA-driven (spec §7.3, third-party §4): the policy's
 * `catalogShape` patterns decide shape; vendor scope is DECLARED identifiers
 * only — never inferred from a token's shape. A shaped token with no declared
 * scope produces the data-named `catalogScopeReason` clarification carrying NO
 * candidates (nothing is minted, nothing is labelled with an invented vendor).
 * A shaped token WITH a declared scope proceeds to ordinary gathering.
 * A non-shaped token is untouched by the gate.
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../../scientistIntent/vocabulary.js';
import { createSpineAdapter } from '../adapters.js';
import { buildStrategyRegistry } from '../strategies.js';
import { resolveNoun } from '../resolutionEngine.js';
import type { EngineDeps, ResolutionRequest } from '../types.js';
import { loadMaterialEligibility } from './policy.js';
import type { RankedCandidate } from '../../../resolve/types.js';

const shippedVocab = () => loadScientistIntentVocabulary();

const contract: ResolutionRequest['declared'] = {
  name: 'material',
  kind: 'resolvable',
  required: false,
  domain: 'material',
  levels: ['concept', 'formulation', 'vendor-product', 'instance'],
};

function request(over: Partial<ResolutionRequest> & { label: string }): ResolutionRequest {
  const base = { verb: 'add_material', argument: 'material', declared: contract, actionIndex: 0, ...over };
  return {
    ...base,
    actionLocation: base.actionLocation ?? {
      actionIndex: base.actionIndex ?? 0,
      action: base.verb as never,
      argument: base.argument,
    },
  };
}

function depsWithLocal(local: RankedCandidate[]): EngineDeps {
  const tracker = { failed: false };
  const spine = { resolve: async () => local as readonly RankedCandidate[] };
  return {
    adapters: [createSpineAdapter(spine, tracker)],
    strategies: buildStrategyRegistry(),
    eligibility: loadMaterialEligibility(),
  };
}

/** A complete RankedCandidate (tier/score/source ride the fixture). */
function localCandidate(curie: string, label: string): RankedCandidate {
  return { curie, label, namespace: 'local', tier: 1, level: 'instance', score: 0.9, source: 'local-record' };
}

describe('elig-ac3 catalog-shaped token', () => {
  it('elig-ac3: a catalog-shaped token with no declared vendor scope elicits scope and fabricates no identity', async () => {
    const vocab = shippedVocab();
    // A catalog number shape (data pattern ^[0-9]{6,10}$) with NO vendor named
    // anywhere. The local store has a same-numbered record; the gate must NOT
    // answer with it, and must NOT mint or label an invented vendor.
    const deps = depsWithLocal([localCandidate('local:MAT-1234567', '1234567')]);
    const outcome = await resolveNoun(request({ label: '1234567' }), vocab, deps);

    expect(outcome.bindings).toEqual([]);
    expect(outcome.clarifications).toHaveLength(1);
    const clarification = outcome.clarifications[0]!;
    // The reason code is the DATA's catalogScopeReason, not a TS literal.
    expect(clarification.reason).toBe('vendor-scope-unknown');
    // NO candidates: shape alone never becomes a candidate identity.
    expect(clarification.candidates).toBeUndefined();
    expect(outcome.traces.some((t) => t.includes('catalog-scope-gate'))).toBe(true);
    // No mint affordance was offered for the shaped token either.
    expect(outcome.traces.some((t) => t.includes('mint'))).toBe(false);
  });

  it('elig-ac3 contrast: the same shaped token WITH a declared vendor scope proceeds to ordinary gathering', async () => {
    const vocab = shippedVocab();
    const deps = depsWithLocal([localCandidate('local:MAT-1234567', '1234567')]);
    const outcome = await resolveNoun(
      request({ label: '1234567', scopedIdentifiers: ['sigma-aldrich'] }),
      vocab,
      deps,
    );
    // Scope declared ⇒ the gate is inert; the ordinary gather + verdicts decide.
    expect(outcome.clarifications.some((c) => c.reason === 'vendor-scope-unknown')).toBe(false);
    expect(outcome.bindings).toHaveLength(1);
    expect(outcome.bindings[0]!.curie).toBe('local:MAT-1234567');
  });

  it('elig-ac3: a non-shaped token is untouched by the gate', async () => {
    const vocab = shippedVocab();
    const deps = depsWithLocal([localCandidate('local:MAT-trypsin', 'Trypsin-EDTA')]);
    const outcome = await resolveNoun(request({ label: 'Trypsin-EDTA' }), vocab, deps);
    expect(outcome.traces.some((t) => t.includes('catalog-scope-gate'))).toBe(false);
    expect(outcome.bindings).toHaveLength(1);
  });

  it('elig-ac3: the gate is DATA — mutating the fixture catalogShape changes which tokens are shaped', async () => {
    const vocab = shippedVocab();
    // Fixture copy (never the shipped file): a shape list that does NOT match
    // a bare 7-digit number. The same token now proceeds normally.
    const fixtureDir = 'src/compiler/resolution/eligibility/__fixtures__';
    const deps = depsWithLocal([localCandidate('local:MAT-1234567', '1234567')]);
    const policy = loadMaterialEligibility({ path: `${fixtureDir}/material-eligibility-noshape.yaml` });
    const outcome = await resolveNoun(request({ label: '1234567' }), vocab, { ...deps, eligibility: policy });
    expect(outcome.clarifications.some((c) => c.reason === 'vendor-scope-unknown')).toBe(false);
    expect(outcome.bindings).toHaveLength(1);
  });
});

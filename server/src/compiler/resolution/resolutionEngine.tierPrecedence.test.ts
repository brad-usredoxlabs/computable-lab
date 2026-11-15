/**
 * L2-P1-AMBIGUITY-TIER-RULE-1 (unit 1) — declared candidate-tier precedence.
 *
 * Ruling DEFINITION-IDENTITY-UNIQUENESS (amended option (a)): a
 * labware-DEFINITION candidate outranks a legacy labware SEED. The rule is
 * DECLARED IN DATA (policies.ambiguity.candidatePrecedence) — the
 * declaration_precedence strategy APPLIES it; the TS carries no kind/name
 * literal. A genuine same-kind tie still clarifies (never arbitrary winner).
 *
 * (a) labware + labware-definition, same normalized label -> bind the
 *     definition, the seed NEVER offered (no clarification).
 * (b) two same-kind (labware) candidates, same label -> still clarifies.
 * (c) material + labware (kinds absent from the rule's whenKinds) -> untouched.
 * (d) removing the candidatePrecedence block restores clarification (data).
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import type { ProviderHit, ResolveProvider } from '../../resolve/types.js';
import {
  createFailureTrackingProvider,
  createSpineAdapter,
  createLabwareHintAdapter,
  createRegistryAdapter,
  createRoleAddressAdapter,
} from './adapters.js';
import { buildStrategyRegistry } from './strategies.js';
import { resolveNoun, type EngineDeps, type ResolutionRequest } from './resolutionEngine.js';

const LABW = { name: 'labware', kind: 'labware', required: false, domain: 'labware' } as ResolutionRequest['declared'];

function hits(...hs: ProviderHit[]): ResolveProvider { return async () => hs; }

function depsFor(spine: ReturnType<typeof createResolveSpine>, tracker: { failed: boolean }, strategies: Parameters<typeof resolveNoun>[2]['strategies']): EngineDeps {
  const adapters = [
    createSpineAdapter(spine, tracker),
    createLabwareHintAdapter(async () => []),
    createRegistryAdapter({ labwareDefinitionRegistry: { findByName: () => undefined }, compoundClassRegistry: { findByName: () => undefined } }),
    createRoleAddressAdapter(),
  ];
  return { adapters, strategies };
}

function run(verb: string, argument: string, label: string, hitsFn: ResolveProvider, strategies: Map<string, unknown>): Promise<Awaited<ReturnType<typeof resolveNoun>>> {
  const tracker = { failed: false };
  const spine = createResolveSpine({ termProvider: createFailureTrackingProvider(hits(), tracker), recordProvider: createFailureTrackingProvider(hitsFn, tracker), localTimeoutMs: 500, remoteTimeoutMs: 500 });
  const req = { verb, argument, label, declared: LABW, actionIndex: 0, actionLocation: { actionIndex: 0, action: verb as never, argument } } as ResolutionRequest;
  return resolveNoun(req, vocab(), depsFor(spine, tracker, strategies));
}

const RULE: readonly { whenKinds: readonly string[]; supersededByKind: string }[] = [
  { whenKinds: ['labware', 'labware-definition'], supersededByKind: 'labware-definition' },
];

function vocab(): ReturnType<typeof loadScientistIntentVocabulary> {
  const base = loadScientistIntentVocabulary();
  const p = base.policies();
  return { ...base, policies: () => ({ ...p, strategyOrder: ['declaration_precedence', ...p.strategyOrder], ambiguity: { ...p.ambiguity, strategyRef: 'declaration_precedence', candidatePrecedence: RULE } }) };
}
function vocabOff(): ReturnType<typeof loadScientistIntentVocabulary> {
  const base = loadScientistIntentVocabulary();
  const p = base.policies();
  const amb = { ...p.ambiguity, strategyRef: 'declaration_precedence' } as typeof p.ambiguity;
  delete (amb as Record<string, unknown>).candidatePrecedence;
  return { ...base, policies: () => ({ ...p, strategyOrder: ['declaration_precedence', ...p.strategyOrder], ambiguity: amb }) };
}

describe('resolutionEngine.tierPrecedence (L2-P1-AMBIGUITY-TIER-RULE-1 u1)', () => {
  it('(a) labware + labware-definition, same label -> binds the definition, the seed is never offered', async () => {
    const seed: ProviderHit = { curie: 'local:seed-96', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const definition: ProviderHit = { curie: 'local:def-96', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware-definition' };
    const out = await run('create_container', 'labware', 'Well Plate A', hits(seed, definition), buildStrategyRegistry(vocab()));
    expect(out.clarifications).toEqual([]);
    expect(out.bindings).toHaveLength(1);
    expect(out.bindings[0]!.curie).toBe('local:def-96');
  });

  it('(b) two same-kind (labware) candidates, same label -> still clarifies (no arbitrary winner)', async () => {
    const a: ProviderHit = { curie: 'local:lwa', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const b: ProviderHit = { curie: 'local:lwb', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const out = await run('create_container', 'labware', 'Well Plate A', hits(a, b), buildStrategyRegistry(vocab()));
    expect(out.bindings).toEqual([]);
    expect(out.clarifications).toHaveLength(1);
    expect(out.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  it('(c) material + labware (kinds absent from whenKinds) -> behavior untouched', async () => {
    const mat: ProviderHit = { curie: 'local:matx', label: 'Well Plate A', namespace: 'local', level: 'concept', termKind: 'material' };
    const lab: ProviderHit = { curie: 'local:lwb', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const out = await run('create_container', 'labware', 'Well Plate A', hits(mat, lab), buildStrategyRegistry(vocab()));
    expect(out.bindings).toEqual([]);
    expect(out.clarifications).toHaveLength(1);
    expect(out.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  it('(d) with the candidatePrecedence block ABSENT the pair clarifies again (the rule is data, not code)', async () => {
    const seed: ProviderHit = { curie: 'local:seed-96', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const definition: ProviderHit = { curie: 'local:def-96', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware-definition' };
    const out = await run('create_container', 'labware', 'Well Plate A', hits(seed, definition), buildStrategyRegistry(vocabOff()));
    expect(out.bindings).toEqual([]);
    expect(out.clarifications).toHaveLength(1);
    expect(out.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  it('real-record labels (legA2 pair): the seed name does not normalize-equal the definition display_name, so the rule leaves the tie to clarify', async () => {
    const definition: ProviderHit = { curie: 'local:lbw-def-96', label: 'Generic 96-Well Plate', namespace: 'local', level: 'unknown', termKind: 'labware-definition' };
    const seed: ProviderHit = { curie: 'local:lbw-seed-96', label: 'Generic 96 Well Plate, Flat Bottom (seed)', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const out = await run('create_container', 'labware', '96-well plate', hits(definition, seed), buildStrategyRegistry(vocab()));
    expect(out.bindings).toEqual([]);
    expect(out.clarifications).toHaveLength(1);
    expect(out.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  it('shipped vocabulary declares the candidatePrecedence rule (data, not code)', () => {
    const block = loadScientistIntentVocabulary().policies().ambiguity.candidatePrecedence;
    expect(block, 'shipped vocabulary must declare candidatePrecedence').toBeDefined();
    expect(block![0]!.supersededByKind).toBe('labware-definition');
    expect([...block![0]!.whenKinds].sort()).toEqual(['labware', 'labware-definition']);
  });
});

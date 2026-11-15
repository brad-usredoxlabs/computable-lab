/**
 * L2-P1-AMBIGUITY-TIER-RULE-1 u1 — declared candidate-tier precedence: a
 * labware-DEFINITION candidate outranks a legacy labware SEED (ruling
 * DEFINITION-IDENTITY-UNIQUENESS, amended option (a)). The rule is DATA
 * (policies.ambiguity.candidatePrecedence — pinned in the last test);
 * declaration_precedence applies it (zero kind/name literal in TS); identity
 * predicate = normalized-label equality. A same-tier tie still clarifies.
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary, type ScientistIntentArgContract } from '../scientistIntent/vocabulary.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import type { ProviderHit, ResolveProvider } from '../../resolve/types.js';
import { createFailureTrackingProvider, createSpineAdapter, createLabwareHintAdapter, createRegistryAdapter, createRoleAddressAdapter } from './adapters.js';
import { buildStrategyRegistry } from './strategies.js';
import { resolveNoun, type EngineDeps, type ResolutionRequest } from './resolutionEngine.js';

const SLOT = { name: 'target', kind: 'resolvable', required: false } as ScientistIntentArgContract;
const hits = (...hs: ProviderHit[]): ResolveProvider => async () => hs;
const order = (s: readonly string[]) => ['declaration_precedence', ...s.filter((x) => x !== 'declaration_precedence')];
type V = ReturnType<typeof loadScientistIntentVocabulary>;

// Shipped policies with declaration_precedence first/active; withRule=false REMOVES
// the candidatePrecedence block — the data proof (rule is data, not code).
function wrap(withRule: boolean): V {
  const base = loadScientistIntentVocabulary();
  const p = base.policies();
  const amb = { ...p.ambiguity, strategyRef: 'declaration_precedence' } as Record<string, unknown>;
  if (!withRule) delete amb.candidatePrecedence;
  return { ...base, policies: () => ({ ...p, strategyOrder: order(p.strategyOrder), ambiguity: amb as typeof p.ambiguity }) };
}

function run(label: string, recordHits: ProviderHit[], v: V) {
  const tracker = { failed: false };
  const spine = createResolveSpine({ termProvider: createFailureTrackingProvider(hits(), tracker), recordProvider: createFailureTrackingProvider(hits(...recordHits), tracker), localTimeoutMs: 500, remoteTimeoutMs: 500 });
  const deps: EngineDeps = { adapters: [createSpineAdapter(spine, tracker), createLabwareHintAdapter(async () => []), createRegistryAdapter({ labwareDefinitionRegistry: { findByName: () => undefined }, compoundClassRegistry: { findByName: () => undefined } }), createRoleAddressAdapter()], strategies: buildStrategyRegistry(v) };
  return resolveNoun({ verb: 'create_container', argument: 'labware', label, declared: SLOT, actionIndex: 0, actionLocation: { actionIndex: 0, action: 'create_container' as never, argument: 'labware' } } as ResolutionRequest, v, deps);
}

const seed96: ProviderHit = { curie: 'local:seed-x', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
const def96: ProviderHit = { curie: 'local:def-x', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware-definition' };
const clarifies = (out: Awaited<ReturnType<typeof resolveNoun>>) => {
  expect(out.bindings).toEqual([]);
  expect(out.clarifications).toHaveLength(1);
  expect(out.clarifications[0]!.reason).toBe('ambiguous-noun');
};

describe('resolutionEngine.tierPrecedence (L2-P1-AMBIGUITY-TIER-RULE-1 u1)', () => {
  it('(a) labware + labware-definition, same normalized label -> binds the definition, the seed is never offered', async () => {
    const out = await run('Well Plate A', [seed96, def96], wrap(true));
    expect(out.clarifications).toEqual([]);
    expect(out.bindings).toHaveLength(1);
    expect(out.bindings[0]!.curie).toBe('local:def-x');
  });
  it('(b) two same-kind (labware) candidates, same label -> still clarifies (no arbitrary winner)', async () => {
    clarifies(await run('Well Plate A', [{ ...seed96, curie: 'local:lwa' }, { ...seed96, curie: 'local:lwb' }], wrap(true)));
  });
  it('(c) material + labware (kinds absent from the declared whenKinds pair) -> behavior untouched', async () => {
    const mat: ProviderHit = { curie: 'local:matx', label: 'Well Plate A', namespace: 'local', level: 'concept', termKind: 'material' };
    clarifies(await run('Well Plate A', [mat, { ...seed96, curie: 'local:lwb' }], wrap(true)));
  });
  it('(d) candidatePrecedence block ABSENT -> the pair clarifies again (the rule is data, not code)', async () => {
    clarifies(await run('Well Plate A', [seed96, def96], wrap(false)));
  });
  it('shipped vocabulary declares the candidatePrecedence rule (the rule is DATA, not code)', () => {
    const block = (loadScientistIntentVocabulary().policies().ambiguity as { candidatePrecedence?: readonly { whenKinds: readonly string[]; supersededByKind: string }[] }).candidatePrecedence;
    expect(block, 'shipped vocabulary must declare policies.ambiguity.candidatePrecedence').toBeDefined();
    expect(block![0]!.supersededByKind).toBe('labware-definition');
    expect([...block![0]!.whenKinds].sort()).toEqual(['labware', 'labware-definition']);
  });
});

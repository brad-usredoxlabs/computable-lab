/**
 * L2-P1-AMBIGUITY-TIER-RULE-1 (unit 1) — declared candidate-tier precedence.
 *
 * Ruling DEFINITION-IDENTITY-UNIQUENESS (amended option (a)): a
 * labware-DEFINITION candidate outranks a legacy labware seed. The rule is
 * DECLARED IN DATA (policies.ambiguity.candidatePrecedence — the shipped
 * vocabulary block, pinned at the bottom of this file); the
 * declaration_precedence strategy APPLIES it. Zero kind/name literal in TS.
 * A genuine same-tier tie still clarifies — never an arbitrary winner.
 *
 * Identity predicate: normalized-label equality (lowercase, non-alphanumerics
 * stripped) — the same predicate family as policies.ambiguity.identityCollapse
 * key [normalized_label, candidate_level]. The real legA2 pair is driven
 * AS-IS: the seed name "Generic 96 Well Plate, Flat Bottom (seed)" does NOT
 * normalize-equal the definition display_name "Generic 96-Well Plate", so the
 * rule leaves that tie to clarify (the unit invents no name table); the
 * synthetic equal-label pair drives the narrowing bar.
 *
 * The slot contract declares NO domain: the domain filter is then a declared
 * no-op (declaredDomains(undefined) = [] -> every candidate eligible), so the
 * pair reaches the strategy's declared-precedence arm — the unit under test.
 * The production labware slots' domain tag (the landing-zone filter,
 * adapters.ts) is a separate contract, out of this unit's scope.
 */
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary, type ScientistIntentArgContract } from '../scientistIntent/vocabulary.js';
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

const SLOT = { name: 'target', kind: 'resolvable', required: false } as ScientistIntentArgContract;

function hits(...hs: ProviderHit[]): ResolveProvider {
  return async () => hs;
}

function vocab(): ReturnType<typeof loadScientistIntentVocabulary> {
  const base = loadScientistIntentVocabulary();
  const p = base.policies();
  return {
    ...base,
    policies: () => ({
      ...p,
      strategyOrder: ['declaration_precedence', ...p.strategyOrder.filter((s) => s !== 'declaration_precedence')],
      ambiguity: { ...p.ambiguity, strategyRef: 'declaration_precedence' },
    }),
  };
}

/** Same wrapper minus the candidatePrecedence block — the DATA proof: the
 *  rule is data, not code (removing the block restores clarification). */
function vocabOff(): ReturnType<typeof loadScientistIntentVocabulary> {
  const base = loadScientistIntentVocabulary();
  const p = base.policies();
  const amb = { ...p.ambiguity, strategyRef: 'declaration_precedence' } as Record<string, unknown>;
  delete amb.candidatePrecedence;
  return {
    ...base,
    policies: () => ({
      ...p,
      strategyOrder: ['declaration_precedence', ...p.strategyOrder.filter((s) => s !== 'declaration_precedence')],
      ambiguity: amb as typeof p.ambiguity,
    }),
  };
}

function run(label: string, recordHits: ProviderHit[], v: ReturnType<typeof loadScientistIntentVocabulary>) {
  const tracker = { failed: false };
  const spine = createResolveSpine({
    termProvider: createFailureTrackingProvider(hits(), tracker),
    recordProvider: createFailureTrackingProvider(hits(...recordHits), tracker),
    localTimeoutMs: 500,
    remoteTimeoutMs: 500,
  });
  const adapters = [
    createSpineAdapter(spine, tracker),
    createLabwareHintAdapter(async () => []),
    createRegistryAdapter({ labwareDefinitionRegistry: { findByName: () => undefined }, compoundClassRegistry: { findByName: () => undefined } }),
    createRoleAddressAdapter(),
  ];
  const deps: EngineDeps = { adapters, strategies: buildStrategyRegistry(v) };
  const req: ResolutionRequest = {
    verb: 'create_container',
    argument: 'labware',
    label,
    declared: SLOT,
    actionIndex: 0,
    actionLocation: { actionIndex: 0, action: 'create_container' as never, argument: 'labware' },
  };
  return resolveNoun(req, v, deps);
}

const seed96: ProviderHit = { curie: 'local:seed-x', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
const def96: ProviderHit = { curie: 'local:def-x', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware-definition' };

describe('resolutionEngine.tierPrecedence (L2-P1-AMBIGUITY-TIER-RULE-1 u1)', () => {
  it('(a) labware + labware-definition, same normalized label -> binds the definition, the seed is never offered', async () => {
    const out = await run('Well Plate A', [seed96, def96], vocab());
    expect(out.clarifications).toEqual([]);
    expect(out.bindings).toHaveLength(1);
    expect(out.bindings[0]!.curie).toBe('local:def-x');
  });

  it('(b) two same-kind (labware) candidates, same label -> still clarifies (no arbitrary winner)', async () => {
    const a: ProviderHit = { curie: 'local:lwa', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const b: ProviderHit = { curie: 'local:lwb', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const out = await run('Well Plate A', [a, b], vocab());
    expect(out.bindings).toEqual([]);
    expect(out.clarifications).toHaveLength(1);
    expect(out.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  it('(c) material + labware (kinds absent from the declared whenKinds pair) -> behavior untouched', async () => {
    const mat: ProviderHit = { curie: 'local:matx', label: 'Well Plate A', namespace: 'local', level: 'concept', termKind: 'material' };
    const lab: ProviderHit = { curie: 'local:lwb', label: 'Well Plate A', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const out = await run('Well Plate A', [mat, lab], vocab());
    expect(out.bindings).toEqual([]);
    expect(out.clarifications).toHaveLength(1);
    expect(out.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  it('(d) candidatePrecedence block ABSENT -> the pair clarifies again (the rule is data, not code)', async () => {
    const out = await run('Well Plate A', [seed96, def96], vocabOff());
    expect(out.bindings).toEqual([]);
    expect(out.clarifications).toHaveLength(1);
    expect(out.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  it('real legA2 pair driven as-is: seed name does not normalize-equal the definition display_name -> the rule leaves the tie to clarify', async () => {
    const definition: ProviderHit = { curie: 'local:lbw-def-96', label: 'Generic 96-Well Plate', namespace: 'local', level: 'unknown', termKind: 'labware-definition' };
    const seed: ProviderHit = { curie: 'local:lbw-seed-96', label: 'Generic 96 Well Plate, Flat Bottom (seed)', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const out = await run('96-well plate', [definition, seed], vocab());
    expect(out.bindings).toEqual([]);
    expect(out.clarifications).toHaveLength(1);
    expect(out.clarifications[0]!.reason).toBe('ambiguous-noun');
  });

  it('shipped vocabulary declares the candidatePrecedence rule (the rule is DATA, not code)', () => {
    const block = (loadScientistIntentVocabulary().policies().ambiguity as {
      candidatePrecedence?: readonly { whenKinds: readonly string[]; supersededByKind: string }[];
    }).candidatePrecedence;
    expect(block, 'shipped vocabulary must declare policies.ambiguity.candidatePrecedence').toBeDefined();
    expect(block![0]!.supersededByKind).toBe('labware-definition');
    expect([...block![0]!.whenKinds].sort()).toEqual(['labware', 'labware-definition']);
  });
});

import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import { buildStrategyRegistry } from './strategies.js';
import { resolveNoun, type ResolutionRequest } from './resolutionEngine.js';
import type { RankedCandidate } from '../../resolve/types.js';

const base = loadScientistIntentVocabulary();
const genericId = 'lbw-def-generic-96-well-plate';
const candidate = (id: string, label: string): RankedCandidate => ({
  curie: `local:${id}`, label, namespace: 'local', tier: 1, level: 'unknown',
  score: 1, source: 'local-record', termKind: 'labware-definition',
});
const generic = candidate(genericId, 'Generic 96-Well Plate');
const specific = candidate('vendor-96', 'Vendor black 96-well plate');
async function resolve(label: string, candidates = [generic, specific], defaults = base.policies().ambiguity.defaultBindings, verb = 'create_container') {
  const vocab = { ...base, policies: () => ({ ...base.policies(), ambiguity: { ...base.policies().ambiguity, defaultBindings: defaults ?? [] } }) };
  const request: ResolutionRequest = { verb, argument: 'labware', label,
    declared: { name: 'labware', kind: 'resolvable', required: false, domain: ['labware', 'labware-definition'] } };
  return resolveNoun(request, vocab, {
    adapters: [{ id: 'spine', gather: async () => ({ candidates, failed: false }) }],
    strategies: buildStrategyRegistry(vocab),
  });
}
describe('declared generic defaults', () => {
  it('binds the declared existing definition even among vendor choices', async () => {
    const result = await resolve('  GENERIC  96-well plate  ');
    expect(result.bindings[0]?.curie).toBe(`local:${genericId}`);
    expect(result.clarifications).toEqual([]);
  });
  it.each(['black 96-well plate', 'Thermo 96-well plate cat# 12345', 'low bind 96-well plate'])(
    'preserves qualified requests: %s', async (label) => {
      const result = await resolve(label);
      expect(result.bindings).toEqual([]);
      expect(result.clarifications).toHaveLength(1);
    });
  it('does not apply a design default to an operation on an existing plate', async () => {
    expect((await resolve('96-well plate', undefined, undefined, 'shake')).bindings).toEqual([]);
  });
  it('does not invent the default when it is absent from the candidate set', async () => {
    const result = await resolve('96-well plate', [specific, candidate('other-vendor', 'Another 96-well plate')]);
    expect(result.bindings).toEqual([]);
    expect(result.clarifications).toHaveLength(1);
  });
  it('removing the data rule restores clarification', async () => {
    expect((await resolve('96-well plate', undefined, [])).bindings).toEqual([]);
  });
  it('a conflicting default declaration does not pick an arbitrary winner', async () => {
    const rules = base.policies().ambiguity.defaultBindings!;
    expect((await resolve('96-well plate', undefined, [...rules, { ...rules[0]!, recordId: 'vendor-96' }])).bindings).toEqual([]);
  });
});

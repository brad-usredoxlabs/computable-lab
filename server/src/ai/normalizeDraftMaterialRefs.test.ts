import { describe, expect, it } from 'vitest';
import { normalizeDraftMaterialRefs } from './AgentOrchestrator.js';
import type { ResolvedMention } from './resolveMentions.js';

const resolved: ResolvedMention[] = [
  { raw: '[[material:MAT-clofibrate-wzj2|clofibrate]]', kind: 'material', id: 'MAT-clofibrate-wzj2', label: 'clofibrate', resolved: { name: 'clofibrate' } },
];

function addMaterial(material_ref: unknown) {
  return { event_type: 'add_material', details: { wells: ['B2'], material_ref } };
}

describe('normalizeDraftMaterialRefs', () => {
  it('repairs a grounded pick the model mangled into an ontology ref', () => {
    const events = [addMaterial({ kind: 'ontology', id: 'MAT-clofibrate-wzj2', namespace: 'MAT-clofibrate-wzj2', label: 'MAT-clofibrate-wzj2' })];
    const [out] = normalizeDraftMaterialRefs(events, resolved) as typeof events;
    expect(out.details.material_ref).toEqual({ kind: 'record', id: 'MAT-clofibrate-wzj2', type: 'material', label: 'clofibrate' });
  });

  it('fixes an ontology ref carrying a local-record id even without a resolved match', () => {
    const events = [addMaterial({ kind: 'ontology', id: 'MAT-foo-1', label: 'MAT-foo-1' })];
    const [out] = normalizeDraftMaterialRefs(events, []) as typeof events;
    expect(out.details.material_ref).toEqual({ kind: 'record', id: 'MAT-foo-1', type: 'material', label: 'MAT-foo-1' });
  });

  it('leaves a genuine ontology ref (real CURIE) untouched', () => {
    const ref = { kind: 'ontology', id: 'CHEBI:5001', namespace: 'CHEBI', label: 'fenofibrate' };
    const [out] = normalizeDraftMaterialRefs([addMaterial(ref)], resolved) as ReturnType<typeof addMaterial>[];
    expect(out.details.material_ref).toEqual(ref);
  });

  it('leaves a clean record ref untouched', () => {
    const ref = { kind: 'record', id: 'MAT-x', type: 'material', label: 'X' };
    const [out] = normalizeDraftMaterialRefs([addMaterial(ref)], []) as ReturnType<typeof addMaterial>[];
    expect(out.details.material_ref).toEqual(ref);
  });

  it('ignores non-add_material events', () => {
    const ev = { event_type: 'transfer', details: { material_ref: { kind: 'ontology', id: 'MAT-y' } } };
    expect(normalizeDraftMaterialRefs([ev], resolved)[0]).toBe(ev);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { isMintRef, mintLabel, resolveDraftMaterials } from './resolveDraftMaterials.js';
import type { SpineCandidate, SpineLike } from './resolveDraftMaterials.js';

const candidate = (over: Partial<SpineCandidate>): SpineCandidate => ({
  curie: 'TERM-x-1',
  label: 'F prausnitzii',
  tier: 0,
  level: 'concept',
  source: 'canonical-term',
  ...over,
});

function spineReturning(map: Record<string, SpineCandidate[]>): SpineLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resolve: async (term: string) => {
      calls.push(term);
      return map[term] ?? [];
    },
  };
}

const eventWith = (ref: Record<string, unknown>) => ({
  event_type: 'add_material',
  details: { wells: ['A2'], material_ref: ref },
});

describe('resolve the biologist\'s verbatim term with the spine', () => {
  it('binds a tier-0 alias hit and keeps the verbatim words on the ref', async () => {
    const spine = spineReturning({ 'F praus': [candidate({ curie: 'TERM-fpraus-9z8y' })] });
    const out = await resolveDraftMaterials([eventWith({ kind: 'draft', id: 'mint:F praus', label: 'F praus' })], spine);

    const details = (out.events[0] as { details: Record<string, unknown> }).details;
    expect(details['material_ref']).toEqual({
      kind: 'record',
      id: 'TERM-fpraus-9z8y',
      label: 'F praus', // the biologist's words, not the canonical label
      type: 'material',
    });
    expect(out.bound).toEqual([
      { label: 'F praus', id: 'TERM-fpraus-9z8y', resolvedLabel: 'F prausnitzii', tier: 0, source: 'canonical-term', field: 'material_ref' },
    ]);
    expect(out.proposed).toEqual([]);
  });

  it('binds a formulation into the FIELD its layer implies, not the bare-concept field', async () => {
    const spine = spineReturning({
      'clofibrate': [candidate({ curie: 'MSP-API-mu50x5z7', label: '1 mM Clofibrate in DMSO', tier: 1, level: 'spec', source: 'local-record' })],
    });
    const out = await resolveDraftMaterials([eventWith({ kind: 'draft', id: 'mint:clofibrate', label: 'clofibrate' })], spine);

    const details = (out.events[0] as { details: Record<string, unknown> }).details;
    expect(details['material_spec_ref']).toMatchObject({ id: 'MSP-API-mu50x5z7', type: 'material-spec' });
    expect('material_ref' in details).toBe(false);
    expect(out.bound[0]!.field).toBe('material_spec_ref');
  });

  it('keeps an unresolved term as a mint and offers the remote candidates', async () => {
    const spine = spineReturning({
      'unobtainium': [candidate({ curie: 'CHEBI:1', label: 'unobtainium', tier: 3, level: 'unknown', source: 'ols4' })],
    });
    const out = await resolveDraftMaterials([eventWith({ kind: 'draft', id: 'mint:unobtainium', label: 'unobtainium' })], spine);

    const details = (out.events[0] as { details: Record<string, unknown> }).details;
    expect(details['material_ref']).toEqual({ kind: 'draft', id: 'mint:unobtainium', label: 'unobtainium' });
    expect(out.bound).toEqual([]);
    expect(out.proposed[0]!.suggestions[0]!.curie).toBe('CHEBI:1');
  });

  it('never second-guesses a ref that already names an id or a CURIE', async () => {
    const spine = spineReturning({});
    const events = [
      eventWith({ kind: 'record', id: 'MSP-1', label: '1 mM Clofibrate in DMSO' }),
      eventWith({ kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' }),
    ];
    const out = await resolveDraftMaterials(events, spine);
    expect(spine.calls).toEqual([]);
    expect(out.events).toEqual(events);
  });

  it('resolves one spelling ONCE, however many wells or events use it', async () => {
    const spine = spineReturning({ 'HepG2': [candidate({ curie: 'MAT-MESH-D056945', label: 'HepG2 Cell', tier: 1, level: 'concept', source: 'local-record' })] });
    const events = [
      eventWith({ kind: 'draft', id: 'mint:HepG2', label: 'HepG2' }),
      { event_type: 'add_material', details: { wells: ['B2', 'C2'], material_ref: { kind: 'draft', id: 'mint:HepG2', label: 'HepG2' } } },
    ];
    const out = await resolveDraftMaterials(events, spine);
    expect(spine.calls).toEqual(['HepG2']);
    expect(out.bound).toHaveLength(1);
    expect((out.events[1] as { details: Record<string, unknown> }).details['material_ref']).toMatchObject({ id: 'MAT-MESH-D056945' });
  });

  it('reads every shape a mint arrives in, and ignores a ref with no words', async () => {
    expect(isMintRef({ kind: 'draft' })).toBe(true);
    expect(isMintRef({ mint: { label: 'DMEM' } })).toBe(true);
    expect(isMintRef({ id: 'mint:DMEM' })).toBe(true);
    expect(isMintRef({ kind: 'record', id: 'MSP-1' })).toBe(false);

    expect(mintLabel({ mint: { label: 'HepG2 cells' } })).toBe('HepG2 cells');
    expect(mintLabel({ id: 'mint:DMEM' })).toBe('DMEM');
    expect(mintLabel({ kind: 'draft' })).toBe('');

    const spine = spineReturning({});
    const out = await resolveDraftMaterials([eventWith({ kind: 'draft' })], spine);
    expect(spine.calls).toEqual([]);
    expect(out.bound).toEqual([]);
  });

  it('asks the spine for LOCAL tiers only, so the snappy path never waits on a network', async () => {
    const resolve = vi.fn().mockResolvedValue([]);
    await resolveDraftMaterials([eventWith({ kind: 'draft', id: 'mint:DMEM', label: 'DMEM' })], { resolve });
    expect(resolve).toHaveBeenCalledWith('DMEM', { localOnly: true });
  });

  it('is a no-op for a draft with no material refs at all', async () => {
    const spine = spineReturning({});
    const events = [{ event_type: 'mix', details: { wells: ['A1'] } }];
    const out = await resolveDraftMaterials(events, spine);
    expect(spine.calls).toEqual([]);
    expect(out.events).toEqual(events);
    expect(await resolveDraftMaterials(undefined, spine)).toEqual({ events: [], bound: [], proposed: [] });
  });
});
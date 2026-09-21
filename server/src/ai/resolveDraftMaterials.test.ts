import { describe, expect, it, vi } from 'vitest';
import { isMintRef, mintLabel, resolveDraftMaterials, singularizeLastWord } from './resolveDraftMaterials.js';
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
  it('resolves `{kind:"local", label}` — the words a model actually emits', async () => {
    const spine = spineReturning({
      'HepG2 cells': [candidate({ curie: 'MAT-MESH-D056945', label: 'HepG2 Cell', tier: 1, level: 'concept', source: 'local-record' })],
    });
    const out = await resolveDraftMaterials(
      [{ event_type: 'add_material', details: { wells: ['A2'], material_ref: { kind: 'local', label: 'HepG2 cells' } } }],
      spine,
    );
    const details = (out.events[0] as { details: Record<string, unknown> }).details;
    expect(details['material_ref']).toEqual({ kind: 'record', id: 'MAT-MESH-D056945', label: 'HepG2 cells', type: 'material' });
    expect(out.bound[0]).toMatchObject({ label: 'HepG2 cells', resolvedLabel: 'HepG2 Cell', tier: 1 });
  });

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
    // The live shape: the biologist's words, a 'local' claim, and no id.
    expect(isMintRef({ kind: 'local', label: 'HepG2 cells' })).toBe(true);
    expect(isMintRef({ kind: 'local', label: 'HepG2 cells', id: 'MAT-1' })).toBe(false);

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
describe('the plural the spine cannot fold', () => {
  it('singularizes the last word only, and only when it is safe', () => {
    expect(singularizeLastWord('HepG2 cells')).toBe('HepG2 cell');
    expect(singularizeLastWord('HEK293 lysates')).toBe('HEK293 lysate');
    expect(singularizeLastWord('HepG2')).toBeNull();       // one word: nothing to infer
    expect(singularizeLastWord('glass')).toBeNull();       // ss
    expect(singularizeLastWord('TBS')).toBeNull();         // not a plural marker
  });

  it('retries once and binds the lab\'s term, recording what actually matched', async () => {
    const calls: string[] = [];
    const spine: SpineLike = {
      resolve: async (term: string) => {
        calls.push(term);
        if (term === 'HepG2 cell') {
          return [candidate({ curie: 'MAT-MESH-D056945', label: 'HepG2 Cell', tier: 1, level: 'concept', source: 'local-record' })];
        }
        return [candidate({ curie: '', label: 'Create local term', tier: 5, level: 'concept', source: 'mint' })];
      },
    };
    const out = await resolveDraftMaterials(
      [{ event_type: 'add_material', details: { wells: ['A2'], material_ref: { kind: 'local', label: 'HepG2 cells' } } }],
      spine,
    );
    expect(calls).toEqual(['HepG2 cells', 'HepG2 cell']);
    const details = (out.events[0] as { details: Record<string, unknown> }).details;
    expect(details['material_ref']).toMatchObject({ id: 'MAT-MESH-D056945', label: 'HepG2 cells' });
    expect(out.bound[0]).toMatchObject({ label: 'HepG2 cells', resolvedLabel: 'HepG2 Cell', matchedOn: 'HepG2 cell' });
  });

  it('does not retry when the first lookup already found the lab\'s own term', async () => {
    const calls: string[] = [];
    const spine: SpineLike = {
      resolve: async (term: string) => {
        calls.push(term);
        return [candidate({ curie: 'MAT-1', tier: 1, source: 'local-record' })];
      },
    };
    await resolveDraftMaterials(
      [{ event_type: 'add_material', details: { wells: ['A2'], material_ref: { kind: 'local', label: 'HepG2 cells' } } }],
      spine,
    );
    expect(calls).toEqual(['HepG2 cells']);
  });
});

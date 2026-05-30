import { describe, expect, it } from 'vitest';
import type { SchemaRegistry } from '../schema/SchemaRegistry.js';
import type { RecordStore } from '../store/types.js';
import { buildWorldMap, buildPinnedVocab, buildInUseVocab, buildResidentContext } from './residentContext.js';

/** Minimal store stub — buildInUseVocab only calls store.list({kind:'material'}). */
function stubStore(materialPayloads: Array<Record<string, unknown>>): RecordStore {
  return {
    list: async () => materialPayloads.map((payload, i) => ({ recordId: `MAT-${i}`, schemaId: 'material', payload })),
  } as unknown as RecordStore;
}

/** Minimal stub — buildWorldMap only calls registry.getAll(). */
function stubRegistry(entries: Array<{ id: string; schema: Record<string, unknown> }>): SchemaRegistry {
  return { getAll: () => entries } as unknown as SchemaRegistry;
}

const REGISTRY = stubRegistry([
  {
    id: 'material',
    schema: {
      title: 'Material',
      description: 'A material concept used in experiments (cells, chemicals, media, etc.).',
      properties: { kind: { const: 'material' } },
    },
  },
  {
    id: 'plate-event',
    schema: { title: 'Plate Event', properties: { kind: { const: 'plate-event' } } },
  },
  {
    // datatype — no kind.const → excluded from the world map
    id: 'ref',
    schema: { title: 'Ref', properties: { id: { type: 'string' } } },
  },
]);

describe('buildWorldMap', () => {
  it('lists only record kinds (those with properties.kind.const)', () => {
    const map = buildWorldMap(REGISTRY);
    expect(map).toContain('- material (Material): A material concept');
    expect(map).toContain('- plate-event (Plate Event)');
    expect(map).not.toContain('Ref'); // datatype excluded
  });

  it('includes the relationship narrative', () => {
    const map = buildWorldMap(REGISTRY);
    expect(map).toContain('How the lab fits together');
    expect(map).toContain('concept → spec/formulation');
  });

  it('sorts kinds alphabetically', () => {
    const map = buildWorldMap(REGISTRY);
    expect(map.indexOf('- material')).toBeLessThan(map.indexOf('- plate-event'));
  });
});

describe('buildPinnedVocab', () => {
  it('returns a string and, when non-empty, carries the header', () => {
    const v = buildPinnedVocab(5);
    expect(typeof v).toBe('string');
    if (v.length > 0) expect(v).toContain('KNOWN ONTOLOGY TERMS');
  });
});

describe('buildInUseVocab', () => {
  it('collects distinct ontology CURIEs from material class[]', async () => {
    const store = stubStore([
      { class: [{ kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' }] },
      { class: [{ kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' }, { kind: 'record', id: 'MAT-x' }] },
      { class: [{ kind: 'ontology', id: 'CL:0000182', label: 'hepatocyte' }] },
    ]);
    const v = await buildInUseVocab(store);
    expect(v).toContain('ONTOLOGY TERMS IN USE');
    expect(v).toContain('- CHEBI:5001 fenofibrate');
    expect(v).toContain('- CL:0000182 hepatocyte');
    // deduped: CHEBI:5001 appears once
    expect(v.match(/CHEBI:5001/g)).toHaveLength(1);
    // record refs ignored
    expect(v).not.toContain('MAT-x');
  });

  it('returns empty when no material is grounded', async () => {
    expect(await buildInUseVocab(stubStore([{ name: 'ungrounded' }, { class: [] }]))).toBe('');
  });
});

describe('buildResidentContext', () => {
  it('combines the world map (and pinned vocab) when no store is given', async () => {
    const ctx = await buildResidentContext(REGISTRY);
    expect(ctx).toContain('LAB WORLD MAP');
  });

  it('prefers in-use vocab over pinned when the store has grounded materials', async () => {
    const store = stubStore([{ class: [{ kind: 'ontology', id: 'CHEBI:5001', label: 'fenofibrate' }] }]);
    const ctx = await buildResidentContext(REGISTRY, store);
    expect(ctx).toContain('LAB WORLD MAP');
    expect(ctx).toContain('ONTOLOGY TERMS IN USE');
  });
});

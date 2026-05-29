import { describe, expect, it } from 'vitest';
import type { SchemaRegistry } from '../schema/SchemaRegistry.js';
import { buildWorldMap, buildPinnedVocab, buildResidentContext } from './residentContext.js';

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

describe('buildResidentContext', () => {
  it('combines the world map (and vocab) into one block', () => {
    const ctx = buildResidentContext(REGISTRY);
    expect(ctx).toContain('LAB WORLD MAP');
  });
});

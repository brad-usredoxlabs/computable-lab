import { describe, expect, it } from 'vitest';
import { JsonLdProjector, readPath } from './JsonLdProjector.js';
import type { UISpec } from '../ui/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

function makeEnvelope<T = Record<string, unknown>>(
  overrides: Partial<RecordEnvelope<T>> = {},
): RecordEnvelope<T> {
  return {
    recordId: 'MAT-0001',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Tris-HCl', vendor: 'Sigma' } as unknown as T,
    ...overrides,
  };
}

const uiSpec: UISpec = {
  uiVersion: 1,
  schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  list: {
    columns: [
      { path: '$.vendor', label: 'Vendor' },
      { path: '$.pH', label: 'pH' },
    ],
  },
};

describe('readPath', () => {
  it('returns root value when path is "$" or empty', () => {
    expect(readPath({ a: 1 }, '$')).toEqual([{ a: 1 }]);
  });

  it('resolves a single segment', () => {
    expect(readPath({ a: 1 }, '$.a')).toEqual([1]);
  });

  it('resolves nested segments', () => {
    expect(readPath({ a: { b: 'c' } }, '$.a.b')).toEqual(['c']);
  });

  it('flattens array values', () => {
    expect(readPath({ a: [1, 2, 3] }, '$.a')).toEqual([1, 2, 3]);
  });

  it('walks into array members', () => {
    expect(readPath({ a: [{ b: 1 }, { b: 2 }] }, '$.a.b')).toEqual([1, 2]);
  });

  it('returns empty for missing paths', () => {
    expect(readPath({ a: 1 }, '$.b.c')).toEqual([]);
  });
});

describe('JsonLdProjector', () => {
  it('emits id, types, label, fullText, facets, refs', () => {
    const projector = new JsonLdProjector({
      getUiSpec: (id) => (id === uiSpec.schemaId ? uiSpec : undefined),
    });
    const doc = projector.project(
      makeEnvelope({
        payload: {
          kind: 'material',
          name: 'Tris-HCl',
          vendor: 'Sigma',
          pH: 7.4,
        },
      }),
    );
    expect(doc.recordId).toBe('MAT-0001');
    expect(doc.kind).toBe('material');
    expect(doc.types[0]).toContain('Material');
    expect(doc.label).toBe('Tris-HCl');
    expect(doc.facets).toMatchObject({
      '$.vendor': ['Sigma'],
      '$.pH': [7.4],
    });
    expect(doc.fullText).toContain('Tris-HCl');
    expect(doc.fullText).toContain('Sigma');
    expect(doc.fullText).toContain('MAT-0001');
  });

  it('falls back to recordId when no title/name/label is set', () => {
    const projector = new JsonLdProjector();
    const doc = projector.project(makeEnvelope({ payload: { kind: 'material' } as unknown }));
    expect(doc.label).toBe('MAT-0001');
  });

  it('produces no facets when no UI spec is available', () => {
    const projector = new JsonLdProjector();
    const doc = projector.project(makeEnvelope());
    expect(doc.facets).toEqual({});
  });

  it('extracts refs from Id-suffixed fields', () => {
    const projector = new JsonLdProjector();
    const doc = projector.project(
      makeEnvelope({
        payload: {
          kind: 'experiment',
          name: 'Exp 1',
          studyId: 'STU-001',
          materialIds: ['MAT-A', 'MAT-B'],
        },
      }),
    );
    expect(doc.refs.map((r) => r.recordId)).toEqual(
      expect.arrayContaining(['STU-001', 'MAT-A', 'MAT-B']),
    );
  });

  it('extracts refs from {recordId, kind} shaped objects', () => {
    const projector = new JsonLdProjector();
    const doc = projector.project(
      makeEnvelope({
        payload: {
          kind: 'run',
          parentRef: { recordId: 'EXP-7', kind: 'experiment' },
          materials: [{ recordId: 'MAT-A', kind: 'material' }],
        },
      }),
    );
    const ids = doc.refs.map((r) => r.recordId);
    expect(ids).toEqual(expect.arrayContaining(['EXP-7', 'MAT-A']));
    const exp = doc.refs.find((r) => r.recordId === 'EXP-7');
    expect(exp?.kind).toBe('experiment');
  });

  it('ignores non-scalar facet values', () => {
    const spec: UISpec = {
      uiVersion: 1,
      schemaId: 'https://computable-lab.com/schema/computable-lab/x.schema.yaml',
      list: {
        columns: [{ path: '$.nested', label: 'Nested' }],
      },
    };
    const projector = new JsonLdProjector({ getUiSpec: () => spec });
    const doc = projector.project(
      makeEnvelope({
        schemaId: spec.schemaId,
        payload: { kind: 'x', nested: { foo: 'bar' } },
      }),
    );
    expect(doc.facets).toEqual({});
  });
});

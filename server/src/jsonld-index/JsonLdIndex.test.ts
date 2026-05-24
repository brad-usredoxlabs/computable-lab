import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonLdIndex } from './JsonLdIndex.js';
import type { IndexableDoc } from './types.js';

function makeDoc(overrides: Partial<IndexableDoc> = {}): IndexableDoc {
  return {
    recordId: 'MAT-0001',
    jsonLdId: 'https://computable-lab.com/material/MAT-0001',
    types: ['https://computable-lab.com/vocab/Material'],
    kind: 'material',
    label: 'Tris-HCl buffer',
    fullText: 'Tris-HCl buffer pH 7.4 vendor Sigma',
    facets: {
      '$.vendor': ['Sigma'],
      '$.pH': [7.4],
    },
    refs: [],
    updatedAt: '2025-12-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('JsonLdIndex', () => {
  let root: string;
  let index: JsonLdIndex;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'jsonld-index-'));
    index = new JsonLdIndex({ dbPath: join(root, 'index.sqlite') });
  });

  afterEach(() => {
    index.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('upsert then query by kind returns the record', () => {
    index.upsert(makeDoc());
    const res = index.query({ type: 'material' });
    expect(res.total).toBe(1);
    expect(res.hits[0]?.recordId).toBe('MAT-0001');
    expect(res.hits[0]?.facets).toMatchObject({
      '$.vendor': ['Sigma'],
      '$.pH': [7.4],
    });
  });

  it('full-text search with prefix matching', () => {
    index.upsert(makeDoc());
    const res = index.query({ q: 'tris' });
    expect(res.total).toBe(1);
    expect(res.hits[0]?.snippet).toBeTruthy();
    expect(res.hits[0]?.snippet).toMatch(/Tris/);
  });

  it('facet equality narrows results', () => {
    index.upsert(makeDoc({ recordId: 'MAT-A', facets: { '$.vendor': ['Sigma'] } }));
    index.upsert(makeDoc({ recordId: 'MAT-B', facets: { '$.vendor': ['Merck'] } }));
    const res = index.query({ facets: { '$.vendor': 'Sigma' } });
    expect(res.total).toBe(1);
    expect(res.hits[0]?.recordId).toBe('MAT-A');
  });

  it('facet OR filtering with array values', () => {
    index.upsert(makeDoc({ recordId: 'MAT-A', facets: { '$.vendor': ['Sigma'] } }));
    index.upsert(makeDoc({ recordId: 'MAT-B', facets: { '$.vendor': ['Merck'] } }));
    index.upsert(makeDoc({ recordId: 'MAT-C', facets: { '$.vendor': ['Other'] } }));
    const res = index.query({ facets: { '$.vendor': ['Sigma', 'Merck'] } });
    expect(res.total).toBe(2);
    expect(new Set(res.hits.map((h) => h.recordId))).toEqual(new Set(['MAT-A', 'MAT-B']));
  });

  it('refs filter matches records that point at given target', () => {
    index.upsert(
      makeDoc({
        recordId: 'FOR-1',
        kind: 'formulation',
        refs: [{ recordId: 'MAT-A', kind: 'material' }],
      }),
    );
    index.upsert(
      makeDoc({
        recordId: 'FOR-2',
        kind: 'formulation',
        refs: [{ recordId: 'MAT-B', kind: 'material' }],
      }),
    );
    const res = index.query({ refs: ['MAT-A'] });
    expect(res.total).toBe(1);
    expect(res.hits[0]?.recordId).toBe('FOR-1');
  });

  it('tombstone removes the record from queries', () => {
    index.upsert(makeDoc());
    index.tombstone('MAT-0001');
    const res = index.query({});
    expect(res.total).toBe(0);
  });

  it('clear wipes everything', () => {
    index.upsert(makeDoc({ recordId: 'A' }));
    index.upsert(makeDoc({ recordId: 'B' }));
    expect(index.size()).toBe(2);
    index.clear();
    expect(index.size()).toBe(0);
    expect(index.query({}).total).toBe(0);
  });

  it('paginates with cursor', () => {
    for (let i = 0; i < 5; i++) {
      index.upsert(makeDoc({ recordId: `MAT-${i}`, label: `mat ${i}` }));
    }
    const page1 = index.query({ limit: 2 });
    expect(page1.hits).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = index.query({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.hits).toHaveLength(2);
    // No overlap between pages.
    const ids = new Set([...page1.hits, ...page2.hits].map((h) => h.recordId));
    expect(ids.size).toBe(4);
  });

  it('facetCounts include all facet values from the result set', () => {
    index.upsert(makeDoc({ recordId: 'A', facets: { '$.vendor': ['Sigma'] } }));
    index.upsert(makeDoc({ recordId: 'B', facets: { '$.vendor': ['Sigma'] } }));
    index.upsert(makeDoc({ recordId: 'C', facets: { '$.vendor': ['Merck'] } }));
    const res = index.query({ type: 'material' });
    expect(res.facetCounts['$.vendor']).toEqual(
      expect.arrayContaining([
        { value: 'Sigma', count: 2 },
        { value: 'Merck', count: 1 },
      ]),
    );
  });

  it('upsert replaces facets and refs (no stale rows)', () => {
    index.upsert(makeDoc({ facets: { '$.vendor': ['Sigma'] } }));
    index.upsert(makeDoc({ facets: { '$.vendor': ['Merck'] } }));
    const sigmaHits = index.query({ facets: { '$.vendor': 'Sigma' } }).total;
    const merckHits = index.query({ facets: { '$.vendor': 'Merck' } }).total;
    expect(sigmaHits).toBe(0);
    expect(merckHits).toBe(1);
  });

  it('sanitizes operator characters in q so user input cannot break syntax', () => {
    index.upsert(makeDoc({ recordId: 'A', fullText: 'PCR master mix' }));
    // Operator chars + unbalanced parens — would normally throw at FTS5 parse time.
    const res = index.query({ q: 'pcr ("mix' });
    expect(res.total).toBe(1);
    expect(res.hits[0]?.recordId).toBe('A');
  });

  it('persists across reopen', () => {
    index.upsert(makeDoc({ recordId: 'PERSIST-1' }));
    index.close();
    const reopened = new JsonLdIndex({ dbPath: join(root, 'index.sqlite') });
    try {
      expect(reopened.size()).toBe(1);
      expect(reopened.query({}).hits[0]?.recordId).toBe('PERSIST-1');
    } finally {
      reopened.close();
    }
  });
});

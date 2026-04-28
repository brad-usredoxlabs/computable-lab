import { describe, it, expect } from 'vitest';
import { resolveNounPhrases } from './NounPhraseResolver';
import type { Clause } from './TextSegmenter';
import type { VerbMatch } from './VerbMatcher';
import type { NounResolverDeps } from './NounPhraseResolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClause(text: string, spanStart: number): Clause {
  const tokens = text.toLowerCase().split(/[\s,;:.\-—–"'()\[\]{}!?]+/).filter((t) => t.length > 0);
  return {
    text,
    span: [spanStart, spanStart + text.length],
    tokens,
  };
}

function makeVerbMatch(verb: string, tokenIndex: number, span: [number, number]): VerbMatch {
  return { verb, source: 'canonical', tokenIndex, span };
}

// ---------------------------------------------------------------------------
// Test (a): 'add 96-well-plate, reservoir' → 2 'labware' hits
// ---------------------------------------------------------------------------

describe('resolveNounPhrases', () => {
  it('(a) two labware hits via comma split', async () => {
    const deps: NounResolverDeps = {
      labwareDefinitionRegistry: {
        findByName: (n: string) => {
          if (n === '96-well-plate') return { recordId: 'LBW-96WP' };
          if (n === 'reservoir') return { recordId: 'LBW-RES' };
          return undefined;
        },
      },
      compoundClassRegistry: { findByName: () => undefined },
      ontologyTermRegistry: { searchLabel: () => [] },
      labwareInstanceLookup: async () => [],
    };

    const clause = makeClause('add 96-well-plate, reservoir', 0);
    const verbMatch = makeVerbMatch('add_material', 0, [0, 3]);

    const result = await resolveNounPhrases(clause, verbMatch, deps);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      phrase: '96-well-plate',
      span: [4, 17],
      kind: 'labware',
      recordId: 'LBW-96WP',
      confidence: 1.0,
    });
    expect(result[1]).toEqual({
      phrase: 'reservoir',
      span: [19, 28],
      kind: 'labware',
      recordId: 'LBW-RES',
      confidence: 1.0,
    });
  });

  // ---------------------------------------------------------------------------
  // Test (b): 'add clofibrate' → 'ontology' hit
  // ---------------------------------------------------------------------------

  it('(b) ontology hit for clofibrate', async () => {
    const deps: NounResolverDeps = {
      labwareDefinitionRegistry: { findByName: () => undefined },
      compoundClassRegistry: { findByName: () => undefined },
      ontologyTermRegistry: {
        searchLabel: (q: string) => {
          if (q === 'clofibrate') {
            return [{ id: 'CHEBI:3753', label: 'clofibrate', source: 'chebi' }];
          }
          return [];
        },
      },
      labwareInstanceLookup: async () => [],
    };

    const clause = makeClause('add clofibrate', 0);
    const verbMatch = makeVerbMatch('add_material', 0, [0, 3]);

    const result = await resolveNounPhrases(clause, verbMatch, deps);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      phrase: 'clofibrate',
      span: [4, 14],
      kind: 'ontology',
      recordId: 'CHEBI:3753',
      confidence: 0.7,
      source: 'chebi',
    });
  });

  // ---------------------------------------------------------------------------
  // Test (c): 'use cell plate from yesterday' → 'labware-instance' hit
  // ---------------------------------------------------------------------------

  it('(c) labware-instance hit via labwareInstanceLookup', async () => {
    const deps: NounResolverDeps = {
      labwareDefinitionRegistry: { findByName: () => undefined },
      compoundClassRegistry: { findByName: () => undefined },
      ontologyTermRegistry: { searchLabel: () => [] },
      labwareInstanceLookup: async (hint: string) => {
        if (hint.toLowerCase().includes('cell plate')) {
          return [{ recordId: 'LWI-CP-001', title: 'Cell Plate #1' }];
        }
        return [];
      },
    };

    const clause = makeClause('use cell plate from yesterday', 0);
    const verbMatch = makeVerbMatch('use', 0, [0, 3]);

    const result = await resolveNounPhrases(clause, verbMatch, deps);

    // Post-verb: " cell plate from yesterday" → split on " from " → ["cell plate", "yesterday"]
    // "cell plate" → labware-instance hit; "yesterday" → unresolved
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      phrase: 'cell plate',
      span: [4, 14],
      kind: 'labware-instance',
      recordId: 'LWI-CP-001',
      confidence: 0.6,
    });
    expect(result[1]).toEqual({
      phrase: 'yesterday',
      span: [20, 29],
      kind: 'unresolved',
      confidence: 0,
    });
  });

  // ---------------------------------------------------------------------------
  // Test (d): 'add xyzzy and foo' → 2 'unresolved' hits
  // ---------------------------------------------------------------------------

  it('(d) two unresolved hits — stopwords filtered, two unknowns remain', async () => {
    const deps: NounResolverDeps = {
      labwareDefinitionRegistry: { findByName: () => undefined },
      compoundClassRegistry: { findByName: () => undefined },
      ontologyTermRegistry: { searchLabel: () => [] },
      labwareInstanceLookup: async () => [],
    };

    const clause = makeClause('add xyzzy and foo', 0);
    const verbMatch = makeVerbMatch('add_material', 0, [0, 3]);

    const result = await resolveNounPhrases(clause, verbMatch, deps);

    // Post-verb: " xyzzy and foo" → split on " and " → ["xyzzy", "foo"]
    // Both unresolved
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      phrase: 'xyzzy',
      span: [4, 9],
      kind: 'unresolved',
      confidence: 0,
    });
    expect(result[1]).toEqual({
      phrase: 'foo',
      span: [14, 17],
      kind: 'unresolved',
      confidence: 0,
    });
  });

  // ---------------------------------------------------------------------------
  // Test (e): 'transfer to 5' → verbMatch present, post-verb is numeric → []
  // ---------------------------------------------------------------------------

  it('(e) post-verb pure numeric filtered → empty result', async () => {
    const deps: NounResolverDeps = {
      labwareDefinitionRegistry: { findByName: () => undefined },
      compoundClassRegistry: { findByName: () => undefined },
      ontologyTermRegistry: { searchLabel: () => [] },
      labwareInstanceLookup: async () => [],
    };

    const clause = makeClause('transfer to 5', 0);
    const verbMatch = makeVerbMatch('transfer', 0, [0, 8]);

    const result = await resolveNounPhrases(clause, verbMatch, deps);

    // Post-verb: " to 5" → split on " to " → ["5"]
    // "5" is pure numeric → filtered → []
    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Test (f): Golden example from the spec
  // ---------------------------------------------------------------------------

  it('(f) golden example from spec', async () => {
    const deps: NounResolverDeps = {
      labwareDefinitionRegistry: {
        findByName: (n: string) => (n === '96-well-plate' ? { recordId: 'LBW-96WP' } : undefined),
      },
      compoundClassRegistry: { findByName: () => undefined },
      ontologyTermRegistry: {
        searchLabel: (q: string) =>
          q === 'clofibrate'
            ? [{ id: 'CHEBI:3753', label: 'clofibrate', source: 'chebi' }]
            : [],
      },
      labwareInstanceLookup: async () => [],
    };

    const clause = makeClause('add 96-well-plate and clofibrate', 0);
    const verbMatch = makeVerbMatch('add_material', 0, [0, 3]);

    const result = await resolveNounPhrases(clause, verbMatch, deps);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      phrase: '96-well-plate',
      span: [4, 17],
      kind: 'labware',
      recordId: 'LBW-96WP',
      confidence: 1.0,
    });
    expect(result[1]).toEqual({
      phrase: 'clofibrate',
      span: [22, 32],
      kind: 'ontology',
      recordId: 'CHEBI:3753',
      confidence: 0.7,
      source: 'chebi',
    });
  });

  // ---------------------------------------------------------------------------
  // Test (g): No verbMatch → full clause text used
  // ---------------------------------------------------------------------------

  it('(g) no verbMatch → full clause text split', async () => {
    const deps: NounResolverDeps = {
      labwareDefinitionRegistry: { findByName: () => undefined },
      compoundClassRegistry: { findByName: () => undefined },
      ontologyTermRegistry: { searchLabel: () => [] },
      labwareInstanceLookup: async () => [],
    };

    const clause = makeClause('96-well-plate and clofibrate', 0);

    const result = await resolveNounPhrases(clause, undefined, deps);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      phrase: '96-well-plate',
      span: [0, 13],
      kind: 'unresolved',
      confidence: 0,
    });
    expect(result[1]).toEqual({
      phrase: 'clofibrate',
      span: [18, 28],
      kind: 'unresolved',
      confidence: 0,
    });
  });

  // ---------------------------------------------------------------------------
  // Test (h): Stopwords are filtered
  // ---------------------------------------------------------------------------

  it('(h) single stopwords are dropped', async () => {
    const deps: NounResolverDeps = {
      labwareDefinitionRegistry: { findByName: () => undefined },
      compoundClassRegistry: { findByName: () => undefined },
      ontologyTermRegistry: { searchLabel: () => [] },
      labwareInstanceLookup: async () => [],
    };

    const clause = makeClause('add the and a', 0);
    const verbMatch = makeVerbMatch('add_material', 0, [0, 3]);

    const result = await resolveNounPhrases(clause, verbMatch, deps);

    // Post-verb: " the and a" → split on " and " → ["the", "a"]
    // Both are stopwords → filtered → []
    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Test (i): Split on prepositions: from, into, onto
  // ---------------------------------------------------------------------------

  it('(i) split on prepositions: from, into, onto', async () => {
    const deps: NounResolverDeps = {
      labwareDefinitionRegistry: { findByName: () => undefined },
      compoundClassRegistry: { findByName: () => undefined },
      ontologyTermRegistry: { searchLabel: () => [] },
      labwareInstanceLookup: async () => [],
    };

    const clause = makeClause('transfer alpha from beta into gamma onto delta', 0);
    const verbMatch = makeVerbMatch('transfer', 0, [0, 8]);

    const result = await resolveNounPhrases(clause, verbMatch, deps);

    // Post-verb: " alpha from beta into gamma onto delta" → split → ["alpha", "beta", "gamma", "delta"]
    // All are unresolved
    expect(result).toHaveLength(4);
    expect(result[0].phrase).toBe('alpha');
    expect(result[1].phrase).toBe('beta');
    expect(result[2].phrase).toBe('gamma');
    expect(result[3].phrase).toBe('delta');
  });
});

import { describe, it, expect } from 'vitest';
import { matchVerb } from './VerbMatcher';
import type { Clause } from './TextSegmenter';
import type { VerbActionMapRegistry } from './VerbMatcher';

// ---------------------------------------------------------------------------
// Inline mock registry — no real registry instantiation
// ---------------------------------------------------------------------------

function makeMockReg(overrides: Record<string, { verb: string; source: 'canonical' | 'synonym' }> = {}): VerbActionMapRegistry {
  const defaults: Record<string, { verb: string; source: 'canonical' | 'synonym' }> = {
    transfer: { verb: 'transfer', source: 'canonical' },
    move:     { verb: 'transfer', source: 'synonym' },
    incubate: { verb: 'incubate', source: 'canonical' },
    read:     { verb: 'read',     source: 'canonical' },
  };
  const merged = { ...defaults, ...overrides };

  return {
    findVerbForToken: (t: string) => merged[t.toLowerCase()] ?? undefined,
  };
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchVerb', () => {
  const reg = makeMockReg();

  it('(a) clause "transfer 5 ul from A to B" → match {verb: "transfer", source: "canonical", tokenIndex: 0}', () => {
    const clause = makeClause('transfer 5 ul from A to B', 0);
    const result = matchVerb(clause, reg);
    expect(result).toEqual({
      verb: 'transfer',
      source: 'canonical',
      tokenIndex: 0,
      span: [0, 8],
    });
  });

  it('(b) clause "move 5 ul from A to B" → match {verb: "transfer", source: "synonym"}', () => {
    const clause = makeClause('move 5 ul from A to B', 0);
    const result = matchVerb(clause, reg);
    expect(result).toEqual({
      verb: 'transfer',
      source: 'synonym',
      tokenIndex: 0,
      span: [0, 4],
    });
  });

  it('(c) clause "just sitting around" → undefined', () => {
    const clause = makeClause('just sitting around', 0);
    const result = matchVerb(clause, reg);
    expect(result).toBeUndefined();
  });

  it('(d) clause "incubate then read" → match {verb: "incubate", tokenIndex: 0} (first hit wins)', () => {
    const clause = makeClause('incubate then read', 0);
    const result = matchVerb(clause, reg);
    expect(result).toEqual({
      verb: 'incubate',
      source: 'canonical',
      tokenIndex: 0,
      span: [0, 8],
    });
  });

  it('(e) clause "5 uL from A to B" (no verb token, only nouns/numbers) → undefined', () => {
    const clause = makeClause('5 uL from A to B', 0);
    const result = matchVerb(clause, reg);
    expect(result).toBeUndefined();
  });
});

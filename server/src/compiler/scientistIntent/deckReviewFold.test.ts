/**
 * DECK-FOLD-1 — deck-review fold policy loader tests (RED-first).
 *
 * The cap on resolved placement offers is DATA: config/drafting/deck-review.yaml
 * (`maxResolvedOffers`), loaded PER CALL via import.meta.url exactly like
 * shorthandDrafting.ts — never process-cached, zero numeric cap literals in TS.
 * Doctrine pinned here:
 *   - ABSENT file/section => null => cap OFF (legacy pass-through);
 *   - PRESENT-but-malformed (not a positive integer) => THROW naming the key
 *     (analysisReferenceGrounding.ts maxPerKind wording precedent);
 *   - a mid-run policy flip changes the cap WITHOUT a code change or reload
 *     (the per-call proof — a module-level `const CAP = load()` would fail this).
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capResolvedLabwares, loadDeckReviewPolicy } from './deckReviewFold.js';

function policyFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckfold-policy-'));
  const path = join(dir, 'deck-review.yaml');
  writeFileSync(path, contents);
  return path;
}

describe('loadDeckReviewPolicy', () => {
  it('reads maxResolvedOffers from the shipped policy file (data, not a literal)', () => {
    const policy = loadDeckReviewPolicy();
    expect(policy).not.toBeNull();
    expect(Number.isInteger(policy!.maxResolvedOffers)).toBe(true);
    expect(policy!.maxResolvedOffers).toBeGreaterThan(0);
  });

  it('ABSENT file => null (cap off — the absent-means-off doctrine)', () => {
    expect(loadDeckReviewPolicy(join(tmpdir(), 'deckfold-absent-does-not-exist.yaml'))).toBeNull();
  });

  it('ABSENT section (file without maxResolvedOffers) => null', () => {
    expect(loadDeckReviewPolicy(policyFile('# a policy file with no cap section\n'))).toBeNull();
  });

  it('PRESENT-but-malformed maxResolvedOffers THROWS naming the key', () => {
    for (const bad of ['maxResolvedOffers: zero', 'maxResolvedOffers: 0', 'maxResolvedOffers: -3', 'maxResolvedOffers: 2.5', 'maxResolvedOffers: [12]']) {
      expect(() => loadDeckReviewPolicy(policyFile(bad))).toThrow(/maxResolvedOffers/);
    }
  });

  it('a non-object policy document throws honestly', () => {
    expect(() => loadDeckReviewPolicy(policyFile('- 1\n- 2\n'))).toThrow(/deck review policy/);
  });
});

describe('capResolvedLabwares', () => {
  it('reads PER CALL: a mid-run policy flip changes the cap with no code change', () => {
    const path = policyFile('maxResolvedOffers: 2\n');
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(capResolvedLabwares(items, path)).toEqual(['a', 'b']);
    writeFileSync(path, 'maxResolvedOffers: 4\n');
    expect(capResolvedLabwares(items, path)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('absent policy => uncapped pass-through, order verbatim', () => {
    const items = ['a', 'b', 'c'];
    expect(capResolvedLabwares(items, join(tmpdir(), 'deckfold-absent-does-not-exist.yaml'))).toEqual(items);
  });

  it('a list at or under the cap passes through untouched', () => {
    const path = policyFile('maxResolvedOffers: 3\n');
    expect(capResolvedLabwares(['a', 'b', 'c'], path)).toEqual(['a', 'b', 'c']);
  });

  it('truncation is a silent head-slice of the deterministic order (no gap emitted)', () => {
    const path = policyFile('maxResolvedOffers: 2\n');
    const capped = capResolvedLabwares(['first', 'second', 'third'], path);
    expect(capped).toEqual(['first', 'second']);
  });
});

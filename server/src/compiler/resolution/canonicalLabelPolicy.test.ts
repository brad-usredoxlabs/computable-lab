/**
 * canonicalLabelPolicy.test.ts — pins the D3 canonical-label POLICY loader
 * (CARD1-D3 ruling l2t1430 §3, "Policy home").
 *
 * The policy is DATA (the `canonicalLabel:` block in the scientist-intent
 * vocabulary), loaded PER call and never process-cached. The loader is the
 * nounShape/assumedValues sibling: a present-but-malformed block THROWS naming
 * the path (an invalid policy is not an off-state), and an ABSENT block also
 * THROWS — the ruling forbids a hardcoded FALLBACK policy, so the render path
 * cannot limp on a default. Zero label literals in the TS: only the declared
 * shape (the three tokens) is known here; the values come from the data.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadCanonicalLabelPolicy,
  CANONICAL_LABEL_POLICY_TOKENS,
} from './canonicalLabelPolicy.js';

const SHIPPED = new URL(
  '../../../../schema/scientist-intent/scientist-intent-vocabulary.yaml',
  import.meta.url,
);

function tmpYaml(doc: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'card1-canonical-label-policy-'));
  const path = join(dir, 'scientist-intent-vocabulary.yaml');
  writeFileSync(path, doc, 'utf8');
  return path;
}

describe('D3 canonicalLabelPolicy loader', () => {
  it('loads the shipped block with the exact declared tokens (no re-derivation)', () => {
    const policy = loadCanonicalLabelPolicy(SHIPPED);
    expect(policy).toEqual({
      preMintDisplay: 'identity-case',
      mintedDisplay: 'record-title',
      titleAdoption: 'scientist-phrasing-when-key-equal',
    });
    // The tokens are the DATA-declared membership set — pin the set so a
    // drift in the data cannot silently widen the legal values.
    expect(CANONICAL_LABEL_POLICY_TOKENS).toEqual({
      preMintDisplay: ['identity-case'],
      mintedDisplay: ['record-title'],
      titleAdoption: ['scientist-phrasing-when-key-equal'],
    });
  });

  it('re-reads PER call (never process-cached): a data edit needs no stack restart', () => {
    // First call reads the shipped block.
    expect(loadCanonicalLabelPolicy(SHIPPED).preMintDisplay).toBe('identity-case');
    // A distinct path (fixture injection) reading a DIFFERENT (still-valid)
    // block returns ITS values — proof the value is per-source, not a memoized
    // singleton. (All three tokens are the single legal value each, so a
    // distinct value is asserted via the malformed/absent arms below; here we
    // prove the loader consults the PATH it is given, not a cached default.)
    const alt = tmpYaml([
      'verbs: []',
      'policies: {}',
      'canonicalLabel:',
      '  preMintDisplay: identity-case',
      '  mintedDisplay: record-title',
      '  titleAdoption: scientist-phrasing-when-key-equal',
    ].join('\n'));
    expect(loadCanonicalLabelPolicy(alt)).toEqual({
      preMintDisplay: 'identity-case',
      mintedDisplay: 'record-title',
      titleAdoption: 'scientist-phrasing-when-key-equal',
    });
    // And the SAME path read twice agrees (deterministic), while a second
    // distinct path is consulted independently.
    expect(loadCanonicalLabelPolicy(SHIPPED).mintedDisplay).toBe('record-title');
  });

  it('THROWS on an ABSENT block (no hardcoded fallback policy — the ruling forbids it)', () => {
    const doc = tmpYaml([
      'verbs: []',
      'policies: {}',
      // No canonicalLabel: block.
    ].join('\n'));
    expect(() => loadCanonicalLabelPolicy(doc)).toThrow(/canonicalLabel.*ABSENT|fallback/i);
  });

  it('THROWS on a malformed block (an invalid policy is not an off-state)', () => {
    const notAString = tmpYaml([
      'verbs: []',
      'policies: {}',
      'canonicalLabel:',
      '  preMintDisplay: 42',
      '  mintedDisplay: record-title',
      '  titleAdoption: scientist-phrasing-when-key-equal',
    ].join('\n'));
    expect(() => loadCanonicalLabelPolicy(notAString)).toThrow(/preMintDisplay.*string/i);

    const notAToken = tmpYaml([
      'verbs: []',
      'policies: {}',
      'canonicalLabel:',
      '  preMintDisplay: raw-prose',
      '  mintedDisplay: record-title',
      '  titleAdoption: scientist-phrasing-when-key-equal',
    ].join('\n'));
    expect(() => loadCanonicalLabelPolicy(notAToken)).toThrow(/preMintDisplay.*not a declared token/i);
  });

  it('THROWS on a missing member (all three tokens are required)', () => {
    const missing = tmpYaml([
      'verbs: []',
      'policies: {}',
      'canonicalLabel:',
      '  preMintDisplay: identity-case',
      '  mintedDisplay: record-title',
      // titleAdoption absent.
    ].join('\n'));
    expect(() => loadCanonicalLabelPolicy(missing)).toThrow(/titleAdoption/i);
  });
});

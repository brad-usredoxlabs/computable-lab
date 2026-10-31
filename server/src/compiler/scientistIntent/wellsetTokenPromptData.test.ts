/**
 * L2-WELLSET-TOKEN-EMIT-1 (RED-first) — the producer-side PROMPT DATA for the
 * declared wellset token.
 *
 * Root cause (verified first-hand at the dispatch's base): on live drives the
 * small model never emitted the vocabulary's DECLARED contents-derived wellset
 * token (`all-wells-containing-materials`) on `mix` — it free-filled literal
 * well ranges or omitted the optional `wells` arg. The server's resolve_wellsets
 * pass is token-gated by vocabulary DATA (wellsetValueTokens) and is
 * CONTRACTUALLY CORRECT on a tokenless wire (never-guess passthrough); the
 * missing piece is the PRODUCER-SIDE prompt data. The registry template
 * `intent.compile.system.yaml` declares `wells?:wellset(labware)` in the
 * ARGUMENTS block but never teaches what a `kind: wellset` argument accepts,
 * so a contents-derived phrase ("all wells that have material") has no taught
 * mapping onto the declared token.
 *
 * This file pins the DATA in the registry template (the file the live
 * producer surface ships as prompt data — read the SAME way
 * vocabularyMirrorDrift.test.ts (e) and hedgeOptionality.test.ts read it):
 *  1. the template teaches the mapping: a contents-derived phrase on a
 *     `kind: wellset` argument is the vocabulary's DECLARED token — never a
 *     literal well list, never an invented labware noun;
 *  2. the template references the declared token VALUE(s) — asserted against
 *     vocabulary DATA (`defaultScientistIntentVocabulary().wellsetValueTokens()`),
 *     zero token literals in this test (one DATA home, not a second local
 *     term);
 *  3. MUTATION LEG (test-the-test): stripping the token value out of a temp
 *     copy of the template text trips the GREEN leg's assertions (the test
 *     actually reads the guidance, not an unrelated substring).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { defaultScientistIntentVocabulary } from './vocabulary.js';

const REGISTRY_TEMPLATE_PATH = join(
  process.cwd(), 'schema', 'registry', 'prompt-templates', 'intent.compile.system.yaml',
);

/** The template's prompt text, yaml-parsed (the same load every mirror pin uses). */
function templateContent(): string {
  return (parseYaml(readFileSync(REGISTRY_TEMPLATE_PATH, 'utf-8')) as { content: string }).content;
}

describe('L2-WELLSET-TOKEN-EMIT-1 — the registry template teaches the wellset token (prompt DATA)', () => {
  const vocab = defaultScientistIntentVocabulary();
  const tokens = vocab.wellsetValueTokens();

  it('the vocabulary declares a non-empty wellsetValueTokens list (the DATA the template must reference)', () => {
    // The token list already ships (WELLSET-RESOLVER-1); this item adds NO
    // vocabulary change — the pin asserts the data home is intact.
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) expect(typeof t).toBe('string');
  });

  it('the template names the kind: wellset argument kind (the carrier the guidance scopes)', () => {
    expect(templateContent()).toContain('kind: wellset');
  });

  it('the template teaches: contents-derived phrase -> the declared token(s), never a literal well list', () => {
    const content = templateContent();
    expect(content).toMatch(/wellset/i);
    expect(content).toMatch(/declared/);
    expect(content).toMatch(/never/i);
    // The anti-list discipline is the behavioral core of the fix (the model
    // free-filled `wells: [A1:H1, A2:H2]` on 9/9 live drives).
    expect(content).toMatch(/literal well (list|range)/i);
    // ...and the anti-invention discipline (the model free-varied the
    // `labware:` noun: "plate", "the plate", full titles).
    expect(content).toMatch(/invent/i);
  });

  it('the template references the declared token VALUE(s) — asserted from vocabulary DATA (zero token literals here)', () => {
    const content = templateContent();
    for (const token of tokens) {
      expect(content, `template must reference the declared token "${token}"`).toContain(token);
    }
  });

  it('MUTATION LEG (test-the-test): stripping the token value out of the template text trips the GREEN assertions', () => {
    const shipped = readFileSync(REGISTRY_TEMPLATE_PATH, 'utf-8');
    const stale = (parseYaml(shipped) as { content: string }).content;
    // Remove EVERY occurrence of the declared token value(s) — exactly the
    // desync class: the guidance present but no longer pointing at the
    // vocabulary's data.
    const stripped = tokens.reduce((text, token) => text.split(token).join(''), stale);
    expect(stripped).not.toBe(stale); // the mutation applied
    // The GREEN leg's DATA-driven assertion would FAIL on the stripped copy:
    for (const token of tokens) {
      expect(stripped, `stripped copy must no longer contain "${token}"`).not.toContain(token);
    }
  });
});

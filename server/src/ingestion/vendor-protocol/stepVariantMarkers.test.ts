/**
 * Step-variant-marker spine (spec: deterministic branch-fill from dispatch
 * sentences). The pattern DATA lives in
 * schema/registry/intake-patterns/step-variant-markers.yaml — the TS module is
 * a dumb interpreter. These tests pin:
 *   - the real dispatch sentence fills exactly 3 ordered branches
 *   - a lone conditional footnote ('K. If necessary...') gets NO branches
 *     (single option is never a question)
 *   - pre-existing branches are never touched
 *   - the YAML registry file itself compiles and drives annotateStepVariants
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PATTERNS_PATH,
  annotateStepVariants,
  loadStepVariantPatterns,
} from './stepVariantMarkers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk up from this test file to the repo root (server/src/ingestion/vendor-protocol -> root).
const repoRoot = resolve(__dirname, '../../../..');
const YAML_PATH = join(repoRoot, 'schema', DEFAULT_PATTERNS_PATH);

/** Verbatim from the DNeasy Blood & Tissue PDF extraction, embedded \n + runs
 *  of spaces included. */
const DNEASY_DISPATCH =
  'For blood with non-nucleated\n     erythrocytes, follow step 1a; for blood with nucleated\n     erythrocytes, follow step 1b; for cultured cells, follow step 1c. Blood from mammals\n     contains non-nucleated erythrocytes.';

const FOOTNOTE_K =
  'K. If necessary, double the amount of Buffer ATL and Proteinase K, and use a 2 ml microcentrifuge tube for lysis. Remember to adjust the amount of Buffer AL and ethanol proportionately in subsequent steps.';

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

describe('loadStepVariantPatterns', () => {
  it('loads and validates the real registry file; every regex compiles', () => {
    const yamlText = readFileSync(YAML_PATH, 'utf8');
    const patterns = loadStepVariantPatterns(yamlText);
    expect(patterns.length).toBeGreaterThanOrEqual(3);
    const ids = patterns.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['dispatch-conditional', 'lettered-marker', 'leading-conditional']));
    for (const p of patterns) {
      expect(() => new RegExp(p.regex, p.flags)).not.toThrow();
      expect(p.role).toMatch(/^(dispatch|marker|conditional)$/);
    }
    // JS RegExp has no (?P<name>) syntax — the data file must use (?<name>).
    for (const p of patterns) expect(p.regex).not.toContain('(?P<');
  });

  it('rejects a pattern whose regex does not compile', () => {
    const bad = `
version: 1
patterns:
  - id: broken
    description: 'unclosed group'
    regex: '(for\\\\s+'
    flags: i
    role: dispatch
`;
    expect(() => loadStepVariantPatterns(bad)).toThrow(/broken/);
  });

  it('rejects an unknown role', () => {
    const bad = `
version: 1
patterns:
  - id: weird
    description: 'bad role'
    regex: 'for'
    flags: i
    role: teleport
`;
    expect(() => loadStepVariantPatterns(bad)).toThrow(/weird/);
  });
});

describe('annotateStepVariants', () => {
  it('fills 3 ordered branches from the verbatim DNeasy dispatch sentence (data-driven)', () => {
    const patterns = loadStepVariantPatterns(readFileSync(YAML_PATH, 'utf8'));
    const steps = [{ id: 'step-1', sourceText: DNEASY_DISPATCH }];
    const result = annotateStepVariants(steps, patterns);

    expect(result.annotatedStepIds).toEqual(['step-1']);
    const branches = result.steps[0]!.branches;
    expect(branches).toBeDefined();
    expect(branches!.length).toBe(3);
    // Order follows the sentence: 1a, 1b, 1c.
    expect(branches!.map((b) => normalize(b))).toEqual([
      'blood with non-nucleated erythrocytes (follow step 1a)',
      'blood with nucleated erythrocytes (follow step 1b)',
      'cultured cells (follow step 1c)',
    ]);
    for (const b of branches!) expect(normalize(b)).toContain('(follow step 1');
    // Input array is not mutated.
    expect(steps[0]!.branches).toBeUndefined();
  });

  it('keeps the "K. If necessary..." footnote branchless: marker/conditional alone is not a question', () => {
    const patterns = loadStepVariantPatterns(readFileSync(YAML_PATH, 'utf8'));
    const steps = [{ id: 'footnote-k', sourceText: FOOTNOTE_K }];
    const result = annotateStepVariants(steps, patterns);

    expect(result.annotatedStepIds).toEqual([]);
    expect(result.steps[0]!.branches ?? []).toEqual([]);
  });

  it('never modifies a step with pre-existing branches', () => {
    const patterns = loadStepVariantPatterns(readFileSync(YAML_PATH, 'utf8'));
    const existing = ['a. x', 'b. y'];
    const steps = [{ id: 'step-2', sourceText: DNEASY_DISPATCH, branches: existing }];
    const result = annotateStepVariants(steps, patterns);

    expect(result.annotatedStepIds).toEqual([]);
    expect(result.steps[0]!.branches).toEqual(['a. x', 'b. y']);
  });

  it('a lone leading conditional gets no branches', () => {
    const patterns = loadStepVariantPatterns(readFileSync(YAML_PATH, 'utf8'));
    const steps = [{ id: 'step-3', sourceText: 'If the pellet is white, wash it again with ethanol.' }];
    const result = annotateStepVariants(steps, patterns);
    expect(result.annotatedStepIds).toEqual([]);
    expect(result.steps[0]!.branches ?? []).toEqual([]);
  });

  it('a plain step with no markers is returned untouched', () => {
    const patterns = loadStepVariantPatterns(readFileSync(YAML_PATH, 'utf8'));
    const steps = [{ id: 'step-4', sourceText: 'Centrifuge the tube for 1 min at 8,000 rpm.' }];
    const result = annotateStepVariants(steps, patterns);
    expect(result.annotatedStepIds).toEqual([]);
    expect(result.steps[0]!.branches).toBeUndefined();
  });

  it('leaves a step with only ONE dispatch clause branchless (one option is not a question)', () => {
    const patterns = loadStepVariantPatterns(readFileSync(YAML_PATH, 'utf8'));
    const steps = [{ id: 'step-5', sourceText: 'For cultured cells, follow step 1c.' }];
    const result = annotateStepVariants(steps, patterns);
    expect(result.annotatedStepIds).toEqual([]);
    expect(result.steps[0]!.branches ?? []).toEqual([]);
  });
});

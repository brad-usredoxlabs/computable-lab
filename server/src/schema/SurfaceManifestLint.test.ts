// @vitest-environment node
/**
 * L2-UI-SURFACE-MANIFEST-1 / u1lintrules — surface-pane-vocabulary-closure (L-SM-2)
 *
 * Declares the within-manifest pane-closure rule as a nested everyItem/in data
 * predicate (no engine change) and pins it with one disk-loaded LintEngine test
 * that passes on the committed manifest, fails on a phantom pane naming the
 * surface, and fails if the rule's value list drifts from the manifest's
 * paneVocabulary.
 *
 * Harness: parse the REAL surface-manifest.lint.yaml and the REAL
 * config/ui/surfaces.yaml from disk into a LintEngine and assert lint results.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from '../lint/LintEngine.js';
import type { LintSpec } from '../lint/types.js';

const MANIFEST_SCHEMA_ID =
  'https://computable-lab.com/schema/ui/surface-manifest.schema.yaml';

const LINT_PATH = fileURLToPath(
  new URL('../../../schema/ui/surface-manifest.lint.yaml', import.meta.url),
);
const MANIFEST_PATH = fileURLToPath(
  new URL('../../../config/ui/surfaces.yaml', import.meta.url),
);

function loadLintSpec(): LintSpec {
  const parsed = parseYaml(readFileSync(LINT_PATH, 'utf-8')) as LintSpec;
  if (typeof parsed.lintVersion !== 'number' || !Array.isArray(parsed.rules)) {
    throw new Error('Invalid lint spec: surface-manifest.lint.yaml');
  }
  return parsed;
}

function loadManifest(): Record<string, unknown> {
  return parseYaml(readFileSync(MANIFEST_PATH, 'utf-8')) as Record<string, unknown>;
}

function createEngine(): LintEngine {
  const eng = new LintEngine();
  eng.addSpec('surface-manifest', loadLintSpec());
  return eng;
}

// =============================================================================
// Test suite
// =============================================================================

describe('L-SM-2 surface-pane-vocabulary-closure', () => {
  let engine: LintEngine;
  let manifest: Record<string, unknown>;

  beforeAll(() => {
    manifest = loadManifest();
    engine = createEngine();
  });

  // (a) Clean manifest: zero findings
  it('lints the committed manifest with zero findings', () => {
    const result = engine.lint(manifest, MANIFEST_SCHEMA_ID);
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  // (b) Phantom pane leg: deep-clone, push 'dec', assert >=1 finding
  it('flags a phantom pane (dec) as an error naming the value', () => {
    // Deep-clone the manifest
    const mutated = JSON.parse(JSON.stringify(manifest));
    // The analysis surface (index 2) has panes [ai-chat, project-tabs]
    const analysisSurface = mutated.surfaces[2] as Record<string, unknown>;
    (analysisSurface.panes as string[]).push('dec');

    const result = engine.lint(mutated, MANIFEST_SCHEMA_ID);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    const violation = result.violations.find(
      (v) => v.ruleId === 'surface-pane-vocabulary-closure',
    );
    expect(violation).toBeDefined();
    expect(violation?.message).toContain('dec');
    // The message should reference the failing surface index
    expect(violation?.message).toMatch(/item 2|surfaces\[2\]|analysis/);
  });

  // (c) DRIFT pin: the rule's static values list must equal the manifest's
  //     paneVocabulary — read both from disk, no literal duplication
  it('drift pin: rule values exactly match the manifest paneVocabulary', () => {
    const spec = loadLintSpec();
    const manifestFromDisk = loadManifest();

    // Extract the 'in' predicate values from the nested everyItem chain
    const rule = spec.rules.find((r) => r.id === 'surface-pane-vocabulary-closure');
    expect(rule).toBeDefined();

    // The rule assert is: everyItem(surfaces) -> everyItem(panes) -> in(".", values)
    const outerAssert = rule!.assert as { op: string; collectionPath: string; assert: unknown };
    expect(outerAssert.op).toBe('everyItem');

    const innerAssert = outerAssert.assert as { op: string; collectionPath: string; assert: unknown };
    expect(innerAssert.op).toBe('everyItem');

    const inPredicate = innerAssert.assert as { op: string; values: string[] };
    expect(inPredicate.op).toBe('in');

    const ruleValues = new Set(inPredicate.values);
    const manifestVocab = new Set(
      (manifestFromDisk.paneVocabulary as string[]).map((v) => String(v)),
    );

    expect(ruleValues).toEqual(manifestVocab);
  });

  // (d) Non-vacuity guard: exactly 1 rule loaded for this schemaId
  it('non-vacuity: the engine returns exactly 1 rule for the manifest schemaId', () => {
    const rules = engine.getRules(MANIFEST_SCHEMA_ID);
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('surface-pane-vocabulary-closure');
  });
});

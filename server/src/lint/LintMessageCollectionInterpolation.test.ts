// @vitest-environment node
/**
 * L2-LAB-INVENTORY-CREATE-1 (g3d9tplcols) — the [object Object] message pin.
 *
 * LintEngine renders each {{path}} in a rule message with String(getPath(...))
 * (PathResolver.ts:304-306), so a template naming its OWN collectionPath prints
 * an array of objects as "[object Object],[object Object]" instead of the
 * offending items. Over ALL schema/**\/*.lint.yaml a rule must name a scalar
 * item field (claims[*].claimStatus, aliquots[*].disposition) AND list that
 * same path in message.paths, so the placeholder is really substituted.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLintEngine } from './LintEngine.js';
import { loadAllLintSpecs } from './LintSpecLoader.js';
import { extractTemplatePaths, interpolateTemplate } from './PathResolver.js';
import type { LintSpec } from './types.js';

function repoRoot(): string {
  for (let dir = fileURLToPath(new URL('.', import.meta.url)); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'schema', 'lint', 'lint-v1.schema.yaml'))) return dir;
    if (dirname(dir) === dir) throw new Error('no repo root (schema/lint/lint-v1.schema.yaml) above test file');
  }
}

const ROOT = repoRoot();

/** Collection paths a predicate quantifies over (assert tree, any depth). */
function collectionPaths(node: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => collectionPaths(n, acc));
  else if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.collectionPath === 'string') acc.add(obj.collectionPath);
    Object.values(obj).forEach((v) => collectionPaths(v, acc));
  }
  return acc;
}

/** Two claims / two aliquots, each carrying a distinct scalar item field. */
const FIXTURE = {
  claims: [
    { claimStatus: 'completed', occurredAtStatus: 'known' },
    { claimStatus: 'unknown', occurredAtStatus: 'known' },
  ],
  aliquots: [
    { disposition: 'available', occurredAtStatus: 'known' },
    { disposition: 'consumed', occurredAtStatus: 'known' },
  ],
};

let specs: Array<{ name: string; spec: LintSpec }> = [];

beforeAll(async () => {
  const loaded = await loadAllLintSpecs({ basePath: join(ROOT, 'schema'), recursive: true });
  // A spec declaring no rules (core/lab-state) is not a coverage hole.
  const holes = loaded.errors.filter((e) => /\nrules:/.test(readFileSync(join(ROOT, 'schema', e.path), 'utf-8')));
  expect(holes).toEqual([]);
  specs = loaded.specs;
  expect(specs.length).toBeGreaterThanOrEqual(50);
});

describe('lint messages name scalars, never a whole collection', () => {
  it('no rule interpolates its own collectionPath (all schema/**/*.lint.yaml)', () => {
    const offenders: string[] = [];
    for (const { name, spec } of specs) {
      for (const rule of spec.rules) {
        const own = collectionPaths(rule.assert);
        for (const path of extractTemplatePaths(rule.message.template)) {
          if (own.has(path)) offenders.push(`${name}: ${rule.id} interpolates {{${path}}}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('projected item fields render the offending scalars (three in-scope files)', () => {
    const inScope = ['attestation', 'material-receiving', 'chain-draft'];
    let rendered = 0;
    for (const { spec } of specs.filter((s) => inScope.includes(s.name))) {
      for (const rule of spec.rules) {
        const placeholders = extractTemplatePaths(rule.message.template);
        if (!placeholders.some((p) => p.includes('[*]'))) continue;
        rendered += 1;
        const message = interpolateTemplate(rule.message.template, FIXTURE, rule.message.paths);
        expect(message, rule.id).not.toContain('[object Object]');
        expect(message, rule.id).not.toContain('{{');
        if (placeholders.includes('claims[*].claimStatus')) expect(message).toContain('completed,unknown');
        if (placeholders.includes('aliquots[*].disposition')) expect(message).toContain('available,consumed');
      }
    }
    expect(rendered).toBeGreaterThanOrEqual(20); // the 20 measured rules
  });

  it('AC1: a known-occurrence claim without occurredAt names its claimStatus values', () => {
    const spec = specs.find((s) => s.name === 'material-receiving');
    expect(spec).toBeDefined();
    const engine = createLintEngine();
    engine.addSpec('material-receiving', spec!.spec);
    const result = engine.lint(
      FIXTURE,
      'https://computable-lab.com/schema/computable-lab/material-receiving.schema.yaml',
    );
    const violation = result.violations.find(
      (v) => v.ruleId === 'material-receiving-occurred-known-needs-occurred-at',
    );
    expect(violation).toBeDefined();
    expect(violation!.message).toContain('completed');
    expect(violation!.message).not.toContain('[object Object]');
  });
});

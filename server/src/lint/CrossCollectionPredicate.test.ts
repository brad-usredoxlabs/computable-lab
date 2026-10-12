/**
 * PROTO-AI-3 — `allIn`: generic cross-collection membership predicate.
 *
 * Semantics under test: every value selected by `path` (a scalar or a
 * `[*]`-wildcard collection) must be a member of the collection selected
 * by `collectionPath` — optionally reduced to one field of each item via
 * `itemField`. Empty selections pass vacuously; unresolved paths and a
 * non-collection target fail loudly (reason names the offending path and,
 * for membership misses, the offending value).
 *
 * The last block checks the meta-schema contract (`allIn` accepted) and
 * the loader passthrough boundary; Ajv is the structural authority.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { evaluatePredicate } from './PredicateEvaluator.js';
import { loadAllLintSpecs } from './LintSpecLoader.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import type { AllInPredicate, LintSpec, Predicate } from './types.js';

const LINT_META_SCHEMA_ID = 'https://computable-lab.com/schema/lint/lint-v1.schema.yaml';
const LINT_META_SCHEMA_PATH = fileURLToPath(
  new URL('../../../schema/lint/lint-v1.schema.yaml', import.meta.url),
);

function pred(overrides: Partial<AllInPredicate> = {}): AllInPredicate {
  return {
    op: 'allIn',
    path: 'steps[*].roleId',
    collectionPath: 'roles',
    itemField: 'roleId',
    ...overrides,
  };
}

const rolesData = {
  roles: [{ roleId: 'r1' }, { roleId: 'r2' }],
  steps: [{ roleId: 'r1' }, { roleId: 'r2' }],
};

describe('allIn predicate (cross-collection membership)', () => {
  // --- happy paths ---------------------------------------------------------

  it('passes when every [*]-selected value is a member of the B collection (itemField)', () => {
    const res = evaluatePredicate(pred(), rolesData);
    expect(res.result).toBe(true);
  });

  it('passes when A selects a plain (non-wildcard) array', () => {
    const res = evaluatePredicate(
      pred({ path: 'wanted', collectionPath: 'roles', itemField: 'roleId' }),
      { ...rolesData, wanted: ['r1', 'r2'] },
    );
    expect(res.result).toBe(true);
  });

  it('passes when A resolves to a single scalar that is a member', () => {
    const res = evaluatePredicate(
      pred({ path: 'defaultRole', collectionPath: 'roles', itemField: 'roleId' }),
      { ...rolesData, defaultRole: 'r2' },
    );
    expect(res.result).toBe(true);
  });

  it('compares flat scalar collections directly when itemField is omitted', () => {
    const res = evaluatePredicate(
      pred({ path: 'used', collectionPath: 'known', itemField: undefined }),
      { used: ['a', 'b'], known: ['a', 'b', 'c'] },
    );
    expect(res.result).toBe(true);
  });

  it('passes vacuously when A selects an empty collection', () => {
    const res = evaluatePredicate(pred(), { roles: [{ roleId: 'r1' }], steps: [] });
    expect(res.result).toBe(true);
  });

  it('passes vacuously when the wildcard selects no present items', () => {
    const res = evaluatePredicate(
      pred({ path: 'steps[*].optionalRole' }),
      rolesData,
    );
    expect(res.result).toBe(true);
  });

  it('fails when A is a single empty-string scalar and "" is not a member', () => {
    // "" is a real selected value, not an empty selection; guard against
    // accidental vacuity on empty-string scalars.
    const res = evaluatePredicate(
      pred({ path: 'defaultRole', collectionPath: 'roles', itemField: 'roleId' }),
      { ...rolesData, defaultRole: '' },
    );
    expect(res.result).toBe(false);
    expect(res.reason).toMatch(/""/);
  });

  // --- failure paths -------------------------------------------------------

  it('fails when a selected value is not in the collection, naming the offender', () => {
    const res = evaluatePredicate(pred(), {
      roles: [{ roleId: 'r1' }],
      steps: [{ roleId: 'r1' }, { roleId: 'ghost' }],
    });
    expect(res.result).toBe(false);
    expect(res.reason).toContain('ghost');
    expect(res.reason).toContain('steps[*].roleId');
  });

  it('fails loudly when the A path does not resolve', () => {
    const res = evaluatePredicate(
      pred({ path: 'missingField' }),
      rolesData,
    );
    expect(res.result).toBe(false);
    expect(res.reason).toContain('missingField');
    expect(res.reason).toMatch(/not found|does not resolve|does not exist/i);
  });

  it('fails loudly when the B collection path does not resolve', () => {
    const res = evaluatePredicate(
      pred({ collectionPath: 'noSuchRoles' }),
      rolesData,
    );
    expect(res.result).toBe(false);
    expect(res.reason).toContain('noSuchRoles');
  });

  it('fails loudly when B resolves to a single scalar (not a collection)', () => {
    const res = evaluatePredicate(
      pred({ path: 'used', collectionPath: 'single' }),
      { used: ['a'], single: 'a' },
    );
    expect(res.result).toBe(false);
    expect(res.reason).toContain('single');
    expect(res.reason).toMatch(/array|collection/i);
  });

  it('fails loudly when B is a plain object rather than an array', () => {
    const res = evaluatePredicate(
      pred({ path: 'used', collectionPath: 'lookup' }),
      { used: ['a'], lookup: { a: 1 } },
    );
    expect(res.result).toBe(false);
    expect(res.reason).toMatch(/array|collection/i);
  });

  it('fails loudly when the predicate omits collectionPath (structural error)', () => {
    const broken = { op: 'allIn', path: 'a' } as unknown as Predicate;
    const res = evaluatePredicate(broken, { a: 'x' });
    expect(res.result).toBe(false);
    expect(res.reason).toContain('collectionPath');
  });
});

// --- meta-schema + loader boundary -----------------------------------------

function specWith(assert: Record<string, unknown>): Record<string, unknown> {
  return {
    lintVersion: 1,
    rules: [
      {
        id: 'steps-roles-assigned',
        title: 'Every step role must be an assigned role',
        severity: 'error',
        scope: 'record',
        assert,
        message: { template: 'step role not assigned' },
      },
    ],
  };
}

function lintMetaValidator(): AjvValidator {
  const validator = new AjvValidator();
  const meta = parseYaml(readFileSync(LINT_META_SCHEMA_PATH, 'utf-8'));
  validator.addSchema(meta);
  return validator;
}

describe('allIn meta-schema contract (lint-v1)', () => {
  it('accepts a lint spec whose assert uses allIn with path + collectionPath + itemField', () => {
    const validator = lintMetaValidator();
    const res = validator.validate(
      specWith({ op: 'allIn', path: 'steps[*].roleId', collectionPath: 'roles', itemField: 'roleId' }),
      LINT_META_SCHEMA_ID,
    );
    expect(res.errors.map((e) => `${e.path} ${e.message}`)).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it('accepts allIn without itemField (flat collection)', () => {
    const validator = lintMetaValidator();
    const res = validator.validate(
      specWith({ op: 'allIn', path: 'used', collectionPath: 'known' }),
      LINT_META_SCHEMA_ID,
    );
    expect(res.valid).toBe(true);
  });

  it('rejects an allIn predicate missing collectionPath, with a location', () => {
    const validator = lintMetaValidator();
    const res = validator.validate(
      specWith({ op: 'allIn', path: 'steps[*].roleId' }),
      LINT_META_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
    // Loud failure WITH location: the Ajv error instancePath points at the predicate.
    expect(res.errors.some((e) => e.path.includes('/rules/0/assert'))).toBe(true);
  });

  it('rejects an allIn predicate with a non-string itemField, with a location', () => {
    const validator = lintMetaValidator();
    const res = validator.validate(
      specWith({ op: 'allIn', path: 'a', collectionPath: 'b', itemField: 7 }),
      LINT_META_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path.includes('/rules/0/assert'))).toBe(true);
  });

  it('existing ops still validate (oneOf stays exclusive)', () => {
    const validator = lintMetaValidator();
    for (const assert of [
      { op: 'exists', path: 'title' },
      { op: 'nonEmpty', path: 'title' },
      { op: 'regex', path: 'id', pattern: '^X' },
      { op: 'equals', path: 'kind', value: 'study' },
      { op: 'in', path: 'status', values: ['draft'] },
      { op: 'all', predicates: [{ op: 'exists', path: 'a' }] },
      { op: 'any', predicates: [{ op: 'exists', path: 'a' }] },
      { op: 'not', not: { op: 'exists', path: 'a' } },
    ]) {
      const res = validator.validate(specWith(assert), LINT_META_SCHEMA_ID);
      expect(res.errors.map((e) => `${e.path} ${e.message}`)).toEqual([]);
    }
  });
});

describe('allIn loader passthrough', () => {
  it('loadAllLintSpecs loads a canonical allIn spec unchanged and the engine runs it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lint-allin-'));
    writeFileSync(
      join(dir, 'allin-check.lint.yaml'),
      [
        'lintVersion: 1',
        'rules:',
        '  - id: steps-roles-assigned',
        '    title: Step roles must be assigned',
        '    severity: error',
        '    scope: record',
        '    assert:',
        '      op: allIn',
        '      path: steps[*].roleId',
        '      collectionPath: roles',
        '      itemField: roleId',
        '    message:',
        '      template: step role not assigned',
        '',
      ].join('\n'),
    );

    const loaded = await loadAllLintSpecs({ basePath: dir });
    expect(loaded.errors).toEqual([]);
    expect(loaded.specs).toHaveLength(1);

    const assert = loaded.specs[0]?.spec.rules[0]?.assert as AllInPredicate | undefined;
    expect(assert?.op).toBe('allIn');
    expect(assert?.collectionPath).toBe('roles');
    expect(assert?.itemField).toBe('roleId');

    // The loaded op evaluates through the shared evaluator (engine is op-agnostic).
    const res = evaluatePredicate(assert as AllInPredicate, rolesData);
    expect(res.result).toBe(true);
  });
});

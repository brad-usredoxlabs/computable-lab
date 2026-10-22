/**
 * MATRES-ELIG §6 — the eligibility triplet's schema + lint contract test
 * (pattern: AttestationSchemas.test.ts, the ATTEST precedent).
 *
 * Asserts the DATA contract only — no TS-side policy branches:
 *  1. The meta-schema loads through the recursive schema loader ($id enforced)
 *     and the DATA + LINT files match neither loader pattern (they stay
 *     unregistered — the vocabulary pattern).
 *  2. The shipped policy data validates against the meta-schema (Ajv =
 *     structural validation authority) with zero errors.
 *  3. The bound lint spec loads with zero load errors for our paths, is
 *     registered, and the shipped data produces ZERO violations.
 *  4. Mutation legs (the lint is load-bearing, not decorative): a tierLegality
 *     row naming an UNDECLARED level, a bind policy WITHOUT its custodyGuard
 *     (the P4 custody-leakage shape), and a policy missing an arm each fail
 *     with the NAMED rule.
 *  5. Structural bait legs the meta-schema (not the DSL) owns: a tierLegality
 *     array value outside the tier enum, and an empty policies array.
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadAllSchemas } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { LintEngine } from '../lint/LintEngine.js';

const TRIPLET_DIR = join('scientist-intent', 'material-eligibility');
const DATA_PATH = join(TRIPLET_DIR, 'material-eligibility.yaml');
const SCHEMA_PATH = join(TRIPLET_DIR, 'material-eligibility.schema.yaml');
const LINT_PATH = join(TRIPLET_DIR, 'material-eligibility.lint.yaml');
const ELIGIBILITY_SCHEMA_ID =
  'https://computable-lab.com/schema/scientist-intent/material-eligibility.schema.yaml';
const LINT_RULE_IDS = [
  'material-eligibility-tierlegality-demanded-levels-declared',
  'material-eligibility-tierlegality-modes-declared',
  'material-eligibility-remote-tiers-are-spine-tiers',
  'material-eligibility-custody-never-tiers-are-spine-tiers',
  'material-eligibility-default-mode-declared',
  'material-eligibility-levelspellings-canonical-declared',
  'material-eligibility-policy-verdicts-declared',
  'material-eligibility-bind-policies-carry-custody-guard',
  'material-eligibility-identity-levels-are-referent-levels',
  'material-eligibility-policies-carry-both-arms',
];

async function shippedData(): Promise<Record<string, unknown>> {
  return parseYaml(await readFile(join(process.cwd(), 'schema', DATA_PATH), 'utf8')) as Record<string, unknown>;
}

async function buildWorld() {
  const schemaRoot = join(process.cwd(), 'schema');
  const schemaLoad = await loadAllSchemas({ basePath: join(schemaRoot, TRIPLET_DIR), recursive: true });
  expect(schemaLoad.errors).toEqual([]);
  const ids = schemaLoad.entries.map((e) => e.schema['$id']);
  expect(ids).toContain(ELIGIBILITY_SCHEMA_ID);
  // Only the *.schema.yaml file is schema-registered; the DATA and LINT files
  // match neither loader pattern (the vocabulary pattern holds for the triplet).
  expect(schemaLoad.entries).toHaveLength(1);

  const lintLoad = await loadAllLintSpecs({ basePath: schemaRoot, recursive: true });
  const ours = lintLoad.specs.filter((s) => s.name === 'material-eligibility');
  expect(ours).toHaveLength(1);
  expect(lintLoad.errors.filter((e) => e.path.includes('material-eligibility'))).toEqual([]);

  const validator = createValidator({ strict: false });
  // The meta-schema $refs the shipped lint-v1 predicate definition — register it.
  const lintMeta = parseYaml(await readFile(join(schemaRoot, 'lint', 'lint-v1.schema.yaml'), 'utf8'));
  validator.addSchema(lintMeta, 'https://computable-lab.com/schema/lint/lint-v1.schema.yaml');
  for (const entry of schemaLoad.entries) validator.addSchema(entry.schema, entry.id);

  const engine = new LintEngine();
  for (const { name, spec } of lintLoad.specs) {
    try {
      engine.addSpec(name, spec);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/material-eligibility/i.test(name) || /material-eligibility/i.test(message)) throw err;
    }
  }
  for (const ruleId of LINT_RULE_IDS) expect(engine.getRule(ruleId)).toBeDefined();
  return { validator, engine };
}

function lintViolations(engine: LintEngine, doc: unknown): string[] {
  const result = engine.lint(doc, ELIGIBILITY_SCHEMA_ID);
  return result.violations.map((v) => v.ruleId);
}

describe('material-eligibility triplet (schema + lint contract)', () => {
  it('the shipped triplet validates against the meta-schema and lints CLEAN (zero findings)', async () => {
    const { validator, engine } = await buildWorld();
    const doc = await shippedData();
    const structural = validator.validate(doc, ELIGIBILITY_SCHEMA_ID);
    expect(structural.errors.map((e) => `${e.path} ${e.message}`)).toEqual([]);
    expect(lintViolations(engine, doc)).toEqual([]);
  });

  it('mutation: a tierLegality row naming an UNDECLARED level fails with the NAMED rule', async () => {
    const { engine } = await buildWorld();
    const doc = await shippedData();
    const rows = doc['tierLegality'] as Array<Record<string, unknown>>;
    rows[0]!['demandedLevel'] = 'bottle'; // an invented level noun
    expect(lintViolations(engine, doc)).toContain('material-eligibility-tierlegality-demanded-levels-declared');
  });

  it('mutation (P4 bait 9): an authorized-to-bind policy WITHOUT its custodyGuard fails with the NAMED rule', async () => {
    const { engine } = await buildWorld();
    const doc = await shippedData();
    const policies = doc['policies'] as Array<Record<string, unknown>>;
    const bindPolicy = policies.find((p) => p['verdict'] === 'authorized-to-bind')!;
    delete bindPolicy['custodyGuard'];
    expect(lintViolations(engine, doc)).toContain('material-eligibility-bind-policies-carry-custody-guard');
  });

  it('mutation: a policy missing its assert arm fails with the NAMED rule', async () => {
    const { engine } = await buildWorld();
    const doc = await shippedData();
    const policies = doc['policies'] as Array<Record<string, unknown>>;
    delete policies[0]!['assert'];
    expect(lintViolations(engine, doc)).toContain('material-eligibility-policies-carry-both-arms');
  });

  it('mutation: an identityLevels member outside the declared referent levels fails with the NAMED rule', async () => {
    const { engine } = await buildWorld();
    const doc = await shippedData();
    doc['identityLevels'] = ['catalog-item']; // an invented level noun
    expect(lintViolations(engine, doc)).toContain('material-eligibility-identity-levels-are-referent-levels');
  });

  it('structural bait: a tier value outside the spine-tier enum is rejected by the META-SCHEMA (Ajv is the structural authority)', async () => {
    const { validator } = await buildWorld();
    const doc = await shippedData();
    const rows = doc['tierLegality'] as Array<Record<string, unknown>>;
    (rows[0]!['queryTiers'] as number[]).push(9); // not a spine tier
    const structural = validator.validate(doc, ELIGIBILITY_SCHEMA_ID);
    expect(structural.valid).toBe(false);
    expect(structural.errors.some((e) => e.path.includes('tierLegality'))).toBe(true);
  });

  it('structural bait: an empty policies array is rejected by the META-SCHEMA (no silent default policy set)', async () => {
    const { validator } = await buildWorld();
    const doc = await shippedData();
    doc['policies'] = [];
    const structural = validator.validate(doc, ELIGIBILITY_SCHEMA_ID);
    expect(structural.valid).toBe(false);
  });

  it('cross-document identity (NEVER two local terms for one entity): the vocabulary referentLevels list and the eligibility referentLevels list are the SAME set', async () => {
    const { engine } = await buildWorld();
    const vocab = parseYaml(await readFile(join(process.cwd(), 'schema', 'scientist-intent', 'scientist-intent-vocabulary.yaml'), 'utf8')) as Record<string, unknown>;
    const doc = await shippedData();
    const vocabLevels = [...(vocab['referentLevels'] as string[])].sort();
    const eligLevels = [...(doc['referentLevels'] as string[])].sort();
    expect(vocabLevels).toEqual(eligLevels);
    // The eligibility demandedLevelValues is exactly the canonical list plus
    // the data's own undeclared spelling — no third list, no invented noun.
    const demanded = [...(doc['demandedLevelValues'] as string[])].sort();
    const undeclared = doc['undeclaredLevelSpelling'] as string;
    expect(demanded).toEqual([...eligLevels, undeclared].sort());
    expect(lintViolations(engine, doc)).toEqual([]);
  });

  it('the lint spec is bound by schemaId: rules fire ONLY against the eligibility schemaId (no cross-tree leakage)', async () => {
    const { engine } = await buildWorld();
    // A foreign document (the vocabulary data shape) under a different schemaId
    // must not collect eligibility rule violations.
    const vocab = parseYaml(await readFile(join(process.cwd(), 'schema', 'scientist-intent', 'scientist-intent-vocabulary.yaml'), 'utf8'));
    const result = engine.lint(vocab, 'https://computable-lab.com/schema/scientist-intent/scientist-intent-vocabulary.schema.yaml');
    expect(result.violations.some((v) => v.ruleId.startsWith('material-eligibility-'))).toBe(false);
  });
});

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
  // FIX-RUN 2 D1 (adversarial review l2t2215): E7 pinned the guard's PRESENCE
  // only — probe K/L substituted a trivially-true guard and the custody-never
  // tier bound PASS. E12 pins the guard's SHAPE (the exact noneIn
  // candidate.tier/demanded.custodyNeverTiers disjointness).
  'material-eligibility-bind-custody-guard-shape-pinned',
  // FIX-RUN 1 D1 (adversarial review l2t2050): the SHAPE-forbidding half of
  // spec §7.3 P4 — an authorized-to-bind assert may never use a custody
  // collection as a membership EVIDENCE target (the presence-only E7 was
  // decorative; the reviewer proved the mutated shape passed lint clean).
  // WIDENED FIX-RUN 2 D1: any-op (allIn membership or in-valuesPath) at any
  // depth down to the declared bound (the pinned E12 guard + the evaluator's
  // guard-before-assert order close what the walk does not reach).
  'material-eligibility-bind-asserts-never-membership-on-custody-collections',
  'material-eligibility-identity-levels-are-referent-levels',
  // FIX-RUN 1 D2: the identity role tag is SINGLE-SOURCED (identityRole) and
  // attached by policy-id reference — a dangling role target is rejected.
  'material-eligibility-identity-role-policies-declared',
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

  it('mutation (FIX-RUN 1 D1, spec §7.3 "the lint forbids the shape"): a bind policy whose assert uses demanded.custodyNeverTiers as a membership (allIn) evidence target is REJECTED with the NAMED rule — at assert root, one level deep, and two levels deep', async () => {
    // The reviewer's proven mutation: bind assert = {allIn candidate.tier
    // demanded.custodyNeverTiers} — tier-4 evidence asserted as POSITIVE
    // evidence. It passed Ajv AND lint at HEAD. The shape must now be
    // forbidden by lint at every nesting depth the DSL can hide it at.
    const { engine } = await buildWorld();
    const forbidden = 'material-eligibility-bind-asserts-never-membership-on-custody-collections';

    const bindAt = async (assert: unknown) => {
      const doc = await shippedData();
      const policies = doc['policies'] as Array<Record<string, unknown>>;
      const bindPolicy = policies.find((p) => p['verdict'] === 'authorized-to-bind')!;
      bindPolicy['assert'] = assert;
      return lintViolations(engine, doc);
    };

    expect(await bindAt({ op: 'allIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' }))
      .toContain(forbidden);
    expect(await bindAt({ op: 'all', predicates: [{ op: 'allIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' }] }))
      .toContain(forbidden);
    expect(await bindAt({ op: 'all', predicates: [{ op: 'any', predicates: [{ op: 'allIn', path: 'candidate.tier', collectionPath: 'demanded.identityOnlyTiers' }] }] }))
      .toContain(forbidden);
  });

  it('mutation (FIX-RUN 1 D1 control): the SHAPE stays legal for a non-bind policy — the display-identity-only-role policy legitimately allIns demanded.identityOnlyTiers and the shipped data must still lint CLEAN', async () => {
    const { engine } = await buildWorld();
    const doc = await shippedData();
    const policies = doc['policies'] as Array<Record<string, unknown>>;
    const displayPolicy = policies.find((p) => p['id'] === 'display-identity-only-role')!;
    displayPolicy['assert'] = { op: 'all', predicates: [{ op: 'allIn', path: 'candidate.tier', collectionPath: 'demanded.identityOnlyTiers' }] };
    expect(lintViolations(engine, doc)).toEqual([]);
  });

  it('mutation (FIX-RUN 2 D1, review l2t2215 probe K): a bind policy with a SUBSTITUTED trivially-true custodyGuard AND a depth-3 allIn-custody assert is REJECTED — E12 names the guard-shape pin and the widened E8 names the deep leak (RED at 172f556a: both lint violations were [] and the tier-4 bind evaluated PASS)', async () => {
    const { engine } = await buildWorld();
    const doc = await shippedData();
    const policies = doc['policies'] as Array<Record<string, unknown>>;
    const bindPolicy = policies.find((p) => p['verdict'] === 'authorized-to-bind')!;
    bindPolicy['custodyGuard'] = { op: 'exists', path: 'candidate.curie' };
    bindPolicy['assert'] = {
      op: 'all',
      predicates: [{ op: 'all', predicates: [{ op: 'all', predicates: [{ op: 'allIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' }] }] }],
    };
    const violations = lintViolations(engine, doc);
    expect(violations).toContain('material-eligibility-bind-custody-guard-shape-pinned');
    expect(violations).toContain('material-eligibility-bind-asserts-never-membership-on-custody-collections');
  });

  it('mutation (FIX-RUN 2 D1, review l2t2215 probe L): a bind policy with a SUBSTITUTED guard and a depth-1 non-membership assert (equals candidate.tier 4) is REJECTED by E12 — the guard SHAPE is pinned, so the evaluator half can never be disarmed by a data substitution (RED at 172f556a: lint violations were [])', async () => {
    const { engine } = await buildWorld();
    const doc = await shippedData();
    const policies = doc['policies'] as Array<Record<string, unknown>>;
    const bindPolicy = policies.find((p) => p['verdict'] === 'authorized-to-bind')!;
    bindPolicy['custodyGuard'] = { op: 'exists', path: 'candidate.curie' };
    bindPolicy['assert'] = { op: 'all', predicates: [{ op: 'equals', path: 'candidate.tier', value: 4 }] };
    expect(lintViolations(engine, doc)).toContain('material-eligibility-bind-custody-guard-shape-pinned');
  });

  it('mutation (FIX-RUN 2 D1): guard-shape drift alone — any custodyGuard that is not the exact noneIn candidate.tier/demanded.custodyNeverTiers disjointness is REJECTED (op swap, path swap, collectionPath swap)', async () => {
    const { engine } = await buildWorld();
    const pinned = { op: 'noneIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' };
    const drifts = [
      { op: 'allIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' },
      { op: 'noneIn', path: 'candidate.referentLevel', collectionPath: 'demanded.custodyNeverTiers' },
      { op: 'noneIn', path: 'candidate.tier', collectionPath: 'demanded.identityOnlyTiers' },
    ];
    for (const guard of drifts) {
      const doc = await shippedData();
      const policies = doc['policies'] as Array<Record<string, unknown>>;
      const bindPolicy = policies.find((p) => p['verdict'] === 'authorized-to-bind')!;
      bindPolicy['custodyGuard'] = guard;
      expect(lintViolations(engine, doc)).toContain('material-eligibility-bind-custody-guard-shape-pinned');
    }
    // The pinned shape itself stays clean.
    const doc = await shippedData();
    const policies = doc['policies'] as Array<Record<string, unknown>>;
    const bindPolicy = policies.find((p) => p['verdict'] === 'authorized-to-bind')!;
    bindPolicy['custodyGuard'] = pinned;
    expect(lintViolations(engine, doc)).toEqual([]);
  });

  it('mutation (FIX-RUN 2 D1): the widened E8 reaches deeper than cycle-1 and covers the non-allIn membership form — a depth-5 allIn-custody leak and an `in`+valuesPath custody leak (with the PINNED guard intact) are both REJECTED', async () => {
    const { engine } = await buildWorld();
    const forbidden = 'material-eligibility-bind-asserts-never-membership-on-custody-collections';
    const bindAt = async (assert: unknown) => {
      const doc = await shippedData();
      const policies = doc['policies'] as Array<Record<string, unknown>>;
      const bindPolicy = policies.find((p) => p['verdict'] === 'authorized-to-bind')!;
      bindPolicy['assert'] = assert;
      return lintViolations(engine, doc);
    };
    const deepLeak = { op: 'all', predicates: [{ op: 'all', predicates: [{ op: 'all', predicates: [{ op: 'all', predicates: [{ op: 'all', predicates: [{ op: 'allIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' }] }] }] }] }] };
    expect(await bindAt(deepLeak)).toContain(forbidden);
    expect(await bindAt({ op: 'in', path: 'candidate.tier', values: [1], valuesPath: 'demanded.custodyNeverTiers' })).toContain(forbidden);
    expect(await bindAt({ op: 'all', predicates: [{ op: 'any', predicates: [{ op: 'all', predicates: [{ op: 'in', path: 'candidate.tier', values: [1], valuesPath: 'demanded.identityOnlyTiers' }] }] }] })).toContain(forbidden);
    // Reversed operands: allIn demanded.custodyNeverTiers X asserts every
    // custody-never tier satisfies X — the same forbidden positive-evidence claim.
    expect(await bindAt({ op: 'allIn', path: 'demanded.custodyNeverTiers', collectionPath: 'candidate.tier' })).toContain(forbidden);
    expect(await bindAt({ op: 'all', predicates: [{ op: 'all', predicates: [{ op: 'all', predicates: [{ op: 'allIn', path: 'demanded.identityOnlyTiers', collectionPath: 'candidate.referentLevel' }] }] }] })).toContain(forbidden);
  });

  it('no over-rejection (FIX-RUN 2 D1): the pinned noneIn disjointness stays legal in a BIND assert, and legitimate DISPLAY-policy membership on the custody collections stays legal at depth 2 (reviewer probes G/H shapes)', async () => {
    const { engine } = await buildWorld();
    const doc = await shippedData();
    const policies = doc['policies'] as Array<Record<string, unknown>>;
    const bindPolicy = policies.find((p) => p['verdict'] === 'authorized-to-bind')!;
    bindPolicy['assert'] = {
      op: 'all',
      predicates: [
        { op: 'allIn', path: 'candidate.referentLevel', collectionPath: 'demanded.demandedLevelSet' },
        { op: 'noneIn', path: 'candidate.tier', collectionPath: 'demanded.identityOnlyTiers' },
        { op: 'noneIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' },
      ],
    };
    const displayPolicy = policies.find((p) => p['id'] === 'display-tier-legal')!;
    displayPolicy['assert'] = { op: 'all', predicates: [{ op: 'allIn', path: 'candidate.tier', collectionPath: 'demanded.custodyNeverTiers' }] };
    expect(lintViolations(engine, doc)).toEqual([]);
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

  it('mutation (FIX-RUN 1 D2): an identityRolePolicies member that names NO declared policy id fails with the NAMED rule', async () => {
    const { engine } = await buildWorld();
    const doc = await shippedData();
    (doc['identityRolePolicies'] as string[]).push('policy-that-does-not-exist');
    expect(lintViolations(engine, doc)).toContain('material-eligibility-identity-role-policies-declared');
  });

  it('single-source (FIX-RUN 1 D2, never two local terms for one value): the shipped data declares the role value ONCE (identityRole) and carries NO per-policy role literal', async () => {
    const doc = await shippedData();
    const policies = doc['policies'] as Array<Record<string, unknown>>;
    expect(policies.some((p) => 'role' in p)).toBe(false);
    const roleDeclarations = JSON.stringify(doc).match(/catalog-identity/g) ?? [];
    expect(roleDeclarations).toHaveLength(1);
    // The role targets are ID references pinned by lint E11, not literals.
    expect(doc['identityRolePolicies']).toEqual(['display-identity-only-role', 'bind-accepted-identity-reference']);
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

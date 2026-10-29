/**
 * GC-13 (leg A — RED) — evidence.lint.yaml required-context floor, loaded from
 * the REAL spec file through the house LintEngine (the same file the server
 * loads at startup via LintSpecLoader), plus the lint-v1 meta-schema contract.
 *
 * Rules under test (declared in schema/knowledge/evidence.lint.yaml;
 * severity error, so the RecordStoreImpl create path rejects lint-invalid —
 * the required-context floor blocks create, not just warns):
 *
 *  - evd-supports-target-shape:
 *      when any of supports/refutes/assesses is present, EVERY target ref's
 *      record type is `assertion` or `claim`. (everyItem over the projected
 *      type set + `in` — no DSL extension.)
 *  - evd-sources-need-context-arm:
 *      when the bundle takes a stance (anyOf supports/refutes/assesses),
 *      sources[] must contain >= 1 entry of type `context` OR
 *      `measurement_context` — the WHY arm (context-is-everything).
 *      EXPR: `not(everyItem(sources[*].type in [result,file,event,publication,
 *      event_graph]))` — the existential floor of the shipped v1 DSL
 *      (everyItem is universal-only; the empty-sources vacuity is already
 *      caught by the schema's sources minItems:1).
 *
 * assertion.lint.yaml floor (same leg):
 *  - asn-scoped-assertion-needs-context:
 *      scope != global -> context_refs nonEmpty. The >=2 floor for
 *      comparison/series is NOT expressible in the v1 DSL (no array-length
 *      compare) and is recorded as INTENT in the lint file, not faked.
 *
 * OQ-1 ruling: source-type mapping is adopted (artifact->result,
 * DREF->file) — NO enum widening, so a `result`-typed source is the analysis
 * artifact itself and the context arm is the separate requirement.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from './LintEngine.js';
import { loadAllLintSpecs } from './LintSpecLoader.js';
import type { LintSpec } from './types.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';

const SCHEMA_DIR = fileURLToPath(new URL('../../../schema', import.meta.url));
const KNOWLEDGE = join(SCHEMA_DIR, 'knowledge');

const EVIDENCE = 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml';
const ASSERTION = 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml';
/** Record ref to a knowledge record (the ref datatype's record arm: kind+id+type). */
function recordRef(id: string, type: string): Record<string, unknown> {
  return { kind: 'record', id, type };
}

/** A complete, stance-bearing bundle: a result-typed source (the analysis
 *  artifact, OQ-1 mapping) + a context-typed source (the WHY arm). */
function completeBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'evidence',
    id: 'EVD-TEST-GC13',
    title: 'GC-13 complete evidence bundle (test)',
    supports: [recordRef('ASN-TEST-GC13', 'assertion')],
    sources: [
      { type: 'result', ref: recordRef('AOUT-000020', 'analysis-output-artifact') },
      { type: 'context', ref: recordRef('CTX-TEST-GC13', 'context') },
    ],
    ...overrides,
  };
}

/** A supports-bundle with a result source but NO context-typed source —
 *  the missing-context case that MUST come back lint-invalid. */
function contextlessBundle(): Record<string, unknown> {
  return completeBundle({
    id: 'EVD-TEST-GC13-NONETX',
    sources: [
      { type: 'result', ref: recordRef('AOUT-000020', 'analysis-output-artifact') },
      { type: 'file', ref: recordRef('DREF-TEST-GC13', 'data-reference') },
    ],
  });
}

function loadSpecByName(name: string): LintSpec {
  return {
    lintVersion: 1,
    schemaId: EVIDENCE,
    rules: [] as LintSpec['rules'],
    ...parseYaml(readFileSync(join(KNOWLEDGE, `${name}.lint.yaml`), 'utf-8')) as LintSpec,
  };
}

describe('evidence lint floor (real schema/knowledge/evidence.lint.yaml)', () => {
  let engine: LintEngine;

  beforeAll(() => {
    engine = new LintEngine();
    engine.addSpec('evidence', loadSpecByName('evidence'));
  });

  it('a supports-bundle missing a context-typed source is lint-invalid with the named rule id', () => {
    const r = engine.lint(contextlessBundle(), EVIDENCE);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'evd-sources-need-context-arm');
    expect(v, 'expected the context-arm violation').toBeDefined();
    expect(v?.severity).toBe('error');
    // the message names the bundle (interpolation of the declared paths)
    expect(v?.message).toContain('EVD-TEST-GC13-NONETX');
  });

  it('the named rule is declared severity error (create-blocking), not warning', () => {
    const rule = engine.getRule('evd-sources-need-context-arm');
    expect(rule, 'rule evd-sources-need-context-arm must exist in the loaded spec').toBeDefined();
    expect(rule?.severity).toBe('error');
  });

  it('a measurement_context-typed source satisfies the context arm', () => {
    const r = engine.lint(
      completeBundle({
        sources: [
          { type: 'result', ref: recordRef('AOUT-000020', 'analysis-output-artifact') },
          { type: 'measurement_context', ref: recordRef('MCTX-TEST-GC13', 'measurement-context') },
        ],
      }),
      EVIDENCE,
    );
    expect(r.valid).toBe(true);
  });

  it('a refutes-only bundle still needs the context arm', () => {
    const r = engine.lint(
      completeBundle({
        id: 'EVD-TEST-GC13-REF',
        supports: undefined,
        refutes: [recordRef('ASN-TEST-GC13', 'assertion')],
        sources: [
          { type: 'result', ref: recordRef('AOUT-000020', 'analysis-output-artifact') },
          { type: 'file', ref: recordRef('DREF-TEST-GC13', 'data-reference') },
        ],
      }),
      EVIDENCE,
    );
    expect(r.valid).toBe(false);
    expect(r.violations.some((x) => x.ruleId === 'evd-sources-need-context-arm')).toBe(true);
  });

  it('an assesses-only bundle with the context arm is lint-clean', () => {
    const r = engine.lint(
      completeBundle({
        id: 'EVD-TEST-GC13-ASSESS',
        supports: undefined,
        assesses: [recordRef('ASN-TEST-GC13', 'assertion')],
      }),
      EVIDENCE,
    );
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('every target ref must be an assertion or claim (target-shape rule applied)', () => {
    const r = engine.lint(
      completeBundle({
        id: 'EVD-TEST-GC13-BADTGT',
        supports: [recordRef('MISC-TEST-GC13', 'context')],
      }),
      EVIDENCE,
    );
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'evd-supports-target-shape');
    expect(v, 'expected the target-shape violation').toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('targets may also be claims (claim refs are legal targets)', () => {
    const r = engine.lint(
      completeBundle({
        id: 'EVD-TEST-GC13-CLM',
        supports: [recordRef('CLM-TEST-GC13', 'claim')],
      }),
      EVIDENCE,
    );
    expect(r.valid).toBe(true);
  });

  it('a complete bundle is lint-clean (the GREEN arm)', () => {
    const r = engine.lint(completeBundle(), EVIDENCE);
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('the loaded spec comes from the real file (schemaId + rules present)', () => {
    const spec = loadSpecByName('evidence');
    expect(spec.schemaId).toBe(EVIDENCE);
    expect(spec.rules.length).toBeGreaterThanOrEqual(2);
    const ids = spec.rules.map((x) => x.id).sort();
    expect(ids).toContain('evd-supports-target-shape');
    expect(ids).toContain('evd-sources-need-context-arm');
  });
});

describe('assertion lint floor (real schema/knowledge/assertion.lint.yaml)', () => {
  let engine: LintEngine;

  beforeAll(() => {
    engine = new LintEngine();
    engine.addSpec('assertion', parseYaml(readFileSync(join(KNOWLEDGE, 'assertion.lint.yaml'), 'utf-8')) as LintSpec);
  });

  const asn = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    kind: 'assertion',
    id: 'ASN-TEST-GC13',
    scope: 'single_context',
    context_refs: [recordRef('CTX-TEST-GC13', 'context')],
    ...overrides,
  });

  it('a scoped assertion without context_refs is lint-invalid (named rule id)', () => {
    const r = engine.lint(asn({ context_refs: undefined }), ASSERTION);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'asn-scoped-assertion-needs-context');
    expect(v, 'expected the context requirement violation').toBeDefined();
    expect(v?.severity).toBe('error');
  });

  it('a global-scoped assertion with no context_refs is lint-clean', () => {
    const r = engine.lint(asn({ scope: 'global', context_refs: undefined }), ASSERTION);
    expect(r.valid).toBe(true);
  });

  it('a scoped assertion with context_refs is lint-clean', () => {
    const r = engine.lint(asn(), ASSERTION);
    expect(r.valid).toBe(true);
  });

  it('the named rule is declared severity error (create-blocking)', () => {
    const rule = engine.getRule('asn-scoped-assertion-needs-context');
    expect(rule, 'rule asn-scoped-assertion-needs-context must exist').toBeDefined();
    expect(rule?.severity).toBe('error');
  });
});

/**
 * NOTE on the lint-v1 meta-schema: the meta-schema's top-level object allows
 * ONLY lintVersion/global/rules, while every shipped *.lint.yaml file in this
 * repo carries a file-level `schemaId` (the LintEngine's spec-scoping field —
 * see LintEngine.addSpec, which merges spec.schemaId into each rule). The
 * meta-schema therefore does not describe the shipped files as-is; the
 * loader's structural contract (lintVersion + rules array) is the real
 * boundary, exercised below. Not a GC-13 defect to fix (no meta-schema edit
 * is in scope — would be a repo-wide change).
 */

describe('lint spec loader boundary (the file the server loads at startup)', () => {
  it('loadAllLintSpecs picks up evidence + assertion with zero loader errors', async () => {
    const result = await loadAllLintSpecs({ basePath: KNOWLEDGE, recursive: false });
    expect(result.errors.map((e) => `${e.path}: ${e.error}`)).toEqual([]);
    const names = result.specs.map((s) => s.name).sort();
    expect(names).toContain('evidence');
    expect(names).toContain('assertion');
    const ev = result.specs.find((s) => s.name === 'evidence')!;
    expect(ev.spec.rules.map((r) => r.id)).toEqual(
      expect.arrayContaining(['evd-supports-target-shape', 'evd-sources-need-context-arm']),
    );
  });
});

/**
 * GC-13 FIX1 — the RESULT arm of the source-coverage floor (D5: a stance-
 * bearing bundle needs >= 1 result-typed AND >= 1 context/measurement_
 * context-typed source; the context arm was the only half shipped) and the
 * CREATE-PATH rejection (spec bait #9: severity error AND create refused,
 * not just lint.valid=false — the store's create runs validate-then-lint
 * and refuses lint-invalid with the lint-invalid result shape; the HTTP
 * handler maps that to the 422 'Lint failed' body).
 *
 * The store is the REAL one: LocalRepoAdapter over a tmp dir + the REAL
 * schemas (loadAllSchemas recursive, topological Ajv registration — the
 * RevisionStorage.test.ts house pattern) + a LintEngine carrying the REAL
 * evidence.lint.yaml (the same file LintSpecLoader loads at startup). The
 * context-only bundle (context source, NO result source) MUST be create-
 * refused; the complete bundle (result + context) MUST create.
 */
describe('FIX1 — result-coverage floor + create-path rejection (real store, real spec file)', () => {
  let root: string;
  let store: ReturnType<typeof createRecordStore>;
  let engine: LintEngine;

  const contextOnlyBundle = (): Record<string, unknown> => ({
    kind: 'evidence',
    id: 'EVD-TEST-GC13-FIX1-CTXONLY',
    title: 'context-only bundle (missing the result arm — test fixture)',
    supports: [recordRef('ASN-TEST-GC13', 'assertion')],
    sources: [
      { type: 'context', ref: recordRef('CTX-TEST-GC13', 'context') },
      { type: 'measurement_context', ref: recordRef('MCTX-TEST-GC13', 'measurement-context') },
    ],
  });

  const completeBundleForCreate = (): Record<string, unknown> => ({
    kind: 'evidence',
    id: 'EVD-TEST-GC13-FIX1-COMPLETE',
    title: 'complete bundle (result + context arms — test fixture)',
    supports: [recordRef('ASN-TEST-GC13', 'assertion')],
    sources: [
      { type: 'result', ref: recordRef('AOUT-000020', 'analysis-output-artifact') },
      { type: 'context', ref: recordRef('CTX-TEST-GC13', 'context') },
    ],
  });

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'gc13-fix1-evidence-create-'));
    const loaded = await loadAllSchemas({
      basePath: fileURLToPath(new URL('../../../schema', import.meta.url)),
      recursive: true,
    });
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    const validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema as never, id);
    }
    engine = new LintEngine();
    engine.addSpec('evidence', loadSpecByName('evidence'));
    store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, engine);
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('a stance-bearing bundle with a context source but NO result source is lint-invalid (the result arm, named rule id)', () => {
    const rule = engine.getRule('evd-sources-need-result-arm');
    expect(rule, 'rule evd-sources-need-result-arm must exist in the loaded spec').toBeDefined();
    expect(rule?.severity).toBe('error');
    const r = engine.lint(contextOnlyBundle(), EVIDENCE);
    expect(r.valid).toBe(false);
    const v = r.violations.find((x) => x.ruleId === 'evd-sources-need-result-arm');
    expect(v, 'expected the result-arm violation').toBeDefined();
    expect(v?.severity).toBe('error');
    expect(v?.message).toContain('EVD-TEST-GC13-FIX1-CTXONLY');
  });

  it('a bundle with a result source still needs the context arm (both arms are independent floors)', () => {
    const r = engine.lint(contextlessBundle(), EVIDENCE);
    expect(r.valid).toBe(false);
    const ids = r.violations.map((x) => x.ruleId);
    expect(ids).toContain('evd-sources-need-context-arm');
    expect(ids).not.toContain('evd-sources-need-result-arm');
  });

  it('a stance-bearing bundle with context sources but NO result source is create-REFUSED with the lint-invalid shape and named rule id', async () => {
    const result = await store.create({
      envelope: { recordId: 'EVD-TEST-GC13-FIX1-CTXONLY', schemaId: EVIDENCE, payload: contextOnlyBundle() },
    });
    expect(result.success).toBe(false);
    // the lint-invalid result shape (the handler maps this to the 422
    // 'Lint failed' body): lint present, valid=false, the rule named
    expect(result.lint, 'create must carry the lint result').toBeDefined();
    expect(result.lint?.valid).toBe(false);
    const v = result.lint?.violations.find((x) => x.ruleId === 'evd-sources-need-result-arm');
    expect(v, 'the refused create must name the result-arm rule').toBeDefined();
    expect(v?.severity).toBe('error');
    // and the record does NOT exist (the refusal happened before any write)
    expect(await store.get('EVD-TEST-GC13-FIX1-CTXONLY')).toBeNull();
  });

  it('a complete bundle (result + context arms) creates through the same path (the floor does not over-block)', async () => {
    const result = await store.create({
      envelope: { recordId: 'EVD-TEST-GC13-FIX1-COMPLETE', schemaId: EVIDENCE, payload: completeBundleForCreate() },
    });
    expect(result, JSON.stringify(result)).toMatchObject({ success: true });
    expect(result.lint?.valid).toBe(true);
    const readback = await store.get('EVD-TEST-GC13-FIX1-COMPLETE');
    expect(readback?.recordId).toBe('EVD-TEST-GC13-FIX1-COMPLETE');
    expect((readback?.payload as Record<string, unknown>).kind).toBe('evidence');
  });
});

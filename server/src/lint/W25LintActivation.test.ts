/**
 * W2-5 T7 — lint-data activation proof (spec §6 T7).
 *
 * Harness COPY of server/src/lint/Wave2ConstraintVocabularyRules.test.ts:
 * parse the REAL lint specs from disk (the same files the server loads at
 * startup via LintSpecLoader) into a LintEngine and lint inline payloads
 * directly — no HTTP. Ajv (lint-v1 meta-schema) is the structural authority.
 *
 * Proves:
 *  - extraction-draft.lint.yaml is LIVE (was rules: [] — boot-skipped at
 *    server.ts:410-411): all three xdr-* rules fire with rule ids + instance
 *    paths on violating drafts and stay silent on clean ones.
 *  - extraction-promotion.lint.yaml's additive xpr-output-kind-registered
 *    fires on an unregistered output_kind and passes the promotable kinds.
 *  - lintVersion: 1 + the EXACT schemaId survived activation (bait 12: a
 *    typo'd schemaId silently never binds — LintEngine filters by schemaId).
 *  - the whole merged lint tree still loads with NO duplicate-id throw
 *    (LintEngine.ts:59-61 global) and the activated spec is non-empty, so the
 *    boot skip no longer applies (boot green — proven by T1's real boot).
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from './LintEngine.js';
import { loadAllLintSpecs } from './LintSpecLoader.js';
import { AjvValidator } from '../validation/AjvValidator.js';
import type { LintSpec } from './types.js';

const XDR_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml';
const XPR_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/extraction-promotion.schema.yaml';
const LINT_META_SCHEMA_ID = 'https://computable-lab.com/schema/lint/lint-v1.schema.yaml';

const DRAFT_LINT_PATH = fileURLToPath(new URL('../../../schema/workflow/extraction-draft.lint.yaml', import.meta.url));
const PROMO_LINT_PATH = fileURLToPath(new URL('../../../schema/workflow/extraction-promotion.lint.yaml', import.meta.url));
const LINT_META_SCHEMA_PATH = fileURLToPath(new URL('../../../schema/lint/lint-v1.schema.yaml', import.meta.url));

function loadSpec(path: string): LintSpec {
  const parsed = parseYaml(readFileSync(path, 'utf-8')) as LintSpec;
  if (typeof parsed.lintVersion !== 'number' || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid lint spec: ${path}`);
  }
  return parsed;
}

function draftEngine(): LintEngine {
  const eng = new LintEngine();
  eng.addSpec('extraction-draft', loadSpec(DRAFT_LINT_PATH));
  return eng;
}

function promoEngine(): LintEngine {
  const eng = new LintEngine();
  eng.addSpec('extraction-promotion', loadSpec(PROMO_LINT_PATH));
  return eng;
}

function draft(candidates: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'extraction-draft',
    recordId: 'XDR-w25-t7',
    source_artifact: { kind: 'file', id: 'VPF-w25-t7' },
    candidates,
    status: 'partially_promoted',
    ...extra,
  };
}

describe('W2-5 T7: lint-data activation (xdr-* live, xpr-* additive)', () => {
  it('the activated spec keeps lintVersion: 1 + the EXACT schemaId (bait 12: a typo silently never binds)', () => {
    const spec = loadSpec(DRAFT_LINT_PATH);
    expect(spec.lintVersion).toBe(1);
    expect(spec.schemaId).toBe(XDR_SCHEMA_ID);
    expect(spec.rules.length).toBe(3); // was rules: [] — boot-skipped at server.ts:410-411
    expect(spec.rules.map(r => r.id)).toEqual([
      'xdr-promoted-candidate-anchored',
      'xdr-promote-blocked-by-unresolved',
      'xdr-promote-requires-resolvable-target',
    ]);
  });

  it('xdr-promoted-candidate-anchored FIRES: a promoted candidate with no evidence_span and uncertainty unresolved', async () => {
    const eng = draftEngine();
    const r = await eng.lint(draft([
      { target_kind: 'protocol', draft: { title: 'x' }, confidence: 0.9, status: 'promoted', uncertainty: 'unresolved' },
    ]), XDR_SCHEMA_ID);
    expect(r.valid).toBe(false);
    const v = r.violations.find(x => x.ruleId === 'xdr-promoted-candidate-anchored');
    expect(v, 'rule id must surface').toBeDefined();
    expect(v!.severity).toBe('error');
    expect(v!.message).toContain('XDR-w25-t7'); // instance-naming template
    expect(v!.path ?? '').toContain('candidates'); // instance path
  });

  it('xdr-promoted-candidate-anchored stays SILENT: an anchored promoted candidate, and a pending (non-promoted) one', async () => {
    const eng = draftEngine();
    const r = await eng.lint(draft([
      { target_kind: 'protocol', draft: { title: 'x' }, confidence: 0.9, status: 'promoted', uncertainty: 'unresolved', evidence_span: 'Incubate overnight.' },
      { target_kind: 'protocol', draft: { title: 'y' }, confidence: 0.6 },
    ]), XDR_SCHEMA_ID);
    expect(r.violations.filter(x => x.ruleId === 'xdr-promoted-candidate-anchored')).toEqual([]);
  });

  it('xdr-promote-blocked-by-unresolved FIRES: a promoted candidate carrying ambiguity_spans (runtime-guard twin, now with a code + path)', async () => {
    const eng = draftEngine();
    const r = await eng.lint(draft([
      { target_kind: 'protocol', draft: { title: 'x' }, confidence: 0.5, status: 'promoted', ambiguity_spans: [{ path: 'draft.title', reason: 'unclear' }] },
    ]), XDR_SCHEMA_ID);
    const v = r.violations.find(x => x.ruleId === 'xdr-promote-blocked-by-unresolved');
    expect(v, 'rule id must surface').toBeDefined();
    expect(v!.severity).toBe('error');
    expect(v!.message).toContain('ambiguity');
  });

  it('xdr-promote-blocked-by-unresolved stays SILENT when ambiguity_spans is empty or absent', async () => {
    const eng = draftEngine();
    const r = await eng.lint(draft([
      { target_kind: 'protocol', draft: { title: 'x' }, confidence: 0.9, status: 'promoted', evidence_span: 'e', ambiguity_spans: [] },
      { target_kind: 'protocol', draft: { title: 'y' }, confidence: 0.9, status: 'promoted', evidence_span: 'e' },
    ]), XDR_SCHEMA_ID);
    expect(r.violations.filter(x => x.ruleId === 'xdr-promote-blocked-by-unresolved')).toEqual([]);
  });

  it('xdr-promote-requires-resolvable-target FIRES on an unregistered target_kind (no NEW kind can enter)', async () => {
    const eng = draftEngine();
    const r = await eng.lint(draft([
      { target_kind: 'semantic-protocol-family', draft: { title: 'x' }, confidence: 0.9 },
    ]), XDR_SCHEMA_ID);
    const v = r.violations.find(x => x.ruleId === 'xdr-promote-requires-resolvable-target');
    expect(v, 'rule id must surface').toBeDefined();
    expect(v!.message).toContain('promotable kind');
  });

  it('xdr-promote-requires-resolvable-target passes the declared list (protocol/material-spec/equipment-spec/labware-spec)', async () => {
    const eng = draftEngine();
    const r = await eng.lint(draft(
      ['protocol', 'material-spec', 'equipment-spec', 'labware-spec'].map(k => ({ target_kind: k, draft: { title: 'x' }, confidence: 0.9 })),
    ), XDR_SCHEMA_ID);
    expect(r.violations.filter(x => x.ruleId === 'xdr-promote-requires-resolvable-target')).toEqual([]);
  });

  it('xpr-output-kind-registered (ADDITIVE) FIRES on an unregistered output_kind and passes the promotable kinds', async () => {
    const eng = promoEngine();
    const base = {
      kind: 'extraction-promotion',
      recordId: 'XPR-CAN-protocol-w25-t7-v1',
      source_draft_ref: { kind: 'record', type: 'extraction-draft', id: 'XDR-w25-t7' },
      candidate_path: 'candidates[0]',
      source_artifact_ref: { kind: 'file', id: 'VPF-w25-t7' },
      source_content_hash: 'a'.repeat(64),
      promoted_at: '2026-10-10T00:00:00.000Z',
      version: 1,
      status: 'active',
    };
    const bad = await eng.lint({ ...base, output_kind: 'provenance-rung', output_ref: { kind: 'record', type: 'protocol', id: 'CAN-x' } }, XPR_SCHEMA_ID);
    const v = bad.violations.find(x => x.ruleId === 'xpr-output-kind-registered');
    expect(v, 'rule id must surface').toBeDefined();
    expect(v!.severity).toBe('error');

    const good = await eng.lint({ ...base, output_kind: 'protocol', output_ref: { kind: 'record', type: 'protocol', id: 'CAN-x' } }, XPR_SCHEMA_ID);
    expect(good.violations.filter(x => x.ruleId === 'xpr-output-kind-registered')).toEqual([]);
  });

  it('the whole merged lint tree loads with NO duplicate-id throw (LintEngine.ts:59-61 global) and the activated spec is non-empty (boot skip no longer applies)', async () => {
    const result = await loadAllLintSpecs({ basePath: fileURLToPath(new URL('../../../schema', import.meta.url)) });
    // Pre-existing base condition (NOT W2-5): core/lab-state.lint.yaml carries no
    // rules key at all and the loader flags it; boot tolerates it (T1's real boot
    // is green). Our two W2-5 files must load clean.
    expect(result.errors.filter(e => e.path.startsWith('workflow/'))).toEqual([]);
    const eng = new LintEngine();
    // addSpec throws globally on a duplicate rule id — this call IS the collision test.
    for (const { name, spec } of result.specs) {
      if (spec.rules.length === 0) continue; // the exact boot skip (server.ts:410-411)
      eng.addSpec(name, spec);
    }
    const draftSpec = result.specs.find(s => s.spec.schemaId === XDR_SCHEMA_ID);
    expect(draftSpec, 'extraction-draft.lint.yaml must load').toBeDefined();
    expect(draftSpec!.spec.rules.length).toBeGreaterThan(0); // no longer boot-skipped
    const ids = result.specs.flatMap(s => s.spec.rules.map(r => r.id));
    expect(new Set(ids).size).toBe(ids.length); // globally unique
  });

  it('the ACTIVATED draft spec satisfies the lint-v1 meta-schema (Ajv is the structural authority)', async () => {
    const validator = new AjvValidator();
    const meta = parseYaml(readFileSync(LINT_META_SCHEMA_PATH, 'utf-8')) as Record<string, unknown>;
    validator.addSchema(meta as never, LINT_META_SCHEMA_ID);
    // Projection per the Wave2ConstraintVocabularyRules precedent: the meta
    // schema describes {lintVersion, rules}; schemaId is engine-side binding.
    const draftSpec = parseYaml(readFileSync(DRAFT_LINT_PATH, 'utf-8')) as { lintVersion: number; rules: unknown[] };
    const r = await validator.validate({ lintVersion: draftSpec.lintVersion, rules: draftSpec.rules }, LINT_META_SCHEMA_ID);
    expect(r.errors.map(e => `${e.path} ${e.message}`)).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('DECLARED FINDING (pre-existing, NOT introduced by W2-5): extraction-promotion.lint.yaml does not satisfy the lint-v1 meta-schema at base either', async () => {
    // The five MERGED xpr-* rules use `$.`-rooted paths + static `values`,
    // which the shipped lint-v1 meta oneOf/pattern set rejects. Verified at
    // base (git show HEAD:...) AND with W2-5's additive rule: the failure is
    // a pre-existing drift in a neighbor's file, so W2-5 does not "fix" it
    // here (no silent repair of a neighbor's surface). The engine does not
    // gate on this meta check at boot (LintSpecLoader only shape-checks
    // lintVersion/rules).
    const validator = new AjvValidator();
    const meta = parseYaml(readFileSync(LINT_META_SCHEMA_PATH, 'utf-8')) as Record<string, unknown>;
    validator.addSchema(meta as never, LINT_META_SCHEMA_ID);
    const promoSpec = parseYaml(readFileSync(PROMO_LINT_PATH, 'utf-8')) as { lintVersion: number; rules: unknown[] };
    const r = await validator.validate({ lintVersion: promoSpec.lintVersion, rules: promoSpec.rules }, LINT_META_SCHEMA_ID);
    expect(r.valid).toBe(false);
    // Every error is on a PRE-EXISTING rule (index < 5), never on W2-5's
    // additive rule (index 5) — W2-5's rule shape is meta-clean.
    expect(r.errors.every(e => !e.path.startsWith('/rules/5/'))).toBe(true);
  });
});

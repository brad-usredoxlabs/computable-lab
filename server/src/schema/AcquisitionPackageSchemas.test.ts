/**
 * GC-4: acquisition-package schema triplet + lint over the REAL schema/ directory.
 *
 * Harness mirrors ControlledDocumentSchemas.test.ts: the REAL loader/registry/
 * validator pipeline over the real schema/ directory, so the test exercises
 * exactly what the store enforces. Covers the RED-plan item 2: valid package
 * passes; wrong-kind dataReferenceRef (type: const) rejected; unknown role
 * rejected (enum); files:[] rejected (minItems); unknown top-level key rejected
 * (unevaluatedProperties); directoryKey with `..` rejected at LINT (engine-driven
 * R4); a shape-valid package lints clean; the new kind resolves by $id.
 *
 * NOTE (hardcode boundary, reviewer bait #4): the payload uses a NEUTRAL device
 * id ('nas0'), not the real config device id — the real NAS device id belongs
 * only in the test-written config YAML string of the registration test.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';

const SCHEMA_ID = (name: string) =>
  `https://computable-lab.com/schema/computable-lab/${name}`;

const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../schema',
);
const ACQP_ID = SCHEMA_ID('acquisition-package.schema.yaml');

/** A fully valid acquisition-package payload. */
const validPackage = {
  kind: 'acquisition-package',
  id: 'ACQP-2026-RES35077-4',
  title: 'RES35077-4 acquisition package (signal collection)',
  storageDeviceId: 'nas0',
  directoryKey: 'machine1/RES35077-4.D',
  files: [
    { relativePath: 'FID1A.CH', dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000001' }, role: 'signal_channel' },
    { relativePath: 'SAMPLE.XML', dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000002' }, role: 'sample_metadata' },
    { relativePath: 'RUN.LOG', dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000003' }, role: 'run_log' },
    { relativePath: 'ACQRES.REG', dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000004' }, role: 'uninterpreted' },
  ],
  signalCollectionRef: { kind: 'record', type: 'data-reference', id: 'DREF-000009' },
  lifecycleId: 'registry-ops',
  state: 'draft',
};

describe('acquisition-package schema', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeAll(async () => {
    const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema as never, id);
      }
    }
  });

  it('is registered and the schema loader reports kind acquisition-package', () => {
    const entry = registry.getById(ACQP_ID);
    expect(entry).toBeDefined();
    const schema = entry!.schema as { properties?: { kind?: { const?: string } } };
    expect(schema.properties?.kind?.const).toBe('acquisition-package');
  });

  it('accepts a valid package with all required fields', () => {
    const ok = validator.validate(validPackage, ACQP_ID);
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('accepts a minimal package without the optional lifecycle fields', () => {
    const { lifecycleId: _l, state: _s, ...minimal } = validPackage;
    const ok = validator.validate(minimal, ACQP_ID);
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('rejects an id that does not match ^ACQP-', () => {
    const ok = validator.validate({ ...validPackage, id: 'PKG-2026-1' }, ACQP_ID);
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'pattern' && e.path === '/id')).toBe(true);
  });

  it('rejects a wrong-kind dataReferenceRef (type: const violation)', () => {
    const bad = {
      ...validPackage,
      files: [
        { relativePath: 'FID1A.CH', dataReferenceRef: { kind: 'record', type: 'run', id: 'RUN-1' }, role: 'signal_channel' },
      ],
    };
    const ok = validator.validate(bad, ACQP_ID);
    expect(ok.valid).toBe(false);
  });

  it('rejects an unknown role value (enum)', () => {
    const bad = {
      ...validPackage,
      files: [
        { relativePath: 'FID1A.CH', dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000001' }, role: 'peak' },
      ],
    };
    const ok = validator.validate(bad, ACQP_ID);
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'enum' && e.path === '/files/0/role')).toBe(true);
  });

  it('rejects files: [] (minItems 1)', () => {
    const ok = validator.validate({ ...validPackage, files: [] }, ACQP_ID);
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'minItems' && e.path === '/files')).toBe(true);
  });

  it('rejects an unknown top-level property (unevaluatedProperties: false)', () => {
    const ok = validator.validate({ ...validPackage, notAField: 'nope' }, ACQP_ID);
    expect(ok.valid).toBe(false);
  });

  it('rejects a missing required field (storageDeviceId)', () => {
    const { storageDeviceId: _d, ...without } = validPackage;
    const ok = validator.validate(without, ACQP_ID);
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'required')).toBe(true);
  });
});

describe('acquisition-package lint (R1/R2/R4 over the real engine)', () => {
  let engine: ReturnType<typeof createLintEngine>;

  beforeAll(async () => {
    const result = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
    const bad = result.errors.filter(e => e.path.includes('acquisition-package.lint.yaml'));
    expect(bad).toEqual([]);
    engine = createLintEngine();
    for (const s of result.specs) engine.addSpec(s.name, s.spec);
  });

  it('lints a shape-valid package clean (zero violations)', () => {
    const lintResult = engine.lint(validPackage, ACQP_ID);
    expect(lintResult.violations).toEqual([]);
  });

  it('rejects a directoryKey with .. at LINT (R4 traversal belt)', () => {
    const bad = { ...validPackage, directoryKey: 'machine1/../machine1/RES35077-4.D' };
    const lintResult = engine.lint(bad, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-directory-key-safe')).toBe(true);
  });

  it('rejects a file item with a non-DREF dataReferenceRef.id (R2)', () => {
    const bad = {
      ...validPackage,
      files: [
        { relativePath: 'FID1A.CH', dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'NOT-A-DREF' }, role: 'signal_channel' },
      ],
    };
    const lintResult = engine.lint(bad, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-dref-closure')).toBe(true);
  });

  it('flags an empty files list (R1 warning)', () => {
    const bad = { ...validPackage, files: [] as never[] };
    const lintResult = engine.lint(bad, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-files-declared')).toBe(true);
  });
});

describe('acquisition-package schema — FAME-1 acquisitionStatus + evidence', () => {
  let validator: ReturnType<typeof createValidator>;

  beforeAll(async () => {
    const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema as never, id);
      }
    }
  });

  /** A package whose status was classified completed at registration. */
  const completedWithEvidence = {
    ...validPackage,
    acquisitionStatus: 'completed',
    acquisitionStatusEvidence: {
      ruleset: { id: 'gc-acquisition-status', version: 1, sourceFile: 'config/gc-acquisition-status/log-patterns.yaml' },
      sourceMember: { relativePath: 'RUN.LOG' },
      decode: { encoding: 'utf-16le', bomPresent: true },
      matched: [
        {
          line: 'Method       Method completed                               15:24:43 10/23/26',
          ruleId: 'completed-method-completed',
          lineIndex: 3,
        },
      ],
    },
  };

  /** A package with NO parseable log — the honest floor, reason-named. */
  const unknownNoEvidence = {
    ...validPackage,
    acquisitionStatus: 'unknown',
    acquisitionStatusEvidence: {
      ruleset: { id: 'gc-acquisition-status', version: 1, sourceFile: 'config/gc-acquisition-status/log-patterns.yaml' },
      sourceMember: { relativePath: 'RUN.LOG' },
      decode: { encoding: 'utf-16le', bomPresent: false },
      matched: [],
      noEvidenceReason: 'no-rule-match',
    },
  };

  it('accepts a completed status with its evidence (additive; pre-FAME-1 payloads stay valid)', () => {
    const ok = validator.validate(completedWithEvidence, ACQP_ID);
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('accepts the unknown floor with a named noEvidenceReason', () => {
    const ok = validator.validate(unknownNoEvidence, ACQP_ID);
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('rejects a status outside the four declared words (enum)', () => {
    const ok = validator.validate({ ...validPackage, acquisitionStatus: 'succeeded' }, ACQP_ID);
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'enum' && e.path === '/acquisitionStatus')).toBe(true);
  });

  it('rejects evidence with an undeclared key (evidence unevaluatedProperties: false)', () => {
    const ok = validator.validate({
      ...completedWithEvidence,
      acquisitionStatusEvidence: {
        ...completedWithEvidence.acquisitionStatusEvidence,
        notDeclared: true,
      },
    }, ACQP_ID);
    expect(ok.valid).toBe(false);
  });

  it('rejects a matched line whose ruleId is not the declared id shape', () => {
    const ok = validator.validate({
      ...completedWithEvidence,
      acquisitionStatusEvidence: {
        ...completedWithEvidence.acquisitionStatusEvidence,
        matched: [{ line: 'x', ruleId: 'Not_A_Rule', lineIndex: 0 }],
      },
    }, ACQP_ID);
    expect(ok.valid).toBe(false);
    expect(
      ok.errors?.some(e => e.keyword === 'pattern' && /ruleId/.test(e.path ?? '')),
    ).toBe(true);
  });
});

describe('acquisition-package lint — FAME-1 R5/R6 (record-scope evidence honesty)', () => {
  let engine: ReturnType<typeof createLintEngine>;

  beforeAll(async () => {
    const result = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
    const bad = result.errors.filter(e => e.path.includes('acquisition-package.lint.yaml'));
    expect(bad).toEqual([]);
    engine = createLintEngine();
    for (const s of result.specs) engine.addSpec(s.name, s.spec);
  });

  const evidenceOf = (matched: unknown[], noEvidenceReason?: string) => ({
    ruleset: { id: 'gc-acquisition-status', version: 1, sourceFile: 'config/gc-acquisition-status/log-patterns.yaml' },
    sourceMember: { relativePath: 'RUN.LOG' },
    decode: { encoding: 'utf-16le', bomPresent: true },
    matched,
    ...(noEvidenceReason !== undefined ? { noEvidenceReason } : {}),
  });

  it('R5: an unknown status with NO evidence is a violation (the F2 defect, named)', () => {
    const bad = { ...validPackage, acquisitionStatus: 'unknown' };
    const lintResult = engine.lint(bad, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-status-evidence-honest')).toBe(true);
  });

  it('R5: a completed status without evidence is NOT flagged (the positive case)', () => {
    const pkg = { ...validPackage, acquisitionStatus: 'completed' };
    const lintResult = engine.lint(pkg, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-status-evidence-honest')).toBe(false);
  });

  it('R5: an aborted status WITH a verbatim matched line passes', () => {
    const pkg = {
      ...validPackage,
      acquisitionStatus: 'aborted',
      acquisitionStatusEvidence: evidenceOf([
        { line: 'Method       Method aborted                                 13:19:33 10/23/26', ruleId: 'aborted-method-aborted', lineIndex: 5 },
      ]),
    };
    const lintResult = engine.lint(pkg, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-status-evidence-honest')).toBe(false);
  });

  it('R5: a stopped-by-user status with only a named noEvidenceReason is NOT flagged', () => {
    const pkg = {
      ...validPackage,
      acquisitionStatus: 'stopped-by-user',
      acquisitionStatusEvidence: evidenceOf([], 'log-empty'),
    };
    const lintResult = engine.lint(pkg, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-status-evidence-honest')).toBe(false);
  });

  it('R5: a pre-FAME-1 package (no acquisitionStatus at all) passes vacuously', () => {
    const lintResult = engine.lint(validPackage, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-status-evidence-honest')).toBe(false);
  });

  it('R6: a matched line with a bad ruleId shape is flagged (and nothing else on the record is)', () => {
    const pkg = {
      ...validPackage,
      acquisitionStatus: 'aborted',
      acquisitionStatusEvidence: evidenceOf([
        { line: 'Method       Method aborted                                 13:19:33 10/23/26', ruleId: 'BAD RULE', lineIndex: 5 },
      ]),
    };
    const lintResult = engine.lint(pkg, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-matched-ruleid-shape')).toBe(true);
  });

  it('R6: well-shaped matched lines lint clean', () => {
    const pkg = {
      ...validPackage,
      acquisitionStatus: 'aborted',
      acquisitionStatusEvidence: evidenceOf([
        { line: 'Method       Method aborted                                 13:19:33 10/23/26', ruleId: 'aborted-method-aborted', lineIndex: 5 },
      ]),
    };
    const lintResult = engine.lint(pkg, ACQP_ID);
    expect(lintResult.violations.some(v => v.ruleId === 'acqp-matched-ruleid-shape')).toBe(false);
  });
});

describe('acquisition-package UI spec (D12 promotion fix: section block + array slot)', () => {
  it('loads acquisition-package.ui.yaml with zero spec errors', async () => {
    const loader = createUISpecLoader();
    const result = await loadAllUISpecs(loader, SCHEMA_DIR);
    const mine = result.errors.filter(e => e.path.includes('acquisition-package.ui.yaml'));
    expect(mine).toEqual([]);
    expect(loader.has(ACQP_ID)).toBe(true);
  });

  it('declares a SECTION block claiming an ARRAY slot ($.files) — not a repeater', async () => {
    const loader = createUISpecLoader();
    const uiPath = join(SCHEMA_DIR, 'knowledge', 'acquisition-package.ui.yaml');
    const content = await readFile(uiPath, 'utf-8');
    const res = loader.load(content, uiPath);
    expect(res.success).toBe(true);
    const spec = res.spec!;
    expect(spec.editor).toBeDefined();
    expect(spec.editor!.mode).toBe('document');
    // The files list is a section block claiming an array slot (the GC-2
    // browser-gate lesson: a kind:repeater block renders nothing).
    const filesBlock = spec.editor!.blocks.find(b => b.id === 'files');
    expect(filesBlock).toBeDefined();
    expect(filesBlock!.kind).toBe('section');
    expect(filesBlock!.slots).toEqual(['files-slot']);
    // The slot carries a `properties` sub-field list (documentMapper.ts:228
    // array-schema projection). `properties` is not on the server EditorSlot
    // type (it rides on the raw spec object), so read it through a typed view.
    const filesSlot = spec.editor!.slots.find(s => s.path === '$.files') as
      | { widget?: string; properties?: Array<{ name: string; widget: string; label: string }> }
      | undefined;
    expect(filesSlot).toBeDefined();
    expect(filesSlot!.widget).toBe('array');
    expect(filesSlot!.properties?.map(p => p.name)).toEqual(['relativePath', 'role', 'dataReferenceRef']);
    // Every label is a FULL WORD.
    expect(spec.editor!.slots.find(s => s.path === '$.storageDeviceId')?.label).toBe('Storage Device Id');
    expect(spec.editor!.slots.find(s => s.path === '$.directoryKey')?.label).toBe('Directory Key');
    expect(spec.editor!.slots.find(s => s.path === '$.signalCollectionRef')?.label).toBe('Signal Collection Ref');
  });

  it('FAME-1: declares the acquisition-status section (status slot + evidence slot) and a list column', async () => {
    const loader = createUISpecLoader();
    const uiPath = join(SCHEMA_DIR, 'knowledge', 'acquisition-package.ui.yaml');
    const content = await readFile(uiPath, 'utf-8');
    const res = loader.load(content, uiPath);
    expect(res.success).toBe(true);
    const spec = res.spec!;
    // The section block claims BOTH slots (the status word + the evidence view).
    const statusBlock = spec.editor!.blocks.find(b => b.id === 'acquisition-status');
    expect(statusBlock).toBeDefined();
    expect(statusBlock!.kind).toBe('section');
    expect(statusBlock!.slots).toEqual([
      'acquisition-status-slot',
      'acquisition-status-evidence-slot',
    ]);
    // The status slot is a READ-ONLY select over the four declared words.
    const statusSlot = spec.editor!.slots.find(s => s.path === '$.acquisitionStatus') as
      | { widget?: string; readonly?: boolean; options?: Array<{ value: string; label: string }> }
      | undefined;
    expect(statusSlot).toBeDefined();
    expect(statusSlot!.widget).toBe('select');
    expect(statusSlot!.readonly).toBe(true);
    expect(statusSlot!.options?.map(o => o.value)).toEqual([
      'completed',
      'aborted',
      'stopped-by-user',
      'unknown',
    ]);
    // The evidence slot is a read-only OBJECT view with a properties hint
    // (interpretation source, member, decode facts, matched lines).
    const evidenceSlot = spec.editor!.slots.find(s => s.path === '$.acquisitionStatusEvidence') as
      | { widget?: string; readonly?: boolean; properties?: Array<{ name: string; widget: string }> }
      | undefined;
    expect(evidenceSlot).toBeDefined();
    expect(evidenceSlot!.widget).toBe('object');
    expect(evidenceSlot!.readonly).toBe(true);
    expect(evidenceSlot!.properties?.some(p => p.name === 'matched')).toBe(true);
    expect(evidenceSlot!.properties?.some(p => p.name === 'ruleset')).toBe(true);
    // The list surface carries the status column (the package list shows the
    // classification at a glance).
    const statusColumn = (spec.list?.columns as Array<{ path?: string }> | undefined)?.find(
      c => c.path === '$.acquisitionStatus',
    );
    expect(statusColumn).toBeDefined();
  });
});

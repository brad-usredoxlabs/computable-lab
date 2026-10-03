/**
 * QMS-2: controlled-document schema triplet + training-record widening +
 * calibration-record.ui.yaml.
 *
 * Harness mirrors governanceSchemas.test.ts: the REAL loader/registry/validator
 * pipeline over the real schema/ directory, so the test exercises exactly what
 * the store enforces.
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
import { projectRecord } from '../ui/EditorProjectionService.js';
import { getValueAtPath, setValueAtPath } from '../ui/FormBuilder.js';
import { extractRoleAssignments } from '../lifecycle/lifecycleMiddleware.js';

const SCHEMA_ID = (name: string) =>
  `https://computable-lab.com/schema/computable-lab/${name}`;

const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../schema',
);
const UI_PATH = (name: string) => join(SCHEMA_DIR, 'lab', name);

/** A fully valid draft controlled-document payload. */
const validDraft = {
  kind: 'controlled-document',
  id: 'DOC-TEST-SOP',
  title: 'GC-FID standard injection SOP',
  state: 'draft',
  lifecycleId: 'document-controlled-signing',
  docType: 'sop',
  body: '<p>Purge the injector for 30 seconds, then inject <em>1 µL</em>.</p>',
  revision: 'Rev A',
  authorRef: { kind: 'record', type: 'user', id: 'USR-AUTHOR', label: 'Author' },
};

describe('controlled-document schema', () => {
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

  it('is registered and the schema loader reports kind controlled-document', () => {
    const entry = registry.getById(SCHEMA_ID('controlled-document.schema.yaml'));
    expect(entry).toBeDefined();
    const schema = entry!.schema as { properties?: { kind?: { const?: string } } };
    expect(schema.properties?.kind?.const).toBe('controlled-document');
  });

  it('accepts a valid draft with all required fields', () => {
    const ok = validator.validate(validDraft, SCHEMA_ID('controlled-document.schema.yaml'));
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('accepts a document with reviewer and approver refs', () => {
    const ok = validator.validate(
      {
        ...validDraft,
        state: 'in_review',
        reviewerRef: { kind: 'record', type: 'user', id: 'USR-REVIEWER' },
      },
      SCHEMA_ID('controlled-document.schema.yaml'),
    );
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('rejects a wrong lifecycleId', () => {
    const ok = validator.validate(
      { ...validDraft, lifecycleId: 'document-control' },
      SCHEMA_ID('controlled-document.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.path === '/lifecycleId')).toBe(true);
  });

  it('rejects an absent lifecycleId', () => {
    const { lifecycleId: _l, ...without } = validDraft;
    const ok = validator.validate(without, SCHEMA_ID('controlled-document.schema.yaml'));
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'required')).toBe(true);
  });

  it('rejects a state outside the lifecycle six-state enum', () => {
    const ok = validator.validate(
      { ...validDraft, state: 'published' },
      SCHEMA_ID('controlled-document.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'enum' && e.path === '/state')).toBe(true);
  });

  it('accepts each of the six lifecycle states', () => {
    for (const state of ['draft', 'in_review', 'approved', 'effective', 'superseded', 'archived']) {
      const ok = validator.validate(
        { ...validDraft, state },
        SCHEMA_ID('controlled-document.schema.yaml'),
      );
      expect(ok.errors ?? []).toEqual([]);
    }
  });

  it('rejects a docType outside the controlled enum', () => {
    const ok = validator.validate(
      { ...validDraft, docType: 'standard-operating-procedure' },
      SCHEMA_ID('controlled-document.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'enum' && e.path === '/docType')).toBe(true);
  });

  it('rejects an id that does not match ^DOC-', () => {
    const ok = validator.validate(
      { ...validDraft, id: 'SOP-TEST-1' },
      SCHEMA_ID('controlled-document.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
    expect(ok.errors?.some(e => e.keyword === 'pattern' && e.path === '/id')).toBe(true);
  });

  it('rejects a PER-* id in a lifecycle-identity role ref (USR-* only, QMS-1 (e))', () => {
    const ok = validator.validate(
      { ...validDraft, authorRef: { kind: 'record', type: 'user', id: 'PER-SOMEONE' } },
      SCHEMA_ID('controlled-document.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
  });

  it('rejects unknown top-level properties (unevaluatedProperties: false)', () => {
    const ok = validator.validate(
      { ...validDraft, notAField: 'nope' },
      SCHEMA_ID('controlled-document.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
  });

  it('role refs feed lifecycle roleAssignments with their USR-* ids', () => {
    const assignments = extractRoleAssignments({
      ...validDraft,
      reviewerRef: { kind: 'record', type: 'user', id: 'USR-REVIEWER' },
    });
    expect(assignments.author).toBe('USR-AUTHOR');
    expect(assignments.reviewer).toBe('USR-REVIEWER');
  });

  // --- lint -----------------------------------------------------------------

  it('loads through the lint engine with zero load errors and a clean lint run', async () => {
    const result = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
    const bad = result.errors.filter(e => e.path.includes('controlled-document.lint.yaml'));
    expect(bad).toEqual([]);

    const spec = result.specs.find(s => s.spec.schemaId === SCHEMA_ID('controlled-document.schema.yaml'));
    expect(spec).toBeDefined();

    const engine = createLintEngine();
    for (const s of result.specs) engine.addSpec(s.name, s.spec);
    const lintResult = engine.lint(validDraft, SCHEMA_ID('controlled-document.schema.yaml'));
    expect(lintResult.violations).toEqual([]);
  });

  // --- training-record widening (QMS-1 (g')) ---------------------------------

  const baseTrainingRecord = {
    kind: 'training-record',
    id: 'TRR-TEST-1',
    personRef: { kind: 'record', type: 'person', id: 'PER-TEST-1' },
    status: 'passed',
    completedAt: '2026-10-03T00:00:00.000Z',
  };

  it('training-record with trainingMaterialRef -> controlled-document now validates', () => {
    const ok = validator.validate(
      {
        ...baseTrainingRecord,
        trainingMaterialRef: { kind: 'record', type: 'controlled-document', id: 'DOC-TEST-SOP' },
      },
      SCHEMA_ID('training-record.schema.yaml'),
    );
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('training-record with trainingMaterialRef -> training-material still validates (additive widening)', () => {
    const ok = validator.validate(
      {
        ...baseTrainingRecord,
        trainingMaterialRef: { kind: 'record', type: 'training-material', id: 'TRAINMAT-TEST-1' },
      },
      SCHEMA_ID('training-record.schema.yaml'),
    );
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });

  it('training-record with an unrelated ref type is still rejected', () => {
    const ok = validator.validate(
      {
        ...baseTrainingRecord,
        trainingMaterialRef: { kind: 'record', type: 'equipment', id: 'EQ-TEST-1' },
      },
      SCHEMA_ID('training-record.schema.yaml'),
    );
    expect(ok.valid).toBe(false);
  });
});

describe('controlled-document / calibration-record UI specs', () => {
  it('UISpecLoader loads controlled-document.ui.yaml, calibration-record.ui.yaml with zero spec errors', async () => {
    const loader = createUISpecLoader();
    const result = await loadAllUISpecs(loader, SCHEMA_DIR);
    // Baseline drift: several PRE-EXISTING ui.yaml files fail loader validation
    // repo-wide; assert none of MY files are in the error list.
    const mine = result.errors.filter(
      e => e.path.includes('controlled-document.ui.yaml') || e.path.includes('calibration-record.ui.yaml'),
    );
    expect(mine).toEqual([]);
    expect(loader.has(SCHEMA_ID('controlled-document.schema.yaml'))).toBe(true);
    expect(loader.has(SCHEMA_ID('calibration-record.schema.yaml'))).toBe(true);
  });

  it('controlled-document.ui.yaml declares an editor block with the body slot on the markdown widget', async () => {
    const loader = createUISpecLoader();
    const content = await readFile(UI_PATH('controlled-document.ui.yaml'), 'utf-8');
    const res = loader.load(content, UI_PATH('controlled-document.ui.yaml'));
    expect(res.success).toBe(true);
    const spec = res.spec!;
    expect(spec.editor).toBeDefined();
    expect(spec.editor!.mode).toBe('document');
    const bodySlot = spec.editor!.slots.find(s => s.path === '$.body');
    expect(bodySlot).toBeDefined();
    expect(bodySlot!.widget).toBe('markdown');
    // State/lifecycleId must not be editable rows (read-only display allowed).
    const stateSlot = spec.editor!.slots.find(s => s.path === '$.state');
    expect(stateSlot === undefined || stateSlot.widget === 'readonly').toBe(true);
    expect(spec.editor!.slots.some(s => s.path === '$.lifecycleId')).toBe(false);
    // Ref slots target users (USR-* lifecycle-identity currency).
    for (const p of ['$.authorRef', '$.reviewerRef', '$.approverRef']) {
      const slot = spec.editor!.slots.find(s => s.path === p);
      expect(slot, `slot ${p}`).toBeDefined();
      expect(slot!.widget).toBe('ref');
      expect(slot!.refKind).toBe('user');
    }
  });

  it('projectRecord returns body as an editable slot with NO UNSUPPORTED_WIDGET diagnostic (QMS-1 (a))', async () => {
    const loader = createUISpecLoader();
    const content = await readFile(UI_PATH('controlled-document.ui.yaml'), 'utf-8');
    const res = loader.load(content, UI_PATH('controlled-document.ui.yaml'));
    const projection = projectRecord(
      res.spec!,
      validDraft as Record<string, unknown>,
      SCHEMA_ID('controlled-document.schema.yaml'),
      'DOC-TEST-SOP',
    );
    const bodySlot = projection.slots.find(s => s.path === '$.body');
    expect(bodySlot).toBeDefined();
    expect(bodySlot!.widget).toBe('markdown');
    expect(bodySlot!.readOnly).toBe(false);
    expect(
      projection.diagnostics.filter(d => d.code === 'UNSUPPORTED_WIDGET'),
    ).toEqual([]);
    expect(
      projection.diagnostics.filter(d => d.code === 'EDITOR_CONFIG_MISSING'),
    ).toEqual([]);
  });

  it('calibration-record.ui.yaml covers the schema fields as form widgets', async () => {
    const loader = createUISpecLoader();
    const content = await readFile(UI_PATH('calibration-record.ui.yaml'), 'utf-8');
    const res = loader.load(content, UI_PATH('calibration-record.ui.yaml'));
    expect(res.success).toBe(true);
    const spec = res.spec!;
    expect(spec.form).toBeDefined();
    const paths = spec.form!.sections.flatMap(s => s.fields.map(f => f.path));
    for (const p of ['$.equipmentRef', '$.performedAt', '$.dueAt', '$.status', '$.performedByRef', '$.notes']) {
      expect(paths, p).toContain(p);
    }
    const status = spec.form!.sections.flatMap(s => s.fields).find(f => f.path === '$.status');
    expect(status!.widget).toBe('select');
    expect(status!.options?.map(o => String(o.value)).sort()).toEqual(
      ['adjusted', 'fail', 'limited_use', 'pass'],
    );
    const equipRef = spec.form!.sections.flatMap(s => s.fields).find(f => f.path === '$.equipmentRef');
    expect(equipRef!.refKind).toBe('equipment');
  });
});

describe('controlled-document payload round-trip through the projection pipeline', () => {
  it('every editor slot path survives get/set round-trip preserving the html body string', async () => {
    const loader = createUISpecLoader();
    const content = await readFile(UI_PATH('controlled-document.ui.yaml'), 'utf-8');
    const res = loader.load(content, UI_PATH('controlled-document.ui.yaml'));
    const spec = res.spec!;

    // Simulate the client loop: read each slot path out of the payload
    // (getValueAtPath, as documentMapper/serializer do), write them back into
    // an empty payload (setValueAtPath), and require equality.
    const slotPaths = (spec.editor?.slots ?? []).map(s => s.path);
    expect(slotPaths.length).toBeGreaterThan(0);

    // Simulate the client loop: fields not present on any slot (state,
    // lifecycleId — intentionally non-editable) are carried untouched, exactly
    // as the edit surface carries the rest of the payload; each slot path is
    // read out of the payload (getValueAtPath, as documentMapper/serializer
    // do) and written back (setValueAtPath). Require equality.
    const slotSuffixes = slotPaths.map(p => p.replace(/^\$\.?/, ''));
    const carried: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(validDraft)) {
      if (!slotSuffixes.includes(k)) carried[k] = v;
    }

    let rebuilt: Record<string, unknown> = { ...carried };
    for (const path of slotPaths) {
      const value = getValueAtPath(validDraft as Record<string, unknown>, path.replace(/^\$\.?/, ''));
      if (value !== undefined) {
        rebuilt = setValueAtPath(rebuilt, path.replace(/^\$\.?/, ''), value);
      }
    }

    // The html body string must survive byte-for-byte.
    expect(rebuilt.body).toBe(validDraft.body);
    expect(rebuilt.id).toBe(validDraft.id);
    expect(rebuilt.title).toBe(validDraft.title);
    expect(rebuilt.docType).toBe(validDraft.docType);
    expect(rebuilt.revision).toBe(validDraft.revision);
    expect(rebuilt.authorRef).toEqual(validDraft.authorRef);

    // And the rebuilt payload must still pass schema validation.
    const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    const validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema as never, id);
    }
    const ok = validator.validate(rebuilt, SCHEMA_ID('controlled-document.schema.yaml'));
    expect(ok.errors ?? []).toEqual([]);
    expect(ok.valid).toBe(true);
  });
});

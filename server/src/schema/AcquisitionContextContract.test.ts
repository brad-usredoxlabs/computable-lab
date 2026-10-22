/**
 * INSTR-COLLAPSE-1 C1 — the acquisition-context contract AS DECLARED DATA.
 *
 * RED-first suite (spec 2026-10-22_INSTR-COLLAPSE-1-contract-as-data-spec.md,
 * "The acquisition-context contract AS DECLARED DATA" table + verified-by (1)/(2)).
 *
 * What this pins, mechanically:
 *  - measurement.equipmentRef is the physical-source slot and its ref TARGET is
 *    pinned to `type: const equipment` (schema floor, spec H3). A non-equipment
 *    ref (kind instrument, kind instrument-definition, or a bare untyped ref)
 *    is REJECTED by Ajv — "any ref" is not an accepted end state (memo §5).
 *  - measurement-context.equipment_ref replaces instrument_ref (required) with
 *    the same target pin; the retired key is refused (clean break, H9).
 *  - measurement-context.acquisition_context hosts the QMS-at-acquisition slot
 *    (calibration_refs / authorization_refs / note) with additionalProperties:false
 *    so smugglers cannot park facts outside the declared shape.
 *  - data-reference.acquisitionContext.equipment_ref replaces the free
 *    `instrument` string with a ref.schema.yaml host (revisionRef legal on it).
 *  - equipment-class gains the ontology `class` CURIE array migrated verbatim in
 *    shape from instrument.schema.yaml (ruling: "the current instrument.schema.yaml
 *    class field migrates there"); the EQC-QUANTSTUDIO5 seed carries a real
 *    measuring-device CURIE so the derived UI view (C5) has data to filter on.
 *  - Historical stability (verified-by 2): a measurement-context whose
 *    calibration_ref carries a revisionRef still resolves the calibration content
 *    that was in force AT acquisition after the live calibration record is mutated.
 *    This runs the REAL store + RecordRevisionService machinery — it mutates the
 *    record AFTER pinning and re-reads through the revisionRef (reviewer bait 7).
 *
 * Harness: the same wiring as server.ts bootstrap and the QMS-6C precedent
 * (DraftCopyDerivedRefValidation.test.ts): loadAllSchemas(schema/) ->
 * SchemaRegistry topological order -> AjvValidator -> createRecordStore.
 * No skipValidation anywhere.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { readFile } from 'node:fs/promises';

import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator, AjvValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore, RecordStoreImpl } from '../store/RecordStoreImpl.js';
import { RecordRevisionService, revisionRef } from '../revisions/RecordRevisionService.js';
import type { RecordEnvelope } from '../store/types.js';

// Repo root from server/src/schema/ (same convention as the QMS-6C suite):
// server/schema is a gitignored symlink, so a cwd-relative path is a
// worktree-portability trap.
const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..');
const SCHEMA_DIR = join(REPO_ROOT, 'schema');

const MEASUREMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';
const MEASUREMENT_CONTEXT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement-context.schema.yaml';
const DATA_REFERENCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml';
const EQUIPMENT_CLASS_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment-class.schema.yaml';
const CALIBRATION_RECORD_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/calibration-record.schema.yaml';

let validator: AjvValidator;
let store: RecordStoreImpl;
let testDir: string;

beforeAll(async () => {
  const loadResult = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
  const registry = createSchemaRegistry();
  registry.addSchemas(loadResult.entries);

  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }

  const lintEngine = createLintEngine();
  const lintLoadResult = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
  for (const { name, spec } of lintLoadResult.specs) {
    if (spec.rules.length > 0) lintEngine.addSpec(name, spec);
  }

  testDir = join(tmpdir(), `ic1-contract-${randomUUID()}`);
  await mkdir(testDir, { recursive: true });
  const repo = createLocalRepoAdapter({ basePath: testDir });
  store = createRecordStore(repo, validator, lintEngine);
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function measurementPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'measurement',
    recordId: 'MSR-IC1-000001',
    title: 'IC1 contract probe',
    assayType: 'qpcr',
    data: [{ well: 'A1', metric: 'Ct', value: 21.4 }],
    ...overrides,
  };
}

function measurementContextPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'measurement-context',
    id: 'MCTX-IC1-000001',
    name: 'IC1 contract context',
    source_ref: { kind: 'record', type: 'labware-instance', id: 'LW-IC1-PLATE' },
    equipment_ref: { kind: 'record', type: 'equipment', id: 'EQP-IC1-READER' },
    readout_def_refs: [{ kind: 'record', type: 'readout-definition', id: 'RDEF-IC1-FAR_RED' }],
    ...overrides,
  };
}

describe('acquisition-context contract: equipment is the declared physical source (C1, verified-by 1)', () => {
  it('measurement.equipmentRef accepts an equipment-typed record ref', () => {
    const res = validator.validate(
      measurementPayload({
        equipmentRef: { kind: 'record', type: 'equipment', id: 'EQP-QUANTSTUDIO5' },
      }),
      MEASUREMENT_SCHEMA_ID,
    );
    expect(res.valid, JSON.stringify(res.errors)).toBe(true);
  });

  it('measurement REJECTS an instrument-typed source ref (the retired kind is not a ref target)', () => {
    const res = validator.validate(
      measurementPayload({
        equipmentRef: { kind: 'record', type: 'instrument', id: 'INSTR-IC1' },
      }),
      MEASUREMENT_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
    expect(JSON.stringify(res.errors)).toContain('equipment');
  });

  it('measurement REJECTS a bare untyped source ref (H3: "any ref" is not an accepted end state)', () => {
    const res = validator.validate(
      measurementPayload({
        equipmentRef: { kind: 'record', id: 'EQP-QUANTSTUDIO5' },
      }),
      MEASUREMENT_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
  });

  it('measurement REJECTS the retired instrumentRef key (clean break, H9)', () => {
    const res = validator.validate(
      measurementPayload({
        instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-QUANTSTUDIO5' },
      }),
      MEASUREMENT_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
  });

  it('measurement-context REQUIRES equipment_ref and accepts the equipment pin', () => {
    const missing = validator.validate(
      measurementContextPayload({ equipment_ref: undefined }),
      MEASUREMENT_CONTEXT_SCHEMA_ID,
    );
    expect(missing.valid).toBe(false);
    expect(JSON.stringify(missing.errors)).toContain('equipment_ref');

    const good = validator.validate(measurementContextPayload(), MEASUREMENT_CONTEXT_SCHEMA_ID);
    expect(good.valid, JSON.stringify(good.errors)).toBe(true);
  });

  it('measurement-context REJECTS a non-equipment equipment_ref (instrument-definition is a definition kind, not the asset)', () => {
    const res = validator.validate(
      measurementContextPayload({
        equipment_ref: { kind: 'record', type: 'instrument-definition', id: 'INSTDEF-GENERIC-PLATE_READER' },
      }),
      MEASUREMENT_CONTEXT_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
    expect(JSON.stringify(res.errors)).toContain('equipment');
  });

  it('measurement-context REJECTS the retired instrument_ref key (clean break, H9)', () => {
    const res = validator.validate(
      measurementContextPayload({
        instrument_ref: { kind: 'record', type: 'equipment', id: 'EQP-IC1-READER' },
      }),
      MEASUREMENT_CONTEXT_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
  });
});

describe('acquisition_context slot: QMS-at-acquisition context is declared data (C1)', () => {
  it('accepts calibration_refs + authorization_refs refs (revisionRef legal at every element) and a free note', () => {
    const res = validator.validate(
      measurementContextPayload({
        acquisition_context: {
          calibration_refs: [
            {
              kind: 'record',
              type: 'calibration-record',
              id: 'CAL-IC1-001',
              revisionRef: { kind: 'record', type: 'record-revision', id: `REV-${'A1B2C3D4E5F6A7B8'.toUpperCase()}` },
            },
          ],
          authorization_refs: [
            { kind: 'record', type: 'competency-authorization', id: 'CAUTH-IC1-001' },
          ],
          note: 'calibration in force at acquisition',
        },
      }),
      MEASUREMENT_CONTEXT_SCHEMA_ID,
    );
    expect(res.valid, JSON.stringify(res.errors)).toBe(true);
  });

  it('keeps smugglers out: an undeclared key inside acquisition_context is refused (additionalProperties:false)', () => {
    const res = validator.validate(
      measurementContextPayload({
        acquisition_context: {
          calibration_refs: [{ kind: 'record', type: 'calibration-record', id: 'CAL-IC1-001' }],
          operationalStatus: 'calibrated-and-authorized',
        },
      }),
      MEASUREMENT_CONTEXT_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
  });
});

describe('data-reference acquisitionContext: equipment_ref replaces the free instrument string (C1)', () => {
  it('accepts acquisitionContext.equipment_ref as a ref.schema.yaml host (revision/note kept)', () => {
    const res = validator.validate(
      {
        kind: 'data-reference',
        id: 'DREF-IC1-000001',
        title: 'qPCR run 42',
        storageDeviceId: 'vast',
        path: 'instruments/qs5/run42.fcs',
        contentHash: 'b'.repeat(64),
        sizeBytes: 512000,
        dataKind: 'signal',
        format: 'fcs',
        acquisitionContext: {
          equipment_ref: {
            kind: 'record',
            type: 'equipment',
            id: 'EQP-QUANTSTUDIO5',
            revisionRef: { kind: 'record', type: 'record-revision', id: `REV-${'A1B2C3D4E5F6A7B8'.toUpperCase()}` },
          },
          note: 'after heat',
        },
      },
      DATA_REFERENCE_SCHEMA_ID,
    );
    expect(res.valid, JSON.stringify(res.errors)).toBe(true);
  });

  it('declares equipment_ref on the acquisitionContext (the retired `instrument` string is no longer the contract)', async () => {
    // The declaration lives in YAML: read the shipped schema text, not a fixture.
    const schemaText = await readFile(join(SCHEMA_DIR, 'knowledge', 'data-reference.schema.yaml'), 'utf8');
    expect(schemaText).toContain('equipment_ref');
    expect(schemaText).not.toMatch(/^ {2,8}instrument:\s*$/m);
  });
});

describe('equipment-class carries the migrated ontology class (C1, spec (d))', () => {
  it('equipment-class.schema.yaml declares a `class` CURIE array (shape copied from instrument.schema.yaml)', () => {
    const res = validator.validate(
      {
        kind: 'equipment-class',
        id: 'EQC-IC1-PROBE',
        name: 'IC1 probe class',
        class: ['OBI:0001110'],
      },
      EQUIPMENT_CLASS_SCHEMA_ID,
    );
    expect(res.valid, JSON.stringify(res.errors)).toBe(true);
  });

  it('a non-CURIE class entry is refused (the migrated shape is enforced)', () => {
    const res = validator.validate(
      {
        kind: 'equipment-class',
        id: 'EQC-IC1-PROBE',
        name: 'IC1 probe class',
        class: ['not a curie with spaces'],
      },
      EQUIPMENT_CLASS_SCHEMA_ID,
    );
    expect(res.valid).toBe(false);
  });

  it('EQC-QUANTSTUDIO5 seed names a measuring-device class CURIE (data for the C5 derived view)', async () => {
    const doc = parseYaml(
      await readFile(join(REPO_ROOT, 'records', 'seed', 'equipment-class', 'eqc-quantstudio5.yaml'), 'utf8'),
    ) as { class?: string[] };
    expect(Array.isArray(doc.class)).toBe(true);
    expect(doc.class).toContain('OBI:0001110'); // OBI: real-time PCR machine
    // The seed loader strips the $schema pointer before validating the payload
    // (same as the store's seed path); validate the payload, not the pointer.
    const { $schema: _pointer, ...payload } = doc as Record<string, unknown>;
    void _pointer;
    const res = validator.validate(payload, EQUIPMENT_CLASS_SCHEMA_ID);
    expect(res.valid, JSON.stringify(res.errors)).toBe(true);
  });
});

describe('historical stability: revision-pinned acquisition context survives later mutation (verified-by 2)', () => {
  it('a calibration_ref pinned by revisionRef still resolves the calibration in force AT acquisition after the live record changes', async () => {
    // 1. A calibration record in force at acquisition time.
    const calEnvelope: RecordEnvelope = {
      recordId: 'CAL-IC1-HIST',
      schemaId: CALIBRATION_RECORD_SCHEMA_ID,
      payload: {
        kind: 'calibration-record',
        id: 'CAL-IC1-HIST',
        equipmentRef: { kind: 'record', type: 'equipment', id: 'EQP-IC1-READER' },
        performedAt: '2026-10-01T08:00:00Z',
        status: 'pass',
        notes: 'annual calibration — the fact in force at acquisition',
      },
    };
    const created = await store.create({ envelope: calEnvelope, message: 'IC1 seed calibration' });
    expect(created.success, created.error).toBe(true);

    // 2. Pin it: capture the immutable revision the acquisition will name.
    const revisions = new RecordRevisionService(store);
    const revision = await revisions.capture(created.envelope ?? calEnvelope, 'ic1-tester', 'derivation');

    // 3. The acquisition names the PINNED revision, not the mutable head.
    const mctxEnvelope: RecordEnvelope = {
      recordId: 'MCTX-IC1-HIST',
      schemaId: MEASUREMENT_CONTEXT_SCHEMA_ID,
      payload: measurementContextPayload({
        id: 'MCTX-IC1-HIST',
        acquisition_context: {
          calibration_refs: [
            {
              kind: 'record',
              type: 'calibration-record',
              id: 'CAL-IC1-HIST',
              revisionRef: revisionRef(revision.recordId),
            },
          ],
          note: 'calibration context captured at acquisition',
        },
      }),
    };
    const mctx = await store.create({ envelope: mctxEnvelope, message: 'IC1 acquisition context' });
    expect(mctx.success, mctx.error).toBe(true);

    // 4. AFTER acquisition, the live calibration record changes (memo §3:
    //    historical context must not silently resolve to today's facts).
    const live = await store.get('CAL-IC1-HIST');
    expect(live).not.toBeNull();
    const mutated = await store.update({
      envelope: {
        ...live!,
        payload: {
          ...(live!.payload as Record<string, unknown>),
          status: 'fail',
          notes: 'later re-calibration FAILED — today’s fact',
        },
      },
      message: 'IC1 later calibration failure',
    });
    expect(mutated.success, mutated.error).toBe(true);

    // 5. Resolve through the ref the acquisition actually carries.
    const storedPayload = (mctx.envelope ?? mctxEnvelope).payload as {
      acquisition_context: { calibration_refs: Array<{ id: string; revisionRef: { id: string } }> };
    };
    const ref = storedPayload.acquisition_context.calibration_refs[0];
    const pinned = await revisions.resolve({ id: ref.id, revisionRef: ref.revisionRef });
    expect(pinned).not.toBeNull();
    const pinnedPayload = pinned!.payload as { status: string; notes: string };
    expect(pinnedPayload.status).toBe('pass');
    expect(pinnedPayload.notes).toContain('in force at acquisition');

    // And the live head really did change — the pin is what preserved the truth.
    const head = await store.get('CAL-IC1-HIST');
    expect((head!.payload as { status: string }).status).toBe('fail');
  });
});

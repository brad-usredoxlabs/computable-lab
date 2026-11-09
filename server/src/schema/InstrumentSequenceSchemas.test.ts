/**
 * GC-3 — instrument-sequence / instrument-sequence-entry: schema contract
 * tests (RED-first per the promoted spec §RED-first test plan).
 *
 * Harness: the ControlledDocumentSchemas.test.ts pattern over the REAL
 * schema/ tree — loadAllSchemas → SchemaRegistry (topological order) →
 * AjvValidator (strict, addFormats — the server's own defaults). The §Runs-
 * freeze-refs guarantee folds in here (orch preference: one new file) with
 * the DraftCopyDerivedRefValidation.test.ts full store wire-up
 * (loadAllSchemas → SchemaRegistry → AjvValidator → createRecordStore,
 * no skipValidation anywhere).
 *
 * Contract pinned here (spec §Triplet layout / §Ref targets / §Runs-freeze-refs):
 *  - both kinds resolve by $id; valid header + entry fixtures PASS (fixture
 *    values from the GC-1 spike report's first-hand reads: vial 101,
 *    RES35077-4, AOAC_FAME_NO_INJECTION.M, multiplier 1, dilution 1,
 *    ISTD Num 1 amount 0);
 *  - wrong-kind refs REJECTED by AJV via the type: const pins
 *    (AcquisitionContextContract precedent — shape, not store, rejects);
 *  - bad quantity/unit combos REJECTED by the quantity datatype itself
 *    (dimension collapse is a schema error, not lint);
 *  - unknown top-level keys REJECTED (unevaluatedProperties: false);
 *  - `uninterpreted` string-map PASSES (the vendor-ambiguity honesty field);
 *  - entry refs required (runRef+sampleRef+gcMethodRef), header refs
 *    optional (build-up state) — bait #7;
 *  - the ref datatype itself requires `type` on record refs
 *    (ref.schema.yaml if/then kind:record → required [id, type]) — a
 *    record ref without a type is schema-rejected;
 *  - a submitted analysis-run's frozen payload stays byte-identical after an
 *    entry edit; a mutated frozen snapshot makes the real runner refuse with
 *    FROZEN_INPUT_CHANGED (the freeze boundary lives inside analysis-run's
 *    own payload — GC-3 adds no write path into analysis-run records).
 */
import { beforeAll, describe, expect, it, afterAll } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from 'yaml';

import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator, AjvValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore, RecordStoreImpl } from '../store/RecordStoreImpl.js';
import { RecordRevisionService, revisionRef } from '../revisions/RecordRevisionService.js';
import { AnalysisRunner } from '../analysis/analysisRunner.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';
import type { AppContext } from '../server.js';

// Repo root from server/src/schema/ (same convention as the sibling contract
// suites: vitest cwd = server/, so resolve(process.cwd(), '..')).
const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..');
const SCHEMA_DIR = join(REPO_ROOT, 'schema');

const SEQUENCE_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/instrument-sequence.schema.yaml';
const ENTRY_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/instrument-sequence-entry.schema.yaml';
const ANALYSIS_RUN_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml';

// ---------------------------------------------------------------------------
// Fixture data — the GC-1 spike report's observed ChemStation run-table values
// (SAMPLE.XML / RUN.LOG / ACQ.TXT reads), verbatim where the report preserved
// them. Nothing here is a CL-invented unit or meaning.
// ---------------------------------------------------------------------------

/** The run-table row as observed (GC-1 report lines 14-18). */
const OBSERVED = {
  vial: '101',
  sampleName: 'RES35077-4',
  dataFileName: 'Z:\\GC-FID\\MACHINE1\\RES35077-4.D',
  vendorMethodLabel: 'AOAC_FAME_NO_INJECTION.M',
  acquisitionStartedAt: '2026-10-23T10:08:18-04:00',
  // RUN.LOG "Method started 10:08:18 10/23/26" — kept verbatim; the vendor
  // string carries no timezone, so the normalized field is separate and the
  // raw string is preserved (bait #2: never invent a zone).
  dateTimeRaw: '10:08:18 10/23/26',
  multiplier: 1,
  dilution: 1,
  istdNum: 1,
};

function entryPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-GC3-001',
    position: { vial: OBSERVED.vial },
    runRef: { kind: 'record', type: 'run', id: 'RUN-000041' },
    sampleRef: { kind: 'record', type: 'sample', id: 'SMP-GC3-001' },
    gcMethodRef: { kind: 'record', type: 'gc-method', id: 'GCM-GC3-001' },
    sampleName: OBSERVED.sampleName,
    dataFileName: OBSERVED.dataFileName,
    acquisitionStartedAt: OBSERVED.acquisitionStartedAt,
    dateTimeRaw: OBSERVED.dateTimeRaw,
    multiplier: OBSERVED.multiplier,
    dilution: OBSERVED.dilution,
    istdNum: OBSERVED.istdNum,
    istdAmountUninterpreted: 0,
    manualInjection: false,
    vendorMethodLabel: OBSERVED.vendorMethodLabel,
    ...overrides,
  };
}

function sequencePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'instrument-sequence',
    id: 'ISEQ-GC3-001',
    title: 'GC-FID run sheet — RES35077',
    studyRef: { kind: 'record', type: 'study', id: 'STU-000041' },
    runRef: { kind: 'record', type: 'run', id: 'RUN-000041' },
    operatorRef: { kind: 'record', type: 'user', id: 'USR-GC3-OPERATOR' },
    instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-GC3-001' },
    entryRefs: [
      { kind: 'record', type: 'instrument-sequence-entry', id: 'ISEN-GC3-001' },
    ],
    ...overrides,
  };
}

function validateAgainst(validator: AjvValidator, schemaId: string, payload: unknown) {
  return validator.validate(payload, schemaId);
}

describe('GC-3 instrument-sequence + instrument-sequence-entry schema contracts', () => {
  let validator: AjvValidator;

  beforeAll(async () => {
    const loadResult = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    // A broken schema tree would mask every assertion below.
    expect(loadResult.errors).toEqual([]);
    const registry = createSchemaRegistry();
    registry.addSchemas(loadResult.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  it('sanity: both new kinds resolve by $id (registry-load smoke)', () => {
    expect(validator.hasSchema(SEQUENCE_SCHEMA_ID)).toBe(true);
    expect(validator.hasSchema(ENTRY_SCHEMA_ID)).toBe(true);
  });

  // --- valid fixtures PASS -------------------------------------------------
  it('valid instrument-sequence header (observed refs + entryRefs) passes', () => {
    const result = validateAgainst(validator, SEQUENCE_SCHEMA_ID, sequencePayload());
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('valid instrument-sequence-entry (observed run-table values) passes', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID, entryPayload());
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('a planned empty header (no refs, no entryRefs yet) stays valid (bait #7)', () => {
    const result = validateAgainst(validator, SEQUENCE_SCHEMA_ID, {
      kind: 'instrument-sequence',
      id: 'ISEQ-GC3-EMPTY',
      title: 'Run sheet under build-up',
      entryRefs: [],
    });
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('an entry without runRef/sampleRef/gcMethodRef is rejected (a row with no sample is not a row)', () => {
    const missing = { ...entryPayload() };
    delete missing.runRef;
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID, missing);
    expect(result.valid).toBe(false);
    // Ajv reports a missing required property in params.missingProperty with a
    // root-level instance path — the property name is NOT in the error path.
    expect(result.errors!.some((e) => e.keyword === 'required' && (e.params?.missingProperty) === 'runRef')).toBe(true);
  });

  it('a header with duplicate entryRefs is rejected (uniqueItems)', () => {
    const ref = { kind: 'record', type: 'instrument-sequence-entry', id: 'ISEN-GC3-001' };
    const result = validateAgainst(validator, SEQUENCE_SCHEMA_ID,
      sequencePayload({ entryRefs: [ref, ref] }));
    expect(result.valid).toBe(false);
  });

  // --- wrong-kind refs REJECTED (schema type-const, not store) --------------
  it('sampleRef with type: run is rejected (wrong-kind ref — AJV const)', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID,
      entryPayload({ sampleRef: { kind: 'record', type: 'run', id: 'RUN-000041' } }));
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => String(e.path).includes('sampleRef') && e.keyword === 'const')).toBe(true);
  });

  it('gcMethodRef with type: run is rejected (wrong-kind ref — AJV const)', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID,
      entryPayload({ gcMethodRef: { kind: 'record', type: 'run', id: 'RUN-000041' } }));
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => String(e.path).includes('gcMethodRef') && e.keyword === 'const')).toBe(true);
  });

  it('an instrument-sequence-entry ref on the header with the wrong type is rejected', () => {
    const result = validateAgainst(validator, SEQUENCE_SCHEMA_ID,
      sequencePayload({ entryRefs: [{ kind: 'record', type: 'instrument-sequence', id: 'ISEQ-GC3-001' }] }));
    expect(result.valid).toBe(false);
  });

  // --- bad units REJECTED (quantity datatype, not lint) ---------------------
  it('amount with a dimension-collapse unit combo is rejected by the quantity datatype', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID,
      entryPayload({ amount: { value: 5, unit: 'uL', dimension: 'count' } }));
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => String(e.path).includes('amount'))).toBe(true);
  });

  it('amount with a controlled unit (volume/uL) passes', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID,
      entryPayload({ amount: { value: 5, unit: 'uL', dimension: 'volume' } }));
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('an entry carrying amountUninterpreted (unit unknown) passes — two fields, never a faked unit', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID,
      entryPayload({ amountUninterpreted: 0 }));
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  // --- unknown keys REJECTED (unevaluatedProperties: false) -----------------
  it('an unknown top-level key on the entry is rejected', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID,
      entryPayload({ notAField: 'nope' }));
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.keyword === 'unevaluatedProperties')).toBe(true);
  });

  it('an unknown top-level key on the header is rejected', () => {
    const result = validateAgainst(validator, SEQUENCE_SCHEMA_ID,
      sequencePayload({ notAField: 'nope' }));
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.keyword === 'unevaluatedProperties')).toBe(true);
  });

  it('uninterpreted string-map passes (the vendor-ambiguity honesty field; bait #2)', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID,
      entryPayload({ uninterpreted: { ECM: 'observed vendor column, semantics unverified' } }));
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('a non-string value in uninterpreted is rejected (stringly, verbatim, no semantics)', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID,
      entryPayload({ uninterpreted: { ECM: { nested: true } } }));
    expect(result.valid).toBe(false);
  });

  it('a copied gc-method-shaped field on the entry is rejected structurally (bait #6)', () => {
    const result = validateAgainst(validator, ENTRY_SCHEMA_ID,
      entryPayload({ timed_events: [{ at_min: 0, integration: 'on' }] }));
    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.keyword === 'unevaluatedProperties')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §Runs-freeze-refs guarantee (spec §RED plan item 3, folded in): a submitted
// analysis-run's frozen payload survives a sequence-entry edit byte-identical,
// and a mutated frozen snapshot makes the REAL runner refuse with
// FROZEN_INPUT_CHANGED. Real store, no skipValidation.
// ---------------------------------------------------------------------------
describe('GC-3 freeze guarantee: entry edits never rewrite submitted-analysis provenance', () => {
  let store: RecordStoreImpl;
  let validator: AjvValidator;
  let lintEngine: ReturnType<typeof createLintEngine>;
  let testDir: string;

  const ENTRY_ID = 'ISEN-GC3-FREEZE';
  const RUN_ID = 'ANR-000001';

  function analysisRunPayload(): Record<string, unknown> {
    return {
      kind: 'analysis-run',
      id: RUN_ID,
      title: 'FAME integration — frozen',
      revisionRef: { kind: 'record', type: 'analysis-revision', id: 'ANREV-000001' },
      status: 'queued',
      // Frozen by value at submit time (the whole freeze boundary lives here).
      inputs: {
        sample: { kind: 'record', type: 'sample', id: 'SMP-GC3-001' },
      },
      parameters: { integration: 'on' },
    };
  }

  beforeAll(async () => {
    const loadResult = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    expect(loadResult.errors).toEqual([]);
    const registry = createSchemaRegistry();
    registry.addSchemas(loadResult.entries);

    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }

    lintEngine = createLintEngine();
    const lintLoadResult = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
    for (const { name, spec } of lintLoadResult.specs) {
      if (spec.rules.length > 0) lintEngine.addSpec(name, spec);
    }

    testDir = join(tmpdir(), `gc3-freeze-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    const repo = createLocalRepoAdapter({ basePath: testDir });
    store = createRecordStore(repo, validator, lintEngine);

    // The entry the run sheet row points at (real store write, validated).
    const entryResult = await store.create({
      envelope: { recordId: ENTRY_ID, schemaId: ENTRY_SCHEMA_ID, payload: entryPayload({ id: ENTRY_ID }) },
      message: `Create ${ENTRY_ID}`,
    });
    expect(entryResult.success, entryResult.error ?? 'lint: ' + JSON.stringify(entryResult.lint?.violations)).toBe(true);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function minimalAppContext(): AppContext {
    // Only the pieces the FROZEN_INPUT_CHANGED path touches (ctx.store).
    return {
      schemaRegistry: {} as never,
      validator,
      lintEngine,
      repoAdapter: {} as never,
      store,
      indexManager: {} as never,
      uiSpecLoader: {} as never,
      workspaceRoot: REPO_ROOT,
      dataDir: testDir,
      repositoryMode: 'local',
      recordsDir: testDir,
      schemaDir: SCHEMA_DIR,
      localIdentityService: {} as never,
      credentialStore: {} as never,
      sessionStore: {} as never,
      authorizationService: {} as never,
      ownershipPolicyService: {} as never,
      platformRegistry: {} as never,
      lifecycleEngine: {} as never,
      policyBundleService: {} as never,
      materialProfileRegistry: {} as never,
      jsonLdIndex: {} as never,
      jsonLdProjector: {} as never,
      storageService: {} as never,
    } as unknown as AppContext;
  }

  it('an entry edit leaves the submitted analysis-run payload byte-identical', async () => {
    // Submit the analysis-run and freeze its inputs by value: the revision
    // snapshot (the freeze primitive RecordRevisionService.capture) is what
    // the runner re-reads and compares frozenRunFields against.
    const runCreate = await store.create({
      envelope: { recordId: RUN_ID, schemaId: ANALYSIS_RUN_SCHEMA_ID, payload: analysisRunPayload() },
      message: `Create ${RUN_ID}`,
    });
    expect(runCreate.success, runCreate.error ?? 'lint: ' + JSON.stringify(runCreate.lint?.violations)).toBe(true);
    const before = (await store.get(RUN_ID))!;
    expect(before).toBeDefined();

    // Freeze the run's inputs by value (the freeze primitive: the revision
    // snapshot is what the runner re-reads and compares frozenRunFields
    // against). The frozen snapshot matches the submitted payload by value.
    const revisions = new RecordRevisionService(store);
    const frozen = await revisions.capture(before, 'USR-GC3-OPERATOR', 'research-use', '1.0.0');

    // The sequence-edit under test: the ENTRY record changes (a new sample),
    // through the real validated update path.
    const entryEdit = await store.update({
      envelope: {
        recordId: ENTRY_ID,
        schemaId: ENTRY_SCHEMA_ID,
        payload: {
          ...entryPayload({ id: ENTRY_ID }),
          sampleRef: { kind: 'record', type: 'sample', id: 'SMP-GC3-002' },
        },
      },
      actor: 'USR-GC3-OPERATOR',
      message: 'Edit entry sample reference',
    });
    expect(entryEdit.success, entryEdit.error ?? 'lint: ' + JSON.stringify(entryEdit.lint?.violations)).toBe(true);

    // Re-read the analysis-run: the edit reached only the entry record.
    const after = (await store.get(RUN_ID))!;
    expect(JSON.stringify(after.payload)).toBe(JSON.stringify(before.payload));
    // The frozen snapshot still matches the run's payload by value — the
    // runner's frozenRunFields comparison sees no drift.
    const snapshot = frozen.payload.snapshot;
    const runPayload = after.payload as Record<string, unknown>;
    for (const field of ['inputs', 'parameters']) {
      expect(JSON.stringify(snapshot[field])).toBe(JSON.stringify(runPayload[field]));
    }
  });

  it('a mutated frozen snapshot is refused by the real runner with FROZEN_INPUT_CHANGED', async () => {
    // Build a second run whose frozen snapshot DRIFTS from its payload: the
    // fixture mutated the frozen snapshot itself (the "anything tried to"
    // arm the spec names). The real AnalysisRunner re-reads the frozen
    // revision and compares frozenRunFields — any drift throws 409
    // FROZEN_INPUT_CHANGED before anything executes.
    const DRIFT_RUN = 'ANR-000002';
    const runCreate = await store.create({
      envelope: {
        recordId: DRIFT_RUN,
        schemaId: ANALYSIS_RUN_SCHEMA_ID,
        payload: {
          ...analysisRunPayload(),
          id: DRIFT_RUN,
          revisionRef: { kind: 'record', type: 'analysis-revision', id: 'ANREV-000002' },
          parameters: { integration: 'on' },
        },
      },
      message: `Create ${DRIFT_RUN}`,
    });
    expect(runCreate.success, runCreate.error).toBe(true);
    const runBefore = (await store.get(DRIFT_RUN))!;

    const revisions = new RecordRevisionService(store);
    // Freeze the run's inputs by value first — the snapshot matches the
    // submitted payload (parameters: integration 'on').
    const frozen = await revisions.capture(runBefore, 'USR-GC3-OPERATOR', 'research-use', '1.0.0');

    // The mutation under test: the run's payload changes AFTER the freeze —
    // the snapshot and the payload then disagree on `parameters` (the fixture
    // mutated the frozen snapshot's own source; "if anything tried to", the
    // runner's contentHash comparison is the wall).
    const driftedPayload: Record<string, unknown> = {
      ...(runBefore.payload as Record<string, unknown>),
      parameters: { integration: 'off' },
      frozenExecutionRef: revisionRef(frozen.recordId),
    };
    const storeResult = await store.update({
      envelope: {
        recordId: DRIFT_RUN,
        schemaId: ANALYSIS_RUN_SCHEMA_ID,
        payload: driftedPayload,
      },
      actor: 'USR-GC3-OPERATOR',
      message: 'Mutate the run after its inputs were frozen',
    });
    expect(storeResult.success, storeResult.error).toBe(true);

    const runner = new AnalysisRunner(minimalAppContext());
    let code = '';
    try {
      await runner.executeRun(DRIFT_RUN);
    } catch (err) {
      code = (err as { code?: string }).code ?? '';
    }
    expect(code, 'the real runner must refuse the drifted frozen run').toBe('FROZEN_INPUT_CHANGED');
  });
});

// ---------------------------------------------------------------------------
// UI triplet (spec §UI triplet — the adversarial-gate defect list item 1):
// loadAllUISpecs loads BOTH instrument-sequence.ui.yaml and
// instrument-sequence-entry.ui.yaml with zero loader errors. The loader
// (UISpecLoader.validateSpec) enforces the EDITOR-1 binding: unknown slot
// refs, double-claims, and unclaimed slots in an explicitly-bound spec all
// fail at load time. So "loads with zero errors" already proves every editor
// block names slots that exist (the controlled-document / gc-method / budget
// pattern). The full-word-label criterion (no truncated headers) is verified
// here by reading the literal label strings out of the loaded YAML: every
// label is a full word (no single letters, no ellipses), and the spec's
// mandated entry labels are present verbatim.
// ---------------------------------------------------------------------------
describe('instrument-sequence / entry ui (spec §UI triplet)', () => {
  it('U1: loadAllUISpecs loads BOTH ui.yaml files with zero loader errors', async () => {
    const loader = createUISpecLoader();
    const result = await loadAllUISpecs(loader, SCHEMA_DIR);
    const seqErrors = result.errors.filter((e) => e.path.includes('instrument-sequence.ui.yaml'));
    const entryErrors = result.errors.filter((e) => e.path.includes('instrument-sequence-entry.ui.yaml'));
    expect(seqErrors).toEqual([]);
    expect(entryErrors).toEqual([]);

    // Both specs are cached by schemaId (proof loadAllUISpecs loaded them).
    const seqSpec = loader.get(SEQUENCE_SCHEMA_ID);
    const entrySpec = loader.get(ENTRY_SCHEMA_ID);
    expect(seqSpec?.editor).toBeDefined();
    expect(entrySpec?.editor).toBeDefined();

    // display.titleField per the spec triplet — read from the raw YAML (the
    // loader's UISpec type is structural and does not model `display`), which
    // is the source of truth loadAllUISpecs just loaded without error.
    const seqRaw = parseYamlUi('instrument-sequence.ui.yaml') as Record<string, unknown>;
    const entryRaw = parseYamlUi('instrument-sequence-entry.ui.yaml') as Record<string, unknown>;
    expect((seqRaw.display as { titleField?: string }).titleField).toBe('$.title');
    expect((entryRaw.display as { titleField?: string }).titleField).toBe('$.sampleName');
  });

  it('U2: every editor block names slots that exist and is a section (or the header repeater)', () => {
    // Re-read the raw YAML (the projection type is structural; the loader does
    // not persist block.slots on the UISpec editor in a typed shape the test
    // can reach through .get), so the binding assertion reads the source of
    // truth the loader actually validated.
    const seqRaw = parseYamlUi('instrument-sequence.ui.yaml') as Record<string, unknown>;
    const entryRaw = parseYamlUi('instrument-sequence-entry.ui.yaml') as Record<string, unknown>;

    for (const raw of [seqRaw, entryRaw]) {
      const editor = raw.editor as { blocks: Array<Record<string, unknown>>; slots: Array<Record<string, unknown>> };
      const slotIds = new Set(editor.slots.map((s) => s.id as string));
      // Every slot id referenced by a block's explicit `slots` claim exists.
      for (const block of editor.blocks) {
        if (Array.isArray(block.slots)) {
          for (const claim of block.slots as string[]) {
            expect(slotIds.has(claim), `block '${block.id}' claims unknown slot '${claim}'`).toBe(true);
          }
          // Slot claims are section blocks' job: a block that claims slots
          // must be kind:section (repeaters bind by path prefix, no slots).
          expect(block.kind, `block '${block.id}' claims slots but is not a section`).toBe('section');
        }
        // No block is double-claimed: each slot id appears in at most one block.
      }
      const claimed = new Map<string, string>();
      for (const block of editor.blocks) {
        for (const claim of (block.slots as string[]) ?? []) {
          expect(claimed.has(claim), `slot '${claim}' claimed by more than one block`).toBe(false);
          claimed.set(claim, String(block.id));
        }
      }
    }
  });

  it('U3: every editor slot label is a full word (no truncated headers) and the mandated entry labels are verbatim', () => {
    const entryRaw = parseYamlUi('instrument-sequence-entry.ui.yaml') as Record<string, unknown>;
    const editor = entryRaw.editor as { blocks: Array<Record<string, unknown>>; slots: Array<Record<string, unknown>> };

    const labels = editor.slots.map((s) => s.label as string);
    // No-truncated-headers criterion: no label is a single character, a
    // fragment ending in ellipsis, or empty.
    for (const label of labels) {
      expect(label.trim().length, `label '${label}' is truncated/empty`).toBeGreaterThan(1);
      expect(label, `label '${label}' must not be an abbreviation`).not.toMatch(/\.\.\.$/);
    }

    // The spec's mandated FULL-WORD labels, present verbatim on the entry.
    // (FIX-2/D1: the object slots were decomposed to leaf-scalar slots per the
    // platform rendering limit, so 'Vial Position' -> 'Vial' + 'Tray' and
    // 'Internal Standard Amount' -> 'Internal Standard Amount Value' +
    // 'Internal Standard Amount Unit'.)
    for (const mandated of [
      'Vial',
      'Tray',
      'Data File Name',
      'Sample Name',
      'Method Reference',
      'Manual Injection',
      'Internal Standard Amount Value',
      'Internal Standard Amount Unit',
      'Multiplier',
      'Dilution',
      'Uninterpreted Vendor Fields',
    ]) {
      expect(labels, `mandated label '${mandated}' missing`).toContain(mandated);
    }
  });
});

function parseYamlUi(file: string): unknown {
  const url = new URL(`../../../schema/lab/${file}`, import.meta.url);
  return parseYaml(readFileSync(fileURLToPath(url), 'utf-8'));
}

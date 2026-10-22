/**
 * INSTR-COLLAPSE-1 FIX-1 (adv defect 1, BLOCKER) — the Gemini active-read
 * appliance flow must satisfy its OWN declared contracts end-to-end.
 *
 * The C2 retarget pinned gemini-active-read-request.instrumentRef and
 * measurement.equipmentRef to `type: const equipment`; the producer
 * (createGeminiEmActiveReadJob) must emit a ref that validates against them.
 * This is the reviewer's probe (probe-appliance-seam.mts / probe-appliance-
 * store.mts) committed as a suite, using the REAL schema loader + REAL
 * AjvValidator + REAL RecordStoreImpl (the write-path authority), not just
 * the artifact emitter:
 *
 *  1. job.request validates against the real sidecar contract schema.
 *  2. The measurement payload the flow writes (equipmentRef = the job ref)
 *     validates against the real measurement schema.
 *  3. store.create of that payload SUCCEEDS (schema + lint wall).
 *  4. The ref names an equipment record the corpus actually declares
 *     (EQP-PLATE-READER seed + ECP-PLATE-READER VERB-READ binding), so the
 *     declared capability gate ACCEPTS the appliance equipment when a read
 *     event chain is present, and FAILS CLOSED (capability_gate_
 *     verb_unresolvable) when it is absent — the OQ-1 posture, pinned.
 *
 * RED posture: at HEAD the producer still emits type 'instrument' — legs
 * 1-3 fail exactly as the reviewer's probes showed.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { loadAllSchemas } from '../../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../../schema/SchemaRegistry.js';
import { createValidator, AjvValidator } from '../../validation/AjvValidator.js';
import { createLintEngine } from '../../lint/LintEngine.js';
import { loadAllLintSpecs } from '../../lint/LintSpecLoader.js';
import { createLocalRepoAdapter } from '../../repo/LocalRepoAdapter.js';
import { createRecordStore, RecordStoreImpl } from '../../store/RecordStoreImpl.js';
import { evaluateDeclaredCapabilityGate } from '../../capabilities/DeclaredCapabilityGate.js';
import { createGeminiEmActiveReadJob } from './InstrumentApplianceJob.js';
import type { InstrumentRunFile } from './InstrumentRunFile.js';
import type { SchemaEntry } from '../../schema/SchemaLoader.js';

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..');
const SCHEMA_DIR = join(REPO_ROOT, 'schema');

const MEASUREMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';
const GEMINI_REQUEST_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/sidecar/gemini-active-read-request.schema.yaml';

let validator: AjvValidator;
let store: RecordStoreImpl;
let testDir: string;
let schemas: Map<string, SchemaEntry>;

beforeAll(async () => {
  const loadResult = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
  const registry = createSchemaRegistry();
  registry.addSchemas(loadResult.entries);
  schemas = new Map(loadResult.entries.map((entry) => [entry.id, entry]));

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

  testDir = await mkdtemp(join(tmpdir(), `ic1f1-appliance-${randomUUID()}`));
  await mkdir(join(testDir, 'records', 'inbox'), { recursive: true });
  const repo = createLocalRepoAdapter({ basePath: testDir });
  store = createRecordStore(repo, validator, lintEngine);
}, 120000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function geminiJob() {
  const runFile: InstrumentRunFile = {
    instrument: 'Gemini EM plate reader',
    wells: [{ well: 'A1' }, { well: 'H12' }],
  };
  return createGeminiEmActiveReadJob(runFile, 0, {
    simulate: true,
    mode: 'fluorescence',
    wavelengthNm: 520,
  });
}

/** The measurement payload MeasurementService.ingest builds from the job ref
 *  (MeasurementActiveControlService.ts:239-249 forwards instrumentRef as
 *  equipmentRef; MeasurementService.ts:190 hands the payload to store.create). */
function measurementPayloadFromJobRef(equipmentRef: unknown, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'measurement',
    recordId: 'MSR-IC1F1-CONTRACT',
    title: 'Gemini EM active read (contract probe)',
    assayType: 'plate_reader',
    data: [{ well: 'A1', metric: 'RFU', value: 1 }],
    equipmentRef,
    parserInfo: { parserId: 'gemini_csv', parserVersion: '1', parsedAt: new Date().toISOString() },
    ...overrides,
  };
}

describe('FIX-1 defect 1: the Gemini appliance producer satisfies the retargeted contracts end-to-end', () => {
  it('job.request validates against the REAL gemini-active-read-request contract (equipment-pinned instrumentRef)', () => {
    const job = geminiJob();
    const result = validator.validate(job.request, GEMINI_REQUEST_SCHEMA_ID);
    expect(result.valid, `sidecar contract rejected the producer ref: ${JSON.stringify(result.errors ?? [])}`).toBe(true);
  });

  it('the measurement payload built from the job ref validates against the REAL measurement schema (equipment-pinned equipmentRef)', () => {
    const job = geminiJob();
    const instrumentRef = (job.request as { instrumentRef?: Record<string, unknown> }).instrumentRef;
    expect(instrumentRef, 'producer must emit an instrumentRef').toBeDefined();
    // The ref TARGET is equipment (H3 floor) and names a corpus-declared record.
    expect(instrumentRef!.type).toBe('equipment');
    expect(instrumentRef!.id).toBe('EQP-PLATE-READER');

    const result = validator.validate(measurementPayloadFromJobRef(instrumentRef), MEASUREMENT_SCHEMA_ID);
    expect(result.valid, `measurement schema rejected the forwarded ref: ${JSON.stringify(result.errors ?? [])}`).toBe(true);
  });

  it('store.create (the write-path authority, real validator + lint wall) accepts the measurement the flow writes', async () => {
    const job = geminiJob();
    const instrumentRef = (job.request as { instrumentRef: Record<string, unknown> }).instrumentRef;
    const result = await store.create({
      envelope: {
        recordId: 'MSR-IC1F1-CONTRACT',
        schemaId: MEASUREMENT_SCHEMA_ID,
        payload: measurementPayloadFromJobRef(instrumentRef),
      },
      message: 'FIX-1 contract probe measurement',
    });
    expect(
      result.success,
      `store.create rejected the appliance measurement: ${result.error ?? ''} ${JSON.stringify(result.validation?.errors ?? [])}`,
    ).toBe(true);
  });

  it('the declared capability gate ACCEPTS the appliance equipment when the read event chain is present (ECP-PLATE-READER VERB-READ)', async () => {
    await store.create({
      envelope: {
        recordId: 'EVG-IC1F1-READ',
        schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        payload: {
          kind: 'event-graph',
          recordId: 'EVG-IC1F1-READ',
          id: 'EVG-IC1F1-READ',
          events: [
            {
              eventId: 'EVT-IC1F1-READ',
              event_type: 'read',
              details: { wells: ['A1'] },
              semanticKeyComponents: { verb: 'read', identity: { plate: 'LW-IC1F1' }, phaseId: 'p1', ordinal: 1 },
            },
          ],
          labwares: [{ labwareId: 'LW-IC1F1', labwareType: 'plate_96' }],
        },
      },
      message: 'seed event-graph for FIX-1 contract probe',
    });

    const job = geminiJob();
    const instrumentRef = (job.request as { instrumentRef: Record<string, unknown> }).instrumentRef;
    const violation = await evaluateDeclaredCapabilityGate({
      payload: measurementPayloadFromJobRef(instrumentRef, {
        eventGraphRef: { kind: 'record', type: 'event-graph', id: 'EVG-IC1F1-READ' },
        readEventRef: 'EVT-IC1F1-READ',
      }),
      schemaId: MEASUREMENT_SCHEMA_ID,
      validator,
      store,
    });
    expect(violation, `gate rejected the corpus plate reader: ${JSON.stringify(violation ?? null)}`).toBeNull();
  });

  it('the declared capability gate FAILS CLOSED for the appliance payload as compiled today (no read event chain on the job) — OQ-1 posture pinned', async () => {
    const job = geminiJob();
    const instrumentRef = (job.request as { instrumentRef: Record<string, unknown> }).instrumentRef;
    const violation = await evaluateDeclaredCapabilityGate({
      payload: measurementPayloadFromJobRef(instrumentRef),
      schemaId: MEASUREMENT_SCHEMA_ID,
      validator,
      store,
    });
    expect(violation).not.toBeNull();
    expect(violation!.code).toBe('capability_gate_verb_unresolvable');
  });
});

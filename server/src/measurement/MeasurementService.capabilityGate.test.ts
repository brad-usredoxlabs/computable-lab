/**
 * INSTR-COLLAPSE-1 FIX-1 (adv defect 2, MAJOR) — the capability gate is
 * exercised through the MEASUREMENT WRITE PATH, not only the pure function.
 *
 * OQ-1 decision RED shape item 1 + item 5, driven through
 * MeasurementService.ingest (the call site at MeasurementService.ts:180):
 *   1. a kind-correct equipment WITHOUT the read verb binding -> ingest
 *      rejects with MeasurementServiceError code `capability_gate_unsupported`
 *      statusCode 400, and NOTHING is persisted;
 *   2. the fail-closed posture: an equipmentRef with no resolvable verb
 *      chain -> code `capability_gate_verb_unresolvable` (a silent pass would
 *      make the gate theater);
 *   3. the ACCEPT leg: the same shape with the declared VERB-READ binding
 *      ingests green.
 *
 * Harness: real initializeApp booted against the REAL schema tree
 * (schemaDir '../schema') so the REAL measurement.schema.yaml — the file that
 * DECLARES x-capability-gate on equipmentRef — is the schema the interpreter
 * reads. A reduced tmp schema would prove only the call site, not the
 * declared contract. CONFIG_PATH is pinned to a throwaway /tmp dataDir (W25
 * precedent: NFS git commits blow the hook budget) so no durable-store counter
 * is involved: assertions are on the ERROR CODE, never on minted record ids.
 * The raw CSV fixture is written by the test itself — no records/inbox/gemini.csv
 * env dependency.
 *
 * RED posture (captured by reverting the MeasurementService gate call site,
 * raw saved as fix1-RED-defect2-measurement-*.txt): with the call site absent
 * the reject legs do not reject — the measurement is created.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementService, MeasurementServiceError } from './MeasurementService.js';

const MEASUREMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';
const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';
const EQUIPMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml';
const EQUIPMENT_CAPABILITY_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment-capability.schema.yaml';

const testDir = resolve(process.cwd(), 'tmp/measurement-service-capgate');
// Local disk (not the NFS worktree): the embedded-git store seeds records/seed
// into a fresh dataDir; git commits on NFS are too slow for the hook budget.
const dataDir = resolve('/tmp', 'cl-ic1f1-meas-gate-data');
const rawCsvPath = 'records/inbox/ic1f1-gate-read.csv';

let ctx: AppContext;

async function seed(input: {
  equipmentId: string;
  classRef: Record<string, unknown>;
  capabilityId: string;
  verbId: string;
}): Promise<void> {
  await ctx.store.create({
    envelope: {
      recordId: input.equipmentId,
      schemaId: EQUIPMENT_SCHEMA_ID,
      payload: {
        kind: 'equipment',
        id: input.equipmentId,
        name: input.equipmentId,
        equipmentClassRef: input.classRef,
      },
    },
    message: `seed equipment ${input.equipmentId} for FIX-1 write-path gate test`,
  });
  await ctx.store.create({
    envelope: {
      recordId: input.capabilityId,
      schemaId: EQUIPMENT_CAPABILITY_SCHEMA_ID,
      payload: {
        kind: 'equipment-capability',
        id: input.capabilityId,
        status: 'active',
        equipmentRef: { kind: 'record', type: 'equipment', id: input.equipmentId },
        capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: input.verbId } }],
      },
    },
    message: `seed capability ${input.capabilityId} for FIX-1 write-path gate test`,
  });
}

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  // Isolation: initializeApp's findConfigPath walks server/ -> worktree root;
  // pin CONFIG_PATH to a throwaway config so every minted record lands under
  // /tmp and dies in afterAll (no durable-counter drift in play).
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, 'config.yaml'), [
    'server:',
    '  logLevel: error',
    '  dataDir: ' + dataDir,
    '  workspaceDir: ' + dataDir + '/workspaces',
    'repositories: []',
    'logging: { level: error }',
    'extraction: { enabled: false, runner: { enabled: false } }',
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');

  // Boot against the REAL schema tree: the gate fires because the REAL
  // measurement.schema.yaml declares x-capability-gate on equipmentRef.
  ctx = await initializeApp(process.cwd(), {
    schemaDir: '../schema',
    recordsDir: 'records',
    logLevel: 'silent',
  });

  await ctx.repoAdapter.createFile({
    path: rawCsvPath,
    content: ['well,channelId,metric,value,unit', 'A1,FITC,RFU,1234.5,RFU', ''].join('\n'),
    message: 'seed raw CSV for FIX-1 write-path gate test',
  });

  const CL_ORBITAL = { kind: 'ontology', id: 'CL:orbital_shaker', namespace: 'CL', label: 'Orbital shaker' };
  const CL_PLATE_READER = { kind: 'ontology', id: 'CL:plate_reader', namespace: 'CL', label: 'Plate reader' };
  // Kind-correct equipment bound ONLY to VERB-SHAKE (the seed verb-definition).
  await seed({ equipmentId: 'EQP-IC1F1-SHAKER', classRef: CL_ORBITAL, capabilityId: 'ECP-IC1F1-SHAKER', verbId: 'VERB-SHAKE' });
  // Kind-correct equipment bound ONLY to VERB-READ.
  await seed({ equipmentId: 'EQP-IC1F1-READER', classRef: CL_PLATE_READER, capabilityId: 'ECP-IC1F1-READER', verbId: 'VERB-READ' });

  await ctx.store.create({
    envelope: {
      recordId: 'EVG-IC1F1-GATE',
      schemaId: EVENT_GRAPH_SCHEMA_ID,
      payload: {
        kind: 'event-graph',
        recordId: 'EVG-IC1F1-GATE',
        id: 'EVG-IC1F1-GATE',
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
    message: 'seed event-graph for FIX-1 write-path gate test',
  });
}, 600000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

function ingestInput(equipmentId: string, withChain: boolean) {
  return {
    parserId: 'gemini_csv',
    rawData: { path: rawCsvPath },
    equipmentRef: { kind: 'record', type: 'equipment', id: equipmentId },
    ...(withChain
      ? {
          eventGraphRef: { kind: 'record', type: 'event-graph', id: 'EVG-IC1F1-GATE' },
          readEventRef: 'EVT-IC1F1-READ',
        }
      : {}),
  };
}

describe('FIX-1 defect 2: MeasurementService.ingest enforces the declared capability gate (write path)', () => {
  it('REJECTS a kind-correct equipment without the read verb binding: code capability_gate_unsupported, 400, nothing persisted', async () => {
    const service = new MeasurementService(ctx);
    const before = await ctx.store.list({ kind: 'measurement' });
    let error: unknown;
    try {
      await service.ingest(ingestInput('EQP-IC1F1-SHAKER', true));
    } catch (err) {
      error = err;
    }
    expect(error, 'ingest must reject an equipment lacking the declared read capability').toBeInstanceOf(MeasurementServiceError);
    const gateError = error as MeasurementServiceError;
    expect(gateError.code).toBe('capability_gate_unsupported');
    expect(gateError.statusCode).toBe(400);
    const after = await ctx.store.list({ kind: 'measurement' });
    expect(after.length, 'the rejected write must persist nothing').toBe(before.length);
  });

  it('FAILS CLOSED when the verb chain is absent: code capability_gate_verb_unresolvable (no silent pass)', async () => {
    const service = new MeasurementService(ctx);
    let error: unknown;
    try {
      await service.ingest(ingestInput('EQP-IC1F1-READER', false));
    } catch (err) {
      error = err;
    }
    expect(error, 'an equipmentRef with no resolvable verb chain must fail closed').toBeInstanceOf(MeasurementServiceError);
    const gateError = error as MeasurementServiceError;
    expect(gateError.code).toBe('capability_gate_verb_unresolvable');
    expect(gateError.statusCode).toBe(400);
  });

  it('ACCEPTS the same shape when the equipment declares the read verb (gate is capability-resolved, not kind-resolved)', async () => {
    const service = new MeasurementService(ctx);
    const result = await service.ingest(ingestInput('EQP-IC1F1-READER', true));
    // Assert the SHAPE of the minted id, never a specific counter value
    // (durable-counter drift must not defeat this test).
    expect(result.recordId).toMatch(/^MSR-\d{6}$/);
    const envelope = await ctx.store.get(result.recordId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as { equipmentRef?: { id?: string; type?: string } };
    expect(payload.equipmentRef?.id).toBe('EQP-IC1F1-READER');
    expect(payload.equipmentRef?.type).toBe('equipment');
  });
});

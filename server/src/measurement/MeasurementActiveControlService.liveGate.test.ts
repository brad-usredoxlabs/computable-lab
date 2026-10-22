/**
 * INSTR-COLLAPSE-1 FIX RUN 2 (architect ruling §3a, D1 closed as
 * working-as-designed) — the LIVE Gemini active-read flow pinned against the
 * REAL schema tree.
 *
 * Ruling: .hermes/plans/2026-10-22_instr-collapse-d1-liveflow-gate-decision.md
 * (DECISION: C refined). These are BEHAVIOR PINS for that ruling, not
 * RED-first fixes: both tests pass at HEAD as written. They convert the
 * reviewer's PROBE 2 observation (advreview §3/D1) from "untested broken
 * flow" into a committed, drift-immune contract:
 *
 *   T1 DESIGNED-REFUSAL PIN — the compiled appliance job request carries no
 *     read-event chain (InstrumentApplianceJob.ts builds none), so the REAL
 *     measurement.schema.yaml x-capability-gate on equipmentRef fails closed:
 *     performActiveRead(job.request) rejects with MeasurementServiceError
 *     code `capability_gate_verb_unresolvable`, statusCode 400, and the
 *     store contains NO measurement afterwards. This is the OQ-1-mandated
 *     honest structured refusal — never a fake success, never a schema
 *     violation.
 *   T2 DOOR-OPEN PIN — the SAME call with the request additionally carrying
 *     eventGraphRef {kind:'record', id:<seeded EG>, type:'event-graph'} and
 *     readEventRef <seeded event whose semanticKeyComponents.verb is 'read'>
 *     succeeds, and the persisted measurement carries that readEventRef.
 *     This is the executable proof (ruling §4a) that INSTR-READCHAIN-1 is
 *     plumbing through the channel that already exists — no server schema
 *     change is needed to carry the chain.
 *
 * Harness: the proven pattern from MeasurementService.capabilityGate.test.ts
 * — real initializeApp booted with schemaDir '../schema' so the REAL
 * measurement.schema.yaml (the file that DECLARES x-capability-gate on
 * equipmentRef) is the schema the interpreter reads; the seeded corpus
 * (records/seed auto-merged by the store) supplies EQP-PLATE-READER (with
 * equipmentClassRef CL:plate_reader), ECP-PLATE-READER (VERB-READ bound to
 * that class), and the verb-definition seed with canonical 'read'.
 * CONFIG_PATH is pinned to a throwaway /tmp dataDir (W25 precedent: NFS git
 * commits blow the hook budget), so every minted record and the simulator
 * CSV fixture land under /tmp and die in afterAll — no repo records/inbox
 * write, no durable-counter drift. parameters.simulate:true routes the
 * simulator fixture path (generateGeminiMeasurementFixture), so no sidecar
 * process and no network call run. Assertions are on the ERROR CODE and the
 * SHAPE of minted ids, never on record ids (drift-immune discipline).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementServiceError } from './MeasurementService.js';
import { MeasurementActiveControlService } from './MeasurementActiveControlService.js';
import { createGeminiEmActiveReadJob } from '../compiler/artifacts/InstrumentApplianceJob.js';
import type { InstrumentRunFile } from '../compiler/artifacts/InstrumentRunFile.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

const testDir = resolve(process.cwd(), 'tmp/measurement-active-control-livegate');
// Local disk (not the NFS worktree): the embedded-git store seeds records/seed
// into a fresh dataDir; git commits on NFS are too slow for the hook budget.
const dataDir = resolve('/tmp', 'cl-ic1f2-livegate-data');
// The simulator fixture lands inside the /tmp dataDir worktree (the embedded
// adapter resolves repo-relative paths against dataDir/worktrees/<repoId>),
// never against the checkout's records/inbox.
const tmpOutputPath = 'records/inbox/ic1f2-livegate-read.csv';

let ctx: AppContext;

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

  // The seeded corpus (records/seed, auto-merged by the store's read paths)
  // supplies exactly the ruling's seed set: EQP-PLATE-READER (equipmentClassRef
  // CL:plate_reader), ECP-PLATE-READER (VERB-READ bound to CL:plate_reader),
  // and the verb-definition seed VERB-READ (canonical 'read'). Only the
  // event-graph is test-local (no seed record exists for it).
  await ctx.store.create({
    envelope: {
      recordId: 'EVG-IC1F2-GATE',
      schemaId: EVENT_GRAPH_SCHEMA_ID,
      payload: {
        kind: 'event-graph',
        recordId: 'EVG-IC1F2-GATE',
        id: 'EVG-IC1F2-GATE',
        events: [
          {
            eventId: 'EVT-IC1F2-READ',
            event_type: 'read',
            details: { wells: ['A1'] },
            semanticKeyComponents: { verb: 'read', identity: { plate: 'LW-IC1F2' }, phaseId: 'p1', ordinal: 1 },
          },
        ],
        labwares: [{ labwareId: 'LW-IC1F2', labwareType: 'plate_96' }],
      },
    },
    message: 'seed event-graph for FIX-2 live-gate pin test',
  });
}, 600000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

/**
 * The producer's request, built by the REAL createGeminiEmActiveReadJob from a
 * Gemini EM run file (same shape the chatbot compile pass emits), with the
 * ruling-mandated tmp outputPath and parameters.simulate:true. The job carries
 * NO eventGraphRef/readEventRef — that absence is the designed-refusal subject.
 */
function producerJobRequest() {
  const runFile: InstrumentRunFile = {
    instrument: 'Gemini EM plate reader',
    wells: [{ well: 'A1' }],
    runParameters: { simulate: true, mode: 'fluorescence', wavelengthNm: 520 },
  };
  const job = createGeminiEmActiveReadJob(runFile, 0);
  return {
    adapterId: job.request.adapterId,
    ...(job.request.instrumentRef !== undefined ? { instrumentRef: job.request.instrumentRef } : {}),
    outputPath: tmpOutputPath,
    parameters: { ...job.request.parameters },
  };
}

describe('FIX-2 ruling §3a: live Gemini active-read flow against the REAL declared gate', () => {
  it('T1 DESIGNED-REFUSAL: the producer job.request (no read-event chain) rejects with code capability_gate_verb_unresolvable, 400, and persists NO measurement', async () => {
    const service = new MeasurementActiveControlService(ctx);
    const before = await ctx.store.list({ kind: 'measurement' });
    expect(before.length, 'fresh dataDir must start with no measurements').toBe(0);

    let error: unknown;
    try {
      await service.performActiveRead(producerJobRequest());
    } catch (err) {
      error = err;
    }
    expect(error, 'the gate must refuse an appliance measurement with no resolvable verb chain').toBeInstanceOf(MeasurementServiceError);
    const gateError = error as MeasurementServiceError;
    // Assert the gate's own CODE (drift-immune), never record ids.
    expect(gateError.code).toBe('capability_gate_verb_unresolvable');
    expect(gateError.statusCode).toBe(400);

    const after = await ctx.store.list({ kind: 'measurement' });
    expect(after.length, 'the designed refusal must persist no measurement').toBe(0);
  });

  it('T2 DOOR-OPEN: the same call carrying eventGraphRef + readEventRef (verb read) succeeds and the persisted measurement carries that readEventRef', async () => {
    const service = new MeasurementActiveControlService(ctx);
    const result = await service.performActiveRead({
      ...producerJobRequest(),
      eventGraphRef: { kind: 'record', id: 'EVG-IC1F2-GATE', type: 'event-graph' },
      readEventRef: 'EVT-IC1F2-READ',
    });

    // Assert the SHAPE of the minted id, never a specific counter value
    // (durable-counter drift must not defeat this test).
    expect(result.measurementId).toMatch(/^MSR-\d{6}$/);
    const envelope = await ctx.store.get(result.measurementId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as {
      readEventRef?: string;
      eventGraphRef?: { id?: string; type?: string };
      equipmentRef?: { id?: string; type?: string };
    };
    // The gate is an honest door, not a permanent block: the chain arrived
    // through the channel ActiveReadRequestBody already declares (ruling §4a).
    expect(payload.readEventRef).toBe('EVT-IC1F2-READ');
    expect(payload.eventGraphRef?.id).toBe('EVG-IC1F2-GATE');
    expect(payload.eventGraphRef?.type).toBe('event-graph');
    expect(payload.equipmentRef?.id).toBe('EQP-PLATE-READER');
    expect(payload.equipmentRef?.type).toBe('equipment');
  });
});

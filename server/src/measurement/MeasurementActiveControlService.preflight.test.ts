/**
 * INSTR-READCHAIN-1 (d) — fail-fast pre-flight BEFORE sidecar dispatch.
 *
 * The sequencing defect (ruling §2D): today the declared capability gate fires
 * only inside measurements.ingest — AFTER performActiveRead has already
 * dispatched (the SIMULATE branch writes the fixture CSV, the LIVE URL branch
 * POSTs to LABOS_GEMINI_READ_URL, the SIDECAR branch spawns the adapter).
 * The pre-flight must evaluate the SAME declared gate (DeclaredCapabilityGate
 * against the MEASUREMENT schema annotation) before the dispatch expression,
 * so a doomed request never writes orphan raw data and never fires hardware.
 *
 * Harness: copied verbatim from MeasurementActiveControlService.liveGate.test.ts
 * (the frozen ruling §3a pin file — tests are NOT added there): throwaway /tmp
 * CONFIG_PATH dataDir, REAL schemaDir '../schema' so the REAL
 * measurement.schema.yaml x-capability-gate is what the interpreter reads,
 * seeded event-graph via store.create, parameters.simulate:true routes the
 * simulator fixture, tmp outputPath lands under the dataDir worktree.
 * Assertions are on the ERROR CODE, the FILE'S ABSENCE, and the FETCH CALL
 * COUNT — never record ids (drift-immune).
 *
 * RED posture at HEAD:
 *   T-d1 RED — the simulator fixture CSV EXISTS after the rejection (written
 *     before ingest 400s), so the ENOENT assertion fails.
 *   T-d2 RED — the fetchFn stub's call count is 1 (the live POST fires before
 *     the gate 400s), so the zero-call assertion fails.
 *   T-d3 GREEN companion — the recordable request (chain present) still
 *     passes; guards against an over-eager pre-flight.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementServiceError } from './MeasurementService.js';
import { MeasurementActiveControlService } from './MeasurementActiveControlService.js';
import { createGeminiEmActiveReadJob } from '../compiler/artifacts/InstrumentApplianceJob.js';
import type { InstrumentRunFile } from '../compiler/artifacts/InstrumentRunFile.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

const testDir = resolve(process.cwd(), 'tmp/measurement-active-control-preflight');
// Local disk (not the NFS worktree): same isolation as the liveGate pin —
// minted records and the simulator CSV land under /tmp and die in afterAll.
const dataDir = resolve('/tmp', 'cl-rc1-preflight-data');
// The simulator fixture lands inside the dataDir worktree (the embedded git
// adapter resolves repo-relative paths against dataDir/worktrees/<repoId>).
const tmpOutputPath = 'records/inbox/rc1-preflight-read.csv';

let ctx: AppContext;

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
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

  // Test-local event-graph (no seed record exists for it); the seeded corpus
  // supplies EQP-PLATE-READER / ECP-PLATE-READER / VERB-READ (canonical
  // 'read') exactly as the liveGate pin relies on.
  await ctx.store.create({
    envelope: {
      recordId: 'EVG-RC1-PREFLIGHT',
      schemaId: EVENT_GRAPH_SCHEMA_ID,
      payload: {
        kind: 'event-graph',
        recordId: 'EVG-RC1-PREFLIGHT',
        id: 'EVG-RC1-PREFLIGHT',
        events: [
          {
            eventId: 'EVT-RC1-READ',
            event_type: 'read',
            details: { wells: ['A1'] },
            semanticKeyComponents: { verb: 'read', identity: { plate: 'LW-RC1' }, phaseId: 'p1', ordinal: 1 },
          },
        ],
        labwares: [{ labwareId: 'LW-RC1', labwareType: 'plate_96' }],
      },
    },
    message: 'seed event-graph for READCHAIN-1 pre-flight test',
  });
}, 600000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
  delete process.env.LABOS_GEMINI_READ_URL;
  delete process.env.LABOS_SIMULATE_GEMINI;
});

/** The producer's request (same shape as the liveGate pin's producerJobRequest):
 *  built by the REAL createGeminiEmActiveReadJob, tmp outputPath, simulate:true.
 *  Carries NO eventGraphRef/readEventRef — the designed-refusal subject. */
function producerJobRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    ...overrides,
  };
}

/** Absolute path of the repo-relative outputPath inside the embedded-git
 *  worktree the adapter actually writes to (derived from the adapter itself
 *  when it exposes worktreePath — drift-immune against repoId renames). */
function worktreeFile(path: string): string {
  const adapter = ctx.repoAdapter as { worktreePath?: string };
  const base = typeof adapter.worktreePath === 'string' ? adapter.worktreePath : resolve(dataDir, 'worktrees', 'main');
  return resolve(base, path);
}

describe('READCHAIN-1 §(d): the declared gate pre-flight fires BEFORE the dispatch', () => {
  it('T-d1 NO ORPHAN RAWDATA: a no-chain simulate request rejects with capability_gate_verb_unresolvable and writes NO fixture CSV', async () => {
    const service = new MeasurementActiveControlService(ctx);
    const before = await ctx.store.list({ kind: 'measurement' });
    expect(before.length, 'fresh dataDir must start with no measurements').toBe(0);

    let error: unknown;
    try {
      await service.performActiveRead(producerJobRequest());
    } catch (err) {
      error = err;
    }
    expect(error, 'the pre-flight must refuse an appliance measurement with no resolvable verb chain').toBeInstanceOf(MeasurementServiceError);
    const gateError = error as MeasurementServiceError;
    expect(gateError.code).toBe('capability_gate_verb_unresolvable');
    expect(gateError.statusCode).toBe(400);

    // The discriminating assertion (RED at HEAD by construction): the
    // simulator fixture must NOT exist — the dispatch must never have run.
    let fileError: NodeJS.ErrnoException | undefined;
    try {
      await stat(worktreeFile(tmpOutputPath));
    } catch (err) {
      fileError = err as NodeJS.ErrnoException;
    }
    expect(fileError?.code, 'a doomed request must not leave orphan raw data behind').toBe('ENOENT');

    const after = await ctx.store.list({ kind: 'measurement' });
    expect(after.length, 'the designed refusal must persist no measurement').toBe(0);
  });

  it('T-d2 NO HARDWARE FIRE: a doomed live request rejects pre-flight with ZERO fetchFn calls', async () => {
    process.env.LABOS_GEMINI_READ_URL = 'http://127.0.0.1:1/rc1-preflight-never-called';
    delete process.env.LABOS_SIMULATE_GEMINI;

    const fetchCalls: Array<{ url: string }> = [];
    const fetchStub = async (url: string): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> => {
      fetchCalls.push({ url });
      // Shaped like the real bridge response so, at HEAD, the flow reaches
      // the ingest gate and 400s there — the discriminating assertion is the
      // call COUNT, which must be 0 once the pre-flight moves the gate first.
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          contractVersion: '1.0',
          adapterId: 'molecular_devices_gemini',
          operation: 'active_read',
          result: { rawDataPath: tmpOutputPath, status: 'completed', parserId: 'gemini_csv' },
        }),
      };
    };

    const service = new MeasurementActiveControlService(ctx, undefined, undefined, fetchStub);
    let error: unknown;
    try {
      await service.performActiveRead(producerJobRequest({
        parameters: { simulate: false, mode: 'fluorescence', wavelengthNm: 520 },
      }));
    } catch (err) {
      error = err;
    }
    expect(error, 'the pre-flight must refuse a live request whose verb chain is unresolvable').toBeInstanceOf(MeasurementServiceError);
    const gateError = error as MeasurementServiceError;
    expect(gateError.code).toBe('capability_gate_verb_unresolvable');
    expect(gateError.statusCode).toBe(400);

    // The discriminating assertion (RED at HEAD by construction): live
    // hardware must never fire for an unrecordable measurement.
    expect(fetchCalls.length, 'a doomed live request must not POST to the read URL').toBe(0);
  });

  it('T-d3 GREEN COMPANION: the recordable request (chain present) still passes the pre-flight', async () => {
    const service = new MeasurementActiveControlService(ctx);
    const result = await service.performActiveRead({
      ...producerJobRequest(),
      eventGraphRef: { kind: 'record', id: 'EVG-RC1-PREFLIGHT', type: 'event-graph' },
      readEventRef: 'EVT-RC1-READ',
    });

    expect(result.measurementId).toMatch(/^MSR-\d{6}$/);
    const envelope = await ctx.store.get(result.measurementId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as { readEventRef?: string; eventGraphRef?: { id?: string } };
    expect(payload.readEventRef).toBe('EVT-RC1-READ');
    expect(payload.eventGraphRef?.id).toBe('EVG-RC1-PREFLIGHT');
  });
});

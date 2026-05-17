import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../../server.js';
import type { AppContext } from '../../server.js';
import { createMeasurementHandlers } from './MeasurementHandlers.js';
import { createGeminiEmActiveReadJob } from '../../compiler/artifacts/InstrumentApplianceJob.js';
import type { InstrumentRunFile } from '../../compiler/artifacts/InstrumentRunFile.js';

const measurementSchema = `
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/measurement.schema.yaml"
type: object
required: [kind, recordId, title, assayType, data]
properties:
  kind: { const: "measurement" }
  recordId: { type: string }
  title: { type: string }
  assayType:
    type: string
    enum: [qpcr, plate_reader, microscopy, gc_ms, flow, other]
  data:
    type: array
    items:
      type: object
      required: [well, metric, value]
      properties:
        well: { type: string }
        metric: { type: string }
        value: { type: number }
        channelId: { type: string }
  parserInfo:
    type: object
`;

function makeReply() {
  return {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
}

describe('MeasurementHandlers appliance job execution', () => {
  const testDir = resolve(process.cwd(), 'tmp/measurement-handlers-appliance-job-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records/inbox'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/measurement.schema.yaml'), measurementSchema);
    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('executes a compiled Gemini EM appliance job through active control', async () => {
    const handlers = createMeasurementHandlers(ctx);
    const runFile: InstrumentRunFile = {
      instrument: 'Gemini EM plate reader',
      wells: [{ well: 'A1' }, { well: 'H12' }],
    };
    const job = createGeminiEmActiveReadJob(runFile, 0, {
      simulate: true,
      mode: 'fluorescence',
      wavelengthNm: 520,
    });
    job.request.outputPath = 'records/inbox/gemini-phase6.csv';

    const reply = makeReply();
    const result = await handlers.executeInstrumentApplianceJob(
      { body: { job } } as never,
      reply as never,
    );

    expect(reply.statusCode).toBe(201);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        jobId: 'gemini-em-active-read-1',
        measurementId: 'MSR-000001',
        logId: 'ILOG-000001',
        rawDataPath: 'records/inbox/gemini-phase6.csv',
        applianceExecutionRecordPath: expect.stringMatching(/^records\/instrument-appliance-jobs\/gemini-em-active-read-1-/),
      }),
    );
    const raw = await ctx.repoAdapter.getFile('records/inbox/gemini-phase6.csv');
    expect(raw?.content).toContain('well,channelId,metric,value,unit');
    const executionRecordPath = (result as { applianceExecutionRecordPath: string }).applianceExecutionRecordPath;
    const executionRecord = await ctx.repoAdapter.getFile(executionRecordPath);
    expect(executionRecord?.content).toContain('"kind": "instrument-appliance-execution-record"');
    expect(executionRecord?.content).toContain('"status": "completed"');
    expect(executionRecord?.content).toContain('"measurementId": "MSR-000001"');
  });

  it('rejects unsupported appliance jobs before active control execution', async () => {
    const handlers = createMeasurementHandlers(ctx);
    const reply = makeReply();
    const result = await handlers.executeInstrumentApplianceJob(
      {
        body: {
          kind: 'instrument-appliance-job',
          jobId: 'unsupported-1',
          adapterId: 'unknown_adapter',
          operation: 'active_read',
          request: {
            adapterId: 'unknown_adapter',
            parameters: {},
          },
          sourceRunFile: {
            instrument: 'unknown',
            wells: [],
          },
        },
      } as never,
      reply as never,
    );

    expect(reply.statusCode).toBe(400);
    expect(result).toEqual(
      expect.objectContaining({
        error: 'BAD_APPLIANCE_JOB',
      }),
    );
  });

  it('rejects Gemini EM appliance jobs without explicit execution mode', async () => {
    const handlers = createMeasurementHandlers(ctx);
    const runFile: InstrumentRunFile = {
      instrument: 'Gemini EM plate reader',
      wells: [{ well: 'A1' }],
    };
    const job = createGeminiEmActiveReadJob(runFile, 0, {
      mode: 'fluorescence',
      wavelengthNm: 520,
    });

    const reply = makeReply();
    const result = await handlers.executeInstrumentApplianceJob(
      { body: { job } } as never,
      reply as never,
    );

    expect(reply.statusCode).toBe(400);
    expect(result).toEqual(
      expect.objectContaining({
        error: 'EXECUTION_NOT_READY',
        details: expect.objectContaining({
          applianceExecutionRecordPath: expect.stringMatching(/^records\/instrument-appliance-jobs\/gemini-em-active-read-1-/),
        }),
      }),
    );
    const executionRecordPath = (result as { details: { applianceExecutionRecordPath: string } }).details.applianceExecutionRecordPath;
    const executionRecord = await ctx.repoAdapter.getFile(executionRecordPath);
    expect(executionRecord?.content).toContain('"status": "blocked"');
    expect(executionRecord?.content).toContain('"code": "EXECUTION_NOT_READY"');
  });

  it('rejects live Gemini EM appliance jobs without explicit confirmation', async () => {
    const handlers = createMeasurementHandlers(ctx);
    const runFile: InstrumentRunFile = {
      instrument: 'Gemini EM plate reader',
      wells: [{ well: 'A1' }],
    };
    const job = createGeminiEmActiveReadJob(runFile, 0, {
      simulate: false,
      mode: 'luminescence',
    });

    const reply = makeReply();
    const result = await handlers.executeInstrumentApplianceJob(
      { body: { job } } as never,
      reply as never,
    );

    expect(reply.statusCode).toBe(409);
    expect(result).toEqual(
      expect.objectContaining({
        error: 'LIVE_EXECUTION_CONFIRMATION_REQUIRED',
        details: expect.objectContaining({
          applianceExecutionRecordPath: expect.stringMatching(/^records\/instrument-appliance-jobs\/gemini-em-active-read-1-/),
        }),
      }),
    );
    const executionRecordPath = (result as { details: { applianceExecutionRecordPath: string } }).details.applianceExecutionRecordPath;
    const executionRecord = await ctx.repoAdapter.getFile(executionRecordPath);
    expect(executionRecord?.content).toContain('"status": "rejected"');
    expect(executionRecord?.content).toContain('"confirmed": false');
  });
});

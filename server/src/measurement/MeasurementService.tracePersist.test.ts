// @vitest-environment node
/**
 * L2-GC-TRACE-PERSIST-1 / u1persist — GC-BUNDLE r3 defect D3: the AIA-CDF
 * parser PRODUCES the ordinate series (result.trace) but ingest dropped it,
 * so no chromatogram trace could ever persist for rendering.
 *
 * Boots on the REAL schema tree (the u0parserinfo pattern + CONFIG_PATH block,
 * /tmp dataDir to avoid the shared ~/.computable-lab store) so the REAL
 * measurement.schema.yaml governs. store.create validates by default
 * (RecordStoreImpl), so a record whose parserInfo.trace is not declared in the
 * schema is refused at the write — the RED shape of this defect.
 *
 * AC1  ingest of a trace-carrying parser persists parserInfo.trace =
 *      { values: number[], samplingIntervalSeconds: number } AND the record
 *      validates against the real schema (in-test, Ajv).
 * AC2  the same record still carries parserInfo.units + parserInfo.metadata
 *      verbatim (u0parserinfo non-regression).
 * AC4  a parser declaring NO trace -> parserInfo.trace ABSENT entirely
 *      (never undefined, never an empty array).
 * D3e  validate-parser echoes the trace summary fields so its output matches
 *      ingest (same single trace source — no re-parse, no second copy of the
 *      sampling interval).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementService } from './MeasurementService.js';
import { MeasurementParserValidationService } from './MeasurementParserValidationService.js';

const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';
const here = dirname(fileURLToPath(import.meta.url));
const testDir = resolve(process.cwd(), 'tmp/measurement-service-u1trace');
const dataDir = resolve('/tmp', 'cl-u1trace-persist-data');
const cdfPath = 'records/inbox/u1trace-SIGNAL01.cdf';
const csvPath = 'records/inbox/u1trace-plain.csv';

// Bedrock numbers (aiaCdfParser.test.ts on the same fixture — the file is the
// ground truth): 72801 ordinate points, 0.05 s uniform grid, first/last
// samples 9.7135 / 17.0548 pA.
const POINTS = 72801;
const SAMPLING_INTERVAL = 0.05;

let ctx: AppContext;
let raw: { values: number[]; samplingIntervalSeconds: number };

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(
    resolve(testDir, 'config.yaml'),
    ['server:', '  logLevel: error', `  dataDir: ${dataDir}`, `  workspaceDir: ${dataDir}/workspaces`, 'repositories: []', 'logging: { level: error }', 'extraction: { enabled: false, runner: { enabled: false } }'].join('\n') + '\n',
  );
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');
  ctx = await initializeApp(process.cwd(), { schemaDir: '../schema', recordsDir: 'records', logLevel: 'silent' });
  const fixture = await readFile(resolve(here, 'parsers/fixtures/aia_andi_sample.cdf'));
  // The upload arm's recorder never records on the read path; a plain
  // createFile drops the raw bytes where repoAdapter.getFile reads them.
  await ctx.repoAdapter.createFile({
    path: cdfPath,
    content: Buffer.from(fixture).toString('latin1'),
    message: 'seed u1persist aia cdf fixture',
  });
  await ctx.repoAdapter.createFile({
    path: csvPath,
    content: ['well,channelId,metric,value', 'A1,FITC,RFU,1234.5', ''].join('\n'),
    message: 'seed u1persist plain csv',
  });
  // The parser's OWN trace (the single source of truth this test compares to).
  const { aiaCdfParser } = await import('./parsers/aiaCdfParser.js');
  const parsed = aiaCdfParser.parseBytes(fixture);
  raw = { values: parsed.trace?.values ?? [], samplingIntervalSeconds: parsed.trace?.samplingIntervalSeconds ?? NaN };
}, 600000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

describe('u1persist: the parser-declared trace persists on the measurement record (D3)', () => {
  it('AC1: ingest persists parserInfo.trace (values + samplingIntervalSeconds) and the record validates against the real schema', async () => {
    expect(raw.values.length).toBe(POINTS);
    expect(Number.isFinite(raw.samplingIntervalSeconds)).toBe(true);

    const { recordId } = await new MeasurementService(ctx).ingest({
      parserId: 'aia_andi_cdf',
      rawData: { path: cdfPath },
    });
    expect(recordId).toMatch(/^MSR-\d{6}$/);

    const envelope = await ctx.store.get(recordId);
    expect(envelope, `record ${recordId} must exist`).not.toBeNull();
    const payload = envelope!.payload as Record<string, any>;
    const pi = payload.parserInfo;

    const trace = pi.trace;
    expect(trace, 'parserInfo.trace must be persisted when the parser declares one').toBeDefined();
    expect(Array.isArray(trace?.values)).toBe(true);
    expect(trace.values.length).toBe(POINTS);
    // File order, verbatim — the parser's series, not a resampled copy.
    expect(trace.values[0]).toBeCloseTo(raw.values[0], 3);
    expect(trace.values[POINTS - 1]).toBeCloseTo(raw.values[POINTS - 1], 3);
    expect(trace.values[7876]).toBeCloseTo(252898.8125, 0);
    expect(typeof trace.samplingIntervalSeconds).toBe('number');
    expect(trace.samplingIntervalSeconds).toBeCloseTo(SAMPLING_INTERVAL, 4);

    // In-test Ajv against the REAL schema tree: the persisted record must
    // validate with the trace field present (today: additionalProperties
    // false + no trace field -> the write itself is refused).
    const res = ctx.validator.validate(payload, SCHEMA_ID);
    expect(res.valid, JSON.stringify(res.errors, null, 2)).toBe(true);
  });

  it('AC2: the same record still carries parserInfo.units + parserInfo.metadata verbatim (u0parserinfo non-regression)', async () => {
    const { recordId } = await new MeasurementService(ctx).ingest({
      parserId: 'aia_andi_cdf',
      rawData: { path: cdfPath },
    });
    const pi = ((await ctx.store.get(recordId))!.payload as Record<string, any>).parserInfo;
    expect(pi.units).toEqual({ time: 'seconds', intensity: 'pA' });
    expect(pi.metadata['sample_name']).toBe('RESTEK 35077');
    expect(pi.metadata['detection_method_name']).toBe('RESTEK_H_FAME.M');
    expect(pi.parserId).toBe('aia_andi_cdf');
    expect(typeof pi.parsedAt).toBe('string');
  });

  it('AC4: a parser declaring NO trace (generic_csv) -> parserInfo.trace ABSENT entirely', async () => {
    const { recordId } = await new MeasurementService(ctx).ingest({
      parserId: 'generic_csv',
      rawData: { path: csvPath },
    });
    const pi = ((await ctx.store.get(recordId))!.payload as Record<string, any>).parserInfo;
    expect(pi.parserId).toBe('generic_csv');
    expect('trace' in pi).toBe(false);
    expect(pi.trace).toBeUndefined();
    // Still schema-valid without the field (it is optional, not required).
    const res = ctx.validator.validate((await ctx.store.get(recordId))!.payload, SCHEMA_ID);
    expect(res.valid, JSON.stringify(res.errors, null, 2)).toBe(true);
  });

  it('D3e: validate-parser echoes the trace summary fields (same single trace source as ingest)', async () => {
    const result = await new MeasurementParserValidationService(ctx).validate({
      parserId: 'aia_andi_cdf',
      path: cdfPath,
    });
    const summary = result['trace'];
    expect(summary, 'validate output must echo the trace summary').toBeDefined();
    expect(summary).toMatchObject({
      channelId: 'chromatogram',
      points: POINTS,
    });
    // The SAME single trace source: the echoed interval is the parser's OWN
    // value, byte-identical (the CDF float32 transcribed — never recomputed).
    expect(summary.samplingIntervalSeconds).toBe(raw.samplingIntervalSeconds);
    // Exactly ONE summary object with ONE sampling interval — no second copy
    // of the interval anywhere else in the validate output.
    expect(result['traceSummary']).toBeUndefined();
    const intervalCopies = JSON.stringify(result).match(/samplingIntervalSeconds/g);
    expect(intervalCopies?.length).toBe(1);
  });
});

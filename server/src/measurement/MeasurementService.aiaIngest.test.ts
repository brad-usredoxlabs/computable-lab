/**
 * L2-GC-AIA-CDF-PARSER-1 / u2bind — an AIA/.cdf ingest works end-to-end and
 * the measurement record carries BOTH the instrument's own peak table and
 * the sampled trace through the REAL measurement schema:
 *  - parserId 'aia_andi_cdf' + rawData.path at the committed binary fixture
 *    (seeded byte-exact into the records repo — the GIT arm of the raw-file
 *    seam, which previously decoded raw bytes as utf-8 and mangled .cdf)
 *  - assayType 'gc_fid' (derived from the file's own detector_name)
 *  - payload.data carries the 56-peak table (peak_retention_time/peak_area/
 *    peak_height rows; well = 1-based peak index; channelId 'chromatogram')
 *  - parserInfo.trace carries the full 72801-point ordinate series
 *  - the file-declared units (seconds/pA) echo into parserInfo.units and
 *    metadata; the seconds -> minutes transcription is noted, never silent
 *  - a second ingest with the SAME rawData.path is idempotent-safe per
 *    existing service semantics (a fresh record with the next id; no crash)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementService } from './MeasurementService.js';

const testDir = resolve(process.cwd(), 'tmp/measurement-service-aia-ingest');
const dataDir = resolve('/tmp', 'cl-u2ai-aia-ingest-data');
const fixturePath = 'records/inbox/aia-andi-sample.cdf';
// Bedrock numbers (architect decode of SIGNAL01.cdf; the fixture is the
// ground truth — aiaCdfParser.test.ts carries the full table).
const POINTS = 72801;
const PEAKS = 56;
const PEAK_FIELDS = 18;

type Row = { well: string; metric: string; value: number; channelId?: string; unit?: string; timeMin?: number };

let ctx: AppContext;
let firstRecordId: string;

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, 'config.yaml'), [
    'server:',
    '  logLevel: error',
    `  dataDir: ${dataDir}`,
    `  workspaceDir: ${dataDir}/workspaces`,
    'repositories: []',
    'logging: { level: error }',
    'extraction: { enabled: false, runner: { enabled: false } }',
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');
  ctx = await initializeApp(process.cwd(), { schemaDir: '../schema', recordsDir: 'records', logLevel: 'silent' });
  // Seed the committed binary fixture into the records repository (the git
  // arm): a byte-exact copy, exactly what "the committed fixture" is.
  const worktree = (ctx.repoAdapter as { worktreePath?: string }).worktreePath;
  expect(worktree).toBeTruthy();
  await mkdir(resolve(worktree, 'records', 'inbox'), { recursive: true });
  await copyFile(
    resolve(process.cwd(), 'src/measurement/parsers/fixtures/aia_andi_sample.cdf'),
    resolve(worktree, fixturePath),
  );
}, 600000);
afterAll(async () => {
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

async function payloadOf(recordId: string): Promise<Record<string, any>> {
  const env = await ctx.store.get(recordId);
  expect(env, `record ${recordId} must exist`).not.toBeNull();
  return env!.payload as Record<string, any>;
}

describe('u2bind: aia .cdf ingest end-to-end (the parser data through the ingest seam)', () => {
  it('AC1: ingest returns a record id; the stored record is gc_fid / aia_andi_cdf with the declared units echoed', async () => {
    const { recordId } = await new MeasurementService(ctx).ingest({
      parserId: 'aia_andi_cdf',
      rawData: { path: fixturePath },
    });
    firstRecordId = recordId;
    expect(recordId).toMatch(/^MSR-\d{6}$/);
    const p = await payloadOf(recordId);
    expect(p.assayType).toBe('gc_fid');
    expect(p.parserInfo.parserId).toBe('aia_andi_cdf');
    expect(p.parserInfo.parserVersion).toBe('1.0.0');
    // The file's own declared units, verbatim (seconds/pA) — never a default.
    expect(p.parserInfo.units).toEqual({ time: 'seconds', intensity: 'pA' });
    expect(p.channels).toEqual([{ channelId: 'chromatogram' }]);
    expect(p.shape.wells).toBe(PEAKS);
    expect(p.shape.channels).toBe(1);
    expect(p.artifacts[0].role).toBe('raw_data');
    expect(p.artifacts[0].fileRef.file_name).toBe('aia-andi-sample.cdf');
    expect(p.artifacts[0].fileRef.stored_path).toBe(fixturePath);
    expect(p.artifacts[0].fileRef.media_type).toBe('application/x-netcdf');
  }, 120000);

  it('AC2: the payload carries the instrument\'s own 56-peak table AND the sampled trace', async () => {
    const p = await payloadOf(firstRecordId);
    const rows = p.data as Row[];
    expect(rows.length).toBe(PEAKS * PEAK_FIELDS);
    const rt = rows.filter((r) => r.metric === 'peak_retention_time');
    expect(rt.length).toBe(PEAKS);
    for (const r of rt) expect(r.channelId).toBe('chromatogram');
    const distinctMetrics = new Set(rows.map((r) => r.metric));
    expect(distinctMetrics.size).toBeGreaterThanOrEqual(10);
    for (const m of ['peak_retention_time', 'peak_area', 'peak_height', 'peak_area_percent']) {
      expect(distinctMetrics.has(m)).toBe(true);
    }
    // well = the 1-based peak index, one per peak.
    const wells = new Set(rt.map((r) => r.well));
    expect(wells.size).toBe(PEAKS);
    expect(wells.has('1')).toBe(true);
    expect(wells.has(String(PEAKS))).toBe(true);
    // Retention is labelled minutes (timeMin) with the file's declared unit
    // on the row — seconds, never silently relabelled.
    const first = rt[0];
    expect(first?.unit).toBe('seconds');
    expect(first?.timeMin).toBeCloseTo(first?.value / 60, 6);
    // The sampled trace: the full ordinate series rides on parserInfo.trace.
    const trace = p.parserInfo.trace;
    expect(trace).toBeDefined();
    expect(trace.values.length).toBe(POINTS);
    expect(trace.samplingIntervalSeconds).toBeCloseTo(0.05, 4);
  }, 120000);

  it('AC3: the declared units echo into parserInfo/metadata and the area% closes at 100.00', async () => {
    const p = await payloadOf(firstRecordId);
    const m = p.parserInfo.metadata;
    expect(m['sample_name']).toBe('RESTEK 35077');
    expect(m['retention_unit']).toBe('seconds');
    expect(m['detector_unit']).toBe('pA');
    // The seconds -> minutes transcription is stated in the record, not silent.
    expect(m['time_axis']).toContain('retention in seconds');
    const rows = p.data as Row[];
    const sumPct = rows.filter((r) => r.metric === 'peak_area_percent').reduce((a, r) => a + r.value, 0);
    expect(Math.abs(sumPct - 100.0)).toBeLessThan(0.01);
  }, 120000);

  it('AC4: a second ingest of the SAME path is idempotent-safe (fresh next-id record, no crash)', async () => {
    const { recordId } = await new MeasurementService(ctx).ingest({
      parserId: 'aia_andi_cdf',
      rawData: { path: fixturePath },
    });
    // Existing service semantics: ingest has no path-dedup — the second
    // ingest is a NEW record with the next id; the same file is re-read and
    // re-parsed cleanly. Observed behaviour, pinned here.
    expect(recordId).toMatch(/^MSR-\d{6}$/);
    expect(recordId).not.toBe(firstRecordId);
    const p = await payloadOf(recordId);
    expect(p.assayType).toBe('gc_fid');
    expect(p.parserInfo.parserId).toBe('aia_andi_cdf');
    const rows = p.data as Row[];
    expect(rows.filter((r) => r.metric === 'peak_retention_time').length).toBe(PEAKS);
    expect(p.parserInfo.trace.values.length).toBe(POINTS);
  }, 120000);
});

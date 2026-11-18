/**
 * L2-GC-UPLOAD-UI-1 / u0parserinfo — the record PERSISTS the parser's declared
 * units + preamble metadata (parserInfo.units/metadata) through the REAL
 * measurement schema: the file's values, never a friendly default; omitted
 * when the parser declares none. Booted on the REAL schema tree (the
 * capabilityGate pattern + CONFIG_PATH block) so the REAL schema validates.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementService } from './MeasurementService.js';
const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';
const testDir = resolve(process.cwd(), 'tmp/measurement-service-parserinfo-prov');
const dataDir = resolve('/tmp', 'cl-u0pi-parserinfo-data');
const fixturePath = 'records/inbox/u0pi-chemstation.csv';
const genericCsvPath = 'records/inbox/u0pi-generic.csv';
let ctx: AppContext;
beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, 'config.yaml'), [
    'server:', '  logLevel: error', `  dataDir: ${dataDir}`, `  workspaceDir: ${dataDir}/workspaces`,
    'repositories: []', 'logging: { level: error }', 'extraction: { enabled: false, runner: { enabled: false } }',
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');
  ctx = await initializeApp(process.cwd(), { schemaDir: '../schema', recordsDir: 'records', logLevel: 'silent' });
  const fixture = await readFile(resolve(process.cwd(), 'src/measurement/parsers/fixtures/agilent6890_chemstation_sample.csv'), 'utf-8');
  await ctx.repoAdapter.createFile({ path: fixturePath, content: fixture, message: 'seed u0parserinfo fixture' });
  await ctx.repoAdapter.createFile({ path: genericCsvPath, content: ['well,channelId,metric,value', 'A1,FITC,RFU,1234.5', ''].join('\n'), message: 'seed u0parserinfo plain csv' });
}, 600000);
afterAll(async () => {
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});
async function payloadOf(recordId: string) {
  const env = await ctx.store.get(recordId);
  expect(env, `record ${recordId} must exist`).not.toBeNull();
  return env!.payload as Record<string, any>;
}
describe('u0parserinfo: persist the parser-declared units + preamble metadata', () => {
  it('AC1: agilent6890 on the ChemStation fixture persists units + metadata VERBATIM (the file, not a default)', async () => {
    const { recordId } = await new MeasurementService(ctx).ingest({ parserId: 'agilent6890', rawData: { path: fixturePath } });
    expect(recordId).toMatch(/^MSR-\d{6}$/);
    const pi = (await payloadOf(recordId)).parserInfo;
    expect(pi.units).toEqual({ time: 'min', intensity: 'pA' });
    expect(pi.metadata['Instrument']).toBe('6890N GC (ChemStation G1106BA)');
    expect(pi.metadata['Method']).toBe('GC-FID-Baseline07.met');
    expect(pi.metadata['Injection Date']).toBe('14-NOV-2026 08:15:02');
    expect(pi.parserId).toBe('agilent6890');
    expect(pi.parserVersion).toBe('1.0.0');
    expect(typeof pi.parsedAt).toBe('string');
  });
  it('GUARD: generic_csv declares no units/metadata -> the record carries NEITHER key (absent, not null/undefined/unknown)', async () => {
    const { recordId } = await new MeasurementService(ctx).ingest({ parserId: 'generic_csv', rawData: { path: genericCsvPath } });
    const pi = (await payloadOf(recordId)).parserInfo;
    expect(pi.parserId).toBe('generic_csv');
    expect(pi).toHaveProperty('parserVersion');
    expect('units' in pi).toBe(false);
    expect('metadata' in pi).toBe(false);
  });
  it('AC2 (closed object): an UNKNOWN field under parserInfo (rowCount) is still refused; units/metadata validate clean', async () => {
    const base = { kind: 'measurement', recordId: 'MSR-PROV-AC2', title: 'prov AC2', assayType: 'other', data: [{ well: 'A1', metric: 'RFU', value: 1 }] };
    const prov = { parserId: 'generic_csv', parserVersion: '0.1.0', parsedAt: '2026-11-14T00:00:00.000Z' };
    const refused = ctx.validator.validate({ ...base, parserInfo: { ...prov, rowCount: 42 } }, SCHEMA_ID);
    expect(refused.valid).toBe(false);
    const r = refused.errors.find((e) => e.path === '/parserInfo');
    expect(r?.keyword).toBe('additionalProperties');
    expect((r?.params as { additionalProperty?: string })?.additionalProperty).toBe('rowCount');
    const accepted = ctx.validator.validate({ ...base, parserInfo: { ...prov, units: { time: 'min', intensity: 'pA' }, metadata: { Instrument: 'x' } } }, SCHEMA_ID);
    expect(accepted.valid, JSON.stringify(accepted.errors)).toBe(true);
  });
});

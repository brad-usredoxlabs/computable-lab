/**
 * L2-GC-UPLOAD-UI-1 / u0parserinfo — the measurement record PERSISTS the
 * parser's own declared units and preamble metadata (parserInfo.units,
 * parserInfo.metadata) through the REAL measurement schema.
 *
 * What the FILE said is what the record says — never a friendly default:
 *   1. the ChemStation fixture ingested with parserId 'agilent6890' persists
 *      parserInfo.units verbatim ({ time: 'min', intensity: 'pA' } — the
 *      header's bracket tokens, 'unstated' where absent) and the preamble's
 *      Instrument / Method / 'Injection Date' verbatim (AC1). At base this
 *      FAILS: parserInfo declares additionalProperties: false and no
 *      units/metadata property, so the REAL schema refuses the write;
 *   2. GUARD: a parser that declares NO units (generic_csv) persists a
 *      parserInfo with NO units key and NO metadata key — absent, not
 *      null/undefined/'unknown'; the service omits rather than invents;
 *   3. AC2 closed: an UNKNOWN extra field under parserInfo (rowCount) is
 *      still REFUSED by the real schema — the object stays closed.
 *
 * Harness: the capabilityGate boot pattern (MeasurementService.
 * capabilityGate.test.ts:105-109 + its CONFIG_PATH block) — schemaDir
 * '../schema' so the REAL measurement.schema.yaml is the schema the store
 * validates against (the fixture-schema test cannot prove this). The raw
 * ChemStation CSV is copied by the test itself from the parser's shipped
 * fixture into the fresh dataDir records tree (the parsers/ source tree is
 * read-only for this unit); CONFIG_PATH pins to a throwaway /tmp dataDir so
 * no durable-store counter is involved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementService } from './MeasurementService.js';

const MEASUREMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';

const testDir = resolve(process.cwd(), 'tmp/measurement-service-parserinfo-prov');
// Local disk (not the NFS worktree): the embedded-git store seeds records/seed
// into a fresh dataDir; git commits on NFS are too slow for the hook budget.
const dataDir = resolve('/tmp', 'cl-u0pi-parserinfo-data');
const fixturePath = 'records/inbox/u0pi-chemstation.csv';
const genericCsvPath = 'records/inbox/u0pi-generic.csv';

let ctx: AppContext;

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  // Isolation: pin CONFIG_PATH to a throwaway config so every minted record
  // lands under /tmp and dies in afterAll (no durable-counter drift in play).
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

  // Boot against the REAL schema tree: the measurement write is validated
  // against the REAL measurement.schema.yaml (parserInfo, closed object).
  ctx = await initializeApp(process.cwd(), {
    schemaDir: '../schema',
    recordsDir: 'records',
    logLevel: 'silent',
  });

  // Seed the parser's SHIPPED ChemStation fixture into the test records dir.
  const fixtureContent = await readFile(
    resolve(process.cwd(), 'src/measurement/parsers/fixtures/agilent6890_chemstation_sample.csv'),
    'utf-8',
  );
  await ctx.repoAdapter.createFile({
    path: fixturePath,
    content: fixtureContent,
    message: 'seed ChemStation fixture for u0parserinfo provenance test',
  });
  // A plain table: what generic_csv (which declares NO units/metadata) parses.
  await ctx.repoAdapter.createFile({
    path: genericCsvPath,
    content: ['well,channelId,metric,value', 'A1,FITC,RFU,1234.5', ''].join('\n'),
    message: 'seed plain CSV for u0parserinfo omission guard',
  });
}, 600000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

async function measurementPayload(recordId: string): Promise<Record<string, any>> {
  const envelope = await ctx.store.get(recordId);
  expect(envelope, `record ${recordId} must exist after ingest`).not.toBeNull();
  return (envelope!.payload ?? {}) as Record<string, any>;
}

describe('u0parserinfo: the record persists the parser-declared units and preamble metadata', () => {
  it('AC1: ingesting the ChemStation fixture with agilent6890 persists units and metadata VERBATIM (the file said it, not a default)', async () => {
    const service = new MeasurementService(ctx);
    const { recordId } = await service.ingest({
      parserId: 'agilent6890',
      rawData: { path: fixturePath },
    });
    expect(recordId).toMatch(/^MSR-\d{6}$/);
    const payload = await measurementPayload(recordId);
    const parserInfo = payload.parserInfo as Record<string, any>;
    // Units are the header's bracket tokens, transcribed — never assumed.
    expect(parserInfo.units).toEqual({ time: 'min', intensity: 'pA' });
    // The preamble is transcribed verbatim: Instrument, Method, Injection Date.
    expect(parserInfo.metadata['Instrument']).toBe('6890N GC (ChemStation G1106BA)');
    expect(parserInfo.metadata['Method']).toBe('GC-FID-Baseline07.met');
    expect(parserInfo.metadata['Injection Date']).toBe('14-NOV-2026 08:15:02');
    // The three provenance fields are unchanged in kind for every parser.
    expect(parserInfo.parserId).toBe('agilent6890');
    expect(parserInfo.parserVersion).toBe('1.0.0');
    expect(typeof parserInfo.parsedAt).toBe('string');
  });

  it('GUARD: generic_csv declares no units/metadata, so the record carries NEITHER key (absent, not null/undefined/unknown)', async () => {
    const service = new MeasurementService(ctx);
    const { recordId } = await service.ingest({
      parserId: 'generic_csv',
      rawData: { path: genericCsvPath },
    });
    expect(recordId).toMatch(/^MSR-\d{6}$/);
    const payload = await measurementPayload(recordId);
    const parserInfo = payload.parserInfo as Record<string, any>;
    expect(parserInfo.parserId).toBe('generic_csv');
    expect(parserInfo, 'parserInfo must still carry the three provenance fields').toHaveProperty('parserVersion');
    expect('units' in parserInfo).toBe(false);
    expect('metadata' in parserInfo).toBe(false);
  });

  it('AC2 (closed object): an unknown field under parserInfo (rowCount) is still refused by the REAL schema; units/metadata validate clean', async () => {
    const base = {
      kind: 'measurement',
      recordId: 'MSR-PROV-AC2',
      title: 'provenance AC2 probe',
      assayType: 'other',
      data: [{ well: 'A1', metric: 'RFU', value: 1 }],
    };
    const provenance = {
      parserId: 'generic_csv',
      parserVersion: '0.1.0',
      parsedAt: '2026-11-14T00:00:00.000Z',
    };
    // The closed object stays closed: an UNKNOWN extra field is refused,
    // and the refusal names parserInfo/additionalProperties/rowCount.
    const refused = ctx.validator.validate(
      { ...base, parserInfo: { ...provenance, rowCount: 42 } },
      MEASUREMENT_SCHEMA_ID,
    );
    expect(refused.valid).toBe(false);
    const refusal = refused.errors.find((e) => e.path === '/parserInfo');
    expect(refusal, 'the refusal must land on parserInfo (object stays closed)').toBeDefined();
    expect(refusal?.keyword).toBe('additionalProperties');
    expect((refusal?.params as { additionalProperty?: string } | undefined)?.additionalProperty).toBe('rowCount');
    // The widened properties are accepted: units + metadata validate clean.
    const accepted = ctx.validator.validate(
      {
        ...base,
        parserInfo: {
          ...provenance,
          units: { time: 'min', intensity: 'pA' },
          metadata: { Instrument: '6890N GC (ChemStation G1106BA)' },
        },
      },
      MEASUREMENT_SCHEMA_ID,
    );
    expect(accepted.valid, `units/metadata must be accepted by the real schema; got: ${JSON.stringify(accepted.errors)}`).toBe(true);
  });
});

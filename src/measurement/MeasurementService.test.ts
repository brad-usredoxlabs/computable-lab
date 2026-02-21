import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementService } from './MeasurementService.js';

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

describe('MeasurementService', () => {
  const testDir = resolve(process.cwd(), 'tmp/measurement-service-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records/inbox'), { recursive: true });
    await writeFile(resolve(testDir, 'schema/measurement.schema.yaml'), measurementSchema);
    await writeFile(
      resolve(testDir, 'records/inbox/gemini.csv'),
      [
        'well,channelId,metric,value,unit',
        'A1,FITC,RFU,1234.5,RFU',
        'A2,FITC,RFU,1100.1,RFU',
        '',
      ].join('\n'),
    );

    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('ingests gemini csv into a measurement record', async () => {
    const service = new MeasurementService(ctx);
    const result = await service.ingest({
      parserId: 'gemini_csv',
      rawData: { path: 'records/inbox/gemini.csv' },
      instrumentRef: { kind: 'record', id: 'INSTR-GEMINI', type: 'instrument' },
    });

    expect(result.recordId).toBe('MSR-000001');
    const envelope = await ctx.store.get(result.recordId);
    expect(envelope).not.toBeNull();
    const payload = envelope!.payload as { assayType: string; data: unknown[] };
    expect(payload.assayType).toBe('plate_reader');
    expect(payload.data.length).toBe(2);
  });
});

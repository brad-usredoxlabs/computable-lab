import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementParserValidationService } from './MeasurementParserValidationService.js';

describe('MeasurementParserValidationService', () => {
  const testDir = resolve(process.cwd(), 'tmp/measurement-parser-validation-service-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records/inbox'), { recursive: true });
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

  it('parses and summarizes raw data without writing measurement records', async () => {
    const service = new MeasurementParserValidationService(ctx);
    const result = await service.validate({
      parserId: 'gemini_csv',
      path: 'records/inbox/gemini.csv',
    });

    expect(result['parserId']).toBe('gemini_csv');
    expect(result['assayType']).toBe('plate_reader');
    expect(result['rows']).toBe(2);
    expect(Array.isArray(result['preview'])).toBe(true);
    const measurements = await ctx.store.list({ kind: 'measurement', limit: 10 });
    expect(measurements.length).toBe(0);
  });
});

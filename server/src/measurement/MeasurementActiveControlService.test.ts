import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { MeasurementActiveControlService } from './MeasurementActiveControlService.js';
import { LABOS_BRIDGE_CONTRACT_VERSION } from '../execution/sidecar/BridgeContracts.js';

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

describe('MeasurementActiveControlService', () => {
  const testDir = resolve(process.cwd(), 'tmp/measurement-active-control-service-test');
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

  it('runs active read sidecar and ingests resulting measurement', async () => {
    const fakeSidecar = {
      run: async () => ({
        ok: true,
        exitCode: 0,
        stdout: JSON.stringify({
          contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
          adapterId: 'molecular_devices_gemini',
          operation: 'active_read',
          result: {
            rawDataPath: 'records/inbox/gemini.csv',
            status: 'completed',
            parserId: 'gemini_csv',
          },
        }),
        stderr: '',
      }),
    };
    const service = new MeasurementActiveControlService(ctx, fakeSidecar as never);
    const result = await service.performActiveRead({
      adapterId: 'molecular_devices_gemini',
      instrumentRef: { kind: 'record', id: 'INSTR-GEMINI', type: 'instrument' },
    });

    expect(result.measurementId).toBe('MSR-000001');
    expect(result.logId).toBe('ILOG-000001');
    expect(result.rawDataPath).toBe('records/inbox/gemini.csv');

    const measurement = await ctx.store.get(result.measurementId);
    const payload = measurement?.payload as { assayType?: string; data?: unknown[] };
    expect(payload.assayType).toBe('plate_reader');
    expect(payload.data?.length).toBe(2);
  });

  it('supports simulator fixture generation for Gemini without sidecar', async () => {
    const fakeSidecar = {
      run: async () => ({
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: 'should not be called in simulator mode',
      }),
    };
    const service = new MeasurementActiveControlService(ctx, fakeSidecar as never);
    const result = await service.performActiveRead({
      adapterId: 'molecular_devices_gemini',
      outputPath: 'records/inbox/gemini_simulated.csv',
      parameters: {
        simulate: true,
        mode: 'fluorescence',
        wavelengthNm: 520,
      },
    });
    expect(result.rawDataPath).toBe('records/inbox/gemini_simulated.csv');
    const raw = await ctx.repoAdapter.getFile(result.rawDataPath);
    expect(raw?.content).toContain('well,channelId,metric,value,unit');
  });

  it('rejects invalid adapter parameters', async () => {
    const service = new MeasurementActiveControlService(ctx);
    await expect(service.performActiveRead({
      adapterId: 'molecular_devices_gemini',
      parameters: {
        badKey: true,
      },
    })).rejects.toThrow(/Invalid active-read parameters/);
  });

  it('uses Gemini HTTP bridge when configured', async () => {
    process.env['LABOS_GEMINI_READ_URL'] = 'http://gemini.local/read';
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
        adapterId: 'molecular_devices_gemini',
        operation: 'active_read',
        result: {
          rawDataPath: 'records/inbox/gemini.csv',
          status: 'completed',
          parserId: 'gemini_csv',
        },
      }),
    });
    const fakeSidecar = {
      run: async () => ({
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: 'bridge mode should bypass sidecar',
      }),
    };
    const service = new MeasurementActiveControlService(ctx, fakeSidecar as never, undefined, fakeFetch as never);
    const result = await service.performActiveRead({
      adapterId: 'molecular_devices_gemini',
      parameters: { mode: 'fluorescence' },
    });
    expect(result.measurementId).toBe('MSR-000003');
    delete process.env['LABOS_GEMINI_READ_URL'];
  });

  it('rejects invalid Gemini bridge response when strict contract mode is enabled', async () => {
    process.env['LABOS_GEMINI_READ_URL'] = 'http://gemini.local/read';
    process.env['LABOS_SIDECAR_CONTRACT_STRICT'] = '1';
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '{"rawDataPath":"records/inbox/gemini.csv"}',
    });
    const service = new MeasurementActiveControlService(ctx, undefined, undefined, fakeFetch as never);
    await expect(service.performActiveRead({
      adapterId: 'molecular_devices_gemini',
      parameters: { mode: 'fluorescence' },
    })).rejects.toThrow(/Invalid Gemini active_read response contract/);
    delete process.env['LABOS_GEMINI_READ_URL'];
    delete process.env['LABOS_SIDECAR_CONTRACT_STRICT'];
  });
});

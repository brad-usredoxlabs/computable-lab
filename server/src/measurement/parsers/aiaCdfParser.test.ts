// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiaCdfParser } from './aiaCdfParser.js';
import { MeasurementServiceError } from '../MeasurementService.js';

const here = dirname(fileURLToPath(import.meta.url));
const bytes = readFileSync(join(here, 'fixtures', 'aia_andi_sample.cdf'));

// Bedrock numbers (architect decode of SIGNAL01.cdf, 297212 B; the file is the
// ground truth — these are what the real fixture holds).
const POINTS = 72801;
const PEAKS = 56;
const SAMPLING_INTERVAL = 0.05;
const RUN_LENGTH = 3640.05;
const SUM_AREA = 4419619.74;
const SUM_AREA_PERCENT = 100.0;
// data[] carries the 56-peak table as one row per peak field (18 x 56 = 1008
// rows); the trace is summarized in metadata.
const PEAK_FIELDS = 18;

type Row = { metric: string; value: number; well: string; timeMin?: number; unit?: string };
const rowsByMetric = (data: Row[], metric: string): Row[] => data.filter((row) => row.metric === metric);

function expectRefusal(fn: () => unknown, token: string): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(MeasurementServiceError);
    const me = err as MeasurementServiceError;
    expect(me.code).toBe('BAD_REQUEST');
    expect(me.statusCode).toBe(400);
    expect(me.message).toContain(token);
    return;
  }
  throw new Error(`expected a refusal naming ${token} but the parse succeeded`);
}

describe('aiaAndiCdf parser (unit u1parser)', () => {
  it('refuses a non-CDF buffer with the named AIA_CDF_MAGIC token (no silent empty result)', () => {
    expectRefusal(() => aiaCdfParser.parseBytes(Buffer.alloc(1024)), 'AIA_CDF_MAGIC');
    expectRefusal(() => aiaCdfParser.parse('this is not a netcdf file at all'), 'AIA_CDF_MAGIC');
    expectRefusal(() => aiaCdfParser.parseBytes(Buffer.from('43444601', 'hex')), 'AIA_CDF_MAGIC');
  });

  it('echoes the file-declared units (seconds/pA) and the run metadata verbatim', () => {
    const result = aiaCdfParser.parseBytes(bytes);
    expect(result.parserId).toBe('aia_andi_cdf');
    expect(result.assayType).toBe('gc_ms');
    expect(result.mimeType).toBe('application/x-netcdf');
    expect(result.units).toEqual({ time: 'seconds', intensity: 'pA' });
    const m = result.metadata;
    expect(m?.['sample_name']).toBe('RESTEK 35077');
    expect(m?.['operator_name']).toBe('Brad');
    expect(m?.['detection_method_name']).toBe('RESTEK_H_FAME.M');
    expect(m?.['injection_date_time_stamp']).toBe('20261024082445+0000');
    expect(m?.['source_file_reference']).toContain('20201024-RESTEK-RESTEK-H.D');
    expect(m?.['detector_name']).toBe('FID1 A, ');
    // The declared units are the file's words, not a default.
    expect(m?.['retention_unit']).toBe('seconds');
    expect(m?.['detector_unit']).toBe('pA');
  });

  it('reports the trace summary from the file (72801 points, 0.05 s interval, 3640.05 s run)', () => {
    const result = aiaCdfParser.parseBytes(bytes);
    const m = result.metadata;
    expect(m?.['trace_points']).toBe(String(POINTS));
    expect(Math.abs(Number(m?.['sampling_interval_seconds']) - SAMPLING_INTERVAL)).toBeLessThan(1e-4);
    expect(Math.abs(Number(m?.['run_time_length_seconds']) - RUN_LENGTH)).toBeLessThan(0.01);
  });

  it('emits the 56-peak table as rows keyed by retention time (one metric per peak field)', () => {
    const result = aiaCdfParser.parseBytes(bytes);
    expect(result.data.length).toBe(PEAKS * PEAK_FIELDS);
    const rt = rowsByMetric(result.data, 'peak_retention_time');
    expect(rt.length).toBe(PEAKS);
    // Retention times are strictly increasing (file order is preserved);
    // timeMin is the declared seconds / 60, with the conversion noted in metadata.
    for (let i = 1; i < rt.length; i += 1) {
      expect(rt[i]?.value).toBeGreaterThan(rt[i - 1]?.value);
    }
    const first = rt[0];
    expect(first?.value).toBeCloseTo(294.2264099121094, 3);
    expect(first?.timeMin).toBeCloseTo(first?.value! / 60, 6);
    for (const field of [
      'peak_start_time',
      'peak_end_time',
      'peak_width',
      'peak_area',
      'peak_area_percent',
      'peak_height',
      'peak_height_percent',
      'peak_asymmetry',
      'baseline_start_time',
      'baseline_start_value',
      'baseline_stop_time',
      'baseline_stop_value',
      'migration_time',
      'peak_area_square_root',
      'peak_start_detection_code',
      'peak_stop_detection_code',
      'manually_reintegrated_peaks',
    ]) {
      expect(rowsByMetric(result.data, field).length).toBe(PEAKS);
    }
    // Declared units attach to the right rows; fields the file declares no
    // unit for carry no unit (never a default).
    expect(rowsByMetric(result.data, 'peak_height')[0]?.unit).toBe('pA');
    expect(rowsByMetric(result.data, 'peak_start_time')[0]?.unit).toBe('seconds');
    expect(rowsByMetric(result.data, 'peak_area')[0]?.unit).toBeUndefined();
  });

  it('keeps area and area% unswapped: sum(peak_area_percent)=100.00, sum(peak_area)=4419619.74', () => {
    const result = aiaCdfParser.parseBytes(bytes);
    const sumPct = rowsByMetric(result.data, 'peak_area_percent').reduce((acc, r) => acc + r.value, 0);
    const sumArea = rowsByMetric(result.data, 'peak_area').reduce((acc, r) => acc + r.value, 0);
    expect(Math.abs(sumPct - SUM_AREA_PERCENT)).toBeLessThan(0.01);
    expect(Math.abs(sumArea - SUM_AREA)).toBeLessThan(0.01);
  });
});

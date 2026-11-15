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
// rows) keyed by peak index on channel 'chromatogram'; the full ordinate
// series is carried on result.trace (summarized in metadata as well).
const PEAK_FIELDS = 18;

type Row = { metric: string; value: number; well: string; channelId?: string; timeMin?: number; unit?: string };
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
    expect(result.assayType).toBe('gc_fid');
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

  it('derives assayType gc_fid from the file detector and carries the full ordinate trace (D2, D3)', () => {
    const result = aiaCdfParser.parseBytes(bytes);
    // D2: the file declares detector_name "FID1 A," / detector_unit pA, so the
    // result says gc_fid — and where the type came from is noted in metadata.
    expect(result.assayType).toBe('gc_fid');
    expect(result.metadata?.['assay_type_source']).toBe('detector_name');
    // D3: the ordinate series itself is carried, in file order, on the same
    // sampling interval metadata already reports (0.05 s per point).
    const trace = result.trace;
    expect(trace).toBeDefined();
    expect(trace?.channelId).toBe('chromatogram');
    expect(trace?.values.length).toBe(POINTS);
    expect(trace?.samplingIntervalSeconds).toBeCloseTo(SAMPLING_INTERVAL, 4);
    expect(trace?.timeUnit).toBe('seconds');
    expect(trace?.intensityUnit).toBe('pA');
    // Baseline ends measured on this file: first sample 9.7135 pA, last sample
    // 17.0548 pA (index 72800) — the trace closes above baseline, not at it.
    expect(Math.abs(trace?.values[0] - 9.7135)).toBeLessThan(0.01);
    expect(Math.abs(trace?.values[trace?.values.length - 1] - 17.0548)).toBeLessThan(0.01);
    // The 6.56 min peak: apex index 7876 = 6.5633 min, measured 252898.8125 pA
    // (an apex 21% low fails). Index 7872 (6.56 min) is 0.2 s early and reads
    // 252264.203125, so it is only a secondary lower bound.
    expect(trace?.values[7876]).toBeCloseTo(252898.8125, 0);
    expect(trace?.values[7872]).toBeGreaterThan(250000);
  });

  it('names a fallback assay_type_source when detector_name is unrecognized or empty (D2)', () => {
    // Same-length rewrite of the declared detector_name inside the real fixture:
    // the CDF offsets and every other value stay byte-identical.
    const withDetector = (to: string): Buffer => {
      const buf = Buffer.from(bytes);
      const at = buf.indexOf('FID1 A, \0', 0, 'latin1');
      expect(at).toBeGreaterThan(0);
      Buffer.from(to, 'latin1').copy(buf, at);
      return buf;
    };
    // TCD is a real GC detector this parser does not map yet: keep today's
    // gc_ms fallback but SAY it was a fallback and which name it could not map.
    const tcd = aiaCdfParser.parseBytes(withDetector('TCD1 A, \0'));
    expect(tcd.assayType).toBe('gc_ms');
    const tcdSource = tcd.metadata?.['assay_type_source'] ?? '';
    expect(tcdSource).toContain('fallback');
    expect(tcdSource).not.toBe('detector_name');
    expect(tcdSource).toContain('TCD1 A,');
    // A declared-but-blank detector_name is equally a fallback, not a derivation.
    const blank = aiaCdfParser.parseBytes(withDetector('\0\0\0\0\0\0\0\0\0'));
    const blankSource = blank.metadata?.['assay_type_source'] ?? '';
    expect(blankSource).toContain('fallback');
    expect(blankSource).not.toBe('detector_name');
    expect(blankSource).toContain('empty');
  });

  it('emits the 56-peak table keyed by peak index on the chromatogram channel (one metric per peak field)', () => {
    const result = aiaCdfParser.parseBytes(bytes);
    expect(result.data.length).toBe(PEAKS * PEAK_FIELDS);
    const rt = rowsByMetric(result.data, 'peak_retention_time');
    expect(rt.length).toBe(PEAKS);
    // D1: a chromatogram has no wells — `well` is the 1-based peak index and
    // every row names its channel. The retention time lives in the
    // peak_retention_time value and timeMin, nowhere else.
    const seenWells = new Set<string>();
    for (const row of result.data) {
      expect(row.channelId).toBe('chromatogram');
      seenWells.add(row.well);
    }
    expect(seenWells.size).toBe(PEAKS);
    for (let i = 1; i <= PEAKS; i += 1) {
      expect(seenWells.has(String(i))).toBe(true);
    }
    for (const row of rt) {
      expect(row.well).toBe(String(Number(row.well)));
      const v = row.value!;
      expect(v).toBeGreaterThan(0);
      expect(Number.isFinite(v / 60)).toBe(true);
    }
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

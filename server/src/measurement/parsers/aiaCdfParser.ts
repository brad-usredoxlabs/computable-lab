import { MeasurementServiceError } from '../MeasurementService.js';
import type { MeasurementParseResult, MeasurementParser, MeasurementRow } from './types.js';

// ANDI/AIA .cdf parser (NetCDF-3-classic flavor) for GC-FID signal files — the
// format Brad's real data arrives in (task L2-GC-AIA-CDF-PARSER-1).
//
// Layout, verified against fixtures/aia_andi_sample.cdf (297212 B; the file is
// the ground truth): big-endian throughout.
//   [0..4) magic 'CDF' + version 0x01; [4..8) numrecs (0 = no unlimited dim)
//   dim_list  tag 10 + count; per dim: [name][size]
//   gatt_list tag 12 + count; per attr: [name][type][n][value padded to 4]
//   var_list  tag 11 + count; per var:
//     [name][ndims][dim refs][reserved word][natts][attrs][type][nbytes][begin]
//   where name = u32 length + bytes padded to 4, and begin is an ABSOLUTE file
//   offset; the data sections are contiguous from the smallest begin to EOF.
//   FORMAT QUIRK (this writer): the reserved word is 0 for 23 of 24 variables
//   (12 on the trace variable) — a strict classic reader that consumes a zero
//   tag as END_LIST drifts 4 bytes and mis-parses every later variable. It is
//   skipped here, and every variable (the first two included) is asserted
//   sane: known type, nbytes == dim product x element size, begin + nbytes
//   inside the file.
//
// Every number in the result comes from the file, units included (the file
// declares retention_unit and detector_unit; neither is defaulted). The only
// conversion is seconds -> minutes for timeMin, noted in metadata. The full
// ordinate series is carried on result.trace (and summarized in metadata);
// the 56-peak table is emitted as rows keyed by the 1-based peak index on the
// 'chromatogram' channel, one row per peak field. The assayType is derived
// from the file's detector_name (gc_fid / gc_ms), with the source noted in
// metadata['assay_type_source'].

const NC_CHAR = 2;
const NC_SHORT = 3;
const NC_FLOAT = 5;
const TYPE_SIZES: Record<number, number> = { [NC_CHAR]: 1, [NC_SHORT]: 2, [NC_FLOAT]: 4 };
// Element size per peak-field kind (float32 / char / int16), for the data rows.
const PEAK_ELEM_SIZES: Record<'float' | 'char' | 'short', number> = { float: 4, char: 1, short: 2 };

// Peak fields in file order; unitKey names the file's declared unit axis the
// field lives on, or null where the file declares none (the unit is then
// absent from the row, never defaulted).
type PeakField = { name: string; kind: 'float' | 'char' | 'short'; unitKey: 'time' | 'intensity' | null };
const PEAK_FIELDS: PeakField[] = [
  ['peak_retention_time', 'float', 'time'], ['peak_start_time', 'float', 'time'],
  ['peak_end_time', 'float', 'time'], ['peak_width', 'float', 'time'],
  ['peak_area', 'float', null], ['peak_area_percent', 'float', null],
  ['peak_height', 'float', 'intensity'], ['peak_height_percent', 'float', null],
  ['peak_asymmetry', 'float', null], ['baseline_start_time', 'float', 'time'],
  ['baseline_start_value', 'float', 'intensity'], ['baseline_stop_time', 'float', 'time'],
  ['baseline_stop_value', 'float', 'intensity'], ['migration_time', 'float', 'time'],
  ['peak_area_square_root', 'float', null], ['peak_start_detection_code', 'char', null],
  ['peak_stop_detection_code', 'char', null], ['manually_reintegrated_peaks', 'short', null],
].map(([name, kind, unitKey]) => ({ name, kind, unitKey } as unknown as PeakField));

const refuse = (token: string, detail: string): MeasurementServiceError =>
  new MeasurementServiceError('BAD_REQUEST', `${token}: ${detail}`, 400);

type CdfVariable = { name: string; elems: number; begin: number; nbytes: number };

function parseAiaCdf(bytes: Buffer): MeasurementParseResult {
  if (bytes.length < 8 || bytes.subarray(0, 4).toString('hex') !== '43444601') {
    throw refuse(
      'AIA_CDF_MAGIC',
      `the first four bytes are ${bytes.subarray(0, 4).toString('hex')}, not the NetCDF-3 magic "CDF\\x01" (43444601); this is not an ANDI/AIA .cdf file`
    );
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 4;
  const need = (n: number): void => {
    if (off + n > bytes.length) {
      throw refuse('AIA_CDF_STRUCTURE', `file truncated: reading at offset ${off} needs ${n} more bytes but the file ends at ${bytes.length}`);
    }
  };
  const u32 = (): number => {
    need(4);
    const v = dv.getUint32(off, false);
    off += 4;
    return v;
  };
  const readName = (): string => {
    const len = u32();
    need(len);
    const s = bytes.subarray(off, off + len).toString('latin1');
    off += len + ((4 - (len % 4)) % 4);
    return s;
  };

  const numrecs = u32();
  if (numrecs !== 0) throw refuse('AIA_CDF_STRUCTURE', `numrecs=${numrecs}: only the fixed-record layout (numrecs=0) is supported`);
  const dimTag = u32();
  const nDims = u32();
  if (dimTag !== 10) throw refuse('AIA_CDF_STRUCTURE', `expected dim_list tag 10 in the header, found ${dimTag}`);
  const dimSizes: number[] = [];
  for (let i = 0; i < nDims; i += 1) {
    readName();
    dimSizes.push(u32());
  }
  const gattTag = u32();
  const nGatts = u32();
  if (gattTag !== 12) throw refuse('AIA_CDF_STRUCTURE', `expected gatt_list tag 12, found ${gattTag}`);
  const gattrs: Record<string, string> = {};
  const skipValue = (n: number): void => {
    need(n);
    off += n + ((4 - (n % 4)) % 4);
  };
  for (let i = 0; i < nGatts; i += 1) {
    const name = readName();
    const type = u32();
    const n = u32();
    if (type === NC_CHAR) {
      need(n);
      gattrs[name] = bytes.subarray(off, off + n).toString('latin1').replace(/\0+$/, '');
    } else if (type === NC_FLOAT) {
      need(n);
      gattrs[name] = String(dv.getFloat32(off, false));
    } else {
      throw refuse('AIA_CDF_STRUCTURE', `global attribute type ${type} is not supported (expected NC_CHAR 2 or NC_FLOAT 5)`);
    }
    skipValue(n);
  }
  const varTag = u32();
  const nVars = u32();
  if (varTag !== 11) throw refuse('AIA_CDF_STRUCTURE', `expected var_list tag 11, found ${varTag}`);
  const vars: CdfVariable[] = [];
  const varNames: string[] = [];
  for (let i = 0; i < nVars; i += 1) {
    const name = readName();
    const ndims = u32();
    if (ndims > 4) throw refuse('AIA_CDF_STRUCTURE', `variable ${name} declares ${ndims} dimensions (implausible)`);
    let elems = 1;
    for (let d = 0; d < ndims; d += 1) {
      const size = dimSizes[u32()];
      if (size === undefined) throw refuse('AIA_CDF_STRUCTURE', `variable ${name} references a dimension index out of range`);
      elems *= size;
    }
    u32(); // the writer's reserved word (the quirk); see header comment
    const natts = u32();
    if (natts > 32) throw refuse('AIA_CDF_STRUCTURE', `variable ${name} declares ${natts} attributes (implausible)`);
    for (let a = 0; a < natts; a += 1) {
      readName();
      const type = u32();
      const n = u32();
      if (type !== NC_CHAR && type !== NC_FLOAT) {
        throw refuse('AIA_CDF_STRUCTURE', `variable ${name} attribute type ${type} is not supported (expected NC_CHAR 2 or NC_FLOAT 5)`);
      }
      skipValue(n);
    }
    const type = u32();
    const nbytes = u32();
    const begin = u32();
    const elemSize = TYPE_SIZES[type];
    if (elemSize === undefined) throw refuse('AIA_CDF_STRUCTURE', `variable ${name} has unsupported type ${type}`);
    if (nbytes !== elems * elemSize) {
      throw refuse('AIA_CDF_STRUCTURE', `variable ${name} declares ${nbytes} bytes but its dimensions hold ${elems * elemSize}`);
    }
    if (begin + nbytes > bytes.length) {
      throw refuse('AIA_CDF_STRUCTURE', `variable ${name} data at offset ${begin} (+${nbytes} bytes) runs past the end of the file`);
    }
    vars.push({ name, elems, begin, nbytes });
    varNames.push(name);
  }
  // The per-variable sanity above (sane type/nbytes/begin, the first two
  // variables included) is the assertion the quirk note demands: a reader that
  // drifted 4 bytes on the reserved word cannot produce sane fields for every
  // variable in sequence.

  const findVar = (name: string): CdfVariable | undefined => vars.find((v) => v.name === name);
  const trace = findVar('ordinate_values');
  const retention = findVar('peak_retention_time');
  if (trace === undefined || retention === undefined) {
    throw refuse('AIA_CDF_INCOMPLETE', `the variable list (${varNames.join(', ')}) lacks ${trace === undefined ? 'ordinate_values' : 'peak_retention_time'}, which this format requires`);
  }
  const retentionUnit = gattrs['retention_unit'];
  const intensityUnit = gattrs['detector_unit'];
  if (retentionUnit === undefined || intensityUnit === undefined) {
    const missing = [retentionUnit === undefined ? 'retention_unit' : null, intensityUnit === undefined ? 'detector_unit' : null].filter(Boolean).join(' and ');
    throw refuse('AIA_CDF_UNITS_NOT_DECLARED', `the file must declare ${missing} so its units are transcribed, not guessed`);
  }
  const f32 = (v: CdfVariable, i: number): number => dv.getFloat32(v.begin + i * 4, false);
  const metadata: Record<string, string> = { ...gattrs };
  const scalar = (name: string, key: string): void => {
    const v = findVar(name);
    if (v !== undefined) metadata[key] = String(f32(v, 0));
  };
  scalar('actual_sampling_interval', 'sampling_interval_seconds');
  scalar('actual_run_time_length', 'run_time_length_seconds');
  scalar('actual_delay_time', 'delay_time_seconds');
  scalar('detector_minimum_value', 'detector_minimum_value');
  scalar('detector_maximum_value', 'detector_maximum_value');
  const samplingIntervalSeconds = Number(metadata['sampling_interval_seconds']);
  if (metadata['sampling_interval_seconds'] === undefined || !Number.isFinite(samplingIntervalSeconds) || samplingIntervalSeconds <= 0) {
    throw refuse('AIA_CDF_SAMPLING_INTERVAL', `the file must carry a positive actual_sampling_interval so the trace grid (point i at i * interval) is transcribed, not guessed`);
  }
  // The full ordinate series in file order (the trace the metadata also summarizes).
  const traceValues: number[] = [];
  let traceMin = Number.POSITIVE_INFINITY;
  let traceMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < trace.elems; i += 1) {
    const v = f32(trace, i);
    traceValues.push(v);
    if (v < traceMin) traceMin = v;
    if (v > traceMax) traceMax = v;
  }
  metadata['trace_points'] = String(trace.elems);
  metadata['trace_min_value'] = String(traceMin);
  metadata['trace_max_value'] = String(traceMax);
  metadata['trace_unit'] = intensityUnit;
  metadata['time_axis'] = `retention in ${retentionUnit}; timeMin = ${retentionUnit} / 60`;
  // D2: derive the assay type from the file's own detector declaration. Only a
  // DETECTED declaration may be reported as 'detector_name'; every other path is
  // a fallback and must say so — a present-but-unmapped name (TCD/ECD/blank) is
  // not a derivation, it is today's gc_ms default.
  const detectorName = gattrs['detector_name'];
  const detectorLabel = (detectorName ?? '').trim();
  const detectorNameUpper = detectorLabel.toUpperCase();
  let assayType: MeasurementParseResult['assayType'];
  let assayTypeSource: string;
  if (detectorNameUpper.startsWith('FID')) {
    assayType = 'gc_fid';
    assayTypeSource = 'detector_name';
  } else if (detectorNameUpper.includes('MSD') || detectorNameUpper.includes('MS ')) {
    assayType = 'gc_ms';
    assayTypeSource = 'detector_name';
  } else {
    // Today's fallback, kept and made explicit.
    assayType = 'gc_ms';
    assayTypeSource =
      detectorName === undefined
        ? 'fallback (no detector_name declared)'
        : detectorLabel === ''
          ? 'fallback (detector_name declared empty)'
          : `fallback (unrecognized detector_name "${detectorLabel}")`;
  }
  metadata['assay_type_source'] = assayTypeSource;

  const peaks = retention.elems;
  const peakFieldVars = PEAK_FIELDS.map((field) => ({ field, v: findVar(field.name) })).filter(
    (entry): entry is { field: PeakField; v: CdfVariable } => entry.v !== undefined
  );
  for (const { v } of peakFieldVars) {
    if (v.elems % peaks !== 0) {
      throw refuse('AIA_CDF_INCOMPLETE', `variable ${v.name} holds ${v.elems} values, which is not a whole number of ${peaks} peak slots`);
    }
  }
  const data: MeasurementRow[] = [];
  for (let p = 0; p < peaks; p += 1) {
    const rt = f32(retention, p);
    // D1: a chromatogram has no wells — the row belongs to the chromatogram
    // channel and peak identity is the 1-based peak index. The retention time
    // lives in the peak_retention_time value and timeMin, never in `well`.
    const well = String(p + 1);
    const timeMin = rt / 60;
    for (const { field, v } of peakFieldVars) {
      const perPeak = v.elems / peaks; // 1 for the scalar-per-peak vars, 2 for the char[2] code vars
      if (perPeak !== (field.kind === 'char' ? 2 : 1)) {
        throw refuse('AIA_CDF_INCOMPLETE', `variable ${v.name} holds ${v.elems} values over ${peaks} peaks (expected ${field.kind === 'char' ? 2 : 1} per peak for ${field.kind})`);
      }
      const base = v.begin + p * perPeak * PEAK_ELEM_SIZES[field.kind];
      let value: number;
      if (field.kind === 'float') {
        value = dv.getFloat32(base, false);
      } else if (field.kind === 'char') {
        // char[peaks][2]: one ASCII code plus a NUL terminator (every odd byte
        // of both code variables in the fixture is 0).
        value = bytes[base] ?? 0;
      } else {
        value = dv.getInt16(base, false);
      }
      const unit = field.unitKey === 'time' ? retentionUnit : field.unitKey === 'intensity' ? intensityUnit : null;
      data.push(
        unit !== null
          ? { well, metric: field.name, value, unit, timeMin, channelId: 'chromatogram' }
          : { well, metric: field.name, value, timeMin, channelId: 'chromatogram' }
      );
    }
  }
  return {
    assayType,
    parserId: 'aia_andi_cdf',
    parserVersion: '1.0.0',
    data,
    channels: ['chromatogram'],
    mimeType: 'application/x-netcdf',
    units: { time: retentionUnit, intensity: intensityUnit },
    metadata,
    // D3: the ordinate series itself, in file order. Uniform sampling grid:
    // this writer's grid spans points * actual_sampling_interval ==
    // actual_run_time_length (3640.05 s over 72801 points at 0.05 s on the
    // fixture), so the time of point i is i * samplingIntervalSeconds.
    trace: {
      channelId: 'chromatogram',
      samplingIntervalSeconds,
      values: traceValues,
      timeUnit: retentionUnit,
      intensityUnit,
    },
  };
}

export const aiaCdfParser: MeasurementParser & { parseBytes: (bytes: Buffer) => MeasurementParseResult } = {
  parserId: 'aia_andi_cdf',
  // Binary .cdf content arrives as a string through the utf-8 ingest seam;
  // latin1 maps each byte 0..255 onto one code unit, so this is lossless.
  parse(content: string): MeasurementParseResult {
    return parseAiaCdf(Buffer.from(content, 'latin1'));
  },
  parseBytes(bytes: Buffer) {
    return parseAiaCdf(bytes);
  },
};

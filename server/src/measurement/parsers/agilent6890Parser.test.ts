// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ParserRegistry } from './ParserRegistry.js';
import { MeasurementServiceError } from '../MeasurementService.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), 'utf-8');
}

// The ChemStation fixture carries a preamble (comments, a blank line,
// key: value pairs) before the quoted header row, then 21 data rows.
const CHEMSTATION_DATA_ROWS = 21;

function expectBadRequest(fn: () => unknown): MeasurementServiceError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(MeasurementServiceError);
    const me = err as MeasurementServiceError;
    expect(me.code).toBe('BAD_REQUEST');
    expect(me.statusCode).toBe(400);
    return me;
  }
  throw new Error('expected a BAD_REQUEST refusal but the parse succeeded');
}

describe('agilent6890 ChemStation parser (unit chemstation)', () => {
  const registry = new ParserRegistry();
  const parser = registry.resolve('agilent6890');

  it('locates the signal-table header past the preamble and transcribes units + metadata (AC1)', () => {
    const result = parser.parse(fixture('agilent6890_chemstation_sample.csv'));
    expect(result.parserId).toBe('agilent6890');
    expect(result.assayType).toBe('gc_ms');
    expect(result.channels).toEqual(['chromatogram']);
    expect(result.mimeType).toBe('text/csv');
    // Units transcribed from the bracketed header tokens — never defaulted.
    expect(result.units).toEqual({ time: 'min', intensity: 'pA' });
    expect(result.units?.intensity).not.toBe('a.u.');
    // Preamble metadata verbatim as written in the file.
    expect(result.metadata?.['Instrument']).toBe('6890N GC (ChemStation G1106BA)');
    expect(result.metadata?.['Method']).toBe('GC-FID-Baseline07.met');
    expect(result.metadata?.['Injection Date']).toBe('14-NOV-2026 08:15:02');
    expect(result.metadata?.['Signal Name']).toBe('Response, Peak Table');
    // The raw header cells are recorded so a person can see what the file said.
    expect(result.metadata?.['Time Column']).toBe('RetTime [min]');
    expect(result.metadata?.['Signal Column']).toBe('Signal [pA]');
    // Full data: first point, last point and row count match the file.
    expect(result.data.length).toBe(CHEMSTATION_DATA_ROWS);
    const first = result.data[0];
    const last = result.data[result.data.length - 1];
    expect(first).toEqual({ well: 'NA', metric: 'intensity', value: -1.2, channelId: 'chromatogram', unit: 'pA', timeMin: 0 });
    expect(last).toEqual({ well: 'NA', metric: 'intensity', value: -1.2, channelId: 'chromatogram', unit: 'pA', timeMin: 1 });
    // One row per data row in file order: the elution peak is never sorted away.
    const peakIdx = result.data.findIndex((row) => row.value === 1204.75);
    expect(peakIdx).toBe(12);
  });

  it('keeps file order for times as given and transcribes an mV unit when the file says mV', () => {
    const result = parser.parse(
      ['Injection Date: 01-JAN-2026 00:00:00', '"Time [min]","Signal [mV]"', '2.0,10', '1.0,20', '3.0,30', ''].join('\n')
    );
    expect(result.units).toEqual({ time: 'min', intensity: 'mV' });
    expect(result.data.length).toBe(3);
    expect(result.data.map((row) => row.timeMin)).toEqual([2, 1, 3]);
    expect(result.data.map((row) => row.value)).toEqual([10, 20, 30]);
    expect(result.data[0]?.unit).toBe('mV');
  });

  it('resolves the legacy stub ids to this same parser and still parses the old tidy fixture (AC2)', () => {
    for (const id of ['agilent6890', 'agilent6890_csv_stub', 'gc6890', 'gc_csv_stub']) {
      expect(registry.resolve(id)).toBe(parser);
    }
    const gc = registry.resolve('agilent6890_csv_stub').parse(fixture('agilent6890_stub_sample.csv'));
    expect(gc.data.length).toBe(3);
    expect(gc.data[0]).toEqual({ well: 'NA', metric: 'intensity', value: 10, channelId: 'chromatogram', unit: 'unstated', timeMin: 0 });
    // The old fixture's cells carry no bracketed unit: the unit is the literal
    // 'unstated', never a guessed default.
    expect(gc.units).toEqual({ time: 'unstated', intensity: 'unstated' });
  });

  it('refuses with a 400 that names what it looked for and quotes the lines inspected when no header is locatable (AC3)', () => {
    const content = [
      'Instrument: 6890N GC',
      'Method: mystery.met',
      'Injection Date: 14-NOV-2026 08:15:02',
      '',
      '# a comment line that is not a header',
      'Signal Name: Response',
      'garbage,with,three,cells',
    ].join('\n');
    const me = expectBadRequest(() => parser.parse(content));
    expect(me.message).toMatch(/expects columns/i);
    // The cell spellings it looks for are stated in the refusal.
    expect(me.message).toContain('retention time');
    expect(me.message).toContain('response');
    // The candidate lines it inspected are quoted, with line numbers.
    expect(me.message).toContain('Instrument: 6890N GC');
    expect(me.message).toContain('Signal Name: Response');
    expect(me.message).toContain('garbage,with,three,cells');
    expect(me.message).toContain('line 7');
  });

  it('refuses a malformed data row with the offending line quoted verbatim and its number (AC3)', () => {
    const content = [
      'Instrument: 6890N GC',
      '"RetTime [min]","Signal [pA]"',
      '0.000000,-1.200000',
      '0.050000,',
      '0.100000,-1.150000',
    ].join('\n');
    const me = expectBadRequest(() => parser.parse(content));
    // No payload, no zero-fill, no skip: the refusal quotes the line verbatim,
    // with its 1-based line number and the detected headers.
    expect(me.message).toContain('0.050000,');
    expect(me.message).toContain('line 4');
    expect(me.message).toContain('RetTime [min]');
    expect(me.message).toContain('Signal [pA]');

    const content2 = ['"Time [min]","Signal [mV]"', '1.0,12', '2.0,not-a-number', ''].join('\n');
    const me2 = expectBadRequest(() => parser.parse(content2));
    expect(me2.message).toContain('2.0,not-a-number');
    expect(me2.message).toContain('line 3');
  });

  it('refuses a header with no data rows rather than returning an empty payload', () => {
    const me = expectBadRequest(() => parser.parse('"RetTime [min]","Signal [pA]"\n'));
    expect(me.message).toMatch(/no data rows/i);
  });

  it('refuses a tab row whose intensity cell is empty, quoting the line and the detected headers (advcfix1)', () => {
    const content = ['Time [min]\tSignal [pA]\tPeak No', '0.1\t\t7', ''].join('\n');
    const me = expectBadRequest(() => parser.parse(content));
    // The empty middle cell must not shift the columns: the row is refused,
    // with the offending line quoted verbatim and the detected headers named.
    expect(me.message).toContain('0.1\t\t7');
    expect(me.message).toContain('line 2');
    expect(me.message).toContain('Time [min]');
    expect(me.message).toContain('Signal [pA]');
  });

  it('parses a tab-separated row positionally (advcfix1)', () => {
    const result = parser.parse(['Time [min]\tSignal [pA]\tPeak No', '0.1\t250.5\t7', ''].join('\n'));
    expect(result.data.length).toBe(1);
    expect(result.data[0]).toEqual({
      well: 'NA',
      metric: 'intensity',
      value: 250.5,
      channelId: 'chromatogram',
      unit: 'pA',
      timeMin: 0.1,
    });
  });

  it('refuses non-numeric cells that a prefix parse would silently coerce (advcfix1)', () => {
    const content1 = ['Time [min]\tSignal [pA]', '0.1\t1.2.3', ''].join('\n');
    const me1 = expectBadRequest(() => parser.parse(content1));
    expect(me1.message).toContain('0.1\t1.2.3');
    expect(me1.message).toContain('line 2');

    const content2 = ['Time [min]\tSignal [pA]', '45abc\t10', ''].join('\n');
    const me2 = expectBadRequest(() => parser.parse(content2));
    expect(me2.message).toContain('45abc\t10');
    expect(me2.message).toContain('line 2');
  });

  it('locates the real header below a preamble sentence that names time and signal (advcfix2, defect 3)', () => {
    // "Results, Time, Signal" is a preamble sentence, not a header: it is
    // rejected as a candidate because no following row is numeric at its
    // claimed indices, and the real quoted header below it is located.
    const content = [
      'Results, Time, Signal',
      '"RetTime [min]","Signal [pA]"',
      '0.0,100',
      '1.5,250.5',
      '',
    ].join('\n');
    const result = parser.parse(content);
    expect(result.metadata?.['Time Column']).toBe('RetTime [min]');
    expect(result.metadata?.['Signal Column']).toBe('Signal [pA]');
    expect(result.units).toEqual({ time: 'min', intensity: 'pA' });
    expect(result.data.length).toBe(2);
    expect(result.data.map((row) => row.timeMin)).toEqual([0, 1.5]);
    expect(result.data.map((row) => row.value)).toEqual([100, 250.5]);
  });

  it('retains every preamble line: duplicate keys are suffixed, comment and colon-less lines are kept (advcfix2, defect 4)', () => {
    const content = [
      '# ChemStation export',
      'Signal Name: FID1 A',
      'Signal Name: FID1 B',
      'OPERATOR RUN 12',
      '"RetTime [min]","Signal A [pA]"',
      '0.0,10',
      '1.0,20',
      '',
    ].join('\n');
    const result = parser.parse(content);
    expect(result.metadata?.['Signal Name']).toBe('FID1 A');
    expect(result.metadata?.['Signal Name (2)']).toBe('FID1 B');
    expect(result.metadata?.['line 4']).toBe('OPERATOR RUN 12');
    expect(result.metadata?.['line 1']).toBe('# ChemStation export');
    expect(result.data.length).toBe(2);
    expect(result.data.map((row) => row.value)).toEqual([10, 20]);
  });

  it('quotes the first five candidate lines and names the total inspected count (advcfix2, defect 5)', () => {
    const preamble = [
      'Instrument: 6890N GC',
      'Method: mystery.met',
      'Injection Date: 14-NOV-2026 08:15:02',
      'Signal Name: FID1 A',
      'Operator: brad',
      'Run: 12',
      'Column: Time',
      'Note: one',
      'Note: two',
      'Note: three',
    ];
    const me = expectBadRequest(() => parser.parse(preamble.join('\n')));
    expect(me.message).toMatch(/expects columns/i);
    // All ten candidate lines were inspected; the message says so...
    expect(me.message).toContain('10 candidate lines');
    // ...and quotes the first five...
    expect(me.message).toContain('line 5: Operator: brad');
    // ...without quoting (or implying it inspected) the rest.
    expect(me.message).not.toContain('line 6');
    expect(me.message).not.toContain('Note: one');
  });

  it('locates multi-signal ChemStation headers and records the first qualifying signal column verbatim (advcfix2, defect 6)', () => {
    const multi = [
      '"RetTime [min]","Signal A [pA]","Signal B [pA]"',
      '0.0,100,200',
      '1.0,150,250',
      '',
    ].join('\n');
    const multiResult = parser.parse(multi);
    // The FIRST qualifying intensity column wins — recorded verbatim, not guessed.
    expect(multiResult.metadata?.['Signal Column']).toBe('Signal A [pA]');
    expect(multiResult.units).toEqual({ time: 'min', intensity: 'pA' });
    expect(multiResult.data.length).toBe(2);
    expect(multiResult.data.map((row) => row.value)).toEqual([100, 150]);

    // A real Agilent export names its FID signal "FID1 A"; that cell qualifies
    // through its bracketed unit token, so the file parses on its own names.
    const fid = ['"Time [min]","FID1 A [pA]"', '0.05,10', '1.0,20', ''].join('\n');
    const fidResult = parser.parse(fid);
    expect(fidResult.metadata?.['Signal Column']).toBe('FID1 A [pA]');
    expect(fidResult.units).toEqual({ time: 'min', intensity: 'pA' });
    expect(fidResult.data.length).toBe(2);
    expect(fidResult.data.map((row) => row.timeMin)).toEqual([0.05, 1]);
    expect(fidResult.data.map((row) => row.value)).toEqual([10, 20]);
  });

  it('refuses a non-minute time axis instead of storing seconds in timeMin (advcfix2, defect 7)', () => {
    const me = expectBadRequest(() => parser.parse(['"Time [s]","Signal [pA]"', '0.05,10', ''].join('\n')));
    // The refusal names the unit token it found and the minutes requirement;
    // no row is returned and no conversion is invented.
    expect(me.message).toContain('Time [s]');
    expect(me.message).toContain('"s"');
    expect(me.message).toContain('requires minutes');
    expect(me.message).toContain('no conversion');

    // Bracketed minute spellings (any case) stay accepted and are transcribed
    // verbatim, as today.
    const minutes = parser.parse(['"Time [MINUTES]","Signal [pA]"', '1.0,5', ''].join('\n'));
    expect(minutes.units).toEqual({ time: 'MINUTES', intensity: 'pA' });
    expect(minutes.data.length).toBe(1);
  });

  it('refuses a semicolon-delimited file by name instead of with the generic header message (advcfix2, defect 8)', () => {
    const me = expectBadRequest(() => parser.parse(['"Time [min]";"Signal [pA]"', '0.05,10', ''].join('\n')));
    expect(me.message).toMatch(/expects columns/i);
    // A human reading the refusal knows what to do: re-export, do not hand-parse.
    expect(me.message).toContain('semicolon-delimited');
    expect(me.message).toContain('decimal-comma');
    expect(me.message).toContain('line 1');
  });
});

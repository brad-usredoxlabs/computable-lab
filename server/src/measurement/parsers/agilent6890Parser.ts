import { MeasurementServiceError } from '../MeasurementService.js';
import { splitCsvLine } from './csvCommon.js';
import type { MeasurementParseResult, MeasurementParser, MeasurementRow } from './types.js';

// Agilent 6890 / ChemStation signal-export parser.
//
// A real export is NOT a tidy two-column table: it opens with a preamble
// (comments, blanks, "Key: value" lines such as Instrument / Method /
// Injection Date / Signal Name), then a quoted header row like
// "RetTime [min]","Signal [pA]", then the data table. The header row is
// located by scanning — never assumed to be line 1 — and the preamble is
// transcribed verbatim into metadata rather than discarded.
//
// Units are declared, not implied (hands-offs are typed ports): the bracketed
// token in a header cell is transcribed ("Signal [pA]" -> pA). A cell with no
// bracketed token is recorded as the literal string 'unstated' — never a
// default like 'a.u.' — and no unit conversion is ever applied.

const TIME_CELL_TOKENS = [
  'retention time',
  'retention_time',
  'ret time',
  'rettime',
  'time_min',
  'time',
];
const INTENSITY_CELL_TOKENS = ['response', 'signal', 'intensity', 'pa', 'mv', 'counts'];
const UNSTATED = 'unstated';
const HEADER_REFUSAL_LOOKS_FOR =
  'a time column (looks for: time, retention time, rettime, ret time, time_min) and ' +
  'an intensity column (looks for: response, signal, intensity, pA, mV, counts)';

type NumberedLine = { lineNo: number; line: string };

// A normalized cell is lowercased, with quotes, surrounding whitespace and a
// bracketed unit suffix removed: "RetTime [min]" -> "rettime".
function normalizeCell(cell: string): string {
  return cell
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\[[^\]]*\]$/, '')
    .trim();
}

// The literal bracketed unit token, verbatim ("Signal [pA]" -> "pA"); null when
// the cell carries no bracketed token. No conversion is ever applied.
function extractUnit(cell: string): string | null {
  const match = /\[([^\]]+)\]/.exec(cell);
  const unit = match?.[1]?.trim();
  return unit && unit.length > 0 ? unit : null;
}

function isTimeLikeCell(cell: string): boolean {
  const normalized = normalizeCell(cell);
  return TIME_CELL_TOKENS.some((token) => normalized === token || normalized.endsWith(`_${token}`));
}

function isIntensityLikeCell(cell: string): boolean {
  const normalized = normalizeCell(cell);
  return INTENSITY_CELL_TOKENS.some((token) => normalized === token || normalized.endsWith(`_${token}`));
}

function splitCells(line: string): string[] {
  if (line.includes(',')) return splitCsvLine(line);
  // Tab split is POSITIONAL: cells are trimmed but never filtered, so an
  // empty cell keeps its column (it is refused by the caller, not shifted
  // away). Fall back to splitCsvLine only when the tab split yields a
  // single cell (no tab, or a single untabbed cell).
  const tabbed = line.split('\t').map((cell) => cell.trim());
  return tabbed.length > 1 ? tabbed : splitCsvLine(line);
}

// Strict numeric acceptance: trim, reject empty, accept plain/decimal/
// scientific notation with an optional leading +/- — and nothing else.
// Unlike Number.parseFloat this never takes a prefix, so "1.2.3" and
// "45abc" refuse; "Infinity" and the like refuse too. NaN is returned for
// anything the caller must reject.
function strictNumber(cell: string): number {
  const trimmed = cell.trim();
  if (trimmed.length === 0 || !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    return Number.NaN;
  }
  return Number(trimmed);
}

// Candidate lines: blank lines and # / // comment lines are dropped; every
// remaining line keeps its original 1-based line number so refusals can quote
// the file as it was written.
function candidateLines(content: string): NumberedLine[] {
  const out: NumberedLine[] = [];
  content.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    out.push({ lineNo: i + 1, line: trimmed });
  });
  return out;
}

// The first candidate line that yields at least one time-like AND one
// intensity-like cell. Everything before it is preamble.
function locateHeader(
  lines: NumberedLine[]
): { index: number; timeIdx: number; intensityIdx: number; header: string[] } | null {
  for (let i = 0; i < lines.length; i += 1) {
    const entry = lines[i];
    if (entry === undefined) continue;
    const cells = splitCells(entry.line);
    let timeIdx = -1;
    let intensityIdx = -1;
    for (let c = 0; c < cells.length; c += 1) {
      const cell = cells[c];
      if (cell === undefined) continue;
      if (timeIdx < 0 && isTimeLikeCell(cell)) timeIdx = c;
      else if (intensityIdx < 0 && isIntensityLikeCell(cell)) intensityIdx = c;
    }
    if (timeIdx >= 0 && intensityIdx >= 0) {
      return { index: i, timeIdx, intensityIdx, header: cells };
    }
  }
  return null;
}

function headerRefusal(lines: NumberedLine[]): string {
  const inspected = lines
    .slice(0, 5)
    .map((entry) => `line ${entry.lineNo}: ${entry.line}`)
    .join('\n');
  return `agilent6890 expects columns: ${HEADER_REFUSAL_LOOKS_FOR}. No such header row was located in the candidate lines inspected:\n${inspected}`;
}

// Preamble candidate lines before the header row: "key: value" or
// "key, value" pairs on the first ':' or ',', kept verbatim. A preamble line
// that is neither a table header nor a recognizable "key: value" /
// "key, value" pair is discarded from metadata (it is still quoted in a
// refusal) — never invented into a fact.
function parsePreamble(preamble: NumberedLine[]): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const entry of preamble) {
    const line = entry.line;
    let sep = -1;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === ':' || ch === ',') {
        sep = i;
        break;
      }
    }
    if (sep <= 0) continue;
    const key = line.slice(0, sep).replace(/^["']+|["']+$/g, '').trim();
    const value = line.slice(sep + 1).replace(/^["']+|["']+$/g, '').trim();
    if (key.length > 0 && value.length > 0) {
      metadata[key] = value;
    }
  }
  return metadata;
}

function malformedRow(entry: NumberedLine, problem: string, header: string[]): MeasurementServiceError {
  return new MeasurementServiceError(
    'BAD_REQUEST',
    `agilent6890 malformed data row at line ${entry.lineNo}: ${entry.line} — ${problem}. Detected headers: ${header
      .map((cell) => JSON.stringify(cell))
      .join(', ')}`,
    400
  );
}

export const agilent6890Parser: MeasurementParser = {
  parserId: 'agilent6890',
  aliases: ['agilent6890_csv_stub', 'gc6890', 'gc_csv_stub'],
  parse(content: string): MeasurementParseResult {
    const lines = candidateLines(content);
    if (lines.length === 0) {
      throw new MeasurementServiceError(
        'BAD_REQUEST',
        `agilent6890 expects columns: ${HEADER_REFUSAL_LOOKS_FOR}. The file contains no candidate lines.`,
        400
      );
    }

    const found = locateHeader(lines);
    if (!found) {
      throw new MeasurementServiceError('BAD_REQUEST', headerRefusal(lines), 400);
    }

    const { index: headerLineIndex, timeIdx, intensityIdx, header } = found;
    const timeCell = header[timeIdx] ?? '';
    const intensityCell = header[intensityIdx] ?? '';
    const timeUnit = extractUnit(timeCell) ?? UNSTATED;
    const intensityUnit = extractUnit(intensityCell) ?? UNSTATED;
    const metadata = parsePreamble(lines.slice(0, headerLineIndex));
    // The raw header cells are recorded so a person can see what the file said.
    metadata['Time Column'] = timeCell;
    metadata['Signal Column'] = intensityCell;

    const data: MeasurementRow[] = [];
    for (let i = headerLineIndex + 1; i < lines.length; i += 1) {
      const entry = lines[i];
      if (entry === undefined) continue;
      const cols = splitCells(entry.line);
      const t = cols[timeIdx];
      const y = cols[intensityIdx];
      if (t === undefined || t.length === 0 || y === undefined || y.length === 0) {
        throw malformedRow(entry, 'missing the time or intensity cell', header);
      }
      const timeMin = strictNumber(t);
      if (!Number.isFinite(timeMin)) {
        throw malformedRow(entry, 'the time cell is not a number', header);
      }
      const value = strictNumber(y);
      if (!Number.isFinite(value)) {
        throw malformedRow(entry, 'the intensity cell is not a number', header);
      }
      data.push({
        well: 'NA',
        metric: 'intensity',
        value,
        channelId: 'chromatogram',
        unit: intensityUnit,
        timeMin,
      });
    }

    if (data.length === 0) {
      throw new MeasurementServiceError('BAD_REQUEST', 'agilent6890 found no data rows after the header row', 400);
    }

    return {
      assayType: 'gc_ms',
      parserId: 'agilent6890',
      parserVersion: '1.0.0',
      data,
      channels: ['chromatogram'],
      mimeType: 'text/csv',
      units: { time: timeUnit, intensity: intensityUnit },
      metadata,
    };
  },
};

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
// The only bracketed time-axis spellings accepted: min/mins/minute/minutes,
// any case. Anything else is refused, not converted (no conversion is ever
// applied — a factor would be invented).
const MINUTE_UNIT_RE = /^min(s|ute|utes)?$/i;
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

// Pass 1 is the exact/`_`-suffix test, unchanged. Pass 2, only when pass 1
// finds nothing, is word-boundary containment of a token in the normalized
// cell — derived from the cell's own words, never a second spelling table.
function isTimeLikeCell(cell: string): boolean {
  const normalized = normalizeCell(cell);
  return (
    TIME_CELL_TOKENS.some((token) => normalized === token || normalized.endsWith(`_${token}`)) ||
    TIME_CELL_TOKENS.some((token) => new RegExp(`\\b${token}\\b`).test(normalized))
  );
}

// As isTimeLikeCell, plus: the cell's own bracketed unit token counts as an
// intensity signal when it normalizes to one of the intensity tokens, so a
// header the file already carries ("FID1 A [pA]") qualifies via "pA".
function isIntensityLikeCell(cell: string): boolean {
  const normalized = normalizeCell(cell);
  if (
    INTENSITY_CELL_TOKENS.some((token) => normalized === token || normalized.endsWith(`_${token}`)) ||
    INTENSITY_CELL_TOKENS.some((token) => new RegExp(`\\b${token}\\b`).test(normalized))
  ) {
    return true;
  }
  const unit = extractUnit(cell);
  return unit !== null && INTENSITY_CELL_TOKENS.includes(unit.toLowerCase().trim());
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
// intensity-like cell, accepted only when at least one FOLLOWING candidate
// line has numeric cells at the chosen indices (strictNumber): that separates
// a real header from a preamble sentence that merely names "Time" and
// "Signal". A candidate that is the last line is still accepted — the caller's
// "found no data rows after the header row" refusal covers that shape.
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
      if (i < lines.length - 1) {
        let hasNumericFollower = false;
        for (let j = i + 1; j < lines.length; j += 1) {
          const follower = lines[j];
          if (follower === undefined) continue;
          const followerCells = splitCells(follower.line);
          const t = followerCells[timeIdx];
          const y = followerCells[intensityIdx];
          if (
            t !== undefined &&
            y !== undefined &&
            Number.isFinite(strictNumber(t)) &&
            Number.isFinite(strictNumber(y))
          ) {
            hasNumericFollower = true;
            break;
          }
        }
        if (!hasNumericFollower) continue;
      }
      return { index: i, timeIdx, intensityIdx, header: cells };
    }
  }
  return null;
}

function headerRefusal(lines: NumberedLine[]): string {
  const quoted = lines
    .slice(0, 5)
    .map((entry) => `line ${entry.lineNo}: ${entry.line}`)
    .join('\n');
  // The quoted lines are a sample: the message says how many candidate lines
  // were inspected so it never claims the quoted five are all that were.
  const total = lines.length;
  return `agilent6890 expects columns: ${HEADER_REFUSAL_LOOKS_FOR}. No such header row was located among the ${total} candidate lines; the first ${Math.min(5, total)} quoted:\n${quoted}`;
}

// All non-empty lines (comment lines included) with their original 1-based
// numbers. The preamble is every file line before the header row, so comment
// lines reach parsePreamble instead of being dropped before it sees them.
function rawLines(content: string): NumberedLine[] {
  const out: NumberedLine[] = [];
  content.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    out.push({ lineNo: i + 1, line: trimmed });
  });
  return out;
}

// Every pre-header line is transcribed, never dropped: "key: value" or
// "key, value" pairs go under the key; comment lines and lines with no ':' or
// ',' go under `line N` so nothing a person wrote vanishes. A repeated key is
// suffixed ` (2)`, ` (3)`; later values are never discarded.
function uniqueKey(metadata: Record<string, string>, key: string): string {
  if (!(key in metadata)) return key;
  let n = 2;
  while (true) {
    const suffixed = `${key} (${n})`;
    if (!(suffixed in metadata)) return suffixed;
    n += 1;
  }
}

function parsePreamble(preamble: NumberedLine[]): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const entry of preamble) {
    const line = entry.line;
    if (line.length === 0) continue;
    if (line.startsWith('#') || line.startsWith('//')) {
      metadata[uniqueKey(metadata, `line ${entry.lineNo}`)] = line;
      continue;
    }
    let sep = -1;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === ':' || ch === ',') {
        sep = i;
        break;
      }
    }
    if (sep <= 0) {
      metadata[uniqueKey(metadata, `line ${entry.lineNo}`)] = line;
      continue;
    }
    const key = line.slice(0, sep).replace(/^["']+|["']+$/g, '').trim();
    const value = line.slice(sep + 1).replace(/^["']+|["']+$/g, '').trim();
    if (key.length > 0 && value.length > 0) {
      metadata[uniqueKey(metadata, key)] = value;
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

    // A semicolon-delimited file is a decimal-comma locale export: in that
    // locale "0,1;10" means 0.1, and strictNumber would refuse every row. A
    // half-read is worse than a named refusal, so it is refused by name — no
    // semicolon parsing is added.
    const semicolonLine = lines.find((entry) => entry.line.includes(';'));
    const separatorNote =
      semicolonLine !== undefined
        ? ` A semicolon-delimited file was detected on line ${semicolonLine.lineNo}: decimal-comma locale exports are not parsed; re-export the table as comma- or tab-delimited.`
        : '';

    const found = locateHeader(lines);
    if (!found) {
      throw new MeasurementServiceError('BAD_REQUEST', headerRefusal(lines) + separatorNote, 400);
    }

    const { index: headerLineIndex, timeIdx, intensityIdx, header } = found;
    const timeCell = header[timeIdx] ?? '';
    const intensityCell = header[intensityIdx] ?? '';
    const timeUnit = extractUnit(timeCell) ?? UNSTATED;
    const intensityUnit = extractUnit(intensityCell) ?? UNSTATED;
    // A bracketed time unit that is not a minute spelling is refused, not
    // converted: seconds stored in a field named timeMin would be an invented
    // factor, and no conversion is ever applied. No bracket stays UNSTATED.
    if (extractUnit(timeCell) !== null && !MINUTE_UNIT_RE.test(timeUnit)) {
      throw new MeasurementServiceError(
        'BAD_REQUEST',
        `agilent6890 time column "${timeCell}" declares time unit "${timeUnit}"; this parser requires minutes for its timeMin field — it refuses a non-minute time axis and no conversion is ever applied; re-export the table with a minute time axis.`,
        400
      );
    }
    // The preamble is every file line before the header row — comments and
    // blank-free text included — so nothing is dropped before transcription.
    const headerLineNo = lines[headerLineIndex]?.lineNo ?? 0;
    const metadata = parsePreamble(rawLines(content).filter((entry) => entry.lineNo < headerLineNo));
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

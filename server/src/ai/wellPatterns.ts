/**
 * Well patterns — "add 200uL of DMEM in a checkerboard pattern across wells
 * A2-D8" is a COMPOSITION, not an enumeration.
 *
 * Brad's observation (2026-09-20): with the big model, that sentence was magic —
 * six seconds and it was right. What the harness never gave it was a way to SAY a
 * pattern, so the model had to enumerate roughly 35 individual wells, correctly,
 * every time. A 35B model manages that; a 2.6B model cannot, and even the big one
 * spends its whole budget on arithmetic instead of on the experiment.
 *
 * So: patterns are a primitive. The model names one; the harness expands it to
 * literal wells at the boundary (nothing downstream ever sees a pattern), exactly
 * the way `expandEventWells` already turns "A1:H12" into wells.
 */

export type WellPatternName = 'checkerboard' | 'every_other_row' | 'row' | 'column';

export const WELL_PATTERN_NAMES: readonly WellPatternName[] = [
  'checkerboard',
  'every_other_row',
  'row',
  'column',
];

export interface WellPattern {
  pattern: WellPatternName;
  /** Top-left of the block, e.g. "A2". */
  from: string;
  /** Bottom-right of the block, e.g. "D8". */
  to: string;
}

/** "A2" → { row: 0, column: 2 }, or null when it is not a well address. */
export function parseWell(address: string): { row: number; column: number } | null {
  const match = /^([A-Ha-h])([1-9]|1[0-2])$/.exec(address.trim());
  if (!match) return null;
  return { row: match[1]!.toUpperCase().charCodeAt(0) - 65, column: Number(match[2]) };
}

export function formatWell(row: number, column: number): string {
  return `${String.fromCharCode(65 + row)}${column}`;
}

function blockRows(from: WellPattern, to: WellPattern): { rows: number[]; columns: number[] } | null {
  const start = parseWell(from.from);
  const end = parseWell(to.to);
  if (!start || !end) return null;
  const rows: number[] = [];
  const columns: number[] = [];
  for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r += 1) rows.push(r);
  for (let c = Math.min(start.column, end.column); c <= Math.max(start.column, end.column); c += 1) columns.push(c);
  return { rows, columns };
}

/**
 * Expand a pattern to literal well ids, in row-major order.
 *
 * - `checkerboard`     keep wells where (row + column) is even — the classic
 *                      alternating pattern; the `from` well is always kept.
 * - `every_other_row`  every second row of the block (from, from+2, …), all columns.
 * - `row` / `column`   the plain block (useful when the model prefers a named
 *                      pattern to a range string).
 *
 * Returns [] for anything unparseable — never a partial guess.
 */
export function expandWellPattern(pattern: WellPattern): string[] {
  const block = blockRows(pattern, pattern);
  if (!block) return [];
  const { rows, columns } = block;
  const out: string[] = [];
  const rowIndex = (r: number) => rows.indexOf(r);
  for (const r of rows) {
    for (const c of columns) {
      switch (pattern.pattern) {
        case 'checkerboard':
          if ((r + c) % 2 !== 0) continue;
          break;
        case 'every_other_row':
          if (rowIndex(r) % 2 !== 0) continue;
          break;
        case 'row':
        case 'column':
          break;
        default:
          return [];
      }
      out.push(formatWell(r, c));
    }
  }
  return out;
}

/** Read a `wells_pattern` off event details, when present and well-formed. */
export function wellPatternFromDetails(details: Record<string, unknown>): WellPattern | null {
  const raw = details['wells_pattern'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const pattern = typeof obj['pattern'] === 'string' ? obj['pattern'].trim() : '';
  const from = typeof obj['from'] === 'string' ? obj['from'].trim() : '';
  const to = typeof obj['to'] === 'string' ? obj['to'].trim() : '';
  if (!WELL_PATTERN_NAMES.includes(pattern as WellPatternName) || !from || !to) return null;
  return { pattern: pattern as WellPatternName, from, to };
}

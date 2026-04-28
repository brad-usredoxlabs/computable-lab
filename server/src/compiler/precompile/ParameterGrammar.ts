/**
 * ParameterGrammar — deterministic regex extractors for volumes, counts,
 * well addresses, and durations from clause text.
 *
 * Pure functions, no side effects, no async. All extractors return [] for
 * empty input and never throw. Spans are character offsets into the input;
 * round-trip (text.slice(span[0], span[1]) === raw) holds.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VolumeMatch {
  value: number;
  unit: 'uL';
  span: [number, number];
  raw: string;
}

export interface CountMatch {
  value: number;
  span: [number, number];
  raw: string;
}

export interface WellMatch {
  wells: string[];
  kind: 'single' | 'range' | 'row' | 'col' | 'list';
  span: [number, number];
  raw: string;
}

export interface DurationMatch {
  value_seconds: number;
  span: [number, number];
  raw: string;
}

// ---------------------------------------------------------------------------
// English number word → digit map
// ---------------------------------------------------------------------------

const ENGLISH_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

// ---------------------------------------------------------------------------
// extractVolumes
// ---------------------------------------------------------------------------

/**
 * Extract volume quantities from text. Normalises all units to uL.
 *
 * Matches: µL, μL, uL, microliter, microliters, mL, ml, milliliter,
 *          milliliters, L, l, liter, liters
 *
 * Conversion: uL/microliter → ×1; mL/milliliter → ×1000; L/liter → ×1_000_000.
 */
export function extractVolumes(text: string): VolumeMatch[] {
  if (typeof text !== 'string' || text.length === 0) return [];

  // Match both U+00B5 (µ) and U+03BC (μ, Greek lowercase mu)
  const re = /(\d+(?:\.\d+)?)\s*([µμ]L|uL|microliters?|mL|ml|milliliters?|L|liters?)\b/gi;
  const results: VolumeMatch[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1]!);
    const unitRaw = m[2]!.toLowerCase();
    let multiplier = 1;

    if (unitRaw === 'ml' || unitRaw === 'milliliter' || unitRaw === 'milliliters') {
      multiplier = 1000;
    } else if (unitRaw === 'l' || unitRaw === 'liter' || unitRaw === 'liters') {
      multiplier = 1_000_000;
    }

    results.push({
      value: value * multiplier,
      unit: 'uL',
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// extractCounts
// ---------------------------------------------------------------------------

/**
 * Extract count quantities from text. Accepts decimal digits and English
 * number words 'one' through 'twelve' (case-insensitive).
 */
export function extractCounts(text: string): CountMatch[] {
  if (typeof text !== 'string' || text.length === 0) return [];

  const results: CountMatch[] = [];

  // --- Digit matches ---
  const digitRe = /\b(\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = digitRe.exec(text)) !== null) {
    results.push({
      value: parseInt(m[1]!, 10),
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }

  // --- English word matches ---
  const wordRe = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi;
  while ((m = wordRe.exec(text)) !== null) {
    const wordKey = m[1]!.toLowerCase();
    const wordValue = ENGLISH_WORDS[wordKey];
    if (wordValue === undefined) continue; // safety, should never happen
    results.push({
      value: wordValue,
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }

  // Sort by span start for deterministic output
  results.sort((a, b) => a.span[0] - b.span[0]);

  return results;
}

// ---------------------------------------------------------------------------
// extractWellAddresses
// ---------------------------------------------------------------------------

/**
 * Extract well-address references from text.
 *
 * Patterns:
 *   - Single cell:  A1, H12
 *   - Range:        A1-A12, A1–A6 (em-dash also)
 *   - Row label:    row B
 *   - Column label: column 3, col C
 *   - List:         wells A1, A3, A5
 */
export function extractWellAddresses(text: string): WellMatch[] {
  if (typeof text !== 'string' || text.length === 0) return [];

  const results: WellMatch[] = [];

  // --- List pattern (must be checked before single/range to avoid partial matches) ---
  const listRe = /\bwells?\s+([A-H]\d{1,2}(?:\s*,\s*[A-H]\d{1,2})+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = listRe.exec(text)) !== null) {
    const inner = m[1]!;
    const wells = inner.split(/\s*,\s*/).map((w) => w.trim());
    results.push({
      wells,
      kind: 'list',
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }

  // --- Row label pattern ---
  const rowRe = /\brow\s+([A-H])\b/gi;
  while ((m = rowRe.exec(text)) !== null) {
    const row = m[1]!.toUpperCase();
    const wells: string[] = [];
    for (let col = 1; col <= 12; col++) {
      wells.push(`${row}${col}`);
    }
    results.push({
      wells,
      kind: 'row',
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }

  // --- Column label pattern ---
  const colRe = /\b(?:col|column)\s+(\d{1,2})\b/gi;
  while ((m = colRe.exec(text)) !== null) {
    const colNum = parseInt(m[1]!, 10);
    const wells: string[] = [];
    for (let row = 0; row < 8; row++) {
      wells.push(`${String.fromCharCode(65 + row)}${colNum}`);
    }
    results.push({
      wells,
      kind: 'col',
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }

  // --- Range pattern (em-dash and hyphen) ---
  const rangeRe = /\b([A-H])(\d{1,2})\s*[-–]\s*([A-H])(\d{1,2})\b/g;
  while ((m = rangeRe.exec(text)) !== null) {
    const row1 = m[1]!.toUpperCase();
    const col1 = parseInt(m[2]!, 10);
    const row2 = m[3]!.toUpperCase();
    const col2 = parseInt(m[4]!, 10);

    const wells: string[] = [];

    if (row1 === row2) {
      // Same row: expand columns
      const start = Math.min(col1, col2);
      const end = Math.max(col1, col2);
      for (let c = start; c <= end; c++) {
        wells.push(`${row1}${c}`);
      }
    } else if (col1 === col2) {
      // Same column: expand rows
      const rowStart = Math.min(row1.charCodeAt(0), row2.charCodeAt(0));
      const rowEnd = Math.max(row1.charCodeAt(0), row2.charCodeAt(0));
      for (let r = rowStart; r <= rowEnd; r++) {
        wells.push(`${String.fromCharCode(r)}${col1}`);
      }
    } else {
      // Different row AND column: bounding-rect reading order
      const rowStart = Math.min(row1.charCodeAt(0), row2.charCodeAt(0));
      const rowEnd = Math.max(row1.charCodeAt(0), row2.charCodeAt(0));
      const colStart = Math.min(col1, col2);
      const colEnd = Math.max(col1, col2);
      for (let r = rowStart; r <= rowEnd; r++) {
        for (let c = colStart; c <= colEnd; c++) {
          wells.push(`${String.fromCharCode(r)}${c}`);
        }
      }
    }

    results.push({
      wells,
      kind: 'range',
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }

  // --- Single-cell pattern ---
  const singleRe = /\b([A-H])(\d{1,2})\b/g;
  while ((m = singleRe.exec(text)) !== null) {
    const raw = m[0];
    // Skip if this cell is part of a range or list match we already captured
    const isInRange = results.some(
      (r) => (r.kind === 'range' || r.kind === 'list') && r.raw.includes(raw),
    );
    if (isInRange) continue;

    results.push({
      wells: [raw],
      kind: 'single',
      span: [m.index, m.index + m[0].length],
      raw,
    });
  }

  // Sort by span start for deterministic output
  results.sort((a, b) => a.span[0] - b.span[0]);

  return results;
}

// ---------------------------------------------------------------------------
// extractDurations
// ---------------------------------------------------------------------------

/**
 * Extract duration quantities from text. Converts all units to seconds.
 *
 * Matches: N s/sec/seconds, N min/minutes, N h/hr/hours, N day/days
 * Special token: overnight → 43200 seconds (12 hours)
 */
export function extractDurations(text: string): DurationMatch[] {
  if (typeof text !== 'string' || text.length === 0) return [];

  const results: DurationMatch[] = [];

  // --- Numeric duration pattern ---
  const re = /(\d+(?:\.\d+)?)\s*(s|sec|seconds?|min|minutes?|h|hr|hours?|days?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1]!);
    const unit = m[2]!.toLowerCase();
    let multiplier = 1;

    if (unit === 'min' || unit === 'minute' || unit === 'minutes') {
      multiplier = 60;
    } else if (unit === 'h' || unit === 'hr' || unit === 'hour' || unit === 'hours') {
      multiplier = 3600;
    } else if (unit === 'day' || unit === 'days') {
      multiplier = 86400;
    }

    results.push({
      value_seconds: value * multiplier,
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }

  // --- Overnight special token ---
  const overnightRe = /\bovernight\b/gi;
  while ((m = overnightRe.exec(text)) !== null) {
    results.push({
      value_seconds: 12 * 3600, // 43200
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }

  // Sort by span start for deterministic output
  results.sort((a, b) => a.span[0] - b.span[0]);

  return results;
}

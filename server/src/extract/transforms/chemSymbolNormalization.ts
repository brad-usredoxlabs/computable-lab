/**
 * Chemical symbol normalization transform for extraction candidates.
 * 
 * Normalizes common chemistry symbol variants inside material-spec candidate drafts:
 * - Greek mu (µ, μ) → ASCII 'u'
 * - Multiplication sign (×) → 'x'
 * - Degree sign (°C) → 'C'
 * - Superscript numbers (⁰, ², ³) → ASCII equivalents
 * - Trademark (™) and registered (®) symbols → stripped
 * 
 * This transform is intended to be applied after extraction but before mention resolution
 * to improve match rates against the record store.
 */

import type { ExtractionCandidate } from '../ExtractorAdapter.js';

const SYMBOL_MAP: Array<[RegExp, string, string]> = [
  // [pattern, replacement, note]
  [/\u00B5/g, 'u', 'µ → u'],
  [/\u03BC/g, 'u', 'μ (Greek mu) → u'],
  [/\u00D7/g, 'x', '× → x'],
  [/\u00B0C/g, 'C', '°C → C'],
  [/\u2070/g, '0', 'superscript 0 → 0'],
  [/\u00B2/g, '2', 'superscript 2 → 2'],
  [/\u00B3/g, '3', 'superscript 3 → 3'],
  [/\u2122/g, '', '™ stripped'],
  [/\u00AE/g, '', '® stripped'],
];

/**
 * Normalizes chemical symbol variants in extraction candidates.
 * 
 * Only modifies candidates with target_kind === 'material-spec'.
 * Records normalization notes in the draft's notes[] array.
 * 
 * @param candidates - Array of extraction candidates to normalize
 * @returns Array of normalized candidates (new objects, originals unchanged)
 */
export function normalizeChemSymbols(candidates: ExtractionCandidate[]): ExtractionCandidate[] {
  return candidates.map(c => {
    if (c.target_kind !== 'material-spec') return c;
    const { draft, notes } = normalizeDraftObject(c.draft as Record<string, unknown>);
    if (notes.length === 0) return c;
    const existingNotes = Array.isArray((c.draft as Record<string, unknown>).notes)
      ? ((c.draft as Record<string, unknown>).notes as string[])
      : [];
    return {
      ...c,
      draft: { ...draft, notes: [...existingNotes, ...notes] },
    };
  });
}

/**
 * Normalizes all string values in a draft object.
 * 
 * @param o - The draft object to normalize
 * @returns Object with normalized draft and collected notes
 */
function normalizeDraftObject(o: Record<string, unknown>): { draft: Record<string, unknown>; notes: string[] } {
  const notes: string[] = [];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') {
      const { text, notes: n } = normalizeString(v);
      out[k] = text;
      for (const note of n) notes.push(`${k}: ${note}`);
    } else {
      out[k] = v;
    }
  }
  return { draft: out, notes };
}

/**
 * Normalizes a single string value using the symbol map.
 * 
 * @param s - The string to normalize
 * @returns Object with normalized text and collected notes
 */
function normalizeString(s: string): { text: string; notes: string[] } {
  let text = s;
  const notes: string[] = [];
  for (const [re, rep, note] of SYMBOL_MAP) {
    if (re.test(text)) {
      text = text.replace(re, rep);
      notes.push(`normalized: ${note}`);
    }
  }
  return { text, notes };
}

/**
 * SpecSheetExtractor — Engine that fetches a vendor spec-sheet URL via Exa
 * and extracts field proposals using a YAML field-map.
 *
 * Pure core: extractProposals(fieldMap, doc)
 * Orchestration: extractFromUrl(recordKind, url)
 *
 * No field names, vendor strings, or catalog numbers hardcoded here.
 * Everything drives from the YAML field map.
 */

import type { SpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { getSpecSheetFieldMap } from './SpecSheetFieldMaps.js';
import { resolveExaConfig, exaGetContents } from '../integrations/exa.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecSheetProposal {
  /** Schema target field (e.g. 'vendor', 'catalog_number') */
  targetField: string;
  /** Extracted value string */
  value: string;
  /** Source URL of the document */
  sourceUrl: string;
  /** Quoted passage from the document text (verbatim match) */
  passage: string;
  /** Extraction-spec identifier */
  specId: string;
}

export interface SpecSheetExtractSuccess {
  configured: true;
  proposals: SpecSheetProposal[];
}

export interface SpecSheetExtractNotConfigured {
  configured: false;
  reason: 'not_configured';
  proposals: SpecSheetProposal[];
}

export interface SpecSheetExtractBlocked {
  configured: true;
  proposals: SpecSheetProposal[];
  blocked: {
    url: string;
    reason: string;
  };
}

export type SpecSheetExtractResult =
  | SpecSheetExtractSuccess
  | SpecSheetExtractNotConfigured
  | SpecSheetExtractBlocked;

/** Server-authored constant for fetch-blocked reason. */
export const EXA_FETCH_BLOCKED = 'exa_fetch_blocked';

// ---------------------------------------------------------------------------
// Transform dispatch table — declarative, keyed by YAML transform string
// ---------------------------------------------------------------------------

const TRANSFORMS: Record<string, (value: string) => string> = {
  parse_volume: (value) => value, // pass-through; do not invent numbers
};

function applyTransform(value: string, transform: string | undefined): string {
  if (!transform || !TRANSFORMS[transform]) return value;
  return TRANSFORMS[transform](value);
}

// ---------------------------------------------------------------------------
// Keyword extraction — parse source description into match phrases
// ---------------------------------------------------------------------------

function parseSourceKeywords(source: string): string[] {
  // Split on "/" to get alternatives, then strip prepositional tails
  const alternatives = source.split('/').map((s) => s.trim());
  const keywords: string[] = [];
  const prepositionRe = /^(.+?)\s+(?:from|as|described|referenced|listed|on|in|of|with)\b/i;

  for (const alt of alternatives) {
    if (!alt) continue;
    const match = alt.match(prepositionRe);
    const phrase = match && typeof match[1] === 'string' ? match[1].trim() : alt.trim();
    if (phrase) keywords.push(phrase);
  }
  return keywords;
}

// ---------------------------------------------------------------------------
// Value extraction — handle "Key: Value" format
// ---------------------------------------------------------------------------

function extractValue(line: string): string | null {
  const colonMatch = line.match(/^(.+?):\s*(.+)$/);
  if (colonMatch && typeof colonMatch[2] === 'string') return colonMatch[2].trim() || null;
  return null;
}

// ---------------------------------------------------------------------------
// Pure extraction engine
// ---------------------------------------------------------------------------

export function extractProposals(
  fieldMap: SpecSheetFieldMap,
  doc: { url: string; text: string },
): SpecSheetProposal[] {
  const specId = `XSPEC-${fieldMap.recordKind.toUpperCase()}`;
  const lines = doc.text.split('\n').filter((l) => l.trim().length > 0);
  const proposals: SpecSheetProposal[] = [];

  for (const mapping of fieldMap.fieldMappings) {
    const keywords = parseSourceKeywords(mapping.source);
    if (keywords.length === 0) continue;

    for (const line of lines) {
      const trimmed = line.trim();
      // Case-insensitive keyword match
      const matched = keywords.some((kw) =>
        trimmed.toLowerCase().includes(kw.toLowerCase()),
      );
      if (!matched) continue;

      const rawValue = extractValue(trimmed);
      if (!rawValue) continue;

      const value = applyTransform(rawValue, mapping.transform);
      proposals.push({
        targetField: mapping.targetField,
        value,
        sourceUrl: doc.url,
        passage: trimmed,
        specId,
      });
      break; // one match per field
    }
  }

  return proposals;
}

// ---------------------------------------------------------------------------
// Orchestration — fetch + extract from URL
// ---------------------------------------------------------------------------

export async function extractFromUrl(
  recordKind: string,
  url: string,
): Promise<SpecSheetExtractResult> {
  // 1) Resolve field map — unmapped kind throws BEFORE any network call
  const fieldMap = await getSpecSheetFieldMap(recordKind);

  // 2) Resolve Exa config
  const config = resolveExaConfig();
  if (!config) {
    return { configured: false, reason: 'not_configured', proposals: [] };
  }

  // 3) Fetch content via Exa
  try {
    const response = await exaGetContents(config, {
      urls: [url],
      contentMode: 'text',
      maxCharacters: 12000,
    });
    const results = (response as { results?: Array<{ text?: string }> })?.results;
    const text = Array.isArray(results) && results[0]?.text ? results[0].text : '';

    return {
      configured: true,
      proposals: extractProposals(fieldMap, { url, text }),
    };
  } catch (_err) {
    // Typed block record on fetch failure — never synthesise a value
    return {
      configured: true,
      proposals: [],
      blocked: { url, reason: EXA_FETCH_BLOCKED },
    };
  }
}

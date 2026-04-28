/**
 * NounPhraseResolver — clause + verb → resolved noun-phrase hits.
 *
 * Given a Clause and its VerbMatch (if any), extracts noun-phrase candidates
 * from the post-verb text and resolves each against four registry tiers:
 *   1. labware-definition (exact match) → kind 'labware', confidence 1.0
 *   2. compound-class (exact match)     → kind 'compound', confidence 1.0
 *   3. ontology-term (case-insensitive substring) → kind 'ontology', confidence 0.7
 *   4. labware-instance (async substring) → kind 'labware-instance', confidence 0.6
 *
 * No fuzzy matching, no LLM calls. Pure async function because tier 4 is async.
 */

import type { Clause } from './TextSegmenter';
import type { VerbMatch } from './VerbMatcher';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedNoun {
  phrase: string;
  span: [number, number];
  kind: 'labware' | 'compound' | 'ontology' | 'labware-instance' | 'unresolved';
  recordId?: string;
  confidence: number;
  source?: string;
}

export interface NounResolverDeps {
  labwareDefinitionRegistry: {
    findByName: (name: string) => { recordId: string } | undefined;
  };
  compoundClassRegistry: {
    findByName: (name: string) => { recordId: string } | undefined;
  };
  ontologyTermRegistry: {
    searchLabel: (q: string) => Array<{ id: string; label: string; source: string }>;
  };
  labwareInstanceLookup: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'some', 'this', 'that', 'these', 'those',
]);

const NP_SPLIT_RE = /,\s*|\s+and\s+|\s+to\s+|\s+from\s+|\s+into\s+|\s+onto\s+/i;
const PURE_NUMERIC_RE = /^\d+(\.\d+)?$/;

// ---------------------------------------------------------------------------
// Phrase splitting
// ---------------------------------------------------------------------------

/**
 * Extract noun-phrase candidates from the clause text.
 *
 * If verbMatch is present, text is sliced to post-verb region.
 * Then split on commas, 'and', 'to', 'from', 'into', 'onto'.
 * Trim, drop empty / stopwords / pure numerics.
 *
 * Returns fragments with their spans relative to the original clause.
 */
function extractNounPhraseCandidates(
  clause: Clause,
  verbMatch: VerbMatch | undefined,
): Array<{ phrase: string; span: [number, number] }> {
  // Determine the text region to split
  const verbOffset = verbMatch ? verbMatch.span[1] - clause.span[0] : 0;
  const region = clause.text.slice(verbOffset);

  // Split on delimiter regex
  const fragments = region.split(NP_SPLIT_RE);

  const results: Array<{ phrase: string; span: [number, number] }> = [];

  for (const frag of fragments) {
    const trimmed = frag.trim();
    if (trimmed.length === 0) continue;

    // Drop single stopwords
    if (STOPWORDS.has(trimmed.toLowerCase())) continue;

    // Drop pure numerics
    if (PURE_NUMERIC_RE.test(trimmed)) continue;

    // Compute span: position of fragment within the region + clause.span[0]
    // We need to find the fragment's position in the original clause text.
    // The region starts at verbOffset within clause.text.
    // Find the trimmed fragment's position within the region.
    const regionStart = clause.text.indexOf(trimmed, verbOffset);
    if (regionStart === -1) continue; // safety

    const span: [number, number] = [
      regionStart + clause.span[0],
      regionStart + clause.span[0] + trimmed.length,
    ];

    results.push({ phrase: trimmed, span });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a single noun-phrase candidate against the four registry tiers.
 * Returns the first hit or 'unresolved' (without span — caller adds it).
 */
async function resolveOne(
  phrase: string,
  deps: NounResolverDeps,
): Promise<Omit<ResolvedNoun, 'span'>> {
  // Tier 1: labware-definition exact match
  const lw = deps.labwareDefinitionRegistry.findByName(phrase);
  if (lw) {
    return { phrase, kind: 'labware', recordId: lw.recordId, confidence: 1.0 };
  }

  // Tier 2: compound-class exact match
  const cp = deps.compoundClassRegistry.findByName(phrase);
  if (cp) {
    return { phrase, kind: 'compound', recordId: cp.recordId, confidence: 1.0 };
  }

  // Tier 3: ontology-term case-insensitive substring
  const ontHits = deps.ontologyTermRegistry.searchLabel(phrase);
  if (ontHits.length > 0) {
    const first = ontHits[0]!;
    return {
      phrase,
      kind: 'ontology',
      recordId: first.id,
      source: first.source,
      confidence: 0.7,
    };
  }

  // Tier 4: labware-instance async lookup
  const instHits = await deps.labwareInstanceLookup(phrase);
  if (instHits.length > 0) {
    const first = instHits[0]!;
    return {
      phrase,
      kind: 'labware-instance',
      recordId: first.recordId,
      confidence: 0.6,
    };
  }

  // No hit → unresolved
  return { phrase, kind: 'unresolved', confidence: 0 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve noun phrases in a clause.
 *
 * @param clause  — the clause from TextSegmenter
 * @param verbMatch — the matched verb (if any)
 * @param deps — registry lookups
 * @returns resolved noun phrases, in order of appearance
 */
export async function resolveNounPhrases(
  clause: Clause,
  verbMatch: VerbMatch | undefined,
  deps: NounResolverDeps,
): Promise<ResolvedNoun[]> {
  const candidates = extractNounPhraseCandidates(clause, verbMatch);

  const resolved: ResolvedNoun[] = [];

  for (const { phrase, span } of candidates) {
    const result = await resolveOne(phrase, deps);
    resolved.push({ ...result, span });
  }

  return resolved;
}

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
import type { PromptMention } from '../../ai/promptMentions';
import type { MaterializedPromptTag } from './TaggerOutput';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedNoun {
  phrase: string;
  span: [number, number];
  kind: 'labware' | 'compound' | 'ontology' | 'labware-instance' | 'material' | 'unresolved';
  recordId?: string;
  confidence: number;
  source?: string;
  registryMatch?: FuzzyRegistryMatch;
}

export interface FuzzyRegistryMatch {
  distance: number;
  matchedKey: string;
  matchKind: 'exact' | 'normalized' | 'edit';
}

export interface NounResolverDeps {
  labwareDefinitionRegistry: {
    findByName: (name: string) => ({ recordId: string } & Partial<{ registryMatch: FuzzyRegistryMatch }>) | undefined;
  };
  compoundClassRegistry: {
    findByName: (name: string) => ({ recordId: string } & Partial<{ registryMatch: FuzzyRegistryMatch }>) | undefined;
  };
  ontologyTermRegistry: {
    searchLabel: (q: string) => Array<{ id: string; label: string; source: string }>;
  };
  labwareInstanceLookup: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
  /**
   * Optional map keyed by lowercased placeholder token (e.g. `__mention_0__`)
   * → PromptMention. When present, a phrase that matches a key is resolved
   * directly from the mention's id, bypassing the registry tiers.
   *
   * Wired by DeterministicPrecompilePass after substituting `[[kind:id|label]]`
   * tokens with placeholder strings prior to clause segmentation.
   */
  mentionLookup?: Map<string, PromptMention>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'some', 'this', 'that', 'these', 'those',
  // Pronouns / fillers — when an entire post-split fragment is one of these
  // it carries no entity content (e.g. "transfer 50uL of it to ...").
  'it', 'them', 'they',
]);

// Add `of` to the split set so phrases like "well A1 of the 12-well reservoir"
// break into "well A1" + "the 12-well reservoir" — otherwise the labware
// reference is hidden inside a larger string that no registry can match.
const NP_SPLIT_RE = /,\s*|\s+and\s+|\s+to\s+|\s+from\s+|\s+into\s+|\s+onto\s+|\s+of\s+/i;
const PURE_NUMERIC_RE = /^\d+(\.\d+)?$/;
const LEADING_STOPWORD_RE = /^(?:the|a|an|some|this|that|these|those)\s+/i;
// Phrases that are *only* a well address (or row/col label) — these are
// extracted separately by ParameterGrammar and don't need entity resolution.
// Example: "well A1", "wells A1, A3", "row B", "column 3", "A1-A12".
const WELL_ONLY_RE =
  /^(?:wells?\s+)?[A-H]\d{1,2}(?:\s*[,–-]\s*[A-H]\d{1,2})*$/i;
const ROW_COL_ONLY_RE = /^(?:row|col|column)\s+[A-Z0-9]+$/i;
// Phrases that are *only* a quantity with a unit — volume, count, or duration.
// Captured by ParameterGrammar; treating them as unresolved nouns would
// falsely flag clauses with literal volumes/counts as residual.
const VOLUME_ONLY_RE = /^\d+(?:\.\d+)?\s*(?:[µμ]L|uL|microliters?|mL|ml|milliliters?|L|liters?)$/i;
const DURATION_ONLY_RE = /^\d+(?:\.\d+)?\s*(?:s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i;
const COUNT_ONLY_RE = /^\d+\s*(?:cells?|copies|colonies)$/i;
// Tokenizer matching TextSegmenter's split set, used for fuzzy back-reference
// matching against mention labels.
const FUZZY_TOKEN_SPLIT_RE = /[\s,;:.\-—–"'()\[\]{}!?]+/;

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
    let trimmed = frag.trim();
    if (trimmed.length === 0) continue;

    // Compute span using the un-stripped form (so highlights line up with
    // the user's original text) before we strip leading stopwords for
    // resolution purposes.
    const regionStart = clause.text.indexOf(trimmed, verbOffset);
    if (regionStart === -1) continue;

    const spanStart = regionStart + clause.span[0];
    const spanEnd = spanStart + trimmed.length;

    // Strip a leading determiner ("the 12-well reservoir" → "12-well reservoir")
    // so registry/mention lookups see the actual entity tokens.
    trimmed = trimmed.replace(LEADING_STOPWORD_RE, '');
    if (trimmed.length === 0) continue;

    // Drop single stopwords
    if (STOPWORDS.has(trimmed.toLowerCase())) continue;

    // Drop pure numerics
    if (PURE_NUMERIC_RE.test(trimmed)) continue;

    // Drop phrases that are purely parameters (well addresses, volumes,
    // durations, counts). Those are extracted elsewhere by ParameterGrammar
    // and counting them as unresolved noun phrases would falsely flag the
    // clause as residual.
    if (
      WELL_ONLY_RE.test(trimmed) ||
      ROW_COL_ONLY_RE.test(trimmed) ||
      VOLUME_ONLY_RE.test(trimmed) ||
      DURATION_ONLY_RE.test(trimmed) ||
      COUNT_ONLY_RE.test(trimmed)
    ) continue;

    results.push({ phrase: trimmed, span: [spanStart, spanEnd] });
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
  // Tier 0: mention placeholder match. Phrases that came from `[[kind:id|label]]`
  // tokens are pre-resolved by the user — skip the registry tiers. We also scan
  // for an embedded placeholder because NP_SPLIT keeps surrounding modifiers
  // (e.g. `1000uL of __mention_2__`) attached to the placeholder.
  if (deps.mentionLookup) {
    const lower = phrase.toLowerCase();
    let hit = deps.mentionLookup.get(lower);
    if (!hit) {
      const embedded = lower.match(/__(?:input_)?mention_\d+__/);
      if (embedded) hit = deps.mentionLookup.get(embedded[0]);
    }
    if (hit && hit.id) {
      if (hit.type === 'labware') {
        return {
          phrase: hit.label || phrase,
          kind: isRuntimeLabwareMention(hit) ? 'labware-instance' : 'labware',
          recordId: hit.id,
          confidence: 1.0,
          source: 'mention',
        };
      }
      if (hit.type === 'material') {
        return { phrase: hit.label || phrase, kind: 'material', recordId: hit.id, confidence: 1.0, ...(hit.entityKind ? { source: hit.entityKind } : {}) };
      }
      // selection/protocol mentions don't map to noun-phrase semantics here.
    }

    const fuzzyMention = resolveFuzzyMention(phrase, deps.mentionLookup);
    if (fuzzyMention) return fuzzyMention;
  }

  // Tier 1: labware-definition exact match
  const lw = deps.labwareDefinitionRegistry.findByName(phrase);
  if (lw) {
    return {
      phrase,
      kind: 'labware',
      recordId: lw.recordId,
      confidence: 1.0,
      ...(lw.registryMatch ? { registryMatch: lw.registryMatch } : {}),
    };
  }

  // Tier 2: compound-class exact match
  const cp = deps.compoundClassRegistry.findByName(phrase);
  if (cp) {
    return {
      phrase,
      kind: 'compound',
      recordId: cp.recordId,
      confidence: 1.0,
      ...(cp.registryMatch ? { registryMatch: cp.registryMatch } : {}),
    };
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

  const fuzzyMention = resolveFuzzyMention(phrase, deps.mentionLookup);
  if (fuzzyMention) return fuzzyMention;

  // No hit → unresolved
  return { phrase, kind: 'unresolved', confidence: 0 };
}

function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of text.toLowerCase().split(FUZZY_TOKEN_SPLIT_RE)) {
    if (t.length > 1 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

function isRuntimeLabwareMention(mention: PromptMention): boolean {
  return typeof mention.id === 'string' && mention.id.startsWith('lw-');
}

function resolveFuzzyMention(
  phrase: string,
  mentionLookup: Map<string, PromptMention> | undefined,
): Omit<ResolvedNoun, 'span'> | undefined {
  if (!mentionLookup || mentionLookup.size === 0) return undefined;

  const phraseTokens = tokenize(phrase);
  if (phraseTokens.size === 0) return undefined;

  let bestScore = 0;
  let bestMention: PromptMention | undefined;
  for (const mention of mentionLookup.values()) {
    if (!mention.id) continue;
    const labelTokens = tokenize(mention.label);
    if (labelTokens.size === 0) continue;
    let overlap = 0;
    for (const t of phraseTokens) if (labelTokens.has(t)) overlap++;
    if (overlap === 0) continue;
    const score = overlap / Math.max(phraseTokens.size, labelTokens.size);
    if (score > bestScore) {
      bestScore = score;
      bestMention = mention;
    }
  }

  // Threshold: require at least ~25% token overlap so generic words like
  // "plate" alone don't link to the wrong labware.
  if (!bestMention || bestScore < 0.25) return undefined;

  if (bestMention.type === 'labware') {
    return {
      phrase,
      kind: isRuntimeLabwareMention(bestMention) ? 'labware-instance' : 'labware',
      recordId: bestMention.id!,
      confidence: 0.5,
      source: 'mention-fuzzy',
    };
  }
  if (bestMention.type === 'material') {
    return {
      phrase,
      kind: 'material',
      recordId: bestMention.id!,
      confidence: 0.5,
      source: bestMention.entityKind ?? 'mention-fuzzy',
    };
  }

  return undefined;
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

export async function resolveNounPhrasesFromTags(
  tags: MaterializedPromptTag[],
  deps: NounResolverDeps,
): Promise<ResolvedNoun[]> {
  const resolved: ResolvedNoun[] = [];

  for (const tag of tags) {
    if (tag.kind === 'mention') {
      const mention = resolveMentionTag(tag);
      if (mention) resolved.push(mention);
      continue;
    }

    if (tag.kind !== 'noun_phrase') continue;

    const result = await resolveOne(tag.text, deps);
    const candidateSource = tag.candidateKinds && tag.candidateKinds.length > 0
      ? `tag:${tag.candidateKinds.join(',')}`
      : undefined;
    resolved.push({
      ...result,
      span: tag.span,
      ...(result.kind === 'unresolved' && candidateSource ? { source: candidateSource } : {}),
    });
  }

  return resolved.sort((a, b) => a.span[0] - b.span[0]);
}

function resolveMentionTag(tag: MaterializedPromptTag): ResolvedNoun | undefined {
  if (!tag.id) return undefined;

  const mentionKind = tag.mentionKind?.toLowerCase();
  if (mentionKind === 'labware' || tag.id.startsWith('lw-') || tag.id.startsWith('lbw-') || tag.id.startsWith('def:')) {
    return {
      phrase: tag.text,
      span: tag.span,
      kind: tag.id.startsWith('lw-') ? 'labware-instance' : 'labware',
      recordId: tag.id,
      confidence: 1.0,
      source: 'mention',
    };
  }

  if (
    mentionKind === 'material' ||
    mentionKind === 'aliquot' ||
    mentionKind === 'material-spec' ||
    mentionKind === 'compound'
  ) {
    return {
      phrase: tag.text,
      span: tag.span,
      kind: 'material',
      recordId: tag.id,
      confidence: 1.0,
      source: mentionKind,
    };
  }

  return undefined;
}

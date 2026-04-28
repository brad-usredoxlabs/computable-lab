/**
 * VerbMatcher — clause → canonical verb candidate.
 *
 * Given a Clause from TextSegmenter, finds the first token that maps to a
 * canonical verb via the synonym-aware registry accessor. Returns the canonical
 * verb plus where it appeared in the clause. Pure data operation; no LLM, no I/O.
 */

import type { Clause } from './TextSegmenter';

export interface VerbMatch {
  verb: string;             // canonical verb name (e.g. 'transfer')
  source: 'canonical' | 'synonym';
  tokenIndex: number;       // index into clause.tokens
  span: [number, number];   // byte span in the original input string
}

/**
 * Registry interface — structurally typed so tests can pass a mock.
 */
export interface VerbActionMapRegistry {
  findVerbForToken: (t: string) => { verb: string; source: 'canonical' | 'synonym' } | undefined;
}

/**
 * Walk clause.tokens from index 0. For each token, call registry.findVerbForToken.
 * On first hit, compute the span by locating the token in clause.text (case-insensitive).
 * Returns undefined if no token matches.
 */
export function matchVerb(
  clause: Clause,
  registry: VerbActionMapRegistry,
): VerbMatch | undefined {
  const lowerText = clause.text.toLowerCase();
  let cursor = 0;

  for (let i = 0; i < clause.tokens.length; i++) {
    const token = clause.tokens[i];
    if (token === undefined) continue;
    const hit = registry.findVerbForToken(token);
    if (hit) {
      const indexInClauseText = lowerText.indexOf(token, cursor);
      const span: [number, number] = [
        clause.span[0] + indexInClauseText,
        clause.span[0] + indexInClauseText + token.length,
      ];
      return {
        verb: hit.verb,
        source: hit.source,
        tokenIndex: i,
        span,
      };
    }
    // Advance cursor past this token so next indexOf doesn't re-match it
    cursor += token.length;
  }

  return undefined;
}

/**
 * Term reconciliation: link on a match, SUGGEST on a near miss — never merge.
 *
 * Brad's canonical failure (2026-09-20): one organism under four terms —
 * `f prausnitzii`, `FPRAUS`, `F praus`, `f pruas`. Note the last two differ by a
 * TYPO (`praus` vs `pruas`), so no amount of normalization folds them; only a
 * fuzzy comparison can see they are probably the same thing, and only a human can
 * decide.
 *
 * Hence the split this module enforces:
 *
 *   pickExistingTerm   exact match on the preferred label or any alias → LINK
 *                      automatically (case/space-insensitive).
 *   suggestExistingTerms  bounded edit distance (default ≤2) → SUGGEST in the
 *                      review dialogue. Never applied automatically; the accepted
 *                      spelling is appended to `aliases`, so the next occurrence
 *                      matches exactly and links by itself.
 *
 * `aliases` is already declared in `schema/core/term.schema.yaml:48` and, as of
 * 2026-09-20, nothing in `server/src` reads it — this is the first consumer.
 */

export interface TermLike {
  id: string;
  preferredLabel: string;
  aliases?: string[];
}

export function normalizeTermName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Bounded Levenshtein: we only care about "one or two characters off". */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** The term this spelling already IS (label or alias), or null. */
export function pickExistingTerm(query: string, terms: readonly TermLike[]): TermLike | null {
  const wanted = normalizeTermName(query);
  if (!wanted) return null;
  for (const term of terms) {
    if (normalizeTermName(term.preferredLabel) === wanted) return term;
    if ((term.aliases ?? []).some((alias) => normalizeTermName(alias) === wanted)) return term;
  }
  return null;
}

export interface TermSuggestion {
  term: TermLike;
  distance: number;
  /** Which spelling of the existing term it nearly matched. */
  matchedOn: string;
}

/** Near matches for the review dialogue — ordered best-first, never applied. */
export function suggestExistingTerms(
  query: string,
  terms: readonly TermLike[],
  tolerance = 2,
): TermSuggestion[] {
  const wanted = normalizeTermName(query);
  if (!wanted) return [];
  // An exact match is a LINK, not a decision to offer — suggesting it would put a
  // pointless row in front of the biologist.
  if (pickExistingTerm(query, terms)) return [];
  const out: TermSuggestion[] = [];
  for (const term of terms) {
    const candidates = [term.preferredLabel, ...(term.aliases ?? [])];
    let best: { distance: number; matchedOn: string } | null = null;
    for (const candidate of candidates) {
      const normalized = normalizeTermName(candidate);
      if (!normalized || normalized === wanted) continue;
      const distance = editDistance(wanted, normalized, tolerance);
      if (distance <= tolerance && (best === null || distance < best.distance)) {
        best = { distance, matchedOn: candidate };
      }
    }
    if (best) out.push({ term, distance: best.distance, matchedOn: best.matchedOn });
  }
  return out.sort((a, b) => a.distance - b.distance || a.term.preferredLabel.localeCompare(b.term.preferredLabel));
}

/**
 * The spelling to add to a term's aliases when the biologist confirms a link:
 * the draft's own words, unless they are already the preferred label or an alias.
 */
export function aliasToAppend(term: TermLike, spelling: string): string | null {
  const normalized = normalizeTermName(spelling);
  if (!normalized) return null;
  if (normalizeTermName(term.preferredLabel) === normalized) return null;
  if ((term.aliases ?? []).some((alias) => normalizeTermName(alias) === normalized)) return null;
  return spelling.trim();
}

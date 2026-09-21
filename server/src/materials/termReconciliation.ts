/**
 * Term reconciliation: link on a match, SUGGEST on a near miss — never merge.
 *
 * Brad's canonical failure (2026-09-20): one organism under four terms —
 * `f prausnitzii`, `FPRAUS`, `F praus`, `f pruas`. Note the last two differ by a
 * TYPO (`praus` vs `pruas`), so no amount of normalization folds them; only a
 * fuzzy comparison can see they are probably the same thing, and only a human can
 * decide.
 *
 * LINKING IS NOT THIS MODULE'S JOB. The lab's identity spine (`ResolveSpine`,
 * tier 0 canonical terms + tier 1 records) is alias-first and is the same code the
 * UI, the compiler and the agent use — so an exact-or-alias match is resolved by
 * `resolveDraftMaterials`, in one place, by the thing that owns the fact.
 *
 * What the spine deliberately does NOT do is guess at a TYPO: `f praus` and
 * `f pruas` are two strings to an exact matcher, and no alias basket contains the
 * second until someone confirms it. That is the only thing left here — a bounded
 * edit-distance suggestion for the review dialogue, never applied automatically.
 *
 * `aliasToAppend` is the write side: when the biologist confirms a link, the
 * draft's spelling joins `aliases` (`schema/core/term.schema.yaml:48`) and the
 * NEXT occurrence is a tier-0 exact hit with no dialogue at all.
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

/**
 * Does this spelling already match the term exactly (label or alias)? A private
 * predicate, not a linker: the spine decides links, this only keeps the panel from
 * offering a suggestion for something that is already an exact match.
 */
function matchesExactly(query: string, term: TermLike): boolean {
  const wanted = normalizeTermName(query);
  if (!wanted) return false;
  if (normalizeTermName(term.preferredLabel) === wanted) return true;
  return (term.aliases ?? []).some((alias) => normalizeTermName(alias) === wanted);
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
  // An exact match is a LINK (and the spine resolves it) — suggesting it would put
  // a pointless row in front of the biologist.
  if (terms.some((term) => matchesExactly(query, term))) return [];
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

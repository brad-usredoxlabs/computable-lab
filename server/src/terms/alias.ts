/**
 * Alias normalization — the F-praus fix.
 *
 * Biologists spell the same thing many ways ("F praus", "FPRAUS", "F. praus",
 * "f praus"). For two free-text mentions to collapse onto ONE canonical term
 * they must share a canonical comparison key.
 *
 * The comparison key strips EVERYTHING non-alphanumeric (no separator kept),
 * so separator variants — "FPRAUS", "F praus", "F-praus", "f.praus" — all
 * collapse to the same key. This is deliberately lossless for *separators and
 * case* but does NOT silently correct typos: "f praaus" ≠ "FPRAUS" (a genuinely
 * mis-spelled alias), which MUST remain distinct unless the author/AI records
 * it as an alias on the same term. Auto-correcting typos would over-merge.
 *
 * The raw alias string is preserved for display/search; only the comparison
 * key is normalized.
 */

/** Canonical comparison key: lowercase, ALL non-alphanumeric removed. */
export function normalizeAlias(input: string): string {
  const s = (input ?? '').trim().toLowerCase();
  return s.replace(/[^a-z0-9]+/g, '').trim();
}

/** Structural equivalence: do two raw aliases mean the same canonical key? */
export function aliasesEquivalent(a: string, b: string): boolean {
  const ka = normalizeAlias(a);
  const kb = normalizeAlias(b);
  return ka === kb;
}
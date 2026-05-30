/**
 * Closest-match helper for teaching-quality validation hints.
 *
 * Used to turn a terse rejection ("Must be one of: a, b, c") into a
 * constructive one ("…did you mean 'b'?") by finding the nearest allowed value
 * to what the author actually wrote. Case-insensitive Levenshtein distance.
 */

/** Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/**
 * Return the candidate closest to `value` (case-insensitive), or undefined when
 * no candidate is within `maxDistance`. `maxDistance` defaults to a fraction of
 * the value length so short typos match but unrelated strings don't.
 */
export function closestMatch(
  value: string,
  candidates: readonly string[],
  maxDistance?: number,
): string | undefined {
  const v = value.trim().toLowerCase();
  if (!v || candidates.length === 0) return undefined;

  const limit = maxDistance ?? Math.max(2, Math.floor(v.length / 2));
  let best: string | undefined;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(v, String(candidate).toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best !== undefined && bestDist <= limit ? best : undefined;
}

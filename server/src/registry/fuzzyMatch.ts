export type FuzzyMatchKind = 'exact' | 'normalized' | 'edit';

export interface FuzzyFindResult<T> {
  match: T;
  distance: number;
  matchedKey: string;
  matchKind: FuzzyMatchKind;
  normalizedQuery: string;
}

export interface FuzzyFindByNameArgs<T> {
  entries: readonly T[];
  query: string;
  getKeys: (entry: T) => readonly string[];
  maxDistance?: number;
  minEditLength?: number;
}

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, '')
    .replace(/[.,;:()[\]{}'"`]/g, '')
    .replace(/\s+/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_unused, i) => i);
  let current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost,
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length]!;
}

export function fuzzyFindByName<T>({
  entries,
  query,
  getKeys,
  maxDistance,
  minEditLength = 5,
}: FuzzyFindByNameArgs<T>): FuzzyFindResult<T> | undefined {
  const rawQuery = query.trim();
  if (rawQuery.length === 0) return undefined;

  const normalizedQuery = normalize(rawQuery);
  if (normalizedQuery.length === 0) return undefined;

  const candidates: Array<{ entry: T; key: string; normalizedKey: string }> = [];
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const rawKey of getKeys(entry)) {
      const key = rawKey.trim();
      if (key.length === 0 || seen.has(key)) continue;
      const normalizedKey = normalize(key);
      if (normalizedKey.length === 0) continue;
      seen.add(key);
      candidates.push({ entry, key, normalizedKey });
    }
  }

  const exactHits = candidates.filter((candidate) => candidate.key === rawQuery);
  const exactHit = uniqueEntryHit(exactHits);
  if (exactHit) {
    return {
      match: exactHit.entry,
      distance: 0,
      matchedKey: exactHit.key,
      matchKind: 'exact',
      normalizedQuery,
    };
  }

  const normalizedHits = candidates.filter((candidate) => candidate.normalizedKey === normalizedQuery);
  const normalizedHit = uniqueEntryHit(normalizedHits);
  if (normalizedHit) {
    return {
      match: normalizedHit.entry,
      distance: 0,
      matchedKey: normalizedHit.key,
      matchKind: 'normalized',
      normalizedQuery,
    };
  }
  if (normalizedHits.length > 0) return undefined;

  if (normalizedQuery.length < minEditLength) return undefined;

  const allowedDistance = maxDistance ?? Math.min(2, Math.floor(normalizedQuery.length / 4));
  if (allowedDistance < 1) return undefined;

  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      distance: levenshtein(normalizedQuery, candidate.normalizedKey),
    }))
    .sort((a, b) => a.distance - b.distance);

  const best = ranked[0];
  if (!best || best.distance > allowedDistance) return undefined;

  const secondDifferentEntry = ranked.find((candidate) => candidate.entry !== best.entry);
  if (secondDifferentEntry && secondDifferentEntry.distance - best.distance < 1) {
    return undefined;
  }

  return {
    match: best.entry,
    distance: best.distance,
    matchedKey: best.key,
    matchKind: 'edit',
    normalizedQuery,
  };
}

function uniqueEntryHit<T>(
  hits: Array<{ entry: T; key: string; normalizedKey: string }>,
): { entry: T; key: string; normalizedKey: string } | undefined {
  if (hits.length === 0) return undefined;
  const first = hits[0]!;
  if (hits.every((hit) => hit.entry === first.entry)) return first;
  return undefined;
}

/**
 * termId — shared deterministic local-term ID generation.
 *
 * The lab's local namespace mints CURIE records (currently `material`) with a
 * STABLE local id so that minting the same term twice always yields the same
 * recordId. This is what makes re-normalizing an accepted event graph or
 * re-running a mint idempotent, and it is the single source of truth for how a
 * free-text label becomes a local CRUD id — used by both `/vocab/mint`
 * (VocabHandlers) and programmatic grounding (MaterialGrounding).
 *
 * ID form: `<PREFIX>-<slug>-<djb2hash>`
 *   - slug: lowercased label, non-alnum → '-', truncated to 24 chars.
 *   - djb2hash: 4 base-36 chars from the label's stable djb2 hash.
 * The hash often disambiguates labels that slugify alike (e.g. "c d" / "c-d")
 * while staying deterministic; short labels can still collide on the truncated
 * hash, but a given label always maps to the SAME id (idempotency is the hard
 * guarantee — the id never changes for the same input).
 */

/** Stable djb2 hash → 4 base-36 chars. Case-insensitive so "DMSO"/"dmso" agree. */
export function labelHash(label: string): string {
  let h = 5381;
  const s = label.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 4).padStart(4, '0');
}

/** Slugified portion of the label: lowercased, non-alnum → '-', ≤24 chars. */
export function labelSlug(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'term'
  );
}

/** Deterministic `MAT-<slug>-<hash>` id for a free-text label. */
export function localMaterialIdForLabel(label: string): string {
  return `MAT-${labelSlug(label)}-${labelHash(label)}`;
}

/** Deterministic `MAT-<CURIE-SLUG>` id for an ontology-grounded term. */
export function localMaterialIdForCurie(curie: string): string {
  const slug = curie
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
  return `MAT-${slug || 'ONTOLOGY-TERM'}`;
}

/** Deterministic canonical `TERM-<slug>-<hash>` id for a canonical term label.
 * Same label → same id (idempotent); "F praus"/"FPRAUS" (same normalized label)
 * collide onto ONE term. This is the single source of truth for canonical-term
 * identity minting, used by EnsureTerm + the resolve spine's term provider. */
export function localTermIdForLabel(label: string): string {
  return `TERM-${labelSlug(label)}-${labelHash(label)}`;
}

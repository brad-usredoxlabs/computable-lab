/**
 * recordRefTraversal — the ONE traversal that answers "which payload fields
 * point at record X?".
 *
 * `findRefFields` (GET /records/:id/related) and the cascade walker behind
 * `findReferrers` / the dangling sweep used to answer it with two divergent
 * copies. This module is the single traversal; each consumer states its legacy
 * policy explicitly through a REQUIRED (no default) options object, and the
 * three policy flags exist exactly because of those consumers:
 * `includeBareStrings` because `findRefFields` counts a plain string equal to
 * the id as a reference while the cascade walker counts only
 * `{ kind: 'record', id }` objects (emitting every string as a `bare-string`
 * match keeps this walker target-agnostic; consumers filter on `targetId`);
 * `descendIntoRefObjects` because `findRefFields` keeps descending into a
 * matched ref object and so also reports its `.id` child pointer, while the
 * cascade walker stops at the match; and `skipTopLevelKeys` for the cascade
 * walker alone, so a record's own `revisionRef` never reports as a referrer or
 * dangling reference. The skip is matched against the EXACT pointer, so it
 * applies to the top-level key only and a nested `x.revisionRef` is still
 * walked — deliberate, and preserved as is: widening it would change
 * delete/sweep refusal sets.
 *
 * Pointers and emission order are byte-for-byte those of the two walkers this
 * replaces (object keys in insertion order, depth first; array elements as
 * `key[i]`). Do not "simplify" the divergences above into one policy: they are
 * observable output of two different endpoints.
 */

/** How a payload field pointed at a record id. */
export type RefMatchVia = 'ref-object' | 'bare-string';

/** One pointer into a payload that refers to `targetId`. */
export interface RefMatch {
  readonly pointer: string;
  readonly targetId: string;
  readonly via: RefMatchVia;
}

/** Required traversal policy — one explicit statement per consumer. */
export interface RefTraversalOptions {
  /** Pointer prefix to start from ('' for a whole payload). */
  readonly initialPointer: string;
  /** Exact pointers to skip without descending (top-level keys only in practice). */
  readonly skipTopLevelKeys: readonly string[];
  /** Emit `bare-string` matches for string values (caller filters by targetId). */
  readonly includeBareStrings: boolean;
  /** Keep walking inside a matched `{ kind: 'record', id }` object. */
  readonly descendIntoRefObjects: boolean;
}

function isRecordRef(value: unknown): value is { kind: 'record'; id: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return obj.kind === 'record' && typeof obj.id === 'string';
}

function walk(
  value: unknown,
  pointer: string,
  options: RefTraversalOptions,
  results: RefMatch[],
): void {
  if (options.skipTopLevelKeys.includes(pointer)) return;

  if (value === null || value === undefined) return;

  if (typeof value !== 'object') {
    if (typeof value === 'string' && options.includeBareStrings) {
      results.push({ pointer, targetId: value, via: 'bare-string' });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], pointer ? `${pointer}[${i}]` : `[${i}]`, options, results);
    }
    return;
  }

  const isRef = isRecordRef(value);
  if (isRef) {
    results.push({ pointer, targetId: value.id, via: 'ref-object' });
  }
  if (isRef && !options.descendIntoRefObjects) return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    walk(child, pointer ? `${pointer}.${key}` : key, options, results);
  }
}

/**
 * Walk `value` and return every pointer that refers to a record, in the
 * pre-order the payload declares them. Pure: no store, no I/O, no schema.
 */
export function collectRefMatches(
  value: unknown,
  options: RefTraversalOptions,
): RefMatch[] {
  const results: RefMatch[] = [];
  walk(value, options.initialPointer, options, results);
  return results;
}

/**
 * FixtureDiff - Structural diff between actual and expected fixture results.
 *
 * Walks expected.terminalArtifacts recursively. For each leaf path,
 * compares with actual.  A path is:
 *   - **matched** if both exist and are deep-equal.
 *   - **partial** if both exist and expected is a subset of actual
 *     (i.e. every key in expected matches in actual; extra actual keys
 *     are fine — "contains" semantics).
 *   - **missing** if expected has it and actual does not.
 *   - **extra** if actual has a top-level field that is in
 *     TerminalArtifacts but not pinned by expected AND non-empty.
 *
 * If expected.outcome is set, compare with actual and include the
 * result in matched or missing accordingly.
 */

import type { FixtureDiff, FixtureResult, FixtureExpected } from './FixtureTypes.js';
import type { TerminalArtifacts } from '../CompileContracts.js';

// ---------------------------------------------------------------------------
// deepEqual — strict equality for two values
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }

  return false;
}

// ---------------------------------------------------------------------------
// expectedContainsActual — "contains" semantics: every key in expected
// must match in actual; extra keys in actual are fine.
// ---------------------------------------------------------------------------

function expectedContainsActual(expected: unknown, actual: unknown): boolean {
  if (expected === null || expected === undefined) return true;
  if (actual === null || actual === undefined) return false;

  // If expected is a primitive, compare strictly
  if (typeof expected !== 'object') {
    return deepEqual(expected, actual);
  }

  // If expected is an array, compare element-by-element with contains semantics
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (expected.length === 0) return true;
    if (actual.length === 0) return false;
    // Compare element-by-element: expected[i] must be contained in actual[i]
    const len = Math.min(expected.length, actual.length);
    for (let i = 0; i < len; i++) {
      if (!expectedContainsActual(expected[i], actual[i])) {
        return false;
      }
    }
    return true;
  }

  // expected is an object: every key must match in actual
  const expKeys = Object.keys(expected as object);
  for (const key of expKeys) {
    const expVal = (expected as Record<string, unknown>)[key];
    const actVal = (actual as Record<string, unknown>)[key];
    if (!expectedContainsActual(expVal, actVal)) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// walkExpected — recursively walk expected.terminalArtifacts and compare
// ---------------------------------------------------------------------------

function walkExpected(
  expected: unknown,
  actual: unknown,
  path: string,
  matched: string[],
  partial: string[],
  missing: string[],
): void {
  // If expected is null/undefined, nothing to check at this path
  if (expected === null || expected === undefined) return;

  // If actual is null/undefined but expected is not, it's missing
  if (actual === null || actual === undefined) {
    missing.push(path);
    return;
  }

  // If expected is a primitive, compare strictly
  if (typeof expected !== 'object') {
    if (deepEqual(expected, actual)) {
      matched.push(path);
    } else {
      missing.push(path);
    }
    return;
  }

  // If expected is an array, compare element-by-element
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      missing.push(path);
      return;
    }
    if (expected.length === 0) {
      matched.push(path);
      return;
    }
    if (actual.length === 0) {
      missing.push(path);
      return;
    }
    // Compare element-by-element with contains semantics
    const len = Math.min(expected.length, actual.length);
    let allMatched = true;
    let hasPartial = false;
    for (let i = 0; i < len; i++) {
      const childPath = `${path}[${i}]`;
      const expVal = expected[i];
      const actVal = actual[i];

      walkExpected(expVal, actVal, childPath, matched, partial, missing);

      // Check if this child was matched or partial
      const lastMatched = matched[matched.length - 1];
      const lastPartial = partial.length > 0 ? partial[partial.length - 1] : undefined;

      if (lastMatched === childPath) {
        // matched — continue
      } else if (lastPartial === childPath) {
        hasPartial = true;
      } else {
        allMatched = false;
      }
    }

    if (allMatched && !hasPartial) {
      matched.push(path);
    } else if (hasPartial) {
      partial.push(path);
    }
    return;
  }

  // expected is an object — walk its keys
  const expKeys = Object.keys(expected as object);
  if (expKeys.length === 0) {
    // Empty object in expected — treat as matched if actual is also object-like
    matched.push(path);
    return;
  }

  // Check if actual contains all expected keys
  const actObj = actual as Record<string, unknown>;
  let allMatched = true;
  let hasPartial = false;

  for (const key of expKeys) {
    const childPath = `${path}.${key}`;
    const expVal = (expected as Record<string, unknown>)[key];
    const actVal = actObj[key];

    walkExpected(expVal, actVal, childPath, matched, partial, missing);

    // Check if this child was matched or partial
    const lastMatched = matched[matched.length - 1];
    const lastPartial = partial.length > 0 ? partial[partial.length - 1] : undefined;

    if (lastMatched === childPath) {
      // matched — continue
    } else if (lastPartial === childPath) {
      hasPartial = true;
    } else {
      allMatched = false;
    }
  }

  // If all children matched, this path is matched
  if (allMatched && !hasPartial) {
    matched.push(path);
  } else if (hasPartial) {
    partial.push(path);
  }
}

// ---------------------------------------------------------------------------
// findExtra — find top-level fields in actual that are not in expected
// ---------------------------------------------------------------------------

function findExtra(
  expected: Partial<TerminalArtifacts> | undefined,
  actual: TerminalArtifacts,
): string[] {
  const extra: string[] = [];
  const expectedKeys = new Set(expected ? Object.keys(expected) : []);

  for (const key of Object.keys(actual)) {
    if (!expectedKeys.has(key)) {
      const val = (actual as Record<string, unknown>)[key];
      // Only report non-empty extras
      if (val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0)) {
        extra.push(key);
      }
    }
  }

  return extra;
}

// ---------------------------------------------------------------------------
// diffFixture — main entry point
// ---------------------------------------------------------------------------

export function diffFixture(actual: FixtureResult, expected: FixtureExpected): FixtureDiff {
  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  const extra: string[] = [];

  // Compare outcome if set
  if (expected.outcome !== undefined) {
    if (actual.outcome === expected.outcome) {
      matched.push('outcome');
    } else {
      missing.push('outcome');
    }
  }

  // Compare terminalArtifacts
  if (expected.terminalArtifacts !== undefined) {
    walkExpected(
      expected.terminalArtifacts,
      actual.terminalArtifacts,
      'terminalArtifacts',
      matched,
      partial,
      missing,
    );

    // Find extra top-level fields
    const extraFields = findExtra(expected.terminalArtifacts, actual.terminalArtifacts);
    extra.push(...extraFields);
  }

  return { matched, partial, missing, extra };
}

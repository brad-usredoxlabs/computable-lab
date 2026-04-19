/**
 * AssertionOutcomeComputer - derive outcome.direction from context diff for comparison/series scopes.
 * 
 * This module provides a pure function to compute the outcome direction of an assertion
 * by diffing the underlying contexts on a specified measure.
 */

import type { Context } from '../types/context.js';
import { diffContexts } from '../context/ContextDiff.js';

/**
 * Possible direction values for an assertion outcome.
 */
export type OutcomeDirection = 'increased' | 'decreased' | 'no_change' | 'mixed' | 'unknown';

/**
 * Computed outcome from evaluating an assertion against contexts.
 */
export interface ComputedOutcome {
  direction: OutcomeDirection;
  measure: string;
  reason?: string;
  deltas?: number[];   // for series: per-step deltas; for comparison: single delta
}

/**
 * Assertion-like object that can be evaluated.
 */
export interface AssertionLike {
  kind: 'assertion';
  id: string;
  scope: 'single_context' | 'comparison' | 'series' | 'global';
  context_refs?: ReadonlyArray<{ kind: 'record'; id: string; type: string }>;
}

/**
 * Extract a numeric delta from a diff structure using a dotted path.
 * 
 * Measure lookup rules:
 * - "total_volume" -> diff.total_volume?.delta (number or null)
 * - "observed.<key>" -> diff.observed?.[key]: compute Number(to) - Number(from) if both coerce to finite numbers; else null
 * - "properties.<key>" -> same rule against diff.properties
 * 
 * @param diff - The context diff structure
 * @param measure - The measure path (e.g., "total_volume", "observed.od600", "properties.pH")
 * @returns The numeric delta or null if not computable
 */
function extractDelta(diff: ReturnType<typeof diffContexts>, measure: string): number | null {
  if (measure === 'total_volume') {
    const volDelta = diff.total_volume?.delta;
    return volDelta ?? null;
  }

  // Handle observed.<key>
  if (measure.startsWith('observed.')) {
    const key = measure.slice('observed.'.length);
    const obsEntry = diff.observed?.[key];
    if (!obsEntry) return null;
    
    const fromVal = obsEntry.from !== undefined ? Number(obsEntry.from) : NaN;
    const toVal = obsEntry.to !== undefined ? Number(obsEntry.to) : NaN;
    
    if (!Number.isFinite(fromVal) || !Number.isFinite(toVal)) {
      return null;
    }
    
    return toVal - fromVal;
  }

  // Handle properties.<key>
  if (measure.startsWith('properties.')) {
    const key = measure.slice('properties.'.length);
    const propEntry = diff.properties?.[key];
    if (!propEntry) return null;
    
    const fromVal = propEntry.from !== undefined ? Number(propEntry.from) : NaN;
    const toVal = propEntry.to !== undefined ? Number(propEntry.to) : NaN;
    
    if (!Number.isFinite(fromVal) || !Number.isFinite(toVal)) {
      return null;
    }
    
    return toVal - fromVal;
  }

  // Unknown measure path
  return null;
}

/**
 * Compute the outcome direction for an assertion based on context diffs.
 * 
 * @param assertion - The assertion to evaluate
 * @param contextsByRef - Map of context references to context objects
 * @param measure - The measure key to compare (e.g., "total_volume", "observed.od600")
 * @returns ComputedOutcome with direction and deltas
 */
export function computeAssertionOutcome(
  assertion: AssertionLike,
  contextsByRef: ReadonlyMap<string, Context>,
  measure: string,
): ComputedOutcome {
  // Handle single_context and global scopes
  if (assertion.scope === 'single_context' || assertion.scope === 'global') {
    return {
      direction: 'unknown',
      measure,
      reason: 'outcome direction requires comparison or series scope',
    };
  }

  // Handle comparison scope
  if (assertion.scope === 'comparison') {
    const refs = assertion.context_refs ?? [];
    
    if (refs.length !== 2) {
      return {
        direction: 'unknown',
        measure,
        reason: `comparison scope requires exactly 2 context refs, got ${refs.length}`,
      };
    }

    const refA = refs[0];
    const refB = refs[1];
    
    // Type guard for refs
    if (!refA || !refB) {
      return {
        direction: 'unknown',
        measure,
        reason: 'comparison scope requires exactly 2 context refs',
      };
    }

    const contextA = contextsByRef.get(refA.id);
    const contextB = contextsByRef.get(refB.id);

    if (!contextA) {
      return {
        direction: 'unknown',
        measure,
        reason: `missing context: ${refA.id}`,
      };
    }

    if (!contextB) {
      return {
        direction: 'unknown',
        measure,
        reason: `missing context: ${refB.id}`,
      };
    }

    const diff = diffContexts(contextA, contextB);
    const delta = extractDelta(diff, measure);

    if (delta === null || !Number.isFinite(delta)) {
      return {
        direction: 'unknown',
        measure,
        reason: `non-numeric measure '${measure}' in diff`,
      };
    }

    let direction: OutcomeDirection;
    if (delta > 0) {
      direction = 'increased';
    } else if (delta < 0) {
      direction = 'decreased';
    } else {
      direction = 'no_change';
    }

    return {
      direction,
      measure,
      deltas: [delta],
    };
  }

  // Handle series scope
  if (assertion.scope === 'series') {
    const refs = assertion.context_refs ?? [];
    
    if (refs.length < 2) {
      return {
        direction: 'unknown',
        measure,
        reason: `series scope requires at least 2 context refs, got ${refs.length}`,
      };
    }

    // Resolve all contexts
    const contexts: Context[] = [];
    for (const ref of refs) {
      const ctx = contextsByRef.get(ref.id);
      if (!ctx) {
        return {
          direction: 'unknown',
          measure,
          reason: `missing context: ${ref.id}`,
        };
      }
      contexts.push(ctx);
    }

    // Compute deltas for each adjacent pair
    const deltas: number[] = [];
    for (let i = 0; i < contexts.length - 1; i++) {
      const ctxA = contexts[i];
      const ctxB = contexts[i + 1];
      // Type guard to ensure ctxA and ctxB are defined
      if (!ctxA || !ctxB) {
        return {
          direction: 'unknown',
          measure,
          reason: `unexpected missing context at index ${i}`,
        };
      }
      const diff = diffContexts(ctxA, ctxB);
      const delta = extractDelta(diff, measure);

      if (delta === null || !Number.isFinite(delta)) {
        return {
          direction: 'unknown',
          measure,
          reason: `non-numeric measure '${measure}' in diff`,
        };
      }

      deltas.push(delta);
    }

    // Determine overall direction
    let direction: OutcomeDirection;
    const allPositive = deltas.every(d => d > 0);
    const allNegative = deltas.every(d => d < 0);
    const allZero = deltas.every(d => d === 0);

    if (allPositive) {
      direction = 'increased';
    } else if (allNegative) {
      direction = 'decreased';
    } else if (allZero) {
      direction = 'no_change';
    } else {
      direction = 'mixed';
    }

    return {
      direction,
      measure,
      deltas,
    };
  }

  // Unknown scope
  return {
    direction: 'unknown',
    measure,
    reason: `unknown scope: ${assertion.scope}`,
  };
}

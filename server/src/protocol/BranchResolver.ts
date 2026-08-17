/**
 * BranchResolver — resolve protocol branch axes (if/then/else) against a
 * localization `choices` map, producing the ACTIVE starting step set.
 *
 * Phase-0 of localization: before any steps are materialized, every branch
 * axis (sample type, labware format) is resolved to the branch(es) whose
 * predicate matches the user's choices. The resultant starting steps =
 * shared_stepIds ∪ (then_stepIds of every matching condition).
 *
 * Reuses the EXISTING `evaluatePredicate` / PredicateEvaluator (server/src/lint)
 * so a branch condition and a lint rule speak ONE predicate language (DRY).
 * Never silently passes through an unresolved axis — an axis with no matching
 * branch is reported (ok:false + gap), matching the repo's "fail loud, don't
 * fabricate" canon.
 */

import { evaluatePredicate } from '../lint/PredicateEvaluator.js';
import type { Predicate } from '../lint/types.js';

export interface BranchChoices {
  [key: string]: string | number | boolean | null | undefined;
}

export interface BranchConditionLike {
  id: string;
  label?: string;
  predicate: unknown;
  then_stepIds?: string[];
  else_stepIds?: string[];
}

export interface BranchAxisLike {
  axisId: string;
  label?: string;
  conditions?: BranchConditionLike[];
  shared_stepIds?: string[];
}

/** How a single axis resolved. */
export interface BranchAxisResolution {
  axisId: string;
  matched: boolean;
  branchIds: string[];
}

export interface BranchResolved {
  ok: true;
  /** Ordered starting step set: shared ∪ every matching branch's then_stepIds. */
  activeStepIds: string[];
  resolutions: BranchAxisResolution[];
  warnings: string[];
}

export interface BranchUnresolved {
  ok: false;
  gap: string;
  unresolvedAxes: string[];
}

export type ResolveBranchAxesResult = BranchResolved | BranchUnresolved;

function evaluate(condition: BranchConditionLike, choices: BranchChoices): boolean {
  try {
    return evaluatePredicate(condition.predicate as Predicate, choices).result;
  } catch {
    // A malformed/unknown predicate is treated as "does not match" so it never
    // silently gates a whole axis in; it surfaces as an unresolved axis.
    return false;
  }
}

export function resolveBranchAxes(args: {
  branchAxes?: BranchAxisLike[];
  choices: BranchChoices;
}): ResolveBranchAxesResult {
  const axes = args.branchAxes ?? [];
  const activeStepIds: string[] = [];
  const resolutions: BranchAxisResolution[] = [];
  const warnings: string[] = [];
  const unresolvedAxes: string[] = [];

  const push = (id: string): void => {
    if (!activeStepIds.includes(id)) activeStepIds.push(id);
  };

  for (const axis of axes) {
    for (const id of axis.shared_stepIds ?? []) push(id);

    const matching = (axis.conditions ?? []).filter((c) => evaluate(c, args.choices));
    const branchIds = matching.map((c) => c.id);
    if (matching.length > 0) {
      for (const cond of matching) for (const id of cond.then_stepIds ?? []) push(id);
    } else {
      unresolvedAxes.push(axis.axisId);
      warnings.push(`branch axis '${axis.axisId}' did not match any condition`);
    }
    resolutions.push({ axisId: axis.axisId, matched: matching.length > 0, branchIds });
  }

  if (unresolvedAxes.length > 0) {
    return {
      ok: false,
      gap: `localization branch axis(es) unresolved: ${unresolvedAxes.join(', ')} — provide a choice that matches a declared branch`,
      unresolvedAxes,
    };
  }

  return { ok: true, activeStepIds, resolutions, warnings };
}
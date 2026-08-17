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
  /** Branch-scoped resources this branch requires (equipment/labware/material refs). */
  then_resourceRefs?: Array<{ role: string; ref: unknown }>;
  /** Steps inserted into the local copy only when this branch is selected. */
  insert_steps?: Array<Record<string, unknown>>;
}

/** A branch-scoped resource ref (e.g. bead-beater, -80 C freezer). */
export interface BranchResourceRef {
  role: string;
  ref: unknown;
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
  /** Union of branch-scoped resources required by the matching branches. */
  resolvedResourceRefs: BranchResourceRef[];
  /** Branch-inserted steps (deduped by stepId) added to the localized copy. */
  insertedSteps: Record<string, unknown>[];
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
  const resolvedResourceRefs: BranchResourceRef[] = [];
  const insertedSteps: Record<string, unknown>[] = [];
  const seenResource = new Set<string>();
  const seenInserted = new Set<string>();

  const push = (id: string): void => {
    if (!activeStepIds.includes(id)) activeStepIds.push(id);
  };
  const pushResource = (r: { role: string; ref: unknown }): void => {
    const key = `${r.role}::${JSON.stringify(r.ref ?? null)}`;
    if (!seenResource.has(key)) {
      seenResource.add(key);
      resolvedResourceRefs.push(r);
    }
  };
  const pushInserted = (s: Record<string, unknown>): void => {
    const id = String(s.stepId ?? '');
    if (id && !seenInserted.has(id)) {
      seenInserted.add(id);
      insertedSteps.push(s);
    }
  };

  for (const axis of axes) {
    for (const id of axis.shared_stepIds ?? []) push(id);

    const matching = (axis.conditions ?? []).filter((c) => evaluate(c, args.choices));
    const branchIds = matching.map((c) => c.id);
    if (matching.length > 0) {
      for (const cond of matching) {
        for (const id of cond.then_stepIds ?? []) push(id);
        for (const r of cond.then_resourceRefs ?? []) pushResource(r);
        for (const s of cond.insert_steps ?? []) pushInserted(s);
      }
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

  return { ok: true, activeStepIds, resolutions, resolvedResourceRefs, insertedSteps, warnings };
}

/**
 * Derive the active step set from an ALREADY-RESOLVED branch resolution (the
 * per-axis chosen branchIds stored on a local protocol by localization). Used
 * by the local-protocol-compile pipeline to materialize the same branch
 * selection without re-evaluating raw choices.
 */
export interface BranchResolutionEntry {
  axisId: string;
  matched: boolean;
  branchIds?: string[];
}

export function activeStepIdsForResolution(
  branchAxes: BranchAxisLike[],
  resolution: BranchResolutionEntry[],
): string[] {
  const out: string[] = [];
  const push = (id: string): void => {
    if (!out.includes(id)) out.push(id);
  };
  for (const axis of branchAxes) {
    for (const id of axis.shared_stepIds ?? []) push(id);
    const entry = resolution.find((r) => r.axisId === axis.axisId);
    if (entry?.matched && entry.branchIds) {
      const condsById = new Map((axis.conditions ?? []).map((c) => [c.id, c]));
      for (const branchId of entry.branchIds) {
        const cond = condsById.get(branchId);
        for (const sid of cond?.then_stepIds ?? []) push(sid);
      }
    }
  }
  return out;
}
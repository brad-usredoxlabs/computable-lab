/**
 * WorkcopyEdit — pure structural edits to a protocol working copy (Plan 1, F4).
 *
 * The universal protocol is READ-ONLY; all edits operate on the localization
 * working copy (an LPR-derived document). These are deterministic, tested
 * transforms:
 *   - deleteStep: remove a step AND cascade its bindings (equipment/material),
 *     its branch_axes `then_stepIds` entry, and clean emptied axes.
 *   - mergeSteps: auto-concat selected steps into one LOGICAL step (the
 *     underlying events stay distinct in the event graph).
 *   - splitStep: divide one step's actions into two at a chosen boundary.
 *
 * The working-copy document shape (what the UI edits) is deliberately a plain
 * object so it maps onto either the universal steps or the LPR overrides:
 *   {
 *     steps: Array<{ stepId: string; kind?: string; actions?: unknown[]; [k]: unknown }>,
 *     overrides?: { bindings?: Array<{ stepId: string; equipmentRef?: ... }>,
 *                   substitutions?: Array<{ role: string; material_ref?: ... }> },
 *     branch_axes?: Array<BranchAxisLike>,
 *   }
 */
import type { BranchAxisLike } from '../../protocol/BranchResolver.js';

export interface WorkcopyDoc {
  steps: Array<Record<string, unknown> & { stepId: string }>;
  overrides?: {
    bindings?: Array<Record<string, unknown>>;
    substitutions?: Array<Record<string, unknown>>;
    parameters?: Array<Record<string, unknown>>;
  };
  branch_axes?: BranchAxisLike[];
}

/**
 * Remove a step from the working copy, cascading:
 *  - overrides.bindings rows whose stepId matches,
 *  - the step's inline equipmentRef (if the doc carries one on the step),
 *  - every branch_axes[*].conditions[*].then_stepIds entry for that step
 *    (dropping a condition whose then_stepIds empties, then any axis with no
 *    remaining conditions/shared steps).
 * Returns a NEW doc (immutable).
 */
export function deleteStep(doc: WorkcopyDoc, stepId: string): WorkcopyDoc {
  const steps = doc.steps.filter((s) => s.stepId !== stepId);

  let bindings = doc.overrides?.bindings;
  if (bindings) bindings = bindings.filter((b) => b.stepId !== stepId);

  let branch_axes = doc.branch_axes;
  if (branch_axes) {
    branch_axes = branch_axes
      .map((axis) => ({
        ...axis,
        conditions: (axis.conditions ?? []).flatMap((c) => {
          const then = (c.then_stepIds ?? []).filter((id) => id !== stepId);
          if (then.length === 0 && !c.else_stepIds?.length) return []; // condition emptied
          return [{ ...c, then_stepIds: then }];
        }),
        shared_stepIds: (axis.shared_stepIds ?? []).filter((id) => id !== stepId),
      }))
      .filter((axis) => (axis.conditions?.length ?? 0) > 0 || (axis.shared_stepIds?.length ?? 0) > 0);
  }

  const overrides = doc.overrides
    ? {
        ...doc.overrides,
        ...(bindings !== undefined ? { bindings } : {}),
      }
    : undefined;

  const next: WorkcopyDoc = { steps, ...(overrides ? { overrides } : {}) };
  if (branch_axes !== undefined) next.branch_axes = branch_axes;
  return next;
}

/**
 * Merge N selected steps into ONE logical step. Actions auto-concat; the
 * logical step keeps the first stepId and its equipment binding; the later
 * steps' branch entries are rewritten to the merged stepId so downstream
 * selection still resolves. (Events remain distinct in the event graph.)
 */
export function mergeSteps(doc: WorkcopyDoc, stepIds: string[]): WorkcopyDoc {
  const ordered = doc.steps.filter((s) => stepIds.includes(s.stepId));
  const remaining = doc.steps.filter((s) => !stepIds.includes(s.stepId));
  if (ordered.length < 2) return doc;

  const head = ordered[0]!;
  const merged: Record<string, unknown> & { stepId: string } = {
    ...head,
    stepId: head.stepId,
    label: ordered.map((s) => String(s.label ?? s.stepId)).join(' + '),
    ...(ordered.length > 1 && ordered.every((s) => Array.isArray(s.actions))
      ? { actions: ordered.flatMap((s) => s.actions as unknown[]) }
      : {}),
  };

  const rewrittenAxes = doc.branch_axes?.map((axis) => ({
    ...axis,
    conditions: (axis.conditions ?? []).map((c) => {
      const next: Record<string, unknown> = {};
      const then = (c.then_stepIds ?? []).flatMap((id) => (stepIds.includes(id) ? [head.stepId] : [id]));
      next.then_stepIds = [...new Set(then)];
      return { ...c, then_stepIds: next.then_stepIds as string[] };
    }),
    shared_stepIds: (axis.shared_stepIds ?? []).flatMap((id) => (stepIds.includes(id) ? [head.stepId] : [id])),
  }));

  return {
    steps: [...remaining, merged],
    ...(doc.overrides ? { overrides: doc.overrides } : {}),
    ...(rewrittenAxes ? { branch_axes: rewrittenAxes } : {}),
  };
}

/**
 * Split one step's actions into two at an index boundary; the first keeps the
 * original stepId, the second gets `<stepId>-<n>`. Works on any array field
 * (default `actions`).
 */
export function splitStep(
  doc: WorkcopyDoc,
  stepId: string,
  boundaryIndex: number,
  field: string = 'actions',
): WorkcopyDoc {
  const target = doc.steps.find((s) => s.stepId === stepId);
  if (!target) return doc;
  const arr = Array.isArray(target[field]) ? (target[field] as unknown[]) : [];
  if (boundaryIndex <= 0 || boundaryIndex >= arr.length) return doc;

  const first = { ...target, [field]: arr.slice(0, boundaryIndex) };
  const second = { ...target, stepId: `${stepId}-2`, [field]: arr.slice(boundaryIndex) };

  return {
    steps: doc.steps.flatMap((s) => (s.stepId === stepId ? [first, second] : [s])),
    ...(doc.overrides ? { overrides: doc.overrides } : {}),
  };
}
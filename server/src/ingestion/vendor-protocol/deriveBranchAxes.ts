/**
 * deriveBranchAxes — lift vendor protocol step `branches[]` into schema-valid
 * `branch_axes` (Task 3, ingestion-side templating of if/then/else).
 *
 * The vendor extractor already captures each step's conditional lettered
 * branches (a./b./c.) as `step.branches: string[]` (VendorProtocolPdf
 * extractBranches) — but today they are dropped at protocol build and only
 * surfaced as a review gap ('zymo_branch_selection_required'). This pure
 * function converts every branchy step (>= 2 distinct non-empty branches) into
 * a `BranchAxis` whose conditions reuse the PredicateEvaluator vocabulary, so
 * the branches become executable step selection instead of a label.
 *
 * Semantics (deterministic):
 *   - one BranchAxis per branchy step, axisId derived from the step id;
 *   - one BranchCondition per distinct branch, `then_stepIds = [stepId]`;
 *   - the predicate matches the neutral localization choice key
 *     `$.branchSelection` against a stable slug of the branch text. The
 *     localizer/UI presents `condition.label` (the real branch text) and binds
 *     `branchSelection` to the corresponding slug; BranchResolver evaluates it.
 *
 * Cross-step grouping of a shared axis (e.g. "if bacterial" gating steps 1,3,5)
 * is a future enhancement; per-step axes are correct, deterministic, and resolve.
 */

import type { BranchAxisLike } from '../../protocol/BranchResolver.js';

export interface VendorStepBranchesLike {
  stepId?: unknown;
  stepNumber?: unknown;
  branches?: unknown;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim());
}

/** Stable slug: 'Bacterial DNA' -> 'bacterial-dna'. Falls back to 'branch'. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'branch';
}

function stepIdOf(step: VendorStepBranchesLike, index: number): string {
  if (typeof step.stepId === 'string' && step.stepId.trim().length > 0) return step.stepId.trim();
  if (typeof step.stepNumber === 'number') return `step-${String(step.stepNumber).padStart(3, '0')}`;
  return `step-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Convert vendor steps with conditional branches into universal-protocol
 * branch_axes. Returns [] when no step carries >= 2 distinct branches.
 */
export function deriveBranchAxes(steps: VendorStepBranchesLike[]): BranchAxisLike[] {
  const axes: BranchAxisLike[] = [];
  for (const [index, step] of steps.entries()) {
    const branches = [...new Set(asStringArray(step.branches))];
    if (branches.length < 2) continue;

    const stepId = stepIdOf(step, index);
    const axisId = slugify(`branch-axis-${stepId}`) || `branch-axis-${index + 1}`;

    axes.push({
      axisId,
      label: `Branch variant on ${stepId}`,
      conditions: branches.map((branch, i) => ({
        id: `branch-${i + 1}`,
        label: branch,
        predicate: { op: 'equals', path: '$.branchSelection', value: slugify(branch) },
        then_stepIds: [stepId],
      })),
    });
  }
  return axes;
}
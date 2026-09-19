/**
 * enumerateChoiceBindings — deterministic Cartesian product of decision-tree
 * axes into concrete localization choice bindings.
 *
 * Each binding is a full answer path: branchPath records which condition was
 * picked per axis (authored order), and `choices.branchSelection` carries the
 * nested { axisId: slug } object that the rebound predicates
 * (`$.branchSelection.${axisId}`) resolve against — see deriveDecisionTree.
 *
 * productSize is the FULL product size BEFORE capping, so callers can tell a
 * legitimately small space apart from a truncated one.
 */

import type { DecisionTreeAxis } from './deriveDecisionTree.js';
import type { BranchConditionLike } from '../protocol/BranchResolver.js';

export interface ChoiceBinding {
  branchPath: Array<{ axisId: string; conditionId: string; label?: string }>;
  choices: Record<string, unknown>;
}

export interface EnumerateResult {
  bindings: ChoiceBinding[];
  productSize: number;
  truncated: boolean;
}

/** slugFromPredicate: predicate?.value if string else '*'. */
function slugFromPredicate(predicate: BranchConditionLike['predicate']): string {
  if (predicate && typeof predicate === 'object' && !Array.isArray(predicate)) {
    const value = (predicate as Record<string, unknown>).value;
    if (typeof value === 'string') return value;
  }
  return '*';
}

export function enumerateChoiceBindings(
  axes: DecisionTreeAxis[],
  maxBindings: number,
): EnumerateResult {
  let bindings: ChoiceBinding[] = [{ branchPath: [], choices: { branchSelection: {} } }];

  for (const axis of axes) {
    if (axis.conditions.length < 1) continue; // pass-through, no multiplication
    const expanded: ChoiceBinding[] = [];
    for (const binding of bindings) {
      for (const cond of axis.conditions) {
        const selection = (binding.choices.branchSelection as Record<string, unknown>) ?? {};
        expanded.push({
          branchPath: [
            ...binding.branchPath,
            {
              axisId: axis.axisId,
              conditionId: cond.id,
              ...(cond.label ? { label: cond.label } : {}),
            },
          ],
          choices: {
            ...binding.choices,
            branchSelection: { ...selection, [axis.axisId]: slugFromPredicate(cond.predicate) },
          },
        });
      }
    }
    bindings = expanded;
  }

  const productSize = bindings.length;
  const truncated = productSize > maxBindings;
  return { bindings: truncated ? bindings.slice(0, maxBindings) : bindings, productSize, truncated };
}

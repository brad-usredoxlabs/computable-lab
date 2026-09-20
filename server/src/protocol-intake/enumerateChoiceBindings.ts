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

/**
 * Where one ANSWER COMBINATION sits in the product, counted the way this module
 * expands it (the last axis varies fastest).
 *
 * The eager pass caps the product, but a realization can also be built on
 * demand for the branch a reviewer actually runs — and then its id must not
 * depend on the cap, or the same combination would be drafted twice under two
 * ids.
 *
 * A NESTED question is only asked once its protocol is chosen (a handbook asks
 * "which variant of step 1?" inside several protocols), so the answer set may
 * cover only SOME axes. The un-answered axes stay unanswered, deliberately: a
 * condition that was never answered contributes no steps, which is exactly what
 * "this realization is the chosen protocol" means. The index therefore carries
 * WHICH axes were answered (`mask`), so a partial selection can never collide
 * with a different one — and each partial index lands beyond the full product.
 *
 * Returns null only when nothing usable was answered.
 */
export function bindingIndexFor(
  axes: DecisionTreeAxis[],
  choices: Record<string, string>,
): number | null {
  const multiplicable = axes.filter((axis) => axis.conditions.length > 0);
  const fullProduct = multiplicable.reduce((product, axis) => product * axis.conditions.length, 1);

  let answeredIndex = 0;
  let mask = 0;
  let answered = 0;
  multiplicable.forEach((axis, axisPosition) => {
    const chosen = choices[axis.axisId];
    if (typeof chosen !== 'string' || chosen.length === 0) return;
    const position = axis.conditions.findIndex((cond) => cond.id === chosen);
    if (position < 0) {
      // An answer that is not one of the axis's options is not an answer.
      return;
    }
    const stride = multiplicable
      .slice(axisPosition + 1)
      .reduce((product, later) => product * later.conditions.length, 1);
    answeredIndex += position * stride;
    mask += 2 ** axisPosition;
    answered += 1;
  });

  if (answered === 0) {
    return null;
  }
  // A COMPLETE answer set keeps the eager pass's plain product position, so a
  // combination that was already enumerated is reused instead of drafted twice.
  // A partial set (nested questions belong to one protocol) lands beyond the
  // whole product, where no complete combination can reach it.
  const complete = answered === multiplicable.length;
  return complete ? answeredIndex : answeredIndex + mask * fullProduct;
}

/**
 * The answers that address a chosen protocol: a nested question belongs to the
 * protocol that raised it, so the axes that matter are the answered ones plus
 * every question nested inside the protocols those answers selected. The other
 * protocols' nested questions are NOT part of this realization — answering them
 * would union another protocol's steps into the branch.
 */
export function relevantChoices(
  axes: DecisionTreeAxis[],
  choices: Record<string, string>,
): Record<string, string> {
  const relevant: Record<string, string> = {};
  for (const axis of axes) {
    const chosen = choices[axis.axisId];
    if (typeof chosen !== 'string' || chosen.length === 0) continue;
    if (axis.sectionId && !Object.values(choices).includes(axis.sectionId)) continue;
    relevant[axis.axisId] = chosen;
  }
  return relevant;
}



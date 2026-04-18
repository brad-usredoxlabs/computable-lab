import type { Context } from '../types/context.js';
import type { Predicate } from '../lint/types.js';
import { evaluatePredicate } from '../lint/PredicateEvaluator.js';

export interface ContextRole {
  id: string;
  name: string;
  description?: string;
  prerequisites: unknown[];
  expected_outcome?: Record<string, unknown>;
}

export interface ContextRoleVerification {
  role_id: string;
  context_id: string;
  passed: boolean;
  failed_count: number;
  predicate_results: Array<{
    op: string;
    passed: boolean;
    reason?: string;
  }>;
}

/**
 * ContextRole prerequisites are authored as an array of objects where each
 * object is a *single-key* predicate — the key is the op and the value is
 * that op's args. e.g., `{ has_material_class: { class: 'ros-inducer' } }`.
 * Transform each to a predicate-shaped object `{ op, ...args }`.
 * 
 * Special handling for `not` predicate: the inner value must also be unwrapped.
 */
function unwrapPredicate(raw: unknown): Predicate {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length === 1) {
      const [op, value] = entries[0]!;
      // Special handling for 'not' predicate - recursively unwrap the inner predicate
      if (op === 'not' && value && typeof value === 'object') {
        return { op: 'not', not: unwrapPredicate(value) } as unknown as Predicate;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { op, ...(value as Record<string, unknown>) } as unknown as Predicate;
      }
      return { op, value } as unknown as Predicate;
    }
    if ('op' in (raw as Record<string, unknown>)) {
      return raw as Predicate;
    }
  }
  throw new Error(`ContextRoleVerifier: cannot unwrap predicate from ${JSON.stringify(raw)}`);
}

export class ContextRoleVerifier {
  verify(role: ContextRole, context: Context): ContextRoleVerification {
    const predicate_results: ContextRoleVerification['predicate_results'] = [];
    let failed = 0;
    for (const raw of role.prerequisites ?? []) {
      let predicate: Predicate;
      try {
        predicate = unwrapPredicate(raw);
      } catch (e) {
        predicate_results.push({
          op: '<invalid>',
          passed: false,
          reason: (e as Error).message,
        });
        failed += 1;
        continue;
      }
      const r = evaluatePredicate(predicate, context as unknown);
      predicate_results.push({ op: predicate.op, passed: r.result, ...(r.reason ? { reason: r.reason } : {}) });
      if (!r.result) failed += 1;
    }
    return {
      role_id: role.id,
      context_id: context.id,
      passed: failed === 0,
      failed_count: failed,
      predicate_results,
    };
  }
}

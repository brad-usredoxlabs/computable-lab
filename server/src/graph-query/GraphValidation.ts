/**
 * GraphValidation — structured, agent-repairable validation errors (spec §17).
 *
 * zod (schema.ts) covers structural shape at the MCP/HTTP boundary. This
 * module adds semantic checks the engine needs at execution time:
 * relationship-verb existence, field-path resolvability, operator/value
 * compatibility, and aggregation validity. Errors are emitted as structured
 * objects carrying the offending element and the allowed alternatives so an
 * agent can self-repair and retry.
 */

import type { GraphQuery } from './types.js';

export type GraphValidationCode =
  | 'invalid_relationship'
  | 'invalid_field'
  | 'operator_compatibility'
  | 'invalid_scope'
  | 'invalid_aggregation'
  | 'invalid_object';

export interface GraphValidationIssue {
  code: GraphValidationCode;
  message: string;
  /** Offending element (relationship verb, field path, object id, ...). */
  path?: string;
  /** Allowed alternatives, when known (e.g. valid relationship verbs). */
  allowed?: string[];
}

export interface GraphValidationResult {
  valid: boolean;
  issues: GraphValidationIssue[];
}

export interface GraphValidationDeps {
  /** Look up outgoing edges from a node (used to validate relationship verbs). */
  knownVerbs?: () => string[];
  /** Whether a field path is resolvable from a candidate node type. */
  fieldResolvable?: (type: string, field: string) => boolean;
  /** Whether a scope container exists. */
  scopeExists?: (scope: { type: string; id: string }) => boolean;
}

const NUMERIC_OPERATORS = ['>', '>=', '<', '<='];

export class GraphValidation {
  constructor(private readonly deps: GraphValidationDeps = {}) {}

  validate(query: GraphQuery): GraphValidationResult {
    const issues: GraphValidationIssue[] = [];
    const knownVerbs = this.deps.knownVerbs?.() ?? [];

    if (query.op === 'traverse') {
      const rel = query.relationship;
      if (knownVerbs.length > 0 && !knownVerbs.includes(rel)) {
        issues.push({
          code: 'invalid_relationship',
          path: rel,
          message: `No graph relationships use the verb "${rel}" from the available set.`,
          allowed: knownVerbs,
        });
      }
    }

    if (query.op === 'find' || query.op === 'aggregate') {
      const findQ = query.op === 'aggregate' ? query.query : query;
      for (const cond of findQ.where ?? []) {
        // operator/value compatibility
        if (NUMERIC_OPERATORS.includes(cond.operator) && typeof cond.value !== 'number') {
          issues.push({
            code: 'operator_compatibility',
            path: cond.field,
            message: `Operator "${cond.operator}" requires a numeric value but got ${JSON.stringify(cond.value)}.`,
            allowed: ['=', '!=', 'contains', 'in', 'not_in'],
          });
        }
        if (
          cond.operator === 'in' &&
          (!Array.isArray(cond.value) || cond.value.some((v) => typeof v === 'object'))
        ) {
          issues.push({
            code: 'operator_compatibility',
            path: cond.field,
            message: 'Operator "in" requires a flat array of scalar values.',
          });
        }
        if (this.deps.fieldResolvable) {
          const type = findQ.type;
          if (cond.field.split('.')[0] && !this.deps.fieldResolvable(type, cond.field)) {
            issues.push({
              code: 'invalid_field',
              path: cond.field,
              message: `Field "${cond.field}" is not resolvable from type "${type}".`,
            });
          }
        }
      }
      if (query.op === 'aggregate' && query.measures.length === 0) {
        issues.push({
          code: 'invalid_aggregation',
          message: 'An aggregate query requires at least one measure.',
        });
      }
    }

    if ((query.op === 'find' || query.op === 'resolve') && query.scope && this.deps.scopeExists) {
      if (!this.deps.scopeExists(query.scope)) {
        issues.push({
          code: 'invalid_scope',
          path: `${query.scope.type}:${query.scope.id}`,
          message: `Scope ${query.scope.type} "${query.scope.id}" does not exist.`,
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }
}
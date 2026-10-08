import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { evaluatePredicate } from '../lint/PredicateEvaluator.js';
import type { Predicate } from '../lint/types.js';
import { object } from '../revisions/RecordRevisionService.js';

interface FidelitySpec {
  operations: string[]; literalPattern: string; transformationPattern: string;
  rule: Predicate; message: string;
}
const spec = parse(readFileSync(new URL('../../../config/sequence-analysis/request-fidelity.yaml', import.meta.url), 'utf8')) as FidelitySpec;

/** Check literal fidelity, without inferring roles, coordinates, or transformations.
 * Both AI repair and deterministic form compilation use the same declared rule.
 * Never silently substitute bases in an AI proposal.
 */
export function sequenceRequestDiagnostics(intent: unknown, userRequest?: string): Array<{path: string; message: string}> {
  const action = object(intent);
  if (!userRequest || !spec.operations.includes(String(action.operation))) return [];
  if (new RegExp(spec.transformationPattern, 'i').test(userRequest)) return [];
  const requested = [...new Set([...userRequest.matchAll(new RegExp(spec.literalPattern, 'g'))].map(match => match[0].toUpperCase()))];
  if (requested.length !== 1) return [];
  const proposed = String(object(action.sequence).residues ?? '').replace(/\s/g, '').toUpperCase();
  return evaluatePredicate(spec.rule, {requested, proposed}).result ? [] : [{path: '/sequence/residues', message: spec.message}];
}

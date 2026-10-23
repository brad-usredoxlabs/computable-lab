/**
 * fulfillmentPolicy — MATRES-FULFIL §7.5: the compatibility-policy loader.
 *
 * Mirrors the house idiom (the eligibility policy loader's SHAPE — this module
 * imports NOTHING from it; OQ-3 zero file-sharing): policy-as-YAML-data,
 * PER-CALL load (never process-cached, so a data edit needs no stack restart
 * and a fixture-injected path gets its own instance), malformed data throws
 * NAMING THE PATH, and zero policy branch in TypeScript — every verdict,
 * outcome mapping, and check selection is read back out of the validated
 * document.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const FULFILLMENT_COMPATIBILITY_DATA_FILE = 'fulfillment-compatibility.yaml';

/** Production location (cwd convention: tests and the server run with
 *  cwd=server; the policy data lives beside its evaluator). */
export function defaultFulfillmentPolicyPath(): string {
  return join(process.cwd(), 'src', 'fulfillment', FULFILLMENT_COMPATIBILITY_DATA_FILE);
}

export interface CompatibilityCheck {
  id: string;
  requirementSlot: string;
  fulfilledBy: readonly string[];
  requirementPath: string;
  evidencePaths: readonly string[];
  operator: string;
}

export interface FulfillmentCompatibilityPolicy {
  /** The declared verdict vocabulary (data; never a TS literal). */
  verdicts(): readonly string[];
  /** Outcome name -> verdict name (the data's mapping, not the evaluator's). */
  verdictFor(outcome: string): string;
  /** The comparison mechanisms the evaluator implements. */
  operators(): readonly string[];
  /** The declared per-slot checks. */
  checks(): readonly CompatibilityCheck[];
  /** The checks a claim's fulfilledBy value selects (data-driven selection). */
  checksFor(fulfilledBy: string): readonly CompatibilityCheck[];
}

function requireStringArray(value: unknown, field: string, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(v => typeof v === 'string')) {
    throw new Error(`Malformed fulfillment compatibility policy at ${path}: '${field}' must be a non-empty array of strings`);
  }
  return value as string[];
}

/** Load + structurally validate the policy data. Malformed data THROWS naming
 *  the path (never a silent default policy set). */
export function loadFulfillmentCompatibilityPolicy(filePath = defaultFulfillmentPolicyPath()): FulfillmentCompatibilityPolicy {
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(filePath, 'utf8'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot load fulfillment compatibility policy at ${filePath}: ${message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Malformed fulfillment compatibility policy at ${filePath}: expected a mapping`);
  }
  const doc = parsed as Record<string, unknown>;
  const verdicts = requireStringArray(doc.verdicts, 'verdicts', filePath);
  const operators = requireStringArray(doc.operators, 'operators', filePath);

  if (!doc.outcomes || typeof doc.outcomes !== 'object' || Array.isArray(doc.outcomes)) {
    throw new Error(`Malformed fulfillment compatibility policy at ${filePath}: 'outcomes' must be a mapping of outcome -> verdict`);
  }
  const outcomes = doc.outcomes as Record<string, unknown>;
  for (const [name, verdict] of Object.entries(outcomes)) {
    if (typeof verdict !== 'string' || !verdicts.includes(verdict)) {
      throw new Error(`Malformed fulfillment compatibility policy at ${filePath}: outcome '${name}' maps to a verdict outside the declared vocabulary`);
    }
  }

  if (!Array.isArray(doc.checks) || doc.checks.length === 0) {
    throw new Error(`Malformed fulfillment compatibility policy at ${filePath}: 'checks' must be a non-empty array`);
  }
  const checks: CompatibilityCheck[] = doc.checks.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`Malformed fulfillment compatibility policy at ${filePath}: checks[${index}] must be a mapping`);
    }
    const c = raw as Record<string, unknown>;
    const field = (name: string): string => {
      if (typeof c[name] !== 'string' || c[name] === '') {
        throw new Error(`Malformed fulfillment compatibility policy at ${filePath}: checks[${index}].${name} must be a non-empty string`);
      }
      return c[name] as string;
    };
    const operator = field('operator');
    if (!operators.includes(operator)) {
      throw new Error(`Malformed fulfillment compatibility policy at ${filePath}: checks[${index}].operator '${operator}' is outside the declared operators`);
    }
    return {
      id: field('id'),
      requirementSlot: field('requirementSlot'),
      fulfilledBy: requireStringArray(c.fulfilledBy, `checks[${index}].fulfilledBy`, filePath),
      requirementPath: field('requirementPath'),
      evidencePaths: requireStringArray(c.evidencePaths, `checks[${index}].evidencePaths`, filePath),
      operator,
    };
  });

  return {
    verdicts: () => [...verdicts],
    verdictFor: (outcome: string) => {
      const verdict = outcomes[outcome];
      if (typeof verdict !== 'string') {
        throw new Error(`Fulfillment compatibility policy at ${filePath} declares no verdict for outcome '${outcome}'`);
      }
      return verdict;
    },
    operators: () => [...operators],
    checks: () => checks.map(c => ({ ...c, fulfilledBy: [...c.fulfilledBy], evidencePaths: [...c.evidencePaths] })),
    checksFor: (fulfilledBy: string) =>
      checks.filter(c => c.fulfilledBy.includes(fulfilledBy)).map(c => ({ ...c, fulfilledBy: [...c.fulfilledBy], evidencePaths: [...c.evidencePaths] })),
  };
}

/**
 * Types for the Lint Engine.
 * 
 * The Lint Engine is a generic interpreter for lint rules defined in *.lint.yaml.
 * Business rules MUST live in lint specs, NOT in code.
 */

import type { LintSeverity, LintViolation, LintResult } from '../types/common.js';

// Re-export for convenience
export type { LintSeverity, LintViolation, LintResult };

/**
 * Lint rule scope - determines what context the rule applies to.
 */
export type LintScope = 'record' | 'collection' | 'repo';

/**
 * Predicate operation types.
 */
export type PredicateOp = 
  | 'exists' 
  | 'nonEmpty' 
  | 'regex' 
  | 'equals' 
  | 'in' 
  | 'all' 
  | 'any' 
  | 'not';

/**
 * Base predicate interface.
 */
interface BasePredicate {
  op: PredicateOp;
}

/**
 * Exists predicate - checks if a path exists in the record.
 */
export interface ExistsPredicate extends BasePredicate {
  op: 'exists';
  path: string;
}

/**
 * NonEmpty predicate - checks if a path has a non-empty value.
 */
export interface NonEmptyPredicate extends BasePredicate {
  op: 'nonEmpty';
  path: string;
}

/**
 * Regex predicate - checks if a path value matches a pattern.
 */
export interface RegexPredicate extends BasePredicate {
  op: 'regex';
  path: string;
  pattern: string;
}

/**
 * Equals predicate - checks if a path value equals a literal.
 */
export interface EqualsPredicate extends BasePredicate {
  op: 'equals';
  path: string;
  value: string | number | boolean | null;
}

/**
 * In predicate - checks if a path value is in a set of allowed values.
 */
export interface InPredicate extends BasePredicate {
  op: 'in';
  path: string;
  values: Array<string | number | boolean>;
}

/**
 * All predicate - all sub-predicates must be true (AND).
 */
export interface AllPredicate extends BasePredicate {
  op: 'all';
  predicates: Predicate[];
}

/**
 * Any predicate - at least one sub-predicate must be true (OR).
 */
export interface AnyPredicate extends BasePredicate {
  op: 'any';
  predicates: Predicate[];
}

/**
 * Not predicate - negates a predicate.
 */
export interface NotPredicate extends BasePredicate {
  op: 'not';
  not: Predicate;
}

/**
 * Union of all predicate types.
 */
export type Predicate = 
  | ExistsPredicate
  | NonEmptyPredicate
  | RegexPredicate
  | EqualsPredicate
  | InPredicate
  | AllPredicate
  | AnyPredicate
  | NotPredicate;

/**
 * Message configuration for a lint rule.
 */
export interface LintMessage {
  /** Message template with {{path}} placeholders */
  template: string;
  /** Paths referenced in the template */
  paths?: string[];
}

/**
 * A single lint rule definition.
 */
export interface LintRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable title */
  title: string;
  /** Optional detailed description */
  description?: string;
  /** Rule severity */
  severity: LintSeverity;
  /** Scope of rule application */
  scope: LintScope;
  /** Schema this rule applies to (if specific) */
  schemaId?: string;
  /** Optional condition for when rule applies */
  when?: Predicate;
  /** Main assertion to validate */
  assert: Predicate;
  /** Error message configuration */
  message: LintMessage;
  /** Rules this rule depends on */
  dependsOn?: string[];
}

/**
 * Global lint configuration.
 */
export interface LintGlobalConfig {
  /** Whether to treat warnings as errors */
  failOnWarnings?: boolean;
  /** Whether to include informational messages */
  includeInfo?: boolean;
  /** Custom error message templates */
  customMessages?: Record<string, string>;
}

/**
 * A lint specification (contents of a *.lint.yaml file).
 */
export interface LintSpec {
  /** Lint specification version */
  lintVersion: number;
  /** Global configuration */
  global?: LintGlobalConfig;
  /** Array of lint rule definitions */
  rules: LintRule[];
}

/**
 * Context for evaluating lint rules.
 */
export interface LintContext {
  /** The record data being linted */
  data: unknown;
  /** Schema ID of the record (if known) */
  schemaId?: string;
  /** Collection of records (for collection-scope rules) */
  collection?: unknown[];
  /** Repository context (for repo-scope rules) */
  repo?: unknown;
}

/**
 * Result of evaluating a single lint rule.
 */
export interface RuleEvaluationResult {
  /** Rule ID */
  ruleId: string;
  /** Whether the rule passed */
  passed: boolean;
  /** Whether the rule was skipped (when condition false) */
  skipped: boolean;
  /** Violation if rule failed */
  violation?: LintViolation;
}

/**
 * Options for the lint engine.
 */
export interface LintEngineOptions {
  /** Whether to stop on first error */
  stopOnFirstError?: boolean;
  /** Whether to include skipped rules in results */
  includeSkipped?: boolean;
}

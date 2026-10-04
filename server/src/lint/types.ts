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
  | 'not'
  | 'has_material_class'
  | 'state_is'
  | 'context_contains'
  | 'lineage_includes'
  | 'time_within'
  | 'mention_kind_matches'
  | 'allIn'
  | 'everyItem'
  | 'noneIn';

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
 * Supports either a static `values` array or a `valuesPath` that resolves
 * to an array of values at runtime (for cross-array relational checks).
 */
export interface InPredicate extends BasePredicate {
  op: 'in';
  path: string;
  values?: Array<string | number | boolean>;
  /** Optional path to an array of allowed values (e.g., 'phases[*].id'). */
  valuesPath?: string;
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
 * HasMaterialClass predicate - checks if context contains a component with matching material class.
 */
export interface HasMaterialClassPredicate extends BasePredicate {
  op: 'has_material_class';
  /** Material class to search for in context.contents[*].material_class. */
  class: string;
  /** Optional custom path to the contents array (defaults to 'contents'). */
  path?: string;
}

/**
 * StateIs predicate - checks if the context's state field equals a given value.
 */
export interface StateIsPredicate extends BasePredicate {
  op: 'state_is';
  /** Expected state value (e.g., 'sealed'). */
  value: string;
  /** Optional custom path (defaults to 'state'). */
  path?: string;
}

/**
 * ContextContains predicate - checks if context contains a component with matching material id.
 */
export interface ContextContainsPredicate extends BasePredicate {
  op: 'context_contains';
  /** Material id or regex to find. */
  material: string;
  /** Whether 'material' should be compiled as a regex. */
  regex?: boolean;
  /** Optional custom path to the contents array (defaults to 'contents'). */
  path?: string;
}

/**
 * LineageIncludes predicate - checks if any ancestor event_graph in the context's lineage used the given verb.
 */
export interface LineageIncludesPredicate extends BasePredicate {
  op: 'lineage_includes';
  /** Verb name that must appear somewhere in the context's lineage. */
  verb: string;
  /** Optional custom path to the lineage array (defaults to 'lineage'). */
  path?: string;
}

/**
 * TimeWithin predicate - checks if the context's timestamp is within a given ISO-8601 duration.
 */
export interface TimeWithinPredicate extends BasePredicate {
  op: 'time_within';
  /** ISO-8601 duration (e.g., 'PT1H', 'P1D'). */
  duration: string;
  /** Optional reference timestamp (ISO-8601); defaults to now. */
  reference?: string;
  /** Path to the timestamp under test (defaults to 'observed.timestamp'). */
  path?: string;
}

/**
 * MentionKindMatches predicate — Phase 6 carry-over from Phase 4.
 *
 * Walks the string value at `path` for `[[kind:id|label]]` tokens (the slash-
 * menu wire format) and asserts that every token's `kind` is in the
 * `allowedKinds` set. Used by lint rules attached to slots that accept
 * inline mentions — a `[[material:…]]` token dropped into a `labware`-typed
 * field surfaces here, alongside the usual structural validation errors.
 */
export interface MentionKindMatchesPredicate extends BasePredicate {
  op: 'mention_kind_matches';
  /** Path to the text field that may carry inline mention tokens. */
  path: string;
  /**
   * Mention kinds that are allowed at this path. Compared against the
   * parsed mention's `entityKind ?? type` — e.g. `material`, `material-spec`,
   * `aliquot`, `labware`, `protocol`, `graph-component`, `selection`.
   */
  allowedKinds: string[];
}

/**
 * AllIn predicate — generic cross-collection membership.
 *
 * Asserts that EVERY value selected by `path` (a scalar, a plain array, or
 * a `[*]`-wildcard projection) is a member of the collection selected by
 * `collectionPath`. When `itemField` is given, the membership set is the
 * projection `collectionPath[*].<itemField>`; otherwise the collection
 * items themselves must be scalars.
 *
 * Defined behaviours (documented in schema/lint/lint-v1.schema.yaml):
 * - `path` selects an empty collection   -> PASS (vacuous).
 * - `path` resolves to a single scalar   -> treated as a one-item selection.
 * - `path` does not resolve              -> FAIL, reason names the path.
 * - `collectionPath` does not resolve, or
 *   resolves to a non-array              -> FAIL, reason names the path.
 */
export interface AllInPredicate extends BasePredicate {
  op: 'allIn';
  /** Path selecting the values under test (scalar or array; supports `[*]`). */
  path: string;
  /** Path selecting the collection of allowed members (must resolve to an array). */
  collectionPath: string;
  /** Optional field of each collection item to compare against (e.g. 'roleId'). */
  itemField?: string;
}

/**
 * EveryItem predicate — generic per-item quantification over a collection.
 *
 * Asserts that EVERY item of the array at `collectionPath` satisfies
 * `assert`, evaluated with that item as the root data (so sub-paths are
 * written relative to the item). The interpreter has no knowledge of what
 * the items are or which fields `assert` reads.
 *
 * Defined behaviours (documented in schema/lint/lint-v1.schema.yaml):
 * - empty collection -> PASS (vacuously).
 * - `collectionPath` does not resolve   -> FAIL, reason names the path.
 * - `collectionPath` resolves to a non-array -> FAIL, reason names the path.
 * - failure reason names the failing item's index (and value shape).
 * - `itemField` (optional): when set, `assert` is evaluated against each
 *   item's `itemField` value rather than the item itself.
 */
export interface EveryItemPredicate extends BasePredicate {
  op: 'everyItem';
  /** Path selecting the collection to quantify over (must resolve to an array). */
  collectionPath: string;
  /** Optional field of each collection item to evaluate `assert` against. */
  itemField?: string;
  /** Predicate evaluated with each item (or item.itemField) as root data. */
  assert: Predicate;
}

/**
 * NoneIn predicate — generic cross-collection disjointness.
 *
 * Symmetric variation of `allIn`: asserts that NO value selected by `path`
 * (a scalar, a plain array, or a `[*]`-wildcard projection) is a member of
 * the collection selected by `collectionPath`. When `itemField` is given,
 * the membership set is the projection `collectionPath[*].<itemField>`;
 * otherwise the collection items themselves must be scalars.
 *
 * Selection, comparison and loud-failure semantics are exactly those of
 * `allIn` (documented in schema/lint/lint-v1.schema.yaml): empty selection
 * at `path` -> PASS vacuously; `path` unresolvable -> FAIL naming the path;
 * `collectionPath` unresolvable or non-array -> FAIL naming the path;
 * an overlap FAILS naming the offending shared value.
 */
export interface NoneInPredicate extends BasePredicate {
  op: 'noneIn';
  /** Path selecting the values under test (scalar or array; supports `[*]`). */
  path: string;
  /** Path selecting the collection to stay disjoint from (must resolve to an array). */
  collectionPath: string;
  /** Optional field of each collection item to compare against (e.g. 'roleId'). */
  itemField?: string;
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
  | NotPredicate
  | HasMaterialClassPredicate
  | StateIsPredicate
  | ContextContainsPredicate
  | LineageIncludesPredicate
  | TimeWithinPredicate
  | MentionKindMatchesPredicate
  | AllInPredicate
  | EveryItemPredicate
  | NoneInPredicate;

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
  scope?: LintScope;
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
  /** Schema ID all contained rules apply to unless a rule overrides it */
  schemaId?: string;
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

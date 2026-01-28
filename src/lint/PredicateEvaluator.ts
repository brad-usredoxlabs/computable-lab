/**
 * PredicateEvaluator — Evaluates lint predicates against data.
 * 
 * This is a generic interpreter that evaluates predicate expressions
 * defined in lint specs. It has NO knowledge of specific schemas or
 * business rules - those are defined in *.lint.yaml files.
 */

import type { 
  Predicate,
  ExistsPredicate,
  NonEmptyPredicate,
  RegexPredicate,
  EqualsPredicate,
  InPredicate,
  AllPredicate,
  AnyPredicate,
  NotPredicate,
} from './types.js';

import { 
  pathExists, 
  getPath, 
  pathIsNonEmpty,
} from './PathResolver.js';

/**
 * Result of predicate evaluation.
 */
export interface PredicateResult {
  /** Whether the predicate evaluated to true */
  result: boolean;
  /** Path that was checked (if applicable) */
  path?: string;
  /** Human-readable explanation */
  reason?: string;
}

/**
 * Type guard for exists predicate.
 */
function isExistsPredicate(p: Predicate): p is ExistsPredicate {
  return p.op === 'exists';
}

/**
 * Type guard for nonEmpty predicate.
 */
function isNonEmptyPredicate(p: Predicate): p is NonEmptyPredicate {
  return p.op === 'nonEmpty';
}

/**
 * Type guard for regex predicate.
 */
function isRegexPredicate(p: Predicate): p is RegexPredicate {
  return p.op === 'regex';
}

/**
 * Type guard for equals predicate.
 */
function isEqualsPredicate(p: Predicate): p is EqualsPredicate {
  return p.op === 'equals';
}

/**
 * Type guard for in predicate.
 */
function isInPredicate(p: Predicate): p is InPredicate {
  return p.op === 'in';
}

/**
 * Type guard for all predicate.
 */
function isAllPredicate(p: Predicate): p is AllPredicate {
  return p.op === 'all';
}

/**
 * Type guard for any predicate.
 */
function isAnyPredicate(p: Predicate): p is AnyPredicate {
  return p.op === 'any';
}

/**
 * Type guard for not predicate.
 */
function isNotPredicate(p: Predicate): p is NotPredicate {
  return p.op === 'not';
}

/**
 * Evaluate an 'exists' predicate.
 */
function evalExists(pred: ExistsPredicate, data: unknown): PredicateResult {
  const result = pathExists(data, pred.path);
  return {
    result,
    path: pred.path,
    reason: result 
      ? `Path '${pred.path}' exists` 
      : `Path '${pred.path}' does not exist`,
  };
}

/**
 * Evaluate a 'nonEmpty' predicate.
 */
function evalNonEmpty(pred: NonEmptyPredicate, data: unknown): PredicateResult {
  const result = pathIsNonEmpty(data, pred.path);
  return {
    result,
    path: pred.path,
    reason: result
      ? `Path '${pred.path}' has a non-empty value`
      : `Path '${pred.path}' is empty or missing`,
  };
}

/**
 * Evaluate a 'regex' predicate.
 */
function evalRegex(pred: RegexPredicate, data: unknown): PredicateResult {
  const value = getPath(data, pred.path);
  
  if (value === undefined) {
    return {
      result: false,
      path: pred.path,
      reason: `Path '${pred.path}' does not exist`,
    };
  }
  
  if (typeof value !== 'string') {
    return {
      result: false,
      path: pred.path,
      reason: `Path '${pred.path}' is not a string`,
    };
  }
  
  try {
    const regex = new RegExp(pred.pattern);
    const result = regex.test(value);
    return {
      result,
      path: pred.path,
      reason: result
        ? `Value '${value}' matches pattern '${pred.pattern}'`
        : `Value '${value}' does not match pattern '${pred.pattern}'`,
    };
  } catch (e) {
    return {
      result: false,
      path: pred.path,
      reason: `Invalid regex pattern: ${pred.pattern}`,
    };
  }
}

/**
 * Evaluate an 'equals' predicate.
 */
function evalEquals(pred: EqualsPredicate, data: unknown): PredicateResult {
  const value = getPath(data, pred.path);
  
  if (value === undefined && pred.value !== null) {
    return {
      result: false,
      path: pred.path,
      reason: `Path '${pred.path}' does not exist`,
    };
  }
  
  // Strict equality check
  const result = value === pred.value;
  return {
    result,
    path: pred.path,
    reason: result
      ? `Path '${pred.path}' equals '${pred.value}'`
      : `Path '${pred.path}' (${JSON.stringify(value)}) does not equal '${pred.value}'`,
  };
}

/**
 * Evaluate an 'in' predicate.
 */
function evalIn(pred: InPredicate, data: unknown): PredicateResult {
  const value = getPath(data, pred.path);
  
  if (value === undefined) {
    return {
      result: false,
      path: pred.path,
      reason: `Path '${pred.path}' does not exist`,
    };
  }
  
  // Check if value is in the allowed set
  const result = pred.values.includes(value as string | number | boolean);
  return {
    result,
    path: pred.path,
    reason: result
      ? `Value '${value}' is in allowed set`
      : `Value '${value}' is not in allowed set [${pred.values.join(', ')}]`,
  };
}

/**
 * Evaluate an 'all' predicate (AND).
 */
function evalAll(pred: AllPredicate, data: unknown): PredicateResult {
  const reasons: string[] = [];
  
  for (const subPred of pred.predicates) {
    const subResult = evaluatePredicate(subPred, data);
    if (!subResult.result) {
      return {
        result: false,
        reason: `All condition failed: ${subResult.reason}`,
      };
    }
    if (subResult.reason) {
      reasons.push(subResult.reason);
    }
  }
  
  return {
    result: true,
    reason: `All conditions passed: ${reasons.join('; ')}`,
  };
}

/**
 * Evaluate an 'any' predicate (OR).
 */
function evalAny(pred: AnyPredicate, data: unknown): PredicateResult {
  const reasons: string[] = [];
  
  for (const subPred of pred.predicates) {
    const subResult = evaluatePredicate(subPred, data);
    if (subResult.result) {
      return {
        result: true,
        reason: `Any condition passed: ${subResult.reason}`,
      };
    }
    if (subResult.reason) {
      reasons.push(subResult.reason);
    }
  }
  
  return {
    result: false,
    reason: `No conditions passed: ${reasons.join('; ')}`,
  };
}

/**
 * Evaluate a 'not' predicate.
 */
function evalNot(pred: NotPredicate, data: unknown): PredicateResult {
  const subResult = evaluatePredicate(pred.not, data);
  return {
    result: !subResult.result,
    reason: `NOT (${subResult.reason})`,
  };
}

/**
 * Evaluate a predicate against data.
 * 
 * @param predicate - The predicate to evaluate
 * @param data - The data to evaluate against
 * @returns PredicateResult with result and reason
 */
export function evaluatePredicate(
  predicate: Predicate, 
  data: unknown
): PredicateResult {
  if (isExistsPredicate(predicate)) {
    return evalExists(predicate, data);
  }
  
  if (isNonEmptyPredicate(predicate)) {
    return evalNonEmpty(predicate, data);
  }
  
  if (isRegexPredicate(predicate)) {
    return evalRegex(predicate, data);
  }
  
  if (isEqualsPredicate(predicate)) {
    return evalEquals(predicate, data);
  }
  
  if (isInPredicate(predicate)) {
    return evalIn(predicate, data);
  }
  
  if (isAllPredicate(predicate)) {
    return evalAll(predicate, data);
  }
  
  if (isAnyPredicate(predicate)) {
    return evalAny(predicate, data);
  }
  
  if (isNotPredicate(predicate)) {
    return evalNot(predicate, data);
  }
  
  // Unknown predicate type
  return {
    result: false,
    reason: `Unknown predicate op: ${(predicate as Predicate).op}`,
  };
}

/**
 * Create a predicate evaluator function for a specific predicate.
 * Useful for pre-compiling predicates for repeated use.
 * 
 * @param predicate - The predicate to compile
 * @returns A function that evaluates the predicate against data
 */
export function compilePredicate(
  predicate: Predicate
): (data: unknown) => PredicateResult {
  return (data: unknown) => evaluatePredicate(predicate, data);
}

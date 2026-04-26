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
  HasMaterialClassPredicate,
  StateIsPredicate,
  ContextContainsPredicate,
  LineageIncludesPredicate,
  TimeWithinPredicate,
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
 * Type guard for has_material_class predicate.
 */
function isHasMaterialClassPredicate(p: Predicate): p is HasMaterialClassPredicate {
  return p.op === 'has_material_class';
}

/**
 * Type guard for state_is predicate.
 */
function isStateIsPredicate(p: Predicate): p is StateIsPredicate {
  return p.op === 'state_is';
}

/**
 * Type guard for context_contains predicate.
 */
function isContextContainsPredicate(p: Predicate): p is ContextContainsPredicate {
  return p.op === 'context_contains';
}

/**
 * Type guard for lineage_includes predicate.
 */
function isLineageIncludesPredicate(p: Predicate): p is LineageIncludesPredicate {
  return p.op === 'lineage_includes';
}

/**
 * Type guard for time_within predicate.
 */
function isTimeWithinPredicate(p: Predicate): p is TimeWithinPredicate {
  return p.op === 'time_within';
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
 * Supports both static `values` and dynamic `valuesPath` (with [*] wildcard).
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
  
  // Determine the allowed set: use valuesPath if present, otherwise static values
  let allowedSet: Array<string | number | boolean>;
  
  if (pred.valuesPath !== undefined) {
    // Resolve the values path to get an array of values (supports [*] wildcard)
    const valuesArray = getPath(data, pred.valuesPath);
    if (!Array.isArray(valuesArray)) {
      return {
        result: false,
        path: pred.path,
        reason: `Path '${pred.valuesPath}' does not resolve to an array`,
      };
    }
    allowedSet = valuesArray.map(v => String(v));
  } else if (pred.values !== undefined) {
    allowedSet = pred.values;
  } else {
    return {
      result: false,
      path: pred.path,
      reason: `In predicate requires either 'values' or 'valuesPath'`,
    };
  }
  
  // Check if value is in the allowed set
  const result = allowedSet.includes(value as string | number | boolean);
  return {
    result,
    path: pred.path,
    reason: result
      ? `Value '${value}' is in allowed set`
      : `Value '${value}' is not in allowed set [${allowedSet.join(', ')}]`,
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
 * Evaluate a 'has_material_class' predicate.
 * Checks if the context contains a component whose material_class matches the given class.
 */
function evalHasMaterialClass(pred: HasMaterialClassPredicate, data: unknown): PredicateResult {
  const path = pred.path ?? 'contents';
  const contents = getPath(data, path);
  
  if (!Array.isArray(contents)) {
    return {
      result: false,
      reason: `Path '${path}' is not an array or missing`,
    };
  }
  
  for (const item of contents) {
    if (typeof item === 'object' && item !== null) {
      const materialClass = (item as Record<string, unknown>).material_class;
      if (materialClass === pred.class) {
        return {
          result: true,
          reason: `Found component with material_class '${pred.class}'`,
        };
      }
    }
  }
  
  return {
    result: false,
    reason: `No component with material_class '${pred.class}' found in '${path}'`,
  };
}

/**
 * Evaluate a 'state_is' predicate.
 * Checks if the context's state field equals the given value.
 */
function evalStateIs(pred: StateIsPredicate, data: unknown): PredicateResult {
  const path = pred.path ?? 'state';
  const value = getPath(data, path);
  
  if (value === undefined) {
    return {
      result: false,
      reason: `Path '${path}' does not exist`,
    };
  }
  
  const result = value === pred.value;
  return {
    result,
    reason: result
      ? `State equals '${pred.value}'`
      : `State is '${value}', expected '${pred.value}'`,
  };
}

/**
 * Evaluate a 'context_contains' predicate.
 * Checks if the context contains a component whose material id matches the given id or regex.
 */
function evalContextContains(pred: ContextContainsPredicate, data: unknown): PredicateResult {
  const path = pred.path ?? 'contents';
  const contents = getPath(data, path);
  
  if (!Array.isArray(contents)) {
    return {
      result: false,
      reason: `Path '${path}' is not an array or missing`,
    };
  }
  
  for (const item of contents) {
    if (typeof item === 'object' && item !== null) {
      const itemObj = item as Record<string, unknown>;
      // Support both plain string refs and {id, kind} shaped refs
      const materialRef = itemObj.material_ref;
      let materialId: string | undefined;
      
      if (typeof materialRef === 'string') {
        materialId = materialRef;
      } else if (materialRef && typeof materialRef === 'object' && 'id' in materialRef) {
        materialId = (materialRef as { id: string }).id;
      }
      
      if (materialId !== undefined) {
        if (pred.regex) {
          try {
            const regex = new RegExp(pred.material);
            if (regex.test(materialId)) {
              return {
                result: true,
                reason: `Found component with material id matching '${pred.material}'`,
              };
            }
          } catch {
            return {
              result: false,
              reason: `Invalid regex pattern: ${pred.material}`,
            };
          }
        } else {
          if (materialId === pred.material) {
            return {
              result: true,
              reason: `Found component with material id '${pred.material}'`,
            };
          }
        }
      }
    }
  }
  
  return {
    result: false,
    reason: `No component with material '${pred.material}' found in '${path}'`,
  };
}

/**
 * Evaluate a 'lineage_includes' predicate.
 * Checks if any ancestor event_graph in the context's lineage used the given verb.
 */
function evalLineageIncludes(pred: LineageIncludesPredicate, data: unknown): PredicateResult {
  const path = pred.path ?? 'lineage';
  const lineage = getPath(data, path);
  
  if (!Array.isArray(lineage)) {
    return {
      result: false,
      reason: `Path '${path}' is not an array or missing`,
    };
  }
  
  for (const entry of lineage) {
    if (typeof entry === 'object' && entry !== null) {
      const entryObj = entry as Record<string, unknown>;
      const verb = entryObj.verb ?? entryObj.event_type;
      if (verb === pred.verb) {
        return {
          result: true,
          reason: `Lineage includes event with verb '${pred.verb}'`,
        };
      }
    }
  }
  
  return {
    result: false,
    reason: `No lineage entry with verb '${pred.verb}' found`,
  };
}

/**
 * Evaluate a 'time_within' predicate.
 * Checks if the context's timestamp is within a given ISO-8601 duration of a reference time.
 */
function evalTimeWithin(pred: TimeWithinPredicate, data: unknown): PredicateResult {
  const path = pred.path ?? 'observed.timestamp';
  const timestampValue = getPath(data, path);
  
  if (timestampValue === undefined || typeof timestampValue !== 'string') {
    return {
      result: false,
      reason: `Path '${path}' does not exist or is not a string`,
    };
  }
  
  const timestamp = new Date(timestampValue);
  if (isNaN(timestamp.getTime())) {
    return {
      result: false,
      reason: `Invalid timestamp at '${path}': ${timestampValue}`,
    };
  }
  
  const reference = pred.reference ? new Date(pred.reference) : new Date();
  if (isNaN(reference.getTime())) {
    return {
      result: false,
      reason: `Invalid reference timestamp: ${pred.reference}`,
    };
  }
  
  // Parse ISO-8601 duration (minimal subset: PT<n>H, PT<n>M, PT<n>S, P<n>D)
  const durationRegex = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
  const match = pred.duration.match(durationRegex);
  
  if (!match) {
    return {
      result: false,
      reason: `Unsupported duration format: ${pred.duration}`,
    };
  }
  
  const days = match[1] ? parseInt(match[1], 10) : 0;
  const hours = match[2] ? parseInt(match[2], 10) : 0;
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  const seconds = match[4] ? parseInt(match[4], 10) : 0;
  
  const durationMs = (days * 24 * 60 * 60 * 1000) + 
                     (hours * 60 * 60 * 1000) + 
                     (minutes * 60 * 1000) + 
                     (seconds * 1000);
  
  const diffMs = Math.abs(reference.getTime() - timestamp.getTime());
  const result = diffMs <= durationMs;
  
  return {
    result,
    reason: result
      ? `Timestamp '${timestampValue}' is within ${pred.duration} of reference`
      : `Timestamp '${timestampValue}' is outside ${pred.duration} of reference (diff: ${diffMs}ms)`,
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
  
  if (isHasMaterialClassPredicate(predicate)) {
    return evalHasMaterialClass(predicate, data);
  }
  
  if (isStateIsPredicate(predicate)) {
    return evalStateIs(predicate, data);
  }
  
  if (isContextContainsPredicate(predicate)) {
    return evalContextContains(predicate, data);
  }
  
  if (isLineageIncludesPredicate(predicate)) {
    return evalLineageIncludes(predicate, data);
  }
  
  if (isTimeWithinPredicate(predicate)) {
    return evalTimeWithin(predicate, data);
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

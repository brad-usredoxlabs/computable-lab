/**
 * LintSpecLoader — Discovers and loads *.lint.yaml files from the schema directory.
 *
 * Follows the same recursive file-discovery pattern as SchemaLoader.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { LintSpec, Predicate } from './types.js';

/** Pattern used to match lint spec files. */
const LINT_PATTERN = '.lint.yaml';

/**
 * Normalization layer for lint predicates.
 *
 * Some lint.yaml files use a legacy predicate format:
 *   - `predicate: exists` + `args: ["path"]` instead of `op: "exists"` + `path: "path"`
 *   - `op: all` / `op: any` with `rules:` instead of `predicates:`
 *   - nested predicates as `predicate: / args:` objects instead of `op: / fields`
 *
 * This normalizer recursively converts legacy format to the canonical Predicate
 * interface expected by PredicateEvaluator.
 */

/** Check if something looks like a legacy predicate (predicate: / args: format). */
function isLegacyPredicate(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'predicate' in obj &&
    !('op' in obj)
  );
}

/**
 * Normalize a single legacy predicate entry to canonical Predicate shape.
 *
 * Legacy: { predicate: "exists", args: ["path"] }
 * Canonical: { op: "exists", path: "path" }
 */
function normalizeLegacyPredicate(obj: Record<string, unknown>): Predicate {
  const predName = String(obj.predicate);
  const args = Array.isArray(obj.args) ? obj.args : [];

  switch (predName) {
    case 'exists':
      return { op: 'exists', path: String(args[0] ?? '') };
    case 'nonEmpty':
      return { op: 'nonEmpty', path: String(args[0] ?? '') };
    case 'regex':
      return { op: 'regex', path: String(args[0] ?? ''), pattern: String(args[1] ?? '') };
    case 'equals':
      return { op: 'equals', path: String(args[0] ?? ''), value: args[1] };
    case 'in': {
      const vals = args[1];
      if (Array.isArray(vals)) {
        return {
          op: 'in',
          path: String(args[0] ?? ''),
          values: vals as Array<string | number | boolean>,
        };
      }
      return { op: 'in', path: String(args[0] ?? '') };
    }
    case 'all':
    case 'any': {
      const subPreds = args.map((a: unknown) =>
        isLegacyPredicate(a)
          ? normalizeLegacyPredicate(a as Record<string, unknown>)
          : normalizePredicate(a as Record<string, unknown>),
      ) as Predicate[];
      return predName === 'all'
        ? { op: 'all', predicates: subPreds }
        : { op: 'any', predicates: subPreds };
    }
    case 'not': {
      const sub = args[0];
      return {
        op: 'not',
        not: isLegacyPredicate(sub)
          ? normalizeLegacyPredicate(sub as Record<string, unknown>)
          : normalizePredicate(sub as Record<string, unknown>),
      };
    }
    default:
      // Pass through unknown predicates — PredicateEvaluator will handle gracefully
      return { op: predName as Predicate['op'], ...obj } as Predicate;
  }
}

/**
 * Recursively normalize a predicate (already in canonical format or legacy).
 * Handles nested predicates in `all`, `any`, `not`.
 */
function normalizePredicate(obj: Record<string, unknown>): Predicate {
  // Already canonical?
  if ('op' in obj) {
    const result = { ...obj } as unknown as Predicate;

    // Handle `rules:` → `predicates:` (legacy all/any use `rules`)
    if ((result.op === 'all' || result.op === 'any') && 'rules' in result) {
      const rulesObj = result as Record<string, unknown>;
      const rules = rulesObj.rules as unknown[];
      result.predicates = rules.map((r) => {
        if (isLegacyPredicate(r)) {
          return normalizeLegacyPredicate(r as Record<string, unknown>);
        }
        return normalizePredicate(r as Record<string, unknown>);
      }) as Predicate[];
      delete rulesObj.rules;
    }

    // Handle nested predicates in `all`/`any` that are still legacy format
    if (result.op === 'all' || result.op === 'any') {
      result.predicates = result.predicates.map((p) => {
        const pObj = p as unknown as Record<string, unknown>;
        if (isLegacyPredicate(pObj)) {
          return normalizeLegacyPredicate(pObj);
        }
        return normalizePredicate(pObj);
      }) as Predicate[];
    }

    // Handle `not` with legacy nested predicate
    if (result.op === 'not' && result.not) {
      const notObj = result.not as unknown as Record<string, unknown>;
      if (isLegacyPredicate(notObj)) {
        result.not = normalizeLegacyPredicate(notObj);
      } else if ('op' in notObj || 'predicate' in notObj) {
        result.not = normalizePredicate(notObj);
      }
    }

    return result;
  }

  // Legacy format
  if (isLegacyPredicate(obj)) {
    return normalizeLegacyPredicate(obj);
  }

  // Fallback: return as-is
  return obj as unknown as Predicate;
}

/**
 * Deep-clone and normalize a lint rule's assert (and optional when) predicate.
 * Also normalizes missing scope/severity/title to defaults.
 */
function normalizeRule(rule: Record<string, unknown>): Record<string, unknown> {
  const result = { ...rule };

  // Normalize assert predicate
  if (result.assert && typeof result.assert === 'object') {
    result.assert = normalizePredicate(result.assert as Record<string, unknown>);
  }

  // Normalize when predicate
  if (result.when && typeof result.when === 'object') {
    result.when = normalizePredicate(result.when as Record<string, unknown>);
  }

  // Default scope to 'record' if missing
  if (!('scope' in result)) {
    result.scope = 'record';
  }

  // Default severity to 'error' if missing
  if (!('severity' in result)) {
    result.severity = 'error';
  }

  // Default title to id if missing
  if (!('title' in result) && 'id' in result) {
    result.title = String(result.id);
  }

  // Default message if missing
  if (!('message' in result)) {
    result.message = { template: String(result.id ?? 'rule failed') };
  }

  return result;
}

/**
 * Normalize a parsed lint spec: convert legacy predicate formats, fill defaults.
 */
function normalizeLintSpec(spec: LintSpec): LintSpec {
  return {
    ...spec,
    rules: spec.rules.map((rule) =>
      normalizeRule(rule as unknown as Record<string, unknown>),
    ) as unknown as LintSpec['rules'],
  };
}

/**
 * Result of loading all lint specs from disk.
 */
export interface LintSpecLoadResult {
  specs: Array<{ name: string; spec: LintSpec }>;
  errors: Array<{ path: string; error: string }>;
}

/**
 * Recursively find all *.lint.yaml files in a directory.
 */
async function findLintFiles(
  dirPath: string,
  recursive: boolean,
): Promise<string[]> {
  const files: string[] = [];

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        const subFiles = await findLintFiles(fullPath, recursive);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && entry.name.endsWith(LINT_PATTERN)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Derive a human-readable spec name from a file path.
 * e.g. "claim.lint.yaml" → "claim"
 */
function specNameFromPath(filePath: string): string {
  const base = basename(filePath);
  return base.replace(LINT_PATTERN, '');
}

/**
 * Load all *.lint.yaml files from a base directory.
 *
 * @param options.basePath - Root directory to search
 * @param options.recursive - Whether to descend into subdirectories (default true)
 */
export async function loadAllLintSpecs(options: {
  basePath: string;
  recursive?: boolean;
}): Promise<LintSpecLoadResult> {
  const recursive = options.recursive ?? true;

  // Verify base path exists
  try {
    const stats = await stat(options.basePath);
    if (!stats.isDirectory()) {
      return { specs: [], errors: [{ path: options.basePath, error: 'Not a directory' }] };
    }
  } catch {
    return { specs: [], errors: [{ path: options.basePath, error: 'Directory does not exist' }] };
  }

  const filePaths = await findLintFiles(options.basePath, recursive);

  const specs: LintSpecLoadResult['specs'] = [];
  const errors: LintSpecLoadResult['errors'] = [];

  for (const filePath of filePaths) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = parseYaml(content) as LintSpec;

      if (!parsed || typeof parsed.lintVersion !== 'number' || !Array.isArray(parsed.rules)) {
        errors.push({ path: relative(options.basePath, filePath), error: 'Invalid lint spec structure' });
        continue;
      }

      specs.push({ name: specNameFromPath(filePath), spec: normalizeLintSpec(parsed) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ path: relative(options.basePath, filePath), error: message });
    }
  }

  return { specs, errors };
}

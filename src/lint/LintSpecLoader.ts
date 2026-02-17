/**
 * LintSpecLoader — Discovers and loads *.lint.yaml files from the schema directory.
 *
 * Follows the same recursive file-discovery pattern as SchemaLoader.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { LintSpec } from './types.js';

/** Pattern used to match lint spec files. */
const LINT_PATTERN = '.lint.yaml';

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

      specs.push({ name: specNameFromPath(filePath), spec: parsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ path: relative(options.basePath, filePath), error: message });
    }
  }

  return { specs, errors };
}

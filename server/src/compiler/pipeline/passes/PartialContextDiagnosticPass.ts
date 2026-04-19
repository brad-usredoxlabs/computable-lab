/**
 * PartialContextDiagnosticPass
 *
 * Emits `needs-missing-fact` diagnostics when a context snapshot is missing
 * required keys. This pass is part of the `derive_context` family and is
 * intended to be used by pipelines that need to verify context completeness
 * before proceeding with downstream computation.
 *
 * Per compiler-specs/60-compiler.md §6, the kernel emits a
 * `needs-missing-fact` outcome when a compile depends on a context field
 * that is not yet resolved.
 */

import type { Pass, PassDiagnostic, PassRunArgs, PassResult } from '../types.js';

export interface PartialContextDiagnosticArgs {
  passId?: string;                                       // default 'partial_context_diagnostic'
  requiredKeys: ReadonlyArray<string>;                   // context key paths, e.g. 'well.corrected_fluorescence'
  suggestedSourceByKey?: ReadonlyMap<string, string>;    // optional hint shown to the caller
}

/**
 * Resolves a value from a context object using a dotted path.
 * Returns undefined if any segment of the path is missing or null.
 *
 * @param context - The context object to traverse
 * @param keyPath - Dot-separated path, e.g. 'a.b.c'
 * @returns The value at the path, or undefined if not found
 */
function resolveContextPath(context: Record<string, unknown>, keyPath: string): unknown {
  const segments = keyPath.split('.');
  let current: unknown = context;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Creates a PartialContextDiagnosticPass instance.
 *
 * @param args - Configuration for the pass
 * @returns A Pass that checks for missing context keys
 */
export function createPartialContextDiagnosticPass(
  args: PartialContextDiagnosticArgs,
): Pass {
  const passId = args.passId ?? 'partial_context_diagnostic';
  const requiredKeys = args.requiredKeys;
  const suggestedSourceByKey = args.suggestedSourceByKey;

  return {
    id: passId,
    family: 'derive_context',
    run: (runArgs: PassRunArgs): PassResult => {
      const { state } = runArgs;
      const context = state.context as Record<string, unknown> | undefined;
      const diagnostics: PassDiagnostic[] = [];

      // If no context exists, all keys are missing
      if (!context) {
        for (const key of requiredKeys) {
          diagnostics.push({
            severity: 'warning',
            code: 'needs-missing-fact',
            message: `context key '${key}' is not resolved`,
            pass_id: passId,
            details: {
              missing_key: key,
              suggested_source: suggestedSourceByKey?.get(key),
            },
          });
        }
        return {
          ok: true,
          diagnostics,
          outcome: 'needs-missing-fact',
        };
      }

      // Check each required key
      for (const key of requiredKeys) {
        const value = resolveContextPath(context, key);

        // Missing if undefined or null
        if (value === undefined || value === null) {
          diagnostics.push({
            severity: 'warning',
            code: 'needs-missing-fact',
            message: `context key '${key}' is not resolved`,
            pass_id: passId,
            details: {
              missing_key: key,
              suggested_source: suggestedSourceByKey?.get(key),
            },
          });
        }
      }

      // Return outcome only if there are diagnostics
      if (diagnostics.length > 0) {
        return {
          ok: true,
          diagnostics,
          outcome: 'needs-missing-fact',
        };
      }

      // All keys present - no diagnostics, no outcome
      return {
        ok: true,
      };
    },
  };
}



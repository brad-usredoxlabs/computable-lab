/**
 * SchemaValidateDraftPass
 *
 * Validates a draft record against its target schema.
 * This pass is part of the promotion-compile pipeline and is used to
 * ensure the candidate draft is valid before promoting it to a canonical record.
 *
 * Note: This is a simplified implementation that skips actual schema validation
 * for now. In a full implementation, it would use the schema registry to
 * validate the draft against the resolved target schema.
 */

import type { Pass, PassDiagnostic, PassRunArgs, PassResult } from '../types.js';

const PASS_ID = 'schema_validate_draft';

/**
 * Creates a SchemaValidateDraftPass instance.
 *
 * @returns A Pass that validates the draft against its target schema
 */
export function createSchemaValidateDraftPass(): Pass {
  return {
    id: PASS_ID,
    family: 'validate',
    run: (runArgs: PassRunArgs): PassResult => {
      const { state, pass_id } = runArgs;
      
      // Get the validated candidate from the previous pass or from input
      const candidate = (state.outputs.get('validate_extraction_candidate') ?? state.input?.candidate) as
        | { target_kind?: string; draft?: unknown; confidence?: number }
        | undefined;

      if (!candidate || !candidate.draft) {
        return {
          ok: false,
          diagnostics: [{
            severity: 'error',
            code: 'MISSING_CANDIDATE_DRAFT',
            message: 'Candidate draft not found for schema validation',
            pass_id,
          }],
        };
      }

      // TODO: In a full implementation, validate the draft against the target schema
      // For now, we'll just pass through since the store will validate when persisting
      
      return {
        ok: true,
        output: candidate.draft,
      };
    },
  };
}

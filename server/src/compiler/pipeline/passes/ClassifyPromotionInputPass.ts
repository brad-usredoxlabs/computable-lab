/**
 * ClassifyPromotionInputPass
 *
 * Inspects the pipeline input to determine which promotion branch to take:
 * - 'context' branch: input has context_snapshot and target_kind
 * - 'extraction' branch: input has draft_record_id and candidate_path
 *
 * This is a pure parse-family pass that writes the branch decision to
 * state.meta.branch for downstream passes to use in their `when:` conditions.
 *
 * Per compiler-specs/60-compiler.md, this pass must be the first in the
 * promotion-compile pipeline to enable branch-specific routing.
 */

import type { Pass, PassDiagnostic, PassRunArgs, PassResult } from '../types.js';

const PASS_ID = 'classify_promotion_input';

/**
 * Creates a ClassifyPromotionInputPass instance.
 *
 * @returns A Pass that classifies the promotion input branch
 */
export function createClassifyPromotionInputPass(): Pass {
  return {
    id: PASS_ID,
    family: 'parse',
    run: (runArgs: PassRunArgs): PassResult => {
      const { state } = runArgs;
      const input = state.input as Record<string, unknown>;

      const hasContextSnapshot = 'context_snapshot' in input;
      const hasTargetKind = 'target_kind' in input;
      const hasDraftRecordId = 'draft_record_id' in input;
      const hasCandidatePath = 'candidate_path' in input;

      const isContextInput = hasContextSnapshot && hasTargetKind;
      const isExtractionInput = hasDraftRecordId && hasCandidatePath;

      // Both branches present - ambiguous error
      if (isContextInput && isExtractionInput) {
        const diagnostic: PassDiagnostic = {
          severity: 'error',
          code: 'ambiguous_promotion_input',
          message: 'input matches both context and extraction shapes; cannot determine promotion branch',
          pass_id: PASS_ID,
          details: {
            context_fields: ['context_snapshot', 'target_kind'],
            extraction_fields: ['draft_record_id', 'candidate_path'],
          },
        };
        return {
          ok: false,
          diagnostics: [diagnostic],
        };
      }

      // Context branch
      if (isContextInput) {
        return {
          ok: true,
          output: {
            meta: {
              branch: 'context',
            },
          },
        };
      }

      // Extraction branch
      if (isExtractionInput) {
        return {
          ok: true,
          output: {
            meta: {
              branch: 'extraction',
            },
          },
        };
      }

      // Neither branch matches - ambiguous error
      const diagnostic: PassDiagnostic = {
        severity: 'error',
        code: 'ambiguous_promotion_input',
        message: 'input matches neither context nor extraction shape',
        pass_id: PASS_ID,
        details: {
          received_keys: Object.keys(input),
          expected_context: ['context_snapshot', 'target_kind'],
          expected_extraction: ['draft_record_id', 'candidate_path'],
        },
      };

      return {
        ok: false,
        diagnostics: [diagnostic],
      };
    },
  };
}

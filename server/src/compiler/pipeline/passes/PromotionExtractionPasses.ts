/**
 * PromotionExtractionPasses
 *
 * Three pass factories for the extraction branch of the promotion-compile pipeline:
 * 1. validate_extraction_candidate - structural validation of extraction candidate
 * 2. resolve_target_schema - map target_kind to schema ID
 * 3. project_extraction_promotion - assemble extraction-promotion audit record
 *
 * These passes are designed to work with the extraction branch flow where
 * an extraction-draft candidate is promoted to a canonical record.
 */

import type { Pass, PassDiagnostic, PassRunArgs, PassResult } from '../types.js';

// --- validate_extraction_candidate ---

export function createValidateExtractionCandidatePass(): Pass {
  return {
    id: 'validate_extraction_candidate',
    family: 'validate',
    run(args: PassRunArgs): PassResult {
      const { state, pass_id } = args;
      const candidate = state.input?.candidate as
        | { target_kind?: unknown; draft?: unknown; confidence?: unknown }
        | undefined;
      const diagnostics: PassDiagnostic[] = [];

      if (!candidate || typeof candidate !== 'object') {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_EXTRACTION_CANDIDATE',
          message: 'state.input.candidate is required',
          pass_id,
        });
      } else {
        if (typeof candidate.target_kind !== 'string') {
          diagnostics.push({
            severity: 'error',
            code: 'INVALID_EXTRACTION_CANDIDATE',
            message: 'candidate.target_kind must be a string',
            pass_id,
          });
        }
        if (!candidate.draft || typeof candidate.draft !== 'object') {
          diagnostics.push({
            severity: 'error',
            code: 'INVALID_EXTRACTION_CANDIDATE',
            message: 'candidate.draft must be an object',
            pass_id,
          });
        }
        if (typeof candidate.confidence !== 'number') {
          diagnostics.push({
            severity: 'error',
            code: 'INVALID_EXTRACTION_CANDIDATE',
            message: 'candidate.confidence must be a number',
            pass_id,
          });
        }
      }

      if (diagnostics.some(d => d.severity === 'error')) {
        return { ok: false, diagnostics };
      }

      return { ok: true, output: candidate, diagnostics };
    },
  };
}

// --- resolve_target_schema ---

const TARGET_KIND_TO_SCHEMA: Record<string, string> = {
  'material-spec': 'material-spec.schema.yaml',
  'protocol': 'protocol.schema.yaml',
  'equipment-spec': 'equipment-spec.schema.yaml',
  'labware-spec': 'labware-spec.schema.yaml',
};

export function createResolveTargetSchemaPass(): Pass {
  return {
    id: 'resolve_target_schema',
    family: 'disambiguate',
    run(args: PassRunArgs): PassResult {
      const { state, pass_id } = args;
      const candidate = (state.outputs.get('validate_extraction_candidate')
        ?? state.input?.candidate) as { target_kind?: string } | undefined;
      const targetKind = candidate?.target_kind;

      if (!targetKind) {
        return {
          ok: false,
          diagnostics: [{
            severity: 'error',
            code: 'NO_TARGET_KIND',
            message: 'cannot resolve target schema without target_kind',
            pass_id,
          }],
        };
      }

      const schemaId = TARGET_KIND_TO_SCHEMA[targetKind];
      if (!schemaId) {
        return {
          ok: false,
          diagnostics: [{
            severity: 'error',
            code: 'UNKNOWN_TARGET_KIND',
            message: `no schema mapped for target_kind='${targetKind}'`,
            pass_id,
          }],
        };
      }

      return { ok: true, output: { schemaId, target_kind: targetKind } };
    },
  };
}

// --- project_extraction_promotion ---

export function createProjectExtractionPromotionPass(params: {
  recordIdPrefix?: string;
  now?: () => Date;
} = {}): Pass {
  const prefix = params.recordIdPrefix ?? 'XPR-';
  const nowFn = params.now ?? (() => new Date());

  return {
    id: 'project_extraction_promotion',
    family: 'project',
    run(args: PassRunArgs): PassResult {
      const { state, pass_id } = args;
      // Get the validated draft from schema_validate_draft or from the candidate
      const validatedDraft = state.outputs.get('schema_validate_draft') as unknown;
      const candidate = (state.outputs.get('validate_extraction_candidate') ?? state.input?.candidate) as
        | { target_kind?: string; draft?: unknown; confidence?: number }
        | undefined;
      // Get source draft id from input (either draft_record_id or source_draft_id)
      const sourceDraftId = (state.input?.draft_record_id ?? state.input?.source_draft_id) as string | undefined;

      if (!validatedDraft || !candidate || !sourceDraftId) {
        return {
          ok: false,
          diagnostics: [{
            severity: 'error',
            code: 'MISSING_PROMOTION_INPUTS',
            message: 'project_extraction_promotion requires schema_validate_draft output, candidate, and draft_record_id/source_draft_id',
            pass_id,
          }],
        };
      }

      const ts = nowFn().toISOString().replace(/[:.]/g, '-');
      const recordId = `${prefix}${ts}-v1`;

      return {
        ok: true,
        output: {
          kind: 'extraction-promotion',
          recordId,
          source_draft_id: sourceDraftId,
          target_kind: candidate.target_kind,
          target_record: validatedDraft,
          created_at: nowFn().toISOString(),
        },
      };
    },
  };
}

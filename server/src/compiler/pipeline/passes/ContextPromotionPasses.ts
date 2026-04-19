/**
 * ContextPromotionPasses
 *
 * Passes for the context branch of the promotion-compile pipeline:
 * 1. validate_context_source - validates the context source
 * 2. project_context_promotion - projects the context-promotion audit record
 *
 * These passes are designed to work with the context branch flow where
 * a context snapshot is promoted to a canonical record.
 */

import type { Pass, PassDiagnostic, PassRunArgs, PassResult } from '../types.js';

// --- validate_context_source ---

export function createValidateContextSourcePass(): Pass {
  return {
    id: 'validate_context_source',
    family: 'validate',
    run(args: PassRunArgs): PassResult {
      const { state, pass_id } = args;
      const contextSnapshot = state.input?.context_snapshot as
        | { kind?: string; data?: unknown }
        | undefined;
      const diagnostics: PassDiagnostic[] = [];

      if (!contextSnapshot || typeof contextSnapshot !== 'object') {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_CONTEXT_SOURCE',
          message: 'state.input.context_snapshot is required',
          pass_id,
        });
      } else {
        if (typeof contextSnapshot.kind !== 'string') {
          diagnostics.push({
            severity: 'error',
            code: 'INVALID_CONTEXT_SOURCE',
            message: 'context_snapshot.kind must be a string',
            pass_id,
          });
        }
        if (!contextSnapshot.data || typeof contextSnapshot.data !== 'object') {
          diagnostics.push({
            severity: 'error',
            code: 'INVALID_CONTEXT_SOURCE',
            message: 'context_snapshot.data must be an object',
            pass_id,
          });
        }
      }

      if (diagnostics.some(d => d.severity === 'error')) {
        return { ok: false, diagnostics };
      }

      return { ok: true, output: contextSnapshot, diagnostics };
    },
  };
}

// --- project_context_promotion ---

export function createProjectContextPromotionPass(params: {
  recordIdPrefix?: string;
  now?: () => Date;
} = {}): Pass {
  const prefix = params.recordIdPrefix ?? 'XCP-';
  const nowFn = params.now ?? (() => new Date());

  return {
    id: 'project_context_promotion',
    family: 'project',
    run(args: PassRunArgs): PassResult {
      const { state, pass_id } = args;
      const validatedContext = state.outputs.get('schema_validate_draft') ?? state.input?.context_snapshot;
      const contextSnapshot = state.input?.context_snapshot as
        | { kind?: string; data?: unknown }
        | undefined;

      if (!validatedContext || !contextSnapshot) {
        return {
          ok: false,
          diagnostics: [{
            severity: 'error',
            code: 'MISSING_PROMOTION_INPUTS',
            message: 'project_context_promotion requires context_snapshot',
            pass_id,
          }],
        };
      }

      const ts = nowFn().toISOString().replace(/[:.]/g, '-');
      const recordId = `${prefix}${ts}-v1`;

      return {
        ok: true,
        output: {
          kind: 'context-promotion',
          recordId,
          target_kind: contextSnapshot.kind,
          target_record: validatedContext,
          created_at: nowFn().toISOString(),
        },
      };
    },
  };
}

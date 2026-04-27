/**
 * LocalProtocolPasses — Real implementations for the last four passes of
 * the local-protocol-compile pipeline.
 *
 * Pipeline order (from local-protocol-compile.yaml):
 *   1. parse_local_protocol          (stub, family: parse)
 *   2. normalize_local_protocol      (stub, family: normalize)
 *   3. resolve_protocol_ref          (family: disambiguate)
 *   4. validate_local_protocol       (family: validate)
 *   5. expand_local_customizations   (family: expand)
 *   6. project_local_expanded_protocol (family: project)
 *
 * expandedProtocol shape (internal, transient — consumed by events_emit):
 * {
 *   // Deep copy of canonical protocol payload
 *   kind: 'protocol',
 *   recordId: string,
 *   title: string,
 *   steps: ProtocolStep[],
 *   phases?: Phase[],
 *   // Customization overrides applied at top level
 *   resolvedLabwareKind: string,
 *   resolvedPlateCount: number,
 *   resolvedSampleCount: number,
 * }
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { RecordStore } from '../../../store/types.js';
import type { AjvValidator } from '../../../validation/AjvValidator.js';

// ---------------------------------------------------------------------------
// Schema ID for local-protocol records
// ---------------------------------------------------------------------------

const LOCAL_PROTOCOL_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';

// ---------------------------------------------------------------------------
// createResolveProtocolRefPass
// ---------------------------------------------------------------------------

export interface ResolveProtocolRefDeps {
  recordStore: RecordStore;
}

export function createResolveProtocolRefPass(
  deps: ResolveProtocolRefDeps,
): Pass {
  return {
    id: 'resolve_protocol_ref',
    family: 'disambiguate',
    async run(args: PassRunArgs): Promise<PassResult> {
      // Read localProtocolRef from upstream protocol_realize output
      const realizeOutput = args.state.outputs.get('protocol_realize') as
        | { localProtocolRef?: string }
        | undefined;

      const localProtocolRef = realizeOutput?.localProtocolRef
        ?? (args.state.input['localProtocolRef'] as string | undefined);

      if (
        typeof localProtocolRef !== 'string' ||
        localProtocolRef.length === 0
      ) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_local_protocol_ref',
              message:
                'resolve_protocol_ref requires input.localProtocolRef or upstream protocol_realize output',
              pass_id: 'resolve_protocol_ref',
            },
          ],
        };
      }

      const localProtocol = await deps.recordStore.get(localProtocolRef);
      if (!localProtocol) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'local_protocol_not_found',
              message: `local-protocol ${localProtocolRef} not found`,
              pass_id: 'resolve_protocol_ref',
            },
          ],
        };
      }

      const inheritsFrom = (
        localProtocol.payload as Record<string, unknown>
      )['inherits_from'] as { id?: string } | undefined;
      const protocolId = inheritsFrom?.id;

      if (!protocolId) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_inherits_from',
              message: 'local-protocol has no inherits_from.id',
              pass_id: 'resolve_protocol_ref',
            },
          ],
        };
      }

      const canonicalProtocol = await deps.recordStore.get(protocolId);
      if (!canonicalProtocol) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'canonical_protocol_not_found',
              message: `protocol ${protocolId} not found`,
              pass_id: 'resolve_protocol_ref',
            },
          ],
        };
      }

      return {
        ok: true,
        output: { localProtocol, canonicalProtocol },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// createValidateLocalProtocolPass
// ---------------------------------------------------------------------------

export interface ValidateLocalProtocolDeps {
  ajvValidator: AjvValidator;
}

export function createValidateLocalProtocolPass(
  deps: ValidateLocalProtocolDeps,
): Pass {
  return {
    id: 'validate_local_protocol',
    family: 'validate',
    run(args: PassRunArgs): PassResult {
      const outputs = args.state.outputs;
      const resolveOutput = outputs.get('resolve_protocol_ref') as
        | { localProtocol: unknown }
        | undefined;

      if (!resolveOutput || !resolveOutput.localProtocol) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_resolve_output',
              message:
                'validate_local_protocol requires outputs.resolve_protocol_ref.localProtocol',
              pass_id: 'validate_local_protocol',
            },
          ],
        };
      }

      const localProtocolEnvelope = resolveOutput.localProtocol as {
        payload: unknown;
      };
      const payload = localProtocolEnvelope.payload;

      const validationResult = deps.ajvValidator.validate(
        payload,
        LOCAL_PROTOCOL_SCHEMA_ID,
      );

      const diagnostics: PassDiagnostic[] = validationResult.errors.map(
        (err) => ({
          severity: 'error',
          code: 'local_protocol_schema_violation',
          message: `${err.path}: ${err.message}`,
          pass_id: 'validate_local_protocol',
        }),
      );

      return {
        ok: true, // ok:true even on validation failures — downstream passes can still proceed
        output: { validationOk: validationResult.valid },
        diagnostics,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// createExpandLocalCustomizationsPass
// ---------------------------------------------------------------------------

export interface ExpandLocalCustomizationsDeps {
  // No external deps needed — reads from upstream outputs
}

export function createExpandLocalCustomizationsPass(
  _deps: ExpandLocalCustomizationsDeps = {},
): Pass {
  return {
    id: 'expand_local_customizations',
    family: 'expand',
    run(args: PassRunArgs): PassResult {
      const outputs = args.state.outputs;

      const resolveOutput = outputs.get('resolve_protocol_ref') as
        | { localProtocol: unknown; canonicalProtocol: unknown }
        | undefined;

      if (!resolveOutput || !resolveOutput.localProtocol) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_local_protocol',
              message:
                'expand_local_customizations requires outputs.resolve_protocol_ref.localProtocol',
              pass_id: 'expand_local_customizations',
            },
          ],
        };
      }

      if (!resolveOutput.canonicalProtocol) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_canonical_protocol',
              message:
                'expand_local_customizations requires outputs.resolve_protocol_ref.canonicalProtocol',
              pass_id: 'expand_local_customizations',
            },
          ],
        };
      }

      const localProtocol = resolveOutput.localProtocol as {
        payload: Record<string, unknown>;
      };
      const canonicalProtocol = resolveOutput.canonicalProtocol as {
        payload: Record<string, unknown>;
      };

      // Deep copy canonical protocol payload
      const expandedProtocol = JSON.parse(
        JSON.stringify(canonicalProtocol.payload),
      ) as Record<string, unknown>;

      // Extract customizations from local protocol
      // Per spec-022, labContext is stored in notes as JSON string
      const notesRaw = localProtocol.payload['notes'] as
        | string
        | undefined;
      let customizations: Record<string, unknown> = {};

      if (typeof notesRaw === 'string') {
        try {
          const parsed = JSON.parse(notesRaw);
          customizations = parsed.labContext ?? parsed.customizations ?? {};
        } catch {
          // Malformed notes — ignore customizations
        }
      }

      // Also check for a top-level customizations field (future-proofing)
      const topLevelCustomizations =
        localProtocol.payload['customizations'] as
          | Record<string, unknown>
          | undefined;
      if (topLevelCustomizations) {
        customizations = { ...customizations, ...topLevelCustomizations };
      }

      // Apply customizations at top level
      if (customizations['labwareKind']) {
        expandedProtocol['resolvedLabwareKind'] =
          customizations['labwareKind'];
      }
      if (customizations['plateCount']) {
        expandedProtocol['resolvedPlateCount'] =
          customizations['plateCount'];
      }
      if (customizations['sampleCount']) {
        expandedProtocol['resolvedSampleCount'] =
          customizations['sampleCount'];
      }

      // Preserve phases from canonical protocol (if present)
      if (canonicalProtocol.payload['phases']) {
        expandedProtocol['phases'] = canonicalProtocol.payload['phases'];
      }

      // Preserve phaseId on each step (already in deep copy)
      const steps = expandedProtocol['steps'] as
        | Array<Record<string, unknown>>
        | undefined;
      if (Array.isArray(steps)) {
        for (const step of steps) {
          // Ensure phaseId is preserved (it's already in the deep copy)
          // No mutation needed — deep copy already has it
        }
      }

      return {
        ok: true,
        output: { expandedProtocol },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// createProjectLocalExpandedProtocolPass
// ---------------------------------------------------------------------------

export interface ProjectLocalExpandedProtocolDeps {
  // No external deps needed
}

export function createProjectLocalExpandedProtocolPass(
  _deps: ProjectLocalExpandedProtocolDeps = {},
): Pass {
  return {
    id: 'project_local_expanded_protocol',
    family: 'project',
    run(args: PassRunArgs): PassResult {
      const outputs = args.state.outputs;
      const expandOutput = outputs.get('expand_local_customizations') as
        | { expandedProtocol: unknown }
        | undefined;

      if (!expandOutput || !expandOutput.expandedProtocol) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_expanded_protocol',
              message:
                'project_local_expanded_protocol requires outputs.expand_local_customizations.expandedProtocol',
              pass_id: 'project_local_expanded_protocol',
            },
          ],
        };
      }

      const expandedProtocol = expandOutput.expandedProtocol as Record<
        string,
        unknown
      >;

      // Build summary metadata
      const steps = expandedProtocol['steps'] as
        | unknown[]
        | undefined;
      const phases = expandedProtocol['phases'] as
        | unknown[]
        | undefined;

      const metadata = {
        stepCount: Array.isArray(steps) ? steps.length : 0,
        phaseCount: Array.isArray(phases) ? phases.length : 0,
        labwareKind: expandedProtocol['resolvedLabwareKind'] ?? null,
        plateCount: expandedProtocol['resolvedPlateCount'] ?? null,
        sampleCount: expandedProtocol['resolvedSampleCount'] ?? null,
      };

      return {
        ok: true,
        output: {
          expandedProtocol,
          metadata,
        },
      };
    },
  };
}

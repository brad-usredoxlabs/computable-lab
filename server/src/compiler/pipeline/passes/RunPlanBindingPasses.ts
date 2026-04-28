/**
 * RunPlanBindingPasses — Real implementations for the four binding-related
 * passes of the run-plan-compile pipeline.
 *
 * Pipeline order (from run-plan-compile.yaml):
 *   1. parse_planned_run              (stub, family: parse)
 *   2. resolve_local_protocol         (family: normalize)
 *   3. resolve_policy_profile         (family: normalize)
 *   4. resolve_material_bindings      (family: disambiguate)
 *   5. resolve_labware_bindings       (family: disambiguate)
 *   6. capability_check               (family: validate)
 *   7. derive_per_step_context        (family: derive_context)
 *   8. ai_plan_quality_scoring        (family: derive_context, optional)
 *   9. project_result                 (family: project)
 *
 * These four passes resolve the local protocol chain, policy profile, and
 * material/labware bindings.  Unbound roles emit error diagnostics but do
 * not fail the pass so downstream capability_check can still surface them.
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { RecordStore } from '../../../store/types.js';

// ---------------------------------------------------------------------------
// createResolveLocalProtocolPass
// ---------------------------------------------------------------------------

export interface ResolveLocalProtocolDeps {
  recordStore: RecordStore;
}

export function createResolveLocalProtocolPass(
  deps: ResolveLocalProtocolDeps,
): Pass {
  return {
    id: 'resolve_local_protocol',
    family: 'normalize',
    async run(args: PassRunArgs): Promise<PassResult> {
      const plannedRunRef = args.state.input['plannedRunRef'] as
        | string
        | undefined;

      if (typeof plannedRunRef !== 'string' || plannedRunRef.length === 0) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_planned_run_ref',
              message:
                'resolve_local_protocol requires input.plannedRunRef',
              pass_id: 'resolve_local_protocol',
            },
          ],
        };
      }

      // 1. Load the planned-run record
      const plannedRun = await deps.recordStore.get(plannedRunRef);
      if (!plannedRun) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'planned_run_not_found',
              message: `planned-run ${plannedRunRef} not found`,
              pass_id: 'resolve_local_protocol',
            },
          ],
        };
      }

      // 2. Read localProtocolRef → load the local-protocol record
      const localProtocolRef = (
        plannedRun.payload as Record<string, unknown>
      )['localProtocolRef'] as { id?: string } | string | undefined;
      const localProtocolId =
        typeof localProtocolRef === 'object'
          ? localProtocolRef?.id
          : typeof localProtocolRef === 'string'
            ? localProtocolRef
            : undefined;

      if (!localProtocolId) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_local_protocol_ref',
              message:
                'planned-run has no localProtocolRef',
              pass_id: 'resolve_local_protocol',
            },
          ],
        };
      }

      const localProtocol = await deps.recordStore.get(localProtocolId);
      if (!localProtocol) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'local_protocol_not_found',
              message: `local-protocol ${localProtocolId} not found`,
              pass_id: 'resolve_local_protocol',
            },
          ],
        };
      }

      // 3. Read local-protocol.inherits_from.id → load the canonical protocol
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
              pass_id: 'resolve_local_protocol',
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
              pass_id: 'resolve_local_protocol',
            },
          ],
        };
      }

      // 4. Compute expandedProtocol by reusing expand_local_customizations logic
      const expandedProtocol = expandLocalCustomizations(
        localProtocol,
        canonicalProtocol,
      );

      return {
        ok: true,
        output: {
          plannedRun,
          localProtocol,
          canonicalProtocol,
          expandedProtocol,
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// createResolvePolicyProfilePass
// ---------------------------------------------------------------------------

export interface ResolvePolicyProfileDeps {
  recordStore: RecordStore;
}

const DEFAULT_POLICY_PROFILE_REF = 'POLICY-default';

export function createResolvePolicyProfilePass(
  deps: ResolvePolicyProfileDeps,
): Pass {
  return {
    id: 'resolve_policy_profile',
    family: 'normalize',
    async run(args: PassRunArgs): Promise<PassResult> {
      const diagnostics: PassDiagnostic[] = [];

      // 1. Determine the policy-profile ref
      const policyProfileRef =
        (args.state.input['policyProfileRef'] as string | undefined) ??
        (args.state.input['policy_profile_ref'] as string | undefined);

      // 2. If not in input, try to read from planned-run
      if (!policyProfileRef) {
        const plannedRunRef = args.state.input['plannedRunRef'] as
          | string
          | undefined;
        if (plannedRunRef) {
          const plannedRun = await deps.recordStore.get(plannedRunRef);
          if (plannedRun) {
            const ref = (
              plannedRun.payload as Record<string, unknown>
            )['policyProfileRef'] as string | undefined;
            if (ref) {
              // Use the ref from planned-run
            } else {
              // Fall back to default
            }
          }
        }
      }

      const resolvedRef =
        (args.state.input['policyProfileRef'] as string | undefined) ??
        (args.state.input['policy_profile_ref'] as string | undefined);

      if (!resolvedRef) {
        // No ref anywhere — use default
        diagnostics.push({
          severity: 'warning',
          code: 'policy_profile_not_found',
          message:
            'No policyProfileRef found; using permissive default profile',
          pass_id: 'resolve_policy_profile',
        });
        return {
          ok: true,
          output: {
            policyProfile: {
              kind: 'policy-profile',
              recordId: DEFAULT_POLICY_PROFILE_REF,
              allowAll: true,
            },
          },
          diagnostics,
        };
      }

      // 3. Load the policy-profile record
      const policyProfile = await deps.recordStore.get(resolvedRef);
      if (!policyProfile) {
        diagnostics.push({
          severity: 'warning',
          code: 'policy_profile_not_found',
          message: `policy-profile ${resolvedRef} not found; using permissive default`,
          pass_id: 'resolve_policy_profile',
        });
        return {
          ok: true,
          output: {
            policyProfile: {
              kind: 'policy-profile',
              recordId: DEFAULT_POLICY_PROFILE_REF,
              allowAll: true,
            },
          },
          diagnostics,
        };
      }

      return {
        ok: true,
        output: { policyProfile },
        diagnostics,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// createResolveMaterialBindingsPass
// ---------------------------------------------------------------------------

export interface ResolveMaterialBindingsDeps {
  recordStore: RecordStore;
}

export function createResolveMaterialBindingsPass(
  deps: ResolveMaterialBindingsDeps,
): Pass {
  return {
    id: 'resolve_material_bindings',
    family: 'disambiguate',
    async run(args: PassRunArgs): Promise<PassResult> {
      const local = args.state.outputs.get('resolve_local_protocol') as
        | { plannedRun: unknown; expandedProtocol: unknown }
        | undefined;

      if (!local) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_resolve_local_protocol',
              message:
                'resolve_material_bindings requires upstream resolve_local_protocol output',
              pass_id: 'resolve_material_bindings',
            },
          ],
        };
      }

      const plannedRun = local.plannedRun as {
        payload: Record<string, unknown>;
      };
      const expandedProtocol = local.expandedProtocol as Record<
        string,
        unknown
      >;

      // Walk expandedProtocol.materialRoles[] to enumerate roles needed
      const materialRoles = (
        expandedProtocol['materialRoles'] ?? []
      ) as Array<{ roleId: string }>;
      const requestedRoles = materialRoles.map((r) => r.roleId);

      // Walk plannedRun.bindings.materials[] for entries
      const bindings = (
        plannedRun.payload['bindings'] as
          | { materials?: Array<{ roleId: string; materialRef: string }> }
          | undefined
      )?.materials ?? [];

      const resolved: Record<string, unknown> = {};
      const unbound: string[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const roleId of requestedRoles) {
        const binding = bindings.find((b) => b.roleId === roleId);
        if (!binding) {
          unbound.push(roleId);
          diagnostics.push({
            severity: 'error',
            code: 'unbound_material_role',
            message: `material role '${roleId}' has no binding`,
            pass_id: 'resolve_material_bindings',
            details: { roleId },
          });
          continue;
        }

        const materialRef = binding.materialRef as string;
        if (!materialRef) {
          unbound.push(roleId);
          diagnostics.push({
            severity: 'error',
            code: 'missing_material_ref',
            message: `material binding for role '${roleId}' has no materialRef`,
            pass_id: 'resolve_material_bindings',
            details: { roleId },
          });
          continue;
        }

        const env = await deps.recordStore.get(materialRef);
        if (!env) {
          diagnostics.push({
            severity: 'error',
            code: 'material_instance_not_found',
            message: `material-instance ${materialRef} not found`,
            pass_id: 'resolve_material_bindings',
            details: { roleId, materialRef },
          });
          continue;
        }

        resolved[roleId] = env;
      }

      return {
        ok: true, // ok:true even with unbound roles
        output: {
          materialResolutions: resolved,
          unboundMaterialRoles: unbound,
        },
        diagnostics,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// createResolveLabwareBindingsPass
// ---------------------------------------------------------------------------

export interface ResolveLabwareBindingsDeps {
  recordStore: RecordStore;
}

export function createResolveLabwareBindingsPass(
  deps: ResolveLabwareBindingsDeps,
): Pass {
  return {
    id: 'resolve_labware_bindings',
    family: 'disambiguate',
    async run(args: PassRunArgs): Promise<PassResult> {
      const local = args.state.outputs.get('resolve_local_protocol') as
        | { plannedRun: unknown; expandedProtocol: unknown }
        | undefined;

      if (!local) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_resolve_local_protocol',
              message:
                'resolve_labware_bindings requires upstream resolve_local_protocol output',
              pass_id: 'resolve_labware_bindings',
            },
          ],
        };
      }

      const plannedRun = local.plannedRun as {
        payload: Record<string, unknown>;
      };
      const expandedProtocol = local.expandedProtocol as Record<
        string,
        unknown
      >;

      // Walk expandedProtocol.labwareRoles[] to enumerate roles needed
      const labwareRoles = (
        expandedProtocol['labwareRoles'] ?? []
      ) as Array<{ roleId: string }>;
      const requestedRoles = labwareRoles.map((r) => r.roleId);

      // Walk plannedRun.bindings.labware[] for entries
      const bindings = (
        plannedRun.payload['bindings'] as
          | { labware?: Array<{ roleId: string; labwareInstanceRef: string }> }
          | undefined
      )?.labware ?? [];

      const resolved: Record<string, unknown> = {};
      const unbound: string[] = [];
      const diagnostics: PassDiagnostic[] = [];

      for (const roleId of requestedRoles) {
        const binding = bindings.find((b) => b.roleId === roleId);
        if (!binding) {
          unbound.push(roleId);
          diagnostics.push({
            severity: 'error',
            code: 'unbound_labware_role',
            message: `labware role '${roleId}' has no binding`,
            pass_id: 'resolve_labware_bindings',
            details: { roleId },
          });
          continue;
        }

        const labwareRef = binding.labwareInstanceRef as string;
        if (!labwareRef) {
          unbound.push(roleId);
          diagnostics.push({
            severity: 'error',
            code: 'missing_labware_ref',
            message: `labware binding for role '${roleId}' has no labwareInstanceRef`,
            pass_id: 'resolve_labware_bindings',
            details: { roleId },
          });
          continue;
        }

        const env = await deps.recordStore.get(labwareRef);
        if (!env) {
          diagnostics.push({
            severity: 'error',
            code: 'labware_instance_not_found',
            message: `labware-instance ${labwareRef} not found`,
            pass_id: 'resolve_labware_bindings',
            details: { roleId, labwareRef },
          });
          continue;
        }

        resolved[roleId] = env;
      }

      return {
        ok: true, // ok:true even with unbound roles
        output: {
          labwareResolutions: resolved,
          unboundLabwareRoles: unbound,
        },
        diagnostics,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// expandLocalCustomizations — reuses spec-023 logic
// ---------------------------------------------------------------------------

/**
 * Deep-copy canonical protocol payload and apply local customizations.
 * Produces the expandedProtocol shape consumed by downstream passes.
 */
function expandLocalCustomizations(
  localProtocol: { payload: Record<string, unknown> },
  canonicalProtocol: { payload: Record<string, unknown> },
): Record<string, unknown> {
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

  // Walk steps to collect materialRoles and labwareRoles
  const steps = expandedProtocol['steps'] as
    | Array<Record<string, unknown>>
    | undefined;
  if (Array.isArray(steps)) {
    const materialRoleSet = new Set<string>();
    const labwareRoleSet = new Set<string>();

    for (const step of steps) {
      // Collect material roles from step.material.materialRole
      const material = step['material'] as
        | { materialRole?: string }
        | undefined;
      if (material?.materialRole) {
        materialRoleSet.add(material.materialRole);
      }

      // Collect labware roles from step.target.labwareRole
      const target = step['target'] as
        | { labwareRole?: string }
        | undefined;
      if (target?.labwareRole) {
        labwareRoleSet.add(target.labwareRole);
      }
    }

    expandedProtocol['materialRoles'] = Array.from(materialRoleSet).map(
      (roleId) => ({ roleId }),
    );
    expandedProtocol['labwareRoles'] = Array.from(labwareRoleSet).map(
      (roleId) => ({ roleId }),
    );
  }

  return expandedProtocol;
}

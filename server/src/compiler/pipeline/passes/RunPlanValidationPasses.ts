/**
 * RunPlanValidationPasses — Real implementations for the three validation /
 * projection passes of the run-plan-compile pipeline.
 *
 * Pipeline order (from run-plan-compile.yaml):
 *   6. capability_check               (family: validate)
 *   7. derive_per_step_context        (family: derive_context)
 *   9. project_result                 (family: project)
 *
 * These passes validate bound equipment/labware/policy, derive per-step
 * contexts, and project the final RunPlanCompileResult.
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';

// ---------------------------------------------------------------------------
// Capability-check pass
// ---------------------------------------------------------------------------

export interface CapabilityCheckPassDeps {
  // No recordStore needed — all data comes from upstream pass outputs.
}

/**
 * Diagnostic codes emitted by capability_check.
 */
export const CAPABILITY_DIAGNOSTIC_CODES = [
  'capability_volume_out_of_range',
  'capability_labware_shape_mismatch',
  'capability_policy_blocked',
] as const;
export type CapabilityDiagnosticCode = (typeof CAPABILITY_DIAGNOSTIC_CODES)[number];

/**
 * Shape of a single capability-check result for one step.
 */
export interface CapabilityCheckResult {
  stepId: string;
  ok: boolean;
  violations: PassDiagnostic[];
}

/**
 * Output shape of the capability_check pass.
 */
export interface CapabilityCheckOutput {
  capabilityChecks: CapabilityCheckResult[];
}

/**
 * createCapabilityCheckPass — validates each step against bound equipment,
 * labware, and policy.  Emits diagnostics for violations but never throws.
 */
export function createCapabilityCheckPass(
  _deps: CapabilityCheckPassDeps = {},
): Pass {
  return {
    id: 'capability_check',
    family: 'validate',
    async run(args: PassRunArgs): Promise<PassResult> {
      const diagnostics: PassDiagnostic[] = [];

      // 1. Read upstream outputs
      const local = args.state.outputs.get('resolve_local_protocol') as
        | { expandedProtocol: Record<string, unknown> }
        | undefined;
      if (!local) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_resolve_local_protocol',
              message:
                'capability_check requires upstream resolve_local_protocol output',
              pass_id: 'capability_check',
            },
          ],
        };
      }

      const expandedProtocol = local.expandedProtocol;
      const steps = expandedProtocol['steps'] as
        | Array<Record<string, unknown>>
        | undefined;
      if (!Array.isArray(steps)) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_steps',
              message: 'expandedProtocol has no steps array',
              pass_id: 'capability_check',
            },
          ],
        };
      }

      // 2. Read resolved labware bindings
      const labwareBindings = args.state.outputs.get('resolve_labware_bindings') as
        | { labwareResolutions: Record<string, unknown>; unboundLabwareRoles: string[] }
        | undefined;
      const labwareResolutions = labwareBindings?.labwareResolutions ?? {};

      // 3. Read resolved material bindings (may contain equipment hints)
      const materialBindings = args.state.outputs.get('resolve_material_bindings') as
        | { materialResolutions: Record<string, unknown>; unboundMaterialRoles: string[] }
        | undefined;
      const materialResolutions = materialBindings?.materialResolutions ?? {};

      // 4. Read policy profile
      const policyProfile = args.state.outputs.get('resolve_policy_profile') as
        | { policyProfile: Record<string, unknown> }
        | undefined;

      // 5. Check each step
      const capabilityChecks: CapabilityCheckResult[] = [];

      for (const step of steps) {
        const stepId = (step['stepId'] as string) ?? 'unknown';
        const violations: PassDiagnostic[] = [];

        // --- Labware compatibility check ---
        const target = step['target'] as
          | { labwareRole?: string }
          | undefined;
        const labwareRole = target?.labwareRole as string | undefined;

        if (labwareRole && labwareResolutions[labwareRole]) {
          const labwareInstance = labwareResolutions[labwareRole] as Record<string, unknown>;
          const labwareId = labwareInstance['labwareId'] as string | undefined;

          // Check labware shape compatibility against step expectations
          // For v1: check if step specifies a labwareKind and it matches
          const expectedLabwareKind = expandedProtocol['resolvedLabwareKind'] as
            | string
            | undefined;
          if (expectedLabwareKind && labwareId) {
            // Simple shape check: does the labware definition support the expected kind?
            // We check if the labwareId contains the expected kind as a substring
            // or if the labware definition has compatible topology
            const labwareKindMatch = checkLabwareShapeCompatibility(
              labwareId,
              expectedLabwareKind,
            );
            if (!labwareKindMatch) {
              violations.push({
                severity: 'error',
                code: 'capability_labware_shape_mismatch',
                message: `Labware '${labwareId}' is incompatible with expected kind '${expectedLabwareKind}' for step '${stepId}'`,
                pass_id: 'capability_check',
                details: { stepId, labwareRole, labwareId, expectedKind: expectedLabwareKind },
              });
            }
          }
        }

        // --- Volume range check ---
        const volume_uL = step['volume_uL'] as number | undefined;
        if (typeof volume_uL === 'number' && volume_uL > 0) {
          // Check against pipette/equipment constraints from material bindings
          // For v1: use a simple default range (0.5–1000 uL) unless overridden
          const pipetteMaxVolume = getPipetteMaxVolume(materialResolutions);
          const pipetteMinVolume = getPipetteMinVolume(materialResolutions);

          if (volume_uL > pipetteMaxVolume) {
            violations.push({
              severity: 'error',
              code: 'capability_volume_out_of_range',
              message: `Step '${stepId}' volume ${volume_uL} uL exceeds pipette max ${pipetteMaxVolume} uL`,
              pass_id: 'capability_check',
              details: { stepId, volume_uL, pipetteMaxVolume },
            });
          } else if (volume_uL < pipetteMinVolume) {
            violations.push({
              severity: 'error',
              code: 'capability_volume_out_of_range',
              message: `Step '${stepId}' volume ${volume_uL} uL is below pipette min ${pipetteMinVolume} uL`,
              pass_id: 'capability_check',
              details: { stepId, volume_uL, pipetteMinVolume },
            });
          }
        }

        // --- Policy check (v1: default allows all) ---
        const policyProfileData = policyProfile?.policyProfile as Record<string, unknown> | undefined;
        if (policyProfileData) {
          const allowAll = policyProfileData['allowAll'] as boolean | undefined;
          if (allowAll === false) {
            // Policy explicitly blocks — check if this step's verb is blocked
            const stepKind = step['kind'] as string | undefined;
            const blockedVerbs = policyProfileData['blockedVerbs'] as string[] | undefined;
            if (blockedVerbs && stepKind && blockedVerbs.includes(stepKind)) {
              violations.push({
                severity: 'error',
                code: 'capability_policy_blocked',
                message: `Policy blocks verb '${stepKind}' for step '${stepId}'`,
                pass_id: 'capability_check',
                details: { stepId, verb: stepKind },
              });
            }
          }
        }

        capabilityChecks.push({
          stepId,
          ok: violations.length === 0,
          violations,
        });

        // Accumulate diagnostics
        diagnostics.push(...violations);
      }

      return {
        ok: true,
        output: { capabilityChecks } satisfies CapabilityCheckOutput,
        diagnostics,
      };
    },
  };
}

/**
 * Check if a labware definition is compatible with the expected kind.
 * For v1, this is a simple substring / type-name match.
 */
function checkLabwareShapeCompatibility(
  labwareId: string,
  expectedKind: string,
): boolean {
  // Normalize both to lowercase for comparison
  const normalizedLabware = labwareId.toLowerCase();
  const normalizedKind = expectedKind.toLowerCase();

  // Direct match
  if (normalizedLabware.includes(normalizedKind)) return true;

  // Check common aliases
  const aliases: Record<string, string[]> = {
    '96-well-plate': ['96-well', 'plate_96', '96well'],
    '384-well-plate': ['384-well', 'plate_384', '384well'],
    '96-well-deepwell-plate': ['deepwell', 'deep_well', '96-well-deepwell'],
    '12-well-reservoir': ['reservoir', '12-well', '12well'],
  };

  for (const [kind, aliasList] of Object.entries(aliases)) {
    if (normalizedKind.includes(kind) || kind.includes(normalizedKind)) {
      for (const alias of aliasList) {
        if (normalizedLabware.includes(alias)) return true;
      }
    }
  }

  return false;
}

/**
 * Get the maximum pipette volume from material resolutions.
 * Default: 1000 uL.
 */
function getPipetteMaxVolume(
  materialResolutions: Record<string, unknown>,
): number {
  // Check for pipette-related material resolutions
  for (const [_roleId, material] of Object.entries(materialResolutions)) {
    const m = material as Record<string, unknown>;
    const pipetteMax = m['pipetteMaxVolume_uL'] as number | undefined;
    if (typeof pipetteMax === 'number' && pipetteMax > 0) return pipetteMax;
  }
  return 1000; // Default pipette max
}

/**
 * Get the minimum pipette volume from material resolutions.
 * Default: 0.5 uL.
 */
function getPipetteMinVolume(
  materialResolutions: Record<string, unknown>,
): number {
  for (const [_roleId, material] of Object.entries(materialResolutions)) {
    const m = material as Record<string, unknown>;
    const pipetteMin = m['pipetteMinVolume_uL'] as number | undefined;
    if (typeof pipetteMin === 'number' && pipetteMin > 0) return pipetteMin;
  }
  return 0.5; // Default pipette min
}

// ---------------------------------------------------------------------------
// Derive-per-step-context pass
// ---------------------------------------------------------------------------

/**
 * Shape of a per-sample context entry.
 */
export interface SampleContextEntry {
  wellId: string;
  sampleIndex: number;
  sourceWell?: string;
  destWell?: string;
  volume_uL?: number;
}

/**
 * Shape of a per-step context entry.
 */
export interface PerStepContext {
  stepId: string;
  sampleContexts: SampleContextEntry[];
}

/**
 * Output shape of the derive_per_step_context pass.
 */
export interface DerivePerStepContextOutput {
  perStepContexts: PerStepContext[];
}

/**
 * createDerivePerStepContextPass — precomputes the context entering each step
 * so downstream passes (e.g., events_emit) can reference well-by-well details.
 */
export function createDerivePerStepContextPass(): Pass {
  return {
    id: 'derive_per_step_context',
    family: 'derive_context',
    async run(args: PassRunArgs): Promise<PassResult> {
      // 1. Read upstream outputs
      const local = args.state.outputs.get('resolve_local_protocol') as
        | { expandedProtocol: Record<string, unknown> }
        | undefined;
      if (!local) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_resolve_local_protocol',
              message:
                'derive_per_step_context requires upstream resolve_local_protocol output',
              pass_id: 'derive_per_step_context',
            },
          ],
        };
      }

      const expandedProtocol = local.expandedProtocol;
      const steps = expandedProtocol['steps'] as
        | Array<Record<string, unknown>>
        | undefined;
      if (!Array.isArray(steps)) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_steps',
              message: 'expandedProtocol has no steps array',
              pass_id: 'derive_per_step_context',
            },
          ],
        };
      }

      // 2. Read resolved labware bindings for source/dest refs
      const labwareBindings = args.state.outputs.get('resolve_labware_bindings') as
        | { labwareResolutions: Record<string, unknown> }
        | undefined;
      const labwareResolutions = labwareBindings?.labwareResolutions ?? {};

      // 3. Read resolved material bindings for sample info
      const materialBindings = args.state.outputs.get('resolve_material_bindings') as
        | { materialResolutions: Record<string, unknown> }
        | undefined;
      const materialResolutions = materialBindings?.materialResolutions ?? {};

      // 4. Read lab context
      const sampleCount = (expandedProtocol['resolvedSampleCount'] as number) ?? 0;
      const labwareKind = (expandedProtocol['resolvedLabwareKind'] as string) ?? '96-well-plate';

      // 5. Derive per-step contexts
      const perStepContexts: PerStepContext[] = [];

      for (const step of steps) {
        const stepId = (step['stepId'] as string) ?? 'unknown';
        const stepKind = (step['kind'] as string) ?? 'unknown';
        const volume_uL = (step['volume_uL'] as number) | undefined;

        // Determine which labware role this step targets
        const target = step['target'] as
          | { labwareRole?: string }
          | undefined;
        const labwareRole = target?.labwareRole as string | undefined;
        const destLabwareRef = labwareRole ? labwareResolutions[labwareRole] : undefined;

        // For transfer steps, also look for source labware
        let sourceLabwareRef: unknown;
        if (stepKind === 'transfer') {
          const sourceTarget = step['source'] as
            | { labwareRole?: string }
            | undefined;
          const sourceRole = sourceTarget?.labwareRole as string | undefined;
          if (sourceRole && labwareResolutions[sourceRole]) {
            sourceLabwareRef = labwareResolutions[sourceRole];
          } else {
            // Default: source is the same as dest
            sourceLabwareRef = destLabwareRef;
          }
        }

        // Generate sample contexts based on step kind
        const sampleContexts = deriveSampleContextsForStep(
          stepKind,
          stepId,
          sampleCount,
          labwareKind,
          volume_uL,
          sourceLabwareRef as Record<string, unknown> | undefined,
          destLabwareRef as Record<string, unknown> | undefined,
        );

        perStepContexts.push({
          stepId,
          sampleContexts,
        });
      }

      return {
        ok: true,
        output: { perStepContexts } satisfies DerivePerStepContextOutput,
      };
    },
  };
}

/**
 * Generate sample context entries for a single step.
 * Uses column-major ordering: A1, B1, C1, ..., H1, A2, ..., H12.
 */
function deriveSampleContextsForStep(
  stepKind: string,
  stepId: string,
  sampleCount: number,
  labwareKind: string,
  volume_uL: number | undefined,
  sourceLabware: Record<string, unknown> | undefined,
  destLabware: Record<string, unknown> | undefined,
): SampleContextEntry[] {
  if (sampleCount <= 0) return [];

  // Generate well IDs in column-major order for the given labware kind
  const wellIds = generateWellIds(labwareKind, sampleCount);

  const sampleContexts: SampleContextEntry[] = [];

  for (let i = 0; i < sampleCount && i < wellIds.length; i++) {
    const sampleContext: SampleContextEntry = {
      wellId: wellIds[i],
      sampleIndex: i + 1,
      volume_uL,
    };

    // For transfer steps, include source/dest well info
    if (stepKind === 'transfer') {
      sampleContext.sourceWell = wellIds[i];
      sampleContext.destWell = wellIds[i];
    }

    sampleContexts.push(sampleContext);
  }

  return sampleContexts;
}

/**
 * Generate well IDs in column-major order (A1, B1, C1, ..., H1, A2, ..., H12).
 */
function generateWellIds(labwareKind: string, count: number): string[] {
  // Determine grid dimensions based on labware kind
  let rows = 8;
  let cols = 12;

  const kindLower = labwareKind.toLowerCase();
  if (kindLower.includes('384')) {
    rows = 16;
    cols = 24;
  } else if (kindLower.includes('96')) {
    rows = 8;
    cols = 12;
  } else if (kindLower.includes('24')) {
    rows = 4;
    cols = 6;
  } else if (kindLower.includes('12')) {
    rows = 3;
    cols = 4;
  }

  const wellIds: string[] = [];
  const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  for (let col = 0; col < cols && wellIds.length < count; col++) {
    for (let row = 0; row < rows && wellIds.length < count; row++) {
      wellIds.push(`${rowLabels[row]}${col + 1}`);
    }
  }

  return wellIds;
}

// ---------------------------------------------------------------------------
// Project-run-plan-result pass
// ---------------------------------------------------------------------------

/**
 * Status of a compiled run-plan.
 */
export type RunPlanCompileStatus = 'ready' | 'partial' | 'blocked';

/**
 * Shape of the final RunPlanCompileResult.
 */
export interface RunPlanCompileResult {
  status: RunPlanCompileStatus;
  diagnostics: PassDiagnostic[];
  perStepContexts: PerStepContext[];
  bindings: {
    materialResolutions: Record<string, unknown>;
    labwareResolutions: Record<string, unknown>;
  };
}

/**
 * Output shape of the project_result pass.
 */
export interface ProjectRunPlanResultOutput {
  runPlanCompileResult: RunPlanCompileResult;
}

/**
 * createProjectRunPlanResultPass — assembles the final RunPlanCompileResult
 * from all upstream pass outputs.
 */
export function createProjectRunPlanResultPass(): Pass {
  return {
    id: 'project_result',
    family: 'project',
    async run(args: PassRunArgs): Promise<PassResult> {
      // 1. Read capability_check output
      const capabilityCheckOutput = args.state.outputs.get('capability_check') as
        | CapabilityCheckOutput
        | undefined;

      // 2. Read derive_per_step_context output
      const deriveContextOutput = args.state.outputs.get('derive_per_step_context') as
        | DerivePerStepContextOutput
        | undefined;

      // 3. Read binding outputs
      const materialBindings = args.state.outputs.get('resolve_material_bindings') as
        | { materialResolutions: Record<string, unknown>; unboundMaterialRoles: string[] }
        | undefined;
      const labwareBindings = args.state.outputs.get('resolve_labware_bindings') as
        | { labwareResolutions: Record<string, unknown>; unboundLabwareRoles: string[] }
        | undefined;

      // 4. Collect all diagnostics
      const allDiagnostics: PassDiagnostic[] = [];

      // From capability_check
      if (capabilityCheckOutput?.capabilityChecks) {
        for (const check of capabilityCheckOutput.capabilityChecks) {
          allDiagnostics.push(...check.violations);
        }
      }

      // From binding passes (unbound roles)
      if (materialBindings?.unboundMaterialRoles) {
        for (const roleId of materialBindings.unboundMaterialRoles) {
          allDiagnostics.push({
            severity: 'error',
            code: 'unbound_material_role',
            message: `material role '${roleId}' has no binding`,
            pass_id: 'resolve_material_bindings',
            details: { roleId },
          });
        }
      }
      if (labwareBindings?.unboundLabwareRoles) {
        for (const roleId of labwareBindings.unboundLabwareRoles) {
          allDiagnostics.push({
            severity: 'error',
            code: 'unbound_labware_role',
            message: `labware role '${roleId}' has no binding`,
            pass_id: 'resolve_labware_bindings',
            details: { roleId },
          });
        }
      }

      // 5. Deduplicate diagnostics by (code, stepId)
      const dedupedDiagnostics = deduplicateDiagnostics(allDiagnostics);

      // 6. Determine status
      const capabilityErrorCount = dedupedDiagnostics.filter(
        (d) => d.code.startsWith('capability_'),
      ).length;
      const unboundCount = dedupedDiagnostics.filter(
        (d) => d.code === 'unbound_material_role' || d.code === 'unbound_labware_role',
      ).length;

      let status: RunPlanCompileStatus;
      if (capabilityErrorCount > 0) {
        status = 'blocked';
      } else if (unboundCount > 0) {
        status = 'partial';
      } else {
        status = 'ready';
      }

      // 7. Assemble perStepContexts
      const perStepContexts = deriveContextOutput?.perStepContexts ?? [];

      // 8. Snapshot bindings
      const bindings = {
        materialResolutions: materialBindings?.materialResolutions ?? {},
        labwareResolutions: labwareBindings?.labwareResolutions ?? {},
      };

      return {
        ok: true,
        output: {
          runPlanCompileResult: {
            status,
            diagnostics: dedupedDiagnostics,
            perStepContexts,
            bindings,
          },
        } satisfies ProjectRunPlanResultOutput,
      };
    },
  };
}

/**
 * Deduplicate diagnostics by (code, stepId).
 * Keeps the first occurrence of each unique (code, stepId) pair.
 */
function deduplicateDiagnostics(diagnostics: PassDiagnostic[]): PassDiagnostic[] {
  const seen = new Set<string>();
  const result: PassDiagnostic[] = [];

  for (const diag of diagnostics) {
    const stepId = (diag.details as Record<string, unknown>)?.stepId as
      | string
      | undefined;
    const key = stepId ? `${diag.code}:${stepId}` : diag.code;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(diag);
    }
  }

  return result;
}

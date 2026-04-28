/**
 * PlannedRunEventsEmitPass — Terminal pass for the run-plan-compile pipeline.
 *
 * Reads the RunPlanCompileResult from pipeline state and produces an
 * event-graph payload with one event per (step × sample) combination.
 * Every emitted event carries a stable semanticKey computed via SemanticKeyBuilder,
 * AND concrete labware-instance refs with preserved role strings for downstream
 * labware_role derivation.
 *
 * Pipeline position: after project_result (family: project)
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { RecordStore } from '../../../store/types.js';
import type { VerbDefinitionLite } from '../../../protocol/SemanticKeyBuilder.js';
import { buildSemanticKey } from '../../../protocol/SemanticKeyBuilder.js';
import type { Derivation } from '../../../protocol/derivations/types.js';
import { derivations } from '../../../protocol/derivations/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreatePlannedRunEventsEmitPassDeps {
  recordStore: RecordStore;
  buildSemanticKey?: typeof buildSemanticKey;
  derivations?: Record<string, Derivation>;
  loadVerbDefinition: (canonical: string) => Promise<VerbDefinitionLite | null>;
  recordIdPrefix?: string; // default 'EVG-PLR-'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RECORD_ID_PREFIX = 'EVG-PLR-';
const EVENT_GRAPH_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a step kind to its verb canonical name.
 */
function stepKindToVerbCanonical(kind: string): string {
  return kind;
}

/**
 * Resolve logical inputs from a step's actual fields to the input names
 * declared on the verb's semanticInputs.
 */
function resolveStepInputs(
  step: Record<string, unknown>,
): Record<string, unknown> {
  const kind = step.kind as string;
  const inputs: Record<string, unknown> = {};

  switch (kind) {
    case 'transfer':
      inputs.source = step.source;
      inputs.target = step.target;
      if (step.formulation) inputs.formulation = step.formulation;
      break;

    case 'add_material':
      inputs.target = step.target;
      if (step.material) inputs.material = step.material;
      if (step.formulation) inputs.formulation = step.formulation;
      break;

    case 'mix':
      inputs.target = step.target;
      if (step.duration_min) inputs.duration_min = step.duration_min;
      break;

    case 'incubate':
      inputs.target = step.target;
      if (step.duration_min) inputs.duration_min = step.duration_min;
      if (step.temperature_c) inputs.temperature_c = step.temperature_c;
      break;

    case 'wash':
      inputs.target = step.target;
      if (step.wash_solution) inputs.wash_solution = step.wash_solution;
      break;

    case 'read':
      inputs.target = step.target;
      if (step.modality) inputs.modality = step.modality;
      break;

    case 'image':
      inputs.target = step.target;
      if (step.modality) inputs.modality = step.modality;
      break;

    case 'centrifuge':
      inputs.target = step.target;
      if (step.rpm) inputs.rpm = step.rpm;
      if (step.duration_min) inputs.duration_min = step.duration_min;
      break;

    default:
      break;
  }

  return inputs;
}

/**
 * Build resolved inputs for a bound step, preserving role strings.
 *
 * The key trick: when binding resolves `target: 'plate'` to
 * `{ labwareInstanceId: 'LBI-X', role: 'plate' }`, we keep the role
 * string so labware_role derivation can still extract it.
 *
 * Returns an object where each key maps to either:
 * - A resolved object: { labwareInstanceId: 'LBI-X', role: 'plate' }
 * - A string: the role name (for unbound roles)
 */
function buildResolvedInputsForBoundStep(
  step: Record<string, unknown>,
  bindings: {
    materialResolutions: Record<string, unknown>;
    labwareResolutions: Record<string, unknown>;
  },
): Record<string, unknown> {
  const rawInputs = resolveStepInputs(step);
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawInputs)) {
    if (value === undefined || value === null) {
      resolved[key] = value;
      continue;
    }

    // If it's already an object, preserve it and add role if absent
    if (typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      resolved[key] = { ...obj };
      // If no role field yet, try to infer from the object's content
      if (!resolved[key].role && obj.labwareRole) {
        (resolved[key] as Record<string, unknown>).role = obj.labwareRole;
      }
      continue;
    }

    // If it's a string, check if it's a role name that has a binding
    if (typeof value === 'string') {
      const labwareRes = bindings.labwareResolutions[value];
      if (labwareRes && typeof labwareRes === 'object') {
        resolved[key] = {
          labwareInstanceId: (labwareRes as Record<string, unknown>).recordId ?? (labwareRes as Record<string, unknown>).id ?? value,
          role: value,
        };
        continue;
      }

      const materialRes = bindings.materialResolutions[value];
      if (materialRes && typeof materialRes === 'object') {
        resolved[key] = {
          materialInstanceRef: (materialRes as Record<string, unknown>).recordId ?? (materialRes as Record<string, unknown>).id ?? value,
          role: value,
        };
        continue;
      }

      // No binding found — keep the string (role name) as-is
      resolved[key] = value;
      continue;
    }

    resolved[key] = value;
  }

  return resolved;
}

/**
 * Build semantic-key inputs from a step and bindings.
 *
 * For semanticKey computation, we need string inputs (for passthrough derivation).
 * This function resolves role names to their string role values, preserving
 * the identity tuple that spec-024 uses.
 */
function buildSemanticKeyInputs(
  step: Record<string, unknown>,
  bindings: {
    materialResolutions: Record<string, unknown>;
    labwareResolutions: Record<string, unknown>;
  },
): Record<string, unknown> {
  const rawInputs = resolveStepInputs(step);
  const semanticInputs: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawInputs)) {
    if (value === undefined || value === null) {
      semanticInputs[key] = value;
      continue;
    }

    // If it's already an object, extract the role string for identity
    if (typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      // Use role, roleId, or labwareRole as the identity value
      const roleValue = obj.role ?? obj.roleId ?? obj.labwareRole ?? null;
      semanticInputs[key] = typeof roleValue === 'string' ? roleValue : value;
      continue;
    }

    // If it's a string, check if it's a role name that has a binding
    if (typeof value === 'string') {
      const labwareRes = bindings.labwareResolutions[value];
      if (labwareRes && typeof labwareRes === 'object') {
        // Use the role string for identity (not the resolved object)
        semanticInputs[key] = value;
        continue;
      }

      const materialRes = bindings.materialResolutions[value];
      if (materialRes && typeof materialRes === 'object') {
        semanticInputs[key] = value;
        continue;
      }

      // No binding — keep the string as-is
      semanticInputs[key] = value;
      continue;
    }

    semanticInputs[key] = value;
  }

  return semanticInputs;
}

/**
 * Compute a stable identity-tuple key for ordinal grouping.
 */
function computeIdentityTupleKey(
  verbDef: VerbDefinitionLite,
  resolvedInputs: Record<string, unknown>,
  derivationsMap: Record<string, Derivation>,
): string {
  const result = buildSemanticKey({
    verb: verbDef,
    resolvedInputs,
    phaseId: '__identity__',
    ordinal: 1,
    derivations: derivationsMap,
  });

  if (!result.ok) {
    return '';
  }

  return JSON.stringify(result.result.semanticKeyComponents.identity);
}

/**
 * Derive labware entries from bindings.
 */
function deriveBoundLabwares(
  bindings: {
    materialResolutions: Record<string, unknown>;
    labwareResolutions: Record<string, unknown>;
  },
): Array<Record<string, unknown>> {
  const labwares: Array<Record<string, unknown>> = [];

  for (const [roleId, resolution] of Object.entries(bindings.labwareResolutions)) {
    const res = resolution as Record<string, unknown>;
    labwares.push({
      labwareId: res.recordId ?? res.id ?? roleId,
      labwareType: res.labwareType ?? res.kind ?? 'plate_96',
      name: res.name ?? roleId,
    });
  }

  return labwares;
}

// ---------------------------------------------------------------------------
// PlannedRunEventsEmitPass
// ---------------------------------------------------------------------------

export function createPlannedRunEventsEmitPass(
  deps: CreatePlannedRunEventsEmitPassDeps,
): Pass {
  const recordIdPrefix = deps.recordIdPrefix ?? DEFAULT_RECORD_ID_PREFIX;
  const buildKey = deps.buildSemanticKey ?? buildSemanticKey;
  const derivationsMap = deps.derivations ?? derivations;

  return {
    id: 'planned_run_events_emit',
    family: 'project',

    async run(args: PassRunArgs): Promise<PassResult> {
      // 1. Read RunPlanCompileResult from pipeline state
      const resultOutput = args.state.outputs.get(
        'project_result',
      ) as { runPlanCompileResult?: Record<string, unknown> } | undefined;

      if (!resultOutput || !resultOutput.runPlanCompileResult) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_project_result',
              message:
                'planned_run_events_emit requires outputs.project_result.runPlanCompileResult',
              pass_id: 'planned_run_events_emit',
            },
          ],
        };
      }

      const runPlanResult = resultOutput.runPlanCompileResult;
      const perStepContexts =
        (runPlanResult.perStepContexts as Array<Record<string, unknown>>) ?? [];
      const bindings =
        (runPlanResult.bindings as {
          materialResolutions: Record<string, unknown>;
          labwareResolutions: Record<string, unknown>;
        }) ?? { materialResolutions: {}, labwareResolutions: {} };

      // 2. Read expanded protocol from resolve_local_protocol output
      const localOutput = args.state.outputs.get(
        'resolve_local_protocol',
      ) as { expandedProtocol?: Record<string, unknown> } | undefined;

      const expandedProtocol = localOutput?.expandedProtocol ?? {};
      const steps =
        (expandedProtocol.steps as Array<Record<string, unknown>>) ?? [];

      // 3. Prepare collectors
      const events: Array<Record<string, unknown>> = [];
      const ordinalTracker = new Map<string, number>();
      const diagnostics: PassDiagnostic[] = [];

      // 4. Process each step context
      for (const stepContext of perStepContexts) {
        const stepId = (stepContext.stepId as string) ?? 'unknown';

        // Find the corresponding step in expanded protocol
        const step = steps.find((s) => (s.stepId as string) === stepId);
        if (!step) {
          diagnostics.push({
            severity: 'warning',
            code: 'missing_step_in_expanded_protocol',
            message: `step '${stepId}' not found in expanded protocol`,
            pass_id: 'planned_run_events_emit',
            details: { stepId },
          });
          continue;
        }

        const stepKind = step.kind as string;
        const phaseId = step.phaseId as string;

        // Resolve verb canonical
        const verbCanonical = stepKindToVerbCanonical(stepKind);

        // Load verb definition
        const verbDef = await deps.loadVerbDefinition(verbCanonical);
        if (!verbDef) {
          diagnostics.push({
            severity: 'warning',
            code: 'missing_verb_definition',
            message: `no verb-definition found for kind '${stepKind}'`,
            pass_id: 'planned_run_events_emit',
            details: { stepId, kind: stepKind },
          });
          continue;
        }

        // Build resolved inputs for event payload (with labwareInstanceId + role)
        const resolvedInputs = buildResolvedInputsForBoundStep(step, bindings);

        // Build semantic-key inputs (string role values for identity computation)
        const semanticKeyInputs = buildSemanticKeyInputs(step, bindings);

        // Check for unbound roles and emit warnings
        const rawInputs = resolveStepInputs(step);
        for (const [key, value] of Object.entries(rawInputs)) {
          if (typeof value === 'string') {
            const hasLabwareBinding = bindings.labwareResolutions[value];
            const hasMaterialBinding = bindings.materialResolutions[value];
            if (!hasLabwareBinding && !hasMaterialBinding) {
              diagnostics.push({
                severity: 'warning',
                code: 'unbound_role',
                message: `role '${value}' referenced by step '${stepId}' input '${key}' has no binding`,
                pass_id: 'planned_run_events_emit',
                details: { stepId, role: value, inputKey: key },
              });
            }
          }
        }

        // Compute identity tuple key for ordinal tracking
        const identityTupleKey = computeIdentityTupleKey(
          verbDef,
          semanticKeyInputs,
          derivationsMap,
        );
        const ordinalKey = `${phaseId}|${verbCanonical}|${identityTupleKey}`;
        const currentOrdinal = (ordinalTracker.get(ordinalKey) ?? 0) + 1;
        ordinalTracker.set(ordinalKey, currentOrdinal);

        // 5. Emit one event per sample context
        const sampleContexts =
          (stepContext.sampleContexts as Array<Record<string, unknown>>) ?? [];

        for (const sampleContext of sampleContexts) {
          // Build semantic key using string role values (same as spec-024)
          const keyResult = buildKey({
            verb: verbDef,
            resolvedInputs: semanticKeyInputs,
            phaseId,
            ordinal: currentOrdinal,
            derivations: derivationsMap,
          });

          // Build the event with concrete bindings
          const event: Record<string, unknown> = {
            kind: stepKind,
            stepId,
            sampleIndex: (sampleContext.sampleIndex as number) ?? 0,
            wellId: (sampleContext.wellId as string) ?? undefined,
            // Preserve step parameters
            volume_uL:
              (sampleContext.volume_uL as number) ??
              (step.volume_uL as number) ??
              undefined,
          };

          // Add concrete binding refs with role preservation
          // For transfer steps: source and target
          if (stepKind === 'transfer') {
            const rawSource = step.source;
            const rawTarget = step.target;

            // Source
            if (rawSource !== undefined) {
              const resolvedSource = resolvedInputs.source;
              if (resolvedSource && typeof resolvedSource === 'object') {
                event.source = resolvedSource as Record<string, unknown>;
              } else {
                event.source = { role: rawSource as string };
              }
            }

            // Target
            if (rawTarget !== undefined) {
              const resolvedTarget = resolvedInputs.target;
              if (resolvedTarget && typeof resolvedTarget === 'object') {
                event.target = resolvedTarget as Record<string, unknown>;
              } else {
                event.target = { role: rawTarget as string };
              }
            }
          }

          // For add_material steps: target and material
          if (stepKind === 'add_material') {
            const rawTarget = step.target;
            const rawMaterial = step.material;

            // Target
            if (rawTarget !== undefined) {
              const resolvedTarget = resolvedInputs.target;
              if (resolvedTarget && typeof resolvedTarget === 'object') {
                event.target = resolvedTarget as Record<string, unknown>;
              } else {
                event.target = { role: rawTarget as string };
              }
            }

            // Material
            if (rawMaterial !== undefined) {
              const resolvedMaterial = resolvedInputs.material;
              if (resolvedMaterial && typeof resolvedMaterial === 'object') {
                event.material = resolvedMaterial as Record<string, unknown>;
              } else {
                event.material = { role: rawMaterial as string };
              }
            }
          }

          // For other step types: just target
          if (
            stepKind !== 'transfer' &&
            stepKind !== 'add_material'
          ) {
            const rawTarget = step.target;
            if (rawTarget !== undefined) {
              const resolvedTarget = resolvedInputs.target;
              if (resolvedTarget && typeof resolvedTarget === 'object') {
                event.target = resolvedTarget as Record<string, unknown>;
              } else {
                event.target = { role: rawTarget as string };
              }
            }
          }

          // Add semantic key if computed successfully
          if (keyResult.ok) {
            event.semanticKey = keyResult.result.semanticKey;
            event.semanticKeyComponents = keyResult.result.semanticKeyComponents;
          } else {
            diagnostics.push({
              severity: 'warning',
              code: 'semantic_key_build_failed',
              message: `semantic-key build failed for step ${stepId}: ${keyResult.reason}`,
              pass_id: 'planned_run_events_emit',
              details: { stepId, reason: keyResult.reason },
            });
          }

          events.push(event);
        }
      }

      // 6. Build event-graph envelope
      const recordId = `${recordIdPrefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

      const eventGraphEnvelope = {
        recordId,
        schemaId: EVENT_GRAPH_SCHEMA_ID,
        payload: {
          kind: 'event-graph',
          id: recordId,
          events,
          labwares: deriveBoundLabwares(bindings),
        },
      };

      // 7. Persist via record store
      await deps.recordStore.create({
        envelope: eventGraphEnvelope,
        message: 'planned_run_events_emit event-graph',
      });

      // 8. Return result
      return {
        ok: true,
        output: {
          eventGraphRef: recordId,
          eventCount: events.length,
        },
        diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
      };
    },
  };
}

/**
 * EventsEmitPass — Terminal pass for the Protocol IDE projection pipeline.
 *
 * Reads the expanded local-protocol from pipeline state and produces an
 * event-graph payload with one event per (step × sample × plate) combination.
 * Every emitted event carries a stable semanticKey computed via SemanticKeyBuilder.
 *
 * Pipeline position: after project_local_expanded_protocol (family: project)
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

export interface CreateEventsEmitPassDeps {
  recordStore: RecordStore;
  buildSemanticKey?: typeof buildSemanticKey;
  derivations?: Record<string, Derivation>;
  loadVerbDefinition: (canonical: string) => Promise<VerbDefinitionLite | null>;
  recordIdPrefix?: string; // default 'EVG-'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RECORD_ID_PREFIX = 'EVG-';
const EVENT_GRAPH_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a step kind to its verb canonical name.
 * v1: trivial passthrough — most step kinds match verb canonicals directly.
 */
function stepKindToVerbCanonical(kind: string): string {
  return kind;
}

/**
 * Resolve logical inputs from a step's actual fields to the input names
 * declared on the verb's semanticInputs.
 *
 * v1: small per-event-type lookup table for the most common cases.
 * For unmapped types, return empty inputs (semantic key falls back to
 * verb+phase+ordinal only).
 */
function resolveStepInputs(
  step: Record<string, unknown>,
  _expanded: Record<string, unknown>,
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

    // Unmapped types — return empty inputs
    default:
      break;
  }

  return inputs;
}

/**
 * Compute a stable identity-tuple key for ordinal grouping.
 * Uses buildSemanticKey internally and extracts the identity component.
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
 * Derive labware entries from the expanded protocol.
 * v1: one entry per plate.
 */
function deriveLabwares(
  expanded: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const labwareKind = (expanded.resolvedLabwareKind as string) ?? 'plate_96';
  const plateCount = (expanded.resolvedPlateCount as number) ?? 1;
  const labwares: Array<Record<string, unknown>> = [];

  for (let i = 0; i < plateCount; i++) {
    labwares.push({
      labwareId: `plate-${i + 1}`,
      labwareType: labwareKind,
      name: `Plate ${i + 1}`,
    });
  }

  return labwares;
}

// ---------------------------------------------------------------------------
// EventsEmitPass
// ---------------------------------------------------------------------------

export function createEventsEmitPass(deps: CreateEventsEmitPassDeps): Pass {
  const recordIdPrefix = deps.recordIdPrefix ?? DEFAULT_RECORD_ID_PREFIX;
  const buildKey = deps.buildSemanticKey ?? buildSemanticKey;
  const derivationsMap = deps.derivations ?? derivations;

  return {
    id: 'events_emit',
    family: 'project',

    async run(args: PassRunArgs): Promise<PassResult> {
      // 1. Read expanded protocol from pipeline state
      const expandedOutput = args.state.outputs.get(
        'project_local_expanded_protocol',
      ) as { expandedProtocol?: Record<string, unknown> } | undefined;

      if (!expandedOutput || !expandedOutput.expandedProtocol) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'missing_expanded_protocol',
              message:
                'events_emit requires outputs.project_local_expanded_protocol.expandedProtocol',
              pass_id: 'events_emit',
            },
          ],
        };
      }

      const expanded = expandedOutput.expandedProtocol;
      const steps = (expanded.steps as Array<Record<string, unknown>>) ?? [];
      const phases = (expanded.phases as Array<Record<string, unknown>>) ?? [];
      const sampleCount =
        (expanded.resolvedSampleCount as number) ?? 1;
      const plateCount =
        (expanded.resolvedPlateCount as number) ?? 1;

      // 2. Prepare collectors
      const events: Array<Record<string, unknown>> = [];
      const ordinalTracker = new Map<string, number>();
      const diagnostics: PassDiagnostic[] = [];

      // 3a. Pre-compute ordinals per step (ordinal is per-(phaseId, verb, identity), not per-plate)
      const stepOrdinals = new Map<string, number>(); // stepId → ordinal
      for (const step of steps) {
        const stepKind = step.kind as string;
        const stepId = step.stepId as string;
        const phaseId = step.phaseId as string;
        const verbCanonical = stepKindToVerbCanonical(stepKind);
        const verbDef = await deps.loadVerbDefinition(verbCanonical);
        if (!verbDef) continue;

        const resolvedInputs = resolveStepInputs(step, expanded);
        const identityTupleKey = computeIdentityTupleKey(
          verbDef,
          resolvedInputs,
          derivationsMap,
        );
        const ordinalKey = `${phaseId}|${verbCanonical}|${identityTupleKey}`;
        const currentOrdinal = (ordinalTracker.get(ordinalKey) ?? 0) + 1;
        ordinalTracker.set(ordinalKey, currentOrdinal);
        stepOrdinals.set(stepId, currentOrdinal);
      }

      // 3b. Iterate plates → steps → samples, using pre-computed ordinals
      for (let plateIndex = 0; plateIndex < plateCount; plateIndex++) {
        for (const step of steps) {
          const stepKind = step.kind as string;
          const stepId = step.stepId as string;
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
              pass_id: 'events_emit',
              details: { stepId, kind: stepKind },
            });
            // Emit event without semanticKey so downstream UI doesn't lose the step
            events.push({
              kind: stepKind,
              stepId,
              sampleIndex: 0,
              plateIndex,
              phaseId,
              ...(step as Record<string, unknown>),
            });
            continue;
          }

          // Resolve logical inputs from step shape
          const resolvedInputs = resolveStepInputs(step, expanded);

          // Use pre-computed ordinal for this step
          const currentOrdinal = stepOrdinals.get(stepId) ?? 1;

          // Build semantic key
          const keyResult = buildKey({
            verb: verbDef,
            resolvedInputs,
            phaseId,
            ordinal: currentOrdinal,
            derivations: derivationsMap,
          });

          // 4. Emit one event per sample (sample is parameter, not identity)
          for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
            if (!keyResult.ok) {
              diagnostics.push({
                severity: 'warning',
                code: 'semantic_key_build_failed',
                message: `semantic-key build failed for step ${stepId}: ${keyResult.reason}`,
                pass_id: 'events_emit',
                details: { stepId, reason: keyResult.reason },
              });
              // Emit event without semanticKey
              events.push({
                kind: stepKind,
                stepId,
                sampleIndex,
                plateIndex,
                phaseId,
                ...(step as Record<string, unknown>),
              });
              continue;
            }

            events.push({
              kind: stepKind,
              stepId,
              sampleIndex,
              plateIndex,
              phaseId,
              semanticKey: keyResult.result.semanticKey,
              semanticKeyComponents: keyResult.result.semanticKeyComponents,
              ...(step as Record<string, unknown>),
            });
          }
        }
      }

      // 5. Build event-graph envelope
      const recordId = `${recordIdPrefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

      const eventGraphEnvelope = {
        recordId,
        schemaId: EVENT_GRAPH_SCHEMA_ID,
        payload: {
          kind: 'event-graph',
          id: recordId,
          events,
          labwares: deriveLabwares(expanded),
        },
      };

      // 6. Persist via record store
      await deps.recordStore.create({
        envelope: eventGraphEnvelope,
        message: 'events_emit event-graph',
      });

      // 7. Return result
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

import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { Pass, PassDiagnostic, PassResult } from '../pipeline/types.js';
import type {
  LabwareOrientation,
  ProtocolIntent,
  ProtocolLabwareInstanceIntent,
  ProtocolMaterialAliquotIntent,
  ProtocolMaterialDefinitionIntent,
  ProtocolOperationIntent,
} from './ProtocolIntent.js';
import type { ProtocolIntentStatePlan } from './ProtocolIntentStatePlanner.js';
import type { ProtocolIntentValidationOutput } from './ProtocolIntentValidation.js';

export interface ProtocolIntentLoweredCandidateLabware {
  hint: string;
  reason?: string;
  deckSlot?: string;
}

export interface ProtocolIntentLoweredDirective {
  kind: 'reorient_labware' | 'mount_pipette' | 'swap_pipette';
  params: Record<string, unknown>;
}

export interface ProtocolIntentLoweringOutput {
  events: PlateEventPrimitive[];
  candidateLabwares: ProtocolIntentLoweredCandidateLabware[];
  directives: ProtocolIntentLoweredDirective[];
}

function compact<T>(record: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function stringParam(params: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function normalizeOrientation(value: unknown): Exclude<LabwareOrientation, 'unknown'> | undefined {
  return value === 'landscape' || value === 'portrait' ? value : undefined;
}

function eventId(op: ProtocolOperationIntent, suffix: string, index = 0): string {
  return `evt-protocol-intent-${op.id}-${suffix}-${index}`;
}

function materialKind(
  materialId: string | undefined,
  materialDefinitions: ProtocolMaterialDefinitionIntent[],
): string | undefined {
  if (!materialId) return undefined;
  return materialDefinitions.find((material) => material.id === materialId)?.kind;
}

function loadMaterialEvents(
  op: ProtocolOperationIntent,
  intent: ProtocolIntent,
): PlateEventPrimitive[] {
  const labwareInstanceId = op.labware ?? op.targetLabware;
  const wells = op.targetWells ?? (op.sourceWell ? [op.sourceWell] : []);
  const materialId = op.materialRef ?? op.formulation;
  if (!labwareInstanceId || wells.length === 0 || !materialId) return [];

  return wells.map((well, index) => ({
    eventId: eventId(op, 'load-material', index),
    event_type: 'add_material',
    labwareId: labwareInstanceId,
    details: compact<Record<string, unknown>>({
      labwareInstanceId,
      well,
      materialRef: op.materialRef,
      formulation: op.formulation,
      material: compact<Record<string, unknown>>({
        materialId,
        kind: materialKind(op.materialRef, intent.resources.materialDefinitions),
        volumeUl: op.volumeUl,
      }),
      volumeUl: op.volumeUl,
      protocolIntentOperationId: op.id,
      protocolIntentOperationKind: op.kind,
      stepId: op.stepId,
    }),
  }));
}

function aliquotLoadEvents(
  aliquot: ProtocolMaterialAliquotIntent,
  intent: ProtocolIntent,
): PlateEventPrimitive[] {
  const materialId = aliquot.materialRef ?? aliquot.formulation;
  const wells = aliquot.wells ?? (aliquot.well ? [aliquot.well] : []);
  if (!materialId || wells.length === 0) return [];

  return wells.map((well, index) => ({
    eventId: `evt-protocol-intent-${aliquot.id}-aliquot-${index}`,
    event_type: 'add_material',
    labwareId: aliquot.labware,
    details: compact<Record<string, unknown>>({
      labwareInstanceId: aliquot.labware,
      well,
      materialRef: aliquot.materialRef,
      formulation: aliquot.formulation,
      material: compact<Record<string, unknown>>({
        materialId,
        kind: materialKind(aliquot.materialRef, intent.resources.materialDefinitions),
        volumeUl: aliquot.volumeUl,
      }),
      volumeUl: aliquot.volumeUl,
      protocolIntentAliquotId: aliquot.id,
    }),
  }));
}

function transferEvents(op: ProtocolOperationIntent): PlateEventPrimitive[] {
  const sourceLabware = op.sourceLabware ?? stringParam(op.params, ['sourceLabware', 'fromLabware']);
  const targetLabware = op.targetLabware ?? op.labware;
  const sourceWell = op.sourceWell ?? stringParam(op.params, ['sourceWell', 'fromWell']);
  const targetWells = op.targetWells ?? [];
  if (!targetLabware || targetWells.length === 0) return [];

  return targetWells.map((targetWell, index) => ({
    eventId: eventId(op, 'transfer', index),
    event_type: 'transfer',
    labwareId: targetLabware,
    details: compact<Record<string, unknown>>({
      source_labware: sourceLabware,
      destination_labware: targetLabware,
      source_well: sourceWell,
      well: targetWell,
      volumeUl: op.volumeUl,
      volume: op.volumeUl === undefined ? undefined : { value: op.volumeUl, unit: 'uL' },
      source_material_ref: op.materialRef,
      formulation: op.formulation,
      from: sourceLabware && sourceWell
        ? { labwareInstanceId: sourceLabware, well: sourceWell }
        : undefined,
      to: { labwareInstanceId: targetLabware, well: targetWell },
      protocolIntentOperationId: op.id,
      protocolIntentOperationKind: op.kind,
      stepId: op.stepId,
    }),
  }));
}

function mixEvents(op: ProtocolOperationIntent): PlateEventPrimitive[] {
  const labware = op.labware ?? op.targetLabware;
  const wells = op.targetWells ?? (op.sourceWell ? [op.sourceWell] : []);
  if (!labware || wells.length === 0) return [];

  return wells.map((well, index) => ({
    eventId: eventId(op, 'mix', index),
    event_type: 'mix',
    labwareId: labware,
    details: compact<Record<string, unknown>>({
      labware,
      labwareInstanceId: labware,
      well,
      cycles: op.cycles,
      volumeUl: op.volumeUl,
      protocolIntentOperationId: op.id,
      protocolIntentOperationKind: op.kind,
      stepId: op.stepId,
    }),
  }));
}

function incubateEvent(op: ProtocolOperationIntent): PlateEventPrimitive[] {
  const labware = op.labware ?? op.targetLabware;
  if (!labware) return [];

  return [{
    eventId: eventId(op, 'incubate'),
    event_type: 'incubate',
    labwareId: labware,
    details: compact<Record<string, unknown>>({
      labware,
      labwareInstanceId: labware,
      temperatureC: op.temperatureC,
      co2Percent: op.co2Percent,
      durationSeconds: op.durationSeconds,
      protocolIntentOperationId: op.id,
      protocolIntentOperationKind: op.kind,
      stepId: op.stepId,
    }),
  }];
}

function candidateLabware(labware: ProtocolLabwareInstanceIntent): ProtocolIntentLoweredCandidateLabware {
  return compact<ProtocolIntentLoweredCandidateLabware>({
    hint: labware.resolvedRecordId ?? labware.labwareHint,
    reason: labware.role
      ? `ProtocolIntent ${labware.role} labware resource ${labware.id}`
      : `ProtocolIntent labware resource ${labware.id}`,
    deckSlot: labware.deckSlot,
  });
}

export function lowerProtocolIntentLabwareCandidates(intent: ProtocolIntent): ProtocolIntentLoweredCandidateLabware[] {
  const candidates = intent.resources.labwareInstances.map(candidateLabware);
  for (const tips of intent.resources.tips) {
    if (!tips.deckSlot) continue;
    candidates.push(compact<ProtocolIntentLoweredCandidateLabware>({
      hint: tips.label,
      reason: `ProtocolIntent tip resource ${tips.id}`,
      deckSlot: tips.deckSlot,
    }));
  }
  for (const waste of intent.resources.waste) {
    if (!waste.deckSlot) continue;
    candidates.push(compact<ProtocolIntentLoweredCandidateLabware>({
      hint: waste.label,
      reason: `ProtocolIntent waste resource ${waste.id}`,
      deckSlot: waste.deckSlot,
    }));
  }
  return candidates;
}

export function lowerProtocolIntentDirectives(intent: ProtocolIntent): ProtocolIntentLoweredDirective[] {
  const directives: ProtocolIntentLoweredDirective[] = [];

  for (const op of intent.operations) {
    if (op.kind === 'reorient_labware') {
      const labwareInstanceId = op.labware ?? op.targetLabware ?? stringParam(op.params, ['labware', 'labwareInstanceId']);
      const orientation = normalizeOrientation(op.params?.orientation) ?? normalizeOrientation(op.params?.to);
      if (!labwareInstanceId || !orientation) continue;
      directives.push({
        kind: 'reorient_labware',
        params: compact<Record<string, unknown>>({
          labwareInstanceId,
          orientation,
          protocolIntentOperationId: op.id,
        }),
      });
    }

    if (op.kind === 'set_active_pipette') {
      const pipette = intent.resources.pipettes.find((item) => item.id === op.pipette);
      const mountSide = stringParam(op.params, ['mountSide', 'mount']) ?? pipette?.mount;
      const pipetteType = pipette?.label ?? stringParam(op.params, ['pipetteType', 'to']);
      if (!mountSide || !pipetteType) continue;
      directives.push({
        kind: 'mount_pipette',
        params: compact<Record<string, unknown>>({
          mountSide,
          pipetteType,
          protocolIntentOperationId: op.id,
        }),
      });
    }

    if (op.kind === 'swap_pipette') {
      const pipette = intent.resources.pipettes.find((item) => item.id === op.pipette);
      const from = stringParam(op.params, ['from', 'mountSide', 'mount']) ?? pipette?.mount;
      const to = pipette?.label ?? stringParam(op.params, ['to', 'pipetteType']);
      if (!from || !to) continue;
      directives.push({
        kind: 'swap_pipette',
        params: compact<Record<string, unknown>>({
          from,
          to,
          protocolIntentOperationId: op.id,
        }),
      });
    }
  }

  return directives;
}

export function lowerProtocolIntentOperations(intent: ProtocolIntent): PlateEventPrimitive[] {
  const events = intent.resources.materialAliquots.flatMap((aliquot) => aliquotLoadEvents(aliquot, intent));

  for (const op of intent.operations) {
    switch (op.kind) {
      case 'load_material':
        events.push(...loadMaterialEvents(op, intent));
        break;
      case 'transfer':
        events.push(...transferEvents(op));
        break;
      case 'pipette_mix':
        events.push(...mixEvents(op));
        break;
      case 'incubate':
        events.push(...incubateEvent(op));
        break;
      default:
        break;
    }
  }

  return events;
}

export function lowerProtocolIntent(intent: ProtocolIntent): ProtocolIntentLoweringOutput {
  return {
    events: lowerProtocolIntentOperations(intent),
    candidateLabwares: lowerProtocolIntentLabwareCandidates(intent),
    directives: lowerProtocolIntentDirectives(intent),
  };
}

export function createLowerProtocolIntentPass(): Pass {
  return {
    id: 'lower_protocol_intent',
    family: 'expand' as const,
    run({ state }): PassResult {
      const intent = (
        state.outputs.get('ai_precompile') as { protocolIntent?: ProtocolIntent } | undefined
      )?.protocolIntent;
      const plan = (
        state.outputs.get('protocol_intent_state_plan') as
          { protocolIntentStatePlan?: ProtocolIntentStatePlan } | undefined
      )?.protocolIntentStatePlan;
      const validation = (
        state.outputs.get('validate_protocol_intent') as
          { status?: ProtocolIntentValidationOutput['status']; blockers?: ProtocolIntentValidationOutput['blockers'] } | undefined
      );

      if (!intent) {
        return {
          ok: true,
          output: { events: [], candidateLabwares: [], directives: [] } satisfies ProtocolIntentLoweringOutput,
        };
      }

      const diagnostics: PassDiagnostic[] = [];
      const stateBlockers = plan?.blockers ?? [];
      const validationBlockers = validation?.blockers ?? [];
      const blockers = [...stateBlockers, ...validationBlockers];
      const output = blockers.length > 0
        ? {
            events: [],
            candidateLabwares: lowerProtocolIntentLabwareCandidates(intent),
            directives: [],
          } satisfies ProtocolIntentLoweringOutput
        : lowerProtocolIntent(intent);

      for (const blocker of stateBlockers) {
        diagnostics.push({
          severity: 'warning',
          code: 'protocol_intent_state_blocker',
          message: blocker.message,
          pass_id: 'lower_protocol_intent',
          details: compact<Record<string, unknown>>({
            code: blocker.code,
            operationId: blocker.operationId,
            stepId: blocker.stepId,
            ...blocker.details,
          }),
        });
      }
      for (const blocker of validationBlockers) {
        diagnostics.push({
          severity: blocker.severity,
          code: 'protocol_intent_validation_blocker',
          message: blocker.message,
          pass_id: 'lower_protocol_intent',
          details: compact<Record<string, unknown>>({
            code: blocker.code,
            path: blocker.path,
            ...blocker.details,
          }),
        });
      }

      return {
        ok: true,
        output,
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    },
  };
}

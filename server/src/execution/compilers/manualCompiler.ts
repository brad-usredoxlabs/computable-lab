import {
  buildCompatibilityEntry,
  extractTransferOperations,
  hintKeys,
  type CompatibilityReportEntry,
} from '../planning/transferPrograms.js';

type EventGraphEvent = {
  eventId?: string;
  event_type?: string;
  details?: Record<string, unknown>;
};

type EventGraphPayload = {
  events?: EventGraphEvent[];
};

type ExecutionPlanPayload = {
  placements?: {
    labware?: Array<{
      labware_ref?: string;
      slot_id?: string;
      orientation?: 'default' | 'rot90' | 'rot180' | 'rot270';
    }>;
    tipracks?: Array<{
      slot_id?: string;
    }>;
  };
};

export function compileManualPlan(input: {
  robotPlanId: string;
  eventGraph?: EventGraphPayload | null;
  executionPlan?: ExecutionPlanPayload | null;
}): {
  deckSlots: Array<{
    slotId: string;
    labwareRole: string;
    orientation?: 'landscape' | 'portrait';
  }>;
  pipettes: Array<{
    mount: 'left';
    type: 'single';
    model: 'manual_operator';
    tipRackSlots: string[];
  }>;
  executionSteps: Array<{
    stepId: string;
    sourceStepRef: string;
    command: string;
    params: Record<string, unknown>;
  }>;
  notes: string;
  compatibilityReport: CompatibilityReportEntry[];
} {
  const deckSlots = (input.executionPlan?.placements?.labware ?? []).map((assignment) => ({
    slotId: assignment.slot_id ?? 'manual',
    labwareRole: assignment.labware_ref ?? 'labware',
    ...(assignment.orientation === 'rot90' || assignment.orientation === 'rot270'
      ? { orientation: 'portrait' as const }
      : { orientation: 'landscape' as const }),
  }));
  const tipRackSlots = (input.executionPlan?.placements?.tipracks ?? []).map((rack) => rack.slot_id ?? '').filter((slot) => slot.length > 0);
  const events = input.eventGraph?.events ?? [];
  const operationsByEvent = new Map<string, ReturnType<typeof extractTransferOperations>>();
  for (const operation of extractTransferOperations(events)) {
    operationsByEvent.set(operation.sourceStepRef, [...(operationsByEvent.get(operation.sourceStepRef) ?? []), operation]);
  }
  const executionSteps: Array<{
    stepId: string;
    sourceStepRef: string;
    command: string;
    params: Record<string, unknown>;
  }> = [];
  const compatibilityReport: CompatibilityReportEntry[] = [];
  const noteLines: string[] = [];
  let stepIndex = 0;
  const nextStepId = () => `exec-${String(stepIndex += 1).padStart(3, '0')}`;

  for (const event of events) {
    const sourceStepRef = event.eventId ?? `event-${stepIndex + 1}`;
    const operations = operationsByEvent.get(sourceStepRef) ?? [];
    if (operations.length === 0) {
      executionSteps.push({
        stepId: nextStepId(),
        sourceStepRef,
        command: 'move_labware',
        params: { eventType: event.event_type ?? 'other' },
      });
      compatibilityReport.push(buildCompatibilityEntry({
        event,
        honoredHints: [],
        droppedHints: [],
        compatibilityNotes: ['Manual plan: non-transfer semantic step retained as operator instruction.'],
      }));
      noteLines.push(`${sourceStepRef}: ${event.event_type ?? 'other'}`);
      continue;
    }
    const honoredHints = new Set<string>();
    for (const operation of operations) {
      for (const hint of hintKeys(operation.executionHints)) honoredHints.add(hint);
      if (operation.eventType !== 'add_material') {
        executionSteps.push({ stepId: nextStepId(), sourceStepRef, command: 'pick_up_tip', params: {} });
      }
      if (operation.executionHints?.pre_mix && operation.executionHints.pre_mix.enabled !== false && operation.sourceWell) {
        executionSteps.push({
          stepId: nextStepId(),
          sourceStepRef,
          command: 'mix',
          params: {
            well: operation.sourceWell,
            cycles: operation.executionHints.pre_mix.cycles ?? 3,
            ...(operation.executionHints.pre_mix.volume?.unit === 'uL' ? { volume_uL: operation.executionHints.pre_mix.volume.value } : {}),
          },
        });
      }
      if (operation.eventType !== 'add_material') {
        executionSteps.push({
          stepId: nextStepId(),
          sourceStepRef,
          command: 'aspirate',
          params: {
            volume_uL: operation.volume_uL,
            ...(operation.sourceWell ? { well: operation.sourceWell } : {}),
            ...(operation.executionHints?.aspirate_height_mm !== undefined ? { height_mm: operation.executionHints.aspirate_height_mm } : {}),
          },
        });
      }
      executionSteps.push({
        stepId: nextStepId(),
        sourceStepRef,
        command: 'dispense',
        params: {
          volume_uL: operation.volume_uL,
          ...(operation.targetWell ? { well: operation.targetWell } : {}),
          ...(operation.executionHints?.dispense_height_mm !== undefined ? { height_mm: operation.executionHints.dispense_height_mm } : {}),
        },
      });
      if (operation.executionHints?.post_mix && operation.executionHints.post_mix.enabled !== false && operation.targetWell) {
        executionSteps.push({
          stepId: nextStepId(),
          sourceStepRef,
          command: 'mix',
          params: {
            well: operation.targetWell,
            cycles: operation.executionHints.post_mix.cycles ?? 3,
            ...(operation.executionHints.post_mix.volume?.unit === 'uL' ? { volume_uL: operation.executionHints.post_mix.volume.value } : {}),
          },
        });
      }
      if (operation.eventType !== 'add_material') {
        executionSteps.push({ stepId: nextStepId(), sourceStepRef, command: 'drop_tip', params: {} });
      }
      noteLines.push(
        `${sourceStepRef}: ${operation.eventType} ${operation.volume_uL}uL`
        + `${operation.sourceWell ? ` ${operation.sourceWell}` : ''}`
        + `${operation.targetWell ? ` -> ${operation.targetWell}` : ''}`
      );
    }
    compatibilityReport.push(buildCompatibilityEntry({
      event,
      honoredHints: [...honoredHints],
      droppedHints: [],
      compatibilityNotes: ['Manual plan keeps semantic intent and presents execution hints as operator instructions.'],
    }));
  }

  return {
    deckSlots,
    pipettes: [
      {
        mount: 'left',
        type: 'single',
        model: 'manual_operator',
        tipRackSlots,
      },
    ],
    executionSteps,
    notes: [
      `Manual execution plan ${input.robotPlanId}.`,
      noteLines.length > 0 ? `Operator checklist: ${noteLines.join(' | ')}` : 'Operator checklist unavailable.',
    ].join(' '),
    compatibilityReport,
  };
}

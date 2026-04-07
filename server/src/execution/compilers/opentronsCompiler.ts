import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import {
  buildCompatibilityEntry,
  extractTransferOperations,
  hintKeys,
  type CompatibilityReportEntry,
} from '../planning/transferPrograms.js';

type PlannedRunPayload = {
  recordId: string;
  title: string;
  sourceRef: { id: string };
  deckLayout?: {
    assignments?: Array<{
      labwareRole: string;
      position: string;
      orientation?: 'landscape' | 'portrait';
    }>;
  };
};

type ProtocolStep = {
  stepId: string;
  kind: string;
  source?: { wells?: string[] };
  target?: { wells?: string[] };
  volume_uL?: number;
};

type ProtocolPayload = {
  steps?: ProtocolStep[];
};

type EventGraphEvent = {
  eventId?: string;
  event_type?: string;
  details?: Record<string, unknown>;
};

type EventGraphPayload = {
  events?: EventGraphEvent[];
};

type ExecutionEnvironmentPayload = {
  tools?: Array<{
    tool_id?: string;
    channels?: number;
    mount?: 'left' | 'right' | 'center' | 'na';
  }>;
};

type ExecutionPlanPayload = {
  placements?: {
    labware?: Array<{
      labware_ref?: string;
      slot_id?: string;
      orientation?: 'default' | 'rot90' | 'rot180' | 'rot270';
    }>;
    tipracks?: Array<{
      tiprack_id?: string;
      slot_id?: string;
      tip_type?: string;
      starting_tip?: string;
      next_tip_well?: string;
      consumed_count?: number;
      depleted?: boolean;
    }>;
  };
  tool_bindings?: {
    primary_liquid_handler?: {
      tool_id?: string;
      mount?: 'left' | 'right' | 'center' | 'na';
    };
  };
  strategy?: {
    tip_policy?: string;
  };
  tip_management?: {
    mode?: 'robot' | 'manual';
    pause_on_depletion?: boolean;
    replacement_policy?: 'full_rack_default' | 'partial_override';
    runtime_actions?: Array<{
      action_id?: string;
      kind?: 'pause_for_tip_reload' | 'operator_prompt' | 'note';
      message?: string;
      target_tiprack_id?: string;
    }>;
  };
};

type CompilerStep = {
  stepId: string;
  sourceStepRef: string;
  command: string;
  params: Record<string, unknown>;
};

type CompilerOutput = {
  deckSlots: Array<{
    slotId: string;
    labwareRole: string;
    orientation?: 'landscape' | 'portrait';
  }>;
  pipettes: Array<{
    mount: 'left' | 'right';
    type: 'single' | 'multi_8' | 'multi_96';
    model: string;
    tipRackSlots: string[];
  }>;
  executionSteps: CompilerStep[];
  pythonScript: string;
  notes: string;
  compatibilityReport?: CompatibilityReportEntry[];
};

function pyString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function buildLegacyExecutionSteps(steps: ProtocolStep[]) {
  return steps.map((step, index) => {
    const volume = typeof step.volume_uL === 'number' ? step.volume_uL : 50;
    const sourceWell = step.source?.wells?.[0] ?? 'A1';
    const targetWell = step.target?.wells?.[0] ?? 'A1';
    return {
      stepId: `exec-${String(index + 1).padStart(3, '0')}`,
      sourceStepRef: step.stepId,
      command: step.kind === 'transfer' || step.kind === 'add_material' ? 'dispense' : 'move_labware',
      params: {
        volume_uL: volume,
        sourceWell,
        targetWell,
        stepKind: step.kind,
      },
    };
  });
}

function buildPlannedExecution(input: {
  events: EventGraphEvent[];
  sourcePlateName: string;
  targetPlateName: string;
}): {
  executionSteps: CompilerStep[];
  pythonLines: string[];
  compatibilityReport: CompatibilityReportEntry[];
} {
  const executionSteps: CompilerStep[] = [];
  const pythonLines: string[] = [];
  const compatibilityReport: CompatibilityReportEntry[] = [];
  const operationsByEvent = new Map<string, ReturnType<typeof extractTransferOperations>>();
  for (const operation of extractTransferOperations(input.events)) {
    operationsByEvent.set(operation.sourceStepRef, [...(operationsByEvent.get(operation.sourceStepRef) ?? []), operation]);
  }
  const supportedHints = new Set([
    'tip_policy',
    'aspirate_height_mm',
    'dispense_height_mm',
    'air_gap',
    'pre_mix',
    'post_mix',
    'touch_tip_after_aspirate',
    'touch_tip_after_dispense',
    'blowout',
  ]);
  let stepIndex = 0;
  const nextStepId = () => `exec-${String(stepIndex += 1).padStart(3, '0')}`;

  for (const event of input.events) {
    const sourceStepRef = event.eventId ?? `event-${stepIndex + 1}`;
    const operations = operationsByEvent.get(sourceStepRef) ?? [];
    if (operations.length === 0) {
      executionSteps.push({
        stepId: nextStepId(),
        sourceStepRef,
        command: 'move_labware',
        params: { eventType: event.event_type ?? 'other' },
      });
      pythonLines.push(`    protocol.comment(${pyString(`Event ${sourceStepRef}: ${String(event.event_type ?? 'other')}`)})`);
      continue;
    }

    const honoredHints = new Set<string>();
    const droppedHints = new Set<string>();
    const compatibilityNotes: string[] = [];

    for (const operation of operations) {
      for (const hint of hintKeys(operation.executionHints)) {
        const canHonor = hint !== 'tip_policy'
          || operation.executionHints?.tip_policy === 'inherit'
          || operation.executionHints?.tip_policy === 'new_tip_each_transfer';
        if (supportedHints.has(hint) && canHonor) honoredHints.add(hint);
        else droppedHints.add(hint);
      }
      if (operation.executionHints?.tip_policy === 'new_tip_each_source' || operation.executionHints?.tip_policy === 'reuse_within_batch') {
        compatibilityNotes.push('Grouped tip-reuse policy was not applied; the compiler emitted one tip cycle per transfer operation.');
      }

      if (operation.eventType === 'add_material') {
        executionSteps.push({
          stepId: nextStepId(),
          sourceStepRef,
          command: 'dispense',
          params: {
            volume_uL: operation.volume_uL,
            ...(operation.targetWell ? { well: operation.targetWell } : {}),
            eventType: 'add_material',
          },
        });
        pythonLines.push(`    protocol.comment(${pyString(`Add material ${operation.volume_uL}uL to ${operation.targetWell ?? 'target'}`)})`);
        continue;
      }

      executionSteps.push({
        stepId: nextStepId(),
        sourceStepRef,
        command: 'pick_up_tip',
        params: {},
      });
      pythonLines.push('    pipette.pick_up_tip()');

      if (operation.executionHints?.pre_mix && operation.executionHints.pre_mix.enabled !== false && operation.sourceWell) {
        const mixCycles = operation.executionHints.pre_mix.cycles ?? 3;
        const mixVolume = operation.executionHints.pre_mix.volume?.unit === 'uL'
          ? operation.executionHints.pre_mix.volume.value
          : operation.volume_uL;
        executionSteps.push({
          stepId: nextStepId(),
          sourceStepRef,
          command: 'mix',
          params: { well: operation.sourceWell, cycles: mixCycles, volume_uL: mixVolume },
        });
        pythonLines.push(`    pipette.mix(${mixCycles}, ${mixVolume}, ${input.sourcePlateName}.wells_by_name()[${pyString(operation.sourceWell)}])`);
      }

      executionSteps.push({
        stepId: nextStepId(),
        sourceStepRef,
        command: 'aspirate',
        params: {
          volume_uL: operation.volume_uL,
          ...(operation.sourceWell ? { well: operation.sourceWell } : {}),
          ...(operation.executionHints?.aspirate_height_mm !== undefined ? { height_mm: operation.executionHints.aspirate_height_mm } : {}),
          ...(operation.executionHints?.air_gap
            ? { air_gap_uL: operation.executionHints.air_gap.unit === 'uL' ? operation.executionHints.air_gap.value : operation.executionHints.air_gap.value * 1000 }
            : {}),
        },
      });
      if (operation.sourceWell) {
        const sourceRef = operation.executionHints?.aspirate_height_mm !== undefined
          ? `${input.sourcePlateName}.wells_by_name()[${pyString(operation.sourceWell)}].bottom(${operation.executionHints.aspirate_height_mm})`
          : `${input.sourcePlateName}.wells_by_name()[${pyString(operation.sourceWell)}]`;
        pythonLines.push(`    pipette.aspirate(${operation.volume_uL}, ${sourceRef})`);
      }
      if (operation.executionHints?.air_gap) {
        const airGapUL = operation.executionHints.air_gap.unit === 'uL'
          ? operation.executionHints.air_gap.value
          : operation.executionHints.air_gap.value * 1000;
        pythonLines.push(`    pipette.air_gap(${airGapUL})`);
      }

      if (operation.executionHints?.touch_tip_after_aspirate && operation.sourceWell) {
        executionSteps.push({
          stepId: nextStepId(),
          sourceStepRef,
          command: 'touch_tip',
          params: { well: operation.sourceWell },
        });
        pythonLines.push(`    pipette.touch_tip(${input.sourcePlateName}.wells_by_name()[${pyString(operation.sourceWell)}])`);
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
      if (operation.targetWell) {
        const targetRef = operation.executionHints?.dispense_height_mm !== undefined
          ? `${input.targetPlateName}.wells_by_name()[${pyString(operation.targetWell)}].bottom(${operation.executionHints.dispense_height_mm})`
          : `${input.targetPlateName}.wells_by_name()[${pyString(operation.targetWell)}]`;
        pythonLines.push(`    pipette.dispense(${operation.volume_uL}, ${targetRef})`);
      }

      if (operation.executionHints?.touch_tip_after_dispense && operation.targetWell) {
        executionSteps.push({
          stepId: nextStepId(),
          sourceStepRef,
          command: 'touch_tip',
          params: { well: operation.targetWell },
        });
        pythonLines.push(`    pipette.touch_tip(${input.targetPlateName}.wells_by_name()[${pyString(operation.targetWell)}])`);
      }

      if (operation.executionHints?.blowout && operation.targetWell) {
        executionSteps.push({
          stepId: nextStepId(),
          sourceStepRef,
          command: 'blow_out',
          params: { well: operation.targetWell },
        });
        pythonLines.push(`    pipette.blow_out(${input.targetPlateName}.wells_by_name()[${pyString(operation.targetWell)}].top())`);
      }

      if (operation.executionHints?.post_mix && operation.executionHints.post_mix.enabled !== false && operation.targetWell) {
        const mixCycles = operation.executionHints.post_mix.cycles ?? 3;
        const mixVolume = operation.executionHints.post_mix.volume?.unit === 'uL'
          ? operation.executionHints.post_mix.volume.value
          : operation.volume_uL;
        executionSteps.push({
          stepId: nextStepId(),
          sourceStepRef,
          command: 'mix',
          params: { well: operation.targetWell, cycles: mixCycles, volume_uL: mixVolume },
        });
        pythonLines.push(`    pipette.mix(${mixCycles}, ${mixVolume}, ${input.targetPlateName}.wells_by_name()[${pyString(operation.targetWell)}])`);
      }

      executionSteps.push({
        stepId: nextStepId(),
        sourceStepRef,
        command: 'drop_tip',
        params: {},
      });
      pythonLines.push('    pipette.drop_tip()');
    }

    compatibilityReport.push(buildCompatibilityEntry({
      event,
      honoredHints: [...honoredHints],
      droppedHints: [...droppedHints],
      compatibilityNotes,
    }));
  }

  return { executionSteps, pythonLines, compatibilityReport };
}

export function compileOpentronsPlan(input: {
  robotPlanId: string;
  targetPlatform: 'opentrons_ot2' | 'opentrons_flex';
  plannedRun?: PlannedRunPayload;
  protocolEnvelope?: RecordEnvelope | null;
  eventGraph?: EventGraphPayload | null;
  executionEnvironment?: ExecutionEnvironmentPayload | null;
  executionPlan?: ExecutionPlanPayload | null;
}): CompilerOutput {
  if (input.eventGraph && input.executionEnvironment && input.executionPlan) {
    return compilePlannedOpentrons({
      robotPlanId: input.robotPlanId,
      targetPlatform: input.targetPlatform,
      eventGraph: input.eventGraph,
      executionEnvironment: input.executionEnvironment,
      executionPlan: input.executionPlan,
    });
  }

  if (!input.plannedRun) {
    throw new Error('plannedRun is required for legacy Opentrons compilation');
  }

  const protocol = (input.protocolEnvelope?.payload ?? {}) as ProtocolPayload;
  const steps = protocol.steps ?? [];
  const deckSlots = (input.plannedRun.deckLayout?.assignments ?? []).map((assignment) => ({
    slotId: assignment.position,
    labwareRole: assignment.labwareRole,
    ...(assignment.orientation ? { orientation: assignment.orientation } : {}),
  }));
  const executionSteps = buildLegacyExecutionSteps(steps);
  const instrumentName = input.targetPlatform === 'opentrons_flex' ? 'flex_1channel_1000' : 'p300_single_gen2';
  const apiLevel = input.targetPlatform === 'opentrons_flex' ? '2.16' : '2.15';
  const stepLines = executionSteps
    .map((step) => {
      if (step.command !== 'dispense') {
        return `    protocol.comment(${pyString(`Step ${step.sourceStepRef}: ${String(step.params['stepKind'])}`)})`;
      }
      const volume = Number(step.params['volume_uL'] ?? 50);
      const sourceWell = String(step.params['sourceWell'] ?? 'A1');
      const targetWell = String(step.params['targetWell'] ?? 'A1');
      return `    pipette.transfer(${volume}, source_plate.wells_by_name()[${pyString(sourceWell)}], target_plate.wells_by_name()[${pyString(targetWell)}])`;
    })
    .join('\n');
  const pythonScript = [
    `metadata = {"apiLevel": "${apiLevel}", "protocolName": ${pyString(input.plannedRun.title)}, "description": ${pyString(input.robotPlanId)}}`,
    '',
    'def run(protocol):',
    '    source_plate = protocol.load_labware("corning_96_wellplate_360ul_flat", "1")',
    '    target_plate = protocol.load_labware("corning_96_wellplate_360ul_flat", "2")',
    '    tip_rack = protocol.load_labware("opentrons_96_tiprack_300ul", "3")',
    `    pipette = protocol.load_instrument("${instrumentName}", "left", tip_racks=[tip_rack])`,
    '    protocol.comment("Auto-generated scaffold from computable-lab LabOS M2")',
    stepLines || '    protocol.comment("No executable steps found in protocol")',
    '',
  ].join('\n');
  return {
    deckSlots,
    pipettes: [
      {
        mount: 'left',
        type: 'single',
        model: instrumentName,
        tipRackSlots: ['3'],
      },
    ],
    executionSteps,
    pythonScript,
    notes: `Opentrons scaffold compiler for ${input.targetPlatform}; step semantics currently minimal.`,
    compatibilityReport: [],
  };
}

function compilePlannedOpentrons(input: {
  robotPlanId: string;
  targetPlatform: 'opentrons_ot2' | 'opentrons_flex';
  eventGraph: EventGraphPayload;
  executionEnvironment: ExecutionEnvironmentPayload;
  executionPlan: ExecutionPlanPayload;
}): CompilerOutput {
  const placements = input.executionPlan.placements?.labware ?? [];
  const tipracks = input.executionPlan.placements?.tipracks ?? [];
  const primaryToolId = input.executionPlan.tool_bindings?.primary_liquid_handler?.tool_id;
  const primaryTool = (input.executionEnvironment.tools ?? []).find((tool) => tool.tool_id === primaryToolId);
  const channels = primaryTool?.channels ?? 1;
  const mount = input.executionPlan.tool_bindings?.primary_liquid_handler?.mount ?? primaryTool?.mount ?? 'left';
  const instrumentName = input.targetPlatform === 'opentrons_flex' ? 'flex_1channel_1000' : 'p300_single_gen2';
  const apiLevel = input.targetPlatform === 'opentrons_flex' ? '2.16' : '2.15';
  const deckSlots = placements.map((assignment) => ({
    slotId: assignment.slot_id ?? '1',
    labwareRole: assignment.labware_ref ?? 'labware',
    ...(assignment.orientation === 'rot90' || assignment.orientation === 'rot270'
      ? { orientation: 'portrait' as const }
      : { orientation: 'landscape' as const }),
  }));
  const sourceSlot = placements[0]?.slot_id ?? '1';
  const targetSlot = placements[1]?.slot_id ?? '2';
  const tipSlot = tipracks[0]?.slot_id ?? '3';
  const tipPolicy = input.executionPlan.strategy?.tip_policy ?? 'new_tip_each_transfer';
  const tipMode = input.executionPlan.tip_management?.mode ?? 'robot';
  const { executionSteps, pythonLines, compatibilityReport } = buildPlannedExecution({
    events: input.eventGraph.events ?? [],
    sourcePlateName: 'source_plate',
    targetPlateName: 'target_plate',
  });
  const tipInfoComments = tipracks.map((rack) => {
    const next = rack.next_tip_well ?? rack.starting_tip ?? 'A1';
    return `    protocol.comment(${pyString(`Tip rack ${rack.tiprack_id ?? 'TIP'} at slot ${rack.slot_id ?? '?'} next=${next} type=${rack.tip_type ?? 'unknown'}`)})`;
  }).join('\n');
  const runtimeComments = (input.executionPlan.tip_management?.runtime_actions ?? [])
    .map((action) => {
      if (action?.kind === 'pause_for_tip_reload') return `    protocol.comment(${pyString(action.message ?? 'Pause for tip reload')})`;
      if (action?.kind === 'operator_prompt') return `    protocol.comment(${pyString(action.message ?? 'Operator action required')})`;
      if (action?.kind === 'note') return `    protocol.comment(${pyString(action.message ?? 'Execution note')})`;
      return '';
    })
    .filter((line) => line.length > 0)
    .join('\n');
  const pythonScript = [
    `metadata = {"apiLevel": "${apiLevel}", "protocolName": ${pyString(`Execution Plan ${input.robotPlanId}`)}, "description": ${pyString(input.robotPlanId)}}`,
    '',
    'def run(protocol):',
    `    source_plate = protocol.load_labware("corning_96_wellplate_360ul_flat", ${pyString(sourceSlot)})`,
    `    target_plate = protocol.load_labware("corning_96_wellplate_360ul_flat", ${pyString(targetSlot)})`,
    `    tip_rack = protocol.load_labware("opentrons_96_tiprack_300ul", ${pyString(tipSlot)})`,
    `    pipette = protocol.load_instrument("${instrumentName}", ${pyString(mount === 'right' ? 'right' : 'left')}, tip_racks=[tip_rack])`,
    '    protocol.comment("Generated from execution_plan + execution_environment")',
    `    protocol.comment(${pyString(`Tip mode=${tipMode}; policy=${tipPolicy}`)})`,
    tipInfoComments,
    runtimeComments,
    pythonLines.join('\n') || '    protocol.comment("No executable events found in event graph")',
    '',
  ].join('\n');
  return {
    deckSlots,
    pipettes: [
      {
        mount: mount === 'right' ? 'right' : 'left',
        type: channels >= 96 ? 'multi_96' : channels >= 8 ? 'multi_8' : 'single',
        model: instrumentName,
        tipRackSlots: tipracks.map((rack) => rack.slot_id ?? '').filter((slot) => slot.length > 0),
      },
    ],
    executionSteps,
    pythonScript,
    notes: 'Opentrons compiler emitted from execution_plan inputs with transfer-program hint resolution.',
    compatibilityReport,
  };
}

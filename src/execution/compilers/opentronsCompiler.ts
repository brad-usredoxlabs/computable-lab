import type { RecordEnvelope } from '../../types/RecordEnvelope.js';

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

type EventGraphPayload = {
  events?: Array<{
    eventId?: string;
    event_type?: string;
    details?: Record<string, unknown>;
  }>;
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

function pyString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

export function compileOpentronsPlan(input: {
  robotPlanId: string;
  targetPlatform: 'opentrons_ot2' | 'opentrons_flex';
  plannedRun?: PlannedRunPayload;
  protocolEnvelope?: RecordEnvelope | null;
  eventGraph?: EventGraphPayload | null;
  executionEnvironment?: ExecutionEnvironmentPayload | null;
  executionPlan?: ExecutionPlanPayload | null;
}): {
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
  executionSteps: Array<{
    stepId: string;
    sourceStepRef: string;
    command: string;
    params: Record<string, unknown>;
  }>;
  pythonScript: string;
  notes: string;
} {
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

  const executionSteps = steps.map((step, i) => {
    const volume = typeof step.volume_uL === 'number' ? step.volume_uL : 50;
    const sourceWell = step.source?.wells?.[0] ?? 'A1';
    const targetWell = step.target?.wells?.[0] ?? 'A1';
    return {
      stepId: `exec-${String(i + 1).padStart(3, '0')}`,
      sourceStepRef: step.stepId,
      command: step.kind === 'transfer' || step.kind === 'add_material' ? 'transfer' : 'comment',
      params: {
        volume_uL: volume,
        sourceWell,
        targetWell,
        stepKind: step.kind,
      },
    };
  });

  const instrumentName = input.targetPlatform === 'opentrons_flex' ? 'flex_1channel_1000' : 'p300_single_gen2';
  const apiLevel = input.targetPlatform === 'opentrons_flex' ? '2.16' : '2.15';

  const stepLines = executionSteps
    .map((step) => {
      if (step.command !== 'transfer') {
        return `    protocol.comment(${pyString(`Step ${step.sourceStepRef}: ${String(step.params['stepKind'])}`)})`;
      }
      const volume = Number(step.params['volume_uL'] ?? 50);
      const sourceWell = String(step.params['sourceWell'] ?? 'A1');
      const targetWell = String(step.params['targetWell'] ?? 'A1');
      return `    pipette.transfer(${volume}, source_plate.wells_by_name()[${pyString(sourceWell)}], target_plate.wells_by_name()[${pyString(targetWell)}])`;
    })
    .join('\n');

  const runTitle = input.plannedRun.title;
  const pythonScript = [
    `metadata = {"apiLevel": "${apiLevel}", "protocolName": ${pyString(runTitle)}, "description": ${pyString(input.robotPlanId)}}`,
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
  };
}

function compilePlannedOpentrons(input: {
  robotPlanId: string;
  targetPlatform: 'opentrons_ot2' | 'opentrons_flex';
  eventGraph: EventGraphPayload;
  executionEnvironment: ExecutionEnvironmentPayload;
  executionPlan: ExecutionPlanPayload;
}): {
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
  executionSteps: Array<{
    stepId: string;
    sourceStepRef: string;
    command: string;
    params: Record<string, unknown>;
  }>;
  pythonScript: string;
  notes: string;
} {
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

  const executionSteps = (input.eventGraph.events ?? []).map((event, i) => {
    const details = event.details ?? {};
    const volume =
      typeof details['volume_uL'] === 'number'
        ? details['volume_uL']
        : typeof details['volume_ul'] === 'number'
          ? details['volume_ul']
          : 50;
    const sourceWell = typeof details['sourceWell'] === 'string' ? details['sourceWell'] : 'A1';
    const targetWell = typeof details['targetWell'] === 'string' ? details['targetWell'] : 'A1';
    const command = event.event_type === 'transfer' || event.event_type === 'add_material' ? 'transfer' : 'comment';
    return {
      stepId: `exec-${String(i + 1).padStart(3, '0')}`,
      sourceStepRef: event.eventId ?? `event-${i + 1}`,
      command,
      params: {
        volume_uL: volume,
        sourceWell,
        targetWell,
        eventType: event.event_type ?? 'other',
      },
    };
  });

  const stepLines = executionSteps
    .map((step) => {
      if (step.command !== 'transfer') {
        return `    protocol.comment(${pyString(`Event ${step.sourceStepRef}: ${String(step.params['eventType'])}`)})`;
      }
      const volume = Number(step.params['volume_uL'] ?? 50);
      const sourceWell = String(step.params['sourceWell'] ?? 'A1');
      const targetWell = String(step.params['targetWell'] ?? 'A1');
      return `    pipette.transfer(${volume}, source_plate.wells_by_name()[${pyString(sourceWell)}], target_plate.wells_by_name()[${pyString(targetWell)}])`;
    })
    .join('\n');

  const sourceSlot = placements[0]?.slot_id ?? '1';
  const targetSlot = placements[1]?.slot_id ?? '2';
  const tipSlot = tipracks[0]?.slot_id ?? '3';
  const tipPolicy = input.executionPlan.strategy?.tip_policy ?? 'new_tip_each_transfer';
  const tipMode = input.executionPlan.tip_management?.mode ?? 'robot';
  const tipInfoComments = tipracks.map((rack) => {
    const next = rack.next_tip_well ?? rack.starting_tip ?? 'A1';
    return `    protocol.comment(${pyString(`Tip rack ${rack.tiprack_id ?? 'TIP'} at slot ${rack.slot_id ?? '?'} next=${next} type=${rack.tip_type ?? 'unknown'}`)})`;
  }).join('\n');
  const runtimeComments = (input.executionPlan.tip_management?.runtime_actions ?? [])
    .map((action) => {
      if (action?.kind === 'pause_for_tip_reload') {
        return `    protocol.comment(${pyString(action.message ?? 'Pause for tip reload')})`;
      }
      if (action?.kind === 'operator_prompt') {
        return `    protocol.comment(${pyString(action.message ?? 'Operator action required')})`;
      }
      if (action?.kind === 'note') {
        return `    protocol.comment(${pyString(action.message ?? 'Execution note')})`;
      }
      return '';
    })
    .filter((line) => line.length > 0)
    .join('\n');
  const protocolName = `Execution Plan ${input.robotPlanId}`;
  const pythonScript = [
    `metadata = {"apiLevel": "${apiLevel}", "protocolName": ${pyString(protocolName)}, "description": ${pyString(input.robotPlanId)}}`,
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
    stepLines || '    protocol.comment("No executable events found in event graph")',
    '',
  ].join('\n');

  return {
    deckSlots,
    pipettes: [
      {
        mount: mount === 'right' ? 'right' : 'left',
        type: channels >= 96 ? 'multi_96' : channels >= 8 ? 'multi_8' : 'single',
        model: instrumentName,
        tipRackSlots: tipracks.map((t) => t.slot_id ?? '').filter((v) => v.length > 0),
      },
    ],
    executionSteps,
    pythonScript,
    notes: 'Opentrons compiler emitted from execution_plan inputs.',
  };
}

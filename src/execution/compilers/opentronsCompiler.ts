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

function pyString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

export function compileOpentronsPlan(input: {
  robotPlanId: string;
  targetPlatform: 'opentrons_ot2' | 'opentrons_flex';
  plannedRun: PlannedRunPayload;
  protocolEnvelope: RecordEnvelope | null;
}): {
  deckSlots: Array<{
    slotId: string;
    labwareRole: string;
    orientation?: 'landscape' | 'portrait';
  }>;
  pipettes: Array<{
    mount: 'left';
    type: 'single';
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
  };
}

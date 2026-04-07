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
    mount: 'left';
    type: 'single';
    model: 'assist_plus_default';
    tipRackSlots: string[];
  }>;
  executionSteps: CompilerStep[];
  vialabXml: string;
  notes: string;
  compatibilityReport?: CompatibilityReportEntry[];
};

function xmlEscape(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function inferCommandForStep(stepKind: string): string {
  switch (stepKind) {
    case 'mix':
      return 'mix';
    case 'transfer':
    case 'harvest':
      return 'aspirate';
    case 'add_material':
      return 'dispense';
    case 'wash':
      return 'mix';
    case 'incubate':
    case 'read':
    default:
      return 'move_labware';
  }
}

function compileLegacyAssist(input: {
  robotPlanId: string;
  plannedRun: PlannedRunPayload;
  protocolEnvelope?: RecordEnvelope | null;
}): CompilerOutput {
  const protocol = (input.protocolEnvelope?.payload ?? {}) as ProtocolPayload;
  const steps = protocol.steps ?? [];
  const deckSlots = (input.plannedRun.deckLayout?.assignments ?? []).map((assignment) => ({
    slotId: assignment.position,
    labwareRole: assignment.labwareRole,
    ...(assignment.orientation ? { orientation: assignment.orientation } : {}),
  }));
  const executionSteps = steps.map((step, index) => ({
    stepId: `exec-${String(index + 1).padStart(3, '0')}`,
    sourceStepRef: step.stepId,
    command: inferCommandForStep(step.kind),
    params: { kind: step.kind },
  }));
  const vialabXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<VialabProtocol id="${xmlEscape(input.robotPlanId)}" name="${xmlEscape(input.plannedRun.title)}">`,
    `  <PlannedRun recordId="${xmlEscape(input.plannedRun.recordId)}" source="${xmlEscape(input.plannedRun.sourceRef.id)}" />`,
    '  <Deck>',
    ...(deckSlots.length > 0
      ? deckSlots.map((slot) => `    <Slot id="${xmlEscape(slot.slotId)}" labwareRole="${xmlEscape(slot.labwareRole)}" orientation="${xmlEscape(slot.orientation ?? 'landscape')}" />`)
      : ['    <Slot id="UNASSIGNED" labwareRole="unbound" orientation="landscape" />']),
    '  </Deck>',
    '  <Steps>',
    ...(executionSteps.length > 0
      ? executionSteps.map((step) => `    <Step id="${xmlEscape(step.stepId)}" source="${xmlEscape(step.sourceStepRef)}" command="${xmlEscape(step.command)}" />`)
      : ['    <Step id="exec-001" source="compile" command="move_labware" />']),
    '  </Steps>',
    '</VialabProtocol>',
    '',
  ].join('\n');
  return {
    deckSlots,
    pipettes: [
      {
        mount: 'left',
        type: 'single',
        model: 'assist_plus_default',
        tipRackSlots: [],
      },
    ],
    executionSteps,
    vialabXml,
    notes: 'Assist Plus scaffold compiler output; command mapping is intentionally conservative.',
    compatibilityReport: [],
  };
}

function compilePlannedAssist(input: {
  robotPlanId: string;
  eventGraph: EventGraphPayload;
  executionPlan: ExecutionPlanPayload;
}): CompilerOutput {
  const deckSlots = (input.executionPlan.placements?.labware ?? []).map((assignment) => ({
    slotId: assignment.slot_id ?? 'UNASSIGNED',
    labwareRole: assignment.labware_ref ?? 'labware',
    ...(assignment.orientation === 'rot90' || assignment.orientation === 'rot270'
      ? { orientation: 'portrait' as const }
      : { orientation: 'landscape' as const }),
  }));
  const tipracks = input.executionPlan.placements?.tipracks ?? [];
  const tipPolicy = input.executionPlan.strategy?.tip_policy ?? 'new_tip_each_transfer';
  const tipMode = input.executionPlan.tip_management?.mode ?? 'robot';
  const executionSteps: CompilerStep[] = [];
  const compatibilityReport: CompatibilityReportEntry[] = [];
  const operationsByEvent = new Map<string, ReturnType<typeof extractTransferOperations>>();
  for (const operation of extractTransferOperations(input.eventGraph.events ?? [])) {
    operationsByEvent.set(operation.sourceStepRef, [...(operationsByEvent.get(operation.sourceStepRef) ?? []), operation]);
  }
  let stepIndex = 0;
  const nextStepId = () => `exec-${String(stepIndex += 1).padStart(3, '0')}`;

  for (const event of input.eventGraph.events ?? []) {
    const sourceStepRef = event.eventId ?? `event-${stepIndex + 1}`;
    const operations = operationsByEvent.get(sourceStepRef) ?? [];
    if (operations.length === 0) {
      executionSteps.push({
        stepId: nextStepId(),
        sourceStepRef,
        command: inferCommandForStep(event.event_type ?? 'other'),
        params: { kind: event.event_type ?? 'other' },
      });
      continue;
    }
    const honoredHints = new Set<string>();
    const droppedHints = new Set<string>();
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
      if (operation.executionHints?.touch_tip_after_aspirate && operation.sourceWell) {
        executionSteps.push({ stepId: nextStepId(), sourceStepRef, command: 'touch_tip', params: { well: operation.sourceWell } });
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
      if (operation.executionHints?.touch_tip_after_dispense && operation.targetWell) {
        executionSteps.push({ stepId: nextStepId(), sourceStepRef, command: 'touch_tip', params: { well: operation.targetWell } });
      }
      if (operation.executionHints?.blowout && operation.targetWell) {
        executionSteps.push({ stepId: nextStepId(), sourceStepRef, command: 'blow_out', params: { well: operation.targetWell } });
      }
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
    }
    compatibilityReport.push(buildCompatibilityEntry({
      event,
      honoredHints: [...honoredHints],
      droppedHints: [...droppedHints],
      compatibilityNotes: [],
    }));
  }

  const xmlDeck = deckSlots
    .map((slot) => `    <Slot id="${xmlEscape(slot.slotId)}" labwareRole="${xmlEscape(slot.labwareRole)}" orientation="${xmlEscape(slot.orientation ?? 'landscape')}" />`)
    .join('\n');
  const xmlTipRacks = tipracks
    .map((rack) => `    <TipRack id="${xmlEscape(rack.tiprack_id ?? '')}" slot="${xmlEscape(rack.slot_id ?? '')}" tipType="${xmlEscape(rack.tip_type ?? '')}" nextTip="${xmlEscape(rack.next_tip_well ?? rack.starting_tip ?? 'A1')}" depleted="${String(Boolean(rack.depleted))}" />`)
    .join('\n');
  const xmlRuntimeActions = (input.executionPlan.tip_management?.runtime_actions ?? [])
    .map((action) => `    <Action id="${xmlEscape(action.action_id ?? '')}" kind="${xmlEscape(action.kind ?? 'note')}" message="${xmlEscape(action.message ?? '')}" targetTipRack="${xmlEscape(action.target_tiprack_id ?? '')}" />`)
    .join('\n');
  const xmlSteps = executionSteps
    .map((step) => {
      const attrs = Object.entries(step.params)
        .map(([key, value]) => `${key}="${xmlEscape(String(value))}"`)
        .join(' ');
      return `    <Step id="${xmlEscape(step.stepId)}" source="${xmlEscape(step.sourceStepRef)}" command="${xmlEscape(step.command)}"${attrs ? ` ${attrs}` : ''} />`;
    })
    .join('\n');
  const vialabXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<VialabProtocol id="${xmlEscape(input.robotPlanId)}" name="${xmlEscape(`Execution Plan ${input.robotPlanId}`)}">`,
    `  <PlannedRun recordId="${xmlEscape(input.robotPlanId)}" source="${xmlEscape('execution_plan')}" />`,
    '  <Deck>',
    xmlDeck || '    <Slot id="UNASSIGNED" labwareRole="unbound" orientation="landscape" />',
    '  </Deck>',
    '  <TipManagement>',
    `    <Policy mode="${xmlEscape(tipMode)}" tipPolicy="${xmlEscape(tipPolicy)}" pauseOnDepletion="${String(Boolean(input.executionPlan.tip_management?.pause_on_depletion))}" replacementPolicy="${xmlEscape(input.executionPlan.tip_management?.replacement_policy ?? 'full_rack_default')}" />`,
    xmlTipRacks || '    <TipRack id="none" slot="" tipType="" nextTip="" depleted="false" />',
    '  </TipManagement>',
    '  <RuntimeActions>',
    xmlRuntimeActions || '    <Action id="none" kind="note" message="" targetTipRack="" />',
    '  </RuntimeActions>',
    '  <Steps>',
    xmlSteps || '    <Step id="exec-001" source="compile" command="move_labware" />',
    '  </Steps>',
    '</VialabProtocol>',
    '',
  ].join('\n');
  return {
    deckSlots,
    pipettes: [
      {
        mount: 'left',
        type: 'single',
        model: 'assist_plus_default',
        tipRackSlots: tipracks.map((rack) => rack.slot_id ?? '').filter((slot) => slot.length > 0),
      },
    ],
    executionSteps,
    vialabXml,
    notes: 'Assist Plus compiler emitted from execution_plan inputs with transfer-program hint serialization.',
    compatibilityReport,
  };
}

export function compileAssistPlusPlan(input: {
  robotPlanId: string;
  plannedRun?: PlannedRunPayload;
  protocolEnvelope?: RecordEnvelope | null;
  eventGraph?: EventGraphPayload | null;
  executionPlan?: ExecutionPlanPayload | null;
}): CompilerOutput {
  if (input.eventGraph && input.executionPlan) {
    return compilePlannedAssist({
      robotPlanId: input.robotPlanId,
      eventGraph: input.eventGraph,
      executionPlan: input.executionPlan,
    });
  }

  if (!input.plannedRun) {
    throw new Error('plannedRun is required for legacy Assist Plus compilation');
  }

  return compileLegacyAssist({
    robotPlanId: input.robotPlanId,
    plannedRun: input.plannedRun,
    ...(input.protocolEnvelope !== undefined ? { protocolEnvelope: input.protocolEnvelope } : {}),
  });
}

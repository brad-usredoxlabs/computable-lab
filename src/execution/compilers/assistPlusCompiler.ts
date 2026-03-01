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
};

type ProtocolPayload = {
  steps?: ProtocolStep[];
};

type EventGraphPayload = {
  events?: Array<{
    eventId?: string;
    event_type?: string;
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
      return 'aspirate';
    case 'add_material':
      return 'dispense';
    case 'harvest':
      return 'aspirate';
    case 'wash':
      return 'mix';
    case 'incubate':
      return 'move_labware';
    case 'read':
      return 'move_labware';
    default:
      return 'move_labware';
  }
}

export function compileAssistPlusPlan(input: {
  robotPlanId: string;
  plannedRun?: PlannedRunPayload;
  protocolEnvelope?: RecordEnvelope | null;
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
    model: 'assist_plus_default';
    tipRackSlots: string[];
  }>;
  executionSteps: Array<{
    stepId: string;
    sourceStepRef: string;
    command: string;
    params: { kind: string };
  }>;
  vialabXml: string;
  notes: string;
} {
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

  const protocol = (input.protocolEnvelope?.payload ?? {}) as ProtocolPayload;
  const steps = protocol.steps ?? [];

  const deckSlots = (input.plannedRun.deckLayout?.assignments ?? []).map((assignment) => ({
    slotId: assignment.position,
    labwareRole: assignment.labwareRole,
    ...(assignment.orientation ? { orientation: assignment.orientation } : {}),
  }));

  const executionSteps = steps.map((step, i) => ({
    stepId: `exec-${String(i + 1).padStart(3, '0')}`,
    sourceStepRef: step.stepId,
    command: inferCommandForStep(step.kind),
    params: { kind: step.kind },
  }));

  const xmlDeck = deckSlots
    .map((slot) => {
      const orientation = slot.orientation ?? 'landscape';
      return `    <Slot id="${xmlEscape(slot.slotId)}" labwareRole="${xmlEscape(slot.labwareRole)}" orientation="${orientation}" />`;
    })
    .join('\n');

  const xmlSteps = executionSteps
    .map((step) => `    <Step id="${xmlEscape(step.stepId)}" source="${xmlEscape(step.sourceStepRef)}" command="${xmlEscape(step.command)}" />`)
    .join('\n');

  const vialabXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<VialabProtocol id="${xmlEscape(input.robotPlanId)}" name="${xmlEscape(input.plannedRun.title)}">`,
    `  <PlannedRun recordId="${xmlEscape(input.plannedRun.recordId)}" source="${xmlEscape(input.plannedRun.sourceRef.id)}" />`,
    '  <Deck>',
    xmlDeck || '    <Slot id="UNASSIGNED" labwareRole="unbound" orientation="landscape" />',
    '  </Deck>',
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
        tipRackSlots: [],
      },
    ],
    executionSteps,
    vialabXml,
    notes: 'Assist Plus scaffold compiler output; command mapping is intentionally conservative.',
  };
}

function compilePlannedAssist(input: {
  robotPlanId: string;
  eventGraph: EventGraphPayload;
  executionPlan: ExecutionPlanPayload;
}): {
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
  executionSteps: Array<{
    stepId: string;
    sourceStepRef: string;
    command: string;
    params: { kind: string };
  }>;
  vialabXml: string;
  notes: string;
} {
  const deckSlots = (input.executionPlan.placements?.labware ?? []).map((assignment) => ({
    slotId: assignment.slot_id ?? 'UNASSIGNED',
    labwareRole: assignment.labware_ref ?? 'labware',
    ...(assignment.orientation === 'rot90' || assignment.orientation === 'rot270'
      ? { orientation: 'portrait' as const }
      : { orientation: 'landscape' as const }),
  }));

  const executionSteps = (input.eventGraph.events ?? []).map((event, i) => ({
    stepId: `exec-${String(i + 1).padStart(3, '0')}`,
    sourceStepRef: event.eventId ?? `event-${i + 1}`,
    command: inferCommandForStep(event.event_type ?? 'other'),
    params: { kind: event.event_type ?? 'other' },
  }));

  const xmlDeck = deckSlots
    .map((slot) => {
      const orientation = slot.orientation ?? 'landscape';
      return `    <Slot id="${xmlEscape(slot.slotId)}" labwareRole="${xmlEscape(slot.labwareRole)}" orientation="${orientation}" />`;
    })
    .join('\n');
  const tipracks = input.executionPlan.placements?.tipracks ?? [];
  const tipPolicy = input.executionPlan.strategy?.tip_policy ?? 'new_tip_each_transfer';
  const tipMode = input.executionPlan.tip_management?.mode ?? 'robot';
  const xmlTipRacks = tipracks
    .map((rack) => `    <TipRack id="${xmlEscape(rack.tiprack_id ?? '')}" slot="${xmlEscape(rack.slot_id ?? '')}" tipType="${xmlEscape(rack.tip_type ?? '')}" nextTip="${xmlEscape(rack.next_tip_well ?? rack.starting_tip ?? 'A1')}" depleted="${String(Boolean(rack.depleted))}" />`)
    .join('\n');
  const xmlRuntimeActions = (input.executionPlan.tip_management?.runtime_actions ?? [])
    .map((action) => `    <Action id="${xmlEscape(action.action_id ?? '')}" kind="${xmlEscape(action.kind ?? 'note')}" message="${xmlEscape(action.message ?? '')}" targetTipRack="${xmlEscape(action.target_tiprack_id ?? '')}" />`)
    .join('\n');

  const xmlSteps = executionSteps
    .map((step) => `    <Step id="${xmlEscape(step.stepId)}" source="${xmlEscape(step.sourceStepRef)}" command="${xmlEscape(step.command)}" />`)
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
        tipRackSlots: [],
      },
    ],
    executionSteps,
    vialabXml,
    notes: 'Assist Plus compiler emitted from execution_plan inputs.',
  };
}

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

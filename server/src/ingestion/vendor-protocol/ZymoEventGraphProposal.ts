import type {
  ProtocolAdaptationGap,
  ProtocolAdaptationPlan,
  ProtocolStepAdaptation,
  ReservoirAllocation,
  VendorEventGraphProposal,
} from './types.js';

type ProposalEvent = VendorEventGraphProposal['eventGraph']['events'][number];
type ValidationFinding = VendorEventGraphProposal['validationReport']['findings'][number];

const LABWARE_INSTANCES = {
  primary_sample_plate: {
    labwareId: 'lwi-zymo-primary-deepwell',
    labwareType: '96-well-deepwell-plate',
    name: 'Zymo primary 96-well deepwell plate',
  },
  reagent_reservoir: {
    labwareId: 'lwi-zymo-reagent-reservoir',
    labwareType: '12-well-reservoir',
    name: 'Zymo reagent reservoir',
  },
  elution_plate: {
    labwareId: 'lwi-zymo-elution-plate',
    labwareType: '96-well-conical-pcr-plate',
    name: 'Zymo clean elution plate',
  },
} as const;

const MATERIAL_REF_BY_ROLE: Record<string, { id: string; label: string }> = {
  magbinding_buffer: { id: 'zymo-magbinding-buffer', label: 'ZymoBIOMICS MagBinding Buffer' },
  magbinding_beads: { id: 'zymo-magbinding-beads', label: 'ZymoBIOMICS MagBinding Beads' },
  magwash_1: { id: 'zymo-magwash-1', label: 'ZymoBIOMICS MagWash 1' },
  magwash_2: { id: 'zymo-magwash-2', label: 'ZymoBIOMICS MagWash 2' },
  dnase_rnase_free_water: { id: 'zymo-dnase-rnase-free-water', label: 'ZymoBIOMICS DNase/RNase Free Water' },
};

const LIQUID_HANDLING_STEPS: Array<{
  sourceStep: number;
  roleId: string;
  eventType: 'transfer' | 'mix' | 'other';
  volumeUl?: number;
  sourceWell?: string;
  notes: string;
}> = [
  { sourceStep: 5, roleId: 'magbinding_buffer', eventType: 'transfer', volumeUl: 600, sourceWell: 'A1', notes: 'Add MagBinding Buffer after lysate transfer.' },
  { sourceStep: 6, roleId: 'magbinding_beads', eventType: 'transfer', volumeUl: 25, sourceWell: 'A7', notes: 'Dispense beads while keeping reagent suspended.' },
  { sourceStep: 6, roleId: 'magbinding_beads', eventType: 'mix', notes: 'Mix beads for 10 minutes by pipette mix where supported.' },
  { sourceStep: 8, roleId: 'magbinding_buffer', eventType: 'transfer', volumeUl: 500, sourceWell: 'A1', notes: 'Binding buffer wash.' },
  { sourceStep: 10, roleId: 'magwash_1', eventType: 'transfer', volumeUl: 500, sourceWell: 'A3', notes: 'MagWash 1 wash.' },
  { sourceStep: 12, roleId: 'magwash_2', eventType: 'transfer', volumeUl: 900, sourceWell: 'A5', notes: 'MagWash 2 wash.' },
  { sourceStep: 14, roleId: 'magwash_2', eventType: 'transfer', volumeUl: 900, sourceWell: 'A5', notes: 'Repeat wash from steps 12-13.' },
  { sourceStep: 16, roleId: 'dnase_rnase_free_water', eventType: 'transfer', volumeUl: 50, sourceWell: 'A2', notes: 'Elution water addition.' },
  { sourceStep: 16, roleId: 'dnase_rnase_free_water', eventType: 'mix', notes: 'Resuspend beads and mix for 10 minutes where supported.' },
  { sourceStep: 17, roleId: 'dnase_rnase_free_water', eventType: 'transfer', volumeUl: 50, notes: 'Transfer eluted DNA supernatant to clean elution plate.' },
];

function all96Wells(): string[] {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return rows.flatMap((row) => Array.from({ length: 12 }, (_, index) => `${row}${index + 1}`));
}

function eventId(kind: string, ordinal: number): string {
  return `evt-zymo-${kind}-${String(ordinal).padStart(3, '0')}`;
}

function ref(id: string, type: string, label?: string): Record<string, string> {
  return { kind: 'record', id, type, ...(label ? { label } : {}) };
}

function provenanceDetails(step?: ProtocolStepAdaptation): Record<string, unknown> {
  return step
    ? {
        sourceStepNumber: step.stepNumber,
        provenance: step.provenance,
        sourceText: step.sourceText,
      }
    : {};
}

function allocationForRole(plan: ProtocolAdaptationPlan, roleId: string): ReservoirAllocation | undefined {
  return plan.reservoirPlan.allocations.find((allocation) => allocation.roleId === roleId);
}

function firstAllocatedWell(plan: ProtocolAdaptationPlan, roleId: string, fallback?: string): string | undefined {
  return allocationForRole(plan, roleId)?.wells[0]?.well ?? fallback;
}

function createReservoirLoadEvents(plan: ProtocolAdaptationPlan): ProposalEvent[] {
  let ordinal = 1;
  return plan.reservoirPlan.allocations.flatMap((allocation) => {
    const material = MATERIAL_REF_BY_ROLE[allocation.roleId];
    return allocation.wells.map((well) => ({
      eventId: eventId('load', ordinal++),
      event_type: 'add_material',
      details: {
        labwareId: LABWARE_INSTANCES.reagent_reservoir.labwareId,
        wells: [well.well],
        material_ref: ref(material?.id ?? allocation.roleId, 'material-spec', material?.label ?? allocation.materialLabel),
        volume_uL: well.loadVolumeUl,
        roleId: allocation.roleId,
        source: 'adapted-reservoir-plan',
      },
      notes: `Load ${well.loadVolumeUl} uL ${allocation.materialLabel} into reservoir ${well.well}.`,
    }));
  });
}

function createLiquidHandlingEvents(plan: ProtocolAdaptationPlan): ProposalEvent[] {
  const wells = all96Wells();
  let ordinal = 1;
  return LIQUID_HANDLING_STEPS.map((step) => {
    const sourceStep = plan.stepPlan.find((candidate) => candidate.stepNumber === step.sourceStep);
    const material = MATERIAL_REF_BY_ROLE[step.roleId];
    if (step.eventType === 'mix') {
      return {
        eventId: eventId('mix', ordinal++),
        event_type: 'mix',
        details: {
          labwareId: LABWARE_INSTANCES.primary_sample_plate.labwareId,
          wells,
          role: 'all_wells',
          roleId: step.roleId,
          durationHint: step.sourceStep === 16 ? '10 minutes' : undefined,
          ...provenanceDetails(sourceStep),
        },
        notes: step.notes,
      };
    }
    const sourceWell = step.sourceWell ?? firstAllocatedWell(plan, step.roleId);
    const isElutionTransfer = step.sourceStep === 17;
    return {
      eventId: eventId(isElutionTransfer ? 'elute' : 'transfer', ordinal++),
      event_type: 'transfer',
      details: {
        source: {
          labwareId: isElutionTransfer
            ? LABWARE_INSTANCES.primary_sample_plate.labwareId
            : LABWARE_INSTANCES.reagent_reservoir.labwareId,
          wells: isElutionTransfer ? wells : [sourceWell],
        },
        target: {
          labwareId: isElutionTransfer
            ? LABWARE_INSTANCES.elution_plate.labwareId
            : LABWARE_INSTANCES.primary_sample_plate.labwareId,
          wells,
        },
        volume_uL: step.volumeUl,
        material_ref: ref(material?.id ?? step.roleId, 'material-spec', material?.label),
        roleId: step.roleId,
        sourceStepNumber: step.sourceStep,
        ...provenanceDetails(sourceStep),
      },
      notes: step.notes,
    };
  });
}

function createManualPlaceholderEvents(plan: ProtocolAdaptationPlan): ProposalEvent[] {
  return plan.manualSteps.map((manualStep, index) => ({
    eventId: eventId('manual', index + 1),
    event_type: 'other',
    details: {
      manual: true,
      sourceStepNumber: manualStep.stepNumber,
      equipmentRoles: manualStep.equipmentRoles,
      reason: manualStep.reason,
      sourceText: manualStep.sourceText,
      provenance: manualStep.provenance,
    },
    notes: `Manual/off-deck review placeholder for vendor step ${manualStep.stepNumber}.`,
  }));
}

function createValidationFindings(plan: ProtocolAdaptationPlan): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const gap of plan.gaps) {
    findings.push({
      severity: gap.severity,
      category: gap.code,
      message: gap.message,
      details: {
        sourceStepNumbers: gap.sourceStepNumbers ?? [],
        provenance: gap.provenance,
      },
    });
  }
  const highVolume = plan.stepPlan.find((step) => step.stepNumber === 12);
  findings.push({
    severity: 'warning',
    category: 'zymo_high_volume_wash_review',
    message: 'Step 12 uses 900 uL MagWash 2 per well; confirm deepwell capacity and pipette strategy before execution.',
    suggestion: 'Use the 500 uL high-speed shaker branch only if that equipment path is selected.',
    details: {
      sourceStepNumber: 12,
      provenance: highVolume?.provenance,
    },
  });
  findings.push({
    severity: 'info',
    category: 'zymo_preview_not_execution_ready',
    message: 'This event graph is a review proposal. Manual/off-deck actions and gaps must be resolved before run execution.',
  });
  return findings;
}

function createResourceManifest(plan: ProtocolAdaptationPlan): VendorEventGraphProposal['resourceManifest'] {
  const reservoirLoads = plan.reservoirPlan.allocations.flatMap((allocation) =>
    allocation.wells.map((well) => ({
      reservoirRef: LABWARE_INSTANCES.reagent_reservoir.labwareId,
      well: well.well,
      reagentKind: allocation.roleId,
      volumeUl: well.loadVolumeUl,
    })));
  return {
    tipRacks: [{ pipetteType: 'p1000-multi', rackCount: 1 }],
    reservoirLoads,
    consumables: [
      '96-well-deepwell-plate',
      '12-well-reservoir',
      '96-well-conical-pcr-plate',
      'opentrons-96-tiprack-1000ul',
    ],
  };
}

function proposalGaps(plan: ProtocolAdaptationPlan, findings: ValidationFinding[]): ProtocolAdaptationGap[] {
  const validationGaps = findings
    .filter((finding) => finding.severity === 'error')
    .map((finding) => ({
      code: finding.category,
      severity: finding.severity,
      message: finding.message,
    }));
  return [...plan.gaps, ...validationGaps];
}

export function compileZymoAdaptationToEventGraphProposal(
  plan: ProtocolAdaptationPlan,
): VendorEventGraphProposal {
  const reservoirLoadEvents = createReservoirLoadEvents(plan);
  const liquidEvents = createLiquidHandlingEvents(plan);
  const manualEvents = createManualPlaceholderEvents(plan);
  const validationFindings = createValidationFindings(plan);
  const events = [...reservoirLoadEvents, ...liquidEvents, ...manualEvents];

  return {
    kind: 'vendor-event-graph-proposal',
    sourceProtocolRef: plan.sourceProtocolRef,
    adaptationPlan: plan,
    eventGraph: {
      id: `EVG-${plan.sourceProtocolRef.documentId}-proposal`,
      name: `${plan.protocolTitle} 96-well deepwell proposal`,
      description: 'Reviewable Zymo vendor protocol adaptation generated from PDF extraction, normalization, and deterministic adaptation.',
      status: 'draft',
      events,
      labwares: Object.values(LABWARE_INSTANCES),
      deckLayout: {
        placements: [
          { slotId: 'target', labwareId: LABWARE_INSTANCES.primary_sample_plate.labwareId },
          { slotId: 'source', labwareId: LABWARE_INSTANCES.reagent_reservoir.labwareId },
          { slotId: 'output', labwareId: LABWARE_INSTANCES.elution_plate.labwareId },
        ],
      },
      tags: ['vendor-protocol', 'zymo', 'review-proposal'],
    },
    labwareAdditions: Object.entries(LABWARE_INSTANCES).map(([roleId, labware]) => ({
      labwareId: labware.labwareId,
      labwareType: labware.labwareType,
      roleId,
      reason: 'Required by Zymo 96-well deepwell adaptation plan.',
    })),
    manualActions: plan.manualSteps,
    resourceManifest: createResourceManifest(plan),
    validationReport: { findings: validationFindings },
    gaps: proposalGaps(plan, validationFindings),
  };
}


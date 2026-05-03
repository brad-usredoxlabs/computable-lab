import type {
  NormalizedProtocolCandidate,
  NormalizedProtocolRole,
  ProtocolActionCandidate,
  ProtocolAdaptationGap,
  ProtocolAdaptationPlan,
  ProtocolCandidate,
  ProtocolManualStep,
  ProtocolReservoirPlan,
  ProtocolStepAdaptation,
  ReservoirAllocation,
} from './types.js';

const DEFAULT_SAMPLE_COUNT = 96;
const RESERVOIR_WELLS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12'];
const RESERVOIR_WELL_CAPACITY_UL = 25_000;
const DEAD_VOLUME_PERCENT = 0.1;
const DEAD_VOLUME_MINIMUM_UL = 500;

const ZYMO_MATERIAL_ROLE_MAP = [
  {
    roleId: 'lysis_solution',
    label: 'ZymoBIOMICS Lysis Solution',
    normalizedId: 'zymo-lysis-solution',
    sourceIncludes: ['ZymoBIOMICS Lysis Solution'],
  },
  {
    roleId: 'dna_rna_shield',
    label: 'DNA/RNA Shield',
    normalizedId: 'dna-rna-shield',
    sourceIncludes: ['DNA/RNA Shield'],
  },
  {
    roleId: 'magbinding_buffer',
    label: 'ZymoBIOMICS MagBinding Buffer',
    normalizedId: 'zymo-magbinding-buffer',
    sourceIncludes: ['ZymoBIOMICS MagBinding Buffer'],
  },
  {
    roleId: 'magbinding_beads',
    label: 'ZymoBIOMICS MagBinding Beads',
    normalizedId: 'zymo-magbinding-beads',
    sourceIncludes: ['ZymoBIOMICS MagBinding Beads'],
  },
  {
    roleId: 'magwash_1',
    label: 'ZymoBIOMICS MagWash 1',
    normalizedId: 'zymo-magwash-1',
    sourceIncludes: ['ZymoBIOMICS MagWash 1'],
  },
  {
    roleId: 'magwash_2',
    label: 'ZymoBIOMICS MagWash 2',
    normalizedId: 'zymo-magwash-2',
    sourceIncludes: ['ZymoBIOMICS MagWash 2'],
  },
  {
    roleId: 'dnase_rnase_free_water',
    label: 'ZymoBIOMICS DNase/RNase Free Water',
    normalizedId: 'zymo-dnase-rnase-free-water',
    sourceIncludes: ['ZymoBIOMICS DNase/RNase Free Water'],
  },
  {
    roleId: 'sample',
    label: 'sample',
    normalizedId: 'sample',
    sourceIncludes: [],
  },
  {
    roleId: 'eluted_dna',
    label: 'eluted DNA',
    normalizedId: 'eluted-dna',
    sourceIncludes: [],
  },
] as const;

const ZYMO_LABWARE_ROLE_MAP = [
  {
    roleId: 'primary_sample_plate',
    label: 'primary sample plate',
    normalizedId: '96-well-deepwell-plate',
    sourceIncludes: ['deep-well block', '96-well block'],
  },
  {
    roleId: 'reagent_reservoir',
    label: 'reagent reservoir',
    normalizedId: '12-well-reservoir',
    sourceIncludes: [],
  },
  {
    roleId: 'elution_plate',
    label: 'elution plate',
    normalizedId: '96-well-conical-pcr-plate',
    sourceIncludes: ['clean elution plate or tube'],
  },
  {
    roleId: 'lysis_module',
    label: 'BashingBead lysis module',
    normalizedId: 'bashingbead-lysis-module',
    sourceIncludes: ['BashingBead Lysis Rack', 'ZR BashingBead Lysis Tubes'],
  },
  {
    roleId: 'waste',
    label: 'liquid waste',
    sourceIncludes: [],
  },
] as const;

const ZYMO_INSTRUMENT_ROLE_MAP = [
  { roleId: 'liquid_handler', label: 'liquid handler', normalizedId: 'liquid-handler', sourceIncludes: [] },
  { roleId: 'pipette_8ch_1000ul', label: '8-channel 1000 uL pipette', normalizedId: 'p1000-multi', sourceIncludes: ['pipette'] },
  { roleId: 'magnetic_stand', label: 'magnetic stand', normalizedId: 'magnetic-stand', sourceIncludes: ['magnetic stand'], status: 'manual' },
  { roleId: 'heater', label: 'heater', normalizedId: 'heating-element', sourceIncludes: ['heating element'], status: 'manual' },
  { roleId: 'bead_beater', label: 'bead beater', normalizedId: 'bead-beater', sourceIncludes: ['bead beater'], status: 'manual' },
  { roleId: 'centrifuge', label: 'centrifuge', normalizedId: 'centrifuge', sourceIncludes: ['centrifuge'], status: 'manual' },
  { roleId: 'heat_sealer', label: 'heat sealing device', normalizedId: 'heat-sealer', sourceIncludes: ['heat sealing device'], status: 'manual' },
  { roleId: 'plate_shaker', label: 'shaker plate', normalizedId: 'plate-shaker', sourceIncludes: ['shaker plate'], status: 'manual' },
] as const;

export interface ZymoAdaptationOptions {
  directive?: string;
  sampleCount?: number;
}

function findSourceLabels(candidate: ProtocolCandidate, labels: readonly string[]): string[] {
  const all = [
    ...candidate.materials.map((item) => item.label),
    ...candidate.labware.map((item) => item.label),
    ...candidate.equipment.map((item) => item.label),
    ...candidate.outputs.map((item) => item.label),
  ];
  return labels.filter((label) => all.some((sourceLabel) => sourceLabel.toLowerCase() === label.toLowerCase()));
}

function roleProvenance(candidate: ProtocolCandidate, sourceLabels: string[]) {
  const items = [...candidate.materials, ...candidate.labware, ...candidate.equipment, ...candidate.outputs];
  return items.find((item) => sourceLabels.includes(item.label))?.provenance;
}

export function normalizeZymoProtocolCandidate(candidate: ProtocolCandidate): NormalizedProtocolCandidate {
  const gaps: ProtocolAdaptationGap[] = [];
  const materialRoles: NormalizedProtocolRole[] = ZYMO_MATERIAL_ROLE_MAP.map((role) => {
    const sourceLabels = role.sourceIncludes.length > 0 ? findSourceLabels(candidate, role.sourceIncludes) : [role.label];
    const found = sourceLabels.length > 0 || role.roleId === 'sample' || role.roleId === 'eluted_dna';
    if (!found) {
      gaps.push({
        code: 'zymo_material_role_unresolved',
        severity: 'warning',
        message: `Could not resolve Zymo material role ${role.roleId}.`,
      });
    }
    return {
      roleId: role.roleId,
      label: role.label,
      normalizedId: role.normalizedId,
      roleKind: role.roleId === 'eluted_dna' ? 'output' : 'material',
      status: found ? 'resolved' : 'unresolved',
      sourceLabels,
      provenance: roleProvenance(candidate, sourceLabels),
    };
  });

  const labwareRoles: NormalizedProtocolRole[] = ZYMO_LABWARE_ROLE_MAP.map((role) => {
    const sourceLabels = role.sourceIncludes.length > 0 ? findSourceLabels(candidate, role.sourceIncludes) : [role.label];
    const unresolved = role.roleId === 'waste';
    if (unresolved) {
      gaps.push({
        code: 'zymo_waste_role_unresolved',
        severity: 'warning',
        message: 'Waste handling is not specified by the vendor protocol or current platform context.',
      });
    }
    return {
      roleId: role.roleId,
      label: role.label,
      ...(role.normalizedId ? { normalizedId: role.normalizedId } : {}),
      roleKind: 'labware',
      status: unresolved ? 'unresolved' : 'resolved',
      sourceLabels,
      provenance: roleProvenance(candidate, sourceLabels),
    };
  });

  const instrumentRoles: NormalizedProtocolRole[] = ZYMO_INSTRUMENT_ROLE_MAP.map((role) => {
    const sourceLabels = role.sourceIncludes.length > 0 ? findSourceLabels(candidate, role.sourceIncludes) : [role.label];
    return {
      roleId: role.roleId,
      label: role.label,
      normalizedId: role.normalizedId,
      roleKind: 'instrument',
      status: role.status ?? 'resolved',
      sourceLabels,
      provenance: roleProvenance(candidate, sourceLabels),
      ...(role.status === 'manual' ? { notes: ['Manual/off-deck in v1 adaptation unless platform capabilities say otherwise.'] } : {}),
    };
  });

  return {
    kind: 'normalized-vendor-protocol-candidate',
    source: candidate.source,
    title: candidate.title,
    candidate,
    materialRoles,
    labwareRoles,
    instrumentRoles,
    outputRoles: materialRoles.filter((role) => role.roleKind === 'output'),
    diagnostics: candidate.diagnostics,
    gaps,
  };
}

function quantityValue(action: ProtocolActionCandidate, materialLabel: string): number {
  return action.material === materialLabel && typeof action.volume?.value === 'number' ? action.volume.value : 0;
}

function sumStepActionVolumes(candidate: ProtocolCandidate, stepNumber: number, materialLabel: string): number {
  const step = candidate.steps.find((candidateStep) => candidateStep.stepNumber === stepNumber);
  return step?.actions.reduce((sum, action) => sum + quantityValue(action, materialLabel), 0) ?? 0;
}

function derivePerSampleVolumes(candidate: ProtocolCandidate): Record<string, number> {
  const magBindingBuffer =
    sumStepActionVolumes(candidate, 5, 'ZymoBIOMICS MagBinding Buffer') +
    sumStepActionVolumes(candidate, 8, 'ZymoBIOMICS MagBinding Buffer');
  const magWash2Base = sumStepActionVolumes(candidate, 12, 'ZymoBIOMICS MagWash 2');
  return {
    magbinding_buffer: magBindingBuffer || 1100,
    dnase_rnase_free_water: sumStepActionVolumes(candidate, 16, 'ZymoBIOMICS DNase/RNase Free Water') || 50,
    magwash_1: sumStepActionVolumes(candidate, 10, 'ZymoBIOMICS MagWash 1') || 500,
    magwash_2: (magWash2Base || 900) * 2,
    magbinding_beads: sumStepActionVolumes(candidate, 6, 'ZymoBIOMICS MagBinding Beads') || 25,
  };
}

function deadVolume(totalTransferVolumeUl: number): number {
  return Math.max(DEAD_VOLUME_MINIMUM_UL, Math.ceil(totalTransferVolumeUl * DEAD_VOLUME_PERCENT));
}

function nextReservoirWell(used: Set<string>, preferred: string): string | undefined {
  if (!used.has(preferred)) {
    return preferred;
  }
  return RESERVOIR_WELLS.find((well) => !used.has(well));
}

function allocateReservoirWells(input: {
  roleId: string;
  materialLabel: string;
  preferredWell: string;
  perSampleVolumeUl: number;
  sampleCount: number;
  used: Set<string>;
}): ReservoirAllocation {
  const totalTransferVolumeUl = input.perSampleVolumeUl * input.sampleCount;
  const deadVolumeUl = deadVolume(totalTransferVolumeUl);
  const requiredVolumeUl = totalTransferVolumeUl + deadVolumeUl;
  const requiredWells = Math.ceil(requiredVolumeUl / RESERVOIR_WELL_CAPACITY_UL);
  const wells: Array<{ well: string; loadVolumeUl: number }> = [];
  let remaining = requiredVolumeUl;
  for (let i = 0; i < requiredWells; i += 1) {
    const well = nextReservoirWell(input.used, i === 0 ? input.preferredWell : RESERVOIR_WELLS[0]!);
    if (!well) {
      break;
    }
    input.used.add(well);
    const loadVolumeUl = Math.min(remaining, RESERVOIR_WELL_CAPACITY_UL);
    wells.push({ well, loadVolumeUl });
    remaining -= loadVolumeUl;
  }
  return {
    roleId: input.roleId,
    materialLabel: input.materialLabel,
    preferredWell: input.preferredWell,
    wells,
    perSampleVolumeUl: input.perSampleVolumeUl,
    sampleCount: input.sampleCount,
    totalTransferVolumeUl,
    deadVolumeUl,
    requiredVolumeUl,
    requiredWells,
    capacityPerWellUl: RESERVOIR_WELL_CAPACITY_UL,
    ...(remaining > 0
      ? { warning: `Insufficient free reservoir wells; ${remaining} uL remains unallocated.` }
      : {}),
  };
}

function createReservoirPlan(candidate: ProtocolCandidate, sampleCount: number): ProtocolReservoirPlan {
  const used = new Set<string>();
  const perSample = derivePerSampleVolumes(candidate);
  const allocationInputs = [
    ['magbinding_buffer', 'ZymoBIOMICS MagBinding Buffer', 'A1', perSample.magbinding_buffer],
    ['dnase_rnase_free_water', 'ZymoBIOMICS DNase/RNase Free Water', 'A2', perSample.dnase_rnase_free_water],
    ['magwash_1', 'ZymoBIOMICS MagWash 1', 'A3', perSample.magwash_1],
    ['magwash_2', 'ZymoBIOMICS MagWash 2', 'A5', perSample.magwash_2],
    ['magbinding_beads', 'ZymoBIOMICS MagBinding Beads', 'A7', perSample.magbinding_beads],
  ] as const;
  const allocations = allocationInputs.map(([roleId, materialLabel, preferredWell, perSampleVolumeUl]) =>
    allocateReservoirWells({ roleId, materialLabel, preferredWell, perSampleVolumeUl, sampleCount, used }));
  const totalRequiredVolumeUl = allocations.reduce((sum, allocation) => sum + allocation.requiredVolumeUl, 0);
  const totalAllocatedVolumeUl = allocations.reduce(
    (sum, allocation) => sum + allocation.wells.reduce((wellSum, well) => wellSum + well.loadVolumeUl, 0),
    0,
  );
  return {
    reservoirRoleId: 'reagent_reservoir',
    reservoirLabwareType: '12-well-reservoir',
    wellCapacityUl: RESERVOIR_WELL_CAPACITY_UL,
    totalCapacityUl: RESERVOIR_WELLS.length * RESERVOIR_WELL_CAPACITY_UL,
    sampleCount,
    deadVolumePolicy: {
      kind: 'percent-plus-minimum',
      percent: DEAD_VOLUME_PERCENT,
      minimumUl: DEAD_VOLUME_MINIMUM_UL,
    },
    allocations,
    totalRequiredVolumeUl,
    totalAllocatedVolumeUl,
    unallocatedRequiredVolumeUl: totalRequiredVolumeUl - totalAllocatedVolumeUl,
  };
}

function roleBinding(role: NormalizedProtocolRole, fallbackBinding?: string) {
  return {
    roleId: role.roleId,
    label: role.label,
    binding: role.normalizedId ?? fallbackBinding ?? 'unresolved',
    status: role.status,
    reason: role.status === 'manual'
      ? 'Manual/off-deck in v1 unless platform capability is supplied.'
      : role.status === 'unresolved'
        ? 'No deterministic binding available from source document or default context.'
        : 'Resolved by deterministic Zymo role map.',
  };
}

function actionSupport(action: ProtocolActionCandidate) {
  if (['centrifuge', 'magnetize', 'dry', 'seal'].includes(action.actionKind)) {
    return {
      support: 'manual' as const,
      reason: `${action.actionKind} is manual/off-deck in the v1 Zymo adaptation.`,
    };
  }
  if (['aspirate', 'discard'].includes(action.actionKind)) {
    return {
      support: 'unresolved' as const,
      reason: 'Waste handling is not bound; keep aspirate/discard as a visible gap.',
    };
  }
  if (action.equipment === 'shaker plate') {
    return {
      support: 'manual' as const,
      reason: 'Shaker-based mixing requires platform capability; pipette mix can be reviewed as an alternative.',
    };
  }
  if (['add', 'transfer', 'mix', 'elute', 'repeat'].includes(action.actionKind)) {
    return {
      support: 'automatable' as const,
      reason: 'Can be represented as a liquid-handling adaptation action for review.',
    };
  }
  return {
    support: 'manual' as const,
    reason: 'Unsupported vendor instruction preserved as manual review action.',
  };
}

function createStepPlan(candidate: ProtocolCandidate): ProtocolStepAdaptation[] {
  return candidate.steps.map((step) => {
    const adaptedActions = step.actions.map((action) => {
      const support = actionSupport(action);
      return {
        actionKind: action.actionKind,
        support: support.support,
        eventHint: support.support === 'automatable' ? action.actionKind : undefined,
        roleRefs: [
          ...(action.material ? [materialRoleForLabel(action.material)] : []),
          ...(action.equipment ? [instrumentRoleForLabel(action.equipment)] : []),
        ].filter((role): role is string => Boolean(role)),
        reason: support.reason,
      };
    });
    const supports = new Set(adaptedActions.map((action) => action.support));
    const support = supports.has('unresolved')
      ? 'unresolved'
      : supports.has('manual') && supports.has('automatable')
        ? 'partial'
        : supports.has('manual')
          ? 'manual'
          : 'automatable';
    return {
      stepNumber: step.stepNumber,
      sourceText: step.sourceText,
      support,
      adaptedActions,
      provenance: step.provenance,
    };
  });
}

function materialRoleForLabel(label: string): string | undefined {
  return ZYMO_MATERIAL_ROLE_MAP.find((role) => role.label === label)?.roleId;
}

function instrumentRoleForLabel(label: string): string | undefined {
  return ZYMO_INSTRUMENT_ROLE_MAP.find((role) => role.label === label)?.roleId;
}

function createManualSteps(stepPlan: ProtocolStepAdaptation[]): ProtocolManualStep[] {
  return stepPlan
    .filter((step) => step.support === 'manual' || step.support === 'partial' || step.support === 'unresolved')
    .map((step) => ({
      stepNumber: step.stepNumber,
      reason: step.adaptedActions
        .filter((action) => action.support !== 'automatable')
        .map((action) => action.reason)
        .join(' '),
      equipmentRoles: Array.from(new Set(step.adaptedActions.flatMap((action) => action.roleRefs ?? []).filter((role) =>
        ZYMO_INSTRUMENT_ROLE_MAP.some((instrumentRole) => instrumentRole.roleId === role)))),
      sourceText: step.sourceText,
      provenance: step.provenance,
    }));
}

function adaptationGaps(
  normalized: NormalizedProtocolCandidate,
  reservoirPlan: ProtocolReservoirPlan,
  stepPlan: ProtocolStepAdaptation[],
): ProtocolAdaptationGap[] {
  const gaps: ProtocolAdaptationGap[] = [...normalized.gaps];
  if (reservoirPlan.unallocatedRequiredVolumeUl > 0) {
    gaps.push({
      code: 'zymo_reservoir_capacity_exceeded',
      severity: 'warning',
      message: `One 12-well reservoir cannot hold all planned Zymo reagents with dead volume; ${reservoirPlan.unallocatedRequiredVolumeUl} uL remains unallocated.`,
    });
  }
  gaps.push({
    code: 'zymo_branch_selection_required',
    severity: 'warning',
    message: 'Step 1 contains BashingBead rack/tube lysis-volume branches; no branch is selected automatically.',
    sourceStepNumbers: [1],
    provenance: normalized.candidate.steps.find((step) => step.stepNumber === 1)?.provenance,
  });
  gaps.push({
    code: 'zymo_waste_handling_required',
    severity: 'warning',
    message: 'Aspirate/discard steps require a waste reservoir, sink, or manual disposal policy.',
    sourceStepNumbers: stepPlan
      .filter((step) => step.adaptedActions.some((action) => action.actionKind === 'aspirate' || action.actionKind === 'discard'))
      .map((step) => step.stepNumber),
  });
  for (const step of stepPlan.filter((candidateStep) => candidateStep.support === 'manual' || candidateStep.support === 'partial')) {
    if (step.adaptedActions.some((action) => action.support === 'manual')) {
      gaps.push({
        code: 'zymo_manual_or_offdeck_step',
        severity: 'info',
        message: `Vendor step ${step.stepNumber} includes manual/off-deck handling in the v1 adaptation.`,
        sourceStepNumbers: [step.stepNumber],
        provenance: step.provenance,
      });
    }
  }
  return gaps;
}

export function createZymoDeepwellAdaptationPlan(
  normalized: NormalizedProtocolCandidate,
  options: ZymoAdaptationOptions = {},
): ProtocolAdaptationPlan {
  const sampleCount = options.sampleCount ?? DEFAULT_SAMPLE_COUNT;
  const directive = options.directive ?? 'suggest a version to run in 96-well deepwell plates';
  const reservoirPlan = createReservoirPlan(normalized.candidate, sampleCount);
  const stepPlan = createStepPlan(normalized.candidate);
  const manualSteps = createManualSteps(stepPlan);
  const gaps = adaptationGaps(normalized, reservoirPlan, stepPlan);

  return {
    kind: 'protocol-adaptation-plan',
    protocolTitle: normalized.title,
    targetFormat: {
      request: directive,
      primaryLabwareType: '96-well-deepwell-plate',
      sampleCount,
      sampleWellSelector: { role: 'all_wells', count: sampleCount },
    },
    labwareRoles: normalized.labwareRoles.map((role) => roleBinding(role)),
    materialRoles: normalized.materialRoles.map((role) => roleBinding(role)),
    instrumentRoles: normalized.instrumentRoles.map((role) => roleBinding(role)),
    deckPlanHints: [
      { roleId: 'primary_sample_plate', labwareType: '96-well-deepwell-plate', preferredSlot: 'target', reason: 'Primary 96-well deepwell run format.' },
      { roleId: 'reagent_reservoir', labwareType: '12-well-reservoir', preferredSlot: 'source', reason: 'Reservoir source for liquid-handling reagents.' },
      { roleId: 'elution_plate', labwareType: '96-well-conical-pcr-plate', preferredSlot: 'output', reason: 'Clean destination for eluted DNA.' },
    ],
    reservoirPlan,
    stepPlan,
    manualSteps,
    compileAssumptions: [
      'All 96 wells of the primary deepwell plate are occupied unless the user provides a subset.',
      'A single 12-well reservoir is the default reagent source; capacity overflow is reported as a gap.',
      'Use an 8-channel 1000 uL pipette for supportable liquid-handling steps.',
      'Bead beating, centrifugation, magnetic-stand moves, heat sealing, and heating are manual/off-deck in v1 unless platform capabilities are supplied.',
      'Step 14 repeats the MagWash 2 wash and magnetization sequence from steps 12-13.',
    ],
    gaps,
    sourceProtocolRef: {
      documentId: normalized.source.documentId,
      title: normalized.title,
      ...(normalized.source.version ? { version: normalized.source.version } : {}),
    },
  };
}


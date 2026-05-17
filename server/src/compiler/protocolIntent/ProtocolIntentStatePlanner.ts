import type {
  LabwareOrientation,
  ProtocolIntent,
  ProtocolIntentId,
  ProtocolMaterialAliquotIntent,
  ProtocolMaterialDefinitionIntent,
  ProtocolMaterialFormulationIntent,
  ProtocolOperationIntent,
  ProtocolPatternIntent,
  ProtocolPipetteIntent,
  ProtocolTipResourceIntent,
  ProtocolUnresolvedFact,
  ProtocolWasteIntent,
} from './ProtocolIntent.js';
import type { Pass, PassDiagnostic, PassResult } from '../pipeline/types.js';

export interface ProtocolIntentStateAliquot {
  id: ProtocolIntentId;
  materialRef?: ProtocolIntentId;
  formulation?: ProtocolIntentId;
  volumeUl?: number;
  sourceOperationId?: ProtocolIntentId;
}

export interface ProtocolIntentLabwareState {
  id: ProtocolIntentId;
  labwareHint: string;
  deckSlot?: string;
  orientation: LabwareOrientation;
  role?: string;
  contents: Record<string, ProtocolIntentStateAliquot[]>;
  incubation?: {
    temperatureC?: number;
    co2Percent?: number;
    durationSeconds?: number;
    sourceOperationId?: ProtocolIntentId;
  };
  flags?: Record<string, unknown>;
}

export interface ProtocolIntentPipetteState {
  id: ProtocolIntentId;
  label: string;
  channels?: number;
  maxVolumeUl?: number;
  adjustableSpacing?: boolean;
  mount?: string;
  activeTipSpacingMm?: number;
  activeTipResourceId?: ProtocolIntentId;
}

export interface ProtocolIntentTipState {
  id: ProtocolIntentId;
  label: string;
  volumeUl?: number;
  orientation?: LabwareOrientation;
  deckSlot?: string;
  compatiblePipette?: ProtocolIntentId;
  loaded: boolean;
}

export interface ProtocolIntentWasteState {
  id: ProtocolIntentId;
  label: string;
  deckSlot?: string;
}

export interface ProtocolIntentPendingAspirate {
  operationId: ProtocolIntentId;
  pipetteId?: ProtocolIntentId;
  sourceLabware?: ProtocolIntentId;
  sourceWell?: string;
  materialRef?: ProtocolIntentId;
  formulation?: ProtocolIntentId;
  volumeUl?: number;
}

export interface ProtocolIntentActiveState {
  pipetteId?: ProtocolIntentId;
  tipResourceId?: ProtocolIntentId;
  pendingAspirates: ProtocolIntentPendingAspirate[];
}

export interface ProtocolIntentStateSnapshot {
  labware: Record<string, ProtocolIntentLabwareState>;
  materials: Record<string, ProtocolMaterialDefinitionIntent>;
  formulations: Record<string, ProtocolMaterialFormulationIntent>;
  pipettes: Record<string, ProtocolIntentPipetteState>;
  tips: Record<string, ProtocolIntentTipState>;
  waste: Record<string, ProtocolIntentWasteState>;
  active: ProtocolIntentActiveState;
  assumptions: string[];
  unresolved: ProtocolUnresolvedFact[];
}

export interface ProtocolIntentStateTransition {
  index: number;
  operationId?: ProtocolIntentId;
  stepId?: string;
  kind: string;
  message: string;
  state: ProtocolIntentStateSnapshot;
}

export interface ProtocolIntentStateBlocker {
  code: string;
  message: string;
  operationId?: ProtocolIntentId;
  stepId?: string;
  details?: Record<string, unknown>;
}

export interface ProtocolIntentStatePlan {
  kind: 'protocol-intent-state-plan';
  source: 'protocolIntent';
  status: 'ready' | 'blocked';
  intentId: ProtocolIntentId;
  finalState: ProtocolIntentStateSnapshot;
  transitions: ProtocolIntentStateTransition[];
  blockers: ProtocolIntentStateBlocker[];
  patternsPendingExpansion: ProtocolPatternIntent[];
}

export interface ProtocolIntentStatePlannerOutput {
  protocolIntentStatePlan?: ProtocolIntentStatePlan;
}

function cloneState(state: ProtocolIntentStateSnapshot): ProtocolIntentStateSnapshot {
  return structuredClone(state) as ProtocolIntentStateSnapshot;
}

function compactRecord<T>(record: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function stringParam(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberParam(params: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeOrientation(value: unknown): LabwareOrientation | undefined {
  return value === 'landscape' || value === 'portrait' || value === 'unknown'
    ? value
    : undefined;
}

function normalizeId(label: string, prefix: string): string {
  const body = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${prefix}_${body || 'unknown'}`;
}

function initialState(intent: ProtocolIntent): ProtocolIntentStateSnapshot {
  const state: ProtocolIntentStateSnapshot = {
    labware: {},
    materials: {},
    formulations: {},
    pipettes: {},
    tips: {},
    waste: {},
    active: { pendingAspirates: [] },
    assumptions: intent.assumptions.map((assumption) => assumption.message),
    unresolved: [...intent.unresolved],
  };

  for (const labware of intent.resources.labwareInstances) {
    state.labware[labware.id] = {
      id: labware.id,
      labwareHint: labware.labwareHint,
      ...(labware.deckSlot ? { deckSlot: labware.deckSlot } : {}),
      orientation: labware.currentOrientation ?? labware.initialOrientation ?? 'unknown',
      ...(labware.role ? { role: labware.role } : {}),
      contents: {},
    };
  }

  for (const material of intent.resources.materialDefinitions) {
    state.materials[material.id] = material;
  }
  for (const formulation of intent.resources.materialFormulations) {
    state.formulations[formulation.id] = formulation;
  }
  for (const pipette of intent.resources.pipettes) {
    state.pipettes[pipette.id] = pipetteState(pipette);
  }
  for (const tip of intent.resources.tips) {
    state.tips[tip.id] = tipState(tip, false);
  }
  for (const waste of intent.resources.waste) {
    state.waste[waste.id] = wasteState(waste);
  }
  for (const aliquot of intent.resources.materialAliquots) {
    addAliquot(state, aliquot);
  }

  return state;
}

function pipetteState(pipette: ProtocolPipetteIntent): ProtocolIntentPipetteState {
  return compactRecord<ProtocolIntentPipetteState>({
    id: pipette.id,
    label: pipette.label,
    channels: pipette.channels,
    maxVolumeUl: pipette.maxVolumeUl,
    adjustableSpacing: pipette.adjustableSpacing,
    mount: pipette.mount,
  });
}

function tipState(tip: ProtocolTipResourceIntent, loaded: boolean): ProtocolIntentTipState {
  return compactRecord<ProtocolIntentTipState>({
    id: tip.id,
    label: tip.label,
    volumeUl: tip.volumeUl,
    orientation: tip.orientation,
    deckSlot: tip.deckSlot,
    compatiblePipette: tip.compatiblePipette,
    loaded,
  });
}

function wasteState(waste: ProtocolWasteIntent): ProtocolIntentWasteState {
  return compactRecord<ProtocolIntentWasteState>({
    id: waste.id,
    label: waste.label,
    deckSlot: waste.deckSlot,
  });
}

function addAliquot(state: ProtocolIntentStateSnapshot, aliquot: ProtocolMaterialAliquotIntent): void {
  const labware = state.labware[aliquot.labware];
  if (!labware) return;
  const wells = aliquot.wells ?? (aliquot.well ? [aliquot.well] : []);
  for (const well of wells) {
    const contents = labware.contents[well] ?? [];
    contents.push(compactRecord<ProtocolIntentStateAliquot>({
      id: aliquot.id,
      materialRef: aliquot.materialRef,
      formulation: aliquot.formulation,
      volumeUl: aliquot.volumeUl,
    }));
    labware.contents[well] = contents;
  }
}

function ensurePipette(state: ProtocolIntentStateSnapshot, op: ProtocolOperationIntent): string | undefined {
  if (op.pipette && state.pipettes[op.pipette]) return op.pipette;
  if (state.active.pipetteId && state.pipettes[state.active.pipetteId]) return state.active.pipetteId;
  const pipetteType = stringParam(op.params, 'pipetteType') ?? stringParam(op.params, 'to');
  if (!pipetteType) return undefined;
  const id = normalizeId(pipetteType, 'pipette');
  state.pipettes[id] = {
    id,
    label: pipetteType,
  };
  return id;
}

function ensureTipResource(state: ProtocolIntentStateSnapshot, op: ProtocolOperationIntent): string | undefined {
  if (op.tipResource && state.tips[op.tipResource]) return op.tipResource;
  if (state.active.tipResourceId && state.tips[state.active.tipResourceId]) return state.active.tipResourceId;
  const tipLabel = stringParam(op.params, 'tipResource') ?? stringParam(op.params, 'tipType');
  if (!tipLabel) return undefined;
  const id = normalizeId(tipLabel, 'tips');
  state.tips[id] = compactRecord<ProtocolIntentTipState>({
    id,
    label: tipLabel,
    volumeUl: numberParam(op.params, 'volumeUl'),
    orientation: normalizeOrientation(op.params?.orientation),
    loaded: false,
  });
  return id;
}

function addBlocker(
  blockers: ProtocolIntentStateBlocker[],
  op: ProtocolOperationIntent,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  blockers.push({
    code,
    message,
    ...(op.id ? { operationId: op.id } : {}),
    ...(op.stepId ? { stepId: op.stepId } : {}),
    ...(details ? { details } : {}),
  });
}

function appendTransition(
  transitions: ProtocolIntentStateTransition[],
  op: ProtocolOperationIntent,
  state: ProtocolIntentStateSnapshot,
  message: string,
): void {
  transitions.push({
    index: transitions.length,
    operationId: op.id,
    ...(op.stepId ? { stepId: op.stepId } : {}),
    kind: op.kind,
    message,
    state: cloneState(state),
  });
}

function foldOperation(
  state: ProtocolIntentStateSnapshot,
  op: ProtocolOperationIntent,
  blockers: ProtocolIntentStateBlocker[],
): string {
  switch (op.kind) {
    case 'place_labware': {
      const labwareId = op.labware ?? op.targetLabware;
      if (!labwareId || !state.labware[labwareId]) {
        addBlocker(blockers, op, 'unknown_labware', 'place_labware references unknown labware.', { labwareId });
        return 'place_labware could not resolve labware';
      }
      const slot = stringParam(op.params, 'deckSlot');
      if (slot) state.labware[labwareId]!.deckSlot = slot;
      return `placed ${labwareId}`;
    }
    case 'load_material': {
      const labwareId = op.labware ?? op.targetLabware;
      if (!labwareId || !state.labware[labwareId]) {
        addBlocker(blockers, op, 'unknown_labware', 'load_material references unknown labware.', { labwareId });
        return 'load_material could not resolve labware';
      }
      const wells = op.targetWells ?? (op.sourceWell ? [op.sourceWell] : []);
      if (wells.length === 0) {
        addBlocker(blockers, op, 'missing_well', 'load_material has no target well.');
        return 'load_material has no target well';
      }
      for (const well of wells) {
        const contents = state.labware[labwareId]!.contents[well] ?? [];
        contents.push(compactRecord<ProtocolIntentStateAliquot>({
          id: `${op.id}_${well}`,
          materialRef: op.materialRef,
          formulation: op.formulation,
          volumeUl: op.volumeUl,
          sourceOperationId: op.id,
        }));
        state.labware[labwareId]!.contents[well] = contents;
      }
      return `loaded material into ${labwareId}`;
    }
    case 'reorient_labware': {
      const labwareId = op.labware ?? op.targetLabware ?? stringParam(op.params, 'labware');
      const orientation = normalizeOrientation(op.params?.orientation) ?? normalizeOrientation(op.params?.to);
      if (!labwareId || !state.labware[labwareId]) {
        addBlocker(blockers, op, 'unknown_labware', 'reorient_labware references unknown labware.', { labwareId });
        return 'reorient_labware could not resolve labware';
      }
      if (!orientation) {
        addBlocker(blockers, op, 'missing_orientation', 'reorient_labware has no orientation.');
        return 'reorient_labware has no orientation';
      }
      state.labware[labwareId]!.orientation = orientation;
      return `reoriented ${labwareId} to ${orientation}`;
    }
    case 'set_active_pipette':
    case 'swap_pipette': {
      const pipetteId = ensurePipette(state, op);
      if (!pipetteId) {
        addBlocker(blockers, op, 'unknown_pipette', `${op.kind} could not resolve a pipette.`);
        return `${op.kind} could not resolve pipette`;
      }
      state.active.pipetteId = pipetteId;
      return `active pipette is ${pipetteId}`;
    }
    case 'replace_tips': {
      const tipResourceId = ensureTipResource(state, op);
      if (!tipResourceId) {
        addBlocker(blockers, op, 'unknown_tips', 'replace_tips could not resolve a tip resource.');
        return 'replace_tips could not resolve tips';
      }
      for (const tip of Object.values(state.tips)) tip.loaded = false;
      state.tips[tipResourceId]!.loaded = true;
      state.active.tipResourceId = tipResourceId;
      return `active tips are ${tipResourceId}`;
    }
    case 'set_tip_spacing': {
      const pipetteId = ensurePipette(state, op);
      const spacingMm = op.spacingMm ?? numberParam(op.params, 'spacingMm');
      if (!pipetteId) {
        addBlocker(blockers, op, 'unknown_pipette', 'set_tip_spacing has no active/resolved pipette.');
        return 'set_tip_spacing could not resolve pipette';
      }
      if (spacingMm === undefined) {
        addBlocker(blockers, op, 'missing_tip_spacing', 'set_tip_spacing has no spacingMm.');
        return 'set_tip_spacing has no spacing';
      }
      state.pipettes[pipetteId]!.activeTipSpacingMm = spacingMm;
      state.active.pipetteId = pipetteId;
      return `set ${pipetteId} spacing to ${spacingMm} mm`;
    }
    case 'aspirate': {
      const pipetteId = ensurePipette(state, op);
      state.active.pendingAspirates.push(compactRecord<ProtocolIntentPendingAspirate>({
        operationId: op.id,
        pipetteId,
        sourceLabware: op.sourceLabware ?? op.labware,
        sourceWell: op.sourceWell,
        materialRef: op.materialRef,
        formulation: op.formulation,
        volumeUl: op.volumeUl,
      }));
      return `recorded aspirate ${op.id}`;
    }
    case 'dispense': {
      const targetLabware = op.targetLabware ?? op.labware;
      if (targetLabware && state.labware[targetLabware] && state.active.pendingAspirates.length > 0) {
        const pending = state.active.pendingAspirates.shift()!;
        for (const well of op.targetWells ?? []) {
          const contents = state.labware[targetLabware]!.contents[well] ?? [];
          contents.push(compactRecord<ProtocolIntentStateAliquot>({
            id: `${op.id}_${well}`,
            materialRef: op.materialRef ?? pending.materialRef,
            formulation: op.formulation ?? pending.formulation,
            volumeUl: op.volumeUl ?? pending.volumeUl,
            sourceOperationId: op.id,
          }));
          state.labware[targetLabware]!.contents[well] = contents;
        }
      }
      return `recorded dispense ${op.id}`;
    }
    case 'transfer': {
      const targetLabware = op.targetLabware ?? op.labware;
      if (!targetLabware || !state.labware[targetLabware]) {
        addBlocker(blockers, op, 'unknown_target_labware', 'transfer references unknown target labware.', { targetLabware });
        return 'transfer could not resolve target labware';
      }
      for (const well of op.targetWells ?? []) {
        const contents = state.labware[targetLabware]!.contents[well] ?? [];
        contents.push(compactRecord<ProtocolIntentStateAliquot>({
          id: `${op.id}_${well}`,
          materialRef: op.materialRef,
          formulation: op.formulation,
          volumeUl: op.volumeUl,
          sourceOperationId: op.id,
        }));
        state.labware[targetLabware]!.contents[well] = contents;
      }
      return `recorded transfer ${op.id}`;
    }
    case 'media_swap': {
      const targetLabware = op.targetLabware ?? op.labware;
      if (!targetLabware || !state.labware[targetLabware]) {
        addBlocker(blockers, op, 'unknown_target_labware', 'media_swap references unknown target labware.', { targetLabware });
        return 'media_swap could not resolve target labware';
      }
      state.labware[targetLabware]!.flags = {
        ...(state.labware[targetLabware]!.flags ?? {}),
        mediaSwapPendingExpansion: true,
      };
      return `marked media swap on ${targetLabware}`;
    }
    case 'incubate': {
      const labwareId = op.labware ?? op.targetLabware;
      if (!labwareId || !state.labware[labwareId]) {
        addBlocker(blockers, op, 'unknown_labware', 'incubate references unknown labware.', { labwareId });
        return 'incubate could not resolve labware';
      }
      state.labware[labwareId]!.incubation = compactRecord<NonNullable<ProtocolIntentLabwareState['incubation']>>({
        temperatureC: op.temperatureC,
        co2Percent: op.co2Percent,
        durationSeconds: op.durationSeconds,
        sourceOperationId: op.id,
      });
      return `incubated ${labwareId}`;
    }
    case 'eject_tips': {
      if (state.active.tipResourceId && state.tips[state.active.tipResourceId]) {
        state.tips[state.active.tipResourceId]!.loaded = false;
      }
      delete state.active.tipResourceId;
      state.active.pendingAspirates = [];
      return 'ejected tips and cleared pending aspirates';
    }
    case 'pipette_mix':
      return `recorded pipette mix ${op.id}`;
    default:
      return `recorded ${op.kind}`;
  }
}

export function planProtocolIntentState(intent: ProtocolIntent): ProtocolIntentStatePlan {
  const state = initialState(intent);
  const transitions: ProtocolIntentStateTransition[] = [];
  const blockers: ProtocolIntentStateBlocker[] = intent.unresolved
    .filter((fact) => fact.blocksLowering)
    .map((fact) => ({
      code: `unresolved_${fact.kind}`,
      message: fact.reason,
      details: { id: fact.id, label: fact.label },
    }));

  for (const op of intent.operations) {
    const message = foldOperation(state, op, blockers);
    appendTransition(transitions, op, state, message);
  }

  return {
    kind: 'protocol-intent-state-plan',
    source: 'protocolIntent',
    status: blockers.length > 0 ? 'blocked' : 'ready',
    intentId: intent.intentId,
    finalState: cloneState(state),
    transitions,
    blockers,
    patternsPendingExpansion: [...intent.patterns],
  };
}

export function createProtocolIntentStatePlanPass(): Pass {
  return {
    id: 'protocol_intent_state_plan',
    family: 'expand' as const,
    run({ state }): PassResult {
      const ai = state.outputs.get('ai_precompile') as { protocolIntent?: ProtocolIntent } | undefined;
      if (!ai?.protocolIntent) {
        return { ok: true, output: {} satisfies ProtocolIntentStatePlannerOutput };
      }

      const plan = planProtocolIntentState(ai.protocolIntent);
      const diagnostics: PassDiagnostic[] = plan.blockers.map((blocker) => compactRecord<PassDiagnostic>({
        severity: 'warning',
        code: `protocol_intent_state_${blocker.code}`,
        message: blocker.message,
        pass_id: 'protocol_intent_state_plan',
        details: blocker.details,
      }));

      return {
        ok: true,
        output: { protocolIntentStatePlan: plan } satisfies ProtocolIntentStatePlannerOutput,
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    },
  };
}

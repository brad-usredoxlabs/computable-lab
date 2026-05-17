/**
 * ProtocolIntent is the normalized handoff between human protocol prose and
 * deterministic event-graph lowering.
 *
 * It is deliberately richer than AiPrecompileOutput candidateEvents:
 * candidateEvents are legacy event hints, while ProtocolIntent preserves
 * resources, execution state changes, protocol patterns, assumptions, and
 * unresolved facts before deterministic expansion.
 */

export const PROTOCOL_INTENT_KIND = 'protocol_intent' as const;
export const PROTOCOL_INTENT_VERSION = '0.1.0' as const;

export type ProtocolIntentId = string;
export type ProtocolStepId = string;
export type DeckSlot = string;
export type LabwareOrientation = 'landscape' | 'portrait' | 'unknown';
export type ResolutionStatus = 'resolved' | 'candidate' | 'placeholder' | 'unresolved';

export interface ProtocolSourceSpan {
  start: number;
  end: number;
}

export interface ProtocolSourceRef {
  stepId?: ProtocolStepId;
  phrase?: string;
  span?: ProtocolSourceSpan;
}

export interface ProtocolQuantity {
  value: number;
  unit: string;
  raw?: string;
}

export interface ProtocolConcentration {
  value?: number;
  unit?: string;
  fold?: number;
  raw: string;
}

export interface ProtocolMaterialComponent {
  materialRef: ProtocolIntentId;
  label: string;
  concentration?: ProtocolConcentration;
  role?: 'base' | 'solute' | 'solvent' | 'supplement' | 'active' | 'unknown';
}

export interface ProtocolVendorCandidate {
  vendor?: string;
  catalogNumber?: string;
  label: string;
  recordId?: string;
  confidence?: number;
}

export interface ProtocolLabwareRequirements {
  wellCount?: number;
  format?: 'SBS' | 'tube' | 'reservoir' | 'plate' | 'other';
  coating?: string;
  structuralMaterial?: string;
  color?: string;
  bottomMaterial?: string;
  geometryDefinitionRef?: string;
  vendorCandidates?: ProtocolVendorCandidate[];
}

export interface ProtocolLabwareInstanceIntent {
  id: ProtocolIntentId;
  labwareHint: string;
  deckSlot?: DeckSlot;
  initialOrientation?: LabwareOrientation;
  currentOrientation?: LabwareOrientation;
  role?: 'source' | 'target' | 'waste' | 'tips' | 'incubation' | 'unknown';
  requirements?: ProtocolLabwareRequirements;
  resolutionStatus?: ResolutionStatus;
  resolvedRecordId?: string;
  source?: ProtocolSourceRef;
}

export interface ProtocolMaterialDefinitionIntent {
  id: ProtocolIntentId;
  label: string;
  kind?: 'cell_line' | 'media' | 'compound' | 'solvent' | 'dye' | 'supplement' | 'unknown';
  ontologyRefs?: Array<{ source: string; id: string; label?: string }>;
  localRecordId?: string;
  resolutionStatus?: ResolutionStatus;
  source?: ProtocolSourceRef;
}

export interface ProtocolMaterialFormulationIntent {
  id: ProtocolIntentId;
  label: string;
  components: ProtocolMaterialComponent[];
  resolutionStatus?: ResolutionStatus;
  source?: ProtocolSourceRef;
}

export interface ProtocolMaterialAliquotIntent {
  id: ProtocolIntentId;
  labware: ProtocolIntentId;
  well?: string;
  wells?: string[];
  materialRef?: ProtocolIntentId;
  formulation?: ProtocolIntentId;
  volumeUl?: number;
  concentration?: ProtocolConcentration;
  source?: ProtocolSourceRef;
}

export interface ProtocolPipetteIntent {
  id: ProtocolIntentId;
  label: string;
  channels?: number;
  maxVolumeUl?: number;
  adjustableSpacing?: boolean;
  mount?: string;
  source?: ProtocolSourceRef;
}

export interface ProtocolTipResourceIntent {
  id: ProtocolIntentId;
  label: string;
  volumeUl?: number;
  orientation?: LabwareOrientation;
  deckSlot?: DeckSlot;
  compatiblePipette?: ProtocolIntentId;
  source?: ProtocolSourceRef;
}

export interface ProtocolWasteIntent {
  id: ProtocolIntentId;
  label: string;
  deckSlot?: DeckSlot;
  source?: ProtocolSourceRef;
}

export interface ProtocolIntentResources {
  labwareInstances: ProtocolLabwareInstanceIntent[];
  materialDefinitions: ProtocolMaterialDefinitionIntent[];
  materialFormulations: ProtocolMaterialFormulationIntent[];
  materialAliquots: ProtocolMaterialAliquotIntent[];
  pipettes: ProtocolPipetteIntent[];
  tips: ProtocolTipResourceIntent[];
  waste: ProtocolWasteIntent[];
}

export type ProtocolOperationKind =
  | 'place_labware'
  | 'load_material'
  | 'set_active_pipette'
  | 'swap_pipette'
  | 'replace_tips'
  | 'reorient_labware'
  | 'set_tip_spacing'
  | 'aspirate'
  | 'dispense'
  | 'transfer'
  | 'media_swap'
  | 'pipette_mix'
  | 'incubate'
  | 'eject_tips'
  | 'unknown';

export interface ProtocolOperationIntent {
  id: ProtocolIntentId;
  kind: ProtocolOperationKind;
  stepId?: ProtocolStepId;
  source?: ProtocolSourceRef;
  labware?: ProtocolIntentId;
  sourceLabware?: ProtocolIntentId;
  sourceWell?: string;
  targetLabware?: ProtocolIntentId;
  targetWells?: string[];
  materialRef?: ProtocolIntentId;
  formulation?: ProtocolIntentId;
  volumeUl?: number;
  temperatureC?: number;
  co2Percent?: number;
  durationSeconds?: number;
  cycles?: number;
  spacingMm?: number;
  pipette?: ProtocolIntentId;
  tipResource?: ProtocolIntentId;
  waste?: ProtocolIntentId;
  params?: Record<string, unknown>;
  dependsOn?: ProtocolIntentId[];
}

export type ProtocolPatternKind =
  | 'reservoir_loading_table'
  | 'source_wells_to_duplicate_target_columns'
  | 'media_swap_duplicate_columns'
  | 'serial_dilution_setup'
  | 'serial_dilution'
  | 'repeat_rows'
  | 'unknown';

export interface ProtocolPatternIntent {
  id: ProtocolIntentId;
  kind: ProtocolPatternKind;
  stepId?: ProtocolStepId;
  source?: ProtocolSourceRef;
  sourceLabware?: ProtocolIntentId;
  targetLabware?: ProtocolIntentId;
  sourceWells?: string[];
  targetWells?: string[];
  targetColumns?: number[];
  targetColumnPairs?: number[][];
  rows?: string[];
  ratio?: string;
  direction?: 'down_rows' | 'across_columns' | 'unknown';
  operation?: string;
  params?: Record<string, unknown>;
  expandsTo?: ProtocolIntentId[];
}

export interface ProtocolAssumption {
  id: ProtocolIntentId;
  message: string;
  source?: ProtocolSourceRef;
  confidence?: number;
}

export interface ProtocolUnresolvedFact {
  id: ProtocolIntentId;
  kind:
    | 'material'
    | 'material_formulation'
    | 'labware'
    | 'geometry'
    | 'volume'
    | 'concentration'
    | 'operation'
    | 'platform'
    | 'other';
  label: string;
  reason: string;
  source?: ProtocolSourceRef;
  blocksLowering?: boolean;
  candidates?: Array<{ id?: string; label: string; confidence?: number }>;
}

export interface ProtocolIntentStep {
  id: ProtocolStepId;
  index: number;
  text: string;
  source?: ProtocolSourceRef;
}

export interface ProtocolIntent {
  kind: typeof PROTOCOL_INTENT_KIND;
  version: typeof PROTOCOL_INTENT_VERSION;
  intentId: ProtocolIntentId;
  sourcePrompt?: string;
  steps: ProtocolIntentStep[];
  resources: ProtocolIntentResources;
  operations: ProtocolOperationIntent[];
  patterns: ProtocolPatternIntent[];
  assumptions: ProtocolAssumption[];
  unresolved: ProtocolUnresolvedFact[];
}

export function emptyProtocolIntentResources(): ProtocolIntentResources {
  return {
    labwareInstances: [],
    materialDefinitions: [],
    materialFormulations: [],
    materialAliquots: [],
    pipettes: [],
    tips: [],
    waste: [],
  };
}

export function createEmptyProtocolIntent(init: {
  intentId?: string;
  sourcePrompt?: string;
  steps?: ProtocolIntentStep[];
} = {}): ProtocolIntent {
  return {
    kind: PROTOCOL_INTENT_KIND,
    version: PROTOCOL_INTENT_VERSION,
    intentId: init.intentId ?? 'protocol-intent',
    ...(init.sourcePrompt !== undefined ? { sourcePrompt: init.sourcePrompt } : {}),
    steps: init.steps ?? [],
    resources: emptyProtocolIntentResources(),
    operations: [],
    patterns: [],
    assumptions: [],
    unresolved: [],
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeResources(value: unknown): ProtocolIntentResources {
  const resources = asRecord(value) ?? {};
  return {
    labwareInstances: asArray<ProtocolLabwareInstanceIntent>(resources.labwareInstances),
    materialDefinitions: asArray<ProtocolMaterialDefinitionIntent>(resources.materialDefinitions),
    materialFormulations: asArray<ProtocolMaterialFormulationIntent>(resources.materialFormulations),
    materialAliquots: asArray<ProtocolMaterialAliquotIntent>(resources.materialAliquots),
    pipettes: asArray<ProtocolPipetteIntent>(resources.pipettes),
    tips: asArray<ProtocolTipResourceIntent>(resources.tips),
    waste: asArray<ProtocolWasteIntent>(resources.waste),
  };
}

export function normalizeProtocolIntent(value: unknown): ProtocolIntent | undefined {
  const obj = asRecord(value);
  if (!obj) return undefined;

  const intentId = typeof obj.intentId === 'string' && obj.intentId.trim()
    ? obj.intentId
    : 'protocol-intent';

  return {
    kind: PROTOCOL_INTENT_KIND,
    version: PROTOCOL_INTENT_VERSION,
    intentId,
    ...(typeof obj.sourcePrompt === 'string' ? { sourcePrompt: obj.sourcePrompt } : {}),
    steps: asArray<ProtocolIntentStep>(obj.steps),
    resources: normalizeResources(obj.resources),
    operations: asArray<ProtocolOperationIntent>(obj.operations),
    patterns: asArray<ProtocolPatternIntent>(obj.patterns),
    assumptions: asArray<ProtocolAssumption>(obj.assumptions),
    unresolved: asArray<ProtocolUnresolvedFact>(obj.unresolved),
  };
}

export function isProtocolIntent(value: unknown): value is ProtocolIntent {
  const obj = asRecord(value);
  if (!obj) return false;
  return obj.kind === PROTOCOL_INTENT_KIND
    && obj.version === PROTOCOL_INTENT_VERSION
    && typeof obj.intentId === 'string';
}

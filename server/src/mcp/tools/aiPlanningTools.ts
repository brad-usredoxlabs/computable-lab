import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { primaryParsedCompositionEntries, type ParsedCompositionEntry } from '../../materials/composition.js';
import {
  draftFormulationFromPrompt,
  flattenFormulationDraft,
  suggestMissingFormulationFields,
  summarizeFormulationDraft,
  type CopilotRef,
  type FormulationCopilotDraft,
  type PromptDraftResolver,
} from '../../materials/formulationCopilot.js';
import { parseIngredientConcentration } from '../../materials/formulationMath.js';
import { parseOperationTemplatePayload } from '../../execution/planning/transferPrograms.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

const SCHEMA_IDS = {
  material: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  materialSpec: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
  recipe: 'https://computable-lab.com/schema/computable-lab/recipe.schema.yaml',
  aliquot: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
  vendorProduct: 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
  operationTemplate: 'https://computable-lab.com/schema/computable-lab/operation-template.schema.yaml',
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function refValue(value: unknown): { id: string; type: string; label?: string } | null {
  if (!isObject(value)) return null;
  const id = stringValue(value.id);
  const type = stringValue(value.type);
  const label = stringValue(value.label);
  if (!id || !type) return null;
  return { id, type, ...(label ? { label } : {}) };
}

function asPayload(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

function quantityValue(value: unknown): { value: number; unit: string } | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) return undefined;
  const unit = stringValue(value.unit);
  if (!unit) return undefined;
  return { value: value.value, unit };
}

function concentrationValue(
  value: unknown,
): { value: number; unit: string; basis?: string } | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) return undefined;
  const unit = stringValue(value.unit);
  if (!unit) return undefined;
  const basis = stringValue(value.basis);
  return { value: value.value, unit, ...(basis ? { basis } : {}) };
}

type ConcentrationShape = ReturnType<typeof concentrationValue>;
type RefShape = NonNullable<ReturnType<typeof refValue>>;
type SerialDirection = 'up' | 'down' | 'left' | 'right';
type SerialVolumeMode = 'from_transfer' | 'from_final';
type SerialDilutionMode = 'in_place' | 'source_to_target' | 'prepare_then_transfer';
type SerialPreparationMode = 'external' | 'generate';
type SerialReplicateMode = 'explicit_lanes' | 'pattern';
type SerialStartSourceKind = 'existing_well' | 'material_source' | 'generated_top_well';
type SerialSolventPolicyMode = 'ignore' | 'warn_if_inconsistent' | 'enforce_constant_vehicle';
type SerialEndPolicy = 'keep_last' | 'discard_excess' | 'transfer_all_no_discard';
type SerialTipPolicy = 'reuse' | 'change_each_step' | 'change_each_row';

type MaterialSpecSummary = {
  recordType: 'material-spec';
  recordId: string;
  name: string;
  representedMaterial?: {
    id: string;
    label: string;
  };
  concentration?: NonNullable<ConcentrationShape>;
  concentrationUnknown?: boolean;
  composition?: ParsedCompositionEntry[];
  solventRef?: {
    id: string;
    label?: string;
  };
  recipe?: {
    id: string;
    name: string;
    inputRoles: Array<{
      roleId: string;
      roleType: string;
      materialRef?: RefShape;
      quantity?: { value: number; unit: string };
    }>;
  };
};

type SerialDefaults = {
  concentration?: NonNullable<ConcentrationShape>;
  compositionSnapshot?: ParsedCompositionEntry[];
};

type SerialDilutionBuildArgs = {
  mode?: SerialDilutionMode;
  sourceLabwareId?: string;
  targetLabwareId?: string;
  startWells?: string[];
  sourceStartWells?: string[];
  finalTargetStartWells?: string[];
  direction?: SerialDirection;
  steps?: number;
  dilutionFactor?: number;
  volumeModel?: SerialVolumeMode;
  transferVolume_uL?: number;
  retainedVolume_uL?: number;
  diluentRef?: CopilotRef;
  startSourceKind?: SerialStartSourceKind;
  startMaterialRef?: CopilotRef;
  topWellMode?: SerialPreparationMode;
  receivingWellMode?: SerialPreparationMode;
  endPolicy?: SerialEndPolicy;
  replicateMode?: SerialReplicateMode;
  replicateAxis?: 'row' | 'column';
  replicateCount?: number;
  replicateSpacing?: number;
  mixCycles?: number;
  mixVolume_uL?: number;
  tipPolicy?: SerialTipPolicy;
  deliveryVolume_uL?: number;
  solventPolicyMode?: SerialSolventPolicyMode;
  matchedDiluentRef?: CopilotRef;
  eventId?: string;
};

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseCopilotRef(value: unknown): CopilotRef | undefined {
  if (!isObject(value)) return undefined;
  const kind = value.kind === 'ontology' ? 'ontology' : value.kind === 'record' ? 'record' : undefined;
  const id = stringValue(value.id);
  if (!kind || !id) return undefined;
  return {
    kind,
    id,
    ...(stringValue(value.type) ? { type: stringValue(value.type)! } : {}),
    ...(stringValue(value.label) ? { label: stringValue(value.label)! } : {}),
    ...(stringValue(value.namespace) ? { namespace: stringValue(value.namespace)! } : {}),
    ...(stringValue(value.uri) ? { uri: stringValue(value.uri)! } : {}),
  };
}

function parseCopilotDraft(value: unknown): FormulationCopilotDraft | undefined {
  if (!isObject(value) || !Array.isArray(value.ingredients)) return undefined;
  return {
    ...(stringValue(value.recipeName) ? { recipeName: stringValue(value.recipeName)! } : {}),
    ...(parseCopilotRef(value.representsMaterial) ? { representsMaterial: parseCopilotRef(value.representsMaterial)! } : {}),
    ...(quantityValue(value.totalProduced) ? { totalProduced: quantityValue(value.totalProduced)! } : {}),
    ...(parseCopilotRef(value.outputSolventRef) ? { outputSolventRef: parseCopilotRef(value.outputSolventRef)! } : {}),
    ...(isObject(value.storage)
      ? {
          storage: {
            ...(numberValue(value.storage.storageTemperatureC) !== undefined ? { storageTemperatureC: numberValue(value.storage.storageTemperatureC)! } : {}),
            ...(typeof value.storage.lightSensitive === 'boolean' ? { lightSensitive: value.storage.lightSensitive } : {}),
            ...(numberValue(value.storage.maxFreezeThawCycles) !== undefined ? { maxFreezeThawCycles: numberValue(value.storage.maxFreezeThawCycles)! } : {}),
            ...(stringValue(value.storage.stabilityNote) ? { stabilityNote: stringValue(value.storage.stabilityNote)! } : {}),
          },
        }
      : {}),
    ...(stringValue(value.notes) ? { notes: stringValue(value.notes)! } : {}),
    ingredients: value.ingredients
      .filter(isObject)
      .map((ingredient) => ({
        ...(parseCopilotRef(ingredient.ref) ? { ref: parseCopilotRef(ingredient.ref)! } : {}),
        roleType: stringValue(ingredient.roleType) ?? 'other',
        ...(stringValue(ingredient.measureMode) ? { measureMode: stringValue(ingredient.measureMode) as 'target_concentration' | 'fixed_amount' | 'qs_to_final' } : {}),
        ...(stringValue(ingredient.sourceState) ? { sourceState: stringValue(ingredient.sourceState) as 'solid' | 'liquid' | 'stock_solution' | 'formulation' | 'cells' | 'other' } : {}),
        ...(parseIngredientConcentration(ingredient.stockConcentration) ? { stockConcentration: parseIngredientConcentration(ingredient.stockConcentration)! } : {}),
        ...(parseIngredientConcentration(ingredient.targetContribution) ? { targetContribution: parseIngredientConcentration(ingredient.targetContribution)! } : {}),
        ...(quantityValue(ingredient.requiredAmount) ? { requiredAmount: quantityValue(ingredient.requiredAmount)! } : {}),
        ...(quantityValue(ingredient.molecularWeight) && quantityValue(ingredient.molecularWeight)!.unit === 'g/mol'
          ? { molecularWeight: { value: quantityValue(ingredient.molecularWeight)!.value, unit: 'g/mol' as const } }
          : {}),
        ...(Array.isArray(ingredient.compositionSnapshot) ? { compositionSnapshot: ingredient.compositionSnapshot as ParsedCompositionEntry[] } : {}),
      })),
    ...(Array.isArray(value.steps)
      ? {
          steps: value.steps
            .filter(isObject)
            .map((step) => ({ instruction: stringValue(step.instruction) ?? '' }))
            .filter((step) => step.instruction),
        }
      : {}),
  };
}

function parseSerialDirection(value: unknown): SerialDirection | undefined {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right' ? value : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => stringValue(entry))
    .filter((entry): entry is string => Boolean(entry));
  return items.length > 0 ? items : undefined;
}

function parseSerialBuildArgs(value: unknown): SerialDilutionBuildArgs | undefined {
  if (!isObject(value)) return undefined;
  return {
    ...(stringValue(value.mode) ? { mode: stringValue(value.mode) as SerialDilutionMode } : {}),
    ...(stringValue(value.sourceLabwareId) ? { sourceLabwareId: stringValue(value.sourceLabwareId)! } : {}),
    ...(stringValue(value.targetLabwareId) ? { targetLabwareId: stringValue(value.targetLabwareId)! } : {}),
    ...(parseStringArray(value.startWells) ? { startWells: parseStringArray(value.startWells)! } : {}),
    ...(parseStringArray(value.sourceStartWells) ? { sourceStartWells: parseStringArray(value.sourceStartWells)! } : {}),
    ...(parseStringArray(value.finalTargetStartWells) ? { finalTargetStartWells: parseStringArray(value.finalTargetStartWells)! } : {}),
    ...(parseSerialDirection(value.direction) ? { direction: parseSerialDirection(value.direction)! } : {}),
    ...(numberValue(value.steps) !== undefined ? { steps: Math.max(2, Math.trunc(numberValue(value.steps)!)) } : {}),
    ...(numberValue(value.dilutionFactor) !== undefined ? { dilutionFactor: Math.max(1.1, numberValue(value.dilutionFactor)!) } : {}),
    ...(stringValue(value.volumeModel) ? { volumeModel: stringValue(value.volumeModel) as SerialVolumeMode } : {}),
    ...(numberValue(value.transferVolume_uL) !== undefined ? { transferVolume_uL: Math.max(0.1, numberValue(value.transferVolume_uL)!) } : {}),
    ...(numberValue(value.retainedVolume_uL) !== undefined ? { retainedVolume_uL: Math.max(0.1, numberValue(value.retainedVolume_uL)!) } : {}),
    ...(parseCopilotRef(value.diluentRef) ? { diluentRef: parseCopilotRef(value.diluentRef)! } : {}),
    ...(stringValue(value.startSourceKind) ? { startSourceKind: stringValue(value.startSourceKind) as SerialStartSourceKind } : {}),
    ...(parseCopilotRef(value.startMaterialRef) ? { startMaterialRef: parseCopilotRef(value.startMaterialRef)! } : {}),
    ...(stringValue(value.topWellMode) ? { topWellMode: stringValue(value.topWellMode) as SerialPreparationMode } : {}),
    ...(stringValue(value.receivingWellMode) ? { receivingWellMode: stringValue(value.receivingWellMode) as SerialPreparationMode } : {}),
    ...(stringValue(value.endPolicy) ? { endPolicy: stringValue(value.endPolicy) as SerialEndPolicy } : {}),
    ...(stringValue(value.replicateMode) ? { replicateMode: stringValue(value.replicateMode) as SerialReplicateMode } : {}),
    ...(stringValue(value.replicateAxis) ? { replicateAxis: stringValue(value.replicateAxis) as 'row' | 'column' } : {}),
    ...(numberValue(value.replicateCount) !== undefined ? { replicateCount: Math.max(1, Math.trunc(numberValue(value.replicateCount)!)) } : {}),
    ...(numberValue(value.replicateSpacing) !== undefined ? { replicateSpacing: Math.max(1, Math.trunc(numberValue(value.replicateSpacing)!)) } : {}),
    ...(numberValue(value.mixCycles) !== undefined ? { mixCycles: Math.max(0, Math.trunc(numberValue(value.mixCycles)!)) } : {}),
    ...(numberValue(value.mixVolume_uL) !== undefined ? { mixVolume_uL: Math.max(0, numberValue(value.mixVolume_uL)!) } : {}),
    ...(stringValue(value.tipPolicy) ? { tipPolicy: stringValue(value.tipPolicy) as SerialTipPolicy } : {}),
    ...(numberValue(value.deliveryVolume_uL) !== undefined ? { deliveryVolume_uL: Math.max(0.1, numberValue(value.deliveryVolume_uL)!) } : {}),
    ...(stringValue(value.solventPolicyMode) ? { solventPolicyMode: stringValue(value.solventPolicyMode) as SerialSolventPolicyMode } : {}),
    ...(parseCopilotRef(value.matchedDiluentRef) ? { matchedDiluentRef: parseCopilotRef(value.matchedDiluentRef)! } : {}),
    ...(stringValue(value.eventId) ? { eventId: stringValue(value.eventId)! } : {}),
  };
}

function parseGridWell(value: string): { row: string; col: number } | null {
  const match = value.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const row = match[1];
  const colText = match[2];
  if (!row || !colText) return null;
  return { row, col: Number.parseInt(colText, 10) };
}

function buildWellPath(
  start: string,
  direction: SerialDirection,
  pointCount: number,
  rows: number,
  cols: number,
): string[] {
  const parsed = parseGridWell(start);
  if (!parsed) return [];
  let row = parsed.row.charCodeAt(0) - 'A'.charCodeAt(0);
  let col = parsed.col - 1;
  const path: string[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    if (row < 0 || row >= rows || col < 0 || col >= cols) break;
    path.push(`${String.fromCharCode('A'.charCodeAt(0) + row)}${col + 1}`);
    if (direction === 'down') row += 1;
    else if (direction === 'up') row -= 1;
    else if (direction === 'right') col += 1;
    else col -= 1;
  }
  return path;
}

function offsetWell(start: string, axis: 'row' | 'column', delta: number): string | null {
  const parsed = parseGridWell(start);
  if (!parsed) return null;
  const baseRow = parsed.row.charCodeAt(0) - 'A'.charCodeAt(0);
  const baseCol = parsed.col - 1;
  const nextRow = axis === 'row' ? baseRow + delta : baseRow;
  const nextCol = axis === 'column' ? baseCol + delta : baseCol;
  if (nextRow < 0 || nextCol < 0) return null;
  return `${String.fromCharCode('A'.charCodeAt(0) + nextRow)}${nextCol + 1}`;
}

function inferPathDirection(path: string[]): SerialDirection {
  if (path.length < 2) return 'down';
  const firstWell = path[0];
  const secondWell = path[1];
  if (!firstWell || !secondWell) return 'down';
  const first = parseGridWell(firstWell);
  const second = parseGridWell(secondWell);
  if (!first || !second) return 'down';
  if (second.col > first.col) return 'right';
  if (second.col < first.col) return 'left';
  if (second.row > first.row) return 'down';
  return 'up';
}

function deriveSerialVolumes(args: {
  factor: number;
  volumeModel: SerialVolumeMode;
  transferVolume_uL?: number;
  retainedVolume_uL?: number;
}) {
  const factor = Math.max(1.0001, args.factor);
  if (args.volumeModel === 'from_final') {
    const retainedVolume_uL = Math.max(0.1, args.retainedVolume_uL ?? 200);
    const transferVolume_uL = retainedVolume_uL / (factor - 1);
    return {
      factor,
      volumeModel: args.volumeModel,
      retainedVolume_uL,
      resolvedTransferVolume_uL: transferVolume_uL,
      resolvedPrefillVolume_uL: retainedVolume_uL,
      resolvedTopWellStartVolume_uL: retainedVolume_uL + transferVolume_uL,
    };
  }
  const transferVolume_uL = Math.max(0.1, args.transferVolume_uL ?? 100);
  const retainedVolume_uL = transferVolume_uL * (factor - 1);
  return {
    factor,
    volumeModel: args.volumeModel,
    transferVolume_uL,
    resolvedTransferVolume_uL: transferVolume_uL,
    resolvedPrefillVolume_uL: retainedVolume_uL,
    resolvedTopWellStartVolume_uL: retainedVolume_uL + transferVolume_uL,
  };
}

function primaryCompositionConcentration(entries: ParsedCompositionEntry[]): NonNullable<ConcentrationShape> | undefined {
  for (const preferredRole of ['solute', 'activity_source', 'cells', 'other'] as const) {
    const match = entries.find((entry) => entry.role === preferredRole && entry.concentration);
    if (match?.concentration) return match.concentration;
  }
  return entries.find((entry) => entry.concentration)?.concentration;
}

async function resolveSerialDefaults(ctx: AppContext, ref: CopilotRef | undefined): Promise<SerialDefaults> {
  if (!ref || ref.kind !== 'record') return {};
  const envelope = await ctx.store.get(ref.id);
  const payload = asPayload(envelope?.payload);
  if (!payload) return {};

  if (payload.kind === 'material-spec') {
    const formulation = asPayload(payload.formulation);
    const composition = primaryParsedCompositionEntries(formulation?.composition);
    const concentration = concentrationValue(formulation?.concentration) ?? primaryCompositionConcentration(composition);
    return {
      ...(concentration ? { concentration } : {}),
      ...(composition.length > 0 ? { compositionSnapshot: composition } : {}),
    };
  }

  if (payload.kind === 'vendor-product') {
    const composition = primaryParsedCompositionEntries(payload.declared_composition);
    const concentration = primaryCompositionConcentration(composition);
    return {
      ...(concentration ? { concentration } : {}),
      ...(composition.length > 0 ? { compositionSnapshot: composition } : {}),
    };
  }

  if (payload.kind === 'aliquot' || payload.kind === 'material-instance') {
    const explicitConcentration = concentrationValue(payload.concentration);
    const specRef = refValue(payload.material_spec_ref);
    const inherited = specRef?.id
      ? await resolveSerialDefaults(ctx, { kind: 'record', id: specRef.id, type: 'material-spec', ...(specRef.label ? { label: specRef.label } : {}) })
      : {};
    return {
      ...(explicitConcentration || inherited.concentration ? { concentration: explicitConcentration ?? inherited.concentration } : {}),
      ...(inherited.compositionSnapshot?.length ? { compositionSnapshot: inherited.compositionSnapshot } : {}),
    };
  }

  return {};
}

function expandStarts(
  starts: string[],
  replicateMode: SerialReplicateMode,
  replicateAxis: 'row' | 'column',
  replicateCount: number,
  replicateSpacing: number,
): string[] {
  if (starts.length === 0) return [];
  const seeds = replicateMode === 'pattern' ? starts.slice(0, 1) : starts;
  return seeds.flatMap((seed) => {
    if (replicateMode !== 'pattern') return [seed];
    return Array.from({ length: replicateCount }, (_, index) => offsetWell(seed, replicateAxis, index * replicateSpacing))
      .filter((entry): entry is string => Boolean(entry));
  });
}

async function buildSerialDilutionEvent(
  ctx: AppContext,
  args: SerialDilutionBuildArgs,
): Promise<Record<string, unknown>> {
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const mode = args.mode ?? 'in_place';
  const direction = args.direction ?? 'down';
  const replicateMode = args.replicateMode ?? 'explicit_lanes';
  const replicateAxis = args.replicateAxis ?? (direction === 'down' || direction === 'up' ? 'column' : 'row');
  const replicateCount = Math.max(1, args.replicateCount ?? 1);
  const replicateSpacing = Math.max(1, args.replicateSpacing ?? 1);
  const startSourceKind = args.startSourceKind ?? (mode === 'in_place' ? 'existing_well' : 'generated_top_well');
  const topWellMode = args.topWellMode ?? (startSourceKind === 'generated_top_well' || startSourceKind === 'material_source' ? 'generate' : 'external');
  const receivingWellMode = args.receivingWellMode ?? 'generate';
  const endPolicy = args.endPolicy ?? 'discard_excess';
  const tipPolicy = args.tipPolicy ?? 'change_each_step';
  const mixCycles = Math.max(0, args.mixCycles ?? 3);
  const mixVolume_uL = Math.max(0, args.mixVolume_uL ?? 80);
  const volumeModel = args.volumeModel ?? 'from_final';
  const dilutionFactor = Math.max(1.1, args.dilutionFactor ?? 2);
  const rows = 8;
  const cols = 12;

  const startWells = args.startWells?.length ? args.startWells : ['A1'];
  if (!args.startWells?.length) assumptions.push('Assumed starting path wells begin at A1.');
  const steps = Math.max(2, args.steps ?? (direction === 'up' || direction === 'down' ? rows : cols));
  if (!args.steps) assumptions.push(`Assumed ${steps} dilution steps from ${direction === 'up' || direction === 'down' ? 'plate rows' : 'plate columns'}.`);

  const expandedPathStarts = expandStarts(startWells, replicateMode, replicateAxis, replicateCount, replicateSpacing);
  const expandedSourceStarts = expandStarts(args.sourceStartWells?.length ? args.sourceStartWells : startWells, replicateMode, replicateAxis, replicateCount, replicateSpacing);
  const expandedFinalStarts = expandStarts(args.finalTargetStartWells?.length ? args.finalTargetStartWells : startWells, replicateMode, replicateAxis, replicateCount, replicateSpacing);

  const dilution = deriveSerialVolumes({
    factor: dilutionFactor,
    volumeModel,
    ...(args.transferVolume_uL !== undefined ? { transferVolume_uL: args.transferVolume_uL } : {}),
    ...(args.retainedVolume_uL !== undefined ? { retainedVolume_uL: args.retainedVolume_uL } : {}),
  });

  const diluentDefaults = await resolveSerialDefaults(ctx, args.diluentRef);
  const startMaterialDefaults = await resolveSerialDefaults(ctx, args.startMaterialRef);
  const matchedDiluentDefaults = await resolveSerialDefaults(ctx, args.matchedDiluentRef);

  if (!args.diluentRef) warnings.push('Diluent reference is not set.');
  if (mode !== 'in_place' && !args.sourceLabwareId) warnings.push('Source labware ID is not set.');
  if (mode !== 'in_place' && !args.targetLabwareId) warnings.push('Target labware ID is not set.');
  if (mode === 'prepare_then_transfer' && !args.deliveryVolume_uL && dilution.retainedVolume_uL === undefined) {
    assumptions.push('Assumed delivery volume matches the retained dilution volume.');
  }
  if (args.solventPolicyMode && args.solventPolicyMode !== 'ignore' && !args.matchedDiluentRef && args.diluentRef) {
    assumptions.push('Using the selected diluent as the matched vehicle.');
  }

  const lanes = expandedPathStarts.map((startWell, index) => {
    const path = buildWellPath(startWell, direction, steps, rows, cols);
    const sourceStartWell = expandedSourceStarts[index] ?? expandedSourceStarts[0] ?? startWell;
    const finalTargets = mode === 'prepare_then_transfer'
      ? buildWellPath(expandedFinalStarts[index] ?? expandedFinalStarts[0] ?? startWell, direction, steps, rows, cols)
      : undefined;
    return {
      laneId: `lane-${index + 1}`,
      targetLabwareId: mode === 'prepare_then_transfer'
        ? (args.targetLabwareId ?? args.sourceLabwareId ?? '')
        : (mode === 'source_to_target' ? (args.targetLabwareId ?? '') : (args.sourceLabwareId ?? args.targetLabwareId ?? '')),
      ...(mode === 'source_to_target' || mode === 'prepare_then_transfer'
        ? { sourceLabwareId: args.sourceLabwareId ?? '' }
        : {}),
      startSource: startSourceKind === 'existing_well'
        ? {
            kind: 'existing_well',
            labwareId: mode === 'in_place' ? (args.sourceLabwareId ?? args.targetLabwareId ?? '') : (args.sourceLabwareId ?? ''),
            wellId: mode === 'in_place' ? startWell : sourceStartWell,
          }
        : startSourceKind === 'material_source'
          ? {
              kind: 'material_source',
              ...(args.startMaterialRef ? { materialRef: args.startMaterialRef } : {}),
              ...(startMaterialDefaults.concentration ? { concentration: startMaterialDefaults.concentration } : {}),
              ...(startMaterialDefaults.compositionSnapshot?.length ? { compositionSnapshot: startMaterialDefaults.compositionSnapshot } : {}),
            }
          : { kind: 'generated_top_well' },
      path,
      ...(finalTargets?.length ? { finalTargets } : {}),
    };
  });

  const params = {
    version: 2,
    mode,
    lanes,
    ...(lanes.length > 1
      ? { replicates: { mode: replicateMode, ...(replicateMode === 'pattern' ? { axis: replicateAxis, count: replicateCount, spacing: replicateSpacing } : {}) } }
      : {}),
    dilution,
    diluent: {
      mode: 'material_ref',
      ...(args.diluentRef ? { materialRef: args.diluentRef } : {}),
      ...(diluentDefaults.concentration ? { concentration: diluentDefaults.concentration } : {}),
      ...(diluentDefaults.compositionSnapshot?.length ? { compositionSnapshot: diluentDefaults.compositionSnapshot } : {}),
    },
    preparation: {
      topWellMode,
      receivingWellMode,
      ...(mode === 'prepare_then_transfer'
        ? { transferIntoTargetAfterPreparation: true, deliveryVolume_uL: args.deliveryVolume_uL ?? dilution.retainedVolume_uL ?? dilution.resolvedPrefillVolume_uL }
        : {}),
    },
    ...(args.solventPolicyMode && args.solventPolicyMode !== 'ignore'
      ? {
          solventPolicy: {
            mode: args.solventPolicyMode,
            ...((args.matchedDiluentRef ?? args.diluentRef) ? { matchedDiluentRef: args.matchedDiluentRef ?? args.diluentRef } : {}),
            ...(matchedDiluentDefaults.compositionSnapshot?.length
              ? { targetComponents: matchedDiluentDefaults.compositionSnapshot }
              : (diluentDefaults.compositionSnapshot?.length ? { targetComponents: diluentDefaults.compositionSnapshot } : {})),
          },
        }
      : {}),
    mix: { cycles: mixCycles, volume_uL: mixVolume_uL },
    tipPolicy,
    endPolicy,
  };

  const event = {
    eventId: args.eventId?.trim() || generateEventId('evt'),
    event_type: 'macro_program',
    t_offset: 'PT0M',
    details: {
      program: {
        kind: 'serial_dilution',
        params,
      },
    },
  };

  return {
    event,
    assumptions,
    warnings,
    summary: {
      mode,
      laneCount: lanes.length,
      pathStarts: lanes.map((lane) => lane.path[0]).filter(Boolean),
      ...(args.diluentRef ? { diluent: args.diluentRef } : {}),
      ...(args.solventPolicyMode && args.solventPolicyMode !== 'ignore'
        ? { solventPolicy: { mode: args.solventPolicyMode, matchedDiluentRef: args.matchedDiluentRef ?? args.diluentRef } }
        : {}),
      compilable: lanes.every((lane) => lane.path.length >= 2),
    },
  };
}

function normalizeExistingSerialEvent(value: unknown): { eventId?: string; params?: Record<string, unknown> } | undefined {
  if (!isObject(value)) return undefined;
  const details = asPayload(value.details);
  const program = asPayload(details?.program);
  if (stringValue(value.event_type) !== 'macro_program' || stringValue(program?.kind) !== 'serial_dilution') return undefined;
  const params = asPayload(program?.params);
  if (!params) return undefined;
  return { ...(stringValue(value.eventId) ? { eventId: stringValue(value.eventId)! } : {}), params };
}

function serialBuildArgsFromExisting(existing: { eventId?: string; params?: Record<string, unknown> } | undefined): SerialDilutionBuildArgs {
  const params = existing?.params;
  if (!params) return {};
  if (params.version === 2 && Array.isArray(params.lanes)) {
    const lanes = params.lanes.filter(isObject);
    const firstLane = lanes[0];
    const startSource = asPayload(firstLane?.startSource);
    const replicates = asPayload(params.replicates);
    const dilution = asPayload(params.dilution);
    const preparation = asPayload(params.preparation);
    const mix = asPayload(params.mix);
    const diluent = asPayload(params.diluent);
    const solventPolicy = asPayload(params.solventPolicy);
    const firstPath = Array.isArray(firstLane?.path) ? firstLane.path.filter((entry): entry is string => typeof entry === 'string') : [];
    return {
      ...(stringValue(params.mode) ? { mode: stringValue(params.mode) as SerialDilutionMode } : {}),
      ...(stringValue(firstLane?.sourceLabwareId) ? { sourceLabwareId: stringValue(firstLane?.sourceLabwareId)! } : {}),
      ...(stringValue(firstLane?.targetLabwareId) ? { targetLabwareId: stringValue(firstLane?.targetLabwareId)! } : {}),
      ...(lanes.length > 0 ? { startWells: lanes.map((lane) => Array.isArray(lane.path) ? String(lane.path[0] ?? '') : '').filter((entry) => entry) } : {}),
      ...(lanes.some((lane) => asPayload(lane.startSource)?.wellId) ? {
        sourceStartWells: lanes.map((lane) => stringValue(asPayload(lane.startSource)?.wellId)).filter((entry): entry is string => Boolean(entry)),
      } : {}),
      ...(lanes.some((lane) => Array.isArray(lane.finalTargets) && lane.finalTargets.length > 0) ? {
        finalTargetStartWells: lanes.map((lane) => Array.isArray(lane.finalTargets) ? stringValue(lane.finalTargets[0]) : undefined).filter((entry): entry is string => Boolean(entry)),
      } : {}),
      ...(firstPath.length > 0 ? { direction: inferPathDirection(firstPath), steps: firstPath.length } : {}),
      ...(numberValue(dilution?.factor) !== undefined ? { dilutionFactor: numberValue(dilution?.factor)! } : {}),
      ...(stringValue(dilution?.volumeModel) ? { volumeModel: stringValue(dilution?.volumeModel) as SerialVolumeMode } : {}),
      ...(numberValue(dilution?.transferVolume_uL) !== undefined ? { transferVolume_uL: numberValue(dilution?.transferVolume_uL)! } : {}),
      ...(numberValue(dilution?.retainedVolume_uL) !== undefined ? { retainedVolume_uL: numberValue(dilution?.retainedVolume_uL)! } : {}),
      ...(parseCopilotRef(diluent?.materialRef) ? { diluentRef: parseCopilotRef(diluent?.materialRef)! } : {}),
      ...(stringValue(startSource?.kind) ? { startSourceKind: stringValue(startSource?.kind) as SerialStartSourceKind } : {}),
      ...(parseCopilotRef(startSource?.materialRef) ? { startMaterialRef: parseCopilotRef(startSource?.materialRef)! } : {}),
      ...(stringValue(preparation?.topWellMode) ? { topWellMode: stringValue(preparation?.topWellMode) as SerialPreparationMode } : {}),
      ...(stringValue(preparation?.receivingWellMode) ? { receivingWellMode: stringValue(preparation?.receivingWellMode) as SerialPreparationMode } : {}),
      ...(numberValue(preparation?.deliveryVolume_uL) !== undefined ? { deliveryVolume_uL: numberValue(preparation?.deliveryVolume_uL)! } : {}),
      ...(stringValue(params.endPolicy) ? { endPolicy: stringValue(params.endPolicy) as SerialEndPolicy } : {}),
      ...(stringValue(replicates?.mode) ? { replicateMode: stringValue(replicates?.mode) as SerialReplicateMode } : {}),
      ...(stringValue(replicates?.axis) ? { replicateAxis: stringValue(replicates?.axis) as 'row' | 'column' } : {}),
      ...(numberValue(replicates?.count) !== undefined ? { replicateCount: numberValue(replicates?.count)! } : {}),
      ...(numberValue(replicates?.spacing) !== undefined ? { replicateSpacing: numberValue(replicates?.spacing)! } : {}),
      ...(numberValue(mix?.cycles) !== undefined ? { mixCycles: numberValue(mix?.cycles)! } : {}),
      ...(numberValue(mix?.volume_uL) !== undefined ? { mixVolume_uL: numberValue(mix?.volume_uL)! } : {}),
      ...(stringValue(params.tipPolicy) ? { tipPolicy: stringValue(params.tipPolicy) as SerialTipPolicy } : {}),
      ...(stringValue(solventPolicy?.mode) ? { solventPolicyMode: stringValue(solventPolicy?.mode) as SerialSolventPolicyMode } : {}),
      ...(parseCopilotRef(solventPolicy?.matchedDiluentRef) ? { matchedDiluentRef: parseCopilotRef(solventPolicy?.matchedDiluentRef)! } : {}),
      ...(existing?.eventId ? { eventId: existing.eventId } : {}),
    };
  }
  return {
    ...(existing?.eventId ? { eventId: existing.eventId } : {}),
  };
}

async function draftSerialDilutionFromPrompt(
  prompt: string,
  resolveRef?: PromptDraftResolver,
): Promise<SerialDilutionBuildArgs & { assumptions: string[]; warnings: string[] }> {
  const text = prompt.trim();
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const direction: SerialDirection = /\bup\b/i.test(text)
    ? 'up'
    : /\bleft\b/i.test(text)
      ? 'left'
      : /\bright\b|\bacross\b/i.test(text)
        ? 'right'
        : 'down';
  const factorMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-|\s*)fold/i);
  const columnMatch = text.match(/\bcolumn\s+(\d+)/i);
  const rowMatch = text.match(/\brow\s+([A-H])/i);
  const transferMatch = text.match(/(\d+(?:\.\d+)?)\s*uL\s+transfer/i);
  const retainedMatch = text.match(/(\d+(?:\.\d+)?)\s*uL\s+(?:retained|final(?:\s+per-well)?)/i);
  const dmsoMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*DMSO/i);
  const triplicate = /\btriplicate\b|\bin triplicate\b/i.test(text);
  const mode: SerialDilutionMode = /prepare.*source plate.*transfer|source plate.*then transfer|prepare.*then transfer/i.test(text)
    ? 'prepare_then_transfer'
    : /\bsource\b.*\btarget\b|\binto the assay plate\b|\binto target\b/i.test(text)
      ? 'source_to_target'
      : 'in_place';

  const draft: SerialDilutionBuildArgs = {
    mode,
    direction,
    dilutionFactor: factorMatch ? Number(factorMatch[1]) : 2,
    replicateMode: triplicate ? 'pattern' : 'explicit_lanes',
    ...(triplicate ? { replicateCount: 3, replicateSpacing: 1, replicateAxis: direction === 'down' || direction === 'up' ? 'column' : 'row' } : {}),
    ...(transferMatch ? { volumeModel: 'from_transfer', transferVolume_uL: Number(transferMatch[1]) } : {}),
    ...(retainedMatch ? { volumeModel: 'from_final', retainedVolume_uL: Number(retainedMatch[1]) } : {}),
  };

  if (!factorMatch) assumptions.push('Assumed a 2-fold dilution.');
  if (!transferMatch && !retainedMatch) assumptions.push('Assumed a final retained volume workflow.');

  if (columnMatch) {
    const columnNumber = columnMatch[1];
    if (columnNumber) draft.startWells = [`A${columnNumber}`];
    draft.steps = 8;
    if (!/\bdown\b|\bup\b/i.test(text)) draft.direction = 'down';
  } else if (rowMatch) {
    const rowLabel = rowMatch[1];
    if (rowLabel) draft.startWells = [`${rowLabel.toUpperCase()}1`];
    draft.steps = 12;
    if (!/\bleft\b|\bright\b|\bacross\b/i.test(text)) draft.direction = 'right';
  } else {
    draft.startWells = ['A1'];
    assumptions.push('Assumed the series starts at A1.');
  }

  if (dmsoMatch) {
    draft.solventPolicyMode = 'enforce_constant_vehicle';
    assumptions.push(`Requested constant vehicle handling for DMSO at ${dmsoMatch[1]}%.`);
  }

  const usingMatch = text.match(/\b(?:using|with)\s+([A-Za-z0-9 %+().\-_/]+)$/i);
  if (usingMatch?.[1] && resolveRef) {
    const candidate = usingMatch[1].trim().replace(/\.$/, '');
    const resolved = await resolveRef(candidate, 'solvent');
    if (resolved) {
      draft.diluentRef = resolved;
      if (draft.solventPolicyMode === 'enforce_constant_vehicle') draft.matchedDiluentRef = resolved;
    } else {
      warnings.push(`Could not resolve diluent or matched vehicle "${candidate}".`);
    }
  }

  return { ...draft, assumptions, warnings };
}

function normalize(text: string | undefined): string {
  return (text ?? '').trim().toLowerCase();
}

function matchScore(query: string, ...candidates: Array<string | undefined>): number {
  const q = normalize(query);
  if (!q) return 1;
  let score = 0;
  for (const candidate of candidates) {
    const value = normalize(candidate);
    if (!value) continue;
    if (value === q) score = Math.max(score, 100);
    else if (value.startsWith(q)) score = Math.max(score, 75);
    else if (value.includes(q)) score = Math.max(score, 50);
  }
  return score;
}

function effectiveMaterialTracking(ctx: AppContext) {
  return {
    mode: ctx.appConfig?.lab?.materialTracking?.mode ?? 'relaxed',
    allowAdHocEventInstances: ctx.appConfig?.lab?.materialTracking?.allowAdHocEventInstances ?? true,
  };
}

function generateEventId(prefix = 'evt'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function registerAiPlanningTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  const resolvePromptRef = async (label: string, kind: 'material' | 'solvent' | 'ingredient'): Promise<CopilotRef | undefined> => {
    const query = normalize(label);
    if (!query) return undefined;
    const schemas = kind === 'ingredient'
      ? [SCHEMA_IDS.materialSpec, SCHEMA_IDS.vendorProduct, SCHEMA_IDS.material]
      : [SCHEMA_IDS.material, SCHEMA_IDS.materialSpec, SCHEMA_IDS.vendorProduct];
    for (const schemaId of schemas) {
      const envelopes = await ctx.store.list({ schemaId, limit: 500 });
      const best = envelopes
        .map((envelope) => {
          const payload = asPayload(envelope.payload);
          const name = stringValue(payload?.name) ?? envelope.recordId;
          return {
            envelope,
            payload,
            name,
            score: matchScore(label, name, envelope.recordId),
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))[0];
      if (best) {
        return {
          kind: 'record',
          id: best.envelope.recordId,
          type: schemaId === SCHEMA_IDS.materialSpec ? 'material-spec' : schemaId === SCHEMA_IDS.vendorProduct ? 'vendor-product' : 'material',
          label: best.name,
        };
      }
    }
    return undefined;
  };

  dualRegister(
    server,
    registry,
    'platforms_list',
    'List available planning platforms and deck variants.',
    {},
    async () => jsonResult({ platforms: ctx.platformRegistry.listPlatforms() }),
  );

  dualRegister(
    server,
    registry,
    'platform_get',
    'Get a single planning platform manifest by ID.',
    {
      platformId: z.string().describe('Platform ID, such as manual, opentrons_ot2, opentrons_flex, or integra_assist'),
    },
    async (args) => {
      const platform = ctx.platformRegistry.getPlatform(args.platformId);
      if (!platform) return errorResult(`Unknown platform: ${args.platformId}`);
      return jsonResult(platform);
    },
  );

  dualRegister(
    server,
    registry,
    'lab_settings_get',
    'Get current lab planning settings such as material tracking mode. Use this to decide whether formulation-spec additions can rely on implicit instances or should prefer explicit tracked instances.',
    {},
    async () => jsonResult({ materialTracking: effectiveMaterialTracking(ctx) }),
  );

  dualRegister(
    server,
    registry,
    'operation_templates_list',
    'List saved operation templates/programs for event authoring. Prefer this over generic library_search when the user asks for saved transfer programs, macros, or reusable liquid-handling actions.',
    {
      query: z.string().optional().describe('Search by template name or description'),
      category: z.string().optional().describe('Optional category filter such as transfer'),
      includeDeprecated: z.boolean().optional().describe('Include deprecated templates'),
      limit: z.number().optional().describe('Maximum results'),
    },
    async (args) => {
      try {
        const envelopes = await ctx.store.list({ schemaId: SCHEMA_IDS.operationTemplate, limit: 10000 });
        const query = normalize(args.query ?? '');
        let items = envelopes
          .map((envelope) => parseOperationTemplatePayload(envelope.payload, envelope.recordId))
          .filter((item): item is NonNullable<ReturnType<typeof parseOperationTemplatePayload>> => Boolean(item))
          .filter((item) => (args.includeDeprecated ? true : item.status !== 'deprecated'))
          .filter((item) => (args.category ? item.category === args.category : true))
          .map((item) => ({
            id: item.id,
            name: item.name,
            version: item.version ?? 1,
            category: item.category,
            scope: item.scope,
            status: item.status ?? 'active',
            baseEventType: item.base_event_type,
            description: item.description,
            semanticDefaults: item.semantic_defaults,
            executionDefaults: item.execution_defaults,
            score: query.length === 0
              ? 1
              : Math.max(
                  matchScore(query, item.name, item.description),
                  ...(item.tags ?? []).map((tag) => matchScore(query, tag)),
                ),
          }))
          .filter((item) => (query.length === 0 ? true : item.score > 0));
        items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        const limited = typeof args.limit === 'number' && args.limit > 0 ? items.slice(0, args.limit) : items.slice(0, 25);
        return jsonResult({ items: limited });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'search_records',
    'Search local records by a free-text query across multiple record kinds. Call this BEFORE asking the user for any entity ID. Pass kinds like ["labware"], ["material"], ["equipment"], ["protocol"], ["plate-layout-template"], ["operation-template"], ["aliquot"], ["material-spec"], or multiple at once. Returns a list of matching records with recordId, title, snippet, and kind. If zero results, try a shorter or more general query before giving up.',
    {
      query: z.string().describe('Free-text search fragment, e.g. "12-channel reservoir" or "clofibrate"'),
      kinds: z.array(z.string()).describe('Record kinds to search, e.g. ["labware"] or ["material","material-spec","aliquot"]'),
      limit: z.number().optional().describe('Maximum total results across all kinds (default 20)'),
    },
    async (args) => {
      try {
        const q = args.query.toLowerCase();
        const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 20;
        const results: Array<{
          recordId: string;
          title: string;
          snippet: string;
          kind: string;
          schemaId: string;
        }> = [];
        for (const kind of args.kinds) {
          const records = await ctx.store.list({ kind });
          for (const record of records) {
            const payload = record.payload as Record<string, unknown>;
            const searchable = [
              payload.name,
              payload.title,
              payload.label,
              payload.manufacturer,
              payload.model,
              payload.modelFamily,
              payload.canonical,
              payload.id,
            ]
              .filter((v): v is string | number => v !== undefined && v !== null)
              .map((v) => String(v).toLowerCase());
            if (searchable.some((s) => s.includes(q))) {
              results.push({
                recordId: record.recordId,
                title: String(payload.name || payload.title || payload.label || record.recordId),
                snippet: [payload.manufacturer, payload.model || payload.modelFamily, payload.domain]
                  .filter(Boolean)
                  .join(' — '),
                kind: String(payload.kind || kind),
                schemaId: record.schemaId,
              });
              if (results.length >= limit) break;
            }
          }
          if (results.length >= limit) break;
        }
        return jsonResult({ items: results });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'operation_template_build_event',
    'Build a template-backed transfer vignette event payload for an event graph. Use this after selecting a saved operation template so AI and UI authoring share the same macro structure.',
    {
      templateId: z.string().describe('Operation-template record ID'),
      sourceLabwareId: z.string().optional().describe('Optional source labware ID'),
      targetLabwareId: z.string().optional().describe('Optional target labware ID'),
      sourceWells: z.array(z.string()).optional().describe('Selected source wells'),
      targetWells: z.array(z.string()).optional().describe('Selected target wells'),
      eventId: z.string().optional().describe('Optional explicit event ID'),
      volumeValue: z.number().optional().describe('Override transfer volume value'),
      volumeUnit: z.string().optional().describe('Override transfer volume unit'),
      transferMode: z.enum(['transfer', 'multi_dispense']).optional().describe('Override transfer mode'),
      discardToWaste: z.boolean().optional().describe('Override discard-to-waste behavior'),
    },
    async (args) => {
      try {
        const envelope = await ctx.store.get(args.templateId);
        if (!envelope || envelope.schemaId !== SCHEMA_IDS.operationTemplate) {
          return errorResult(`Operation template not found: ${args.templateId}`);
        }
        const template = parseOperationTemplatePayload(envelope.payload, envelope.recordId);
        if (!template) {
          return errorResult(`Record ${args.templateId} is not a valid operation template`);
        }
        const eventId = args.eventId?.trim() || generateEventId('evt');
        const volume = typeof args.volumeValue === 'number' && args.volumeUnit?.trim()
          ? { value: args.volumeValue, unit: args.volumeUnit.trim() }
          : template.semantic_defaults?.volume;
        const event = {
          eventId,
          event_type: 'macro_program',
          t_offset: 'PT0M',
          details: {
            program: {
              kind: 'transfer_vignette',
              template_ref: {
                kind: 'record',
                id: template.id,
                type: 'operation-template',
                label: template.name,
              },
              params: {
                ...(args.sourceLabwareId ? { sourceLabwareId: args.sourceLabwareId } : {}),
                ...(args.targetLabwareId ? { targetLabwareId: args.targetLabwareId } : {}),
                sourceWells: args.sourceWells ?? [],
                targetWells: args.targetWells ?? [],
                ...(volume ? { volume } : {}),
                transferMode: args.transferMode ?? template.semantic_defaults?.transfer_mode ?? (template.base_event_type === 'multi_dispense' ? 'multi_dispense' : 'transfer'),
                ...(template.semantic_defaults?.dead_volume ? { deadVolume: template.semantic_defaults.dead_volume } : {}),
                ...(typeof args.discardToWaste === 'boolean'
                  ? { discardToWaste: args.discardToWaste }
                  : template.semantic_defaults?.discard_to_waste
                    ? { discardToWaste: true }
                    : {}),
              },
              ...(template.execution_defaults ? { execution_hints: template.execution_defaults } : {}),
            },
          },
        };
        return jsonResult({ template, event });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'serial_dilution_build_event',
    'Build a v2 serial-dilution macro event payload for the event graph editor. Use this instead of hand-assembling transfer chains when the user wants a serial dilution, replicates, matched vehicle behavior, or prepare-then-transfer semantics.',
    {
      draft: z.object({}).passthrough().describe('Structured serial dilution draft fields'),
    },
    async (args) => {
      try {
        const draft = parseSerialBuildArgs(args.draft);
        if (!draft) return errorResult('draft is required');
        return jsonResult(await buildSerialDilutionEvent(ctx, draft));
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'serial_dilution_patch_event',
    'Patch an existing serial-dilution macro event semantically. Use this to change dilution factor, direction, replicates, solvent policy, or mode without reconstructing the event by hand.',
    {
      event: z.object({}).passthrough().describe('Existing macro event payload'),
      changes: z.object({}).passthrough().describe('Partial serial dilution fields to update'),
    },
    async (args) => {
      try {
        const existing = normalizeExistingSerialEvent(args.event);
        if (!existing) return errorResult('event must be a macro_program with program.kind = serial_dilution');
        const changes = parseSerialBuildArgs(args.changes) ?? {};
        const nextDraft = {
          ...serialBuildArgsFromExisting(existing),
          ...changes,
          ...(existing.eventId ? { eventId: existing.eventId } : {}),
        };
        return jsonResult(await buildSerialDilutionEvent(ctx, nextDraft));
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'serial_dilution_draft_from_text',
    'Draft a serial-dilution macro event from free text such as "make this a 2-fold serial dilution down column 1 in triplicate" or "prepare in a source plate, then transfer into the assay plate". Returns the event plus explicit assumptions and warnings.',
    {
      prompt: z.string().describe('Free-text serial dilution request'),
    },
    async (args) => {
      try {
        const draft = await draftSerialDilutionFromPrompt(args.prompt, resolvePromptRef);
        const built = await buildSerialDilutionEvent(ctx, draft);
        return jsonResult({
          ...built,
          assumptions: [...draft.assumptions, ...(Array.isArray(built.assumptions) ? built.assumptions : [])],
          warnings: [...draft.warnings, ...(Array.isArray(built.warnings) ? built.warnings : [])],
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'formulations_summary',
    'List local formulation specs with recipe, represented material, ingredients, preferred sources, and available instance count. Use this when the user asks what reagents or materials are available in the library; formulations are usually the primary addable objects.',
    {
      query: z.string().optional().describe('Search query'),
      outputSpecId: z.string().optional().describe('Filter by output material-spec ID'),
      hasAvailableInstances: z.boolean().optional().describe('Filter by whether the formulation has available instances'),
      limit: z.number().optional().describe('Maximum results'),
    },
    async (args) => {
      try {
        const [materials, specs, recipes, aliquots] = await Promise.all([
          ctx.store.list({ schemaId: SCHEMA_IDS.material, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.materialSpec, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.recipe, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.aliquot, limit: 10000 }),
        ]);

        const materialMap = new Map(materials.map((envelope) => [envelope.recordId, envelope]));
        const specMap = new Map(specs.map((envelope) => [envelope.recordId, envelope]));
        const availableAliquotsBySpec = new Map<string, number>();
        for (const envelope of aliquots) {
          const payload = asPayload(envelope.payload);
          if (!payload || payload.kind !== 'aliquot') continue;
          const specRef = refValue(payload.material_spec_ref);
          if (!specRef?.id) continue;
          const status = stringValue(payload.status);
          if (status && status !== 'available') continue;
          availableAliquotsBySpec.set(specRef.id, (availableAliquotsBySpec.get(specRef.id) ?? 0) + 1);
        }

        let items = recipes
          .map((envelope) => {
            const payload = asPayload(envelope.payload);
            if (!payload || payload.kind !== 'recipe') return null;
            const outputSpecRef = refValue(payload.output_material_spec_ref);
            if (!outputSpecRef?.id) return null;
            const specPayload = asPayload(specMap.get(outputSpecRef.id)?.payload);
            const representedMaterialRef = refValue(specPayload?.material_ref);
            const representedMaterialPayload = asPayload(
              representedMaterialRef?.id ? materialMap.get(representedMaterialRef.id)?.payload : null,
            );
            const specFormulation = asPayload(specPayload?.formulation);
            const recipeOutput = asPayload(payload.output);
            const concentration = concentrationValue(recipeOutput?.concentration) ?? concentrationValue(specFormulation?.concentration);
            const composition = primaryParsedCompositionEntries(recipeOutput?.composition, specFormulation?.composition);
            const solventRef = refValue(recipeOutput?.solvent_ref) ?? refValue(specFormulation?.solvent_ref);
            const score = matchScore(
              args.query ?? '',
              stringValue(payload.name),
              stringValue(specPayload?.name),
              stringValue(representedMaterialPayload?.name),
            );
            if (normalize(args.query ?? '').length > 0 && score === 0) return null;
            return {
              recipeId: envelope.recordId,
              recipeName: stringValue(payload.name) ?? envelope.recordId,
              outputSpecId: outputSpecRef.id,
              outputSpecName: stringValue(specPayload?.name) ?? outputSpecRef.label ?? outputSpecRef.id,
              outputSpec: {
                id: outputSpecRef.id,
                name: stringValue(specPayload?.name) ?? outputSpecRef.label ?? outputSpecRef.id,
                ...(representedMaterialRef?.id
                  ? {
                      representedMaterial: {
                        id: representedMaterialRef.id,
                        label: stringValue(representedMaterialPayload?.name) ?? representedMaterialRef.label ?? representedMaterialRef.id,
                      },
                    }
                  : {}),
                ...(concentration ? { concentration } : {}),
                ...(composition.length > 0 ? { composition } : {}),
                ...(solventRef?.id ? { solventRef: { id: solventRef.id, ...(solventRef.label ? { label: solventRef.label } : {}) } } : {}),
              },
              ...(representedMaterialRef?.id
                ? {
                    representedMaterial: {
                      id: representedMaterialRef.id,
                      label: stringValue(representedMaterialPayload?.name) ?? representedMaterialRef.label ?? representedMaterialRef.id,
                    },
                  }
                : {}),
              ingredients: Array.isArray(payload.input_roles)
                ? payload.input_roles
                    .filter(isObject)
                    .map((role) => {
                      const materialRef = refValue(role.material_ref);
                      const materialPayload = asPayload(materialRef?.id ? materialMap.get(materialRef.id)?.payload : null);
                      const specRef = Array.isArray(role.allowed_material_spec_refs)
                        ? refValue(role.allowed_material_spec_refs.find(isObject))
                        : null;
                      return (
                        stringValue(materialPayload?.name)
                        ?? materialRef?.label
                        ?? specRef?.label
                        ?? stringValue(role.role_id)
                        ?? 'ingredient'
                      );
                    })
                : [],
              inputRoles: Array.isArray(payload.input_roles)
                ? payload.input_roles
                    .filter(isObject)
                    .map((role) => ({
                      roleId: stringValue(role.role_id) ?? 'input',
                      roleType: stringValue(role.role_type) ?? 'other',
                      ...(refValue(role.material_ref)?.id
                        ? { materialRef: refValue(role.material_ref) }
                        : {}),
                      ...(refValue(role.vendor_product_ref)?.id
                        ? { vendorProductRef: refValue(role.vendor_product_ref) }
                        : {}),
                      ...(Array.isArray(role.allowed_material_spec_refs)
                        ? {
                            allowedMaterialSpecRefs: role.allowed_material_spec_refs
                              .map(refValue)
                              .filter((entry): entry is NonNullable<ReturnType<typeof refValue>> => Boolean(entry)),
                          }
                        : {}),
                      ...(stringValue(role.measure_mode) ? { measureMode: stringValue(role.measure_mode) } : {}),
                      ...(stringValue(role.source_state) ? { sourceState: stringValue(role.source_state) } : {}),
                      ...(concentrationValue(role.stock_concentration) ? { stockConcentration: concentrationValue(role.stock_concentration) } : {}),
                      ...(concentrationValue(role.target_contribution) ? { targetContribution: concentrationValue(role.target_contribution) } : {}),
                      ...(quantityValue(role.required_amount) ? { requiredAmount: quantityValue(role.required_amount) } : {}),
                      ...(quantityValue(role.molecular_weight) ? { molecularWeight: quantityValue(role.molecular_weight) } : {}),
                      ...(Array.isArray(role.composition_snapshot)
                        ? { compositionSnapshot: primaryParsedCompositionEntries(role.composition_snapshot) }
                        : {}),
                      ...(quantityValue(role.quantity) ? { quantity: quantityValue(role.quantity) } : {}),
                    }))
                : [],
              preferredSources: Array.isArray(payload.preferred_sources)
                ? payload.preferred_sources.filter(isObject).map((source) => ({
                    roleId: stringValue(source.role_id) ?? '',
                    vendor: stringValue(source.vendor),
                    catalogNumber: stringValue(source.catalog_number),
                  })).filter((source) => source.roleId)
                : [],
              inventoryAvailableCount: availableAliquotsBySpec.get(outputSpecRef.id) ?? 0,
              ...(quantityValue(payload.batch && isObject(payload.batch) ? payload.batch.default_output_quantity : undefined)
                ? { batch: { defaultOutputQuantity: quantityValue((payload.batch as Record<string, unknown>).default_output_quantity) } }
                : {}),
              score,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        if (args.outputSpecId) {
          items = items.filter((item) => item.outputSpecId === args.outputSpecId);
        }
        if (typeof args.hasAvailableInstances === 'boolean') {
          items = items.filter((item) => (item.inventoryAvailableCount > 0) === args.hasAvailableInstances);
        }

        items.sort((a, b) => b.score - a.score || a.recipeName.localeCompare(b.recipeName));
        if (typeof args.limit === 'number' && args.limit > 0) {
          items = items.slice(0, args.limit);
        }

        return jsonResult({ items });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'inventory_list',
    'List local prepared instances with formulation/spec and lot metadata. Use this when the user asks what tracked batches, prepared tubes, or lot-backed instances are available.',
    {
      query: z.string().optional().describe('Search query'),
      materialSpecId: z.string().optional().describe('Filter by material-spec ID'),
      status: z.string().optional().describe('Filter by instance status'),
      limit: z.number().optional().describe('Maximum results'),
    },
    async (args) => {
      try {
        const [specs, aliquots] = await Promise.all([
          ctx.store.list({ schemaId: SCHEMA_IDS.materialSpec, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.aliquot, limit: 10000 }),
        ]);
        const specMap = new Map(specs.map((envelope) => [envelope.recordId, envelope]));
        let items = aliquots
          .map((envelope) => {
            const payload = asPayload(envelope.payload);
            if (!payload || payload.kind !== 'aliquot') return null;
            const specRef = refValue(payload.material_spec_ref);
            if (!specRef?.id) return null;
            const specPayload = asPayload(specMap.get(specRef.id)?.payload);
            const specFormulation = asPayload(specPayload?.formulation);
            const concentration = concentrationValue(payload.concentration) ?? concentrationValue(specFormulation?.concentration);
            const solventRef = refValue(specFormulation?.solvent_ref);
            const score = matchScore(
              args.query ?? '',
              stringValue(payload.name),
              stringValue(specPayload?.name),
              stringValue(payload.status),
            );
            if (normalize(args.query ?? '').length > 0 && score === 0) return null;
            return {
              aliquotId: envelope.recordId,
              name: stringValue(payload.name) ?? envelope.recordId,
              status: stringValue(payload.status),
              materialSpec: {
                id: specRef.id,
                name: stringValue(specPayload?.name) ?? specRef.label ?? specRef.id,
              },
              ...(quantityValue(payload.volume) ? { volume: quantityValue(payload.volume) } : {}),
              ...(concentration ? { concentration } : { concentrationUnknown: true }),
              ...(solventRef?.id ? { solventRef: { id: solventRef.id, ...(solventRef.label ? { label: solventRef.label } : {}) } } : {}),
              lot: isObject(payload.lot)
                ? {
                    vendor: stringValue(payload.lot.vendor),
                    catalogNumber: stringValue(payload.lot.catalog_number),
                    lotNumber: stringValue(payload.lot.lot_number),
                  }
                : undefined,
              score,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        if (args.materialSpecId) {
          items = items.filter((item) => item.materialSpec.id === args.materialSpecId);
        }
        if (args.status) {
          items = items.filter((item) => item.status === args.status);
        }
        items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        if (typeof args.limit === 'number' && args.limit > 0) {
          items = items.slice(0, args.limit);
        }
        return jsonResult({ items });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'materials_search_addable',
    'Primary tool for answering what materials are available or addable in the lab. Searches local addable results ranked for event authoring: formulations first, instances second, material concepts third. Prefer this over generic library_search for availability questions.',
    {
      query: z.string().describe('Search query'),
      limit: z.number().optional().describe('Maximum results'),
    },
    async (args) => {
      try {
        const [materials, specs, recipes, aliquots] = await Promise.all([
          ctx.store.list({ schemaId: SCHEMA_IDS.material, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.materialSpec, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.recipe, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.aliquot, limit: 10000 }),
        ]);

        const recipeByOutputSpec = new Map<string, string>();
        const specMeta = new Map<string, { concentration?: NonNullable<ConcentrationShape>; solventLabel?: string }>();
        for (const recipe of recipes) {
          const payload = asPayload(recipe.payload);
          const outputSpecRef = refValue(payload?.output_material_spec_ref);
          if (outputSpecRef?.id) {
            recipeByOutputSpec.set(outputSpecRef.id, stringValue(payload?.name) ?? recipe.recordId);
          }
        }
        for (const spec of specs) {
          const payload = asPayload(spec.payload);
          if (!payload) continue;
          const formulation = asPayload(payload.formulation);
          const solventRef = refValue(formulation?.solvent_ref);
          const entry: { concentration?: NonNullable<ConcentrationShape>; solventLabel?: string } = {};
          const concentration = concentrationValue(formulation?.concentration);
          if (concentration) entry.concentration = concentration;
          if (solventRef?.label) entry.solventLabel = solventRef.label;
          specMeta.set(spec.recordId, entry);
        }

        const results: Array<Record<string, unknown>> = [];

        for (const spec of specs) {
          const payload = asPayload(spec.payload);
          if (!payload) continue;
          const name = stringValue(payload.name) ?? spec.recordId;
          const score = matchScore(args.query, name, recipeByOutputSpec.get(spec.recordId));
          if (score === 0) continue;
          results.push({
            kind: 'formulation',
            ref: { kind: 'record', id: spec.recordId, type: 'material-spec', label: name },
            label: name,
            recipeName: recipeByOutputSpec.get(spec.recordId),
            ...(specMeta.get(spec.recordId)?.concentration ? { concentration: specMeta.get(spec.recordId)!.concentration } : {}),
            ...(specMeta.get(spec.recordId)?.solventLabel ? { solventLabel: specMeta.get(spec.recordId)!.solventLabel } : {}),
            score: score + 300,
          });
        }

        for (const aliquot of aliquots) {
          const payload = asPayload(aliquot.payload);
          if (!payload || payload.kind !== 'aliquot') continue;
          const name = stringValue(payload.name) ?? aliquot.recordId;
          const specRef = refValue(payload.material_spec_ref);
          const score = matchScore(args.query, name, specRef?.label);
          if (score === 0) continue;
          results.push({
            kind: 'instance',
            ref: { kind: 'record', id: aliquot.recordId, type: 'aliquot', label: name },
            label: name,
            materialSpecId: specRef?.id,
            ...(specRef?.id && specMeta.get(specRef.id)?.concentration ? { concentration: specMeta.get(specRef.id)!.concentration } : {}),
            ...(specRef?.id && specMeta.get(specRef.id)?.solventLabel ? { solventLabel: specMeta.get(specRef.id)!.solventLabel } : {}),
            score: score + 200,
          });
        }

        for (const material of materials) {
          const payload = asPayload(material.payload);
          if (!payload) continue;
          const name = stringValue(payload.name) ?? material.recordId;
          const score = matchScore(args.query, name, material.recordId);
          if (score === 0) continue;
          results.push({
            kind: 'material',
            ref: { kind: 'record', id: material.recordId, type: 'material', label: name },
            label: name,
            score: score + 100,
          });
        }

        results.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || String(a.label).localeCompare(String(b.label)));
        const limited = typeof args.limit === 'number' && args.limit > 0 ? results.slice(0, args.limit) : results.slice(0, 25);

        return jsonResult({
          results: limited,
          groups: {
            formulations: limited.filter((entry) => entry.kind === 'formulation'),
            instances: limited.filter((entry) => entry.kind === 'instance'),
            materials: limited.filter((entry) => entry.kind === 'material'),
          },
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'material_composition_get',
    'Get concentration-bearing formulation or aliquot details for a material-spec, aliquot, recipe, vendor-product, or generic record ID. Use this when you need exact concentration, solvent, output composition, or to distinguish known vs unknown concentration.',
    {
      recordId: z.string().optional().describe('Generic record ID for a material-spec, aliquot, or recipe'),
      materialSpecId: z.string().optional().describe('Material-spec ID'),
      aliquotId: z.string().optional().describe('Aliquot ID'),
      recipeId: z.string().optional().describe('Recipe ID'),
    },
    async (args) => {
      try {
        const targetId = args.materialSpecId || args.aliquotId || args.recipeId || args.recordId;
        if (!targetId) return errorResult('Provide one of recordId, materialSpecId, aliquotId, or recipeId');

        const [materials, specs, recipes] = await Promise.all([
          ctx.store.list({ schemaId: SCHEMA_IDS.material, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.materialSpec, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.recipe, limit: 10000 }),
        ]);

        const materialMap = new Map(materials.map((envelope) => [envelope.recordId, envelope]));
        const specMap = new Map(specs.map((envelope) => [envelope.recordId, envelope]));
        const recipeMap = new Map(recipes.map((envelope) => [envelope.recordId, envelope]));

        const recipeForSpec = (materialSpecId: string) =>
          recipes.find((envelope) => refValue(asPayload(envelope.payload)?.output_material_spec_ref)?.id === materialSpecId) ?? null;

        const envelope = await ctx.store.get(targetId);
        const payload = asPayload(envelope?.payload);

        const buildSpecSummary = (specId: string): MaterialSpecSummary | null => {
          const specPayload = asPayload(specMap.get(specId)?.payload);
          if (!specPayload) return null;
          const formulation = asPayload(specPayload.formulation);
          const materialRef = refValue(specPayload.material_ref);
          const materialPayload = asPayload(materialRef?.id ? materialMap.get(materialRef.id)?.payload : null);
          const solventRef = refValue(formulation?.solvent_ref);
          const recipeEnvelope = recipeForSpec(specId);
          const recipePayload = asPayload(recipeEnvelope?.payload);
          const composition = primaryParsedCompositionEntries(asPayload(recipePayload?.output)?.composition, formulation?.composition);
          const summary: MaterialSpecSummary = {
            recordType: 'material-spec',
            recordId: specId,
            name: stringValue(specPayload.name) ?? specId,
            ...(materialRef?.id
              ? {
                  representedMaterial: {
                    id: materialRef.id,
                    label: stringValue(materialPayload?.name) ?? materialRef.label ?? materialRef.id,
                  },
                }
              : {}),
            ...(concentrationValue(formulation?.concentration)
              ? { concentration: concentrationValue(formulation?.concentration)! }
              : { concentrationUnknown: true }),
            ...(composition.length > 0 ? { composition } : {}),
            ...(solventRef?.id ? { solventRef: { id: solventRef.id, ...(solventRef.label ? { label: solventRef.label } : {}) } } : {}),
            ...(recipeEnvelope && recipePayload
              ? {
                  recipe: {
                    id: recipeEnvelope.recordId,
                    name: stringValue(recipePayload.name) ?? recipeEnvelope.recordId,
                    inputRoles: Array.isArray(recipePayload.input_roles)
                      ? recipePayload.input_roles
                          .filter(isObject)
                          .map((role) => {
                            const materialRef = refValue(role.material_ref);
                            const quantity = quantityValue(role.quantity);
                            return {
                              roleId: stringValue(role.role_id) ?? 'input',
                              roleType: stringValue(role.role_type) ?? 'other',
                              ...(materialRef?.id ? { materialRef } : {}),
                              ...(stringValue(role.measure_mode) ? { measureMode: stringValue(role.measure_mode) } : {}),
                              ...(stringValue(role.source_state) ? { sourceState: stringValue(role.source_state) } : {}),
                              ...(concentrationValue(role.stock_concentration) ? { stockConcentration: concentrationValue(role.stock_concentration) } : {}),
                              ...(concentrationValue(role.target_contribution) ? { targetContribution: concentrationValue(role.target_contribution) } : {}),
                              ...(quantityValue(role.required_amount) ? { requiredAmount: quantityValue(role.required_amount) } : {}),
                              ...(quantity ? { quantity } : {}),
                            };
                          })
                      : [],
                  },
                }
              : {}),
          };
          return summary;
        };

        if (payload?.kind === 'aliquot' || args.aliquotId) {
          const aliquotPayload = payload ?? asPayload((await ctx.store.get(args.aliquotId!))?.payload);
          if (!aliquotPayload) return errorResult(`Aliquot not found: ${targetId}`);
          const specRef = refValue(aliquotPayload.material_spec_ref);
          const specSummary = specRef?.id ? buildSpecSummary(specRef.id) : null;
          const concentration = concentrationValue(aliquotPayload.concentration) ?? specSummary?.concentration;
          return jsonResult({
            recordType: 'aliquot',
            recordId: stringValue(aliquotPayload.id) ?? targetId,
            name: stringValue(aliquotPayload.name) ?? targetId,
            ...(specRef?.id ? { materialSpec: { id: specRef.id, ...(specRef.label ? { label: specRef.label } : {}) } } : {}),
            ...(quantityValue(aliquotPayload.volume) ? { volume: quantityValue(aliquotPayload.volume) } : {}),
            ...(concentration ? { concentration } : { concentrationUnknown: true }),
            ...(specSummary?.composition?.length ? { composition: specSummary.composition } : {}),
            ...(specSummary?.solventRef ? { solventRef: specSummary.solventRef } : {}),
            ...(specSummary?.representedMaterial ? { representedMaterial: specSummary.representedMaterial } : {}),
            ...(isObject(aliquotPayload.lot)
              ? {
                  lot: {
                    vendor: stringValue(aliquotPayload.lot.vendor),
                    catalogNumber: stringValue(aliquotPayload.lot.catalog_number),
                    lotNumber: stringValue(aliquotPayload.lot.lot_number),
                  },
                }
              : {}),
          });
        }

        if (payload?.kind === 'recipe' || args.recipeId) {
          const recipePayload = payload ?? asPayload(recipeMap.get(args.recipeId!)?.payload);
          if (!recipePayload) return errorResult(`Recipe not found: ${targetId}`);
          const outputSpecRef = refValue(recipePayload.output_material_spec_ref);
          const output = asPayload(recipePayload.output);
          const specSummary = outputSpecRef?.id ? buildSpecSummary(outputSpecRef.id) : null;
          const solventRef = refValue(output?.solvent_ref) ?? specSummary?.solventRef;
          const composition = primaryParsedCompositionEntries(output?.composition, specSummary?.composition);
          return jsonResult({
            recordType: 'recipe',
            recordId: stringValue(recipePayload.id) ?? targetId,
            name: stringValue(recipePayload.name) ?? targetId,
            ...(outputSpecRef?.id ? { outputSpec: { id: outputSpecRef.id, ...(outputSpecRef.label ? { label: outputSpecRef.label } : {}) } } : {}),
            ...(concentrationValue(output?.concentration) ?? specSummary?.concentration
              ? { concentration: concentrationValue(output?.concentration) ?? specSummary?.concentration }
              : { concentrationUnknown: true }),
            ...(composition.length > 0 ? { composition } : {}),
            ...(solventRef?.id ? { solventRef: { id: solventRef.id, ...(solventRef.label ? { label: solventRef.label } : {}) } } : {}),
            inputRoles: Array.isArray(recipePayload.input_roles)
              ? recipePayload.input_roles
                  .filter(isObject)
                  .map((role) => ({
                    roleId: stringValue(role.role_id) ?? 'input',
                    roleType: stringValue(role.role_type) ?? 'other',
                    ...(refValue(role.material_ref)?.id ? { materialRef: refValue(role.material_ref) } : {}),
                    ...(refValue(role.vendor_product_ref)?.id ? { vendorProductRef: refValue(role.vendor_product_ref) } : {}),
                    ...(stringValue(role.measure_mode) ? { measureMode: stringValue(role.measure_mode) } : {}),
                    ...(stringValue(role.source_state) ? { sourceState: stringValue(role.source_state) } : {}),
                    ...(concentrationValue(role.stock_concentration) ? { stockConcentration: concentrationValue(role.stock_concentration) } : {}),
                    ...(concentrationValue(role.target_contribution) ? { targetContribution: concentrationValue(role.target_contribution) } : {}),
                    ...(quantityValue(role.required_amount) ? { requiredAmount: quantityValue(role.required_amount) } : {}),
                    ...(Array.isArray(role.composition_snapshot) ? { compositionSnapshot: primaryParsedCompositionEntries(role.composition_snapshot) } : {}),
                    ...(quantityValue(role.quantity) ? { quantity: quantityValue(role.quantity) } : {}),
                  }))
              : [],
          });
        }

        if (payload?.kind === 'vendor-product') {
          const composition = primaryParsedCompositionEntries(payload.declared_composition);
          return jsonResult({
            recordType: 'vendor-product',
            recordId: stringValue(payload.id) ?? targetId,
            name: stringValue(payload.name) ?? targetId,
            ...(composition.length > 0 ? { composition } : {}),
            ...(refValue(payload.material_ref)?.id ? { representedMaterial: refValue(payload.material_ref) } : {}),
          });
        }

        const specId = payload?.kind === 'material-spec' ? targetId : args.materialSpecId;
        if (specId) {
          const summary = buildSpecSummary(specId);
          if (!summary) return errorResult(`Material spec not found: ${specId}`);
          return jsonResult(summary);
        }

        return errorResult(`Record ${targetId} is not a supported concentration-bearing material record`);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'formulation_draft_from_text',
    'Draft a structured formulation from free text such as "make 10 mL of 1 mM clofibrate in DMSO". Returns a reviewable draft patch, assumptions, and calculation summary.',
    {
      prompt: z.string().describe('Free-text formulation request'),
    },
    async (args) => {
      try {
        const result = await draftFormulationFromPrompt(args.prompt, resolvePromptRef);
        return jsonResult(result);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'formulation_explain_math',
    'Explain formulation calculations for a structured formulation draft. Use this to describe derived masses, volumes, and flattened output composition.',
    {
      draft: z.object({}).passthrough().describe('Structured formulation draft payload'),
    },
    async (args) => {
      try {
        const draft = parseCopilotDraft(args.draft);
        if (!draft) return errorResult('draft is required');
        return jsonResult(summarizeFormulationDraft(draft));
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'formulation_suggest_missing_fields',
    'Suggest missing formulation fields such as recipe name, computed required amounts, and default steps for a structured formulation draft.',
    {
      draft: z.object({}).passthrough().describe('Structured formulation draft payload'),
    },
    async (args) => {
      try {
        const draft = parseCopilotDraft(args.draft);
        if (!draft) return errorResult('draft is required');
        return jsonResult(suggestMissingFormulationFields(draft));
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'formulation_flatten_composition',
    'Flatten the effective output composition of a structured formulation draft, including recursive formulation ingredients when composition snapshots are provided.',
    {
      draft: z.object({}).passthrough().describe('Structured formulation draft payload'),
    },
    async (args) => {
      try {
        const draft = parseCopilotDraft(args.draft);
        if (!draft) return errorResult('draft is required');
        return jsonResult(flattenFormulationDraft(draft));
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

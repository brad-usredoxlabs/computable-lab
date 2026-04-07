import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordEnvelope } from '../../store/types.js';
import type { RecordStore } from '../../store/types.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';
import type { IndexManager } from '../../index/IndexManager.js';
import { parseConcentration, toStoredConcentration, type Concentration } from '../../materials/concentration.js';
import { deriveSimpleStoredComposition, primaryParsedCompositionEntries, toStoredCompositionEntries } from '../../materials/composition.js';
import {
  computeFormulation,
  parseIngredientConcentration,
  parseStoredIngredientComposition,
  toStoredIngredientConcentration,
  type IngredientMeasureMode,
  type IngredientSourceState,
} from '../../materials/formulationMath.js';
import {
  draftFormulationFromPrompt,
  flattenFormulationDraft as flattenFormulationDraftResult,
  suggestMissingFormulationFields as suggestMissingFormulationFieldsResult,
  summarizeFormulationDraft as summarizeFormulationDraftResult,
  type CopilotRef,
  type FormulationCopilotDraft,
} from '../../materials/formulationCopilot.js';
import { extractPrimaryDeclaredConcentration } from '../../materials/vendorComposition.js';

const SCHEMA_IDS = {
  material: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  vendorProduct: 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
  materialSpec: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
  materialInstance: 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
  recipe: 'https://computable-lab.com/schema/computable-lab/recipe.schema.yaml',
  aliquot: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
  eventGraph: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
} as const;

type ExecuteRecipeBody = {
  scale?: number;
  outputCount?: number;
  outputMode?: 'batch' | 'batch-and-split';
  outputVolume?: { value: number; unit: string };
  bindings?: Record<string, { aliquotId: string }>;
  outputMetadata?: {
    containerType?: string;
    storageLocation?: string;
    barcodePrefix?: string;
  };
  notes?: string;
};

type FormulationCopilotBody = {
  prompt?: string;
  draft?: FormulationCopilotDraft;
};

type CreateFormulationBody = {
  material?: {
    id?: string;
    name?: string;
    domain?: string;
    molecularWeight?: {
      value?: number;
      unit?: string;
    };
    classRefs?: Array<{
      kind?: 'record' | 'ontology';
      id?: string;
      type?: string;
      label?: string;
      namespace?: string;
      uri?: string;
    }>;
    definition?: string;
    synonyms?: string[];
  };
  outputSpec?: {
    id?: string;
    name?: string;
    materialRefId?: string;
    vendorProductRefId?: string;
    concentration?: Concentration;
    solventRef?: RefShape;
    solventRefId?: string;
    composition?: Array<{
      componentRef?: RefShape;
      component_ref?: RefShape;
      role?: string;
      concentration?: Concentration;
      source?: string;
    }>;
    grade?: string;
    ph?: number;
    notes?: string;
    handling?: {
      storageTemperatureC?: number;
      lightSensitive?: boolean;
      maxFreezeThawCycles?: number;
      stabilityNote?: string;
    };
    tags?: string[];
  };
  recipe?: {
    id?: string;
    name?: string;
    inputRoles?: Array<{
      roleId?: string;
      roleType?: string;
      required?: boolean;
      materialRefId?: string;
      vendorProductRefId?: string;
      allowedMaterialSpecRefIds?: string[];
      measureMode?: IngredientMeasureMode;
      sourceState?: IngredientSourceState;
      stockConcentration?: Concentration;
      targetContribution?: Concentration;
      requiredAmount?: { value: number; unit: string };
      molecularWeight?: { value: number; unit: string };
      compositionSnapshot?: Array<{
        componentRef?: RefShape;
        component_ref?: RefShape;
        role?: string;
        concentration?: Concentration;
        source?: string;
      }>;
      quantity?: { value: number | string; unit: string };
      constraints?: string[];
    }>;
    steps?: Array<{
      order?: number;
      instruction?: string;
      parameters?: Record<string, unknown>;
    }>;
    preferredSources?: Array<{
      roleId?: string;
      vendor?: string;
      catalogNumber?: string;
      materialRefId?: string;
      materialSpecRefId?: string;
      vendorProductRefId?: string;
    }>;
    scale?: {
      defaultBatchVolume?: { value: number; unit: string };
      supportedBatchVolumes?: Array<{ value: number; unit: string }>;
    };
    batch?: {
      defaultOutputQuantity?: { value: number; unit: string };
      supportedOutputQuantities?: Array<{ value: number; unit: string }>;
    };
    tags?: string[];
  };
};

type RefShape = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};
type Quantity = { value: number; unit: string };
type FlexibleQuantity = { value: number | string; unit: string };

function randomToken(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function token(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomToken()}`;
}

function toRef(id: string, type: string, label?: string): RefShape {
  return { kind: 'record', id, type, ...(label ? { label } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function asPayload(envelope: RecordEnvelope | null): Record<string, unknown> | null {
  return envelope && isObject(envelope.payload) ? envelope.payload : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function quantityValue(value: unknown): Quantity | undefined {
  if (!isObject(value)) return undefined;
  const numeric = typeof value.value === 'number' && Number.isFinite(value.value) ? value.value : undefined;
  const unit = stringValue(value.unit);
  if (numeric === undefined || !unit) return undefined;
  return { value: numeric, unit };
}

function molecularWeightValue(value: unknown): Quantity | undefined {
  const parsed = quantityValue(value);
  if (!parsed || parsed.unit !== 'g/mol') return undefined;
  return parsed;
}

function concentrationValue(value: unknown): Concentration | undefined {
  return parseConcentration(value);
}

function flexibleQuantityValue(value: unknown): FlexibleQuantity | undefined {
  if (!isObject(value)) return undefined;
  const rawValue = value.value;
  const normalizedValue = typeof rawValue === 'number'
    ? (Number.isFinite(rawValue) ? rawValue : undefined)
    : stringValue(rawValue);
  const unit = stringValue(value.unit);
  if (normalizedValue === undefined || !unit) return undefined;
  return { value: normalizedValue, unit };
}

function copilotRefValue(value: unknown): CopilotRef | undefined {
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

function copilotDraftValue(value: unknown): FormulationCopilotDraft | undefined {
  if (!isObject(value) || !Array.isArray(value.ingredients)) return undefined;
  return {
    ...(stringValue(value.recipeName) ? { recipeName: stringValue(value.recipeName)! } : {}),
    ...(copilotRefValue(value.representsMaterial) ? { representsMaterial: copilotRefValue(value.representsMaterial)! } : {}),
    ...(quantityValue(value.totalProduced) ? { totalProduced: quantityValue(value.totalProduced)! } : {}),
    ...(copilotRefValue(value.outputSolventRef) ? { outputSolventRef: copilotRefValue(value.outputSolventRef)! } : {}),
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
        ...(copilotRefValue(ingredient.ref) ? { ref: copilotRefValue(ingredient.ref)! } : {}),
        roleType: stringValue(ingredient.roleType) ?? 'other',
        ...(stringValue(ingredient.measureMode) ? { measureMode: stringValue(ingredient.measureMode) as IngredientMeasureMode } : {}),
        ...(stringValue(ingredient.sourceState) ? { sourceState: stringValue(ingredient.sourceState) as IngredientSourceState } : {}),
        ...(parseIngredientConcentration(ingredient.stockConcentration) ? { stockConcentration: parseIngredientConcentration(ingredient.stockConcentration)! } : {}),
        ...(parseIngredientConcentration(ingredient.targetContribution) ? { targetContribution: parseIngredientConcentration(ingredient.targetContribution)! } : {}),
        ...(quantityValue(ingredient.requiredAmount) ? { requiredAmount: quantityValue(ingredient.requiredAmount)! } : {}),
        ...(molecularWeightValue(ingredient.molecularWeight)
          ? { molecularWeight: { value: molecularWeightValue(ingredient.molecularWeight)!.value, unit: 'g/mol' as const } }
          : {}),
        ...(Array.isArray(ingredient.compositionSnapshot) ? { compositionSnapshot: parseStoredIngredientComposition(ingredient.compositionSnapshot) } : {}),
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

function refValue(value: unknown): RefShape | null {
  if (!isObject(value)) return null;
  const id = stringValue(value.id);
  const type = stringValue(value.type);
  const label = stringValue(value.label);
  if (!id || !type) return null;
  return {
    kind: 'record',
    id,
    type,
    ...(label ? { label } : {}),
  };
}

function looseRefValue(value: unknown): RefShape | null {
  if (!isObject(value)) return null;
  const kind = value.kind === 'ontology' ? 'ontology' : value.kind === 'record' ? 'record' : null;
  const id = stringValue(value.id);
  if (!kind || !id) return null;
  return {
    kind,
    id,
    ...(stringValue(value.type) ? { type: stringValue(value.type)! } : {}),
    ...(stringValue(value.label) ? { label: stringValue(value.label)! } : {}),
    ...(stringValue(value.namespace) ? { namespace: stringValue(value.namespace)! } : {}),
    ...(stringValue(value.uri) ? { uri: stringValue(value.uri)! } : {}),
  };
}

async function vendorProductMaterialRef(store: RecordStore, vendorProductId: string): Promise<RefShape | null> {
  const envelope = await store.get(vendorProductId);
  const payload = asPayload(envelope);
  return payload ? refValue(payload.material_ref) : null;
}

async function vendorProductDeclaredConcentration(store: RecordStore, vendorProductId: string): Promise<Concentration | undefined> {
  const envelope = await store.get(vendorProductId);
  const payload = asPayload(envelope);
  return payload ? extractPrimaryDeclaredConcentration(payload.declared_composition) : undefined;
}

async function vendorProductDeclaredComposition(store: RecordStore, vendorProductId: string): Promise<Record<string, unknown>[] | undefined> {
  const envelope = await store.get(vendorProductId);
  const payload = asPayload(envelope);
  return payload ? toStoredCompositionEntries(payload.declared_composition) : undefined;
}

function parseOutputSpecRef(recipePayload: Record<string, unknown>): RefShape | null {
  return refValue(recipePayload.output_material_spec_ref);
}

function recordName(envelope: RecordEnvelope | null): string | undefined {
  const payload = asPayload(envelope);
  return payload ? stringValue(payload.name) ?? stringValue(payload.id) ?? envelope?.recordId : envelope?.recordId;
}

function dedupeStrings(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sumSingleUnitQuantities(values: Quantity[]): Quantity | undefined {
  if (values.length === 0) return undefined;
  const first = values[0];
  if (!first) return undefined;
  const unit = first.unit;
  if (values.some((entry) => entry.unit !== unit)) return undefined;
  const total = values.reduce((acc, entry) => acc + entry.value, 0);
  return { value: Number(total.toFixed(6)), unit };
}

async function listBySchema(store: RecordStore, schemaId: string): Promise<RecordEnvelope[]> {
  return store.list({ schemaId, limit: 10000 });
}

async function createStoredRecord(
  store: RecordStore,
  payload: Record<string, unknown>,
  schemaId: string,
  message: string
): Promise<RecordEnvelope | null> {
  const now = new Date().toISOString();
  const envelope = createEnvelope(payload, schemaId, { createdAt: now, updatedAt: now });
  if (!envelope) {
    return null;
  }
  const result = await store.create({ envelope, message });
  return result.success ? result.envelope ?? envelope : null;
}

export interface MaterialPrepHandlers {
  getFormulationsSummary(
    request: FastifyRequest<{
      Querystring: {
        q?: string;
        outputSpecId?: string;
        hasAvailableInstances?: string;
        limit?: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<{ items: unknown[] } | { error: string; message: string }>;
  getInventory(
    request: FastifyRequest<{
      Querystring: {
        recipeId?: string;
        materialSpecId?: string;
        status?: string;
        q?: string;
        limit?: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<{ items: unknown[] } | { error: string; message: string }>;
  createFormulation(
    request: FastifyRequest<{ Body: CreateFormulationBody }>,
    reply: FastifyReply
  ): Promise<
    | { success: true; materialId?: string; materialSpecId: string; recipeId: string }
    | { error: string; message: string }
  >;
  executeRecipe(
    request: FastifyRequest<{ Params: { id: string }; Body: ExecuteRecipeBody }>,
    reply: FastifyReply
  ): Promise<
    | {
      success: true;
      recipeId: string;
      recipeName: string;
      preparationEventGraphId: string;
      materialInstanceId: string;
      materialInstanceName: string;
      createdAliquotIds: string[];
      createdAliquots: Array<{
        aliquotId: string;
        name: string;
        materialSpecId: string;
        materialSpecName?: string;
        volume?: Quantity;
        status?: string;
      }>;
      bindings: Array<{
        roleId: string;
        aliquotId: string;
        aliquotName?: string;
      }>;
    }
    | { error: string; message: string }
  >;
  draftFormulationFromText(
    request: FastifyRequest<{ Body: FormulationCopilotBody }>,
    reply: FastifyReply
  ): Promise<unknown>;
  explainFormulationDraft(
    request: FastifyRequest<{ Body: FormulationCopilotBody }>,
    reply: FastifyReply
  ): Promise<unknown>;
  suggestMissingFormulationFields(
    request: FastifyRequest<{ Body: FormulationCopilotBody }>,
    reply: FastifyReply
  ): Promise<unknown>;
  flattenFormulationComposition(
    request: FastifyRequest<{ Body: FormulationCopilotBody }>,
    reply: FastifyReply
  ): Promise<unknown>;
}

export function createMaterialPrepHandlers(store: RecordStore, indexManager?: IndexManager): MaterialPrepHandlers {
  const resolvePromptRef = async (label: string, kind: 'material' | 'solvent' | 'ingredient'): Promise<CopilotRef | undefined> => {
    const query = label.trim().toLowerCase();
    if (!query) return undefined;
    const schemaPriority = kind === 'ingredient'
      ? [SCHEMA_IDS.materialSpec, SCHEMA_IDS.vendorProduct, SCHEMA_IDS.material]
      : [SCHEMA_IDS.material, SCHEMA_IDS.materialSpec, SCHEMA_IDS.vendorProduct];
    for (const schemaId of schemaPriority) {
      const envelopes = await store.list({ schemaId, limit: 500 });
      const match = envelopes
        .map((envelope) => {
          const payload = asPayload(envelope);
          const name = stringValue(payload?.name) ?? envelope.recordId;
          const score = name.toLowerCase() === query ? 100 : name.toLowerCase().includes(query) ? 50 : envelope.recordId.toLowerCase().includes(query) ? 25 : 0;
          return { envelope, name, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))[0];
      if (match) {
        return {
          kind: 'record',
          id: match.envelope.recordId,
          type: schemaId === SCHEMA_IDS.material ? 'material' : schemaId === SCHEMA_IDS.materialSpec ? 'material-spec' : 'vendor-product',
          label: match.name,
        };
      }
    }
    return undefined;
  };

  return {
    async getFormulationsSummary(request, reply) {
      try {
        const [materials, specs, recipes, aliquots] = await Promise.all([
          listBySchema(store, SCHEMA_IDS.material),
          listBySchema(store, SCHEMA_IDS.materialSpec),
          listBySchema(store, SCHEMA_IDS.recipe),
          listBySchema(store, SCHEMA_IDS.aliquot),
        ]);

        const search = request.query.q?.trim().toLowerCase() ?? '';
        const outputSpecFilter = request.query.outputSpecId?.trim();
        const hasAvailableFilter = request.query.hasAvailableInstances;
        const limit = request.query.limit ? Number(request.query.limit) : undefined;

        const materialMap = new Map(materials.map((envelope) => [envelope.recordId, envelope]));
        const specMap = new Map(specs.map((envelope) => [envelope.recordId, envelope]));
        const aliquotsBySpecId = new Map<string, RecordEnvelope[]>();

        for (const envelope of aliquots) {
          const payload = asPayload(envelope);
          if (!payload || payload.kind !== 'aliquot') continue;
          const specRef = refValue(payload.material_spec_ref);
          if (!specRef?.id) continue;
          const list = aliquotsBySpecId.get(specRef.id) ?? [];
          list.push(envelope);
          aliquotsBySpecId.set(specRef.id, list);
        }

        let items: Array<{
          recipeId: string;
          recipeName: string;
          recipeTags: string[];
          outputSpec: {
            id: string;
            name: string;
            materialId?: string;
            materialName?: string;
            vendorProductId?: string;
            vendorProductLabel?: string;
            concentration?: Concentration;
            solventRefId?: string;
            solventLabel?: string;
            grade?: string;
            handling?: {
              storageTemperatureC?: number;
              stabilityNote?: string;
              maxFreezeThawCycles?: number;
              lightSensitive?: boolean;
            };
          };
          inputRoles: Array<{
            roleId: string;
            roleType: string;
            required: boolean;
            materialRef?: { id: string; label?: string };
            vendorProductRef?: { id: string; label?: string };
            allowedMaterialSpecRefs: Array<{ id: string; label?: string }>;
            measureMode?: IngredientMeasureMode;
            sourceState?: IngredientSourceState;
            stockConcentration?: Concentration;
            targetContribution?: Concentration;
            requiredAmount?: FlexibleQuantity;
            molecularWeight?: Quantity;
            compositionSnapshot?: Array<{
              componentRef: RefShape;
              role: string;
              concentration?: Concentration;
              source?: string;
            }>;
            quantity?: FlexibleQuantity;
            constraints: string[];
          }>;
          preferredSources?: Array<{
            roleId: string;
            vendor?: string;
            catalogNumber?: string;
            materialRef?: { id: string; label?: string };
            materialSpecRef?: { id: string; label?: string };
            vendorProductRef?: { id: string; label?: string };
          }>;
          steps: Array<{ order: number; instruction: string; parameters?: Record<string, unknown> }>;
          scale?: {
            defaultBatchVolume?: Quantity;
            supportedBatchVolumes: Quantity[];
          };
          batch?: {
            defaultOutputQuantity?: Quantity;
            supportedOutputQuantities: Quantity[];
          };
          inventory: {
            availableCount: number;
            totalAvailableVolume?: Quantity;
            recentAliquotIds: string[];
            lastPreparedAt?: string;
          };
        }> = [];

        for (const envelope of recipes) {
          try {
            const payload = asPayload(envelope);
            if (!payload || payload.kind !== 'recipe') continue;
            const outputSpecRef = parseOutputSpecRef(payload);
            if (!outputSpecRef) continue;

            const specEnvelope = specMap.get(outputSpecRef.id) ?? null;
            const specPayload = asPayload(specEnvelope);
            const materialRef = specPayload ? refValue(specPayload.material_ref) : null;
            const materialEnvelope = materialRef ? materialMap.get(materialRef.id) ?? null : null;
            const materialPayload = asPayload(materialEnvelope);

            const availableAliquots = (aliquotsBySpecId.get(outputSpecRef.id) ?? [])
              .filter((aliquotEnv) => {
                const aliquotPayload = asPayload(aliquotEnv);
                const status = aliquotPayload ? stringValue(aliquotPayload.status) : undefined;
                return !status || status === 'available';
              })
              .sort((a, b) => {
                const aPayload = asPayload(a);
                const bPayload = asPayload(b);
                return String(bPayload?.createdAt ?? '').localeCompare(String(aPayload?.createdAt ?? ''));
              });

            const availableVolumes = availableAliquots
              .map((aliquotEnv) => quantityValue(asPayload(aliquotEnv)?.volume))
              .filter((entry): entry is Quantity => Boolean(entry));

            const formulationRef = specPayload?.formulation && isObject(specPayload.formulation) ? specPayload.formulation : null;
            const recipeOutput = payload.output && isObject(payload.output) ? payload.output : null;
            const solventRef = refValue(recipeOutput?.solvent_ref) ?? refValue(formulationRef?.solvent_ref);
            const handling = specPayload?.handling && isObject(specPayload.handling)
              ? {
                  ...(() => {
                    const storageTemperatureC = numberValue(specPayload.handling.storage_temperature_C);
                    return storageTemperatureC !== undefined ? { storageTemperatureC } : {};
                  })(),
                  ...(() => {
                    const stabilityNote = stringValue(specPayload.handling.stability_note);
                    return stabilityNote ? { stabilityNote } : {};
                  })(),
                  ...(typeof specPayload.handling.max_freeze_thaw_cycles === 'number'
                    ? { maxFreezeThawCycles: specPayload.handling.max_freeze_thaw_cycles }
                    : {}),
                  ...(typeof specPayload.handling.light_sensitive === 'boolean'
                    ? { lightSensitive: specPayload.handling.light_sensitive }
                    : {}),
                }
              : null;
            const scale = payload.scale && isObject(payload.scale)
              ? {
                  ...(() => {
                    const defaultBatchVolume = quantityValue(payload.scale.default_batch_volume);
                    return defaultBatchVolume ? { defaultBatchVolume } : {};
                  })(),
                  supportedBatchVolumes: Array.isArray(payload.scale.supported_batch_volumes)
                    ? payload.scale.supported_batch_volumes
                        .map(quantityValue)
                        .filter((entry): entry is Quantity => Boolean(entry))
                    : [],
                }
              : null;
            const batch = payload.batch && isObject(payload.batch)
              ? {
                  ...(() => {
                    const defaultOutputQuantity = quantityValue(payload.batch.default_output_quantity);
                    return defaultOutputQuantity ? { defaultOutputQuantity } : {};
                  })(),
                  supportedOutputQuantities: Array.isArray(payload.batch.supported_output_quantities)
                    ? payload.batch.supported_output_quantities
                        .map(quantityValue)
                        .filter((entry): entry is Quantity => Boolean(entry))
                    : [],
                }
              : scale
                ? {
                    ...(() => {
                      const defaultOutputQuantity = scale.defaultBatchVolume;
                      return defaultOutputQuantity ? { defaultOutputQuantity } : {};
                    })(),
                    supportedOutputQuantities: scale.supportedBatchVolumes,
                  }
                : null;
            const totalAvailableVolume = sumSingleUnitQuantities(availableVolumes);
            const lastPreparedAt = stringValue(asPayload(availableAliquots[0] ?? null)?.createdAt);
            const materialName = stringValue(materialPayload?.name) ?? materialRef?.label;
            const concentration = concentrationValue(recipeOutput?.concentration) ?? concentrationValue(formulationRef?.concentration);
            const composition = primaryParsedCompositionEntries(recipeOutput?.composition, formulationRef?.composition);
            const grade = stringValue(recipeOutput?.grade) ?? stringValue(formulationRef?.grade);
            const vendorProductRef = refValue(specPayload?.vendor_product_ref);

            items.push({
              recipeId: envelope.recordId,
              recipeName: stringValue(payload.name) ?? envelope.recordId,
              recipeTags: dedupeStrings(isStringArray(payload.tags) ? payload.tags : undefined) ?? [],
              outputSpec: {
                id: outputSpecRef.id,
                name: stringValue(specPayload?.name) ?? outputSpecRef.label ?? outputSpecRef.id,
                ...(materialRef?.id ? { materialId: materialRef.id } : {}),
                ...(materialName ? { materialName } : {}),
                ...(concentration ? { concentration } : {}),
                ...(composition.length > 0 ? { composition } : {}),
                ...(solventRef?.id ? { solventRefId: solventRef.id } : {}),
                ...(solventRef?.label ? { solventLabel: solventRef.label } : {}),
                ...(grade ? { grade } : {}),
                ...(vendorProductRef?.id ? { vendorProductId: vendorProductRef.id } : {}),
                ...(vendorProductRef?.label ? { vendorProductLabel: vendorProductRef.label } : {}),
                ...(handling && Object.keys(handling).length > 0 ? { handling } : {}),
              },
              inputRoles: Array.isArray(payload.input_roles)
                ? payload.input_roles
                    .filter(isObject)
                    .map((role) => {
                      const roleMaterialRef = refValue(role.material_ref);
                      const roleVendorProductRef = refValue(role.vendor_product_ref);
                      const roleMaterialEnvelope = roleMaterialRef ? materialMap.get(roleMaterialRef.id) ?? null : null;
                      const roleMaterialName = stringValue(asPayload(roleMaterialEnvelope)?.name) ?? roleMaterialRef?.label;
                      return {
                        roleId: stringValue(role.role_id) ?? 'input',
                        roleType: stringValue(role.role_type) ?? 'other',
                        required: role.required !== false,
                        ...(roleMaterialRef?.id
                          ? {
                              materialRef: {
                                id: roleMaterialRef.id,
                                ...(roleMaterialName ? { label: roleMaterialName } : {}),
                              },
                            }
                          : {}),
                        ...(roleVendorProductRef?.id
                          ? {
                              vendorProductRef: {
                                id: roleVendorProductRef.id,
                                ...(roleVendorProductRef.label ? { label: roleVendorProductRef.label } : {}),
                              },
                            }
                          : {}),
                        allowedMaterialSpecRefs: Array.isArray(role.allowed_material_spec_refs)
                          ? role.allowed_material_spec_refs
                              .map(refValue)
                              .filter((entry): entry is RefShape => Boolean(entry))
                              .map((entry) => ({ id: entry.id, ...(entry.label ? { label: entry.label } : {}) }))
                          : [],
                        ...(() => {
                          const measureMode = stringValue(role.measure_mode) as IngredientMeasureMode | undefined;
                          return measureMode ? { measureMode } : {};
                        })(),
                        ...(() => {
                          const sourceState = stringValue(role.source_state) as IngredientSourceState | undefined;
                          return sourceState ? { sourceState } : {};
                        })(),
                        ...(() => {
                          const stockConcentration = parseIngredientConcentration(role.stock_concentration);
                          return stockConcentration ? { stockConcentration } : {};
                        })(),
                        ...(() => {
                          const targetContribution = parseIngredientConcentration(role.target_contribution);
                          return targetContribution ? { targetContribution } : {};
                        })(),
                        ...(() => {
                          const requiredAmount = flexibleQuantityValue(role.required_amount) ?? flexibleQuantityValue(role.quantity);
                          return requiredAmount ? { requiredAmount } : {};
                        })(),
                        ...(() => {
                          const molecularWeight = quantityValue(role.molecular_weight);
                          return molecularWeight ? { molecularWeight } : {};
                        })(),
                        ...(() => {
                          const compositionSnapshot = parseStoredIngredientComposition(role.composition_snapshot);
                          return compositionSnapshot.length > 0 ? { compositionSnapshot } : {};
                        })(),
                        ...(() => {
                          const quantity = flexibleQuantityValue(role.quantity);
                          return quantity ? { quantity } : {};
                        })(),
                        constraints: isStringArray(role.constraints) ? role.constraints : [],
                      };
                    })
                : [],
              ...(Array.isArray(payload.preferred_sources)
                ? {
                    preferredSources: payload.preferred_sources
                      .filter(isObject)
                      .map((source) => {
                        const materialRef = refValue(source.material_ref);
                        const materialSpecRef = refValue(source.material_spec_ref);
                        const vendorProductRef = refValue(source.vendor_product_ref);
                        return {
                          roleId: stringValue(source.role_id) ?? '',
                          ...(() => {
                            const vendor = stringValue(source.vendor);
                            return vendor ? { vendor } : {};
                          })(),
                          ...(() => {
                            const catalogNumber = stringValue(source.catalog_number);
                            return catalogNumber ? { catalogNumber } : {};
                          })(),
                          ...(materialRef?.id ? { materialRef: { id: materialRef.id, ...(materialRef.label ? { label: materialRef.label } : {}) } } : {}),
                          ...(materialSpecRef?.id ? { materialSpecRef: { id: materialSpecRef.id, ...(materialSpecRef.label ? { label: materialSpecRef.label } : {}) } } : {}),
                          ...(vendorProductRef?.id ? { vendorProductRef: { id: vendorProductRef.id, ...(vendorProductRef.label ? { label: vendorProductRef.label } : {}) } } : {}),
                        };
                      })
                      .filter((source) => source.roleId),
                  }
                : {}),
              steps: Array.isArray(payload.steps)
                ? payload.steps
                    .filter(isObject)
                    .map((step) => ({
                      order: typeof step.order === 'number' ? step.order : 0,
                      instruction: stringValue(step.instruction) ?? '',
                      ...(step.parameters && isObject(step.parameters) ? { parameters: step.parameters } : {}),
                    }))
                    .sort((a, b) => a.order - b.order)
                : [],
              ...(scale ? { scale } : {}),
              ...(batch ? { batch } : {}),
              inventory: {
                availableCount: availableAliquots.length,
                ...(totalAvailableVolume ? { totalAvailableVolume } : {}),
                recentAliquotIds: availableAliquots.slice(0, 5).map((entry) => entry.recordId),
                ...(lastPreparedAt ? { lastPreparedAt } : {}),
              },
            });
          } catch (err) {
            console.error('Skipping malformed formulation recipe', envelope.recordId, err);
          }
        }

        if (outputSpecFilter) {
          items = items.filter((entry) => entry.outputSpec.id === outputSpecFilter);
        }
        if (hasAvailableFilter === 'true') {
          items = items.filter((entry) => entry.inventory.availableCount > 0);
        }
        if (hasAvailableFilter === 'false') {
          items = items.filter((entry) => entry.inventory.availableCount === 0);
        }
        if (search) {
          items = items.filter((entry) =>
            [
              entry.recipeName,
              entry.outputSpec.name,
              entry.outputSpec.materialName,
              ...entry.inputRoles.map((role) => role.materialRef?.label ?? role.allowedMaterialSpecRefs[0]?.label ?? role.roleId),
              ...entry.inputRoles.map((role) => role.vendorProductRef?.label),
              ...(entry.preferredSources ?? []).flatMap((source) => [source.vendor, source.catalogNumber, source.vendorProductRef?.label]),
              ...entry.recipeTags,
              ...entry.steps.map((step) => step.instruction),
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(search))
          );
        }

        items.sort((a, b) => a.recipeName.localeCompare(b.recipeName));
        if (limit && limit > 0) {
          items = items.slice(0, limit);
        }

        return { items };
      } catch (err) {
        console.error('getFormulationsSummary failed', err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to load formulations summary',
        };
      }
    },

    async getInventory(request, reply) {
      try {
        const [specs, recipes, aliquots] = await Promise.all([
          listBySchema(store, SCHEMA_IDS.materialSpec),
          listBySchema(store, SCHEMA_IDS.recipe),
          listBySchema(store, SCHEMA_IDS.aliquot),
        ]);

        const specMap = new Map(specs.map((envelope) => [envelope.recordId, envelope]));
        const recipeMap = new Map(recipes.map((envelope) => [envelope.recordId, envelope]));
        const limit = request.query.limit ? Number(request.query.limit) : undefined;
        const search = request.query.q?.trim().toLowerCase() ?? '';

        let items: Array<{
          aliquotId: string;
          name: string;
          status?: string;
          materialSpec: {
            id: string;
            name: string;
          };
          recipe?: {
            id: string;
            name: string;
          };
          volume?: Quantity;
          concentration?: Concentration;
          storage?: {
            temperatureC?: number;
            location?: string;
          };
          lot?: {
            vendor?: string;
            catalogNumber?: string;
            lotNumber?: string;
            expirationDate?: string;
          };
          freezeThawCount?: number;
          createdAt?: string;
          tags: string[];
        }> = [];

        for (const envelope of aliquots) {
          try {
            const payload = asPayload(envelope);
            if (!payload || payload.kind !== 'aliquot') continue;
            const specRef = refValue(payload.material_spec_ref);
            if (!specRef) continue;
            const specEnvelope = specMap.get(specRef.id) ?? null;
            const recipeRef = refValue(payload.source_lot_ref);
            const recipeEnvelope = recipeRef?.type === 'recipe' ? recipeMap.get(recipeRef.id) ?? null : null;
            const storage = payload.storage && isObject(payload.storage)
              ? {
                  ...(() => {
                    const temperatureC = numberValue(payload.storage.temperature_C);
                    return temperatureC !== undefined ? { temperatureC } : {};
                  })(),
                  ...(() => {
                    const location = stringValue(payload.storage.location);
                    return location ? { location } : {};
                  })(),
                }
              : null;
            const lot = payload.lot && isObject(payload.lot)
              ? {
                  ...(() => {
                    const vendor = stringValue(payload.lot.vendor);
                    return vendor ? { vendor } : {};
                  })(),
                  ...(() => {
                    const catalogNumber = stringValue(payload.lot.catalog_number);
                    return catalogNumber ? { catalogNumber } : {};
                  })(),
                  ...(() => {
                    const lotNumber = stringValue(payload.lot.lot_number);
                    return lotNumber ? { lotNumber } : {};
                  })(),
                  ...(() => {
                    const expirationDate = stringValue(payload.lot.expiration_date);
                    return expirationDate ? { expirationDate } : {};
                  })(),
                }
              : null;

            const status = stringValue(payload.status);
            const volume = quantityValue(payload.volume);
            const concentration = concentrationValue(payload.concentration);
            const createdAt = stringValue(payload.createdAt);

            items.push({
              aliquotId: envelope.recordId,
              name: stringValue(payload.name) ?? envelope.recordId,
              ...(status ? { status } : {}),
          materialSpec: {
            id: specRef.id,
            name: recordName(specEnvelope) ?? specRef.label ?? specRef.id,
            ...(refValue(asPayload(specEnvelope)?.material_ref)?.id ? { materialId: refValue(asPayload(specEnvelope)?.material_ref)!.id } : {}),
          },
              ...(recipeEnvelope
                ? {
                    recipe: {
                      id: recipeEnvelope.recordId,
                      name: recordName(recipeEnvelope) ?? recipeEnvelope.recordId,
                    },
                  }
                : {}),
              ...(volume ? { volume } : {}),
              ...(concentration ? { concentration } : {}),
              ...(storage && Object.keys(storage).length > 0 ? { storage } : {}),
              ...(lot && Object.keys(lot).length > 0 ? { lot } : {}),
              ...(typeof payload.freeze_thaw_count === 'number' ? { freezeThawCount: payload.freeze_thaw_count } : {}),
              ...(createdAt ? { createdAt } : {}),
              tags: dedupeStrings(isStringArray(payload.tags) ? payload.tags : undefined) ?? [],
            });
          } catch (err) {
            console.error('Skipping malformed inventory aliquot', envelope.recordId, err);
          }
        }

        if (request.query.recipeId) {
          items = items.filter((entry) => entry.recipe?.id === request.query.recipeId);
        }
        if (request.query.materialSpecId) {
          items = items.filter((entry) => entry.materialSpec.id === request.query.materialSpecId);
        }
        if (request.query.status) {
          items = items.filter((entry) => entry.status === request.query.status);
        }
        if (search) {
          items = items.filter((entry) =>
            [
              entry.name,
              entry.aliquotId,
              entry.materialSpec.name,
              entry.recipe?.name,
              entry.storage?.location,
              ...entry.tags,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(search))
          );
        }

        items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
        if (limit && limit > 0) {
          items = items.slice(0, limit);
        }

        return { items };
      } catch (err) {
        console.error('getInventory failed', err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to load material inventory',
        };
      }
    },

    async draftFormulationFromText(request, reply) {
      try {
        const prompt = stringValue(request.body?.prompt);
        if (!prompt) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'prompt is required' };
        }
        return await draftFormulationFromPrompt(prompt, resolvePromptRef);
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to draft formulation from text',
        };
      }
    },

    async explainFormulationDraft(request, reply) {
      try {
        const draft = copilotDraftValue(request.body?.draft);
        if (!draft) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'draft is required' };
        }
        return summarizeFormulationDraftResult(draft);
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to explain formulation draft',
        };
      }
    },

    async suggestMissingFormulationFields(request, reply) {
      try {
        const draft = copilotDraftValue(request.body?.draft);
        if (!draft) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'draft is required' };
        }
        return suggestMissingFormulationFieldsResult(draft);
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to suggest formulation fields',
        };
      }
    },

    async flattenFormulationComposition(request, reply) {
      try {
        const draft = copilotDraftValue(request.body?.draft);
        if (!draft) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'draft is required' };
        }
        return flattenFormulationDraftResult(draft);
      } catch (err) {
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to flatten formulation composition',
        };
      }
    },

    async createFormulation(request, reply) {
      try {
        const body = request.body;
        const outputSpec = body.outputSpec;
        const recipe = body.recipe;

        if (!outputSpec || !recipe) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'outputSpec and recipe are required' };
        }
        if (!stringValue(outputSpec.name)) {
          reply.status(422);
          return { error: 'INVALID_FORMULATION', message: 'outputSpec.name is required' };
        }
        if (!stringValue(recipe.name)) {
          reply.status(422);
          return { error: 'INVALID_FORMULATION', message: 'recipe.name is required' };
        }
        if (!Array.isArray(recipe.inputRoles) || recipe.inputRoles.length === 0) {
          reply.status(422);
          return { error: 'INVALID_FORMULATION', message: 'recipe.inputRoles must include at least one role' };
        }
        if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
          reply.status(422);
          return { error: 'INVALID_FORMULATION', message: 'recipe.steps must include at least one step' };
        }

        const inferredOutputMaterialRef = (() => {
          if (!Array.isArray(recipe.inputRoles)) return undefined;
          const materialRoleIds = Array.from(new Set(
            recipe.inputRoles
              .map((role) => stringValue(role.materialRefId))
              .filter((entry): entry is string => Boolean(entry))
          ));
          return materialRoleIds.length === 1 ? materialRoleIds[0] : undefined;
        })();

        let materialId = stringValue(outputSpec.materialRefId) ?? inferredOutputMaterialRef;
        if (!materialId && stringValue(outputSpec.vendorProductRefId)) {
          materialId = (await vendorProductMaterialRef(store, stringValue(outputSpec.vendorProductRefId)!))?.id;
        }
        if (!materialId && Array.isArray(recipe.inputRoles)) {
          const vendorBoundMaterialIds = Array.from(new Set((await Promise.all(
            recipe.inputRoles
              .map((role) => stringValue(role.vendorProductRefId))
              .filter((entry): entry is string => Boolean(entry))
              .map((vendorProductId) => vendorProductMaterialRef(store, vendorProductId))
          ))
            .map((ref) => ref?.id)
            .filter((entry): entry is string => Boolean(entry))));
          if (vendorBoundMaterialIds.length === 1) materialId = vendorBoundMaterialIds[0];
        }
        const materialInput = body.material;
        if (!materialId && materialInput) {
          materialId = stringValue(materialInput.id) ?? token('MAT');
          const existing = await store.get(materialId);
          if (!existing) {
            if (!stringValue(materialInput.name)) {
              reply.status(422);
              return { error: 'INVALID_FORMULATION', message: 'material.name is required when creating a new output material' };
            }
            const createdMaterial = await createStoredRecord(
              store,
              {
                kind: 'material',
                id: materialId,
                name: stringValue(materialInput.name),
                domain: stringValue(materialInput.domain) ?? 'other',
                ...(Array.isArray(materialInput.classRefs)
                  ? {
                      class: materialInput.classRefs
                        .map((entry) => looseRefValue(entry))
                        .filter((entry): entry is RefShape => Boolean(entry)),
                    }
                  : {}),
                ...(molecularWeightValue(materialInput.molecularWeight)
                  ? { molecular_weight: molecularWeightValue(materialInput.molecularWeight) }
                  : {}),
                ...(stringValue(materialInput.definition) ? { definition: stringValue(materialInput.definition) } : {}),
                ...(isStringArray(materialInput.synonyms) ? { synonyms: dedupeStrings(materialInput.synonyms) } : {}),
              },
              SCHEMA_IDS.material,
              `Create material ${materialId} for formulation`
            );
            if (!createdMaterial) {
              reply.status(500);
              return { error: 'CREATE_FAILED', message: `Failed to create material ${materialId}` };
            }
          }
        }

        if (!materialId) {
          materialId = token('MAT');
          const inferredMaterialName = stringValue(outputSpec.name) ?? materialId;
          const createdMaterial = await createStoredRecord(
            store,
            {
              kind: 'material',
              id: materialId,
              name: inferredMaterialName,
              domain: 'other',
            },
            SCHEMA_IDS.material,
            `Infer material ${materialId} from formulation output ${inferredMaterialName}`
          );
          if (!createdMaterial) {
            reply.status(500);
            return { error: 'CREATE_FAILED', message: `Failed to infer material ${materialId}` };
          }
        }

        const materialSpecId = stringValue(outputSpec.id) ?? token('MSP');
        const recipeId = stringValue(recipe.id) ?? token('RCP');
        const roleIds = new Set<string>();
        const normalizedInputRoles = await Promise.all(recipe.inputRoles.map(async (role, index) => {
          const roleId = stringValue(role.roleId) ?? `input-${index + 1}`;
          if (roleIds.has(roleId)) {
            throw new Error(`Duplicate roleId: ${roleId}`);
          }
          roleIds.add(roleId);
          const materialRefId = stringValue(role.materialRefId);
          const vendorProductRefId = stringValue(role.vendorProductRefId);
          const allowedMaterialSpecRefIds = role.allowedMaterialSpecRefIds?.filter((entry) => typeof entry === 'string' && entry.trim()) ?? [];
          const legacyQuantity = flexibleQuantityValue(role.quantity);
          const requiredAmount = quantityValue(role.requiredAmount) ?? quantityValue(role.quantity);
          const explicitStockConcentration = parseIngredientConcentration(role.stockConcentration);
          const explicitTargetContribution = parseIngredientConcentration(role.targetContribution);
          const explicitCompositionSnapshot = toStoredCompositionEntries(role.compositionSnapshot);
          const explicitMolecularWeight = molecularWeightValue(role.molecularWeight);
          let inheritedStockConcentration = explicitStockConcentration;
          let inheritedCompositionSnapshot = explicitCompositionSnapshot;

          if ((!inheritedStockConcentration || !inheritedCompositionSnapshot) && vendorProductRefId) {
            inheritedStockConcentration = inheritedStockConcentration ?? await vendorProductDeclaredConcentration(store, vendorProductRefId);
            inheritedCompositionSnapshot = inheritedCompositionSnapshot ?? await vendorProductDeclaredComposition(store, vendorProductRefId);
          }

          if ((!inheritedStockConcentration || !inheritedCompositionSnapshot) && allowedMaterialSpecRefIds[0]) {
            const specEnvelope = await store.get(allowedMaterialSpecRefIds[0]);
            const specPayload = asPayload(specEnvelope);
            const specFormulation = specPayload?.formulation && isObject(specPayload.formulation) ? specPayload.formulation : null;
            inheritedStockConcentration = inheritedStockConcentration ?? parseIngredientConcentration(specFormulation?.concentration);
            inheritedCompositionSnapshot = inheritedCompositionSnapshot ?? toStoredCompositionEntries(specFormulation?.composition);
          }

          return {
            roleId,
            ref: materialRefId
              ? toRef(materialRefId, 'material', materialRefId)
              : vendorProductRefId
                ? toRef(vendorProductRefId, 'vendor-product', vendorProductRefId)
                : allowedMaterialSpecRefIds[0]
                  ? toRef(allowedMaterialSpecRefIds[0], 'material-spec', allowedMaterialSpecRefIds[0])
                  : null,
            roleType: stringValue(role.roleType) ?? 'other',
            measureMode: stringValue(role.measureMode) as IngredientMeasureMode | undefined,
            sourceState: stringValue(role.sourceState) as IngredientSourceState | undefined,
            ...(inheritedStockConcentration ? { stockConcentration: inheritedStockConcentration } : {}),
            ...(explicitTargetContribution ? { targetContribution: explicitTargetContribution } : {}),
            ...(requiredAmount ? { requiredAmount } : legacyQuantity ? { requiredAmount: legacyQuantity } : {}),
            ...(explicitMolecularWeight ? { molecularWeight: explicitMolecularWeight } : {}),
            ...(inheritedCompositionSnapshot ? { compositionSnapshot: parseStoredIngredientComposition(inheritedCompositionSnapshot) } : {}),
            stored: {
              role_id: roleId,
              role_type: stringValue(role.roleType) ?? 'other',
              required: role.required !== false,
              ...(materialRefId ? { material_ref: toRef(materialRefId, 'material', materialRefId) } : {}),
              ...(vendorProductRefId ? { vendor_product_ref: toRef(vendorProductRefId, 'vendor-product', vendorProductRefId) } : {}),
              ...(allowedMaterialSpecRefIds.length
                ? { allowed_material_spec_refs: allowedMaterialSpecRefIds.map((entry) => toRef(entry, 'material-spec', entry)) }
                : {}),
              ...(stringValue(role.measureMode) ? { measure_mode: stringValue(role.measureMode) } : {}),
              ...(stringValue(role.sourceState) ? { source_state: stringValue(role.sourceState) } : {}),
              ...(inheritedStockConcentration ? { stock_concentration: toStoredIngredientConcentration(inheritedStockConcentration) } : {}),
              ...(explicitTargetContribution ? { target_contribution: toStoredIngredientConcentration(explicitTargetContribution) } : {}),
              ...(requiredAmount ? { required_amount: requiredAmount } : {}),
              ...(legacyQuantity ? { quantity: legacyQuantity } : requiredAmount ? { quantity: requiredAmount } : {}),
              ...(explicitMolecularWeight ? { molecular_weight: explicitMolecularWeight } : {}),
              ...(inheritedCompositionSnapshot ? { composition_snapshot: inheritedCompositionSnapshot } : {}),
              ...(role.constraints?.length ? { constraints: dedupeStrings(role.constraints) } : {}),
            },
          };
        }));

        const defaultOutputQuantity = quantityValue(recipe.batch?.defaultOutputQuantity) ?? quantityValue(recipe.scale?.defaultBatchVolume);
        const computedFormulation = computeFormulation({
          ingredients: normalizedInputRoles.map((role) => ({
            ...(role.ref ? { ref: role.ref } : {}),
            roleType: role.roleType,
            ...(role.measureMode ? { measureMode: role.measureMode } : {}),
            ...(role.sourceState ? { sourceState: role.sourceState } : {}),
            ...(role.stockConcentration ? { stockConcentration: role.stockConcentration } : {}),
            ...(role.targetContribution ? { targetContribution: role.targetContribution } : {}),
            ...(role.requiredAmount ? { requiredAmount: role.requiredAmount } : {}),
            ...(role.molecularWeight ? { molecularWeight: role.molecularWeight } : {}),
            ...(role.compositionSnapshot ? { compositionSnapshot: role.compositionSnapshot } : {}),
          })),
          ...(defaultOutputQuantity ? { totalOutputQuantity: defaultOutputQuantity } : {}),
        });

        const inputRoles = normalizedInputRoles.map((role, index) => ({
          ...role.stored,
          ...(computedFormulation.ingredients[index]?.resolvedAmount && !role.stored.required_amount
            ? { required_amount: computedFormulation.ingredients[index].resolvedAmount }
            : {}),
          ...(computedFormulation.ingredients[index]?.resolvedAmount && !role.stored.quantity
            ? { quantity: computedFormulation.ingredients[index].resolvedAmount }
            : {}),
        }));

        const specPayload: Record<string, unknown> = {
          kind: 'material-spec',
          id: materialSpecId,
          name: stringValue(outputSpec.name),
          material_ref: toRef(materialId, 'material', materialId),
        };
        if (stringValue(outputSpec.vendorProductRefId)) {
          specPayload.vendor_product_ref = toRef(stringValue(outputSpec.vendorProductRefId)!, 'vendor-product', stringValue(outputSpec.vendorProductRefId)!);
        }
        const formulation: Record<string, unknown> = {};
        const declaredVendorConcentration = stringValue(outputSpec.vendorProductRefId)
          ? await vendorProductDeclaredConcentration(store, stringValue(outputSpec.vendorProductRefId)!)
          : undefined;
        const computedOutputComposition = toStoredCompositionEntries(computedFormulation.outputComposition);
        const resolvedConcentration = outputSpec.concentration
          ?? extractPrimaryDeclaredConcentration(outputSpec.composition)
          ?? extractPrimaryDeclaredConcentration(computedOutputComposition)
          ?? declaredVendorConcentration;
        const concentration = toStoredConcentration(resolvedConcentration);
        if (concentration) formulation.concentration = concentration;
        const solventRef = looseRefValue(outputSpec.solventRef)
          ?? (stringValue(outputSpec.solventRefId)
            ? toRef(stringValue(outputSpec.solventRefId)!, 'material', stringValue(outputSpec.solventRefId)!)
            : null);
        if (solventRef) formulation.solvent_ref = solventRef;
        const composition = toStoredCompositionEntries(outputSpec.composition)
          ?? computedOutputComposition
          ?? (stringValue(outputSpec.vendorProductRefId)
            ? await vendorProductDeclaredComposition(store, stringValue(outputSpec.vendorProductRefId)!)
            : undefined)
          ?? deriveSimpleStoredComposition({
            materialRef: toRef(materialId, 'material', stringValue(outputSpec.name) ?? materialId),
            materialLabel: stringValue(outputSpec.name) ?? materialId,
            ...(resolvedConcentration ? { concentration: resolvedConcentration } : {}),
            solventRef,
            ...(solventRef?.label ? { solventLabel: solventRef.label } : {}),
          });
        if (composition) formulation.composition = composition;
        if (stringValue(outputSpec.grade)) formulation.grade = stringValue(outputSpec.grade);
        if (typeof outputSpec.ph === 'number' && Number.isFinite(outputSpec.ph)) formulation.ph = outputSpec.ph;
        if (stringValue(outputSpec.notes)) formulation.notes = stringValue(outputSpec.notes);
        if (Object.keys(formulation).length > 0) specPayload.formulation = formulation;

        if (outputSpec.handling && isObject(outputSpec.handling)) {
          const handling: Record<string, unknown> = {};
          if (typeof outputSpec.handling.storageTemperatureC === 'number') handling.storage_temperature_C = outputSpec.handling.storageTemperatureC;
          if (typeof outputSpec.handling.lightSensitive === 'boolean') handling.light_sensitive = outputSpec.handling.lightSensitive;
          if (typeof outputSpec.handling.maxFreezeThawCycles === 'number') handling.max_freeze_thaw_cycles = outputSpec.handling.maxFreezeThawCycles;
          if (stringValue(outputSpec.handling.stabilityNote)) handling.stability_note = stringValue(outputSpec.handling.stabilityNote);
          if (Object.keys(handling).length > 0) specPayload.handling = handling;
        }
        if (outputSpec.tags && outputSpec.tags.length) specPayload.tags = dedupeStrings(outputSpec.tags);

        const createdSpec = await createStoredRecord(
          store,
          specPayload,
          SCHEMA_IDS.materialSpec,
          `Create material spec ${materialSpecId}`
        );
        if (!createdSpec) {
          reply.status(500);
          return { error: 'CREATE_FAILED', message: `Failed to create material spec ${materialSpecId}` };
        }

        const steps = recipe.steps
          .map((step, index) => ({
            order: typeof step.order === 'number' ? step.order : index + 1,
            instruction: stringValue(step.instruction) ?? '',
            ...(step.parameters && isObject(step.parameters) ? { parameters: step.parameters } : {}),
          }))
          .filter((step) => step.instruction);

        if (steps.length === 0) {
          reply.status(422);
          return { error: 'INVALID_FORMULATION', message: 'recipe.steps must include at least one instruction' };
        }

        const recipePayload: Record<string, unknown> = {
          kind: 'recipe',
          id: recipeId,
          name: stringValue(recipe.name),
          input_roles: inputRoles,
          steps,
          output_material_spec_ref: toRef(materialSpecId, 'material-spec', stringValue(outputSpec.name) ?? materialSpecId),
        };
        if (Object.keys(formulation).length > 0) recipePayload.output = { ...formulation };
        if (Array.isArray(recipe.preferredSources) && recipe.preferredSources.length > 0) {
          const preferredSources = recipe.preferredSources
            .filter(isObject)
            .map((source) => ({
              role_id: stringValue(source.roleId) ?? '',
              ...(stringValue(source.vendor) ? { vendor: stringValue(source.vendor) } : {}),
              ...(stringValue(source.catalogNumber) ? { catalog_number: stringValue(source.catalogNumber) } : {}),
              ...(stringValue(source.materialRefId) ? { material_ref: toRef(stringValue(source.materialRefId)!, 'material', stringValue(source.materialRefId)!) } : {}),
              ...(stringValue(source.materialSpecRefId) ? { material_spec_ref: toRef(stringValue(source.materialSpecRefId)!, 'material-spec', stringValue(source.materialSpecRefId)!) } : {}),
              ...(stringValue(source.vendorProductRefId) ? { vendor_product_ref: toRef(stringValue(source.vendorProductRefId)!, 'vendor-product', stringValue(source.vendorProductRefId)!) } : {}),
            }))
            .filter((source) => source.role_id);
          if (preferredSources.length > 0) recipePayload.preferred_sources = preferredSources;
        }

        if (recipe.scale && isObject(recipe.scale)) {
          const scale: Record<string, unknown> = {};
          const defaultBatchVolume = quantityValue(recipe.scale.defaultBatchVolume);
          if (defaultBatchVolume) scale.default_batch_volume = defaultBatchVolume;
          if (Array.isArray(recipe.scale.supportedBatchVolumes)) {
            const supported = recipe.scale.supportedBatchVolumes.map(quantityValue).filter((entry): entry is Quantity => Boolean(entry));
            if (supported.length > 0) scale.supported_batch_volumes = supported;
          }
          if (Object.keys(scale).length > 0) recipePayload.scale = scale;
        }
        if (recipe.batch && isObject(recipe.batch)) {
          const batch: Record<string, unknown> = {};
          const defaultOutputQuantity = quantityValue(recipe.batch.defaultOutputQuantity);
          if (defaultOutputQuantity) batch.default_output_quantity = defaultOutputQuantity;
          if (Array.isArray(recipe.batch.supportedOutputQuantities)) {
            const supported = recipe.batch.supportedOutputQuantities.map(quantityValue).filter((entry): entry is Quantity => Boolean(entry));
            if (supported.length > 0) batch.supported_output_quantities = supported;
          }
          if (Object.keys(batch).length > 0) recipePayload.batch = batch;
        } else if (recipePayload.scale && !recipePayload.batch) {
          const scale = recipePayload.scale as Record<string, unknown>;
          const batch: Record<string, unknown> = {};
          if (scale.default_batch_volume) batch.default_output_quantity = scale.default_batch_volume;
          if (Array.isArray(scale.supported_batch_volumes)) batch.supported_output_quantities = scale.supported_batch_volumes;
          if (Object.keys(batch).length > 0) recipePayload.batch = batch;
        }
        if (recipe.tags?.length) recipePayload.tags = dedupeStrings(recipe.tags);

        const createdRecipe = await createStoredRecord(
          store,
          recipePayload,
          SCHEMA_IDS.recipe,
          `Create recipe ${recipeId}`
        );
        if (!createdRecipe) {
          reply.status(500);
          return { error: 'CREATE_FAILED', message: `Failed to create recipe ${recipeId}` };
        }

        if (indexManager) {
          try {
            await indexManager.rebuild();
          } catch (indexErr) {
            console.error('Failed to update index after formulation create:', indexErr);
          }
        }

        return {
          success: true,
          materialId,
          materialSpecId,
          recipeId,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create formulation';
        reply.status(message.startsWith('Duplicate roleId') ? 422 : 500);
        return {
          error: message.startsWith('Duplicate roleId') ? 'INVALID_FORMULATION' : 'INTERNAL_ERROR',
          message,
        };
      }
    },

    async executeRecipe(request, reply) {
      const recipeId = request.params.id;
      const scale = Number.isFinite(request.body?.scale) ? Number(request.body.scale) : 1;
      const outputCount = Number.isFinite(request.body?.outputCount) ? Math.max(1, Math.floor(Number(request.body.outputCount))) : 1;
      const outputMode = request.body?.outputMode === 'batch' ? 'batch' : 'batch-and-split';
      const outputVolume = request.body?.outputVolume && Number.isFinite(request.body.outputVolume.value)
        ? request.body.outputVolume
        : { value: 100, unit: 'uL' };
      const notes = typeof request.body?.notes === 'string' ? request.body.notes : undefined;

      const recipeEnv = await store.get(recipeId);
      if (!recipeEnv) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Recipe not found: ${recipeId}` };
      }
      const recipePayload = asPayload(recipeEnv);
      if (!recipePayload || recipePayload.kind !== 'recipe') {
        reply.status(422);
        return { error: 'INVALID_RECIPE', message: `${recipeId} is not a recipe record` };
      }
      const outputSpecRef = parseOutputSpecRef(recipePayload);
      if (!outputSpecRef) {
        reply.status(422);
        return { error: 'INVALID_RECIPE', message: 'Recipe is missing output_material_spec_ref' };
      }

      const outputSpecEnv = await store.get(outputSpecRef.id);
      const outputSpecPayload = asPayload(outputSpecEnv);
      const recipeOutput = recipePayload.output && isObject(recipePayload.output) ? recipePayload.output : null;
      const specFormulation = outputSpecPayload?.formulation && isObject(outputSpecPayload.formulation)
        ? outputSpecPayload.formulation
        : null;
      const recipeName = stringValue(recipePayload.name) ?? recipeId;
      const bindings = isObject(request.body?.bindings) ? request.body.bindings : {};
      const inputRoles = Array.isArray(recipePayload.input_roles)
        ? recipePayload.input_roles.filter(isObject)
        : [];

      const boundInputs: Array<{
        roleId: string;
        aliquotId: string;
        aliquotName?: string;
        aliquotRef: RefShape;
      }> = [];

      for (const role of inputRoles) {
        const roleId = stringValue(role.role_id) ?? 'input';
        const required = role.required !== false;
        const binding = isObject(bindings[roleId]) ? bindings[roleId] : null;
        const aliquotId = binding ? stringValue(binding.aliquotId) : undefined;

        if (!aliquotId) {
          if (required) {
            reply.status(422);
            return { error: 'INVALID_BINDINGS', message: `Missing binding for required role "${roleId}"` };
          }
          continue;
        }

        const aliquotEnv = await store.get(aliquotId);
        const aliquotPayload = asPayload(aliquotEnv);
        if (!aliquotPayload || aliquotPayload.kind !== 'aliquot') {
          reply.status(422);
          return { error: 'INVALID_BINDINGS', message: `Bound aliquot not found or invalid: ${aliquotId}` };
        }
        const status = stringValue(aliquotPayload.status);
        if (status && status !== 'available') {
          reply.status(422);
          return { error: 'INVALID_BINDINGS', message: `Aliquot ${aliquotId} is not available` };
        }

        const boundSpecRef = refValue(aliquotPayload.material_spec_ref);
        const boundSpecPayload = boundSpecRef ? asPayload(await store.get(boundSpecRef.id)) : null;
        const boundMaterialRef = refValue(boundSpecPayload?.material_ref);
        const allowedRefs = Array.isArray(role.allowed_material_spec_refs)
          ? role.allowed_material_spec_refs.map(refValue).filter((entry): entry is RefShape => Boolean(entry))
          : [];
        const requiredMaterialRef = refValue(role.material_ref);
        if (allowedRefs.length > 0 && (!boundSpecRef || !allowedRefs.some((entry) => entry.id === boundSpecRef.id))) {
          reply.status(422);
          return {
            error: 'INVALID_BINDINGS',
            message: `Aliquot ${aliquotId} does not satisfy allowed material specs for role "${roleId}"`,
          };
        }
        if (requiredMaterialRef?.id && (!boundMaterialRef || boundMaterialRef.id !== requiredMaterialRef.id)) {
          reply.status(422);
          return {
            error: 'INVALID_BINDINGS',
            message: `Aliquot ${aliquotId} does not satisfy required material for role "${roleId}"`,
          };
        }

        boundInputs.push({
          roleId,
          aliquotId,
          aliquotName: stringValue(aliquotPayload.name) ?? aliquotId,
          aliquotRef: toRef(aliquotId, 'aliquot', stringValue(aliquotPayload.name) ?? aliquotId),
        });
      }

      const now = new Date().toISOString();
      const materialInstanceId = `MINST-${Date.now().toString(36).toUpperCase()}-${randomToken()}`;
      const materialInstanceName = `${recipeName} batch`;
      const batchVolume = {
        value: Number((outputVolume.value * scale * Math.max(outputMode === 'batch-and-split' ? outputCount : 1, 1)).toFixed(6)),
        unit: outputVolume.unit,
      };
      const materialRefFromSpec = outputSpecPayload ? refValue(outputSpecPayload.material_ref) : null;
      const outputConcentration = toStoredConcentration(recipeOutput?.concentration) ?? toStoredConcentration(specFormulation?.concentration);
      const batchPayload: Record<string, unknown> = {
        kind: 'material-instance',
        id: materialInstanceId,
        name: materialInstanceName,
        material_spec_ref: outputSpecRef,
        ...(materialRefFromSpec ? { material_ref: materialRefFromSpec } : {}),
        volume: batchVolume,
        status: 'available',
        prepared_on: now,
        tags: ['recipe-output', 'prepared-batch'],
        ...(request.body?.outputMetadata?.storageLocation ? { storage: { location: request.body.outputMetadata.storageLocation } } : {}),
      };
      if (outputConcentration) batchPayload.concentration = outputConcentration;
      const batchEnvelope = createEnvelope(
        batchPayload,
        SCHEMA_IDS.materialInstance,
        { createdAt: now, updatedAt: now }
      );
      if (!batchEnvelope) {
        reply.status(500);
        return { error: 'CREATE_FAILED', message: 'Failed to create material instance envelope' };
      }
      const createdBatch = await store.create({
        envelope: batchEnvelope,
        message: `Create material instance ${materialInstanceId} from recipe ${recipeId}`,
      });
      if (!createdBatch.success) {
        reply.status(500);
        return { error: 'CREATE_FAILED', message: createdBatch.error || `Failed to create material instance ${materialInstanceId}` };
      }

      const createdAliquots: Array<{
        aliquotId: string;
        name: string;
        materialSpecId: string;
        materialSpecName?: string;
        volume?: Quantity;
        status?: string;
      }> = [];

      if (outputMode === 'batch-and-split') {
      for (let i = 0; i < outputCount; i += 1) {
        const aliquotId = `ALQ-${Date.now().toString(36).toUpperCase()}-${randomToken()}-${i + 1}`;
        const baseVolume = {
          value: Number((outputVolume.value * scale).toFixed(6)),
          unit: outputVolume.unit,
        };
        const containerType = request.body?.outputMetadata?.containerType;
        const storageLocation = request.body?.outputMetadata?.storageLocation;
        const aliquotPayload: Record<string, unknown> = {
          kind: 'aliquot',
          id: aliquotId,
          name: `${recipeName} output ${i + 1}`,
          material_spec_ref: outputSpecRef,
          parent_material_instance_ref: toRef(materialInstanceId, 'material-instance', materialInstanceName),
          volume: baseVolume,
          source_lot_ref: toRef(recipeId, 'recipe', recipeName),
          tags: ['recipe-output'],
          status: 'available',
          freeze_thaw_count: 0,
          createdAt: now,
          updatedAt: now,
        };
        if (outputConcentration) aliquotPayload.concentration = outputConcentration;
        if (containerType || request.body?.outputMetadata?.barcodePrefix) {
          aliquotPayload.container = {
            ...(containerType ? { type: containerType } : {}),
            ...(request.body?.outputMetadata?.barcodePrefix ? { barcode: `${request.body.outputMetadata.barcodePrefix}-${i + 1}` } : {}),
          };
        }
        if (storageLocation) {
          aliquotPayload.storage = { location: storageLocation };
        }
        const aliquotEnvelope = createEnvelope(
          aliquotPayload,
          SCHEMA_IDS.aliquot,
          { createdAt: now, updatedAt: now }
        );
        if (!aliquotEnvelope) {
          reply.status(500);
          return { error: 'CREATE_FAILED', message: 'Failed to create aliquot envelope' };
        }
        const created = await store.create({
          envelope: aliquotEnvelope,
          message: `Create aliquot ${aliquotId} from recipe ${recipeId}`,
        });
        if (!created.success) {
          reply.status(500);
          return { error: 'CREATE_FAILED', message: created.error || `Failed to create aliquot ${aliquotId}` };
        }
        const materialSpecName = stringValue(outputSpecPayload?.name) ?? outputSpecRef.label;
        createdAliquots.push({
          aliquotId,
          name: String(aliquotPayload.name),
          materialSpecId: outputSpecRef.id,
          ...(materialSpecName ? { materialSpecName } : {}),
          volume: baseVolume,
          status: 'available',
        });
      }
      }

      const prepEventGraphId = `EVG-PREP-${Date.now().toString(36).toUpperCase()}-${randomToken()}`;
      const prepPayload = {
        id: prepEventGraphId,
        name: `Preparation Run ${recipeId}`,
        description: 'Recipe execution provenance',
        status: 'filed',
        tags: ['preparation-run', 'recipe'],
        events: [
          {
            eventId: `evt-prep-${randomToken()}`,
            event_type: 'other',
            details: {
              prep_kind: 'recipe_execution',
              recipe_ref: toRef(recipeId, 'recipe', recipeName),
              scale,
              input_bindings: boundInputs.map((entry) => ({
                role_id: entry.roleId,
                aliquot_ref: entry.aliquotRef,
              })),
              outputs: createdAliquots.map((entry) => ({
                aliquot_ref: toRef(entry.aliquotId, 'aliquot', entry.name),
                ...(entry.volume ? { volume: entry.volume } : {}),
              })),
              material_instance_ref: toRef(materialInstanceId, 'material-instance', materialInstanceName),
              output_mode: outputMode,
              batch_volume: batchVolume,
              ...(request.body?.outputMetadata
                ? {
                    output_metadata: {
                      ...(request.body.outputMetadata.containerType ? { container_type: request.body.outputMetadata.containerType } : {}),
                      ...(request.body.outputMetadata.storageLocation ? { storage_location: request.body.outputMetadata.storageLocation } : {}),
                    },
                  }
                : {}),
              ...(notes ? { notes } : {}),
            },
            notes: 'Recipe execution recorded by materials preparation endpoint',
          },
        ],
        labwares: [],
        createdAt: now,
        updatedAt: now,
      };
      const prepEnvelope = createEnvelope(
        prepPayload,
        SCHEMA_IDS.eventGraph,
        { createdAt: now, updatedAt: now }
      );
      if (!prepEnvelope) {
        reply.status(500);
        return { error: 'CREATE_FAILED', message: 'Failed to create preparation event graph envelope' };
      }
      const prepCreate = await store.create({
        envelope: prepEnvelope,
        message: `Record recipe preparation run ${prepEventGraphId}`,
      });
      if (!prepCreate.success) {
        reply.status(500);
        return { error: 'CREATE_FAILED', message: prepCreate.error || 'Failed to create preparation event graph' };
      }

      if (indexManager) {
        try {
          await indexManager.rebuild();
        } catch (indexErr) {
          console.error('Failed to update index after recipe execution:', indexErr);
        }
      }

      return {
        success: true,
        recipeId,
        recipeName,
        preparationEventGraphId: prepEventGraphId,
        materialInstanceId,
        materialInstanceName,
        createdAliquotIds: createdAliquots.map((entry) => entry.aliquotId),
        createdAliquots,
        bindings: boundInputs.map((entry) => ({
          roleId: entry.roleId,
          aliquotId: entry.aliquotId,
          ...(entry.aliquotName ? { aliquotName: entry.aliquotName } : {}),
        })),
      };
    },
  };
}

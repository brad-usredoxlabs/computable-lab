import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordEnvelope } from '../../store/types.js';
import type { RecordStore } from '../../store/types.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';
import type { IndexManager } from '../../index/IndexManager.js';

const SCHEMA_IDS = {
  material: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  vendorProduct: 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
  materialSpec: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
  materialInstance: 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
  recipe: 'https://computable-lab.com/schema/computable-lab/recipe.schema.yaml',
  aliquot: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
  eventGraph: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
} as const;

const ALLOWED_CONCENTRATION_UNITS = new Set(['g', 'mM', 'uM', 'nM', 'mg/mL', '%', 'U', 'X']);

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

type CreateFormulationBody = {
  material?: {
    id?: string;
    name?: string;
    domain?: string;
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
    concentration?: { value: number; unit: string };
    solventRefId?: string;
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
}

export function createMaterialPrepHandlers(store: RecordStore, indexManager?: IndexManager): MaterialPrepHandlers {
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
            concentration?: Quantity;
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
            const solventRef = refValue(formulationRef?.solvent_ref);
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
            const totalAvailableVolume = sumSingleUnitQuantities(availableVolumes);
            const lastPreparedAt = stringValue(asPayload(availableAliquots[0] ?? null)?.createdAt);
            const materialName = stringValue(materialPayload?.name) ?? materialRef?.label;
            const concentration = quantityValue(formulationRef?.concentration);
            const grade = stringValue(formulationRef?.grade);
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
          concentration?: Quantity;
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
            const concentration = quantityValue(payload.concentration);
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
        const concentration = quantityValue(outputSpec.concentration);
        if (concentration && !ALLOWED_CONCENTRATION_UNITS.has(concentration.unit)) {
          reply.status(422);
          return {
            error: 'INVALID_FORMULATION',
            message: `outputSpec.concentration.unit must be one of: ${Array.from(ALLOWED_CONCENTRATION_UNITS).join(', ')}`,
          };
        }
        if (concentration) formulation.concentration = concentration;
        if (stringValue(outputSpec.solventRefId)) formulation.solvent_ref = toRef(stringValue(outputSpec.solventRefId)!, 'material-spec', stringValue(outputSpec.solventRefId)!);
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

        const roleIds = new Set<string>();
        const inputRoles = recipe.inputRoles.map((role, index) => {
          const roleId = stringValue(role.roleId) ?? `input-${index + 1}`;
          if (roleIds.has(roleId)) {
            throw new Error(`Duplicate roleId: ${roleId}`);
          }
          roleIds.add(roleId);
          const quantity = flexibleQuantityValue(role.quantity);
          return {
            role_id: roleId,
            role_type: stringValue(role.roleType) ?? 'other',
            required: role.required !== false,
            ...(stringValue(role.materialRefId)
              ? { material_ref: toRef(stringValue(role.materialRefId)!, 'material', stringValue(role.materialRefId)!) }
              : {}),
            ...(stringValue(role.vendorProductRefId)
              ? { vendor_product_ref: toRef(stringValue(role.vendorProductRefId)!, 'vendor-product', stringValue(role.vendorProductRefId)!) }
              : {}),
            ...(role.allowedMaterialSpecRefIds?.length
              ? {
                  allowed_material_spec_refs: role.allowedMaterialSpecRefIds
                    .filter((entry) => typeof entry === 'string' && entry.trim())
                    .map((entry) => toRef(entry, 'material-spec', entry)),
                }
              : {}),
            ...(quantity ? { quantity } : {}),
            ...(role.constraints?.length ? { constraints: dedupeStrings(role.constraints) } : {}),
          };
        });

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

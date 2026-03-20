import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { RecordEnvelope } from '../../store/types.js';
import type { RecordStore } from '../../store/types.js';

const SCHEMA_IDS = {
  material: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  vendorProduct: 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
  materialSpec: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
  materialInstance: 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
  aliquot: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
  materialDerivation: 'https://computable-lab.com/schema/computable-lab/material-derivation.schema.yaml',
  context: 'computable-lab/context',
} as const;

type RefShape = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};

type Quantity = { value: number; unit: string };

type MaterialSearchCategory = 'saved-stock' | 'vendor-reagent' | 'prepared-material' | 'biological-derived' | 'concept-only';

type MaterialSearchItem = {
  recordId: string;
  kind: string;
  title: string;
  category: MaterialSearchCategory;
  subtitle?: string;
};

type CreateMaterialInstanceBody = {
  name?: string;
  materialRef?: RefShape;
  materialSpecRef?: RefShape;
  vendorProductRef?: RefShape;
  parentMaterialInstanceRef?: RefShape;
  preparedOn?: string;
  concentration?: Quantity;
  volume?: Quantity;
  lot?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  status?: string;
  tags?: string[];
  biologicalState?: Record<string, unknown>;
  derivedState?: Record<string, unknown>;
  derivationRef?: RefShape;
};

type SplitMaterialInstanceBody = {
  items?: Array<{
    id?: string;
    name?: string;
    volume?: Quantity;
    lot?: Record<string, unknown>;
    storage?: Record<string, unknown>;
    tags?: string[];
  }>;
  count?: number;
  defaultVolume?: Quantity;
};

type SplitItem = NonNullable<SplitMaterialInstanceBody['items']>[number];

type CreateMaterialDerivationBody = {
  name?: string;
  derivationType?: string;
  inputs?: RefShape[];
  protocolRef?: RefShape;
  sourceEventGraphRef?: RefShape;
  conditions?: Record<string, unknown>;
  notes?: string;
  output?: CreateMaterialInstanceBody & { name?: string };
};

type PromoteMaterialFromContextBody = {
  sourceContextIds?: string[];
  outputMode?: 'prepared-material' | 'biological-material' | 'derived-material';
  name?: string;
  materialRef?: RefShape;
  materialSpecRef?: RefShape;
  vendorProductRef?: RefShape;
  derivationType?: string;
  preparedOn?: string;
  volume?: Quantity;
  storage?: Record<string, unknown>;
  lot?: Record<string, unknown>;
  notes?: string;
  biologicalState?: Record<string, unknown>;
  derivedState?: Record<string, unknown>;
};

function token(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
  const numeric = numberValue(value.value);
  const unit = stringValue(value.unit);
  if (numeric === undefined || !unit) return undefined;
  return { value: numeric, unit };
}

function refValue(value: unknown): RefShape | undefined {
  if (!isObject(value)) return undefined;
  const kind = value.kind === 'ontology' ? 'ontology' : 'record';
  const id = stringValue(value.id);
  if (!id) return undefined;
  const type = stringValue(value.type);
  const label = stringValue(value.label);
  const namespace = stringValue(value.namespace);
  const uri = stringValue(value.uri);
  return {
    kind,
    id,
    ...(type ? { type } : {}),
    ...(label ? { label } : {}),
    ...(namespace ? { namespace } : {}),
    ...(uri ? { uri } : {}),
  };
}

function toRef(id: string, type: string, label?: string): RefShape {
  return { kind: 'record', id, type, ...(label ? { label } : {}) };
}

function normalizeDateTime(value?: string): string | undefined {
  const trimmed = stringValue(value);
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function dedupeStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
  return filtered.length > 0 ? Array.from(new Set(filtered)) : undefined;
}

async function createRecord(store: RecordStore, recordId: string, schemaId: string, payload: Record<string, unknown>, message: string): Promise<RecordEnvelope | null> {
  const result = await store.create({
    envelope: { recordId, schemaId, payload },
    message,
  });
  return result.success ? (result.envelope ?? { recordId, schemaId, payload }) : null;
}

function classifyMaterialRecord(envelope: RecordEnvelope): MaterialSearchItem | null {
  const payload = asPayload(envelope);
  if (!payload) return null;
  const kind = stringValue(payload.kind) ?? '';
  const title = stringValue(payload.name) ?? stringValue(payload.title) ?? envelope.recordId;
  if (!kind) return null;

  if (kind === 'material-spec') {
    return {
      recordId: envelope.recordId,
      kind,
      title,
      category: 'saved-stock',
      subtitle: 'Saved stock or formulation',
    };
  }
  if (kind === 'vendor-product') {
    const vendor = stringValue(payload.vendor);
    const catalog = stringValue(payload.catalog_number);
    return {
      recordId: envelope.recordId,
      kind,
      title,
      category: 'vendor-reagent',
      subtitle: [vendor, catalog].filter(Boolean).join(' · ') || 'Commercial reagent',
    };
  }
  if (kind === 'material-instance') {
    const biologicalState = isObject(payload.biological_state) ? payload.biological_state : null;
    const derivedState = isObject(payload.derived_state) ? payload.derived_state : null;
    const category: MaterialSearchCategory = biologicalState || derivedState ? 'biological-derived' : 'prepared-material';
    const passage = biologicalState ? numberValue(biologicalState.passage_number) : undefined;
    return {
      recordId: envelope.recordId,
      kind,
      title,
      category,
      subtitle: biologicalState
        ? `Biological material${passage !== undefined ? ` · Passage ${passage}` : ''}`
        : derivedState
          ? `Derived material${stringValue(derivedState.derivation_type) ? ` · ${stringValue(derivedState.derivation_type)}` : ''}`
          : 'Prepared material',
    };
  }
  if (kind === 'aliquot') {
    return {
      recordId: envelope.recordId,
      kind,
      title,
      category: 'prepared-material',
      subtitle: 'Aliquot from a prepared batch',
    };
  }
  if (kind === 'material') {
    return {
      recordId: envelope.recordId,
      kind,
      title,
      category: 'concept-only',
      subtitle: 'Bare concept record',
    };
  }
  return null;
}

function matchesSearch(item: MaterialSearchItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.recordId, item.title, item.subtitle ?? '', item.kind].some((entry) => entry.toLowerCase().includes(q));
}

function buildInstancePayload(recordId: string, body: CreateMaterialInstanceBody, fallbackName: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    kind: 'material-instance',
    id: recordId,
    name: stringValue(body.name) ?? fallbackName,
  };
  const materialRef = refValue(body.materialRef);
  const materialSpecRef = refValue(body.materialSpecRef);
  const vendorProductRef = refValue(body.vendorProductRef);
  const parentMaterialInstanceRef = refValue(body.parentMaterialInstanceRef);
  const derivationRef = refValue(body.derivationRef);
  if (materialRef) payload.material_ref = materialRef;
  if (materialSpecRef) payload.material_spec_ref = materialSpecRef;
  if (vendorProductRef) payload.vendor_product_ref = vendorProductRef;
  if (parentMaterialInstanceRef) payload.parent_material_instance_ref = parentMaterialInstanceRef;
  if (derivationRef) payload.derivation_ref = derivationRef;
  const preparedOn = normalizeDateTime(body.preparedOn);
  if (preparedOn) payload.prepared_on = preparedOn;
  const concentration = quantityValue(body.concentration);
  if (concentration) payload.concentration = concentration;
  const volume = quantityValue(body.volume);
  if (volume) payload.volume = volume;
  if (isObject(body.lot)) payload.lot = body.lot;
  if (isObject(body.storage)) payload.storage = body.storage;
  const status = stringValue(body.status);
  if (status) payload.status = status;
  const tags = dedupeStrings(body.tags);
  if (tags) payload.tags = tags;
  if (isObject(body.biologicalState)) payload.biological_state = body.biologicalState;
  if (isObject(body.derivedState)) payload.derived_state = body.derivedState;
  return payload;
}

async function inferContextMaterial(store: RecordStore, sourceContextIds: string[]): Promise<{ materialRef?: RefShape; totalVolume?: Quantity; contextPayloads: Record<string, unknown>[] }> {
  const contexts = await Promise.all(sourceContextIds.map((id) => store.get(id)));
  const payloads = contexts.map(asPayload).filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const firstContent = payloads.flatMap((payload) => Array.isArray(payload.contents) ? payload.contents : []).find(isObject);
  const materialRef = firstContent ? refValue(firstContent.material_ref) : undefined;
  const totalVolume = quantityValue(firstContent && isObject(firstContent.volume) ? firstContent.volume : payloads[0]?.total_volume);
  return {
    ...(materialRef ? { materialRef } : {}),
    ...(totalVolume ? { totalVolume } : {}),
    contextPayloads: payloads,
  };
}

export function createMaterialLifecycleHandlers(store: RecordStore) {
  async function createDerivationFromBody(
    body: CreateMaterialDerivationBody,
    reply: FastifyReply,
  ): Promise<{ success: true; derivationId: string; materialInstanceId: string } | ApiError> {
    const output = body.output ?? {};
    const outputId = token('MINST');
    const derivationId = token('MDER');
    const outputPayload = buildInstancePayload(outputId, output, stringValue(output.name) ?? outputId);
    const createdOutput = await createRecord(store, outputId, SCHEMA_IDS.materialInstance, outputPayload, `Create derived material instance: ${outputId}`);
    if (!createdOutput) {
      reply.status(400);
      return { error: 'CREATE_FAILED', message: 'Failed to create derived material instance' };
    }
    const derivationPayload: Record<string, unknown> = {
      kind: 'material-derivation',
      id: derivationId,
      name: stringValue(body.name) ?? `${stringValue(output.name) ?? outputId} derivation`,
      derivation_type: stringValue(body.derivationType) ?? 'other',
      inputs: Array.isArray(body.inputs) ? body.inputs.map(refValue).filter((entry): entry is RefShape => Boolean(entry)) : [],
      outputs: [toRef(outputId, 'material-instance', stringValue(outputPayload.name) ?? outputId)],
      ...(refValue(body.protocolRef) ? { protocol_ref: refValue(body.protocolRef) } : {}),
      ...(refValue(body.sourceEventGraphRef) ? { source_event_graph_ref: refValue(body.sourceEventGraphRef) } : {}),
      ...(isObject(body.conditions) ? { conditions: body.conditions } : {}),
      ...(stringValue(body.notes) ? { notes: stringValue(body.notes) } : {}),
    };
    const createdDerivation = await createRecord(store, derivationId, SCHEMA_IDS.materialDerivation, derivationPayload, `Create material derivation: ${derivationId}`);
    if (!createdDerivation) {
      reply.status(400);
      return { error: 'CREATE_FAILED', message: 'Failed to create material derivation' };
    }
    const finalOutputPayload = { ...outputPayload, derivation_ref: toRef(derivationId, 'material-derivation', derivationPayload.name as string) };
    const updateResult = await store.update({
      envelope: { recordId: outputId, schemaId: SCHEMA_IDS.materialInstance, payload: finalOutputPayload },
      message: `Link material instance to derivation: ${outputId}`,
    });
    if (!updateResult.success) {
      reply.status(400);
      return { error: 'UPDATE_FAILED', message: 'Created derivation but failed to link it on the material instance' };
    }
    reply.status(201);
    return { success: true, derivationId, materialInstanceId: outputId };
  }

  return {
    async searchMaterials(
      request: FastifyRequest<{ Querystring: { q?: string; limit?: string } }>,
      _reply: FastifyReply,
    ): Promise<{ items: MaterialSearchItem[] }> {
      const query = stringValue(request.query.q) ?? '';
      const limit = Math.min(Math.max(Number(request.query.limit) || 25, 1), 100);
      const envelopes = (await Promise.all([
        store.list({ schemaId: SCHEMA_IDS.materialSpec, limit: 1000 }),
        store.list({ schemaId: SCHEMA_IDS.vendorProduct, limit: 1000 }),
        store.list({ schemaId: SCHEMA_IDS.materialInstance, limit: 1000 }),
        store.list({ schemaId: SCHEMA_IDS.aliquot, limit: 1000 }),
        store.list({ schemaId: SCHEMA_IDS.material, limit: 1000 }),
      ])).flat();
      const items = envelopes
        .map(classifyMaterialRecord)
        .filter((entry): entry is MaterialSearchItem => Boolean(entry))
        .filter((entry) => matchesSearch(entry, query))
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, limit);
      return { items };
    },

    async createMaterialInstance(
      request: FastifyRequest<{ Body: CreateMaterialInstanceBody }>,
      reply: FastifyReply,
    ): Promise<{ success: true; materialInstanceId: string } | ApiError> {
      const body = request.body ?? {};
      const recordId = token('MINST');
      const fallbackName = refValue(body.materialSpecRef)?.label
        ?? refValue(body.vendorProductRef)?.label
        ?? refValue(body.materialRef)?.label
        ?? recordId;
      const payload = buildInstancePayload(recordId, body, fallbackName);
      const created = await createRecord(store, recordId, SCHEMA_IDS.materialInstance, payload, `Create material instance: ${recordId}`);
      if (!created) {
        reply.status(400);
        return { error: 'CREATE_FAILED', message: 'Failed to create material instance' };
      }
      reply.status(201);
      return { success: true, materialInstanceId: recordId };
    },

    async splitMaterialInstance(
      request: FastifyRequest<{ Params: { id: string }; Body: SplitMaterialInstanceBody }>,
      reply: FastifyReply,
    ): Promise<{ success: true; aliquotIds: string[] } | ApiError> {
      const parent = await store.get(request.params.id);
      const parentPayload = asPayload(parent);
      if (!parentPayload || stringValue(parentPayload.kind) !== 'material-instance') {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Material instance not found: ${request.params.id}` };
      }
      const generatedItems: SplitItem[] = Array.from({ length: Math.max(Number(request.body?.count) || 0, 0) }, (_, index) => ({
        name: `${stringValue(parentPayload.name) ?? request.params.id} aliquot ${index + 1}`,
        ...(request.body?.defaultVolume ? { volume: request.body.defaultVolume } : {}),
      }));
      const items: SplitItem[] = Array.isArray(request.body?.items) && request.body.items.length > 0
        ? request.body.items
        : generatedItems;
      if (items.length === 0) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'Provide aliquot items or a positive count' };
      }
      const parentName = stringValue(parentPayload.name) ?? request.params.id;
      const parentSpecRef = refValue(parentPayload.material_spec_ref);
      const createdIds: string[] = [];
      for (const item of items) {
        const aliquotId = stringValue(item.id) ?? token('ALQ');
        const payload: Record<string, unknown> = {
          kind: 'aliquot',
          id: aliquotId,
          name: stringValue(item.name) ?? `${parentName} aliquot`,
          parent_material_instance_ref: toRef(request.params.id, 'material-instance', parentName),
          ...(parentSpecRef ? { material_spec_ref: parentSpecRef } : {}),
          ...(quantityValue(item.volume) ? { volume: quantityValue(item.volume) } : {}),
          ...(isObject(item.lot) ? { lot: item.lot } : {}),
          ...(isObject(item.storage) ? { storage: item.storage } : {}),
          ...(dedupeStrings(item.tags) ? { tags: dedupeStrings(item.tags) } : {}),
          status: 'available',
        };
        const created = await createRecord(store, aliquotId, SCHEMA_IDS.aliquot, payload, `Create aliquot from material instance: ${aliquotId}`);
        if (!created) {
          reply.status(400);
          return { error: 'CREATE_FAILED', message: `Failed to create aliquot ${aliquotId}` };
        }
        createdIds.push(aliquotId);
      }
      reply.status(201);
      return { success: true, aliquotIds: createdIds };
    },

    async createMaterialDerivation(
      request: FastifyRequest<{ Body: CreateMaterialDerivationBody }>,
      reply: FastifyReply,
    ): Promise<{ success: true; derivationId: string; materialInstanceId: string } | ApiError> {
      return createDerivationFromBody(request.body ?? {}, reply);
    },

    async promoteMaterialFromContext(
      request: FastifyRequest<{ Body: PromoteMaterialFromContextBody }>,
      reply: FastifyReply,
    ): Promise<{ success: true; materialInstanceId: string; derivationId?: string } | ApiError> {
      const body = request.body ?? {};
      const sourceContextIds = Array.isArray(body.sourceContextIds) ? body.sourceContextIds.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
      if (sourceContextIds.length === 0) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'sourceContextIds must contain at least one context ID' };
      }
      const { materialRef: inferredMaterialRef, totalVolume, contextPayloads } = await inferContextMaterial(store, sourceContextIds);
      if (contextPayloads.length !== sourceContextIds.length) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: 'One or more context records were not found' };
      }
      const outputMode = body.outputMode ?? 'prepared-material';
      const outputName = stringValue(body.name) ?? `Promoted material from ${sourceContextIds[0]}`;
      const sourceEventGraphRef = refValue(contextPayloads[0]?.event_graph_ref);
      const bodyMaterialRef = refValue(body.materialRef) ?? inferredMaterialRef;
      const bodyMaterialSpecRef = refValue(body.materialSpecRef);
      const bodyVendorProductRef = refValue(body.vendorProductRef);
      const outputBody: CreateMaterialInstanceBody = {
        name: outputName,
        ...(bodyMaterialRef ? { materialRef: bodyMaterialRef } : {}),
        ...(bodyMaterialSpecRef ? { materialSpecRef: bodyMaterialSpecRef } : {}),
        ...(bodyVendorProductRef ? { vendorProductRef: bodyVendorProductRef } : {}),
        preparedOn: body.preparedOn ?? new Date().toISOString(),
        ...(quantityValue(body.volume) ?? totalVolume ? { volume: quantityValue(body.volume) ?? totalVolume } : {}),
        ...(isObject(body.lot) ? { lot: body.lot } : {}),
        ...(isObject(body.storage) ? { storage: body.storage } : {}),
        ...(outputMode === 'biological-material' && isObject(body.biologicalState) ? { biologicalState: body.biologicalState } : {}),
        ...(outputMode === 'derived-material'
          ? { derivedState: { derivation_type: stringValue(body.derivationType) ?? 'collection', ...(isObject(body.derivedState) ? body.derivedState : {}) } }
          : {}),
      };
      if (outputMode === 'prepared-material') {
        const recordId = token('MINST');
        const payload = buildInstancePayload(recordId, outputBody, outputName);
        const created = await createRecord(store, recordId, SCHEMA_IDS.materialInstance, payload, `Promote context to material instance: ${recordId}`);
        if (!created) {
          reply.status(400);
          return { error: 'CREATE_FAILED', message: 'Failed to create promoted material instance' };
        }
        reply.status(201);
        return { success: true, materialInstanceId: recordId };
      }

      const derivationType = outputMode === 'biological-material' ? 'culture' : (stringValue(body.derivationType) ?? 'collection');
      const note = stringValue(body.notes);
      const derivationBody: CreateMaterialDerivationBody = {
        name: `${outputName} derivation`,
        derivationType,
        inputs: sourceContextIds.map((id) => toRef(id, 'context', id)),
        ...(sourceEventGraphRef ? { sourceEventGraphRef } : {}),
        ...(note ? { notes: note } : {}),
        output: outputBody,
      };
      return createDerivationFromBody(derivationBody, reply);
    },
  };
}

export type MaterialLifecycleHandlers = ReturnType<typeof createMaterialLifecycleHandlers>;

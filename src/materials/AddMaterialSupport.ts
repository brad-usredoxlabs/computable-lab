import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { RecordStore } from '../store/types.js';
import type { MaterialTrackingConfig } from '../config/types.js';

const ALIQUOT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml';

type RefShape = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};

type Quantity = {
  value: number;
  unit: string;
};

type AddMaterialEvent = {
  eventId?: unknown;
  event_type?: unknown;
  details?: unknown;
};

type MaterialUsageOptions = {
  materialTracking?: MaterialTrackingConfig;
};

export class MaterialUsagePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaterialUsagePolicyError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function normalizeRef(value: unknown, fallbackType?: string): RefShape | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return {
      kind: 'record',
      id: value.trim(),
      ...(fallbackType ? { type: fallbackType } : {}),
    };
  }
  const obj = asRecord(value);
  if (!obj) return null;
  if (obj['kind'] !== 'record' && obj['kind'] !== 'ontology') return null;
  if (typeof obj['id'] !== 'string' || obj['id'].trim().length === 0) return null;
  const ref: RefShape = {
    kind: obj['kind'],
    id: obj['id'].trim(),
  };
  if (typeof obj['type'] === 'string' && obj['type'].trim().length > 0) ref.type = obj['type'].trim();
  if (typeof obj['label'] === 'string' && obj['label'].trim().length > 0) ref.label = obj['label'].trim();
  if (typeof obj['namespace'] === 'string' && obj['namespace'].trim().length > 0) ref.namespace = obj['namespace'].trim();
  if (typeof obj['uri'] === 'string' && obj['uri'].trim().length > 0) ref.uri = obj['uri'].trim();
  if (!ref.type && fallbackType && ref.kind === 'record') ref.type = fallbackType;
  return ref;
}

export function resolveAddMaterialRef(details: Record<string, unknown>): RefShape | null {
  const aliquotRef = normalizeRef(details['aliquot_ref'], 'aliquot');
  if (aliquotRef) return aliquotRef;
  const specRef = normalizeRef(details['material_spec_ref'], 'material-spec');
  if (specRef) return specRef;
  return normalizeRef(details['material_ref'] ?? details['materialId'], 'material');
}

export function extractAddMaterialVolume(details: Record<string, unknown>): Quantity | null {
  const volume = asRecord(details['volume']);
  if (volume && typeof volume['value'] === 'number' && Number.isFinite(volume['value']) && volume['value'] >= 0 && typeof volume['unit'] === 'string' && volume['unit'].trim().length > 0) {
    return {
      value: volume['value'],
      unit: volume['unit'].trim(),
    };
  }
  if (typeof details['volume_uL'] === 'number' && Number.isFinite(details['volume_uL']) && details['volume_uL'] >= 0) {
    return {
      value: details['volume_uL'],
      unit: 'uL',
    };
  }
  return null;
}

function extractConcentration(details: Record<string, unknown>): Quantity | null {
  const concentration = asRecord(details['concentration']);
  if (!concentration) return null;
  if (typeof concentration['value'] !== 'number' || !Number.isFinite(concentration['value']) || concentration['value'] <= 0) return null;
  if (typeof concentration['unit'] !== 'string' || concentration['unit'].trim().length === 0) return null;
  return {
    value: concentration['value'],
    unit: concentration['unit'].trim(),
  };
}

function extractInstanceLot(details: Record<string, unknown>): Record<string, string> | null {
  const lot = asRecord(details['instance_lot']);
  if (!lot) return null;
  const normalized: Record<string, string> = {};
  if (typeof lot['vendor'] === 'string' && lot['vendor'].trim().length > 0) normalized.vendor = lot['vendor'].trim();
  if (typeof lot['catalog_number'] === 'string' && lot['catalog_number'].trim().length > 0) normalized.catalog_number = lot['catalog_number'].trim();
  if (typeof lot['lot_number'] === 'string' && lot['lot_number'].trim().length > 0) normalized.lot_number = lot['lot_number'].trim();
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function implicitAliquotId(eventGraphId: string, eventId: string): string {
  const seed = `${eventGraphId}_${eventId}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `ALQ-IMPLICIT-${seed || 'UNKNOWN'}`;
}

function toRecordRef(id: string, type: string, label?: string): RefShape {
  return {
    kind: 'record',
    id,
    type,
    ...(label ? { label } : {}),
  };
}

async function upsertImplicitAliquot(
  store: RecordStore,
  eventGraphId: string,
  eventId: string,
  specRef: RefShape,
  details: Record<string, unknown>,
): Promise<RefShape> {
  const aliquotId = implicitAliquotId(eventGraphId, eventId);
  const concentration = extractConcentration(details);
  const volume = extractAddMaterialVolume(details);
  const lot = extractInstanceLot(details);
  const label = specRef.label || specRef.id;
  const payload: Record<string, unknown> = {
    kind: 'aliquot',
    id: aliquotId,
    name: `Ad hoc instance of ${label}`,
    description: `Implicit add-material instance for ${eventGraphId}:${eventId}`,
    material_spec_ref: toRecordRef(specRef.id, 'material-spec', label),
    tags: ['implicit', 'ad_hoc', 'event_graph_usage'],
  };
  if (concentration) payload.concentration = concentration;
  if (volume) payload.volume = volume;
  if (lot) payload.lot = lot;

  const existing = await store.get(aliquotId);
  if (!existing) {
    const created = await store.create({
      envelope: {
        recordId: aliquotId,
        schemaId: ALIQUOT_SCHEMA_ID,
        payload,
        meta: { kind: 'aliquot' },
      },
      message: `Create implicit aliquot ${aliquotId} for ${eventGraphId}:${eventId}`,
    });
    if (!created.success) {
      throw new Error(created.error || `Failed to create implicit aliquot ${aliquotId}`);
    }
  } else {
    const updated = await store.update({
      envelope: (() => {
        const mergedPayload: Record<string, unknown> = {
          ...(existing.payload as Record<string, unknown>),
          ...payload,
          createdAt: (existing.payload as Record<string, unknown>)['createdAt'],
          createdBy: (existing.payload as Record<string, unknown>)['createdBy'],
          updatedAt: new Date().toISOString(),
        };
        if (!lot) delete mergedPayload.lot;
        return {
          recordId: existing.recordId,
          schemaId: existing.schemaId,
          payload: mergedPayload,
          ...(existing.meta ? { meta: existing.meta } : {}),
        };
      })(),
      message: `Refresh implicit aliquot ${aliquotId} for ${eventGraphId}:${eventId}`,
    });
    if (!updated.success) {
      throw new Error(updated.error || `Failed to update implicit aliquot ${aliquotId}`);
    }
  }

  return toRecordRef(aliquotId, 'aliquot', payload.name as string);
}

export async function normalizeEventGraphMaterialUsage(
  store: RecordStore,
  schemaId: string,
  payload: unknown,
  options: MaterialUsageOptions = {},
): Promise<unknown> {
  if (schemaId !== 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml') return payload;
  const graph = asRecord(payload);
  if (!graph) return payload;
  const eventGraphId = typeof graph['id'] === 'string' && graph['id'].trim().length > 0 ? graph['id'].trim() : null;
  const events = Array.isArray(graph['events']) ? graph['events'] as AddMaterialEvent[] : null;
  if (!eventGraphId || !events) return payload;

  const materialTracking: MaterialTrackingConfig = {
    mode: options.materialTracking?.mode ?? 'relaxed',
    allowAdHocEventInstances: options.materialTracking?.allowAdHocEventInstances ?? true,
  };
  let changed = false;
  const nextEvents = await Promise.all(events.map(async (event, index) => {
    if (event.event_type !== 'add_material') return event;
    const eventId = typeof event.eventId === 'string' && event.eventId.trim().length > 0 ? event.eventId.trim() : `event_${index + 1}`;
    const details = asRecord(event.details);
    if (!details) return event;
    if (normalizeRef(details['aliquot_ref'], 'aliquot')) return event;

    const explicitSpec = normalizeRef(details['material_spec_ref'], 'material-spec');
    const inferredSpec = explicitSpec
      ?? (() => {
        const materialRef = normalizeRef(details['material_ref'], 'material');
        if (materialRef?.kind === 'record' && materialRef.type === 'material-spec') {
          return { ...materialRef, type: 'material-spec' as const };
        }
        return null;
      })();
    if (!inferredSpec || inferredSpec.kind !== 'record') return event;
    const lot = extractInstanceLot(details);
    if (
      materialTracking.mode === 'tracked'
      && materialTracking.allowAdHocEventInstances === false
      && !lot
    ) {
      throw new MaterialUsagePolicyError(
        `Tracked material policy requires provenance when using formulation ${inferredSpec.label || inferredSpec.id} without an explicit instance`
      );
    }

    const aliquotRef = await upsertImplicitAliquot(store, eventGraphId, eventId, inferredSpec, details);
    changed = true;
    return {
      ...event,
      details: {
        ...details,
        material_spec_ref: details['material_spec_ref'] ?? toRecordRef(inferredSpec.id, 'material-spec', inferredSpec.label || inferredSpec.id),
        aliquot_ref: aliquotRef,
      },
    };
  }));

  if (!changed) return payload;
  return {
    ...graph,
    events: nextEvents,
  };
}

export function getEnvelopePayload(envelope: RecordEnvelope | null): Record<string, unknown> | null {
  if (!envelope || !envelope.payload || typeof envelope.payload !== 'object') return null;
  return envelope.payload as Record<string, unknown>;
}

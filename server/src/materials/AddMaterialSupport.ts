import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { RecordStore } from '../store/types.js';
import type { MaterialTrackingConfig } from '../config/types.js';
import { toStoredConcentration } from './concentration.js';
import { extractPrimaryDeclaredConcentration } from './vendorComposition.js';
import {
  ensureLocalMaterialForOntology,
  ensureLocalMaterialForDraft,
  type RefShape as GroundingRefShape,
} from './MaterialGrounding.js';

const ALIQUOT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml';
const MATERIAL_INSTANCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml';
const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';

type RefShape = {
  kind: 'record' | 'ontology' | 'draft';
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

function storeFailureMessage(
  result: { error?: string; validation?: { errors?: Array<{ path?: string; message?: string }> }; lint?: { violations?: Array<{ path?: string; message?: string }> } },
  fallback: string,
): string {
  const validationDetails = result.validation?.errors
    ?.map((error) => [error.path, error.message].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('; ');
  if (validationDetails) return `${fallback}: ${validationDetails}`;
  const lintDetails = result.lint?.violations
    ?.map((violation) => [violation.path, violation.message].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('; ');
  if (lintDetails) return `${fallback}: ${lintDetails}`;
  return result.error ? `${fallback}: ${result.error}` : fallback;
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

/**
 * Like {@link normalizeRef} but also recognises a `draft`/mint ref
 * (`{ kind: 'draft', id: 'mint:<label>' }`) so the grounding pass can mint it
 * into a real local material. `normalizeRef` deliberately drops draft refs (the
 * rest of the compiler only deals with resolved record/ontology refs), so this
 * narrower reader is used solely at the grounding spots.
 */
function normalizeGroundableRef(value: unknown, fallbackType?: string): RefShape | null {
  const base = normalizeRef(value, fallbackType);
  if (base) return base;
  const obj = asRecord(value);
  if (!obj || obj['kind'] !== 'draft') return null;
  if (typeof obj['id'] !== 'string' || obj['id'].trim().length === 0) return null;
  const ref: RefShape = { kind: 'draft', id: obj['id'].trim() };
  if (typeof obj['label'] === 'string' && obj['label'].trim().length > 0) ref.label = obj['label'].trim();
  return ref;
}

export function resolveAddMaterialRef(details: Record<string, unknown>): RefShape | null {
  const aliquotRef = normalizeRef(details['aliquot_ref'], 'aliquot');
  if (aliquotRef) return aliquotRef;
  const materialInstanceRef = normalizeRef(details['material_instance_ref'], 'material-instance');
  if (materialInstanceRef) return materialInstanceRef;
  const specRef = normalizeRef(details['material_spec_ref'], 'material-spec');
  if (specRef) return specRef;
  const vendorProductRef = normalizeRef(details['vendor_product_ref'], 'vendor-product');
  if (vendorProductRef) return vendorProductRef;
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

function extractConcentration(details: Record<string, unknown>): Record<string, unknown> | null {
  return toStoredConcentration(details['concentration']) ?? null;
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

function implicitMaterialInstanceId(eventGraphId: string, eventId: string): string {
  const seed = `${eventGraphId}_${eventId}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `MINST-IMPLICIT-${seed || 'UNKNOWN'}`;
}

function implicitMaterialSpecId(eventGraphId: string, eventId: string): string {
  const seed = `${eventGraphId}_${eventId}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `MSP-DRAFT-${seed || 'UNKNOWN'}`;
}

function refLabel(ref: RefShape | null): string | undefined {
  return ref?.label || ref?.id;
}

function canonicalCompositionSnapshot(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const obj = asRecord(entry);
    if (!obj) return [];
    const componentRef = normalizeRef(obj['component_ref'] ?? obj['componentRef']);
    const role = typeof obj['role'] === 'string' && obj['role'].trim().length > 0 ? obj['role'].trim() : null;
    if (!componentRef || !role) return [];
    return [{
      component_ref: componentRef,
      role,
      ...(toStoredConcentration(obj['concentration']) ? { concentration: toStoredConcentration(obj['concentration']) } : {}),
      ...(asRecord(obj['concentration_range']) ? { concentration_range: obj['concentration_range'] } : {}),
      ...(typeof obj['source'] === 'string' && obj['source'].trim() ? { source: obj['source'].trim() } : {}),
    }];
  });
}

function lifecycleProvenance(sourceLabel: string, eventGraphId: string, eventId: string, note?: string): Record<string, unknown> {
  return {
    status: 'proposed',
    lifecycleId: 'lab-vocabulary-control',
    provenance: {
      source: 'compiler',
      sourceLabel,
      createdBy: 'add-material-normalizer',
      createdAt: new Date().toISOString(),
      note: note ?? `Created as a proposed local formulation record from accepted add-material composition snapshot ${eventGraphId}:${eventId}.`,
    },
  };
}

async function upsertProposedMaterialSpecFromComposition(
  store: RecordStore,
  eventGraphId: string,
  eventId: string,
  details: Record<string, unknown>,
): Promise<RefShape | null> {
  if (normalizeRef(details['material_spec_ref'], 'material-spec')) return null;
  if (normalizeRef(details['aliquot_ref'], 'aliquot')) return null;
  if (normalizeRef(details['material_instance_ref'], 'material-instance')) return null;
  if (normalizeRef(details['vendor_product_ref'], 'vendor-product')) return null;
  const materialRef = normalizeRef(details['material_ref'], 'material');
  if (!materialRef) return null;
  const composition = canonicalCompositionSnapshot(details['composition_snapshot']);
  if (composition.length < 2) return null;

  const specId = implicitMaterialSpecId(eventGraphId, eventId);
  const existing = await store.get(specId);
  const componentLabels = composition
    .map((entry) => refLabel(normalizeRef(entry['component_ref'])))
    .filter((entry): entry is string => Boolean(entry));
  const name = componentLabels.length > 0
    ? componentLabels.join(' + ')
    : `Draft formulation for ${refLabel(materialRef) ?? materialRef.id}`;
  const payload: Record<string, unknown> = {
    kind: 'material-spec',
    id: specId,
    name,
    material_ref: materialRef,
    formulation_kind: typeof details['formulation_kind'] === 'string' ? details['formulation_kind'] : 'complex_composition',
    ...lifecycleProvenance(name, eventGraphId, eventId),
    formulation: {
      composition,
      notes: 'Draft formulation inferred from an add-material event composition snapshot.',
    },
    tags: ['ai-draft', 'composition_snapshot'],
  };
  if (!existing) {
    const created = await store.create({
      envelope: {
        recordId: specId,
        schemaId: MATERIAL_SPEC_SCHEMA_ID,
        payload,
        meta: { kind: 'material-spec' },
      },
      message: `Create proposed material spec ${specId} from ${eventGraphId}:${eventId}`,
    });
    if (!created.success) {
      throw new MaterialUsagePolicyError(storeFailureMessage(created, `Failed to create proposed material spec ${specId}`));
    }
  }
  return toRecordRef(specId, 'material-spec', name);
}

/**
 * A single compound added to a well at a concentration IS a formulation. When
 * an add_material grounds to a bare concept + carries a concentration (and is
 * not already a composition/spec/instance), materialize a proposed `single_active`
 * material-spec (the concept @ that concentration) so the well references a
 * formulation, never a bare concept.
 */
async function upsertProposedMaterialSpecFromSingleActive(
  store: RecordStore,
  eventGraphId: string,
  eventId: string,
  details: Record<string, unknown>,
): Promise<RefShape | null> {
  if (normalizeRef(details['material_spec_ref'], 'material-spec')) return null;
  if (normalizeRef(details['aliquot_ref'], 'aliquot')) return null;
  if (normalizeRef(details['material_instance_ref'], 'material-instance')) return null;
  if (normalizeRef(details['vendor_product_ref'], 'vendor-product')) return null;
  const materialRef = normalizeRef(details['material_ref'], 'material');
  if (!materialRef || materialRef.kind !== 'record') return null;
  // Composition (a mixture) is handled by the composition path; this is the
  // single-active case only.
  if (canonicalCompositionSnapshot(details['composition_snapshot']).length > 0) return null;
  const concentration = extractConcentration(details);
  if (!concentration) return null;

  const specId = implicitMaterialSpecId(eventGraphId, eventId);
  const conc = concentration as { value?: unknown; unit?: unknown };
  const concLabel = typeof conc.value === 'number' && typeof conc.unit === 'string' ? `${conc.value} ${conc.unit} ` : '';
  const name = `${concLabel}${refLabel(materialRef) ?? materialRef.id}`.trim();
  const payload: Record<string, unknown> = {
    kind: 'material-spec',
    id: specId,
    name,
    material_ref: materialRef,
    formulation_kind: 'single_active',
    ...lifecycleProvenance(name, eventGraphId, eventId, `Created as a proposed single-active formulation from accepted add-material ${eventGraphId}:${eventId}.`),
    formulation: {
      concentration,
      composition: [{ component_ref: materialRef, role: 'solute', concentration }],
    },
    tags: ['ai-draft', 'single_active'],
  };
  if (!(await store.get(specId))) {
    const created = await store.create({
      envelope: { recordId: specId, schemaId: MATERIAL_SPEC_SCHEMA_ID, payload, meta: { kind: 'material-spec' } },
      message: `Create proposed single-active material spec ${specId} from ${eventGraphId}:${eventId}`,
    });
    if (!created.success) {
      throw new MaterialUsagePolicyError(storeFailureMessage(created, `Failed to create proposed material spec ${specId}`));
    }
  }
  return toRecordRef(specId, 'material-spec', name);
}

/**
 * Cells added to a well are counted, not concentrated — a count makes the add a
 * material INSTANCE, not a bare concept. When an add_material grounds to a bare
 * concept + carries a `count` (and no concentration/spec/instance), materialize
 * a proposed material-instance (tagged `cells`).
 */
async function upsertProposedCellsInstance(
  store: RecordStore,
  eventGraphId: string,
  eventId: string,
  details: Record<string, unknown>,
): Promise<RefShape | null> {
  if (normalizeRef(details['material_spec_ref'], 'material-spec')) return null;
  if (normalizeRef(details['aliquot_ref'], 'aliquot')) return null;
  if (normalizeRef(details['material_instance_ref'], 'material-instance')) return null;
  if (normalizeRef(details['vendor_product_ref'], 'vendor-product')) return null;
  const materialRef = normalizeRef(details['material_ref'], 'material');
  if (!materialRef || materialRef.kind !== 'record') return null;
  const count = details['count'];
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;

  const instanceId = implicitMaterialInstanceId(eventGraphId, eventId);
  const name = refLabel(materialRef) ?? materialRef.id;
  const payload: Record<string, unknown> = {
    kind: 'material-instance',
    id: instanceId,
    name,
    material_ref: materialRef,
    status: 'available',
    tags: ['ai-draft', 'cells'],
  };
  if (!(await store.get(instanceId))) {
    const created = await store.create({
      envelope: { recordId: instanceId, schemaId: MATERIAL_INSTANCE_SCHEMA_ID, payload, meta: { kind: 'material-instance' } },
      message: `Create proposed cells instance ${instanceId} from ${eventGraphId}:${eventId}`,
    });
    if (!created.success) {
      throw new MaterialUsagePolicyError(storeFailureMessage(created, `Failed to create proposed material instance ${instanceId}`));
    }
  }
  return toRecordRef(instanceId, 'material-instance', name);
}

function toRecordRef(id: string, type: string, label?: string): RefShape {
  return {
    kind: 'record',
    id,
    type,
    ...(label ? { label } : {}),
  };
}

async function ensureLocalMaterialRef(
  store: RecordStore,
  ref: RefShape | null,
  sourceLabel: string,
  domainHint?: string,
): Promise<RefShape | null> {
  if (!ref) return ref;
  const options = {
    source: 'compiler' as const,
    sourceLabel,
    createdBy: 'add-material-normalizer',
    note: 'Created as a proposed local material record from an accepted add-material event graph.',
    ...(domainHint ? { domainHint } : {}),
  };
  if (ref.kind === 'ontology') {
    return ensureLocalMaterialForOntology(store, ref as GroundingRefShape, options) as Promise<RefShape>;
  }
  // A draft/mint ref is a free-text material name with no ontology CURIE — mint
  // it into a real local material record so the accepted graph never persists a
  // bare free-text label. (See ensureLocalMaterialForDraft.)
  if (ref.kind === 'draft') {
    return ensureLocalMaterialForDraft(store, ref as GroundingRefShape, options) as Promise<RefShape>;
  }
  return ref;
}

async function normalizeCompositionMaterialRefs(
  store: RecordStore,
  value: unknown,
): Promise<unknown> {
  if (!Array.isArray(value)) return value;
  return Promise.all(value.map(async (entry) => {
    const obj = asRecord(entry);
    if (!obj) return entry;
    const componentRef = normalizeGroundableRef(obj['component_ref'] ?? obj['componentRef']);
    if (!componentRef) return entry;
    const domainHint = typeof obj['component_ref_domain'] === 'string' ? obj['component_ref_domain'] : undefined;
    const grounded = await ensureLocalMaterialRef(store, componentRef, refLabel(componentRef) ?? componentRef.id, domainHint);
    return {
      ...obj,
      component_ref: grounded,
    };
  }));
}

async function normalizeMaterialSourceRequirementRefs(
  store: RecordStore,
  value: unknown,
): Promise<unknown> {
  const req = asRecord(value);
  if (!req) return value;
  const out: Record<string, unknown> = { ...req };
  const materialRef = normalizeGroundableRef(out.material_ref, 'material');
  if (materialRef && materialRef.kind !== 'record') {
    out.material_ref = await ensureLocalMaterialRef(store, materialRef, refLabel(materialRef) ?? materialRef.id);
  }
  const sourceDetails = asRecord(out.source_details);
  if (sourceDetails) {
    const nextSourceDetails: Record<string, unknown> = { ...sourceDetails };
    const solventRef = normalizeGroundableRef(sourceDetails.solvent_ref, 'material');
    if (solventRef && solventRef.kind !== 'record') {
      nextSourceDetails.solvent_ref = await ensureLocalMaterialRef(store, solventRef, refLabel(solventRef) ?? solventRef.id);
    }
    out.source_details = nextSourceDetails;
  }
  return out;
}

async function normalizeAddMaterialDetailsMaterialRefs(
  store: RecordStore,
  details: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...details };
  const domainHint = typeof out.material_ref_domain === 'string' ? out.material_ref_domain : undefined;
  const materialRef = normalizeGroundableRef(out.material_ref, 'material');
  if (materialRef && materialRef.kind !== 'record') {
    out.material_ref = await ensureLocalMaterialRef(store, materialRef, refLabel(materialRef) ?? materialRef.id, domainHint);
  }
  if (out.materialId !== undefined) {
    const materialIdRef = normalizeGroundableRef(out.materialId, 'material');
    if (materialIdRef && materialIdRef.kind !== 'record') {
      out.materialId = await ensureLocalMaterialRef(store, materialIdRef, refLabel(materialIdRef) ?? materialIdRef.id, domainHint);
    }
  }
  if (out.composition_snapshot !== undefined) {
    out.composition_snapshot = await normalizeCompositionMaterialRefs(store, out.composition_snapshot);
  }
  if (out.material_source_requirement !== undefined) {
    out.material_source_requirement = await normalizeMaterialSourceRequirementRefs(store, out.material_source_requirement);
  }
  return out;
}

function unresolvedSourceRequirement(refField: 'material_spec_ref' | 'vendor_product_ref', ref: RefShape): Record<string, unknown> {
  return {
    status: 'unresolved',
    [refField]: toRecordRef(ref.id, ref.type || (refField === 'material_spec_ref' ? 'material-spec' : 'vendor-product'), ref.label || ref.id),
    reason: 'No explicit material instance, aliquot, or source lot selected during drafting.',
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
  const specEnvelope = await store.get(specRef.id);
  const specPayload = getEnvelopePayload(specEnvelope);
  const formulation = specPayload?.['formulation'] && typeof specPayload['formulation'] === 'object'
    ? specPayload['formulation'] as Record<string, unknown>
    : null;
  const concentration = extractConcentration(details) ?? (formulation ? toStoredConcentration(formulation['concentration']) ?? null : null);
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
      throw new MaterialUsagePolicyError(storeFailureMessage(created, `Failed to create implicit aliquot ${aliquotId}`));
    }
  } else {
    const updated = await store.update({
      envelope: (() => {
        const mergedPayload: Record<string, unknown> = {
          ...(existing.payload as Record<string, unknown>),
          ...payload,
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
      throw new MaterialUsagePolicyError(storeFailureMessage(updated, `Failed to update implicit aliquot ${aliquotId}`));
    }
  }

  return toRecordRef(aliquotId, 'aliquot', payload.name as string);
}

async function upsertImplicitMaterialInstance(
  store: RecordStore,
  eventGraphId: string,
  eventId: string,
  vendorProductRef: RefShape,
  details: Record<string, unknown>,
): Promise<RefShape> {
  const instanceId = implicitMaterialInstanceId(eventGraphId, eventId);
  const concentration = extractConcentration(details);
  const volume = extractAddMaterialVolume(details);
  const lot = extractInstanceLot(details);
  const label = vendorProductRef.label || vendorProductRef.id;
  const vendorProductEnvelope = await store.get(vendorProductRef.id);
  const vendorProductPayload = getEnvelopePayload(vendorProductEnvelope);
  const materialRef = normalizeRef(vendorProductPayload?.['material_ref'], 'material');
  const declaredConcentration = vendorProductPayload
    ? toStoredConcentration(extractPrimaryDeclaredConcentration(vendorProductPayload['declared_composition']))
    : undefined;
  const payload: Record<string, unknown> = {
    kind: 'material-instance',
    id: instanceId,
    name: `Ad hoc instance of ${label}`,
    description: `Implicit add-material instance for ${eventGraphId}:${eventId}`,
    vendor_product_ref: toRecordRef(vendorProductRef.id, 'vendor-product', label),
    tags: ['implicit', 'ad_hoc', 'event_graph_usage'],
    prepared_on: new Date().toISOString(),
    status: 'available',
  };
  if (materialRef?.kind === 'record') {
    payload.material_ref = toRecordRef(materialRef.id, 'material', materialRef.label || materialRef.id);
  }
  if (concentration ?? declaredConcentration) payload.concentration = concentration ?? declaredConcentration;
  if (volume) payload.volume = volume;
  if (lot) payload.lot = lot;

  const existing = await store.get(instanceId);
  if (!existing) {
    const created = await store.create({
      envelope: {
        recordId: instanceId,
        schemaId: MATERIAL_INSTANCE_SCHEMA_ID,
        payload,
        meta: { kind: 'material-instance' },
      },
      message: `Create implicit material instance ${instanceId} for ${eventGraphId}:${eventId}`,
    });
    if (!created.success) {
      throw new MaterialUsagePolicyError(storeFailureMessage(created, `Failed to create implicit material instance ${instanceId}`));
    }
  } else {
    const updated = await store.update({
      envelope: (() => {
        const mergedPayload: Record<string, unknown> = {
          ...(existing.payload as Record<string, unknown>),
          ...payload,
        };
        if (!lot) delete mergedPayload.lot;
        return {
          recordId: existing.recordId,
          schemaId: existing.schemaId,
          payload: mergedPayload,
          ...(existing.meta ? { meta: existing.meta } : {}),
        };
      })(),
      message: `Refresh implicit material instance ${instanceId} for ${eventGraphId}:${eventId}`,
    });
    if (!updated.success) {
      throw new MaterialUsagePolicyError(storeFailureMessage(updated, `Failed to update implicit material instance ${instanceId}`));
    }
  }

  return toRecordRef(instanceId, 'material-instance', payload.name as string);
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

  void options;
  let changed = false;
  const nextEvents = await Promise.all(events.map(async (event, index) => {
    if (event.event_type !== 'add_material') return event;
    const eventId = typeof event.eventId === 'string' && event.eventId.trim().length > 0 ? event.eventId.trim() : `event_${index + 1}`;
    const details = asRecord(event.details);
    if (!details) return event;
    const groundedDetails = await normalizeAddMaterialDetailsMaterialRefs(store, details);
    changed = true;
    // A bare concept in a well is never right. Materialize it: a composition or a
    // concept+concentration → a formulation (material-spec); cells+count → an
    // instance. The well then references a formulation/instance, not a concept.
    const proposedSpecRef =
      (await upsertProposedMaterialSpecFromComposition(store, eventGraphId, eventId, groundedDetails))
      ?? (await upsertProposedMaterialSpecFromSingleActive(store, eventGraphId, eventId, groundedDetails));
    const proposedInstanceRef = proposedSpecRef
      ? null
      : await upsertProposedCellsInstance(store, eventGraphId, eventId, groundedDetails);
    const detailsWithProposedSpec = proposedSpecRef
      ? {
          ...groundedDetails,
          material_spec_ref: proposedSpecRef,
          material_source_requirement: groundedDetails['material_source_requirement'] ?? unresolvedSourceRequirement('material_spec_ref', proposedSpecRef),
        }
      : proposedInstanceRef
        ? { ...groundedDetails, material_instance_ref: proposedInstanceRef }
        : groundedDetails;
    if (proposedSpecRef || proposedInstanceRef) changed = true;
    if (normalizeRef(detailsWithProposedSpec['aliquot_ref'], 'aliquot')) return { ...event, details: detailsWithProposedSpec };
    if (normalizeRef(detailsWithProposedSpec['material_instance_ref'], 'material-instance')) return { ...event, details: detailsWithProposedSpec };

    const explicitSpec = normalizeRef(detailsWithProposedSpec['material_spec_ref'], 'material-spec');
    const inferredSpec = explicitSpec
      ?? (() => {
        const materialRef = normalizeRef(detailsWithProposedSpec['material_ref'], 'material');
        if (materialRef?.kind === 'record' && materialRef.type === 'material-spec') {
          return { ...materialRef, type: 'material-spec' as const };
        }
        return null;
      })();
    if (!inferredSpec || inferredSpec.kind !== 'record') return { ...event, details: detailsWithProposedSpec };
    const lot = extractInstanceLot(detailsWithProposedSpec);
    if (!lot) {
      changed = true;
      return {
        ...event,
        details: {
          ...detailsWithProposedSpec,
          material_spec_ref: detailsWithProposedSpec['material_spec_ref'] ?? toRecordRef(inferredSpec.id, 'material-spec', inferredSpec.label || inferredSpec.id),
          material_source_requirement: detailsWithProposedSpec['material_source_requirement'] ?? unresolvedSourceRequirement('material_spec_ref', inferredSpec),
        },
      };
    }

    const aliquotRef = await upsertImplicitAliquot(store, eventGraphId, eventId, inferredSpec, detailsWithProposedSpec);
    changed = true;
    return {
      ...event,
      details: {
        ...detailsWithProposedSpec,
        material_spec_ref: detailsWithProposedSpec['material_spec_ref'] ?? toRecordRef(inferredSpec.id, 'material-spec', inferredSpec.label || inferredSpec.id),
        aliquot_ref: aliquotRef,
      },
    };
  }));

  const normalizedEvents = await Promise.all(nextEvents.map(async (event, index) => {
    if (event.event_type !== 'add_material') return event;
    const eventId = typeof event.eventId === 'string' && event.eventId.trim().length > 0 ? event.eventId.trim() : `event_${index + 1}`;
    const details = asRecord(event.details);
    if (!details) return event;
    if (normalizeRef(details['aliquot_ref'], 'aliquot')) return event;
    if (normalizeRef(details['material_instance_ref'], 'material-instance')) return event;

    const vendorProductRef = normalizeRef(details['vendor_product_ref'], 'vendor-product');
    if (!vendorProductRef || vendorProductRef.kind !== 'record') return event;
    const lot = extractInstanceLot(details);
    if (!lot) {
      changed = true;
      return {
        ...event,
        details: {
          ...details,
          vendor_product_ref: details['vendor_product_ref'] ?? toRecordRef(vendorProductRef.id, 'vendor-product', vendorProductRef.label || vendorProductRef.id),
          material_source_requirement: details['material_source_requirement'] ?? unresolvedSourceRequirement('vendor_product_ref', vendorProductRef),
        },
      };
    }
    const materialInstanceRef = await upsertImplicitMaterialInstance(store, eventGraphId, eventId, vendorProductRef, details);
    changed = true;
    return {
      ...event,
      details: {
        ...details,
        vendor_product_ref: details['vendor_product_ref'] ?? toRecordRef(vendorProductRef.id, 'vendor-product', vendorProductRef.label || vendorProductRef.id),
        material_instance_ref: materialInstanceRef,
      },
    };
  }));

  if (!changed) return payload;
  return {
    ...graph,
    events: normalizedEvents,
  };
}

export function getEnvelopePayload(envelope: RecordEnvelope | null): Record<string, unknown> | null {
  if (!envelope || !envelope.payload || typeof envelope.payload !== 'object') return null;
  return envelope.payload as Record<string, unknown>;
}

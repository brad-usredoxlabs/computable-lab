import type { RecordEnvelope, RecordStore } from '../store/types.js';

export const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';

export type RefShape = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};

export type MaterialGroundingSource =
  | 'ai_mention'
  | 'compiler'
  | 'human'
  | 'import'
  | 'ui';

export interface EnsureLocalMaterialOptions {
  source?: MaterialGroundingSource;
  sourceLabel?: string;
  createdBy?: string;
  note?: string;
  domainHint?: string;
}

function asPayload(env: RecordEnvelope | null): Record<string, unknown> | null {
  return env?.payload && typeof env.payload === 'object' && !Array.isArray(env.payload)
    ? env.payload as Record<string, unknown>
    : null;
}

function payloadName(payload: Record<string, unknown> | null): string {
  return typeof payload?.name === 'string' ? payload.name.trim() : '';
}

function classCuries(payload: Record<string, unknown> | null): string[] {
  if (!Array.isArray(payload?.class)) return [];
  return payload.class.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const obj = entry as Record<string, unknown>;
    return obj.kind === 'ontology' && typeof obj.id === 'string' && obj.id ? [obj.id] : [];
  });
}

export function inferMaterialDomainFromCurie(curie: string): string {
  const namespace = curie.split(':')[0]?.toUpperCase() ?? '';
  switch (namespace) {
    case 'CHEBI':
      return 'chemical';
    case 'CL':
    case 'CLO':
      return 'cell_line';
    case 'NCBITAXON':
      return 'organism';
    case 'PR':
      return 'reagent';
    case 'XCO':
    case 'MSIO':
      return 'media';
    default:
      return 'other';
  }
}

export function localMaterialIdForCurie(curie: string): string {
  const slug = curie
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
  return `MAT-${slug || 'ONTOLOGY-TERM'}`;
}

export function toRecordMaterialRef(recordId: string, label?: string): RefShape {
  return {
    kind: 'record',
    id: recordId,
    type: 'material',
    ...(label ? { label } : {}),
  };
}

function toOntologyClass(ref: RefShape): RefShape {
  const namespace = ref.namespace || ref.id.split(':')[0] || '';
  return {
    kind: 'ontology',
    id: ref.id,
    namespace,
    label: ref.label || ref.id,
    ...(ref.uri ? { uri: ref.uri } : {}),
  };
}

export async function ensureLocalMaterialForOntology(
  store: RecordStore,
  ontologyRef: RefShape,
  options: EnsureLocalMaterialOptions = {},
): Promise<RefShape> {
  if (ontologyRef.kind !== 'ontology') return ontologyRef;

  const curie = ontologyRef.id.trim();
  const label = (ontologyRef.label || options.sourceLabel || curie).trim();
  const materials = await store.list({ schemaId: MATERIAL_SCHEMA_ID, limit: 10000 });

  const classMatch = materials.find((env) => classCuries(asPayload(env)).includes(curie));
  if (classMatch) {
    return toRecordMaterialRef(classMatch.recordId, payloadName(asPayload(classMatch)) || label);
  }

  const nameNeedle = label.toLowerCase();
  const nameMatch = nameNeedle
    ? materials.find((env) => payloadName(asPayload(env)).toLowerCase() === nameNeedle)
    : undefined;
  if (nameMatch) {
    return toRecordMaterialRef(nameMatch.recordId, payloadName(asPayload(nameMatch)) || label);
  }

  const recordId = localMaterialIdForCurie(curie);
  const existing = await store.get(recordId);
  if (existing) {
    return toRecordMaterialRef(existing.recordId, payloadName(asPayload(existing)) || label);
  }

  const namespace = ontologyRef.namespace || curie.split(':')[0] || '';
  const payload: Record<string, unknown> = {
    kind: 'material',
    id: recordId,
    name: label,
    domain: options.domainHint || inferMaterialDomainFromCurie(curie),
    status: 'proposed',
    lifecycleId: 'lab-vocabulary-control',
    provenance: {
      source: options.source === 'ui' ? 'human' : options.source || 'compiler',
      sourceCurie: curie,
      sourceLabel: label,
      createdBy: options.createdBy || 'material-grounding',
      createdAt: new Date().toISOString(),
      note: options.note || 'Created as a proposed local material record from an ontology-grounded reference.',
    },
    class: [toOntologyClass({ ...ontologyRef, namespace, label })],
  };

  const created = await store.create({
    envelope: {
      recordId,
      schemaId: MATERIAL_SCHEMA_ID,
      payload,
      meta: { kind: 'material' },
    },
    message: `Ground ontology material ${curie} as ${recordId}`,
  });

  if (!created.success) {
    const afterFailure = await store.get(recordId);
    if (afterFailure) return toRecordMaterialRef(afterFailure.recordId, payloadName(asPayload(afterFailure)) || label);
    throw new Error(created.error ? `Failed to create local material ${recordId}: ${created.error}` : `Failed to create local material ${recordId}`);
  }

  return toRecordMaterialRef(recordId, label);
}


import type { RecordEnvelope, RecordStore } from '../store/types.js';

export const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';

export type RefShape = {
  kind: 'record' | 'ontology' | 'draft';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};

/** Domains accepted by material.schema.yaml — anything else clamps to 'other'. */
const MATERIAL_DOMAINS = new Set([
  'cell_line',
  'chemical',
  'media',
  'reagent',
  'organism',
  'sample',
  'other',
]);

function clampMaterialDomain(domain: string | undefined): string | undefined {
  if (!domain) return undefined;
  const normalized = domain.trim().toLowerCase();
  return MATERIAL_DOMAINS.has(normalized) ? normalized : 'other';
}

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

function labelSlug(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'term'
  );
}

/** Stable djb2 hash → 4 base-36 chars; keeps minted ids deterministic so the
 * same free-text label always resolves to the same local record (idempotent
 * re-normalization) while distinct labels that slugify alike stay distinct. */
function labelHash(label: string): string {
  let h = 5381;
  const s = label.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 4).padStart(4, '0');
}

export function localMaterialIdForLabel(label: string): string {
  return `MAT-${labelSlug(label)}-${labelHash(label)}`;
}

/** The human label carried by a draft/mint ref — from `label`, else the
 * `mint:<label>` id's suffix. */
export function draftMaterialLabel(ref: RefShape): string {
  const fromLabel = (ref.label ?? '').trim();
  if (fromLabel) return fromLabel;
  const id = (ref.id ?? '').trim();
  return id.startsWith('mint:') ? id.slice('mint:'.length).trim() : id;
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
    domain: clampMaterialDomain(options.domainHint) || inferMaterialDomainFromCurie(curie),
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

/**
 * Ground a draft/mint material reference — `{ kind: 'draft', id: 'mint:<label>' }`
 * emitted when a material is named in free text with no ontology CURIE — into a
 * real local material record. A minted term must still be a first-class record
 * with a stable local id (the lab's namespace), not a bare free-text label that
 * never enters the vocabulary.
 *
 * Dedup is by case-insensitive name: if a local material with the same name
 * already exists (minted earlier, via this path or /vocab/mint), it is reused
 * rather than duplicated. Otherwise a `MAT-<slug>-<hash>` record is created with
 * `status: 'proposed'`. The id is derived deterministically from the label, so
 * re-normalizing the same graph is idempotent.
 */
export async function ensureLocalMaterialForDraft(
  store: RecordStore,
  draftRef: RefShape,
  options: EnsureLocalMaterialOptions = {},
): Promise<RefShape> {
  if (draftRef.kind !== 'draft') return draftRef;

  const label = draftMaterialLabel(draftRef);
  // Nothing to mint from (empty mint:) — leave the ref untouched so it surfaces
  // as a gap rather than minting a nameless record.
  if (!label) return draftRef;

  const materials = await store.list({ schemaId: MATERIAL_SCHEMA_ID, limit: 10000 });

  const needle = label.toLowerCase();
  const nameMatch = materials.find((env) => payloadName(asPayload(env)).toLowerCase() === needle);
  if (nameMatch) {
    return toRecordMaterialRef(nameMatch.recordId, payloadName(asPayload(nameMatch)) || label);
  }

  const recordId = localMaterialIdForLabel(label);
  const existing = await store.get(recordId);
  if (existing) {
    return toRecordMaterialRef(existing.recordId, payloadName(asPayload(existing)) || label);
  }

  const payload: Record<string, unknown> = {
    kind: 'material',
    id: recordId,
    name: label,
    domain: clampMaterialDomain(options.domainHint) || 'other',
    status: 'proposed',
    lifecycleId: 'lab-vocabulary-control',
    provenance: {
      source: options.source === 'ui' ? 'human' : options.source || 'compiler',
      sourceLabel: label,
      createdBy: options.createdBy || 'material-grounding',
      createdAt: new Date().toISOString(),
      note: options.note || 'Created as a proposed local material record from a free-text (minted) material reference.',
    },
  };

  const created = await store.create({
    envelope: {
      recordId,
      schemaId: MATERIAL_SCHEMA_ID,
      payload,
      meta: { kind: 'material' },
    },
    message: `Mint local material "${label}" as ${recordId}`,
  });

  if (!created.success) {
    const afterFailure = await store.get(recordId);
    if (afterFailure) return toRecordMaterialRef(afterFailure.recordId, payloadName(asPayload(afterFailure)) || label);
    throw new Error(created.error ? `Failed to mint local material ${recordId}: ${created.error}` : `Failed to mint local material ${recordId}`);
  }

  return toRecordMaterialRef(recordId, label);
}


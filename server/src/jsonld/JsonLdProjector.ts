/**
 * JsonLdProjector — Flatten a `RecordEnvelope` into an `IndexableDoc` shape
 * suitable for the JSON-LD index.
 *
 * Compared to `JsonLdGenerator`, which produces a full JSON-LD document with
 * embedded references and a `@context`, this projector emits a flat, narrow
 * shape: id, types, label, full-text, facets, refs. It exists because
 * `/browser` advanced search and the shared slash menu only ever need the
 * narrow shape — and pushing the projection logic into a dedicated module
 * keeps the index store free of any record-walking heuristics.
 *
 * The projection rules:
 * - **label**: `payload.title || payload.name || payload.label || recordId`.
 *   These are the same fields the existing IndexManager surfaces and the
 *   ones every UI spec uses for `display.titleField`.
 * - **fullText**: every string value in the payload tree is concatenated
 *   into a single space-separated blob. References' labels are not chased
 *   (cheap — the indexer doesn't have the target record handy and a join
 *   on demand inside FTS5 would be slow).
 * - **facets**: each `*.ui.yaml`'s `list.columns[].path` becomes a facet
 *   field. We only emit a facet for paths that resolve to a scalar
 *   (string/number/boolean) or an array of scalars; nested objects are not
 *   facet candidates. This matches what users see in `/browser` columns,
 *   which is also what they reach for when filtering.
 * - **refs**: any property whose name matches the Id/Ids/Ref/Refs patterns,
 *   plus any property whose value is a `{recordId, ...}` object, contributes
 *   a ref. Same pattern as JsonLdGenerator.
 */

import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type {
  FacetValue,
  IndexableDoc,
} from '../jsonld-index/types.js';
import type { UISpec } from '../ui/types.js';
import { deriveIdFromEnvelope } from './IdDeriver.js';

const DEFAULT_NAMESPACE = 'https://computable-lab.com/';
const DEFAULT_VOCAB = 'https://computable-lab.com/vocab/';

/** Properties that almost certainly hold record references. */
const REF_PROPERTY_PATTERNS = [/Id$/, /Ids$/, /Ref$/, /Refs$/];

/** Properties to exclude from full-text + facet derivation. */
const EXCLUDED_PROPERTIES = new Set(['$schema', 'schemaId', '@context', '@id', '@type']);

export interface JsonLdProjectorOptions {
  namespace?: string;
  vocab?: string;
  /**
   * UI spec lookup. Used to derive facet paths from `list.columns`. Records
   * whose UI spec is missing simply produce no facets — they remain
   * searchable by full-text and filterable by kind. A getter (rather than a
   * pre-built Map) lets the projector be constructed before UI specs are
   * loaded; the lookup is performed lazily at projection time.
   */
  getUiSpec?: (schemaId: string) => UISpec | undefined;
}

export class JsonLdProjector {
  private readonly namespace: string;
  private readonly vocab: string;
  private readonly getUiSpec: (schemaId: string) => UISpec | undefined;

  constructor(options: JsonLdProjectorOptions = {}) {
    this.namespace = options.namespace ?? DEFAULT_NAMESPACE;
    this.vocab = options.vocab ?? DEFAULT_VOCAB;
    this.getUiSpec = options.getUiSpec ?? (() => undefined);
  }

  project(envelope: RecordEnvelope): IndexableDoc {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;
    const kind = (payload.kind as string) || envelope.meta?.kind || inferKindFromSchemaId(envelope.schemaId) || 'unknown';

    const types = [`${this.vocab}${capitalize(kind)}`];

    const label =
      (payload.title as string) ||
      (payload.name as string) ||
      (payload.label as string) ||
      envelope.recordId;

    const jsonLdId = safeDeriveId(envelope, kind, this.namespace);

    const fullTextParts: string[] = [label, envelope.recordId];
    collectStrings(payload, fullTextParts);

    const facets = this.deriveFacets(envelope.schemaId, payload);

    const refs = this.deriveRefs(payload);

    const updatedAt = envelope.meta?.updatedAt ?? envelope.meta?.createdAt ?? null;

    return {
      recordId: envelope.recordId,
      jsonLdId,
      types,
      kind,
      label,
      fullText: fullTextParts.filter((s) => s.length > 0).join(' '),
      facets,
      refs,
      updatedAt,
    };
  }

  private deriveFacets(
    schemaId: string,
    payload: Record<string, unknown>,
  ): Record<string, FacetValue[]> {
    const spec = this.getUiSpec(schemaId);
    const out: Record<string, FacetValue[]> = {};
    if (!spec || !spec.list || !Array.isArray(spec.list.columns)) return out;
    for (const column of spec.list.columns) {
      if (!column.path) continue;
      const values = readPath(payload, column.path);
      const facetValues: FacetValue[] = [];
      for (const v of values) {
        if (v === null || v === undefined) continue;
        if (typeof v === 'string' && v.length > 0) facetValues.push(v);
        else if (typeof v === 'number' && Number.isFinite(v)) facetValues.push(v);
        else if (typeof v === 'boolean') facetValues.push(v);
        // Skip objects/arrays-of-objects: these are not useful as scalar facets
        // and would otherwise stringify to `[object Object]`.
      }
      if (facetValues.length > 0) out[column.path] = dedupe(facetValues);
    }
    return out;
  }

  private deriveRefs(
    payload: Record<string, unknown>,
  ): Array<{ recordId: string; kind?: string }> {
    const out: Array<{ recordId: string; kind?: string }> = [];
    const seen = new Set<string>();

    const visit = (value: unknown, key?: string): void => {
      if (value === null || value === undefined) return;
      if (typeof value === 'string') {
        if (key && REF_PROPERTY_PATTERNS.some((p) => p.test(key))) {
          push(value);
        }
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) visit(item, key);
        return;
      }
      if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        // Shape: { recordId: ..., kind?: ... } — looks like a ref payload.
        if (typeof obj.recordId === 'string') {
          push(obj.recordId, typeof obj.kind === 'string' ? obj.kind : undefined);
        }
        // computable-lab Ref shape: { kind: 'record'|'ontology', id, type?, ... }
        // (server/src/types/ref.ts RecordRef/OntologyRef). The previous branch
        // only captured `recordId`-keyed refs; `id`-keyed refs under a
        // *Ref/*ref property (or declaring a ref `kind`) are record refs too.
        const refKey = key !== undefined && REF_PROPERTY_PATTERNS.some((p) => p.test(key));
        const refKind = obj.kind === 'record' || obj.kind === 'ontology';
        if (refKey && typeof obj.id === 'string') {
          push(obj.id, typeof obj.kind === 'string' ? obj.kind : undefined);
        } else if (refKind && typeof obj.id === 'string') {
          push(obj.id);
        }
        for (const [k, v] of Object.entries(obj)) {
          if (EXCLUDED_PROPERTIES.has(k)) continue;
          visit(v, k);
        }
      }
    };

    const push = (recordId: string, kind?: string): void => {
      const dedupeKey = `${kind ?? ''}::${recordId}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      const entry: { recordId: string; kind?: string } = { recordId };
      if (kind !== undefined) entry.kind = kind;
      out.push(entry);
    };

    visit(payload);
    return out;
  }
}

// ---- helpers --------------------------------------------------------------

function safeDeriveId(
  envelope: RecordEnvelope,
  kind: string,
  namespace: string,
): string {
  try {
    return deriveIdFromEnvelope(envelope, namespace);
  } catch {
    // Fall back to a synthetic id rather than failing the whole projection.
    const slug = kind.toLowerCase().replace(/\s+/g, '-');
    return `${namespace}${slug}/${envelope.recordId}`;
  }
}

function inferKindFromSchemaId(schemaId: string): string | null {
  // schemaId looks like ".../foo.schema.yaml" — pull the basename without
  // the .schema.yaml suffix as a coarse fallback.
  const match = schemaId.match(/\/([^/]+)\.schema\.yaml$/);
  return match ? match[1]! : null;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function dedupe<T extends FacetValue>(values: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of values) {
    const key = `${typeof v}:${String(v)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function collectStrings(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (value.length > 0 && value.length <= 4000) out.push(value);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (EXCLUDED_PROPERTIES.has(k)) continue;
      collectStrings(v, out);
    }
  }
}

/**
 * Resolve a JSONPath-like path against a payload. We support only the subset
 * `*.ui.yaml` actually uses today: `$.field`, `$.field.nested`, and array
 * traversal via `$.field[]` is implicit (we always flatten arrays). Returns
 * an array of values so multivalued paths are naturally supported.
 */
export function readPath(payload: unknown, path: string): unknown[] {
  if (path === '$' || path === '') return [payload];
  if (path.startsWith('$.')) path = path.slice(2);
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) return [payload];
  let current: unknown[] = [payload];
  for (const seg of segments) {
    const next: unknown[] = [];
    for (const node of current) {
      if (node === null || node === undefined) continue;
      if (Array.isArray(node)) {
        for (const item of node) {
          if (item && typeof item === 'object' && seg in (item as Record<string, unknown>)) {
            next.push((item as Record<string, unknown>)[seg]);
          }
        }
        continue;
      }
      if (typeof node === 'object' && seg in (node as Record<string, unknown>)) {
        const v = (node as Record<string, unknown>)[seg];
        if (Array.isArray(v)) next.push(...v);
        else next.push(v);
      }
    }
    current = next;
  }
  return current;
}

export function createJsonLdProjector(options?: JsonLdProjectorOptions): JsonLdProjector {
  return new JsonLdProjector(options);
}

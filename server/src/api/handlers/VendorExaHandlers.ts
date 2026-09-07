import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { AppConfig } from '../../config/types.js';
import { exaSearch, resolveExaConfig } from '../../integrations/exa.js';
import type { RecordStore } from '../../store/types.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';
import { localMaterialIdForLabel, labelSlug, labelHash } from '../../materials/termId.js';

/**
 * VendorExaHandlers — Exa web search for vendor PRODUCTS across the three
 * catalog-able things a lab / run editor wants: materials (→ vendor-product),
 * labware (→ labware record), and equipment (→ equipment record).
 *
 * Mirrors the working `/equipment/exa-search` + `/equipment/from-exa` pair
 * (EquipmentHandlers.ts) but generalizes it: ONE `/vendor/exa/search` +
 * `/vendor/exa/from` handles all three categories, so the event-editor
 * Add-material / Add-labware flows and the AI chat slash resolvers can all
 * discover vendor products off the web and land them as local records.
 *
 * The from-exa create delegates per category to the record kind each surface
 * already understands, preserving the existing record schemas (no new kind).
 */

const EQUIPMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml';
const LABWARE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml';
const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';
const VENDOR_PRODUCT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml';

export type VendorExaCategory = 'catalog' | 'labware' | 'equipment';

export interface VendorExaHit {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  category: VendorExaCategory;
  source: 'exa';
}

export interface VendorExaSearchResponse {
  configured: boolean;
  query: string;
  items: VendorExaHit[];
}

export interface VendorFromExaResponse {
  success: true;
  recordId: string;
  label: string;
  ref: { kind: 'record'; id: string; type: string; label: string };
  record: unknown;
}

export interface VendorExaHandlers {
  searchExa(
    request: FastifyRequest<{ Body: { q?: string; category?: string; limit?: number } }>,
    reply: FastifyReply,
  ): Promise<VendorExaSearchResponse | ApiError>;

  createFromExa(
    request: FastifyRequest<{ Body: { candidate?: unknown } }>,
    reply: FastifyReply,
  ): Promise<VendorFromExaResponse | ApiError>;
}

export function createVendorExaHandlers(deps: {
  getAppConfig: () => AppConfig | undefined;
  store: RecordStore;
}): VendorExaHandlers {
  const { getAppConfig, store } = deps;

  return {
    async searchExa(request, reply) {
      const body = request.body ?? ({} as { q?: string; category?: string; limit?: number });
      const q = (body.q ?? '').trim();
      if (q.length < 2) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'Body field "q" must be at least 2 characters.',
        };
      }

      const config = resolveExaConfig(getAppConfig());
      if (!config) {
        reply.status(503);
        return {
          error: 'EXA_NOT_CONFIGURED',
          message: 'Exa is not configured. Configure integrations.exa.apiKey before searching vendor products.',
        };
      }

      const category = parseCategory(body.category);
      const limit = Math.min(Math.max(body.limit ?? 8, 1), 20);

      const categoryHint: Record<VendorExaCategory, string> = {
        catalog: 'vendor laboratory product catalog',
        labware: 'laboratory labware product plate tube rack manufacturer catalog',
        equipment: 'laboratory equipment instrument manufacturer model',
      };

      try {
        const response = await exaSearch(config, {
          query: `${q} ${categoryHint[category]}`,
          searchType: 'auto',
          numResults: Math.min(limit * 2, 25),
          contentMode: 'highlights',
          maxCharacters: 1200,
          highlightQuery: q,
        });
        const seen = new Set<string>();
        const items = exaResults(response)
          .map((entry, index) => shapeVendorExaHit(entry, index, category))
          .filter((entry): entry is VendorExaHit => Boolean(entry))
          .filter((entry) => {
            const key = entry.url.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, limit);
        return { configured: true, query: q, items };
      } catch (err) {
        reply.status(502);
        return {
          error: 'EXA_SEARCH_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async createFromExa(request, reply) {
      const candidate = objectValue(request.body?.candidate);
      const title = stringValue(candidate?.title);
      const url = stringValue(candidate?.url);
      if (!title || !url) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'candidate.title and candidate.url are required.',
        };
      }
      const category = parseCategory(stringValue(candidate?.category));
      const description = stringValue(candidate?.description);
      const manufacturer = stringValue(candidate?.manufacturer);
      const model = stringValue(candidate?.model);
      const catalogNumber = stringValue(candidate?.catalogNumber);

      try {
        switch (category) {
          case 'equipment': {
            const out = await createEquipment(store, {
              title,
              url,
              ...(description ? { description } : {}),
              ...(manufacturer ? { manufacturer } : {}),
              ...(model ? { model } : {}),
            });
            reply.status(201);
            return out;
          }
          case 'labware': {
            const out = await createLabware(store, {
              title,
              url,
              ...(description ? { description } : {}),
              ...(manufacturer ? { manufacturer } : {}),
              ...(catalogNumber ? { catalogNumber } : {}),
            });
            reply.status(201);
            return out;
          }
          case 'catalog':
          default: {
            const out = await createMaterialAndVendorProduct(store, {
              title,
              url,
              ...(description ? { description } : {}),
              ...(manufacturer ? { manufacturer } : {}),
              ...(catalogNumber ? { catalogNumber } : {}),
            });
            reply.status(201);
            return out;
          }
        }
      } catch (err) {
        reply.status(400);
        return { error: 'CREATE_FAILED', message: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Per-category record creators
// ---------------------------------------------------------------------------

async function createEquipment(store: RecordStore, hit: {
  title: string;
  url: string;
  description?: string;
  manufacturer?: string;
  model?: string;
}): Promise<VendorFromExaResponse> {
  const recordId = await uniqueId(store, slugTitle(hit.title), 'EQP', 'exa');
  const payload: Record<string, unknown> = {
    kind: 'equipment',
    id: recordId,
    name: hit.title,
    status: 'active',
    ...(hit.manufacturer ? { manufacturer: hit.manufacturer } : {}),
    ...(hit.model ? { model: hit.model } : {}),
    notes: provenanceNotes(hit.url, hit.description),
  };
  const envelope = createEnvelope(payload, EQUIPMENT_SCHEMA_ID);
  if (!envelope) throw new Error('Failed to create equipment envelope.');
  const result = await store.create({ envelope, message: `Create equipment from Exa search: ${recordId}` });
  if (!result.success || !result.envelope) {
    throw new Error(result.error || 'Failed to create equipment record.');
  }
  return {
    success: true,
    recordId,
    label: hit.title,
    ref: { kind: 'record', id: recordId, type: 'equipment', label: hit.title },
    record: result.envelope,
  };
}

async function createLabware(store: RecordStore, hit: {
  title: string;
  url: string;
  description?: string;
  manufacturer?: string;
  catalogNumber?: string;
}): Promise<VendorFromExaResponse> {
  const recordId = await uniqueId(store, slugTitle(hit.title), 'LBW', 'exa');
  const manufacturer = {
    ...(hit.manufacturer ? { name: hit.manufacturer } : {}),
    ...(hit.catalogNumber ? { catalogNumber: hit.catalogNumber } : {}),
    ...(hit.url ? { url: hit.url } : {}),
  };
  const payload: Record<string, unknown> = {
    kind: 'labware',
    recordId,
    name: hit.title,
    labwareType: 'other',
    ...(Object.keys(manufacturer).length > 0 ? { manufacturer } : {}),
    ...(hit.description ? { notes: `${provenanceNotes(hit.url)}\n${hit.description}` } : { notes: provenanceNotes(hit.url) }),
  };
  const envelope = createEnvelope(payload, LABWARE_SCHEMA_ID);
  if (!envelope) throw new Error('Failed to create labware envelope.');
  const result = await store.create({ envelope, message: `Create labware from Exa search: ${recordId}` });
  if (!result.success || !result.envelope) {
    throw new Error(result.error || 'Failed to create labware record.');
  }
  return {
    success: true,
    recordId,
    label: hit.title,
    ref: { kind: 'record', id: recordId, type: 'labware', label: hit.title },
    record: result.envelope,
  };
}

async function createMaterialAndVendorProduct(store: RecordStore, hit: {
  title: string;
  url: string;
  description?: string;
  manufacturer?: string;
  catalogNumber?: string;
}): Promise<VendorFromExaResponse> {
  // 1) canonical material concept the vendor-product links to (idempotent — same
  //    title → same MAT- id, matching the local vocabulary mint behavior).
  const materialId = localMaterialIdForLabel(hit.title);
  const existingMaterial = await store.get(materialId).catch(() => null);
  if (!existingMaterial) {
    const materialPayload: Record<string, unknown> = {
      kind: 'material',
      id: materialId,
      name: hit.title,
      domain: 'chemical',
      status: 'proposed',
      provenance: {
        source: 'import',
        sourceLabel: 'Exa web search',
        note: `Imported from Exa vendor product search: ${hit.url}`,
      },
    };
    const materialEnvelope = createEnvelope(materialPayload, MATERIAL_SCHEMA_ID);
    if (materialEnvelope) {
      const created = await store.create({
        envelope: materialEnvelope,
        message: `Create material concept from Exa search: ${materialId}`,
      });
      if (!created.success) {
        throw new Error(created.error || 'Failed to create material concept.');
      }
    }
  }

  // 2) the vendor-product record (this is what the picker / event editor adds).
  const materialRef = {
    kind: 'record' as const,
    id: materialId,
    type: 'material' as const,
    label: hit.title,
  };
  const vendorProductId = await uniqueVendorProductId(store, hit);
  const payload: Record<string, unknown> = {
    kind: 'vendor-product',
    id: vendorProductId,
    name: hit.title,
    vendor: hit.manufacturer ?? 'Unknown',
    catalog_number: hit.catalogNumber ?? 'N/A',
    material_ref: materialRef,
    ...(hit.url ? { product_url: hit.url } : {}),
    ...(hit.description ? { description: hit.description } : {}),
    composition_provenance: {
      source_type: 'vendor_page',
      vendor: hit.manufacturer ?? 'Unknown',
      ...(hit.url ? { source_url: hit.url } : {}),
      ...(hit.description ? { source_text: hit.description.slice(0, 500) } : {}),
      captured_at: new Date().toISOString(),
    },
  };
  const envelope = createEnvelope(payload, VENDOR_PRODUCT_SCHEMA_ID);
  if (!envelope) throw new Error('Failed to create vendor-product envelope.');
  const result = await store.create({
    envelope,
    message: `Create vendor product from Exa search: ${vendorProductId}`,
  });
  if (!result.success || !result.envelope) {
    throw new Error(result.error || 'Failed to create vendor-product record.');
  }
  return {
    success: true,
    recordId: vendorProductId,
    label: hit.title,
    ref: { kind: 'record', id: vendorProductId, type: 'vendor-product', label: hit.title },
    record: result.envelope,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCategory(raw: string | undefined): VendorExaCategory {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'labware') return 'labware';
  if (value === 'equipment') return 'equipment';
  return 'catalog';
}

function exaResults(response: unknown): Array<Record<string, unknown>> {
  const root = objectValue(response);
  const results = root?.results;
  return Array.isArray(results)
    ? results.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
}

function shapeVendorExaHit(entry: Record<string, unknown>, index: number, category: VendorExaCategory): VendorExaHit | null {
  const url = stringValue(entry.url);
  const title = stringValue(entry.title) ?? url;
  if (!url || !title) return null;
  const snippet = snippetValue(entry);
  const score = numberValue(entry.score);
  return {
    id: stringValue(entry.id) ?? `exa-vendor-${index + 1}`,
    title,
    url,
    category,
    source: 'exa',
    ...(snippet ? { snippet } : {}),
    ...(typeof score === 'number' ? { score } : {}),
  };
}

function snippetValue(entry: Record<string, unknown>): string | undefined {
  const direct = stringValue(entry.summary) ?? stringValue(entry.text);
  if (direct) return direct.slice(0, 500);
  const highlights = entry.highlights;
  if (Array.isArray(highlights)) {
    return highlights.map((item) => stringValue(item)).filter(Boolean).join(' ').slice(0, 500) || undefined;
  }
  return undefined;
}

async function uniqueId(store: RecordStore, slug: string, prefix: 'EQP' | 'LBW', suffix: string): Promise<string> {
  const base = `${prefix}-${slug || 'EXA'}`.slice(0, 48).replace(/[-_]+$/g, '');
  const first = `${base}-${hashOf(suffix)}`;
  if (!(await store.get(first))) return first;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${hashOf(suffix)}-${i}`;
    if (!(await store.get(candidate))) return candidate;
  }
  return `${prefix}-EXA-${hashOf(suffix)}`;
}

async function uniqueVendorProductId(store: RecordStore, hit: {
  url: string;
  title: string;
}): Promise<string> {
  const hash = createHash('sha1').update(`${hit.title}|${hit.url}`).digest('hex').slice(0, 8).toUpperCase();
  const slug = labelSlug(hit.title);
  const base = `VPR-${slug || 'EXA'}`.slice(0, 40).replace(/[-_]+$/g, '');
  const first = `${base}-${hash}`;
  if (!(await store.get(first))) return first;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${hash}-${i}`;
    if (!(await store.get(candidate))) return candidate;
  }
  return `VPR-EXA-${hash}`;
}

/** Stable 4-char suffix for idempotent EQ/LBW ids. */
function hashOf(value: string): string {
  return labelHash(value).toUpperCase();
}

function slugTitle(title: string): string {
  return labelSlug(title);
}

function provenanceNotes(url: string, snippet?: string): string {
  return [
    `Imported from Exa vendor product search: ${url}`,
    snippet ? `Source snippet: ${snippet}` : undefined,
  ].filter(Boolean).join('\n');
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
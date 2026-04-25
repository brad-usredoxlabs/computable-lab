/**
 * EditorSuggestionService — Slot-native suggestion broker for
 * projection-backed procurement editing.
 *
 * Accepts recordId, slotId, query, and limit; resolves the projected
 * slot's declared `suggestionProviders` and returns ranked, typed
 * suggestion items with provenance.
 *
 * Provider failures are isolated — a single provider error does not
 * discard successful results from other providers.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import type { SchemaRegistry } from '../schema/SchemaRegistry.js';
import type { UISpecLoader } from './UISpecLoader.js';
import type { EditorProjectionService } from './EditorProjectionService.js';
import type {
  SuggestionProviderKind,
  ProjectionSlot,
  UISpec,
} from './types.js';
import type { VendorName } from '../api/handlers/VendorSearchHandlers.js';
import type { RequirementLine, ProcurementManifest } from '../procurement/ProcurementManifestService.js';
import { createEditorProjectionService } from './EditorProjectionService.js';

// ============================================================================
// Domain types
// ============================================================================

/**
 * A single suggestion item returned by the broker.
 * Each item carries source provenance and a stored value or structured payload.
 */
export interface SuggestionItem {
  /** Provider that produced this suggestion (e.g. "vendor-search", "compiler"). */
  source: SuggestionProviderKind;
  /** Human-readable label for display. */
  label: string;
  /** Stored value to use when the user selects this suggestion. */
  value?: string;
  /** Structured payload for complex selections. */
  payload?: Record<string, unknown>;
  /** Optional subtitle / secondary description. */
  subtitle?: string;
  /** Optional URL for vendor-product links. */
  url?: string;
  /** Optional record reference. */
  recordId?: string;
  /** Provider-specific metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Response shape for the suggestion endpoint.
 */
export interface SuggestionResponse {
  /** The record ID the suggestions are for. */
  recordId: string;
  /** The slot ID the suggestions are for. */
  slotId: string;
  /** The suggestion items, ranked by relevance. */
  items: SuggestionItem[];
  /** Per-provider status for observability. */
  providerStatus: Array<{
    provider: SuggestionProviderKind;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Request body for the suggestion endpoint.
 */
export interface SuggestionRequest {
  /** Slot ID to resolve suggestions for. */
  slotId: string;
  /** Optional search query to narrow results. */
  query?: string;
  /** Maximum number of suggestions to return (default 20). */
  limit?: number;
}

// ============================================================================
// Provider implementations
// ============================================================================

/**
 * Resolve a slot from the editor projection by slotId.
 */
function resolveSlot(
  uiSpec: UISpec,
  slotId: string
): ProjectionSlot | undefined {
  const editorConfig = uiSpec.editor;
  if (!editorConfig) return undefined;
  return editorConfig.slots.find((slot) => slot.id === slotId);
}

/**
 * local-records provider: returns matching records from the store.
 */
async function resolveLocalRecords(
  store: RecordStore,
  schemaRegistry: SchemaRegistry,
  query: string,
  limit: number
): Promise<SuggestionItem[]> {
  const items: SuggestionItem[] = [];
  const allSchemas = schemaRegistry.getAll();
  const schemaIds = allSchemas.map((s) => s.id);

  // Search across all schemas for records matching the query
  for (const schemaId of schemaIds) {
    try {
      const encodedSchemaId = encodeURIComponent(schemaId);
      const response = await fetch(
        `http://localhost:3000/records?schemaId=${encodedSchemaId}&limit=${limit * 2}`
      );
      if (!response.ok) continue;
      const data = await response.json() as { records: Array<{ recordId: string; payload: Record<string, unknown> }> };
      for (const rec of data.records) {
        const payload = rec.payload;
        const title = (payload.title as string) || (payload.name as string) || (payload.label as string) || rec.recordId;
        if (title.toLowerCase().includes(query.toLowerCase()) || query === '') {
          items.push({
            source: 'local-records',
            label: title,
            value: rec.recordId,
            subtitle: schemaId.split('/').pop() ?? schemaId,
            recordId: rec.recordId,
            metadata: { schemaId },
          });
          if (items.length >= limit) return items;
        }
      }
    } catch {
      // Skip schema search errors — isolation
    }
  }

  return items.slice(0, limit);
}

/**
 * local-vocab provider: returns vocabulary terms from the schema's vocabulary.
 *
 * Uses the normalized suggestion plan derived from the slot's props:
 *   - field.props.sources  → which sources to activate
 *   - field.props.ontologies → which ontologies to restrict to
 *   - field.props.field    → 'keywords' or 'tags' for local search
 *   - options              → explicit option list when present
 *
 * Falls back to the old hard-coded vocabulary when no plan is available.
 */
export function resolveLocalVocab(
  uiSpec: UISpec,
  slotId: string,
  query: string,
  limit: number
): SuggestionItem[] {
  const items: SuggestionItem[] = [];
  const editorConfig = uiSpec.editor;
  if (!editorConfig) return items;

  // Look for options defined on the slot
  const slot = editorConfig.slots.find((s) => s.id === slotId);
  if (!slot) return items;

  // Extract suggestion plan from slot props
  const sources = extractSources(slot.props);
  const ontologies = extractOntologies(slot.props);
  const searchField = extractSearchField(slot.props);

  // If explicit options are defined, use them (select/radio/multiselect path)
  if (slot.options && slot.options.length > 0) {
    for (const opt of slot.options) {
      if (query === '' || opt.label.toLowerCase().includes(query.toLowerCase())) {
        items.push({
          source: 'local-vocab',
          label: opt.label,
          value: String(opt.value),
          subtitle: `Option for "${slot.path}"`,
        });
        if (items.length >= limit) break;
      }
    }
    return items;
  }

  // For combobox/ref widgets: use local tag/keyword search
  // Only activate local search if 'local' is in sources
  if (sources.includes('local')) {
    // Use the slot's path to determine the root field for vocabulary lookup
    const slotPath = slot.path.replace(/^\$\./, '');
    const rootField = slotPath.split('.')[0];

    // Query the tag suggestions API with the extracted search field
    // This replaces the old hard-coded keyword-only lookup
    const commonTerms: Record<string, string[]> = {
      state: ['draft', 'review', 'approved', 'archived', 'cancelled'],
      currency: ['USD', 'EUR', 'GBP', 'JPY', 'CAD'],
      status: ['pending', 'in-progress', 'completed', 'failed', 'skipped'],
      priority: ['low', 'medium', 'high', 'critical'],
    };

    const terms = commonTerms[rootField] ?? [];

    for (const term of terms) {
      if (query === '' || term.toLowerCase().includes(query.toLowerCase())) {
        items.push({
          source: 'local-vocab',
          label: term,
          value: term,
          subtitle: `Vocabulary term for "${rootField}" (${searchField})`,
          metadata: {
            searchField,
            sources,
            ontologies,
          },
        });
        if (items.length >= limit) break;
      }
    }
  }

  // If ontology sources are configured, add ontology-scoped hints
  if (sources.includes('ols') && ontologies.length > 0) {
    for (const ontology of ontologies) {
      if (query === '' || ontology.toLowerCase().includes(query.toLowerCase())) {
        items.push({
          source: 'local-vocab',
          label: `[${ontology}] Ontology scope`,
          value: `ontology-scope:${ontology}`,
          subtitle: `Ontology-restricted search for "${slot.path}"`,
          metadata: {
            ontology,
            searchField,
            sources,
          },
        });
        if (items.length >= limit) break;
      }
    }
  }

  return items;
}

// ============================================================================
// Extractors (mirrored from app/src/shared/forms/suggestionPlan.ts)
// ============================================================================

/**
 * Extract suggestion sources from field props.
 */
export function extractSources(props?: Record<string, unknown>): string[] {
  const raw = props?.sources;
  if (Array.isArray(raw)) {
    return raw.filter((s): s is string =>
      s === 'local' || s === 'ols' || s === 'vendor-search' || s === 'local-records'
    );
  }
  return ['local'];
}

/**
 * Extract ontology namespaces from field props.
 */
export function extractOntologies(props?: Record<string, unknown>): string[] {
  const raw = props?.ontologies;
  if (Array.isArray(raw)) {
    return raw.filter((o): o is string => typeof o === 'string' && o.length > 0);
  }
  return [];
}

/**
 * Extract the search field from field props.
 */
export function extractSearchField(props?: Record<string, unknown>): string {
  const raw = props?.field;
  if (raw === 'keywords' || raw === 'tags') {
    return raw;
  }
  return 'tags';
}

/**
 * ontology provider: returns ontology terms matching the query.
 *
 * Accepts an optional `ontologies` array to restrict search to
 * configured ontology namespaces (from the suggestion plan).
 */
export async function resolveOntology(
  query: string,
  limit: number,
  ontologies?: string[]
): Promise<SuggestionItem[]> {
  const items: SuggestionItem[] = [];

  try {
    // Build query with ontology restriction if configured
    let url = `http://localhost:3000/ontology/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    if (ontologies && ontologies.length > 0) {
      url += `&ontologies=${encodeURIComponent(ontologies.join(','))}`;
    }

    const response = await fetch(url);
    if (!response.ok) return items;
    const data = await response.json() as { results?: Array<{ id: string; label: string; namespace: string }> };
    for (const term of data.results ?? []) {
      // If ontologies are configured, only include terms from matching namespaces
      if (ontologies && ontologies.length > 0 && !ontologies.includes(term.namespace)) {
        continue;
      }
      items.push({
        source: 'ontology',
        label: term.label,
        value: term.id,
        subtitle: term.namespace,
        metadata: { namespace: term.namespace },
      });
      if (items.length >= limit) break;
    }
  } catch {
    // Isolation: don't fail the whole response
  }

  return items;
}

/**
 * vendor-search provider: reuses the expanded six-vendor search path.
 */
export async function resolveVendorSearch(
  query: string,
  limit: number
): Promise<SuggestionItem[]> {
  const items: SuggestionItem[] = [];

  try {
    const response = await fetch(
      `http://localhost:3000/vendors/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (!response.ok) return items;
    const data = await response.json() as {
      items: Array<{
        vendor: VendorName;
        name: string;
        catalogNumber: string;
        productUrl?: string;
        description?: string;
      }>;
    };
    for (const product of data.items) {
      items.push({
        source: 'vendor-search',
        label: product.name,
        value: product.catalogNumber,
        subtitle: `${product.vendor} — ${product.catalogNumber}`,
        url: product.productUrl,
        metadata: {
          vendor: product.vendor,
          catalogNumber: product.catalogNumber,
          description: product.description,
        },
      });
      if (items.length >= limit) break;
    }
  } catch {
    // Isolation: don't fail the whole response
  }

  return items;
}

/**
 * compiler provider: deterministic hints from procurement manifest/budget context.
 */
export function resolveCompiler(
  manifest: ProcurementManifest | null,
  query: string,
  limit: number
): SuggestionItem[] {
  const items: SuggestionItem[] = [];
  if (!manifest) return items;

  // Generate compiler hints from manifest lines
  for (const line of manifest.lines) {
    if (query && !line.description.toLowerCase().includes(query.toLowerCase())) {
      continue;
    }

    // Determine hint type based on coverage status
    if (line.coverageStatus === 'uncovered') {
      items.push({
        source: 'compiler',
        label: `Unresolved: ${line.description}`,
        subtitle: `Category: ${line.category} | Quantity: ${line.quantityHint} ${line.unit}`,
        value: line.requirementId,
        metadata: {
          hintType: 'unresolved',
          category: line.category,
          quantityHint: line.quantityHint,
          unit: line.unit,
          provenance: line.provenance,
        },
      });
    } else if (line.coverageStatus === 'partial') {
      items.push({
        source: 'compiler',
        label: `Partial coverage: ${line.description}`,
        subtitle: `Provenance: ${line.provenance} | ${line.provenanceSummary}`,
        value: line.requirementId,
        metadata: {
          hintType: 'partial',
          category: line.category,
          quantityHint: line.quantityHint,
          unit: line.unit,
          provenance: line.provenance,
        },
      });
    } else {
      items.push({
        source: 'compiler',
        label: `Covered: ${line.description}`,
        subtitle: `Source: ${line.provenanceSummary}`,
        value: line.requirementId,
        metadata: {
          hintType: 'covered',
          category: line.category,
          quantityHint: line.quantityHint,
          unit: line.unit,
          provenance: line.provenance,
        },
      });
    }

    if (items.length >= limit) break;
  }

  return items;
}

// ============================================================================
// Provider registry
// ============================================================================

type ProviderFn = (
  query: string,
  limit: number,
  context: Record<string, unknown>
) => Promise<SuggestionItem[]> | SuggestionItem[];

const PROVIDER_MAP: Record<SuggestionProviderKind, ProviderFn> = {
  'local-records': async (query, limit, ctx) => {
    const store = ctx.store as RecordStore | undefined;
    const schemaRegistry = ctx.schemaRegistry as SchemaRegistry | undefined;
    if (!store || !schemaRegistry) return [];
    return resolveLocalRecords(store, schemaRegistry, query, limit);
  },
  'local-vocab': (query, limit, ctx) => {
    const uiSpec = ctx.uiSpec as UISpec | undefined;
    const slotId = ctx.slotId as string | undefined;
    if (!uiSpec || !slotId) return [];
    return resolveLocalVocab(uiSpec, slotId, query, limit);
  },
  'ontology': async (query, limit, ctx) => {
    const ontologies = ctx.ontologies as string[] | undefined;
    return resolveOntology(query, limit, ontologies);
  },
  'vendor-search': async (query, limit) => {
    return resolveVendorSearch(query, limit);
  },
  'compiler': (query, limit, ctx) => {
    const manifest = ctx.manifest as ProcurementManifest | undefined;
    return resolveCompiler(manifest ?? null, query, limit);
  },
};

// ============================================================================
// Main service
// ============================================================================

/**
 * Resolve suggestions for a slot by invoking its declared providers.
 * Provider failures are isolated — errors are recorded but don't
 * discard results from other providers.
 */
export async function resolveSuggestions(
  recordId: string,
  slotId: string,
  query: string,
  limit: number,
  context: {
    store: RecordStore;
    schemaRegistry: SchemaRegistry;
    uiSpecLoader: UISpecLoader;
    editorProjectionService: EditorProjectionService;
    manifest?: ProcurementManifest;
  }
): Promise<SuggestionResponse> {
  const { store, schemaRegistry, uiSpecLoader, editorProjectionService, manifest } = context;

  // 1. Load the record to get its schema
  const envelope = await store.get(recordId);
  if (!envelope) {
    return {
      recordId,
      slotId,
      items: [],
      providerStatus: [],
    };
  }

  // 2. Load the UI spec
  const uiSpec = uiSpecLoader.get(envelope.schemaId);
  if (!uiSpec) {
    return {
      recordId,
      slotId,
      items: [],
      providerStatus: [],
    };
  }

  // 3. Resolve the slot from the projection
  const slot = resolveSlot(uiSpec, slotId);
  if (!slot) {
    return {
      recordId,
      slotId,
      items: [],
      providerStatus: [],
    };
  }

  // 4. Get the declared suggestion providers
  const providers = slot.suggestionProviders ?? [];
  if (providers.length === 0) {
    return {
      recordId,
      slotId,
      items: [],
      providerStatus: [],
    };
  }

  // 5. Invoke each provider in parallel, isolating failures
  const providerStatus: SuggestionResponse['providerStatus'] = [];
  const allItems: SuggestionItem[] = [];

  // Extract suggestion plan metadata from the slot
  const slotProps = slot.props as Record<string, unknown> | undefined;
  const ontologies = extractOntologies(slotProps);

  const providerContext: Record<string, unknown> = {
    store,
    schemaRegistry,
    uiSpec,
    slotId,
    manifest,
    ontologies,
  };

  const results = await Promise.all(
    providers.map(async (provider) => {
      const fn = PROVIDER_MAP[provider];
      if (!fn) {
        providerStatus.push({
          provider,
          success: false,
          error: `Unknown provider: ${provider}`,
        });
        return [];
      }

      try {
        const items = await fn(query, limit, providerContext);
        providerStatus.push({ provider, success: true });
        return items;
      } catch (err) {
        providerStatus.push({
          provider,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    })
  );

  // 6. Merge all items, deduplicate by (source, value), and apply limit
  const seen = new Set<string>();
  for (const items of results) {
    for (const item of items) {
      const key = `${item.source}::${item.value ?? item.label}`;
      if (!seen.has(key)) {
        seen.add(key);
        allItems.push(item);
      }
    }
  }

  return {
    recordId,
    slotId,
    items: allItems.slice(0, limit),
    providerStatus,
  };
}

// ============================================================================
// Service class
// ============================================================================

/**
 * EditorSuggestionService — Slot-native suggestion broker.
 */
export class EditorSuggestionService {
  private readonly store: RecordStore;
  private readonly schemaRegistry: SchemaRegistry;
  private readonly uiSpecLoader: UISpecLoader;
  private readonly editorProjectionService: EditorProjectionService;
  private readonly manifest?: ProcurementManifest;

  constructor(
    store: RecordStore,
    schemaRegistry: SchemaRegistry,
    uiSpecLoader: UISpecLoader,
    editorProjectionService?: EditorProjectionService,
    manifest?: ProcurementManifest
  ) {
    this.store = store;
    this.schemaRegistry = schemaRegistry;
    this.uiSpecLoader = uiSpecLoader;
    this.editorProjectionService =
      editorProjectionService ?? createEditorProjectionService();
    this.manifest = manifest;
  }

  /**
   * Resolve suggestions for a slot.
   */
  async resolve(
    recordId: string,
    slotId: string,
    query: string = '',
    limit: number = 20
  ): Promise<SuggestionResponse> {
    return resolveSuggestions(recordId, slotId, query, limit, {
      store: this.store,
      schemaRegistry: this.schemaRegistry,
      uiSpecLoader: this.uiSpecLoader,
      editorProjectionService: this.editorProjectionService,
      manifest: this.manifest,
    });
  }
}

/**
 * Create an EditorSuggestionService instance.
 */
export function createEditorSuggestionService(
  store: RecordStore,
  schemaRegistry: SchemaRegistry,
  uiSpecLoader: UISpecLoader,
  editorProjectionService?: EditorProjectionService,
  manifest?: ProcurementManifest
): EditorSuggestionService {
  return new EditorSuggestionService(
    store,
    schemaRegistry,
    uiSpecLoader,
    editorProjectionService,
    manifest
  );
}

// ============================================================================
// Handler
// ============================================================================

export interface EditorSuggestionHandlers {
  getRecordEditorSlotSuggestions(
    request: FastifyRequest<{
      Params: { recordId: string };
      Body: SuggestionRequest;
    }>,
    reply: FastifyReply,
  ): Promise<SuggestionResponse | { error: string; message: string }>;
}

export function createEditorSuggestionHandlers(
  store: RecordStore,
  schemaRegistry: SchemaRegistry,
  uiSpecLoader: UISpecLoader,
  editorProjectionService?: EditorProjectionService,
  manifest?: ProcurementManifest
): EditorSuggestionHandlers {
  const service = createEditorSuggestionService(
    store,
    schemaRegistry,
    uiSpecLoader,
    editorProjectionService,
    manifest
  );

  return {
    async getRecordEditorSlotSuggestions(request, reply) {
      const { recordId } = request.params;
      const { slotId, query = '', limit = 20 } = request.body;

      if (!slotId || slotId.length === 0) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'slotId is required.',
        };
      }

      const resolvedLimit = Math.min(Math.max(limit, 1), 100);

      return service.resolve(recordId, slotId, query, resolvedLimit);
    },
  };
}

export type EditorSuggestionHandlersType = ReturnType<typeof createEditorSuggestionHandlers>;

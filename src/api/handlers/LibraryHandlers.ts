/**
 * LibraryHandlers — HTTP handlers for library-specific operations.
 * 
 * Libraries are specialized records stored one-per-file in a libraries/
 * directory structure. This handler provides:
 * - Fast search across library records
 * - Type-specific listing
 * - "Promote ontology term to local record" functionality
 * 
 * Standard CRUD operations still go through RecordHandlers.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { ApiError } from '../types.js';

/**
 * Library entry for search index.
 */
export interface LibraryEntry {
  id: string;
  type: string;
  label: string;
  schemaId: string;
  keywords?: string[];
  class?: Array<{ id: string; namespace: string; label?: string }>;
}

/**
 * Library search response.
 */
export interface LibrarySearchResponse {
  results: LibraryEntry[];
  total: number;
}

/**
 * Library list response.
 */
export interface LibraryListResponse {
  items: LibraryEntry[];
  total: number;
}

/**
 * Promote request body.
 */
export interface PromoteOntologyTermRequest {
  /** Source ontology reference */
  ontologyRef: {
    id: string;
    namespace: string;
    label: string;
    uri?: string;
  };
  /** New record ID (auto-generated if omitted) */
  id?: string;
  /** Library type (e.g., "material", "assay") */
  type: string;
  /** Additional properties for the new record */
  additionalProperties?: Record<string, unknown>;
}

/**
 * Promote context(s) into reusable artifact(s).
 */
export interface PromoteContextRequest {
  sourceContextIds: string[];
  outputKind: 'material-lot' | 'plate-snapshot';
  outputId?: string;
  title?: string;
  tags?: string[];
  sourceEventGraphRef?: {
    kind: 'record' | 'ontology';
    id: string;
    type?: string;
    namespace?: string;
    label?: string;
    uri?: string;
  };
  // For material-lot output
  materialRef?: {
    kind: 'record' | 'ontology';
    id: string;
    type?: string;
    namespace?: string;
    label?: string;
    uri?: string;
  };
  // For plate-snapshot output
  labwareRef?: {
    kind: 'record' | 'ontology';
    id: string;
    type?: string;
    namespace?: string;
    label?: string;
    uri?: string;
  };
  wellMappings?: Array<{
    well: string;
    contextId: string;
    role?: string;
  }>;
}

/**
 * Library types we support.
 */
export const LIBRARY_TYPES = [
  'material',
  'labware',
  'assay',
  'reagent',
  'buffer',
  'cell_line',
  'collection',
  'context',
  'material_lot',
  'plate_layout_template',
  'library_bundle',
  'plate_snapshot',
] as const;
export type LibraryType = typeof LIBRARY_TYPES[number];

/**
 * Schema IDs for each library type.
 */
const LIBRARY_SCHEMA_IDS: Record<LibraryType, string> = {
  material: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  labware: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
  assay: 'lab/assay',
  reagent: 'lab/reagent',
  buffer: 'lab/buffer',
  cell_line: 'lab/cell-line',
  collection: 'https://computable-lab.com/schema/computable-lab/collection.schema.yaml',
  context: 'https://computable-lab.com/schema/computable-lab/context.schema.yaml',
  material_lot: 'https://computable-lab.com/schema/computable-lab/material-lot.schema.yaml',
  plate_layout_template: 'https://computable-lab.com/schema/computable-lab/plate-layout-template.schema.yaml',
  library_bundle: 'https://computable-lab.com/schema/computable-lab/library-bundle.schema.yaml',
  plate_snapshot: 'https://computable-lab.com/schema/computable-lab/plate-snapshot.schema.yaml',
};

/**
 * In-memory search index for fast queries.
 * Rebuilt on startup and after mutations.
 */
let libraryIndex: Map<LibraryType, LibraryEntry[]> = new Map();

/**
 * Extract searchable entry from a record envelope.
 */
function extractLibraryEntry(envelope: RecordEnvelope, type: LibraryType): LibraryEntry {
  const payload = envelope.payload as Record<string, unknown>;
  
  // Extract label from common fields
  const label = String(
    payload.name || payload.label || payload.title || envelope.recordId
  );
  
  // Extract keywords from various fields
  const keywords: string[] = [];
  if (payload.synonyms && Array.isArray(payload.synonyms)) {
    keywords.push(...payload.synonyms.map(String));
  }
  if (payload.aliases && Array.isArray(payload.aliases)) {
    keywords.push(...payload.aliases.map(String));
  }
  if (payload.tags && Array.isArray(payload.tags)) {
    keywords.push(...payload.tags.map(String));
  }
  
  // Extract class references (ontology annotations)
  let classRefs: LibraryEntry['class'] = undefined;
  if (payload.class && Array.isArray(payload.class)) {
    classRefs = payload.class
      .map((c: unknown) => {
        const ref = c as Record<string, unknown>;
        const entry: { id: string; namespace: string; label?: string } = {
          id: String(ref.id || ''),
          namespace: String(ref.namespace || ''),
        };
        if (ref.label) {
          entry.label = String(ref.label);
        }
        return entry;
      })
      .filter((r) => r.id && r.namespace);
  }
  
  return {
    id: envelope.recordId,
    type,
    label,
    schemaId: envelope.schemaId,
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(classRefs && classRefs.length > 0 ? { class: classRefs } : {}),
  };
}

/**
 * Create library handlers bound to a RecordStore.
 */
export function createLibraryHandlers(store: RecordStore) {
  
  /**
   * Rebuild the library index from the store.
   */
  async function rebuildIndex(): Promise<void> {
    const newIndex = new Map<LibraryType, LibraryEntry[]>();
    
    for (const type of LIBRARY_TYPES) {
      newIndex.set(type, []);
    }
    
    // Scan all records and categorize by schema
    for (const type of LIBRARY_TYPES) {
      const schemaId = LIBRARY_SCHEMA_IDS[type];
      try {
        const records = await store.list({ schemaId, limit: 10000 });
        const entries = records.map((envelope) => extractLibraryEntry(envelope, type));
        newIndex.set(type, entries);
      } catch {
        // Schema may not exist, skip
      }
    }
    
    libraryIndex = newIndex;
  }
  
  /**
   * Get entry count for stats.
   */
  function getIndexStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [type, entries] of libraryIndex) {
      stats[type] = entries.length;
    }
    return stats;
  }
  
  return {
    /**
     * Initialize/rebuild the library index.
     * Should be called on server startup.
     */
    rebuildIndex,
    
    /**
     * GET /library/search
     * Search across all library types.
     */
    async searchLibrary(
      request: FastifyRequest<{
        Querystring: {
          q?: string;
          types?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply
    ): Promise<LibrarySearchResponse | ApiError> {
      try {
        const query = (request.query.q || '').toLowerCase().trim();
        const typeFilter = request.query.types
          ? request.query.types.split(',').filter((t): t is LibraryType => 
              LIBRARY_TYPES.includes(t as LibraryType))
          : null;
        const limit = Math.min(Number(request.query.limit) || 50, 100);
        
        const results: LibraryEntry[] = [];
        
        // Search through index
        for (const [type, entries] of libraryIndex) {
          if (typeFilter && !typeFilter.includes(type)) continue;
          
          for (const entry of entries) {
            // Skip if query is too short and we have lots of results
            if (query.length === 0) {
              results.push(entry);
              continue;
            }
            
            // Match against label, id, keywords
            const matches =
              entry.label.toLowerCase().includes(query) ||
              entry.id.toLowerCase().includes(query) ||
              entry.keywords?.some((k) => k.toLowerCase().includes(query)) ||
              entry.class?.some((c) => 
                c.label?.toLowerCase().includes(query) ||
                c.id.toLowerCase().includes(query)
              );
            
            if (matches) {
              results.push(entry);
            }
            
            // Early exit if we have enough results
            if (results.length >= limit * 2) break;
          }
          
          if (results.length >= limit * 2) break;
        }
        
        // Sort: exact matches first, then by label
        results.sort((a, b) => {
          const aExact = a.label.toLowerCase() === query || a.id.toLowerCase() === query;
          const bExact = b.label.toLowerCase() === query || b.id.toLowerCase() === query;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return a.label.localeCompare(b.label);
        });
        
        return {
          results: results.slice(0, limit),
          total: results.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to search library: ${message}`,
        };
      }
    },
    
    /**
     * GET /library/:type
     * List all records of a specific library type.
     */
    async listLibraryType(
      request: FastifyRequest<{
        Params: { type: string };
        Querystring: { limit?: string; offset?: string };
      }>,
      reply: FastifyReply
    ): Promise<LibraryListResponse | ApiError> {
      try {
        const { type } = request.params;
        
        if (!LIBRARY_TYPES.includes(type as LibraryType)) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: `Invalid library type: ${type}. Valid types: ${LIBRARY_TYPES.join(', ')}`,
          };
        }
        
        const entries = libraryIndex.get(type as LibraryType) || [];
        const offset = Number(request.query.offset) || 0;
        const limit = Math.min(Number(request.query.limit) || 50, 100);
        
        const items = entries
          .sort((a, b) => a.label.localeCompare(b.label))
          .slice(offset, offset + limit);
        
        return {
          items,
          total: entries.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to list library: ${message}`,
        };
      }
    },
    
    /**
     * POST /library/promote
     * Create a local library record from an ontology term.
     * 
     * This "promotes" an ontology term to a local record that can be
     * customized and extended with local metadata.
     */
    async promoteOntologyTerm(
      request: FastifyRequest<{ Body: PromoteOntologyTermRequest }>,
      reply: FastifyReply
    ): Promise<{ success: boolean; record?: LibraryEntry; error?: string } | ApiError> {
      try {
        const { ontologyRef, type, additionalProperties } = request.body;
        
        // Validate type
        if (!LIBRARY_TYPES.includes(type as LibraryType)) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: `Invalid library type: ${type}. Valid types: ${LIBRARY_TYPES.join(', ')}`,
          };
        }
        
        // Validate ontology ref
        if (!ontologyRef?.id || !ontologyRef?.namespace) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'ontologyRef must have id and namespace',
          };
        }
        
        // Generate record ID if not provided
        const recordId = request.body.id || generateLibraryId(type as LibraryType);
        
        // Build the payload
        const payload: Record<string, unknown> = {
          id: recordId,
          name: ontologyRef.label || ontologyRef.id,
          class: [
            {
              kind: 'ontology',
              id: ontologyRef.id,
              namespace: ontologyRef.namespace,
              label: ontologyRef.label,
              ...(ontologyRef.uri ? { uri: ontologyRef.uri } : {}),
            },
          ],
          ...additionalProperties,
        };
        
        // Get schema ID for this type
        const schemaId = LIBRARY_SCHEMA_IDS[type as LibraryType];
        
        // Create the record through the store
        const result = await store.create({
          envelope: {
            recordId,
            schemaId,
            payload,
          },
          message: `Promote ontology term ${ontologyRef.id} to local ${type}`,
        });
        
        if (!result.success) {
          reply.status(400);
          return {
            success: false,
            error: result.error || 'Failed to create library record',
          };
        }
        
        // Update the index
        const entry = extractLibraryEntry(result.envelope!, type as LibraryType);
        const typeEntries = libraryIndex.get(type as LibraryType) || [];
        typeEntries.push(entry);
        libraryIndex.set(type as LibraryType, typeEntries);
        
        reply.status(201);
        return {
          success: true,
          record: entry,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to promote ontology term: ${message}`,
        };
      }
    },

    /**
     * POST /library/promote-context
     * Promote execution context(s) into reusable assets with provenance.
     */
    async promoteContext(
      request: FastifyRequest<{ Body: PromoteContextRequest }>,
      reply: FastifyReply
    ): Promise<{
      success: boolean;
      outputRecordId?: string;
      promotionRecordId?: string;
      outputKind?: string;
      error?: string;
    } | ApiError> {
      try {
        const {
          sourceContextIds,
          outputKind,
          outputId,
          title,
          tags,
          sourceEventGraphRef,
          materialRef,
          labwareRef,
          wellMappings,
        } = request.body;

        if (!Array.isArray(sourceContextIds) || sourceContextIds.length === 0) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'sourceContextIds must contain at least one context ID',
          };
        }

        const contextEnvelopes = await Promise.all(
          sourceContextIds.map((id) => store.get(id))
        );
        const missing = sourceContextIds.filter((_, i) => !contextEnvelopes[i]);
        if (missing.length > 0) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Context records not found: ${missing.join(', ')}`,
          };
        }

        const sourceContextRefs = sourceContextIds.map((id) => ({
          kind: 'record',
          id,
          type: 'context',
          label: id,
        }));

        const resolvedSourceEventGraphRef = sourceEventGraphRef
          ? normalizeRef(sourceEventGraphRef, 'event_graph')
          : inferEventGraphRef(contextEnvelopes[0]!.payload as Record<string, unknown>);

        let outputPayload: Record<string, unknown>;
        let outputSchemaId: string;
        let outputRecordId: string;
        let outputLibraryType: LibraryType;

        if (outputKind === 'material-lot') {
          const material =
            (materialRef ? normalizeRef(materialRef, 'material') : undefined) ||
            inferMaterialRef(contextEnvelopes[0]!.payload as Record<string, unknown>);

          if (!material) {
            reply.status(400);
            return {
              error: 'BAD_REQUEST',
              message: 'materialRef is required for material-lot promotion when context has no inferable material',
            };
          }

          outputRecordId = outputId || generateLibraryId('material_lot');
          outputSchemaId = LIBRARY_SCHEMA_IDS.material_lot;
          outputLibraryType = 'material_lot';

          outputPayload = {
            kind: 'material-lot',
            id: outputRecordId,
            title: title || `Derived lot from ${sourceContextIds[0]}`,
            material_ref: material,
            source_context_ref: sourceContextRefs[0],
            source_event_graph_ref: resolvedSourceEventGraphRef,
            derived_via: 'context-promotion',
            ...(tags && tags.length > 0 ? { tags } : {}),
          };
        } else if (outputKind === 'plate-snapshot') {
          const normalizedLabwareRef = labwareRef ? normalizeRef(labwareRef, 'labware') : undefined;
          if (!normalizedLabwareRef) {
            reply.status(400);
            return {
              error: 'BAD_REQUEST',
              message: 'labwareRef is required for plate-snapshot promotion',
            };
          }
          if (!Array.isArray(wellMappings) || wellMappings.length === 0) {
            reply.status(400);
            return {
              error: 'BAD_REQUEST',
              message: 'wellMappings is required for plate-snapshot promotion',
            };
          }

          outputRecordId = outputId || generateLibraryId('plate_snapshot');
          outputSchemaId = LIBRARY_SCHEMA_IDS.plate_snapshot;
          outputLibraryType = 'plate_snapshot';

          outputPayload = {
            kind: 'plate-snapshot',
            recordId: outputRecordId,
            title: title || `Plate snapshot from ${sourceContextIds[0]}`,
            labware_ref: normalizedLabwareRef,
            source_event_graph_ref: resolvedSourceEventGraphRef,
            wells: wellMappings.map((w) => ({
              well: w.well,
              context_ref: {
                kind: 'record',
                id: w.contextId,
                type: 'context',
                label: w.contextId,
              },
              ...(w.role ? { role: w.role } : {}),
            })),
            ...(tags && tags.length > 0 ? { tags } : {}),
          };
        } else {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: `Unsupported outputKind: ${outputKind}`,
          };
        }

        const outputCreate = await store.create({
          envelope: {
            recordId: outputRecordId,
            schemaId: outputSchemaId,
            payload: outputPayload,
          },
          message: `Promote context to ${outputKind}: ${outputRecordId}`,
        });

        if (!outputCreate.success) {
          reply.status(400);
          return {
            success: false,
            error: outputCreate.error || `Failed to create ${outputKind}`,
          };
        }

        const promotionRecordId = `CPR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const promotionPayload: Record<string, unknown> = {
          kind: 'context-promotion',
          recordId: promotionRecordId,
          title: `Promotion of context to ${outputKind}`,
          source_context_refs: sourceContextRefs,
          output_kind: outputKind,
          output_ref: {
            kind: 'record',
            id: outputRecordId,
            type: outputKind,
            label: outputRecordId,
          },
          ...(resolvedSourceEventGraphRef ? { source_event_graph_ref: resolvedSourceEventGraphRef } : {}),
          method: 'manual-promotion',
          ...(tags && tags.length > 0 ? { tags } : {}),
        };

        const promotionCreate = await store.create({
          envelope: {
            recordId: promotionRecordId,
            schemaId: 'https://computable-lab.com/schema/computable-lab/context-promotion.schema.yaml',
            payload: promotionPayload,
          },
          message: `Record context promotion provenance: ${promotionRecordId}`,
        });

        if (!promotionCreate.success) {
          reply.status(400);
          return {
            success: false,
            error: promotionCreate.error || 'Failed to create context-promotion provenance record',
          };
        }

        const outputEnvelope = outputCreate.envelope;
        if (outputEnvelope) {
          const entry = extractLibraryEntry(outputEnvelope, outputLibraryType);
          const existing = libraryIndex.get(outputLibraryType) || [];
          existing.push(entry);
          libraryIndex.set(outputLibraryType, existing);
        }

        reply.status(201);
        return {
          success: true,
          outputRecordId,
          promotionRecordId,
          outputKind,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to promote context: ${message}`,
        };
      }
    },
    
    /**
     * GET /library/stats
     * Get index statistics.
     */
    async getLibraryStats(
      _request: FastifyRequest,
      _reply: FastifyReply
    ): Promise<{ stats: Record<string, number>; types: readonly string[] }> {
      return {
        stats: getIndexStats(),
        types: LIBRARY_TYPES,
      };
    },
    
    /**
     * POST /library/reindex
     * Force a reindex of all library records.
     */
    async reindexLibrary(
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<{ success: boolean; stats: Record<string, number> } | ApiError> {
      try {
        await rebuildIndex();
        return {
          success: true,
          stats: getIndexStats(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to reindex library: ${message}`,
        };
      }
    },
  };
}

/**
 * Generate a unique library record ID.
 */
function generateLibraryId(type: LibraryType): string {
  const prefixes: Record<LibraryType, string> = {
    material: 'MAT',
    labware: 'LW',
    assay: 'ASY',
    reagent: 'RGT',
    buffer: 'BUF',
    cell_line: 'CL',
    collection: 'COL',
    context: 'CTX',
    material_lot: 'LOT',
    plate_layout_template: 'PLT',
    library_bundle: 'LIB',
    plate_snapshot: 'PSN',
  };
  
  const prefix = prefixes[type];
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  
  return `${prefix}-${timestamp}-${random}`;
}

function normalizeRef(
  ref: {
    kind: 'record' | 'ontology';
    id: string;
    type?: string;
    namespace?: string;
    label?: string;
    uri?: string;
  },
  fallbackType: string
): Record<string, unknown> {
  if (ref.kind === 'ontology') {
    return {
      kind: 'ontology',
      id: ref.id,
      namespace: ref.namespace || 'UNKNOWN',
      ...(ref.label ? { label: ref.label } : {}),
      ...(ref.uri ? { uri: ref.uri } : {}),
    };
  }

  return {
    kind: 'record',
    id: ref.id,
    type: ref.type || fallbackType,
    ...(ref.label ? { label: ref.label } : {}),
  };
}

function inferEventGraphRef(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const eventGraphRef = payload['event_graph_ref'];
  if (eventGraphRef && typeof eventGraphRef === 'object') {
    return eventGraphRef as Record<string, unknown>;
  }
  return undefined;
}

function inferMaterialRef(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const contents = payload['contents'];
  if (!Array.isArray(contents)) {
    return undefined;
  }
  for (const item of contents) {
    if (item && typeof item === 'object') {
      const materialRef = (item as Record<string, unknown>)['material_ref'];
      if (materialRef && typeof materialRef === 'object') {
        return materialRef as Record<string, unknown>;
      }
    }
  }
  return undefined;
}

export type LibraryHandlers = ReturnType<typeof createLibraryHandlers>;

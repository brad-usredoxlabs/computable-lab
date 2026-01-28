/**
 * UIHandlers — API handlers for UI specification endpoints.
 * 
 * These endpoints provide UI specs for rendering records without
 * requiring schema-specific logic in the frontend.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UISpec } from '../../ui/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { UISpecLoader } from '../../ui/UISpecLoader.js';
import type { RecordStore } from '../../store/types.js';
import type { SchemaRegistry } from '../../schema/SchemaRegistry.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Response for UI spec by schema.
 */
export interface UISpecResponse {
  /** The schema ID */
  schemaId: string;
  /** The UI specification */
  spec: UISpec;
}

/**
 * Response for record with UI spec.
 */
export interface RecordWithUIResponse {
  /** The record envelope */
  record: RecordEnvelope;
  /** The UI specification for this record's schema */
  uiSpec: UISpec | null;
  /** The schema definition */
  schema: unknown;
}

/**
 * Error response for UI endpoints.
 */
export interface UIErrorResponse {
  error: string;
  message: string;
}

// ============================================================================
// Handler Class
// ============================================================================

/**
 * UIHandlers — Handlers for UI-related endpoints.
 */
export class UIHandlers {
  private readonly uiSpecLoader: UISpecLoader;
  private readonly store: RecordStore;
  private readonly schemaRegistry: SchemaRegistry;
  
  constructor(
    uiSpecLoader: UISpecLoader,
    store: RecordStore,
    schemaRegistry: SchemaRegistry
  ) {
    this.uiSpecLoader = uiSpecLoader;
    this.store = store;
    this.schemaRegistry = schemaRegistry;
  }
  
  /**
   * GET /ui/schema/:schemaId
   * 
   * Get the UI spec for a schema.
   */
  async getUISpecForSchema(
    request: FastifyRequest<{ Params: { schemaId: string } }>,
    reply: FastifyReply
  ): Promise<UISpecResponse | UIErrorResponse> {
    const { schemaId } = request.params;
    
    // URL decode the schemaId
    const decodedSchemaId = decodeURIComponent(schemaId);
    
    // Check if the schema exists
    const schemaEntry = this.schemaRegistry.getById(decodedSchemaId);
    if (!schemaEntry) {
      reply.status(404);
      return {
        error: 'SCHEMA_NOT_FOUND',
        message: `Schema not found: ${decodedSchemaId}`,
      };
    }
    
    // Look up the UI spec
    const spec = this.uiSpecLoader.get(decodedSchemaId);
    if (!spec) {
      reply.status(404);
      return {
        error: 'UI_SPEC_NOT_FOUND',
        message: `UI spec not found for schema: ${decodedSchemaId}`,
      };
    }
    
    return {
      schemaId: decodedSchemaId,
      spec,
    };
  }
  
  /**
   * GET /ui/record/:recordId
   * 
   * Get a record combined with its UI spec and schema.
   * This is the main endpoint for UI rendering.
   */
  async getRecordWithUI(
    request: FastifyRequest<{ Params: { recordId: string } }>,
    reply: FastifyReply
  ): Promise<RecordWithUIResponse | UIErrorResponse> {
    const { recordId } = request.params;
    
    // Fetch the record
    const envelope = await this.store.get(recordId);
    if (!envelope) {
      reply.status(404);
      return {
        error: 'RECORD_NOT_FOUND',
        message: `Record not found: ${recordId}`,
      };
    }
    
    // Get the schema
    const schemaEntry = this.schemaRegistry.getById(envelope.schemaId);
    const schema = schemaEntry?.schema ?? null;
    
    // Get the UI spec (may be null if not found)
    const uiSpec = this.uiSpecLoader.get(envelope.schemaId) ?? null;
    
    return {
      record: envelope,
      uiSpec,
      schema,
    };
  }
  
  /**
   * GET /ui/specs
   * 
   * List all available UI specs.
   */
  async listUISpecs(
    _request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<{ specs: UISpecSummary[] }> {
    const summaries: UISpecSummary[] = [];
    
    // Get all schemas and check for corresponding UI specs
    const schemas = this.schemaRegistry.getAll();
    
    for (const entry of schemas) {
      const spec = this.uiSpecLoader.get(entry.id);
      if (spec) {
        summaries.push({
          schemaId: entry.id,
          hasFormSpec: !!spec.form,
          hasListSpec: !!spec.list,
          hasDetailSpec: !!spec.detail,
        });
      }
    }
    
    return { specs: summaries };
  }
}

/**
 * Summary of a UI spec for listing.
 */
export interface UISpecSummary {
  schemaId: string;
  hasFormSpec: boolean;
  hasListSpec: boolean;
  hasDetailSpec: boolean;
}

/**
 * Create UIHandlers instance.
 */
export function createUIHandlers(
  uiSpecLoader: UISpecLoader,
  store: RecordStore,
  schemaRegistry: SchemaRegistry
): UIHandlers {
  return new UIHandlers(uiSpecLoader, store, schemaRegistry);
}

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
import type { EditorProjectionService } from '../../ui/EditorProjectionService.js';
import type { ProcurementManifest } from '../../procurement/ProcurementManifestService.js';
import { createEditorProjectionService } from '../../ui/EditorProjectionService.js';
import type { SuggestionResponse, SuggestionRequest } from '../../ui/EditorSuggestionService.js';
import { createEditorSuggestionHandlers } from '../../ui/EditorSuggestionService.js';

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

/**
 * Response for the editor projection endpoint.
 */
export interface EditorProjectionResponse {
  /** The schema ID of the record */
  schemaId: string;
  /** The record ID */
  recordId: string;
  /** Display title derived from the record */
  title: string;
  /** Document blocks */
  blocks: Array<{
    id: string;
    kind: string;
    label?: string;
    help?: string;
    collapsible?: boolean;
    collapsed?: boolean;
    path?: string;
    columns?: Array<{ path: string; label: string; width?: string | number; widget?: string }>;
    visible?: { when: string; operator: string; value?: unknown };
    slotIds?: string[];
  }>;
  /** Document slots */
  slots: Array<{
    id: string;
    path: string;
    label: string;
    widget: string;
    help?: string;
    required?: boolean;
    readOnly?: boolean;
    /** Authoritative display-only value override (wins over payload). */
    value?: unknown;
    suggestionProviders?: string[];
    visible?: { when: string; operator: string; value?: unknown };
  }>;
  /** Non-fatal diagnostics */
  diagnostics: Array<{
    code: string;
    message: string;
    severity: string;
    path?: string;
  }>;
  /**
   * Display-only field overrides keyed by payload path (e.g. `license`,
   * `createdBy`). Merged over the record payload by the editor at render time;
   * never persisted. Used for read-through inheritance and resolved names.
   */
  displayValues?: Record<string, unknown>;
}

/**
 * Bake display-only value overrides onto a projection's slots so every editor
 * surface renders them (the document mapper prefers slot.value over the stored
 * payload). Keys are payload field names (e.g. `license`); slots are matched by
 * their `$.<key>` path. Also mirrored onto `displayValues` for any consumer
 * that reads the map directly. Mutates and returns the projection.
 */
function applyDisplayValuesToSlots(
  projection: EditorProjectionResponse,
  displayValues: Record<string, unknown>
): EditorProjectionResponse {
  const keys = Object.keys(displayValues);
  if (keys.length === 0) return projection;
  for (const key of keys) {
    const slot = projection.slots.find((s) => s.path === `$.${key}`);
    if (slot) slot.value = displayValues[key];
  }
  projection.displayValues = { ...(projection.displayValues ?? {}), ...displayValues };
  return projection;
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
  private readonly editorProjectionService: EditorProjectionService;
  private readonly manifest?: ProcurementManifest;
  
  constructor(
    uiSpecLoader: UISpecLoader,
    store: RecordStore,
    schemaRegistry: SchemaRegistry,
    editorProjectionService?: EditorProjectionService,
    manifest?: ProcurementManifest
  ) {
    this.uiSpecLoader = uiSpecLoader;
    this.store = store;
    this.schemaRegistry = schemaRegistry;
    this.editorProjectionService = editorProjectionService ?? createEditorProjectionService();
    this.manifest = manifest;
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
  
  /**
   * GET /ui/record/:recordId/editor
   * 
   * Get an editor projection for a record.
   * Resolves the record payload + UI spec into a typed projection
   * with blocks, slots, and diagnostics for TapTab consumption.
   */
  async getRecordEditorProjection(
    request: FastifyRequest<{ Params: { recordId: string } }>,
    reply: FastifyReply
  ): Promise<EditorProjectionResponse | UIErrorResponse> {
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
    
    // Get the UI spec
    const uiSpec = this.uiSpecLoader.get(envelope.schemaId);
    if (!uiSpec) {
      reply.status(404);
      return {
        error: 'UI_SPEC_NOT_FOUND',
        message: `UI spec not found for schema: ${envelope.schemaId}`,
      };
    }
    
    // Project the record from its stored payload.
    const projection = this.editorProjectionService.project(
      uiSpec,
      envelope.payload as Record<string, unknown>,
      envelope.schemaId,
      envelope.recordId
    );

    // Attach display-only field overrides (read-through license, resolved
    // creator name). These are baked onto the matching slots as authoritative
    // display values so every editor surface renders them — the projection
    // carries field *structure*, and the document mapper prefers slot.value
    // over the stored payload. Never persisted.
    const displayValues = await this.computeDisplayValues(envelope);
    applyDisplayValuesToSlots(projection, displayValues);

    return projection;
  }

  /**
   * Compute display-only field overrides for the editor, keyed by payload path:
   *
   *  - **License read-through**: experiments and runs inherit the project's
   *    license from their parent study, so the read-only field stays in sync
   *    even if the study's license changes after the child was created.
   *  - **Created By name**: the creator id lives in envelope `meta.createdBy`
   *    (never the payload, per the RecordEnvelope contract). Resolve it to the
   *    user's display name so the read-only "Created By" field shows a name.
   *
   * Returns only the overridden keys; the stored record is untouched.
   */
  private async computeDisplayValues(
    envelope: RecordEnvelope
  ): Promise<Record<string, unknown>> {
    const payload = (envelope.payload as Record<string, unknown>) ?? {};
    const overrides: Record<string, unknown> = {};

    // License read-through from the parent study (experiments + runs).
    const kind = payload.kind;
    if (kind === 'experiment' || kind === 'run') {
      const studyId = await this.resolveParentStudyId(payload);
      if (studyId) {
        const study = await this.store.get(studyId);
        const studyLicense = (study?.payload as Record<string, unknown> | undefined)?.license;
        if (typeof studyLicense === 'string' && studyLicense) {
          overrides.license = studyLicense;
        }
      }
    }

    // Resolve the creator id (from envelope meta, falling back to any legacy
    // payload value) to a display name.
    const creatorId =
      envelope.meta?.createdBy ??
      (typeof payload.createdBy === 'string' ? (payload.createdBy as string) : undefined);
    if (creatorId) {
      overrides.createdBy = await this.resolveUserDisplayName(creatorId);
    }

    return overrides;
  }

  /** Resolve the studyId for an experiment/run payload (run → experiment → study). */
  private async resolveParentStudyId(
    payload: Record<string, unknown>
  ): Promise<string | undefined> {
    if (typeof payload.studyId === 'string' && payload.studyId) {
      return payload.studyId;
    }
    if (typeof payload.experimentId === 'string' && payload.experimentId) {
      const experiment = await this.store.get(payload.experimentId);
      const sid = (experiment?.payload as Record<string, unknown> | undefined)?.studyId;
      if (typeof sid === 'string' && sid) return sid;
    }
    return undefined;
  }

  /** Resolve a user id (USR-*) to its display name; non-user ids pass through. */
  private async resolveUserDisplayName(userId: string): Promise<string> {
    try {
      const user = await this.store.get(userId);
      const up = user?.payload as Record<string, unknown> | undefined;
      const name = up?.displayName ?? up?.username;
      if (typeof name === 'string' && name) return name;
    } catch {
      // Non-fatal: fall back to the raw id.
    }
    return userId;
  }
  
  /**
   * POST /ui/schema/:schemaId/editor-draft
   *
   * Get a draft editor projection for a new record.
   * Resolves the schema + UI spec into a typed projection
   * with blocks, slots, and diagnostics for TapTab consumption.
   * Uses an empty payload as the draft base.
   */
  async getEditorDraftProjection(
    request: FastifyRequest<{ Params: { schemaId: string } }>,
    reply: FastifyReply
  ): Promise<EditorProjectionResponse | UIErrorResponse> {
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

    // Get the UI spec
    const uiSpec = this.uiSpecLoader.get(decodedSchemaId);
    if (!uiSpec) {
      reply.status(404);
      return {
        error: 'UI_SPEC_NOT_FOUND',
        message: `UI spec not found for schema: ${decodedSchemaId}`,
      };
    }

    // Project an empty payload as the draft
    const projection = this.editorProjectionService.project(
      uiSpec,
      {},
      decodedSchemaId,
      '__draft__'
    );

    // Pre-fill Created By with the current user's display name so a new record
    // shows who will own it before the first save (display-only; the real
    // createdBy is written server-side at creation from the request identity).
    const userId = request.headers['x-user-id'];
    if (typeof userId === 'string' && userId) {
      const name = await this.resolveUserDisplayName(userId);
      applyDisplayValuesToSlots(projection, { createdBy: name });
    }

    return projection;
  }

  /**
   * POST /ui/record/:recordId/editor/suggestions
   *
   * Get typed suggestions for an editor slot.
   * Resolves the slot's declared suggestionProviders and returns
   * ranked suggestion items with provenance.
   */
  async getRecordEditorSlotSuggestions(
    request: FastifyRequest<{
      Params: { recordId: string };
      Body: SuggestionRequest;
    }>,
    reply: FastifyReply
  ): Promise<SuggestionResponse | { error: string; message: string }> {
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
    
    const suggestionHandlers = createEditorSuggestionHandlers(
      this.store,
      this.schemaRegistry,
      this.uiSpecLoader,
      this.editorProjectionService,
      this.manifest
    );
    
    return suggestionHandlers.getRecordEditorSlotSuggestions(
      request as FastifyRequest<{
        Params: { recordId: string };
        Body: SuggestionRequest;
      }>,
      reply
    );
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

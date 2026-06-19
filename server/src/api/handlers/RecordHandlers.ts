/**
 * RecordHandlers — HTTP handlers for record CRUD operations.
 * 
 * These handlers are thin wrappers around RecordStore.
 * Lightweight normalization hooks are permitted where the product needs
 * ergonomic record authoring without exposing backend logistics.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import type { IndexManager } from '../../index/IndexManager.js';
import { createEnvelope, extractRecordId } from '../../types/RecordEnvelope.js';
import type {
  CreateRecordRequest,
  UpdateRecordRequest,
  ListRecordsQuery,
  RecordResponse,
  RecordMutationResponse,
  ListRecordsResponse,
  ApiError,
} from '../types.js';
import type { ResolvedIdentity } from '../../identity/GitHubIdentity.js';
import type { MaterialTrackingConfig } from '../../config/types.js';
import { MaterialUsagePolicyError, normalizeEventGraphMaterialUsage } from '../../materials/AddMaterialSupport.js';
import { LifecycleEngine } from '../../lifecycle/LifecycleEngine.js';
import { checkLifecycleTransition } from '../../lifecycle/lifecycleMiddleware.js';
import type { LocalIdentityService, ResolvedRequestUser } from '../../security/LocalIdentityService.js';
import type { AuthorizationService } from '../../security/AuthorizationService.js';
import type { AccessAction } from '../../security/AccessControlService.js';

interface RecordHandlerSecurityOptions {
  identityService?: LocalIdentityService;
  authorizationService?: AuthorizationService;
}

function payloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
}

function payloadKind(payload: unknown): string | undefined {
  const kind = payloadObject(payload).kind;
  return typeof kind === 'string' ? kind : undefined;
}

function parentRecordIds(payload: unknown): string[] {
  const p = payloadObject(payload);
  const links = p.links && typeof p.links === 'object' ? p.links as Record<string, unknown> : {};
  const candidates = [
    p.runId,
    links.runId,
    p.plannedRunId,
    links.plannedRunId,
    p.experimentId,
    links.experimentId,
    p.studyId,
    links.studyId,
  ];
  return [...new Set(candidates.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

function accessDeniedError(message: string): ApiError {
  return { error: 'FORBIDDEN', message };
}

function unauthenticatedError(message: string): ApiError {
  return { error: 'UNAUTHENTICATED', message };
}

/**
 * Create record handlers bound to a RecordStore and optional IndexManager.
 */
export function createRecordHandlers(
  store: RecordStore,
  indexManager?: IndexManager,
  identity?: ResolvedIdentity,
  getMaterialTracking?: () => MaterialTrackingConfig | undefined,
  lifecycleEngine?: LifecycleEngine,
  /**
   * Called after a successful event-graph record update with the linked run
   * id (manual edits, drag/drop, etc.) so the AI prompt warmer can refresh
   * its compiled context. Best-effort; debouncing happens in the warmer.
   */
  onEventGraphMutated?: (runId: string) => void,
  security?: RecordHandlerSecurityOptions,
) {
  const resolveRequestUser = async (request: FastifyRequest, reply: FastifyReply): Promise<ResolvedRequestUser | null> => {
    if (!security?.identityService) return { userId: null, isSystem: true };
    const user = await security.identityService.resolveRequestUser(request);
    if (!user.userId) {
      reply.status(401);
      return null;
    }
    return user;
  };

  const canAccess = async (user: ResolvedRequestUser, action: AccessAction, record: Awaited<ReturnType<RecordStore['get']>>): Promise<boolean> => {
    if (!record || !security?.authorizationService) return true;
    return security.authorizationService.canAccess(user.userId, action, record);
  };

  return {
    /**
     * GET /records
     * List records with optional filtering.
     */
    async listRecords(
      request: FastifyRequest<{ Querystring: ListRecordsQuery }>,
      reply: FastifyReply
    ): Promise<ListRecordsResponse | ApiError> {
      try {
        const { kind, schemaId, idPrefix, limit, offset, studyId, experimentId, runId } = request.query;
        
        const user = await resolveRequestUser(request, reply);
        if (!user) return unauthenticatedError('A valid local user is required');

        const records = await store.list({
          ...(kind !== undefined ? { kind } : {}),
          ...(schemaId !== undefined ? { schemaId } : {}),
          ...(idPrefix !== undefined ? { idPrefix } : {}),
          ...(limit !== undefined && !studyId && !experimentId && !runId ? { limit: Number(limit) } : {}),
          ...(offset !== undefined && !studyId && !experimentId && !runId ? { offset: Number(offset) } : {}),
        });

        const linkMatches = (record: RecordEnvelope): boolean => {
          const payload = payloadObject(record.payload);
          const links = payload.links && typeof payload.links === 'object' ? payload.links as Record<string, unknown> : {};
          const recordStudyId = typeof links.studyId === 'string' ? links.studyId : typeof payload.studyId === 'string' ? payload.studyId : undefined;
          const recordExperimentId = typeof links.experimentId === 'string' ? links.experimentId : typeof payload.experimentId === 'string' ? payload.experimentId : undefined;
          const recordRunId = typeof links.runId === 'string' ? links.runId : typeof payload.runId === 'string' ? payload.runId : undefined;
          return (!studyId || recordStudyId === studyId)
            && (!experimentId || recordExperimentId === experimentId)
            && (!runId || recordRunId === runId);
        };

        const scopedRecords = (studyId || experimentId || runId)
          ? records.filter(linkMatches)
          : records;
        const pagedRecords = (studyId || experimentId || runId)
          ? scopedRecords.slice(Number(offset ?? 0), Number(offset ?? 0) + Number(limit ?? scopedRecords.length))
          : scopedRecords;

        const visibleRecords = [];
        for (const record of pagedRecords) {
          if (await canAccess(user, 'read', record)) visibleRecords.push(record);
        }
        
        return {
          records: visibleRecords,
          total: visibleRecords.length, // Note: This is the returned count, not total available
          ...(limit !== undefined ? { limit: Number(limit) } : {}),
          ...(offset !== undefined ? { offset: Number(offset) } : {}),
        };
      } catch (err) {
        if (err instanceof MaterialUsagePolicyError) {
          reply.status(422);
          return {
            error: 'INVALID_MATERIAL_USAGE',
            message: err.message,
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to list records: ${message}`,
        };
      }
    },
    
    /**
     * GET /records/:id
     * Get a single record by ID.
     */
    async getRecord(
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { validate?: string; lint?: string };
      }>,
      reply: FastifyReply
    ): Promise<RecordResponse | ApiError> {
      try {
        const { id } = request.params;
        const validate = request.query.validate === 'true';
        const lint = request.query.lint === 'true';
        
        if (validate || lint) {
          const result = await store.getWithValidation({
            recordId: id,
            validate,
            lint,
          });
          
          if (!result.success || !result.envelope) {
            reply.status(404);
            return {
              error: 'NOT_FOUND',
              message: result.error || `Record not found: ${id}`,
            };
          }

          const user = await resolveRequestUser(request, reply);
          if (!user) return unauthenticatedError('A valid local user is required');
          if (!(await canAccess(user, 'read', result.envelope))) {
            reply.status(404);
            return { error: 'NOT_FOUND', message: `Record not found: ${id}` };
          }
          
          return {
            record: result.envelope,
            ...(result.validation !== undefined ? { validation: result.validation } : {}),
            ...(result.lint !== undefined ? { lint: result.lint } : {}),
          };
        }
        
        const record = await store.get(id);
        
        if (!record) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Record not found: ${id}`,
          };
        }

        const user = await resolveRequestUser(request, reply);
        if (!user) return unauthenticatedError('A valid local user is required');
        if (!(await canAccess(user, 'read', record))) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: `Record not found: ${id}` };
        }
        
        return { record };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to get record: ${message}`,
        };
      }
    },
    
    /**
     * POST /records
     * Create a new record.
     */
    async createRecord(
      request: FastifyRequest<{ Body: CreateRecordRequest }>,
      reply: FastifyReply
    ): Promise<RecordMutationResponse | ApiError> {
      try {
        const { schemaId, message } = request.body;
        
        // Validate request
        if (!schemaId) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'schemaId is required',
          };
        }
        
        if (!request.body.payload) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'payload is required',
          };
        }

        const user = await resolveRequestUser(request, reply);
        if (!user) return unauthenticatedError('A valid local user is required');

        const currentMaterialTracking = getMaterialTracking?.();
        const payload = await normalizeEventGraphMaterialUsage(
          store,
          schemaId,
          request.body.payload,
          currentMaterialTracking ? { materialTracking: currentMaterialTracking } : {},
        );
        
        // Extract recordId from payload
        const recordId = extractRecordId(payload);
        if (!recordId) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'payload must contain recordId or id field',
          };
        }

        const kind = payloadKind(payload);
        if (kind === 'access-policy') {
          const resourceRef = payloadObject(payload).resourceRef;
          const resourceId = resourceRef && typeof resourceRef === 'object'
            ? (resourceRef as Record<string, unknown>).id
            : undefined;
          if (typeof resourceId === 'string') {
            const resource = await store.get(resourceId);
            if (resource && !(await canAccess(user, 'admin', resource))) {
              reply.status(403);
              return accessDeniedError(`User ${user.userId} cannot administer ${resourceId}`);
            }
          }
        } else {
          for (const parentId of parentRecordIds(payload)) {
            const parent = await store.get(parentId);
            if (parent && !(await canAccess(user, 'write', parent))) {
              reply.status(403);
              return accessDeniedError(`User ${user.userId} cannot add child records under ${parentId}`);
            }
          }
        }
        
        // Inject payload provenance fields that are schema-compatible.
        // Keep actor provenance (createdBy) in envelope meta only — per the
        // RecordEnvelope contract it must NOT be smuggled into the payload. The
        // editor resolves a display name from meta.createdBy at projection time.
        const now = new Date().toISOString();
        const creator = user.userId ?? identity?.username ?? 'system';
        // createdBy is a tool-generated FAIRCommon provenance field (like
        // createdAt) and is the durable home for the creator: the file store
        // derives envelope meta from repo state and does not persist
        // meta.createdBy, so the payload is where the creator id must live. The
        // editor resolves it to a display name read-only at projection time.
        //
        // NOTE: material-instance and aliquot schemas use unevaluatedProperties:false
        // at root level and do NOT include FAIRCommon via allOf. Ajv rejects
        // createdAt/createdBy/updatedAt for these types, so we skip injecting them
        // into the payload and rely on envelope meta instead.
        const payloadObj = payload as Record<string, unknown>;
        const isInventoryRecord = payloadObj.kind === 'material-instance' || payloadObj.kind === 'aliquot';
        const payloadWithProvenance = isInventoryRecord
          ? payloadObj
          : {
              ...payloadObj,
              createdAt: now,
              updatedAt: now,
              createdBy: creator,
            };

        // Inherit FAIR fields from parent record
        const typedPayload = payloadWithProvenance as Record<string, unknown>;
        const parentId = (typedPayload.experimentId as string | undefined)
          ?? (typedPayload.studyId as string | undefined);

        if (parentId) {
          try {
            const parent = await store.get(parentId);
            if (parent) {
              const pp = parent.payload as Record<string, unknown>;
              if (!typedPayload.license && pp.license)
                typedPayload.license = pp.license;
              if (!(typedPayload.keywords as string[] | undefined)?.length && (pp.keywords as string[] | undefined)?.length)
                typedPayload.keywords = [...(pp.keywords as string[])];
              if (!(typedPayload.tags as string[] | undefined)?.length && (pp.tags as string[] | undefined)?.length)
                typedPayload.tags = [...(pp.tags as string[])];
            }
          } catch {
            // Non-fatal: proceed without inheritance
          }
        }

        // Create envelope
        const envelope = createEnvelope(
          payloadWithProvenance,
          schemaId,
          {
            createdAt: now,
            updatedAt: now,
            createdBy: creator,
          }
        );
        if (!envelope) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'Failed to create envelope from payload',
          };
        }
        
        // Create record
        const result = await store.create({
          envelope,
          ...(message !== undefined ? { message } : {}),
        });
        
        if (!result.success) {
          // Check for validation/lint failures
          if (result.validation && !result.validation.valid) {
            reply.status(422);
            return {
              success: false,
              validation: result.validation,
              error: 'Validation failed',
            };
          }
          
          if (result.lint && !result.lint.valid) {
            reply.status(422);
            return {
              success: false,
              lint: result.lint,
              error: 'Lint failed',
            };
          }
          
          // Check for duplicate
          if (result.error?.includes('already exists')) {
            reply.status(409);
            return {
              success: false,
              error: result.error,
            };
          }
          
          reply.status(400);
          return {
            success: false,
            error: result.error || 'Failed to create record',
          };
        }
        
        reply.status(201);
        
        // Back-fill the run's method pointer: an event graph saved from a
        // run-bound canvas carries links.runId, and the run becomes
        // openable from the project tree only once methodEventGraphId is
        // set. Best-effort — a failure here never fails the graph create.
        const createdPayload = (result.envelope?.payload ?? {}) as Record<string, unknown>;
        const createdLinks = (createdPayload.links ?? {}) as Record<string, unknown>;
        const linkedRunId = typeof createdLinks.runId === 'string' ? createdLinks.runId : undefined;
        if (linkedRunId && schemaId.includes('event-graph')) {
          try {
            const runEnvelope = await store.get(linkedRunId);
            const runPayload = (runEnvelope?.payload ?? {}) as Record<string, unknown>;
            if (runEnvelope && !runPayload.methodEventGraphId) {
              await store.update({
                envelope: {
                  ...runEnvelope,
                  payload: {
                    ...runPayload,
                    methodEventGraphId: extractRecordId(createdPayload),
                  },
                },
                message: `Attach method ${extractRecordId(createdPayload)} to ${linkedRunId}`,
              });
            }
          } catch (attachErr) {
            console.warn(`Failed to attach event graph to run ${linkedRunId}:`, attachErr);
          }
        }

        if (result.envelope && user.userId) {
          await security?.authorizationService?.ensureOwnerPolicy(result.envelope, user.userId);
        }

        // Update index after successful create
        if (indexManager && result.envelope) {
          try {
            // Path is available in result.envelope.meta?.path if needed
            await indexManager.rebuild(); // For now, rebuild to ensure consistency
          } catch (indexErr) {
            console.error('Failed to update index after create:', indexErr);
          }
        }
        
        // Build response with conditional properties (exactOptionalPropertyTypes)
        const response: RecordMutationResponse = {
          success: true,
          ...(result.envelope !== undefined ? { record: result.envelope } : {}),
          ...(result.validation !== undefined ? { validation: result.validation } : {}),
          ...(result.lint !== undefined ? { lint: result.lint } : {}),
          ...(result.commit !== undefined ? { commit: result.commit } : {}),
        };
        return response;
      } catch (err) {
        if (err instanceof MaterialUsagePolicyError) {
          reply.status(422);
          return {
            error: 'INVALID_MATERIAL_USAGE',
            message: err.message,
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error('CREATE RECORD ERROR:', message);
        console.error('Stack:', stack);
        console.error('Request body:', JSON.stringify(request.body, null, 2));
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to create record: ${message}`,
        };
      }
    },
    
    /**
     * PUT /records/:id
     * Update an existing record.
     */
    async updateRecord(
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateRecordRequest;
      }>,
      reply: FastifyReply
    ): Promise<RecordMutationResponse | ApiError> {
      try {
        const { id } = request.params;
        const { expectedSha, message } = request.body;
        
        // Validate request
        if (!request.body.payload) {
          reply.status(400);
          return {
            error: 'BAD_REQUEST',
            message: 'payload is required',
          };
        }
        
        // Get existing record to get schemaId
        const existing = await store.get(id);
        if (!existing) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Record not found: ${id}`,
          };
        }

        const user = await resolveRequestUser(request, reply);
        if (!user) return unauthenticatedError('A valid local user is required');
        const requiredAction: AccessAction = payloadKind(existing.payload) === 'access-policy' ? 'admin' : 'write';
        if (!(await canAccess(user, requiredAction, existing))) {
          reply.status(403);
          return accessDeniedError(`User ${user.userId} cannot update ${id}`);
        }
        
        // Check lifecycle transition if lifecycleEngine is available
        if (lifecycleEngine) {
          const actorId = (request.headers['x-actor-id'] as string) || 'anonymous'
          const previousPayload = existing.payload as Record<string, unknown>
          const nextPayload = request.body.payload as Record<string, unknown>
          const lifecycleResult = checkLifecycleTransition(lifecycleEngine, {
            previousPayload,
            nextPayload,
            actorId,
          })
          
          if (!lifecycleResult.allowed) {
            reply.status(422)
            return {
              error: 'LIFECYCLE_TRANSITION_DENIED',
              message: lifecycleResult.error || 'Lifecycle transition not allowed',
            }
          }
        }
        
        // Inject updatedAt in payload (schema-compatible provenance field).
        const currentMaterialTracking = getMaterialTracking?.();
        const normalizedPayload = await normalizeEventGraphMaterialUsage(
          store,
          existing.schemaId,
          request.body.payload,
          currentMaterialTracking ? { materialTracking: currentMaterialTracking } : {},
        );
        // NOTE: material-instance and aliquot schemas use unevaluatedProperties:false
        // at root level and do NOT include FAIRCommon via allOf. Ajv rejects
        // createdAt/createdBy/updatedAt for these types, so we skip injecting them
        // into the payload and rely on envelope meta instead.
        const payloadObj = normalizedPayload as Record<string, unknown>;
        const isInventoryRecord = payloadObj.kind === 'material-instance' || payloadObj.kind === 'aliquot';
        const payloadWithProvenance = isInventoryRecord
          ? payloadObj
          : {
              ...payloadObj,
              updatedAt: new Date().toISOString(),
            };
        // createdBy is immutable after creation. The editor surfaces it as a
        // read-only field populated with a resolved display name, which the
        // client serializes back on save — never trust it. Restore the original
        // creator id from the stored record (preserving legacy absence).
        if (!isInventoryRecord) {
          const existingCreatedBy = (existing.payload as Record<string, unknown>).createdBy;
          if (typeof existingCreatedBy === 'string') {
            (payloadWithProvenance as Record<string, unknown>).createdBy = existingCreatedBy;
          } else {
            delete (payloadWithProvenance as Record<string, unknown>).createdBy;
          }
        }

        // Create updated envelope (handle meta per exactOptionalPropertyTypes)
        const envelope = {
          recordId: id,
          schemaId: existing.schemaId,
          payload: payloadWithProvenance,
          ...(existing.meta !== undefined ? { meta: existing.meta } : {}),
        };
        
        // Update record
        const result = await store.update({
          envelope,
          ...(expectedSha !== undefined ? { expectedSha } : {}),
          ...(message !== undefined ? { message } : {}),
        });
        
        if (!result.success) {
          // Check for validation/lint failures
          if (result.validation && !result.validation.valid) {
            reply.status(422);
            return {
              success: false,
              validation: result.validation,
              error: 'Validation failed',
            };
          }
          
          if (result.lint && !result.lint.valid) {
            reply.status(422);
            return {
              success: false,
              lint: result.lint,
              error: 'Lint failed',
            };
          }
          
          // Check for SHA mismatch
          if (result.error?.includes('SHA mismatch')) {
            reply.status(409);
            return {
              success: false,
              error: result.error,
            };
          }
          
          reply.status(400);
          return {
            success: false,
            error: result.error || 'Failed to update record',
          };
        }
        
        // Update index after successful update
        if (indexManager && result.envelope) {
          try {
            await indexManager.rebuild(); // For now, rebuild to ensure consistency
          } catch (indexErr) {
            console.error('Failed to update index after update:', indexErr);
          }
        }

        // Graph mutated outside the Accept path (manual edits, drag/drop):
        // let the AI prompt warmer refresh its compiled context.
        if (onEventGraphMutated && existing.schemaId.includes('event-graph')) {
          const links = ((payloadWithProvenance as Record<string, unknown>).links ?? {}) as Record<string, unknown>;
          const linkedRunId = typeof links.runId === 'string' ? links.runId : undefined;
          if (linkedRunId) {
            try {
              onEventGraphMutated(linkedRunId);
            } catch {
              // Warming is best-effort; never fail the update for it.
            }
          }
        }
        
        // Build response with conditional properties (exactOptionalPropertyTypes)
        const response: RecordMutationResponse = {
          success: true,
          ...(result.envelope !== undefined ? { record: result.envelope } : {}),
          ...(result.validation !== undefined ? { validation: result.validation } : {}),
          ...(result.lint !== undefined ? { lint: result.lint } : {}),
          ...(result.commit !== undefined ? { commit: result.commit } : {}),
        };
        return response;
      } catch (err) {
        if (err instanceof MaterialUsagePolicyError) {
          reply.status(422);
          return {
            error: 'INVALID_MATERIAL_USAGE',
            message: err.message,
          };
        }
        const errMessage = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to update record: ${errMessage}`,
        };
      }
    },
    
    /**
     * POST /claims/check-duplicates
     * Check if any of the given SPO triples already exist as claims.
     */
    async checkClaimDuplicates(
      request: FastifyRequest<{
        Body: { triples: Array<{ subjectId: string; predicateId: string; objectId: string }> };
      }>,
      reply: FastifyReply
    ): Promise<{ duplicates: Record<string, string> } | ApiError> {
      try {
        const { triples } = request.body;
        if (!Array.isArray(triples)) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'triples must be an array' };
        }

        const user = await resolveRequestUser(request, reply);
        if (!user) return unauthenticatedError('A valid local user is required');

        const existing = await store.list({ kind: 'claim' });
        // Build lookup: "subjectId|predicateId|objectId" → record ID
        const existingKeys = new Map<string, string>();
        for (const env of existing) {
          if (!(await canAccess(user, 'read', env))) continue;
          const p = env.payload as Record<string, unknown> | undefined;
          if (!p) continue;
          const subj = p.subject as Record<string, unknown> | undefined;
          const pred = p.predicate as Record<string, unknown> | undefined;
          const obj = p.object as Record<string, unknown> | undefined;
          if (subj?.id && pred?.id && obj?.id) {
            const key = `${String(subj.id)}|${String(pred.id)}|${String(obj.id)}`;
            existingKeys.set(key, String(p.id ?? env.recordId));
          }
        }

        const duplicates: Record<string, string> = {};
        for (const t of triples) {
          const key = `${t.subjectId}|${t.predicateId}|${t.objectId}`;
          const match = existingKeys.get(key);
          if (match) {
            duplicates[key] = match;
          }
        }

        return { duplicates };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: `Failed to check duplicates: ${message}` };
      }
    },

    /**
     * DELETE /records/:id
     * Delete a record.
     */
    async deleteRecord(
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { expectedSha?: string };
      }>,
      reply: FastifyReply
    ): Promise<RecordMutationResponse | ApiError> {
      try {
        const { id } = request.params;
        const { expectedSha } = request.query;
        
        // Check if record exists
        const existing = await store.get(id);
        if (!existing) {
          reply.status(404);
          return {
            error: 'NOT_FOUND',
            message: `Record not found: ${id}`,
          };
        }

        const user = await resolveRequestUser(request, reply);
        if (!user) return unauthenticatedError('A valid local user is required');
        const requiredAction: AccessAction = payloadKind(existing.payload) === 'access-policy' ? 'admin' : 'write';
        if (!(await canAccess(user, requiredAction, existing))) {
          reply.status(403);
          return accessDeniedError(`User ${user.userId} cannot delete ${id}`);
        }
        
        // Delete record
        const result = await store.delete({
          recordId: id,
          ...(expectedSha !== undefined ? { expectedSha } : {}),
        });
        
        if (!result.success) {
          // Check for SHA mismatch
          if (result.error?.includes('SHA mismatch')) {
            reply.status(409);
            return {
              success: false,
              error: result.error,
            };
          }
          
          reply.status(400);
          return {
            success: false,
            error: result.error || 'Failed to delete record',
          };
        }
        
        // Update index after successful delete
        if (indexManager) {
          try {
            await indexManager.rebuild(); // For now, rebuild to ensure consistency
          } catch (indexErr) {
            console.error('Failed to update index after delete:', indexErr);
          }
        }
        
        return {
          success: true,
          ...(result.commit !== undefined ? { commit: result.commit } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: `Failed to delete record: ${message}`,
        };
      }
    },
  };
}

export type RecordHandlers = ReturnType<typeof createRecordHandlers>;

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
import { randomUUID } from 'node:crypto';
import { RecordRevisionService, RevisionError, contentHash, controlledContent, object, revisionRef, token } from '../../revisions/RecordRevisionService.js';
import { acceptProtocolGraph } from '../../revisions/ProtocolUseService.js';
import { LifecycleEngine } from '../../lifecycle/LifecycleEngine.js';
import { checkLifecycleTransition } from '../../lifecycle/lifecycleMiddleware.js';
import type { LocalIdentityService, ResolvedRequestUser } from '../../security/LocalIdentityService.js';
import { LOCAL_ADMIN_USER_ID } from '../../security/LocalIdentityService.js';
import type { AuthorizationService } from '../../security/AuthorizationService.js';
import type { AccessAction } from '../../security/AccessControlService.js';
import type { RoleResolver } from '../../security/RoleResolver.js';
import type { AuthoringPolicy } from '../../lint/types.js';
import { authoringGuardFiresOnUpdate, authoringPolicyPasses } from '../../lint/AuthoringGuard.js';
import type { PolicyDisposition } from '../../policy/types.js';
import type { AuditEventService } from '../../governance/AuditEventService.js';

interface RecordHandlerSecurityOptions {
  identityService?: LocalIdentityService;
  authorizationService?: AuthorizationService;
  roleResolver?: RoleResolver;
  getPolicySettings?: () => { enforceTransitionRoles: PolicyDisposition };
  /** Best-effort audit trail; appends never fail the business operation. */
  auditService?: AuditEventService;
  /**
   * Kinds that can never be updated or deleted (append-only governance
   * records). Absent accessor → nothing is protected (system works with the
   * config ripped out).
   */
  getAppendOnlyKinds?: () => string[];
  /**
   * Declarative actor-side authoring gates, keyed by schema id. Sourced from
   * *.lint.yaml `authoring:` blocks via the LintEngine; absent accessor →
   * no authoring gates (system works with the wiring ripped out).
   */
  getAuthoringPolicy?: (schemaId: string) => AuthoringPolicy | undefined;
}

/** Body of an update request extended with optional presented signature refs. */
type UpdateRecordBodyWithSignatures = UpdateRecordRequest & {
  signatureRefs?: string[];
};

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
    if (record && payloadKind(record.payload) === 'record-revision') {
      const source = await store.get(String(payloadObject(record.payload).sourceRecordId));
      if (!source) return false;
      return !security?.authorizationService || security.authorizationService.canAccess(user.userId, action, source);
    }
    if (!record || !security?.authorizationService) return true;
    return security.authorizationService.canAccess(user.userId, action, record);
  };

  /**
   * Evaluate a declarative authoring policy (from *.lint.yaml) against the
   * resolved session actor. Returns null when the actor passes (or no
   * policy is declared); otherwise the reply is set to 403 and the deny
   * code is returned. Values come from YAML; nothing here is kind- or
   * role-specific.
   */
  const checkAuthoringPolicy = async (
    policy: AuthoringPolicy,
    user: ResolvedRequestUser,
    reply: FastifyReply,
  ): Promise<string | null> => {
    const actorContext = {
      userId: user.userId,
      isSystem: user.isSystem,
      isLocalAdmin: user.userId === LOCAL_ADMIN_USER_ID,
      roles:
        security?.roleResolver && user.userId
          ? await security.roleResolver.rolesFor(user.userId)
          : [],
    };
    if (authoringPolicyPasses(policy, actorContext)) return null;
    reply.status(403);
    return policy.denyCode ?? 'AUTHORING_FORBIDDEN';
  };

  return {
    async listRevisions(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const user = await resolveRequestUser(request, reply);
      if (!user) return unauthenticatedError('A valid local user is required');
      const source = await store.get(request.params.id);
      if (!source || !(await canAccess(user, 'read', source))) return reply.code(404).send({ error: 'NOT_FOUND' });
      return { records: await new RecordRevisionService(store).list(source.recordId) };
    },
    async draftCopy(request: FastifyRequest<{ Params: { id: string }; Body: { recordId?: string; payload?: Record<string, unknown>; expectedSha?: string } }>, reply: FastifyReply) {
      try {
        const user = await resolveRequestUser(request, reply);
        if (!user) return unauthenticatedError('A valid local user is required');
        const source = await store.get(request.params.id);
        if (!source || !(await canAccess(user, 'write', source))) return reply.code(404).send({ error: 'NOT_FOUND' });
        if (!['protocol', 'controlled-document'].includes(String(payloadKind(source.payload)))) return reply.code(422).send({ error: 'DRAFT_COPY_UNSUPPORTED' });
        if (request.body.expectedSha && token(source) !== request.body.expectedSha) return reply.code(409).send({ error: 'STALE_RECORD', message: 'Reload before creating a draft copy.' });
        const revision = await new RecordRevisionService(store).capture(source, user.userId ?? 'system', 'derivation');
        const recordId = request.body.recordId ?? `${payloadKind(source.payload) === 'protocol' ? 'PRT' : 'DOC'}-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
        const payload = { ...object(source.payload), ...request.body.payload, recordId, state: 'draft', createdBy: user.userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), derivedFromRevisionRef: revisionRef(revision.recordId) };
        for (const key of ['protocolRevisionRef', 'latestRevisionRef', 'signatureRefs', 'approvals', 'reviewerRef', 'approverRef', 'authorRef']) delete (payload as Record<string, unknown>)[key];
        if (payloadKind(source.payload) === 'protocol') {
          (payload as Record<string, unknown>).version = '0.1.1';
          if ('id' in payload) (payload as Record<string, unknown>).id = recordId;
        }
        if (payloadKind(source.payload) === 'controlled-document') {
          delete (payload as Record<string, unknown>).recordId;
          (payload as Record<string, unknown>).id = recordId;
        }
        const result = await store.create({ envelope: { recordId, schemaId: source.schemaId, payload }, message: `Draft from ${source.recordId}` });
        if (!result.success) return reply.code(422).send({ error: result.error, validation: result.validation });
        if (result.envelope && user.userId) await security?.authorizationService?.ensureOwnerPolicy(result.envelope, user.userId);
        return { success: true, record: result.envelope ?? await store.get(recordId) };
      } catch (error) { return reply.code(error instanceof RevisionError ? error.status : 500).send({ error: error instanceof RevisionError ? error.code : 'DRAFT_COPY_FAILED', message: String(error) }); }
    },
    async acceptGraph(request: FastifyRequest<{ Params: { id: string }; Body: { expectedSha: string } }>, reply: FastifyReply) {
      try {
        const user = await resolveRequestUser(request, reply);
        if (!user) return unauthenticatedError('A valid local user is required');
        const graph = await store.get(request.params.id);
        if (!graph || !(await canAccess(user, 'write', graph))) return reply.code(404).send({ error: 'NOT_FOUND' });
        const sourceId = object(object(graph.payload).protocolSource).recordId;
        const source = typeof sourceId === 'string' ? await store.get(sourceId) : null;
        if (source && !(await canAccess(user, 'read', source))) return reply.code(403).send({ error: 'FORBIDDEN' });
        return { success: true, ...await acceptProtocolGraph(store, graph.recordId, user.userId ?? 'system', request.body.expectedSha) };
      } catch (error) { return reply.code(error instanceof RevisionError ? error.status : 500).send({ error: error instanceof RevisionError ? error.code : 'GRAPH_ACCEPT_FAILED', message: String(error) }); }
    },
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
        if (err instanceof RevisionError) { reply.status(err.status); return { error: err.code, message: err.message }; }
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

        // Declarative authoring gate (from *.lint.yaml `authoring:`): the
        // actor must satisfy the declared policy before the record is
        // authored at all. Absent policy/accessor -> no gate.
        const authoringPolicy = security?.getAuthoringPolicy?.(schemaId);
        if (authoringPolicy) {
          const deny = await checkAuthoringPolicy(authoringPolicy, user, reply);
          if (deny) return { error: deny, message: `Authoring a ${schemaId} record is forbidden for this actor` };
        }

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
        if (['record-revision', 'signature'].includes(String(kind))) {
          reply.status(403);
          return { error: 'SYSTEM_OWNED', message: 'Use the revision/signing service to create immutable evidence.' };
        }
        if (payloadObject(payload).protocolRevisionRef) return reply.code(422).send({ error: 'SYSTEM_OWNED_REVISION', message: 'Revision pins are assigned when a graph is accepted or a run starts.' });
        if (kind === 'protocol') {
          const p = payloadObject(payload);
          p.version = typeof p.version === 'string' && p.version.trim() ? p.version.trim() : '0.1.1';
          p.state = 'draft';
        }
        if (kind === 'controlled-document' && payloadObject(payload).state !== 'draft') {
          reply.status(422); return { error: 'INITIAL_STATE_REQUIRED', message: 'Create controlled documents as drafts, then use lifecycle transitions.' };
        }
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
        
        // Inject payload provenance fields only where the target schema accepts them.
        // Actor provenance always exists in envelope meta; some FAIRCommon payloads
        // also carry createdBy for durable file-level provenance.
        const now = new Date().toISOString();
        const creator = user.userId ?? identity?.username ?? 'system';
        // NOTE: material-instance and aliquot schemas use unevaluatedProperties:false
        // at root level and do NOT include FAIRCommon via allOf. Ajv rejects
        // createdAt/createdBy/updatedAt for these types, so we skip injecting them
        // into the payload and rely on envelope meta instead. Event graphs accept
        // createdAt/updatedAt but not createdBy, so actor provenance stays in meta.
        const payloadObj = payload as Record<string, unknown>;
        const isInventoryRecord = payloadObj.kind === 'material-instance' || payloadObj.kind === 'aliquot';
        const supportsPayloadCreatedBy = payloadObj.kind !== 'event-graph';
        const payloadWithProvenance = isInventoryRecord
          ? payloadObj
          : {
              ...payloadObj,
              createdAt: now,
              updatedAt: now,
              ...(supportsPayloadCreatedBy ? { createdBy: creator } : {}),
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
          // Stamp the resolved actor into the declared provenance field
          // (e.g. grantedBy) when the authoring policy asks for it.
          authoringPolicy?.stampActorAs && user.userId
            ? { ...payloadWithProvenance, [authoringPolicy.stampActorAs]: user.userId }
            : payloadWithProvenance,
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
        if (err instanceof RevisionError) { reply.status(err.status); return { error: err.code, message: err.message }; }
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
        Body: UpdateRecordBodyWithSignatures;
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
        
        // Append-only governance kinds (audit events, signatures) can never
        // be mutated through the record API.
        {
          const appendOnlyKinds = ['record-revision', 'signature', 'audit-event', ...(security?.getAppendOnlyKinds?.() ?? [])];
          const existingKind = payloadKind(existing.payload);
          if (existingKind && appendOnlyKinds.includes(existingKind)) {
            reply.status(405);
            return {
              error: 'APPEND_ONLY',
              message: `${existing.recordId} is an append-only ${existingKind} record`,
            };
          }
        }

        // Declarative authoring gate on UPDATE: fires only when one of the
        // policy's guardWhenChanged payload paths actually changes.
        {
          const authoringPolicy = security?.getAuthoringPolicy?.(existing.schemaId);
          if (
            authoringPolicy &&
            authoringGuardFiresOnUpdate(
              authoringPolicy,
              existing.payload as Record<string, unknown>,
              request.body.payload as Record<string, unknown>,
            )
          ) {
            const deny = await checkAuthoringPolicy(authoringPolicy, user, reply);
            if (deny) return { error: deny, message: `Updating ${id} is forbidden for this actor` };
          }
        }

        const previousPinned = payloadObject(existing.payload);
        const nextPinned = payloadObject(request.body.payload);
        if (!previousPinned.protocolRevisionRef && nextPinned.protocolRevisionRef) return reply.code(422).send({ error: 'SYSTEM_OWNED_REVISION', message: 'Revision pins are assigned when a graph is accepted or a run starts.' });
        if (previousPinned.protocolRevisionRef && nextPinned.protocolRevisionRef && contentHash(previousPinned.protocolRevisionRef) !== contentHash(nextPinned.protocolRevisionRef)) {
          reply.status(409); return { error: 'REVISION_PIN_IMMUTABLE', message: 'Create a new record to change an accepted source revision.' };
        }
        if (previousPinned.protocolRevisionRef) nextPinned.protocolRevisionRef = previousPinned.protocolRevisionRef;
        if (previousPinned.kind === 'event-graph' && previousPinned.methodContext && !nextPinned.methodContext) nextPinned.methodContext = previousPinned.methodContext;
        if (previousPinned.protocolSource) {
          if (nextPinned.protocolSource && contentHash(nextPinned.protocolSource) !== contentHash(previousPinned.protocolSource)) return reply.code(409).send({ error: 'SOURCE_IMMUTABLE', message: 'Regenerate as a new graph to change its source.' });
          nextPinned.protocolSource = previousPinned.protocolSource;
        }
        if (previousPinned.lifecycleId && previousPinned.lifecycleId !== nextPinned.lifecycleId) {
          reply.status(409); return { error: 'LIFECYCLE_IMMUTABLE', message: 'A controlled record cannot discard its lifecycle.' };
        }

        // Validate presented signature refs BEFORE the lifecycle check: each
        // must be a signature record bound to THIS record and signed by the
        // acting user. The engine's requires_signature guard consumes the
        // resulting presentedSignatures list.
        let presentedSignatures: Array<{ id: string; action: string; subjectRecordId: string; signedBy: string }> | undefined;
        if (lifecycleEngine && Array.isArray((request.body as UpdateRecordBodyWithSignatures).signatureRefs)) {
          const actorIdForSignatures = user.userId ?? 'anonymous';
          const refs = (request.body as UpdateRecordBodyWithSignatures).signatureRefs ?? [];
          const validated: Array<{ id: string; action: string; subjectRecordId: string; signedBy: string }> = [];
          for (const ref of refs) {
            const sigRecord = await store.get(ref);
            const sigPayload = payloadObject(sigRecord?.payload);
            if (!sigRecord || sigPayload.kind !== 'signature') {
              reply.status(422);
              return { error: 'INVALID_SIGNATURE_REF', message: `${ref} is not a signature record` };
            }
            const subject = payloadObject(sigPayload.subject);
            if (subject.recordId !== id) {
              reply.status(422);
              return { error: 'SIGNATURE_SUBJECT_MISMATCH', message: `Signature ${ref} is not bound to ${id}` };
            }
            if (sigPayload.signedBy !== actorIdForSignatures) {
              reply.status(422);
              return { error: 'SIGNATURE_SIGNER_MISMATCH', message: `Signature ${ref} was not signed by the acting user` };
            }
            const refId = object(subject.revisionRef).id;
            if (typeof refId !== 'string' || typeof subject.contentHash !== 'string') {
              reply.status(422); return { error: 'SIGNATURE_REVISION_REQUIRED', message: 'This historical signature cannot authorize a new transition. Sign the saved revision again.' };
            }
            const signed = await new RecordRevisionService(store).read({ id: refId }, id);
            if (signed.payload.contentHash !== subject.contentHash || contentHash(existing.payload) !== subject.contentHash) {
              reply.status(409); return { error: 'STALE_SIGNATURE', message: 'The document changed after signing. Sign its current saved revision.' };
            }
            if (controlledContent(existing.payload) !== controlledContent(request.body.payload)) {
              reply.status(409); return { error: 'SIGNED_CONTENT_CHANGED', message: 'Save content edits before signing; a signed transition may only change state.' };
            }
            if (subject.targetState && subject.targetState !== payloadObject(request.body.payload).state) {
              reply.status(422); return { error: 'SIGNATURE_TARGET_MISMATCH', message: 'The signature is for a different transition.' };
            }
            validated.push({
              id: ref,
              action: typeof sigPayload.action === 'string' ? sigPayload.action : '',
              subjectRecordId: String(subject.recordId),
              signedBy: String(sigPayload.signedBy),
            });
          }
          presentedSignatures = validated;
        }

        // Check lifecycle transition if lifecycleEngine is available
        let lifecycleTransition: { from: string; to: string; event: string } | undefined;
        let nextLifecycleId: string | undefined;
        if (lifecycleEngine) {
          const actorId = user.userId ?? 'anonymous'
          const previousPayload = existing.payload as Record<string, unknown>
          const nextPayload = request.body.payload as Record<string, unknown>
          nextLifecycleId = (nextPayload.lifecycleId as string | undefined)
          const actorRoles = security?.roleResolver && user.userId
            ? await security.roleResolver.rolesFor(user.userId, nextLifecycleId)
            : []
          const enforceTransitionRoles = (security?.getPolicySettings?.().enforceTransitionRoles ?? 'allow') === 'deny'
          const lifecycleResult = checkLifecycleTransition(lifecycleEngine, {
            previousPayload,
            nextPayload,
            actorId,
            actorRoles,
            enforceTransitionRoles,
            ...(presentedSignatures !== undefined ? { presentedSignatures } : {}),
          })
          
          if (!lifecycleResult.allowed) {
            reply.status(422)
            return {
              error: 'LIFECYCLE_TRANSITION_DENIED',
              message: lifecycleResult.error || 'Lifecycle transition not allowed',
            }
          }
          lifecycleTransition = lifecycleResult.transition
        }
        
        const previous = payloadObject(existing.payload);
        const proposed = payloadObject(request.body.payload);
        if (previous.lifecycleId && ['approved', 'effective', 'superseded', 'archived'].includes(String(previous.state)) && controlledContent(previous) !== controlledContent(proposed)) {
          reply.status(409); return { error: 'CONTROLLED_RECORD_LOCKED', message: 'Create a new draft to edit an approved or effective document.' };
        }
        if (previous.kind === 'protocol' && !previous.lifecycleId) {
          const service = new RecordRevisionService(store);
          const versions = await service.list(id);
          proposed.version = versions.some(r => r.payload.purpose === 'research-use')
            ? await service.draftVersion(id, proposed)
            : typeof proposed.version === 'string' && proposed.version.trim() ? proposed.version.trim() : '0.1.1';
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
        const supportsPayloadCreatedBy = payloadObj.kind !== 'event-graph' && !existing.schemaId.includes('event-graph');
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
        if (!isInventoryRecord && supportsPayloadCreatedBy) {
          const existingCreatedBy = (existing.payload as Record<string, unknown>).createdBy;
          if (typeof existingCreatedBy === 'string') {
            (payloadWithProvenance as Record<string, unknown>).createdBy = existingCreatedBy;
          } else {
            delete (payloadWithProvenance as Record<string, unknown>).createdBy;
          }
        } else {
          delete (payloadWithProvenance as Record<string, unknown>).createdBy;
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
          ...((expectedSha ?? (presentedSignatures?.length ? token(existing) : undefined)) ? { expectedSha: expectedSha ?? token(existing)! } : {}),
          ...(message !== undefined ? { message } : {}),
          // lifecycleTransition is only set when checkLifecycleTransition ran,
          // allowed, AND the state value actually changed — exactly when the
          // store's bypass detector must stand down.
          ...(lifecycleTransition !== undefined ? { viaLifecycleApi: true } : {}),
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

        // Record what the transition MEANT (append-only audit trail).
        // AuditEventService.append swallows its own failures — this never
        // fails the business operation.
        if (lifecycleTransition && security?.auditService) {
          await security.auditService.append({
            actor: user.userId ?? 'anonymous',
            action: 'lifecycle_transition',
            subjectType: payloadKind(existing.payload) ?? 'record',
            subjectId: id,
            data: {
              from: lifecycleTransition.from,
              to: lifecycleTransition.to,
              event: lifecycleTransition.event,
              ...(presentedSignatures?.length ? { signatureRefs: presentedSignatures.map(signature => signature.id) } : {}),
              ...(nextLifecycleId !== undefined ? { lifecycleId: nextLifecycleId } : {}),
              ...(result.commit?.sha !== undefined ? { commitSha: result.commit.sha } : {}),
            },
          });
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
        if (err instanceof RevisionError) { reply.status(err.status); return { error: err.code, message: err.message }; }
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
     * GET /claims
     * List all claim records with optional status-based filtering.
     * Claims are standalone knowledge records (not study-scoped).
     */
    async listClaims(
      request: FastifyRequest<{ Querystring: { status?: string; limit?: number; offset?: number } }>,
      reply: FastifyReply
    ): Promise<{ claims: RecordEnvelope[]; total?: number; offset?: number; limit?: number } | ApiError> {
      try {
        const { status, limit, offset } = request.query;

        const user = await resolveRequestUser(request, reply);
        if (!user) return unauthenticatedError('A valid local user is required');

        const allClaims = await store.list({ kind: 'claim' });

        // Filter by status if provided
        const filtered = status
          ? allClaims.filter(env => {
              const p = env.payload as Record<string, unknown> | undefined;
              return p?.status === status;
            })
          : allClaims;

        // Apply access control
        const visibleClaims: RecordEnvelope[] = [];
        for (const claim of filtered) {
          if (await canAccess(user, 'read', claim)) visibleClaims.push(claim);
        }

        // Apply pagination
        const start = offset ?? 0;
        const end = limit !== undefined ? start + Number(limit) : visibleClaims.length;
        const paged = visibleClaims.slice(start, end);

        const result: { claims: RecordEnvelope[]; total?: number; offset?: number; limit?: number } = {
          claims: paged,
          total: visibleClaims.length,
        };
        if (limit !== undefined) result.limit = Number(limit);
        if (offset !== undefined) result.offset = Number(offset);

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: `Failed to list claims: ${message}` };
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

        // Append-only governance kinds (audit events, signatures) can never
        // be deleted through the record API.
        {
          const appendOnlyKinds = ['record-revision', 'signature', 'audit-event', ...(security?.getAppendOnlyKinds?.() ?? [])];
          const existingKind = payloadKind(existing.payload);
          if (existingKind && appendOnlyKinds.includes(existingKind)) {
            reply.status(405);
            return {
              error: 'APPEND_ONLY',
              message: `${existing.recordId} is an append-only ${existingKind} record`,
            };
          }
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

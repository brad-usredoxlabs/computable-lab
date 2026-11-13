/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cproute) — the HTTP surface over the pending-intent checkpoint
 * store: four thin routes under the EXISTING `/ai/threads` family (ONE prefix): save / load /
 * resume / attachDelta. The handler RE-IMPLEMENTS NOTHING — no validation, no version comparison,
 * no resume logic; it maps the request onto PendingIntentStore methods (ITS names/result shapes
 * are the authority) and maps the store's result to a status: contract diagnostics => 400 with
 * the codes; save success => 201 { checkpoint_id, concurrency_version }; load null => 404 with a
 * machine-readable reason (NEVER a fabricated document — the store's NO-FALLBACK rule); resume
 * `version_conflict` => 409 with the SAME code the store returned (consumption-once is the store's
 * compare-and-set; the handler compares nothing), success => 200 with the receipt; attachDelta
 * `injection-refused` => 422. Identity is header-carried (x-user-id; absent => `default`), never
 * a TS constant. The store is built per request from (rootDir, userId, endpoint, scope, threadId):
 * it is stateless across requests and its resume chain is keyed by file PATH (module-level), so
 * per-request construction cannot break the two-tabs-one-resume guarantee.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  PendingIntentStore,
  type PendingIntentStoreOptions,
  type ResumeInput,
} from '../../ai-threads/PendingIntentStore.js';
import type { ContractDiagnostic, PendingIntentCheckpoint } from '../../compiler/journey/checkpointContract.js';

/** Store factory injected so a test can hand in a store (or a real one over mkdtemp). */
export interface PendingIntentStoreFactory {
  (options: PendingIntentStoreOptions): PendingIntentStore;
}

export interface CheckpointRouteParams { endpoint: string; checkpointId?: string }
export interface CheckpointRouteQuery { scope?: string; threadId?: string }
/** The resume body (brief: { checkpointId, expectedVersion, resumedBy }); the ROUTE PARAM id is authoritative. */
export interface ResumeBody { checkpointId?: string; expectedVersion: number; resumedBy?: string }

function headerUserId(request: FastifyRequest): string {
  const header = request.headers['x-user-id'];
  return typeof header === 'string' && header.length > 0 ? header : 'default';
}

/** Build the per-request store from header-carried user + route/query identity (exactOptionalPropertyTypes: scope ABSENT or value). */
function storeFor(request: FastifyRequest, rootDir: string, factory: PendingIntentStoreFactory, endpoint: string, query: CheckpointRouteQuery): PendingIntentStore {
  const opts: PendingIntentStoreOptions = {
    rootDir,
    userId: headerUserId(request),
    endpoint,
    threadId: typeof query.threadId === 'string' && query.threadId.length > 0 ? query.threadId : 'default',
  };
  if (typeof query.scope === 'string' && query.scope.length > 0) opts.scope = query.scope;
  return factory(opts);
}

const toCodes = (diagnostics: ContractDiagnostic[]): string[] => diagnostics.map((d) => d.code);

export class PendingIntentHandlers {
  private readonly rootDir: string;
  private readonly factory: PendingIntentStoreFactory;

  constructor(options: { rootDir: string; storeFactory?: PendingIntentStoreFactory }) {
    this.rootDir = options.rootDir;
    this.factory = options.storeFactory ?? ((opts) => new PendingIntentStore(opts));
  }

  /** POST /ai/threads/:endpoint/checkpoints — body = the checkpoint document. */
  async save(request: FastifyRequest<{ Params: CheckpointRouteParams; Querystring: CheckpointRouteQuery }>, reply: FastifyReply) {
    const store = storeFor(request, this.rootDir, this.factory, request.params.endpoint, request.query);
    const result = await store.save(request.body);
    if (!result.ok) {
      return reply.status(400).send({ error: 'checkpoint rejected by contract', codes: toCodes(result.diagnostics), diagnostics: result.diagnostics });
    }
    // The store validated the document via the one Ajv seam; id/version ride back from the
    // EXACT document the client sent (the store's SaveResult echoes nothing).
    const doc = request.body as PendingIntentCheckpoint;
    return reply.status(201).send({ checkpoint_id: doc.checkpoint_id, concurrency_version: doc.concurrency_version });
  }

  /** GET .../checkpoints/:checkpointId — store null => 404, never a fabricated document. */
  async load(request: FastifyRequest<{ Params: CheckpointRouteParams; Querystring: CheckpointRouteQuery }>, reply: FastifyReply) {
    const checkpointId = request.params.checkpointId ?? '';
    const store = storeFor(request, this.rootDir, this.factory, request.params.endpoint, request.query);
    const doc = await store.load(checkpointId);
    if (doc === null) {
      return reply.status(404).send({ error: 'checkpoint-not-found', reason: 'no checkpoint document is stored for this thread' });
    }
    return reply.send(doc);
  }

  /** POST .../checkpoints/:checkpointId/resume — delegate; NO version comparison here. */
  async resume(request: FastifyRequest<{ Params: CheckpointRouteParams; Querystring: CheckpointRouteQuery }>, reply: FastifyReply) {
    const checkpointId = request.params.checkpointId ?? '';
    const body = request.body as ResumeBody;
    if (!body || typeof body.expectedVersion !== 'number') {
      return reply.status(400).send({ error: 'body must include numeric `expectedVersion`' });
    }
    const store = storeFor(request, this.rootDir, this.factory, request.params.endpoint, request.query);
    // The receipt fields the store requires but the client does not send: a minted receipt
    // id, the current timestamp, resumedBy (client body, else the header user), the outcome.
    // The consume-once compare-and-set itself is the store's.
    const resumedBy = typeof body.resumedBy === 'string' && body.resumedBy.length > 0 ? body.resumedBy : headerUserId(request);
    const input: ResumeInput = {
      expectedVersion: body.expectedVersion,
      receiptId: randomUUID(),
      resumedAt: new Date().toISOString(),
      resumedBy,
      outcome: 'resumed',
    };
    const result = await store.resume(checkpointId, input);
    if (!result.ok) {
      const first = result.diagnostics[0];
      // The SAME code the store returned: a compare-and-set loser => 409 conflict (never collapsed into 400/404).
      if (first !== undefined && first.code === 'version_conflict') {
        return reply.status(409).send({ error: 'version_conflict', code: first.code, reason: first.message });
      }
      return reply.status(400).send({ error: 'resume rejected', codes: toCodes(result.diagnostics), diagnostics: result.diagnostics });
    }
    return reply.send({ receipt: result.checkpoint.resume_receipt });
  }

  /** POST .../checkpoints/:checkpointId/delta — the store's injection-mode refusal => 422. */
  async attachDelta(request: FastifyRequest<{ Params: CheckpointRouteParams; Querystring: CheckpointRouteQuery }>, reply: FastifyReply) {
    const checkpointId = request.params.checkpointId ?? '';
    const store = storeFor(request, this.rootDir, this.factory, request.params.endpoint, request.query);
    const result = await store.attachDelta(request.body);
    if (!result.ok) {
      const refusal = result.diagnostics.find((d) => d.code === 'injection-refused');
      if (refusal !== undefined) {
        return reply.status(422).send({ error: 'injection-refused', code: refusal.code, reason: refusal.message });
      }
      return reply.status(400).send({ error: 'delta rejected by contract', codes: toCodes(result.diagnostics), diagnostics: result.diagnostics });
    }
    return reply.send({ delta_id: result.delta.delta_id, checkpoint_id: checkpointId });
  }
}

export function createPendingIntentHandlers(options: { rootDir: string; storeFactory?: PendingIntentStoreFactory }): PendingIntentHandlers {
  return new PendingIntentHandlers(options);
}

/**
 * W2-5 T5 — MEANT edit revisions + audit (spec §3.4 + §6 T5).
 *
 * Harness COPY of server/src/revisions/RevisionRoutes.test.ts (direct handlers
 * + Map-backed store) wired with the W2-5 security options exactly as
 * server.ts wires them: auditService (real AuditEventService over the same
 * fake store), getAppendOnlyKinds + getRevisionOnEditKinds read the DATA knobs
 * from DEFAULT_CONFIG (OQ1: ['extraction-draft']).
 *
 * Arms: ordinary review edit -> 200 + record-revision (snapshot == previous
 * payload, purpose 'edit' per OQ2) + audit-event record_revised with
 * previous_sha/new_sha/revision_ref; stale expectedSha -> 409 and NOTHING
 * persisted; gate arms XDR_SOURCE_LOCKED / XDR_CANDIDATE_STATUS_REGRESSION /
 * XDR_CANDIDATE_LOCKED each refuse persisting nothing; appendOnlyKinds does
 * NOT block XDR edits (different kind); idempotence (bait 9): a no-op PUT
 * re-captures the SAME content-addressed REV — exactly one revision, no
 * duplicate mint.
 */

import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js';
import { RecordRevisionService, token, contentHash } from '../revisions/RecordRevisionService.js';
import { AuditEventService } from '../governance/AuditEventService.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { RecordStore } from '../store/types.js';

const XDR_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml';

function replyOf() {
  let statusValue = 200;
  const reply: any = {
    status: (code: number) => { statusValue = code; return reply; },
    code: (code: number) => { statusValue = code; return reply; },
    send: (body: unknown) => body,
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  return reply;
}

function draftPayload(): Record<string, unknown> {
  return {
    kind: 'extraction-draft',
    recordId: 'XDR-w25-t5',
    source_artifact: { kind: 'file', id: 'VPF-w25-t5' },
    candidates: [
      { target_kind: 'protocol', draft: { kind: 'protocol', title: 'MEANT draft v1', steps: [] }, confidence: 0.8 },
      { target_kind: 'protocol', draft: { kind: 'protocol', title: 'Terminal candidate', steps: [] }, confidence: 0.7, status: 'promoted' },
    ],
    status: 'pending_review',
  };
}

function world() {
  const records = new Map<string, RecordEnvelope>();
  const put = (e: RecordEnvelope) => {
    // contentSha mirrors what the real store stamps (token() reads it).
    const next = structuredClone({ ...e, meta: { ...e.meta, contentSha: contentHash(e.payload) } });
    records.set(e.recordId, next);
    return next;
  };
  const store = {
    get: async (id: string) => structuredClone(records.get(id) ?? null),
    exists: async (id: string) => records.has(id),
    list: async (filter?: { kind?: string }) => [...records.values()]
      .filter(r => !filter?.kind || (r.payload as Record<string, unknown>).kind === filter.kind)
      .map(r => structuredClone(r)),
    create: async ({ envelope }: { envelope: RecordEnvelope }) =>
      records.has(envelope.recordId)
        ? { success: false, error: 'Already exists' }
        : { success: true, envelope: put(envelope) },
    update: async ({ envelope, expectedSha }: { envelope: RecordEnvelope; expectedSha?: string }) => {
      const current = records.get(envelope.recordId);
      if (!current) return { success: false, error: 'Not found' };
      if (expectedSha && token(current) !== expectedSha) return { success: false, error: 'SHA mismatch' };
      return { success: true, envelope: put(envelope) };
    },
    delete: async ({ recordId }: { recordId: string }) => { records.delete(recordId); return { success: true }; },
    validate: async () => ({ valid: true }),
    lint: async () => ({ valid: true }),
  } as unknown as RecordStore;

  const auditService = new AuditEventService(store);
  const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
    identityService: { resolveRequestUser: async () => ({ userId: 'USR-REVIEWER', isSystem: false }) } as never,
    authorizationService: { canAccess: async () => true, ensureOwnerPolicy: async () => {} } as never,
    auditService,
    // §3.1/§3.4b DATA knobs verbatim:
    getAppendOnlyKinds: () => DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
    getRevisionOnEditKinds: () => DEFAULT_CONFIG.server.revisionOnEditKinds ?? [],
  });

  const seed = put({
    recordId: 'XDR-w25-t5',
    schemaId: XDR_SCHEMA_ID,
    payload: draftPayload(),
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-REVIEWER' },
  } as RecordEnvelope);

  const update = async (body: Record<string, unknown>) => {
    const reply = replyOf();
    const result = await handlers.updateRecord(
      { params: { id: 'XDR-w25-t5' }, body, headers: { 'x-user-id': 'USR-REVIEWER' } } as unknown as FastifyRequest,
      reply,
    );
    return { status: reply.statusValue, result: result as Record<string, unknown> };
  };

  return { store, records, handlers, seed, update, auditService };
}

describe('W2-5 T5: MEANT review edits capture revisions + audit (revisionOnEditKinds data)', () => {
  it('PUT /records/:XDR changing candidates[0].draft with expectedSha -> 200, revision snapshot == previous payload (purpose edit), audit record_revised with previous_sha/new_sha/revision_ref', async () => {
    const { store, records, update } = world();
    const before = structuredClone(records.get('XDR-w25-t5')!);
    const nextPayload = structuredClone(before.payload) as Record<string, unknown>;
    const candidates = nextPayload.candidates as Array<Record<string, unknown>>;
    candidates[0] = { ...candidates[0]!, draft: { kind: 'protocol', title: 'MEANT draft v2 (reviewed)', steps: [] } };

    const res = await update({ payload: nextPayload, expectedSha: token(before) });
    expect(res.status, JSON.stringify(res.result)).toBe(200);
    expect(res.result.success).toBe(true);

    // record-revision: snapshot == the SUPERSEDED payload, purpose 'edit' (OQ2).
    const revisions = await new RecordRevisionService(store).list('XDR-w25-t5');
    expect(revisions.length).toBe(1);
    expect(revisions[0]!.payload.purpose).toBe('edit');
    expect(revisions[0]!.payload.snapshot).toEqual(before.payload);

    // audit-event record_revised with previous_sha/new_sha/revision_ref.
    const audits = [...records.values()].filter(r => (r.payload as Record<string, unknown>).kind === 'audit-event');
    const audit = audits.find(r => (r.payload as Record<string, unknown>).action === 'record_revised');
    expect(audit, 'audit-event record_revised must exist').toBeDefined();
    const p = audit!.payload as Record<string, unknown>;
    expect(p.actor).toBe('USR-REVIEWER');
    expect(p.subjectType).toBe('extraction-draft');
    expect(p.subjectId).toBe('XDR-w25-t5');
    const data = p.data as Record<string, unknown>;
    expect(typeof data.previous_sha).toBe('string');
    expect(String(data.previous_sha).length).toBeGreaterThan(0);
    expect(typeof data.new_sha).toBe('string');
    expect(data.revision_ref).toMatchObject({ kind: 'record', type: 'record-revision' });
    expect(String((data.revision_ref as Record<string, unknown>).id)).toBe(revisions[0]!.recordId);
  });

  it('stale expectedSha -> 409 and NOTHING persisted (no revision, no audit event)', async () => {
    const { records, update } = world();
    const payload = structuredClone(records.get('XDR-w25-t5')!.payload);
    const res = await update({ payload, expectedSha: 'stale-sha-not-the-current-one' });
    expect(res.status).toBe(409);
    expect(String(res.result.error)).toContain('SHA mismatch');
    expect([...records.values()].some(r => (r.payload as Record<string, unknown>).kind === 'record-revision')).toBe(false);
    expect([...records.values()].some(r => (r.payload as Record<string, unknown>).action === 'record_revised')).toBe(false);
  });

  it('gate arm XDR_SOURCE_LOCKED: source_artifact change refuses persisting nothing', async () => {
    const { records, update } = world();
    const payload = structuredClone(records.get('XDR-w25-t5')!.payload) as Record<string, unknown>;
    payload.source_artifact = { kind: 'publication', id: 'PUB-swapped' };
    const res = await update({ payload });
    expect(res.status).toBe(409);
    expect(res.result.error).toBe('XDR_SOURCE_LOCKED');
    expect((records.get('XDR-w25-t5')!.payload as Record<string, unknown>).source_artifact).toEqual({ kind: 'file', id: 'VPF-w25-t5' });
    expect([...records.values()].some(r => (r.payload as Record<string, unknown>).kind === 'record-revision')).toBe(false);
  });

  it('gate arm XDR_CANDIDATE_STATUS_REGRESSION: promoted -> rejected refuses persisting nothing', async () => {
    const { records, update } = world();
    const payload = structuredClone(records.get('XDR-w25-t5')!.payload) as Record<string, unknown>;
    const candidates = payload.candidates as Array<Record<string, unknown>>;
    candidates[1] = { ...candidates[1]!, status: 'rejected' };
    const res = await update({ payload });
    expect(res.status).toBe(409);
    expect(res.result.error).toBe('XDR_CANDIDATE_STATUS_REGRESSION');
    const saved = (records.get('XDR-w25-t5')!.payload as Record<string, unknown>).candidates as Array<Record<string, unknown>>;
    expect(saved[1]!.status).toBe('promoted');
  });

  it('gate arm XDR_CANDIDATE_LOCKED: drifting the draft body of a terminal candidate refuses persisting nothing', async () => {
    const { records, update } = world();
    const payload = structuredClone(records.get('XDR-w25-t5')!.payload) as Record<string, unknown>;
    const candidates = payload.candidates as Array<Record<string, unknown>>;
    candidates[1] = { ...candidates[1]!, draft: { kind: 'protocol', title: 'DRIFTED terminal draft', steps: [] } };
    const res = await update({ payload });
    expect(res.status).toBe(409);
    expect(res.result.error).toBe('XDR_CANDIDATE_LOCKED');
    const saved = (records.get('XDR-w25-t5')!.payload as Record<string, unknown>).candidates as Array<Record<string, unknown>>;
    expect((saved[1]!.draft as Record<string, unknown>).title).toBe('Terminal candidate');
  });

  it('appendOnlyKinds does NOT block XDR edits (different kind — the wall is the list, not a wildcard)', async () => {
    expect(DEFAULT_CONFIG.server.appendOnlyKinds).not.toContain('extraction-draft');
    const { records, update } = world();
    const payload = structuredClone(records.get('XDR-w25-t5')!.payload) as Record<string, unknown>;
    payload.status = 'partially_promoted';
    const res = await update({ payload });
    expect(res.status, JSON.stringify(res.result)).toBe(200);
    expect((records.get('XDR-w25-t5')!.payload as Record<string, unknown>).status).toBe('partially_promoted');
  });

  it('idempotence (bait 9): capture() is content-addressed — a double capture of the SAME envelope re-returns the identical REV, exactly one revision minted', async () => {
    const { store, records } = world();
    const service = new RecordRevisionService(store);
    const envelope = records.get('XDR-w25-t5')!;
    const rev1 = await service.capture(envelope, 'USR-REVIEWER', 'edit');
    const rev2 = await service.capture(envelope, 'USR-REVIEWER', 'edit');
    expect(rev2.recordId).toBe(rev1.recordId); // identical content -> identical REV id, existing one returned
    const revisions = [...records.values()].filter(r => (r.payload as Record<string, unknown>).kind === 'record-revision');
    expect(revisions.length).toBe(1);
  });
});

/**
 * MINT-IDEM-1 — POST /vocab/mint is truly idempotent by label.
 *
 * RED-first suite for the W28-A5d decision (Q3 ruling (b), mint reuse-by-lookup):
 * a repeat mint of a label whose record already exists must return the SAME 200
 * success shape pointing at the EXISTING record — not 422 `Record already exists`
 * (RecordStoreImpl.createUnlocked's collision guard, which stays untouched).
 *
 * The handler mirrors MaterialGrounding.ensureLocalMaterialForDraft
 * (MaterialGrounding.ts:211-223): exact normalized-name match among MATERIALS
 * (trim + toLowerCase, schemaId-filtered list limit 10000), then store.get on the
 * deterministic localMaterialIdForLabel(label). On a hit the response label is the
 * EXISTING record's name (payloadName || label — orchestrator OQ1 ruling), so a
 * case-variant second mint returns the FIRST mint's casing.
 *
 * Harness style mirrors RecordHandlers.writeGates.test.ts: direct handler +
 * in-memory envelope map. The fake store HONORS the real create-collision guard
 * (create returns { success: false, error: "Record already exists: <id>" } on a
 * duplicate, RecordStoreImpl.ts:553-562) so the RED run reproduces the real 422.
 */

import { describe, it, expect } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import { createVocabHandlers } from './VocabHandlers.js';
import { localMaterialIdForLabel } from '../../materials/termId.js';
import type { ApiError } from '../types.js';

const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';

function materialEnvelope(recordId: string, name: string): RecordEnvelope {
  return {
    recordId,
    schemaId: MATERIAL_SCHEMA_ID,
    payload: { kind: 'material', id: recordId, name, domain: 'other', status: 'proposed' },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  } as unknown as RecordEnvelope;
}

/** In-memory envelope store honoring the real create-collision guard
 *  (RecordStoreImpl.ts:553-562): create on an existing recordId fails with
 *  "Record already exists: <recordId>" — the exact 422 source at the tip. */
function makeMintStore(initial: RecordEnvelope[] = [], createFailure?: { error: string }) {
  const byId = new Map<string, RecordEnvelope>(initial.map((env) => [env.recordId, env]));
  const createCalls: RecordEnvelope[] = [];
  const store = {
    async get(recordId: string) {
      return byId.get(recordId) ?? null;
    },
    async list(filter?: { schemaId?: string; limit?: number }) {
      const all = [...byId.values()];
      const filtered = filter?.schemaId ? all.filter((env) => env.schemaId === filter.schemaId) : all;
      return filter?.limit !== undefined ? filtered.slice(0, filter.limit) : filtered;
    },
    async create(opts: { envelope: RecordEnvelope }) {
      createCalls.push(opts.envelope);
      if (createFailure) return { success: false, error: createFailure.error };
      if (byId.has(opts.envelope.recordId)) {
        return { success: false, error: `Record already exists: ${opts.envelope.recordId}` };
      }
      byId.set(opts.envelope.recordId, opts.envelope);
      return { success: true, envelope: opts.envelope };
    },
  };
  return { store: store as unknown as RecordStore, byId, createCalls };
}

function makeReply() {
  let statusValue = 200;
  const reply: any = {
    status: (code: number) => {
      statusValue = code;
      return reply;
    },
    code: (code: number) => {
      statusValue = code;
      return reply;
    },
    send: () => reply,
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  return reply;
}

function makeMintRequest(body: Record<string, unknown>) {
  return { params: {}, body, headers: {} } as never;
}

// ---------------------------------------------------------------------------
// 1. Repeat mint: mint(label) x2 -> both 200, same recordId, ONE record
// ---------------------------------------------------------------------------

describe('POST /vocab/mint — repeat mint is idempotent (MINT-IDEM-1)', () => {
  it('mint(label) twice: both 200, SAME recordId, exactly ONE record in the store', async () => {
    const { store, byId, createCalls } = makeMintStore();
    const handlers = createVocabHandlers(store);
    const label = 'idem probe label';

    const r1 = await handlers.mintTerm(makeMintRequest({ refKind: 'material', label }), makeReply());
    const reply2 = makeReply();
    const r2 = await handlers.mintTerm(makeMintRequest({ refKind: 'material', label }), reply2);

    expect(r1).toMatchObject({ success: true });
    expect(reply2.statusValue).toBe(200);
    expect(r2).toMatchObject({ success: true });
    const ok1 = r1 as { recordId: string; label: string; iri: string };
    const ok2 = r2 as { recordId: string; label: string; iri: string };
    expect(ok2.recordId).toBe(ok1.recordId);
    expect(ok2.recordId).toBe(localMaterialIdForLabel(label));
    expect(ok2.iri).toBe(ok1.iri);
    // Response shape frozen: no reused/created/mention fields (spec NON-GOALS).
    expect(Object.keys(ok2).sort()).toEqual(['iri', 'label', 'recordId', 'success']);
    // Exactly ONE record: map read-back AND list read-back.
    expect(byId.size).toBe(1);
    expect(await store.list({ schemaId: MATERIAL_SCHEMA_ID, limit: 10000 })).toHaveLength(1);
    // The collision was AVOIDED (lookup-first), not absorbed: only the first
    // mint reached store.create.
    expect(createCalls).toHaveLength(1);
  });

  it('mint "DMSO" then "dmso": both 200, one record; label is the EXISTING record name (OQ1)', async () => {
    const { store, byId } = makeMintStore();
    const handlers = createVocabHandlers(store);

    const r1 = await handlers.mintTerm(makeMintRequest({ refKind: 'material', label: 'DMSO' }), makeReply());
    const reply2 = makeReply();
    const r2 = await handlers.mintTerm(makeMintRequest({ refKind: 'material', label: 'dmso' }), reply2);

    expect(reply2.statusValue).toBe(200);
    const ok1 = r1 as { recordId: string; label: string };
    const ok2 = r2 as { recordId: string; label: string };
    // labelHash is case-insensitive (termId.ts:20-26): both labels share the id.
    expect(ok2.recordId).toBe(ok1.recordId);
    // OQ1 ruling: the record's name is the truth — first mint's casing wins.
    expect(ok2.label).toBe('DMSO');
    expect(byId.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Name-match arm: label equal to an existing material NAME (arbitrary id)
// ---------------------------------------------------------------------------

describe('POST /vocab/mint — name-match arm (mirrors MaterialGrounding :211-214)', () => {
  it('mint("foo reagent") with a seeded material named "Foo Reagent" at an arbitrary id: 200 pointing at it, no duplicate', async () => {
    const seeded = materialEnvelope('MAT-FOO-REAGENT', 'Foo Reagent');
    const { store, byId, createCalls } = makeMintStore([seeded]);
    const handlers = createVocabHandlers(store);

    const reply = makeReply();
    const result = await handlers.mintTerm(makeMintRequest({ refKind: 'material', label: 'foo reagent' }), reply);

    expect(reply.statusValue).toBe(200);
    const ok = result as { success: true; recordId: string; label: string; iri: string };
    expect(ok.success).toBe(true);
    // Points at the SEEDED record — id ≠ localMaterialIdForLabel('foo reagent').
    expect(ok.recordId).toBe('MAT-FOO-REAGENT');
    expect(ok.recordId).not.toBe(localMaterialIdForLabel('foo reagent'));
    // OQ1: existing record's name, not the request's casing.
    expect(ok.label).toBe('Foo Reagent');
    expect(ok.iri).toBe(`http://localhost:3001/records/MAT-FOO-REAGENT`);
    expect(byId.size).toBe(1);
    expect(createCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Id arm: store.get(localMaterialIdForLabel(label)) hit independent of name
// ---------------------------------------------------------------------------

describe('POST /vocab/mint — deterministic-id arm (mirrors MaterialGrounding :219-223)', () => {
  it('record already AT localMaterialIdForLabel(label) with a different name: 200 pointing at it', async () => {
    const label = 'bead beating reagent';
    const seeded = materialEnvelope(localMaterialIdForLabel(label), 'Legacy Name');
    const { store, byId, createCalls } = makeMintStore([seeded]);
    const handlers = createVocabHandlers(store);

    const reply = makeReply();
    const result = await handlers.mintTerm(makeMintRequest({ refKind: 'material', label }), reply);

    expect(reply.statusValue).toBe(200);
    const ok = result as { success: true; recordId: string; label: string };
    expect(ok.recordId).toBe(localMaterialIdForLabel(label));
    // store.get arm: the record's own name wins over the request label.
    expect(ok.label).toBe('Legacy Name');
    expect(byId.size).toBe(1);
    expect(createCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. First-mint regression pins: MISS path byte-identical to MINTABLE.build
// ---------------------------------------------------------------------------

describe('POST /vocab/mint — first-mint byte-identity (MISS path unchanged)', () => {
  it('fresh store, mint once: 200, recordId = localMaterialIdForLabel(label), payload keys exactly kind/id/name/domain/status', async () => {
    const { store, byId } = makeMintStore();
    const handlers = createVocabHandlers(store);
    const label = 'lysis-reagent';

    const reply = makeReply();
    const result = await handlers.mintTerm(makeMintRequest({ refKind: 'material', label }), reply);

    expect(reply.statusValue).toBe(200);
    const ok = result as { success: true; recordId: string; label: string; iri: string };
    expect(ok).toEqual({
      success: true,
      recordId: localMaterialIdForLabel(label),
      label,
      iri: `http://localhost:3001/records/${localMaterialIdForLabel(label)}`,
    });
    const stored = byId.get(localMaterialIdForLabel(label))!;
    expect(Object.keys(stored.payload as Record<string, unknown>).sort()).toEqual(
      ['domain', 'id', 'kind', 'name', 'status'],
    );
    expect(stored.payload).toEqual({
      kind: 'material',
      id: localMaterialIdForLabel(label),
      name: label,
      domain: 'other',
      status: 'proposed',
    });
  });

  it('sourceQuery adds ONLY the definition line (no lifecycleId/provenance drift)', async () => {
    const { store, byId } = makeMintStore();
    const handlers = createVocabHandlers(store);
    const label = 'bead-beating reagent';

    await handlers.mintTerm(
      makeMintRequest({ refKind: 'material', label, sourceQuery: 'bead beating' }),
      makeReply(),
    );

    const stored = byId.get(localMaterialIdForLabel(label))!;
    expect(Object.keys(stored.payload as Record<string, unknown>).sort()).toEqual(
      ['definition', 'domain', 'id', 'kind', 'name', 'status'],
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Still-400/422 pins: validation and NON-collision create failures unchanged
// ---------------------------------------------------------------------------

describe('POST /vocab/mint — validation and generic create-failure pins unchanged', () => {
  it('empty label -> 400 BAD_REQUEST', async () => {
    const { store } = makeMintStore();
    const handlers = createVocabHandlers(store);
    const reply = makeReply();
    const result = await handlers.mintTerm(makeMintRequest({ refKind: 'material', label: '  ' }), reply);
    expect(reply.statusValue).toBe(400);
    expect((result as ApiError).error).toBe('BAD_REQUEST');
  });

  it('unmintable refKind -> 400 BAD_REQUEST', async () => {
    const { store } = makeMintStore();
    const handlers = createVocabHandlers(store);
    const reply = makeReply();
    const result = await handlers.mintTerm(makeMintRequest({ refKind: 'labware', label: 'tube' }), reply);
    expect(reply.statusValue).toBe(400);
    expect((result as ApiError).error).toBe('BAD_REQUEST');
  });

  it('create failing for a NON-collision reason still 422s with the existing message shape', async () => {
    const { store } = makeMintStore([], { error: 'Validation failed' });
    const handlers = createVocabHandlers(store);
    const reply = makeReply();
    const result = await handlers.mintTerm(makeMintRequest({ refKind: 'material', label: 'bad mint' }), reply);
    expect(reply.statusValue).toBe(422);
    const err = result as ApiError;
    expect(err.error).toBe('VALIDATION_FAILED');
    expect(err.message).toBe('Minting "bad mint" failed: Validation failed');
  });
});

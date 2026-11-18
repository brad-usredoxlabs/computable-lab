/**
 * L2-P1-STOCK-IS-A-RECORD-1 (naget404) — the store-MISS path of GET /records/:id.
 *
 * The labware-definition registry is the VOCABULARY layer; the store is the
 * RECORD layer. A registry entry only pre-selects a candidate recordId
 * (identity is a record id, never a name — a recordId, a bare definition id
 * or a declared alias pre-select, they never ARE the record). The ONLY thing
 * a read may return is a record the store actually holds, returned as the
 * store's own envelope. A registry entry with no store record is a 404,
 * never a synthesized record-shaped 200. Nothing is written.
 */
import { describe, it, expect } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import { createRecordHandlers } from './RecordHandlers.js';

const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml';
/** Registry entry with NO store record — vocabulary only. */
const REGISTRY_ONLY_RECORD_ID = 'lbw-def-generic-96-well-deep-plate';
/** Registry entry whose recordId the stub store below DOES hold. */
const STORE_BACKED_RECORD_ID = 'lbw-def-generic-96-well-plate';
/** Store-own path for the stub record — a registry synthesis can't carry it. */
const STORE_META_PATH = 'records/labware-definition/lbw-def-generic-96-well-plate.yaml';

/** Store stub: every get() MISSES (null) — the miss path under test.
 *  Counts write attempts so "nothing is written" is a real check. */
function makeMissStore() {
  const writes: string[] = [];
  const store = {
    async get() { return null; },
    async list() { return []; },
    async create(opts: { envelope: RecordEnvelope }) { writes.push(`create:${opts.envelope.recordId}`); return { success: true, envelope: opts.envelope }; },
    async update(opts: { envelope: RecordEnvelope }) { writes.push(`update:${opts.envelope.recordId}`); return { success: true, envelope: opts.envelope }; },
    async delete() { writes.push('delete'); return { success: true }; },
  };
  return { store: store as unknown as RecordStore, writes };
}

/** Store stub holding the given envelopes — the store is now the ONLY record
 *  source, so a store-backed leg needs a real record to hold. */
function makeStoreWith(records: RecordEnvelope[]) {
  const writes: string[] = [];
  const byId = new Map(records.map((r) => [r.recordId, r]));
  const store = {
    async get(recordId: string) { return byId.get(recordId) ?? null; },
    async list() { return []; },
    async create(opts: { envelope: RecordEnvelope }) { writes.push(`create:${opts.envelope.recordId}`); return { success: true, envelope: opts.envelope }; },
    async update(opts: { envelope: RecordEnvelope }) { writes.push(`update:${opts.envelope.recordId}`); return { success: true, envelope: opts.envelope }; },
    async delete() { writes.push('delete'); return { success: true }; },
  };
  return { store: store as unknown as RecordStore, writes };
}

function getRecord(handlers: ReturnType<typeof createRecordHandlers>, id: string) {
  const reply = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
  } as unknown as FastifyReply;
  const request = { params: { id }, query: {} } as unknown as FastifyRequest;
  return handlers.getRecord(request, reply).then((body) => ({ body, status: reply.statusCode }));
}

/** A real store envelope: payload and meta are the store's own, so an
 *  identity check distinguishes the store's record from a re-synthesis. */
function makeStoredEnvelope(): RecordEnvelope {
  return {
    recordId: STORE_BACKED_RECORD_ID,
    schemaId: SCHEMA_ID,
    payload: { kind: 'labware-definition', id: '96-well-plate', display_name: 'Generic 96-Well Plate' },
    meta: { kind: 'labware-definition', path: STORE_META_PATH },
  };
}

describe('GET /records/:id — a store miss resolves a registry entry only far enough to reach a stored recordId', () => {
  it('a registry entry with no store record is 404 NOT_FOUND, never a record-shaped 200', async () => {
    const { store, writes } = makeMissStore();
    const { body, status } = await getRecord(createRecordHandlers(store), REGISTRY_ONLY_RECORD_ID);

    expect(status).toBe(404);
    expect(body).toEqual({ error: 'NOT_FOUND', message: `Record not found: ${REGISTRY_ONLY_RECORD_ID}` });
    expect(writes).toEqual([]); // read-only: nothing written to the store
  });

  it('the bare definition id of a registry-only entry is 404 (vocabulary is not stock)', async () => {
    const { store, writes } = makeMissStore();
    const { body, status } = await getRecord(createRecordHandlers(store), '96-well-deepwell-plate');

    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('NOT_FOUND');
    expect(writes).toEqual([]);
  });

  it('a declared alias of a registry-only entry is 404 (an alias of vocabulary is still vocabulary)', async () => {
    const { store, writes } = makeMissStore();
    const { body, status } = await getRecord(createRecordHandlers(store), 'deepwell_96');

    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('NOT_FOUND');
    expect(writes).toEqual([]);
  });

  it("a store-backed id returns the store's OWN envelope (object identity, not a re-synthesis)", async () => {
    const stored = makeStoredEnvelope();
    const { store, writes } = makeStoreWith([stored]);
    const { body, status } = await getRecord(createRecordHandlers(store), STORE_BACKED_RECORD_ID);

    expect(status).toBe(200);
    const record = (body as { record: RecordEnvelope }).record;
    expect(record).toBe(stored); // a re-synthesized envelope is a different object and fails this
    expect(writes).toEqual([]); // read-only, asserted after the 200 too
  });

  it('the bare definition id of a store-backed entry resolves to that SAME real record', async () => {
    const stored = makeStoredEnvelope();
    const { store, writes } = makeStoreWith([stored]);
    const { body, status } = await getRecord(createRecordHandlers(store), '96-well-plate');

    expect(status).toBe(200);
    const record = (body as { record: RecordEnvelope }).record;
    expect(record).toBe(stored);
    expect(record.recordId).toBe(STORE_BACKED_RECORD_ID);
    expect(writes).toEqual([]);
  });

  it("a declared alias of a store-backed entry resolves to that SAME real record with the store's own meta", async () => {
    const stored = makeStoredEnvelope();
    const { store, writes } = makeStoreWith([stored]);
    const { body, status } = await getRecord(createRecordHandlers(store), 'plate_96');

    expect(status).toBe(200);
    const record = (body as { record: RecordEnvelope }).record;
    expect(record).toBe(stored);
    expect(record.recordId).toBe(STORE_BACKED_RECORD_ID);
    // The payload carries the STORE record's own meta — not a registry path.
    expect(record.meta?.path).toBe(STORE_META_PATH);
    expect(record.meta?.path).not.toBe('schema/registry/labware-definitions');
    expect(writes).toEqual([]);
  });

  it('an id neither source has stays 404 NOT_FOUND (no blanket fallback)', async () => {
    const { store, writes } = makeMissStore();
    const { body, status } = await getRecord(createRecordHandlers(store), 'lbw-def-does-not-exist');

    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('NOT_FOUND');
    expect(writes).toEqual([]);
  });

  it('the union-dedupe record:<id> shape is not an identity: 404', async () => {
    const { store, writes } = makeMissStore();
    const { body, status } = await getRecord(createRecordHandlers(store), `record:${REGISTRY_ONLY_RECORD_ID}`);

    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('NOT_FOUND');
    expect(writes).toEqual([]);
  });
});

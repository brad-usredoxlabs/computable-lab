/**
 * L2-P1-ANSWERCHANNEL-1 — the store-MISS path of GET /records/:id must
 * open the labware-definition identity the definition-union SEARCH
 * offers. The search offers the vendored registry `recordId`
 * (labwareDefinitionSearch.ts toHit); the record store does not hold
 * it, so a miss falls back to the registry and renders it read-only.
 * A miss where neither source has the id stays 404. Nothing is written.
 */
import { describe, it, expect } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import { createRecordHandlers } from './RecordHandlers.js';

const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml';
const REGISTRY_RECORD_ID = 'lbw-def-generic-96-well-deepwell-plate';

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

function getRecord(handlers: ReturnType<typeof createRecordHandlers>, id: string) {
  const reply = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
  } as unknown as FastifyReply;
  const request = { params: { id }, query: {} } as unknown as FastifyRequest;
  return handlers.getRecord(request, reply).then((body) => ({ body, status: reply.statusCode }));
}

describe('GET /records/:id — labware-definition registry fallback on a store miss', () => {
  it('resolves the registry recordId the search offers: 200 with the registry YAML rendered read-only', async () => {
    const { store, writes } = makeMissStore();
    const { body, status } = await getRecord(createRecordHandlers(store), REGISTRY_RECORD_ID);

    expect(status).toBe(200);
    const record = (body as { record: RecordEnvelope }).record;
    expect(record.recordId).toBe(REGISTRY_RECORD_ID);
    expect(record.schemaId).toBe(SCHEMA_ID);
    expect((record.payload as { display_name: string }).display_name).toBe('Generic 96-Well Deep Well Plate');
    expect(writes).toEqual([]); // read-only: nothing written to the store
  });

  it('resolves the bare definition id to the SAME registry recordId', async () => {
    const { store } = makeMissStore();
    const { body, status } = await getRecord(createRecordHandlers(store), '96-well-deepwell-plate');

    expect(status).toBe(200);
    expect((body as { record: RecordEnvelope }).record.recordId).toBe(REGISTRY_RECORD_ID);
  });

  it('an id neither source has stays 404 NOT_FOUND (no blanket fallback)', async () => {
    const { store } = makeMissStore();
    const { body, status } = await getRecord(createRecordHandlers(store), 'lbw-def-does-not-exist');

    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('NOT_FOUND');
  });

  it('the union-dedupe record:<id> shape is not an identity: 404', async () => {
    const { store } = makeMissStore();
    const { body, status } = await getRecord(createRecordHandlers(store), `record:${REGISTRY_RECORD_ID}`);

    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe('NOT_FOUND');
  });
});

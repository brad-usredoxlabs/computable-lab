// MINT-IDEM-1 RED probe: call the UNMODIFIED handler twice with the same label
// and print the second response — expected: the 422 VALIDATION_FAILED
// "Record already exists" symptom (decision V2/V4).
import { createVocabHandlers } from '../../../server/src/api/handlers/VocabHandlers.js';
import type { RecordEnvelope, RecordStore } from '../../../server/src/store/types.js';

const byId = new Map<string, RecordEnvelope>();
const store = {
  async get(id: string) { return byId.get(id) ?? null; },
  async list() { return [...byId.values()]; },
  async create(opts: { envelope: RecordEnvelope }) {
    if (byId.has(opts.envelope.recordId)) {
      return { success: false, error: `Record already exists: ${opts.envelope.recordId}` };
    }
    byId.set(opts.envelope.recordId, opts.envelope);
    return { success: true, envelope: opts.envelope };
  },
} as unknown as RecordStore;

const handlers = createVocabHandlers(store);
let status = 200;
const reply = { status: (c: number) => { status = c; return reply; } } as never;

const body = { refKind: 'material', label: 'idem probe label' };
const r1 = await handlers.mintTerm({ body } as never, reply);
console.log('mint #1 status=', status, 'response=', JSON.stringify(r1));
status = 200;
const r2 = await handlers.mintTerm({ body } as never, reply);
console.log('mint #2 status=', status, 'response=', JSON.stringify(r2));
console.log('store size =', byId.size);

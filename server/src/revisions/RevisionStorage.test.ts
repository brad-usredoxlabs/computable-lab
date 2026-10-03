import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { acceptProtocolGraph, pinRunProtocol } from './ProtocolUseService.js';
import { RecordRevisionService, contentHash, revisionRef, token } from './RecordRevisionService.js';

const schemaId = (kind: string) => `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`;
describe('revision schemas and durable storage', () => {
  let root: string;
  let store: ReturnType<typeof createRecordStore>;
  let validator: ReturnType<typeof createValidator>;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'protocol-revisions-'));
    const loaded = await loadAllSchemas({ basePath: fileURLToPath(new URL('../../../schema', import.meta.url)), recursive: true });
    const registry = createSchemaRegistry(); registry.addSchemas(loaded.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) { const entry = registry.getById(id); if (entry) validator.addSchema(entry.schema as never, id); }
    store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, new LintEngine());
  });
  afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });
  it('persists protocol snapshots through YAML and protects them even with validation bypassed', async () => {
    const payload = { kind: 'protocol', recordId: 'PRT-TEST', title: 'Zymo soil', version: '0.1.1', state: 'draft', createdBy: 'USR-BRAD', source: { type: 'vendor', ref: { kind: 'record', type: 'vendor-pdf', id: 'VPDF-TEST' }, ingestion: { sha256: 'abc', candidateId: 'zymo', branches: [{ axisId: 'lysis', choiceId: 'rack', label: 'Lysis rack' }] } }, steps: [{ kind: 'other', stepId: 's1', label: 'Lysis', ordinal: 1, description: 'Add 550 µl lysis solution.' }] };
    const created = await store.create({ envelope: { recordId: payload.recordId, schemaId: schemaId('protocol'), payload } });
    expect(created, JSON.stringify(created)).toMatchObject({ success: true });
    const source = (await store.get(payload.recordId))!;
    expect(token(created.envelope!)).toBe(token(source));
    const revision = await new RecordRevisionService(store).freezeProtocol(source.recordId, 'USR-BRAD', token(source));
    const loaded = await new RecordRevisionService(store).read(revisionRef(revision.recordId));
    expect(loaded.payload.snapshot).toEqual({ ...payload, version: '1.0.0' });
    expect(loaded.payload.version).toBe('1.0.0');
    expect((await store.update({ envelope: { ...loaded, payload: { ...loaded.payload, snapshot: {} } }, skipValidation: true, skipLint: true })).error).toContain('APPEND_ONLY');
    expect((await store.delete({ recordId: loaded.recordId })).error).toContain('APPEND_ONLY');
    const sig = { kind: 'signature', recordId: 'SIG-TEST', signedBy: 'USR-BRAD', action: 'approved', meaning: { code: 'approved' }, subject: { recordId: source.recordId, revisionRef: revisionRef(loaded.recordId), contentHash: loaded.payload.contentHash }, signedAt: new Date().toISOString(), authentication: { method: 'password_reauthentication' } };
    expect(validator.validate(sig, schemaId('signature'))).toMatchObject({ valid: true });
    expect(validator.validate({ ...payload, lifecycleId: 'document-controlled-signing', reviewerRef: { kind: 'record', type: 'user', id: 'USR-REVIEWER' } }, schemaId('protocol'))).toMatchObject({ valid: true });
  });
  it('accepts a graph against the exact saved source and keeps its version after later edits', async () => {
    const protocol = (await store.get('PRT-TEST'))!;
    const payload = { kind: 'event-graph', id: 'EVG-TEST', events: [{ eventId: 'E1', event_type: 'other', details: { description: 'Add lysis solution' } }], labwares: [], protocolSource: { recordId: protocol.recordId, sourceToken: token(protocol), contentHash: contentHash(protocol.payload) } };
    const created = await store.create({ envelope: { recordId: 'EVG-TEST', schemaId: schemaId('event-graph'), payload } });
    expect(created, JSON.stringify(created)).toMatchObject({ success: true });
    const accepted = await acceptProtocolGraph(store, 'EVG-TEST', 'USR-BRAD', token(created.envelope!)!);
    expect(accepted.revision.payload.version).toBe('1.0.0');
    const current = (await store.get('PRT-TEST'))!;
    const changed = await store.update({ envelope: { ...current, payload: { ...(current.payload as object), notes: 'Changed next version' } }, expectedSha: token(current)! });
    expect(changed.success).toBe(true);
    const run = { recordId: 'RUN-TEST', schemaId: 'run', payload: { kind: 'run', plannedEventGraphId: 'EVG-TEST' } };
    expect(await pinRunProtocol(store, run, 'USR-BRAD')).toEqual({ protocolVersion: '1.0.0', protocolRevisionRef: revisionRef(accepted.revision.recordId) });
    const latest = (await store.get('PRT-TEST'))!;
    const concurrent = await Promise.all(['A', 'B'].map(title => store.update({ envelope: { ...latest, payload: { ...(latest.payload as object), title } }, expectedSha: token(latest)! })));
    expect(concurrent.filter(result => result.success)).toHaveLength(1);
  });
  it('rejects controlled content edits below the HTTP layer', async () => {
    const payload = { kind: 'controlled-document', id: 'DOC-TEST', title: 'SOP', docType: 'sop', lifecycleId: 'document-controlled-signing', state: 'effective', body: 'Original' };
    const created = await store.create({ envelope: { recordId: payload.id, schemaId: schemaId('controlled-document'), payload } });
    expect(created, JSON.stringify(created)).toMatchObject({ success: true });
    expect((await store.update({ envelope: { ...created.envelope!, payload: { ...payload, body: 'Changed' } }, skipValidation: true })).error).toContain('CONTROLLED_RECORD_LOCKED');
  });
});

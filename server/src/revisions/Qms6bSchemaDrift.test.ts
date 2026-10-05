/**
 * QMS-6B-FIX-A — RED tests for the two schema/code drifts merge 81454a4e introduced.
 *
 * The 2026-10-03 revision/signature-integrity contract (docs/qms-manual-testing-
 * cheatsheet.md §"Protocol revisions and signature integrity", delta
 * ~/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md D3/D6) makes
 * the HANDLERS the contract truth:
 *
 *   1. A minted signature carries `subject.revisionRef` + `subject.contentHash`
 *      (SignatureHandlers.ts signedRevision spread). The browser gate proved every
 *      POST /api/signatures dies at 422 because schema/governance/signature.schema.yaml
 *      declares subject with additionalProperties:false WITHOUT those two fields.
 *   2. POST /records/:id/draft-copy injects `derivedFromRevisionRef` into the new
 *      payload (RecordHandlers.ts draftCopy). The gate proved every call dies at 422
 *      because protocol / controlled-document schemas reject it via
 *      unevaluatedProperties:false.
 *
 * These tests reproduce both 422s end-to-end through the REAL validation authority:
 * the full YAML schema tree is loaded exactly as server.ts does, a real
 * RecordStoreImpl (Ajv + lint, local-repo tmpdir) stores the records, and the real
 * handlers mint/copy. Harness style follows RevisionStorage.test.ts /
 * ProtocolProseFieldsSchema.test.ts. Business rules live in YAML — the assertions
 * here only replay what the handlers inject.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyReply } from 'fastify';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { contentHash } from './RecordRevisionService.js';
import { createSignatureHandlers } from '../api/handlers/SignatureHandlers.js';
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js';
import { hashPassword } from '../security/CredentialStore.js';

const schemaId = (kind: string) => `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`;

function makeReply() {
  let statusValue = 200;
  const reply: any = {
    status(code: number) { statusValue = code; return reply; },
    code(code: number) { statusValue = code; return reply; },
    send(value: unknown) { return value; },
  };
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue });
  return reply;
}

const security = { identityService: { resolveRequestUser: async () => ({ userId: 'USR-REVIEWER', isSystem: false }) } } as any;

const DOC_PAYLOAD = {
  kind: 'controlled-document', id: 'DOC-DRIFT', title: 'Drift SOP',
  state: 'approved', lifecycleId: 'document-controlled-signing', docType: 'sop',
  body: '<p>Mix gently.</p>',
  authorRef: { kind: 'record', type: 'user', id: 'USR-AUTHOR' },
};
const PROTOCOL_PAYLOAD = {
  kind: 'protocol', recordId: 'PRT-DRIFT', title: 'Drift protocol',
  state: 'approved', version: '1.0.0',
  steps: [{ kind: 'other', stepId: 's1', label: 'Step', ordinal: 1, description: 'Do the thing.' }],
};

let root: string;
let store: ReturnType<typeof createRecordStore>;
let validator: ReturnType<typeof createValidator>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'qms6b-drift-'));
  const loaded = await loadAllSchemas({ basePath: fileURLToPath(new URL('../../../schema', import.meta.url)), recursive: true });
  const registry = createSchemaRegistry();
  registry.addSchemas(loaded.entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }
  store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, new LintEngine());
  for (const payload of [DOC_PAYLOAD, PROTOCOL_PAYLOAD]) {
    const kind = String((payload as { kind: string }).kind);
    const id = String((payload as Record<string, unknown>).id ?? (payload as Record<string, unknown>).recordId);
    const created = await store.create({ envelope: { recordId: id, schemaId: schemaId(kind), payload } });
    expect(created, JSON.stringify(created)).toMatchObject({ success: true });
  }
});
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe('defect 1 — minted signature subject carries revisionRef + contentHash', () => {
  it('schema layer: the subject shape the handler builds validates against signature.schema.yaml', () => {
    const subject = {
      recordId: 'DOC-DRIFT',
      revisionRef: { kind: 'record', type: 'record-revision', id: `REV-${'A'.repeat(32)}` },
      contentHash: 'a'.repeat(64),
      lifecycleId: 'document-controlled-signing',
      targetState: 'approved',
    };
    const result = validator.validate({
      kind: 'signature', recordId: 'SIG-DRIFT0000000001', signedBy: 'USR-REVIEWER', action: 'approved',
      meaning: { code: 'approved' }, subject,
      signedAt: new Date().toISOString(), authentication: { method: 'password_reauthentication' },
    }, schemaId('signature'));
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('end-to-end: POST /signatures mints 2xx and the stored signature round-trips the signed revision', async () => {
    const handlers = createSignatureHandlers({
      store,
      credentialStore: { getVerifier: async () => hashPassword('correct-horse') } as never,
      identityService: security.identityService,
    });
    const reply = makeReply();
    const result: any = await handlers.mintSignature({
      body: {
        subject: { recordId: DOC_PAYLOAD.id, lifecycleId: DOC_PAYLOAD.lifecycleId, targetState: 'approved' },
        action: 'approved',
        statement: 'I approve this SOP',
        password: 'correct-horse',
      },
      headers: {},
    } as never, reply as FastifyReply);

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(reply.statusValue).toBe(200);

    const stored = await store.get(result.signatureId);
    expect(stored).not.toBeNull();
    const subject = (stored!.payload as Record<string, unknown>).subject as Record<string, unknown>;
    expect(subject.recordId).toBe(DOC_PAYLOAD.id);
    expect(subject.revisionRef).toMatchObject({ kind: 'record', type: 'record-revision', id: expect.stringMatching(/^REV-[A-F0-9]+$/) });
    expect(subject.contentHash).toBe(contentHash(DOC_PAYLOAD));
    // The snapshot the signature points at exists and matches the content hash.
    const revision = await store.get((subject.revisionRef as { id: string }).id);
    expect(revision).not.toBeNull();
    expect(contentHash((revision!.payload as Record<string, unknown>).snapshot)).toBe(subject.contentHash);
    // The mint response echoes the snapshot binding (UI must display snapshot ID/hash).
    expect(result.subject.revisionRef).toEqual(subject.revisionRef);
    expect(result.subject.contentHash).toBe(subject.contentHash);
  });
});

describe('defect 2 — draft-copy payload carries derivedFromRevisionRef', () => {
  const draftCopy = async (id: string) => {
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, security);
    const reply = makeReply();
    const result: any = await handlers.draftCopy({ params: { id }, body: {}, headers: {} } as never, reply as FastifyReply);
    return { reply, result };
  };

  it('protocol: 2xx, copy is a fresh draft pinned to the source revision', async () => {
    const { reply, result } = await draftCopy(PROTOCOL_PAYLOAD.recordId);
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(reply.statusValue).toBe(200);
    const copy = await store.get(result.record.recordId);
    expect(copy).not.toBeNull();
    const payload = copy!.payload as Record<string, unknown>;
    expect(payload.state).toBe('draft');
    expect(payload.version).toBe('0.1.1');
    expect(payload.createdBy).toBe('USR-REVIEWER');
    expect(payload.derivedFromRevisionRef).toMatchObject({ kind: 'record', type: 'record-revision', id: expect.stringMatching(/^REV-[A-F0-9]+$/) });
    expect(payload.reviewerRef).toBeUndefined();
    expect(payload.approverRef).toBeUndefined();
    expect(payload.signatureRefs).toBeUndefined();
    // The revision the copy derives from is a real immutable snapshot of the source.
    const revision = await store.get((payload.derivedFromRevisionRef as { id: string }).id);
    expect(revision).not.toBeNull();
    expect((revision!.payload as Record<string, unknown>).sourceRecordId).toBe(PROTOCOL_PAYLOAD.recordId);
    expect((revision!.payload as Record<string, unknown>).purpose).toBe('derivation');
  });

  it('controlled-document: 2xx, copy carries derivedFromRevisionRef and no inherited role/signature assignments', async () => {
    const { reply, result } = await draftCopy(DOC_PAYLOAD.id);
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(reply.statusValue).toBe(200);
    const copy = await store.get(result.record.recordId);
    expect(copy).not.toBeNull();
    const payload = copy!.payload as Record<string, unknown>;
    expect(String(payload.id)).toMatch(/^DOC-/);
    expect(payload.state).toBe('draft');
    expect(payload.derivedFromRevisionRef).toMatchObject({ kind: 'record', type: 'record-revision', id: expect.stringMatching(/^REV-[A-F0-9]+$/) });
    expect(payload.authorRef).toBeUndefined();
    expect(payload.reviewerRef).toBeUndefined();
    expect(payload.approverRef).toBeUndefined();
    expect(payload.signatureRefs).toBeUndefined();
  });
});

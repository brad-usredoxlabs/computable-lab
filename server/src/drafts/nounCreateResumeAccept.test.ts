/**
 * L2-NOUN-CREATION-JOURNEY-1 (unit u2resume-v2) — the RETURN half of the
 * declared noun-create journey goes LIVE at the governed draft-accept seam.
 *
 * When a draft whose input declares the journey link (checkpointId + the store
 * segments + the ONE material record the parked checkpoint asked to create) is
 * accepted, the accept path — after the creation commits — resumes the parked
 * origin turn BY IDENTITY: resumeAfterMaterialCreation (the pure u1journey
 * leg) classifies the return, PendingIntentStore.resume compare-and-set flips
 * the checkpoint to 'resumed' exactly once, and the accept result carries the
 * MaterialReference delta {committedRecordId, committedRevision} so the origin
 * request recompiles from the committed record's identity. A refusal
 * ('already-resumed', version_conflict, …) is NOTED on the result, never
 * thrown out of accept.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import { object, token } from '../revisions/RecordRevisionService.js';
import type { AppContext } from '../server.js';
import { FormDraftService } from './FormDraftService.js';
import { PendingIntentStore } from '../ai-threads/PendingIntentStore.js';
import { buildNounCreateCheckpoint } from '../compiler/journey/nounCreateResume.js';

let ctx: AppContext; let root: string; let service: FormDraftService; let threadsRoot: string;
const ENDPOINT = 'agent-chat';
const THREAD = 'thread-noun-create';
const VERBATIM = 'I need a FAM/QSY probe for the F prausnitzii primer pair, ready to order';
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-noun-resume-accept-'));
  threadsRoot = process.env.AI_THREADS_ROOT ?? join(root, 'var', 'ai-threads');
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: fileURLToPath(new URL('../../../schema', import.meta.url)), recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, id);
  }
  const store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, new LintEngine());
  const policyBundleService = new PolicyBundleService();
  policyBundleService.loadFromDir(fileURLToPath(new URL('../../../schema/core/policy-bundles', import.meta.url)));
  ctx = { store, validator, schemaRegistry: registry, policyBundleService, workspaceRoot: root, recordsDir: root } as AppContext;
  service = new FormDraftService(ctx, 'USR-test');
}, 30000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

const action = { operation: 'create_oligo', sequence: { label: 'FAM-QSY probe', residues: 'AATGGCATGACTGAGTCGATG', alphabet: 'dna', topology: 'linear' }, vendor: 'Thermo Fisher Scientific', modifications: [{ position: '5-prime', label: 'FAM', role: 'reporter' }, { position: '3-prime', label: 'QSY', role: 'quencher' }] };
const input = () => ({ adapter: 'sequence-authoring', intent: action });
const accept = (draft: any) => service.accept({ draftId: draft.draftId, revision: draft.revision, reviewHash: draft.reviewHash });
const checkpointFile = () => join(threadsRoot, 'USR-test', ENDPOINT, '_', `${THREAD}.checkpoint.json`);
const storeFor = () => new PendingIntentStore({ rootDir: threadsRoot, userId: 'USR-test', endpoint: ENDPOINT, threadId: THREAD });
/** Park the origin turn exactly as the journey checkpoint-creation leg does (the pure u1journey function). */
async function park(messageId: string) {
  const build = buildNounCreateCheckpoint({ threadRef: THREAD, messageId, verbatimText: VERBATIM, intentId: `INT-${messageId}`, intentRevision: '1', originSurface: 'chat', originRoute: '/chat', activeTab: 'compose', originRecordRevisions: [], slotName: 'material_noun' });
  if (!build.valid) throw new Error(build.diagnostics.map((d) => d.code).join(','));
  const saved = await storeFor().save(build.checkpoint);
  if (!saved.ok) throw new Error(saved.diagnostics.map((d) => d.code).join(','));
  return build.checkpoint;
}
/** The journey leg declares the link on the draft record (input is open in form-draft.schema.yaml; the compile request stays closed). */
async function link(draftId: string, checkpointId: string, materialRecordId: string, threadRef = THREAD) {
  const env = (await ctx.store.get(draftId))!;
  const rec = object(env.payload);
  rec.input = { ...object(rec.input), journey: { checkpointId, threadRef, endpoint: ENDPOINT, materialRecordId } };
  await ctx.store.update({ envelope: { ...env, payload: rec }, actor: 'USR-test' });
}
const materialWrite = (draft: any) => { const w = draft.writes.find((x: any) => object(x.payload).kind === 'oligo-spec'); expect(w).toBeTruthy(); return w as any; };

describe('noun-create journey return at the draft-accept seam', () => {
  it('resumes the parked checkpoint by identity and attaches the MaterialReference delta', async () => {
    const cp = await park('MSG-A');
    const draft = await service.compile(input());
    const material = materialWrite(draft);
    await link(draft.draftId, cp.checkpoint_id, String(material.recordId));
    const result: any = await accept(draft);
    expect(result.recordId).toBeTruthy();
    const note = result.journeyResume;
    expect(note?.resumed).toBe(true);
    expect(note?.checkpointId).toBe(cp.checkpoint_id);
    expect(note?.originPromptText).toBe(VERBATIM); // the origin words, verbatim — the caller recompiles THESE
    expect(note?.requireExplicitResume).toBe(true);
    const resumed = await storeFor().load(cp.checkpoint_id);
    expect(resumed?.status).toBe('resumed');
    expect(resumed?.concurrency_version).toBe(2);
    expect(resumed?.resume_receipt?.resumed_by).toBe('USR-test');
    expect(note?.receipt?.receipt_id).toBe(resumed?.resume_receipt?.receipt_id);
    // Identity at the record: the delta cites the committed record and its ACTUAL revision token.
    const committed = (await ctx.store.get(material.recordId))!;
    const entry = note.delta.entries[0];
    expect(entry.semantic_type).toBe('MaterialReference');
    expect(entry.canonical_value).toBe(`record:${material.recordId}`);
    expect(entry.source_records).toEqual([{ record_id: material.recordId, revision: token(committed) }]);
  });
  it('accepts an UNLINKED draft and changes nothing in the checkpoint store', async () => {
    const cp = await park('MSG-B');
    expect(cp.checkpoint_id).toBeTruthy();
    const before = await readFile(checkpointFile(), 'utf8');
    const draft = await service.compile(input());
    const result: any = await accept(draft);
    expect(result.recordId).toBeTruthy();
    expect(result.journeyResume).toBeUndefined();
    expect(await readFile(checkpointFile(), 'utf8')).toBe(before); // byte-identical document
  });
  it('notes the already-resumed refusal and still accepts when the checkpoint is already resumed (one committed effect)', async () => {
    const cp = await park('MSG-C');
    const first = await storeFor().resume(cp.checkpoint_id, { expectedVersion: 1, receiptId: 'RESUME-first', resumedAt: '2026-11-16T20:00:00.000Z', resumedBy: 'USR-other', outcome: 'concurrent resume won' });
    expect(first.ok).toBe(true);
    const afterFirst = await readFile(checkpointFile(), 'utf8');
    const draft = await service.compile(input());
    const material = materialWrite(draft);
    await link(draft.draftId, cp.checkpoint_id, String(material.recordId));
    const result: any = await accept(draft);
    expect(result.recordId).toBeTruthy(); // accept still succeeds
    const note = result.journeyResume;
    expect(note?.resumed).toBe(false);
    expect(note?.refusal?.code).toBe('already-resumed');
    expect(await readFile(checkpointFile(), 'utf8')).toBe(afterFirst); // the first resume's receipt stays authoritative
    const doc = await storeFor().load(cp.checkpoint_id);
    expect(doc?.resume_receipt?.resumed_by).toBe('USR-other');
    expect(doc?.concurrency_version).toBe(2);
  });
  it('never throws a resume failure out of accept', async () => {
    await park('MSG-D');
    const draft = await service.compile(input());
    const material = materialWrite(draft);
    // A thread segment outside the store's id alphabet makes the store constructor throw — the seam must swallow it.
    await link(draft.draftId, 'cp-journey-noun-create:MSG-D', String(material.recordId), 'bad thread!');
    const result: any = await accept(draft);
    expect(result.recordId).toBeTruthy();
    expect(result.journeyResume?.resumed).toBe(false);
    expect(result.journeyResume?.refusal?.code).toBe('resume-error');
  });
});

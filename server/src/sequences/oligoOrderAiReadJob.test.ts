/**
 * OLIGO-AI-3 — the AI read attaches to the EXISTING job (spec §4/§9, plan Task 6).
 *
 * Structural RED: `aiReadOligoOrder` / `OLIGO_AI_READ_PRODUCER` are absent from
 * server/src/sequences/oligoOrder.ts. Stub client ONLY — zero model calls, zero
 * network. The arms pin:
 *  (1) provenance on the PERSISTED RECORD via ctx.store.get (a response-echo
 *      assertion would be vacuous): payload.payload.extractedBy === 'ai-draft'
 *      and payload.payload.model === the injected model;
 *  (2) the job's REAL bundle_ref (never the plan snippet's fabricated bundle);
 *  (3) idempotent repeat — no readAt, so an identical second read is
 *      content-identical and returns the prior records without duplicates;
 *  (4) a genuinely different second read → the honest 409 text, without
 *      half-writing the batch twice;
 *  (5) empty excerpt → the honest local-OCR message;
 *  (6) draft sourceQuote zipped index-wise onto the candidate payload (OQ2);
 *  (7) AI_READ_REVIEW names the model; AI_READ_PARTIAL when the draft declares
 *      more rows than were produced;
 *  (8) deterministic candidates survive the AI read untouched (no substitution);
 *  (9) the model is forwarded verbatim to the client — no default, no literal.
 * Harness mirrors SequenceService.test.ts:16-24 (mkdtemp + recursive
 * loadAllSchemas + createRecordStore + fake AppContext).
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import type { AppContext } from '../server.js';
import { object } from '../revisions/RecordRevisionService.js';
import type { CompletionRequest } from '../ai/types.js';
import { OLIGO_AI_READ_PRODUCER, aiReadOligoOrder, ingestOligoOrder } from './oligoOrder.js';
import type { OligoAiReadClient } from './oligoOrderAiRead.js';

let ctx: AppContext; let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-oligo-ai3-job-'));
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: fileURLToPath(new URL('../../../schema', import.meta.url)), recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) { const e = registry.getById(id); if (e) validator.addSchema(e.schema, id); }
  const store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, new LintEngine());
  ctx = { store, validator, schemaRegistry: registry, workspaceRoot: root, recordsDir: root } as AppContext;
}, 30000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

const ORDER_TEXT = "Name: Probe Alpha\nSequence: 5'-ACGT ACGT-3'\nName: Probe Beta\nSequence: TTTT ACGC\n";

// Draft equivalent of the ingested order text: same names, same bases, quotes
// verbatim from ORDER_TEXT. declaredRowCount matches so AI_READ_PARTIAL stays
// silent unless a test raises the declared count.
const draftRows = (sequenceBeta = 'TTTT ACGC') => ({
  kind: 'oligo-order-draft' as const,
  declaredRowCount: 2,
  rows: [
    { name: 'Probe Alpha', sequence: 'ACGT ACGT', sourceQuote: "Name: Probe Alpha Sequence: 5'-ACGT ACGT-3'" },
    { name: 'Probe Beta', sequence: sequenceBeta, sourceQuote: 'Name: Probe Beta Sequence: TTTT ACGC' },
  ],
});

function stubClient(respond: (callIndex: number) => string) {
  const calls: CompletionRequest[] = [];
  const llmClient: OligoAiReadClient = {
    complete: async (req) => {
      const content = respond(calls.length);
      calls.push(req);
      return { choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] };
    },
  };
  return { calls, llmClient };
}

async function freshJob() {
  return ingestOligoOrder(ctx, 'USR-test', 'order.txt', Buffer.from(ORDER_TEXT));
}
async function candidateCount() { return (await ctx.store.list({ kind: 'ingestion-candidate', limit: 10000 })).length; }

describe('oligo AI read job wiring (aiReadOligoOrder)', () => {
  it('attaches AI rows to the SAME job and the job\'s REAL bundle, with provenance on the persisted record', async () => {
    const job = await freshJob();
    const deterministicCount = await candidateCount();
    const { calls, llmClient } = stubClient(() => JSON.stringify(draftRows()));
    const result = await aiReadOligoOrder(ctx, 'USR-test', job.jobId, { llmClient, model: 'stub-model' });

    expect(result.jobId).toBe(job.jobId);
    expect(result.candidates).toHaveLength(2);
    // The model is forwarded verbatim — the stub saw exactly the injected string.
    expect(calls[0]?.model).toBe('stub-model');

    const jobEnv = await ctx.store.get(job.jobId);
    const bundleId = String(object(object(jobEnv?.payload).bundle_refs)[0]?.id ?? '');
    expect(bundleId).toBeTruthy();

    for (const candidate of result.candidates) {
      // Response echo carries provenance...
      expect(candidate.extractedBy).toBe(OLIGO_AI_READ_PRODUCER);
      expect(candidate.model).toBe('stub-model');
      // ...but the authority is the PERSISTED record, not the echo.
      const env = await ctx.store.get(candidate.recordId);
      expect(env, `candidate record ${candidate.recordId} was not persisted`).not.toBeNull();
      const inner = object(object(env?.payload).payload);
      expect(inner.extractedBy).toBe(OLIGO_AI_READ_PRODUCER);
      expect(inner.model).toBe('stub-model');
      // Bundle fidelity: the candidate points at the job's existing bundle,
      // not a fabricated { bundleType:'other' } stand-in.
      expect(object(object(env?.payload).bundle_ref).id).toBe(bundleId);
      expect(object(object(env?.payload).bundle_ref).type).toBe('ingestion-candidate-bundle');
      expect(object(object(env?.payload).job_ref).id).toBe(job.jobId);
      expect(object(env?.payload).candidate_type).toBe('oligo');
      expect(object(env?.payload).status).toBe('needs_review');
    }
    // No substitution: deterministic candidates remain side by side.
    expect(await candidateCount()).toBe(deterministicCount + 2);
  });

  it('zips the draft sourceQuote index-wise onto the candidate payload (OQ2)', async () => {
    const job = await freshJob();
    const { llmClient } = stubClient(() => JSON.stringify(draftRows()));
    const result = await aiReadOligoOrder(ctx, 'USR-test', job.jobId, { llmClient, model: 'stub-model' });
    const quotes = result.candidates.map((c: { sourceQuote?: string }) => c.sourceQuote);
    expect(quotes).toEqual([
      "Name: Probe Alpha Sequence: 5'-ACGT ACGT-3'",
      'Name: Probe Beta Sequence: TTTT ACGC',
    ]);
    const env = await ctx.store.get(result.candidates[1]!.recordId);
    expect(object(object(env?.payload).payload).sourceQuote).toBe('Name: Probe Beta Sequence: TTTT ACGC');
  });

  it('reports AI_READ_REVIEW naming the settings model, and AI_READ_PARTIAL when the draft declares more rows than it produced', async () => {
    const job = await freshJob();
    const { llmClient } = stubClient(() => JSON.stringify(draftRows()));
    const result = await aiReadOligoOrder(ctx, 'USR-test', job.jobId, { llmClient, model: 'stub-model' });
    const review = result.diagnostics.find((d: { code: string }) => d.code === 'AI_READ_REVIEW');
    expect(review, 'AI_READ_REVIEW diagnostic missing').toBeDefined();
    expect(review!.message).toContain('stub-model');
    expect(result.diagnostics.some((d: { code: string }) => d.code === 'AI_READ_PARTIAL')).toBe(false);

    const job2 = await freshJob();
    const overDeclaring = { ...draftRows(), declaredRowCount: 5 };
    const result2 = await aiReadOligoOrder(ctx, 'USR-test', job2.jobId, { llmClient: stubClient(() => JSON.stringify(overDeclaring)).llmClient, model: 'stub-model' });
    expect(result2.diagnostics.some((d: { code: string }) => d.code === 'AI_READ_PARTIAL')).toBe(true);
  });

  it('is idempotent: an identical second read returns the same records without stacking duplicates (no readAt)', async () => {
    const job = await freshJob();
    const before = await candidateCount();
    const { llmClient } = stubClient(() => JSON.stringify(draftRows()));
    const first = await aiReadOligoOrder(ctx, 'USR-test', job.jobId, { llmClient, model: 'stub-model' });
    const second = await aiReadOligoOrder(ctx, 'USR-test', job.jobId, { llmClient, model: 'stub-model' });
    expect(second.candidates.map((c: { recordId: string }) => c.recordId)).toEqual(first.candidates.map((c: { recordId: string }) => c.recordId));
    expect(await candidateCount()).toBe(before + 2);
  });

  it('a second read that DISAGREES hits the honest 409 without half-writing the batch (OQ1)', async () => {
    const job = await freshJob();
    const before = await candidateCount();
    const { llmClient } = stubClient(() => JSON.stringify(draftRows()));
    const first = await aiReadOligoOrder(ctx, 'USR-test', job.jobId, { llmClient, model: 'stub-model' });
    // Same titles (row 1 identical, row 2 different bases) → compactId collides.
    const { llmClient: disagreeing } = stubClient(() => JSON.stringify(draftRows('GGGG TTTT')));
    await expect(aiReadOligoOrder(ctx, 'USR-test', job.jobId, { llmClient: disagreeing, model: 'stub-model' }))
      .rejects.toThrow(/already exists with different content/);
    // No half-write: no new candidate records, and the stored row 2 keeps the
    // first read's content.
    expect(await candidateCount()).toBe(before + 2);
    const stored = await ctx.store.get(first.candidates[1]!.recordId);
    expect(object(object(stored?.payload).payload).residues).toBe('TTTTACGC');
  });

  it('refuses honestly when no extracted text is stored (scanned PDFs need the local OCR pass first)', async () => {
    const job = await ingestOligoOrder(ctx, 'USR-test', 'empty.txt', Buffer.from(''));
    const { llmClient } = stubClient(() => JSON.stringify(draftRows()));
    await expect(aiReadOligoOrder(ctx, 'USR-test', job.jobId, { llmClient, model: 'stub-model' }))
      .rejects.toThrow(/No extracted text is stored for this document/);
  });

  it('surfaces the producer\'s honest refusal (Ajv-authoritative) as the error message', async () => {
    const job = await freshJob();
    const { calls, llmClient } = stubClient(() => 'I cannot read this document as JSON.');
    await expect(aiReadOligoOrder(ctx, 'USR-test', job.jobId, { llmClient, model: 'stub-model' }))
      .rejects.toThrow(/did not produce a valid oligo-order-draft/);
    // Exactly ONE repair retry — never a third call.
    expect(calls).toHaveLength(2);
  });

  it('rejects an unknown job with an honest message', async () => {
    const { llmClient } = stubClient(() => JSON.stringify(draftRows()));
    await expect(aiReadOligoOrder(ctx, 'USR-test', 'ING-NOPE-000000', { llmClient, model: 'stub-model' }))
      .rejects.toThrow(/ingestion job/i);
  });
});

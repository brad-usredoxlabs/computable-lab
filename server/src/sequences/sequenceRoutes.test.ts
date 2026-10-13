/**
 * OLIGO-AI-3 — the AI read route (spec §5, plan Task 7).
 *
 * Structural RED: registerSequenceRoutes takes 3 params and no
 * POST /sequences/order/:id/ai-read exists. Fastify inject inside an
 * /api-prefixed plugin (precedent: ProtocolIdeHandlers.routes.test.ts).
 * Arms:
 *  (a) no getAiDeps (settings unset) -> 503 whose BODY carries the actionable
 *      Settings sentence — a 401/422 generic shape is dishonest chrome;
 *  (b) stub deps -> 200 + candidates carrying extractedBy/model provenance,
 *      the stub client received EXACTLY the injected model string;
 *  (c) unknown job -> 422 with the honest message;
 *  (d) the GET reopen path carries AI provenance through unchanged (§15.11 —
 *      the GET spreads the inner payload; AI rows must survive reload).
 * Zero network: the model never leaves the stub.
 */
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
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
import type { CompletionRequest } from '../ai/types.js';
import { registerSequenceRoutes } from './sequenceRoutes.js';
import { ingestOligoOrder } from './oligoOrder.js';
import type { OligoAiReadClient } from './oligoOrderAiRead.js';

const ORDER_TEXT = "Name: Route Probe\nSequence: 5'-ACGT ACGT-3'\n";
const DRAFT = {
  kind: 'oligo-order-draft',
  declaredRowCount: 1,
  rows: [{ name: 'Route Probe', sequence: 'ACGT ACGT', sourceQuote: "Name: Route Probe Sequence: 5'-ACGT ACGT-3'" }],
};

function stubClient(): { llmClient: OligoAiReadClient; calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    calls,
    llmClient: {
      complete: async (req) => {
        calls.push(req);
        return { choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(DRAFT) }, finish_reason: 'stop' }] };
      },
    },
  };
}

async function buildHarness() {
  const root = await mkdtemp(join(tmpdir(), 'cl-oligo-ai3-routes-'));
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: fileURLToPath(new URL('../../../schema', import.meta.url)), recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) { const e = registry.getById(id); if (e) validator.addSchema(e.schema, id); }
  const store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, new LintEngine());
  const ctx = {
    store, validator, schemaRegistry: registry, workspaceRoot: root, recordsDir: root,
    localIdentityService: { resolveRequestUser: async () => ({ userId: 'USR-test' }) },
  } as unknown as AppContext;
  return { ctx, root };
}

describe('POST /sequences/order/:id/ai-read route', () => {
  it('503s honestly when no AI endpoint is configured — the body names Settings', async () => {
    const { ctx, root } = await buildHarness();
    const job = await ingestOligoOrder(ctx, 'USR-test', 'order.txt', Buffer.from(ORDER_TEXT));
    const app = Fastify();
    await app.register(async (instance) => { registerSequenceRoutes(instance, ctx, {} as never); });
    await app.ready();
    const response = await app.inject({ method: 'POST', url: `/api/sequences/order/${job.jobId}/ai-read`, payload: {} });
    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.message).toContain('Settings');
    await app.close(); await rm(root, { recursive: true, force: true });
  });

  it('200s with stub deps: candidates carry provenance and the stub saw the injected model verbatim', async () => {
    const { ctx, root } = await buildHarness();
    const job = await ingestOligoOrder(ctx, 'USR-test', 'order.txt', Buffer.from(ORDER_TEXT));
    const { calls, llmClient } = stubClient();
    const app = Fastify();
    await app.register(async (instance) => { registerSequenceRoutes(instance, ctx, {} as never, { getAiDeps: () => ({ llmClient, model: 'stub-model' }) }); });
    await app.ready();
    const response = await app.inject({ method: 'POST', url: `/api/sequences/order/${job.jobId}/ai-read`, payload: {} });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].extractedBy).toBe('ai-draft');
    expect(body.candidates[0].model).toBe('stub-model');
    expect(body.diagnostics.some((d: { code: string }) => d.code === 'AI_READ_REVIEW')).toBe(true);
    expect(calls[0]?.model).toBe('stub-model');
    await app.close(); await rm(root, { recursive: true, force: true });
  });

  it('422s with an honest message for an unknown job', async () => {
    const { ctx, root } = await buildHarness();
    const { llmClient } = stubClient();
    const app = Fastify();
    await app.register(async (instance) => { registerSequenceRoutes(instance, ctx, {} as never, { getAiDeps: () => ({ llmClient, model: 'stub-model' }) }); });
    await app.ready();
    const response = await app.inject({ method: 'POST', url: '/api/sequences/order/ING-NOPE-000000/ai-read', payload: {} });
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toContain('Record not found');
    await app.close(); await rm(root, { recursive: true, force: true });
  });

  it('the GET reopen path returns AI rows with provenance intact (§15.11)', async () => {
    const { ctx, root } = await buildHarness();
    const job = await ingestOligoOrder(ctx, 'USR-test', 'order.txt', Buffer.from(ORDER_TEXT));
    const { llmClient } = stubClient();
    const app = Fastify();
    await app.register(async (instance) => { registerSequenceRoutes(instance, ctx, {} as never, { getAiDeps: () => ({ llmClient, model: 'stub-model' }) }); });
    await app.ready();
    const post = await app.inject({ method: 'POST', url: `/api/sequences/order/${job.jobId}/ai-read`, payload: {} });
    expect(post.statusCode).toBe(200);
    const get = await app.inject({ method: 'GET', url: `/api/sequences/order/${job.jobId}` });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    const aiRows = body.candidates.filter((c: { extractedBy?: string }) => c.extractedBy === 'ai-draft');
    expect(aiRows).toHaveLength(1);
    expect(aiRows[0].model).toBe('stub-model');
    expect(aiRows[0].sourceQuote).toBe(DRAFT.rows[0].sourceQuote);
    // Deterministic rows survive side by side (no substitution).
    expect(body.candidates.filter((c: { extractedBy?: string }) => !c.extractedBy)).toHaveLength(1);
    await app.close(); await rm(root, { recursive: true, force: true });
  });
});

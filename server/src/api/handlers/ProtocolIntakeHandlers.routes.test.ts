/**
 * ProtocolIntakeHandlers routes — the review loop surface.
 *
 * Fast tests seed the mock store directly; one real end-to-end test ingests
 * the actual Zymo MagBead PDF into a temp workspace and drives
 * prompt -> redraft -> revision 2, proving the whole loop without network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createProtocolIntakeHandlers } from './ProtocolIntakeHandlers.js';
import {
  ProtocolIntakeService,
  PROTOCOL_DECISION_TREE_SCHEMA_ID,
  SUBGRAPH_PROPOSAL_SCHEMA_ID,
} from '../../protocol-intake/ProtocolIntakeService.js';
import type { RecordStore } from '../../store/types.js';
import type { RecordStoreImpl } from '../../store/RecordStoreImpl.js';
import type { RunChatbotCompileResult } from '../../ai/runChatbotCompile.js';

const zymoPdfPath = resolve(
  process.cwd(),
  '..',
  'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
);

function makeEnvelope(kindPayload: Record<string, unknown>, schemaId: string) {
  return {
    recordId: String(kindPayload['recordId']),
    schemaId,
    payload: kindPayload,
  };
}

function makeMockStore(seed: Array<{ recordId: string; schemaId: string; payload: Record<string, unknown> }> = []) {
  const records = new Map(seed.map((e) => [e.recordId, e]));
  const store = {
    get: vi.fn(async (recordId: string) => records.get(recordId) ?? null),
    create: vi.fn(async ({ envelope }: { envelope: { recordId: string } }) => {
      if (records.has(envelope.recordId)) return { success: false, error: `Record already exists: ${envelope.recordId}` };
      records.set(envelope.recordId, envelope as (typeof seed)[number]);
      return { success: true };
    }),
    update: vi.fn(async ({ envelope }: { envelope: { recordId: string } }) => {
      records.set(envelope.recordId, envelope as (typeof seed)[number]);
      return { success: true };
    }),
    list: vi.fn(async (filter?: { kind?: string }) =>
      [...records.values()].filter((e) => {
        if (!filter?.kind) return true;
        return (e.payload as Record<string, unknown>)['kind'] === filter.kind;
      })),
  };
  return { store: store as unknown as RecordStore, records };
}

function makeMockCtx(store: RecordStore, workspaceRoot = '/tmp') {
  return {
    schemaRegistry: {} as never,
    validator: undefined,
    lintEngine: {} as never,
    repoAdapter: {} as never,
    store,
    indexManager: {} as never,
    uiSpecLoader: {} as never,
    workspaceRoot,
    recordsDir: 'records',
    schemaDir: 'schema',
    platformRegistry: {} as never,
    lifecycleEngine: {} as never,
    policyBundleService: {} as never,
  } as unknown as Parameters<typeof createProtocolIntakeHandlers>[0];
}

const treePayload = {
  kind: 'protocol-decision-tree',
  recordId: 'PDT-route-doc',
  documentId: 'route-doc',
  axes: [{
    axisId: 'branch-axis-step-001',
    question: 'What is the DNA source?',
    choiceKey: 'branchSelection',
    origin: 'document_branch',
    conditions: [{
      id: 'branch-1',
      label: 'Bacterial DNA',
      predicate: { op: 'equals', path: '$.branchSelection.branch-axis-step-001', value: 'bacterial-dna' },
      then_stepIds: ['step-001'],
    }],
  }],
  scaleAxis: { question: 'Scale?', options: [{ level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' }] },
  status: 'proposed',
  generatedAt: '2026-09-18T00:00:00.000Z',
};

const proposalPayload = {
  kind: 'subgraph-proposal',
  recordId: 'SGP-route-doc-b0-s0',
  treeRef: { kind: 'record', id: 'PDT-route-doc', type: 'protocol-decision-tree' },
  documentId: 'route-doc',
  branchPath: [{ axisId: 'branch-axis-step-001', conditionId: 'branch-1', label: 'Bacterial DNA' }],
  scaleLevel: 'manual_tubes',
  choices: { branchSelection: { 'branch-axis-step-001': 'bacterial-dna' } },
  eventGraphRef: { kind: 'record', id: 'EVG-PDT-route-doc-b0-s0', type: 'event-graph' },
  state: 'proposed',
  revision: 1,
  generatedAt: '2026-09-18T00:00:00.000Z',
};

async function buildApp(store: RecordStore, workspaceRoot = '/tmp') {
  const handlers = createProtocolIntakeHandlers(makeMockCtx(store, workspaceRoot));
  const app = Fastify();
  await app.register((instance) => {
    instance.get('/protocol-ide/intake/trees', handlers.listTrees.bind(handlers));
    instance.get('/protocol-ide/intake/trees/:treeId', handlers.getTree.bind(handlers));
    instance.post('/protocol-ide/intake/proposals/:proposalId/prompt', handlers.setProposalPrompt.bind(handlers));
    instance.post('/protocol-ide/intake/proposals/:proposalId/redraft', handlers.redraftProposal.bind(handlers));
  }, { prefix: '/api' });
  return app;
}

const compileStub = async (): Promise<RunChatbotCompileResult> => ({
  outcome: 'complete',
  events: [{ eventId: 'evt-1', event_type: 'add_material', details: { material: 'Buffer', volume: '100 ul' } }],
  labwareAdditions: [],
  unresolvedRefs: [],
  diagnostics: [],
  terminalArtifacts: { events: [], directives: [], gaps: [] },
  passOutputs: {},
}) as RunChatbotCompileResult;

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });
afterEach(() => { globalThis.fetch = originalFetch; });

describe('GET /protocol-ide/intake/trees', () => {
  it('lists trees with proposal counts, filterable by documentId', async () => {
    const { store } = makeMockStore([
      makeEnvelope(treePayload, PROTOCOL_DECISION_TREE_SCHEMA_ID),
      makeEnvelope(proposalPayload, SUBGRAPH_PROPOSAL_SCHEMA_ID),
    ]);
    const app = await buildApp(store);
    const all = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/trees' });
    expect(all.statusCode).toBe(200);
    expect(all.json().trees).toEqual([
      expect.objectContaining({ recordId: 'PDT-route-doc', documentId: 'route-doc', axisCount: 1, proposalCount: 1, scaleLevels: ['manual_tubes'] }),
    ]);

    const filtered = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/trees?documentId=nope' });
    expect(filtered.json().trees).toEqual([]);
    const hit = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/trees?documentId=route-doc' });
    expect(hit.json().trees).toHaveLength(1);
    await app.close();
  });
});

describe('GET /protocol-ide/intake/trees/:treeId', () => {
  it('returns the tree with axes, scale axis, and all proposals', async () => {
    const { store } = makeMockStore([
      makeEnvelope(treePayload, PROTOCOL_DECISION_TREE_SCHEMA_ID),
      makeEnvelope(proposalPayload, SUBGRAPH_PROPOSAL_SCHEMA_ID),
    ]);
    const app = await buildApp(store);
    const res = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/trees/PDT-route-doc' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tree.axes[0]).toMatchObject({ question: 'What is the DNA source?' });
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0]).toMatchObject({ recordId: 'SGP-route-doc-b0-s0', state: 'proposed' });

    const missing = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/trees/PDT-absent' });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/trees/XDR-nope' });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /protocol-ide/intake/proposals/:proposalId/prompt', () => {
  it('saves the prompt and transitions state to needs_prompt', async () => {
    const { store, records } = makeMockStore([
      makeEnvelope(treePayload, PROTOCOL_DECISION_TREE_SCHEMA_ID),
      makeEnvelope(proposalPayload, SUBGRAPH_PROPOSAL_SCHEMA_ID),
    ]);
    const app = await buildApp(store);
    const res = await app.inject({
      method: 'POST',
      url: '/api/protocol-ide/intake/proposals/SGP-route-doc-b0-s0/prompt',
      payload: { prompt: 'use a deeper well plate' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().proposal).toMatchObject({ reviewPrompt: 'use a deeper well plate', state: 'needs_prompt' });
    expect((records.get('SGP-route-doc-b0-s0')!.payload as Record<string, unknown>)['state']).toBe('needs_prompt');

    const empty = await app.inject({ method: 'POST', url: '/api/protocol-ide/intake/proposals/SGP-route-doc-b0-s0/prompt', payload: {} });
    expect(empty.statusCode).toBe(400);
    const missing = await app.inject({ method: 'POST', url: '/api/protocol-ide/intake/proposals/SGP-absent/prompt', payload: { prompt: 'x' } });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /protocol-ide/intake/proposals/:proposalId/redraft', () => {
  it('refuses with 422 diagnostics when the tree has no re-extractable source', async () => {
    const { store } = makeMockStore([
      makeEnvelope(treePayload, PROTOCOL_DECISION_TREE_SCHEMA_ID),
      makeEnvelope(proposalPayload, SUBGRAPH_PROPOSAL_SCHEMA_ID),
    ]);
    const app = await buildApp(store);
    const res = await app.inject({ method: 'POST', url: '/api/protocol-ide/intake/proposals/SGP-route-doc-b0-s0/redraft' });
    expect(res.statusCode).toBe(422);
    expect(res.json().diagnostics.some((d: { code: string }) => d.code === 'candidate_source_unavailable')).toBe(true);
    await app.close();
  });

  it('end-to-end: real Zymo PDF -> tree + proposals -> prompt -> redraft rev 2', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'intake-routes-e2e-'));
    try {
      await mkdir(join(workspaceRoot, 'artifacts', 'foundry', 'pdfs'), { recursive: true });
      await copyFile(zymoPdfPath, join(workspaceRoot, 'artifacts', 'foundry', 'pdfs', 'zymo-magbead.pdf'));

      const { store, records } = makeMockStore();
      const service = new ProtocolIntakeService({
        workspaceRoot,
        store: store as unknown as RecordStoreImpl,
        compileRunner: compileStub,
        scaleOptions: [{ level: 'manual_tubes', profileId: 'execution-scale-profile/manual-tubes' }],
      });
      const ingested = await service.ingestDocument({
        artifactPath: 'artifacts/foundry/pdfs/zymo-magbead.pdf',
        documentId: 'zymo-routes',
      });
      expect(ingested.proposalRecordIds.length).toBeGreaterThan(0);

      const handlers = createProtocolIntakeHandlers(makeMockCtx(store, workspaceRoot), { compileRunner: compileStub });
      const app = Fastify();
      await app.register((instance) => {
        instance.get('/protocol-ide/intake/trees/:treeId', handlers.getTree.bind(handlers));
        instance.post('/protocol-ide/intake/proposals/:proposalId/prompt', handlers.setProposalPrompt.bind(handlers));
        instance.post('/protocol-ide/intake/proposals/:proposalId/redraft', handlers.redraftProposal.bind(handlers));
      }, { prefix: '/api' });

      const proposalId = ingested.proposalRecordIds[0]!;
      const promptRes = await app.inject({
        method: 'POST',
        url: `/api/protocol-ide/intake/proposals/${proposalId}/prompt`,
        payload: { prompt: 'reduce elution volume to 30 ul' },
      });
      expect(promptRes.statusCode).toBe(200);

      const redraftRes = await app.inject({
        method: 'POST',
        url: `/api/protocol-ide/intake/proposals/${proposalId}/redraft`,
      });
      expect(redraftRes.statusCode).toBe(200);
      expect(redraftRes.json().success).toBe(true);

      const updated = records.get(proposalId)!.payload as Record<string, unknown>;
      expect(updated['state']).toBe('redrafted');
      expect(updated['revision']).toBe(2);
      // The redrafted proposal points at a fresh revision-suffixed event graph.
      expect(String((updated['eventGraphRef'] as Record<string, unknown>)['id'])).toMatch(/-r2$/);
      // The decision block on the proposal carries the reviewer instruction.
      expect(String(updated['notes'])).toContain('reduce elution volume to 30 ul');

      const treeRes = await app.inject({ method: 'GET', url: `/api/protocol-ide/intake/trees/${ingested.treeRecordId}` });
      expect(treeRes.statusCode).toBe(200);
      // Zymo step 1 (BashingBeads volumes) must surface as a real question axis.
      const axes = treeRes.json().tree.axes as Array<Record<string, unknown>>;
      expect(axes.length).toBeGreaterThanOrEqual(1);
      expect(axes.some((a) => /bashingbead|lysis|volume/i.test(String(a['question'])))).toBe(true);
      await app.close();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 60_000);
});

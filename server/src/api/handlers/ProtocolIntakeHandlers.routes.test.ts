/**
 * ProtocolIntakeHandlers routes — the review loop surface.
 *
 * Fast tests seed the mock store directly; one real end-to-end test ingests
 * the actual Zymo MagBead PDF into a temp workspace and drives
 * prompt -> redraft -> revision 2, proving the whole loop without network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    instance.get('/protocol-ide/intake/review/:artifactId', handlers.getReviewByArtifact.bind(handlers));
    instance.post('/protocol-ide/intake/trees/:treeId/realize', handlers.realizeBranch.bind(handlers));
    instance.post('/protocol-ide/intake/proposals/:proposalId/prompt', handlers.setProposalPrompt.bind(handlers));
    instance.post('/protocol-ide/intake/proposals/:proposalId/redraft', handlers.redraftProposal.bind(handlers));
  }, { prefix: '/api' });
  return app;
}

/** A vendor-pdf artifact as the artifact store writes it (relative path + sha). */
const vendorPdfPayload = {
  kind: 'vendor-pdf',
  recordId: 'VPDF-ROUTE01',
  title: 'ZymoBIOMICS 96 MagBead DNA Kit',
  file: {
    stored_path: 'artifacts/foundry/pdfs/ZymoBIOMICS-96-MagBead-DNA-Kit.pdf',
    sha256: '257f57196f6cd7a337e5ad42d7da74f2ab2c3e1e343a41c898d76c7d085d613b',
    file_name: 'ZymoBIOMICS-96-MagBead-DNA-Kit.pdf',
  },
};

/** A tree derived from those same bytes, stored under the DOWNLOAD name. */
const shaLinkedTreePayload = {
  ...treePayload,
  recordId: 'PDT-route-sha',
  documentId: 'vendor-protocol:d4303-d4307-d4309-zymobiomics-96-dna-kit-pdf',
  sourcePdf: {
    artifactPath: '/home/brad/.computable-lab/worktrees/main/artifacts/foundry/pdfs/_d4303_d4307_d4309_zymobiomics_96_dna_kit.pdf',
    sha256: '257f57196f6cd7a337e5ad42d7da74f2ab2c3e1e343a41c898d76c7d085d613b',
  },
};

const shaLinkedProposalPayload = {
  ...proposalPayload,
  recordId: 'SGP-route-sha-b0-s0',
  treeRef: { kind: 'record', id: 'PDT-route-sha', type: 'protocol-decision-tree' },
};

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

describe('GET /protocol-ide/intake/review/:artifactId', () => {
  it('joins a vendor-pdf artifact to the tree derived from its bytes (sha256)', async () => {
    const { store } = makeMockStore([
      makeEnvelope(vendorPdfPayload, 'vendor-pdf'),
      makeEnvelope(shaLinkedTreePayload, PROTOCOL_DECISION_TREE_SCHEMA_ID),
      makeEnvelope(shaLinkedProposalPayload, SUBGRAPH_PROPOSAL_SCHEMA_ID),
    ]);
    const app = await buildApp(store);
    const res = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/review/VPDF-ROUTE01' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The stored file name differs from the tree's artifactPath — only the
    // content hash can join them, and it must report which rule matched.
    expect(body.matchVia).toBe('sha256');
    expect(body.artifact).toMatchObject({ recordId: 'VPDF-ROUTE01', title: 'ZymoBIOMICS 96 MagBead DNA Kit' });
    expect(body.tree).toMatchObject({
      recordId: 'PDT-route-sha',
      documentId: 'vendor-protocol:d4303-d4307-d4309-zymobiomics-96-dna-kit-pdf',
      axisCount: 1,
      proposalCount: 1,
    });
    expect(body.tree.axes[0]).toMatchObject({ question: 'What is the DNA source?' });
    expect(body.proposals).toHaveLength(1);
    await app.close();
  });

  it('falls back to the stored file name for trees derived before the sha was recorded', async () => {
    const legacyTree = {
      ...treePayload,
      recordId: 'PDT-route-legacy',
      sourcePdf: { artifactPath: '/w/artifacts/foundry/pdfs/ZymoBIOMICS-96-MagBead-DNA-Kit.pdf' },
    };
    const { store } = makeMockStore([
      makeEnvelope(vendorPdfPayload, 'vendor-pdf'),
      makeEnvelope(legacyTree, PROTOCOL_DECISION_TREE_SCHEMA_ID),
    ]);
    const app = await buildApp(store);
    const res = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/review/VPDF-ROUTE01' });
    expect(res.statusCode).toBe(200);
    expect(res.json().matchVia).toBe('stored_path_basename');
    expect(res.json().tree.recordId).toBe('PDT-route-legacy');
    await app.close();
  });

  it('reports the gap (and the trees it saw) instead of attaching another document', async () => {
    const { store } = makeMockStore([
      makeEnvelope(vendorPdfPayload, 'vendor-pdf'),
      makeEnvelope(treePayload, PROTOCOL_DECISION_TREE_SCHEMA_ID),
    ]);
    const app = await buildApp(store);
    const res = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/review/VPDF-ROUTE01' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'TREE_NOT_DERIVED', artifactId: 'VPDF-ROUTE01' });
    expect(res.json().treeCandidates).toEqual(['PDT-route-doc']);
    expect(res.json().message).toContain('no decision tree');
    await app.close();
  });

  it('rejects a record that is not a vendor-pdf artifact', async () => {
    const { store } = makeMockStore([makeEnvelope(treePayload, PROTOCOL_DECISION_TREE_SCHEMA_ID)]);
    const app = await buildApp(store);
    const res = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/review/PDT-route-doc' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('NOT_A_VENDOR_PDF');
    const missing = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/review/VPDF-absent' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('ARTIFACT_NOT_FOUND');
    await app.close();
  });
});

describe('GET /protocol-ide/intake/review/:artifactId — the steps the tree gates on', () => {
  it('returns the vendor candidate steps (same step ids the tree gates), with their gating questions', async () => {
    // A real workspace slice: the extractor's candidate artifact as it lands on disk.
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'cl-review-steps-'));
    try {
      const candidateDir = join(workspaceRoot, 'artifacts', 'foundry', 'protocol-candidates');
      await mkdir(candidateDir, { recursive: true });
      await writeFile(
        join(candidateDir, 'vendor-protocol-doc-1.json'),
        JSON.stringify({
          kind: 'vendor-protocol-candidate',
          source: { documentId: 'vendor-protocol:doc-1', title: 'Kit', pageCount: 3 },
          title: 'Kit',
          materials: [{ label: 'Lysis Solution' }],
          labware: [{ label: 'BashingBead Lysis Rack' }],
          equipment: [],
          steps: [
            { id: 'step-001', stepNumber: 1, sourceText: 'Add sample using the table below:', branches: ['a. rack'], provenance: { documentId: 'd', pageStart: 2 } },
            { id: 'step-002', stepNumber: 2, sourceText: 'Centrifuge.', provenance: { documentId: 'd', pageStart: 3 } },
          ],
          tables: [],
          diagnostics: [],
        }),
        'utf-8',
      );

      const { store } = makeMockStore([
        makeEnvelope({ ...vendorPdfPayload, recordId: 'VPDF-ROUTE02' }, 'vendor-pdf'),
        makeEnvelope(
          {
            ...treePayload,
            recordId: 'PDT-route-steps',
            documentId: 'vendor-protocol:doc-1',
            sourcePdf: { sha256: vendorPdfPayload.file.sha256 },
          },
          PROTOCOL_DECISION_TREE_SCHEMA_ID,
        ),
      ]);
      const app = await buildApp(store, workspaceRoot);
      const res = await app.inject({ method: 'GET', url: '/api/protocol-ide/intake/review/VPDF-ROUTE02' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.candidate.steps.map((s: { stepId: string }) => s.stepId)).toEqual(['step-001', 'step-002']);
      // step 1 carries the tree's question; step 2 is unconditional
      expect(body.candidate.steps[0].gatedByQuestions).toEqual(['What is the DNA source?']);
      expect(body.candidate.steps[1].gatedByAxisIds).toEqual([]);
      expect(body.candidate.steps[0].provenancePages).toEqual([2]);
      expect(body.candidate.roles.materials).toEqual(['Lysis Solution']);
      await app.close();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});


describe('POST /protocol-ide/intake/trees/:treeId/realize', () => {
  it('refuses an incomplete answer and names the axis that is missing', async () => {
    const { store } = makeMockStore([
      { recordId: treePayload.recordId, schemaId: PROTOCOL_DECISION_TREE_SCHEMA_ID, payload: treePayload },
    ]);
    const app = await buildApp(store);

    const res = await app.inject({
      method: 'POST',
      url: `/api/protocol-ide/intake/trees/${treePayload.recordId}/realize`,
      payload: { choices: { 'some-other-axis': 'x' } },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json() as { diagnostics: Array<{ code: string; message: string }> };
    expect(body.diagnostics[0]?.code).toBe('branch_selection_incomplete');
    expect(body.diagnostics[0]?.message).toContain('branch-axis-step-001');
    await app.close();
  });

  it('refuses a scale level the tree does not offer', async () => {
    const { store } = makeMockStore([
      { recordId: treePayload.recordId, schemaId: PROTOCOL_DECISION_TREE_SCHEMA_ID, payload: treePayload },
    ]);
    const app = await buildApp(store);

    const res = await app.inject({
      method: 'POST',
      url: `/api/protocol-ide/intake/trees/${treePayload.recordId}/realize`,
      payload: { choices: { 'branch-axis-step-001': 'branch-1' }, scaleLevel: 'space_station' },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json() as { diagnostics: Array<{ code: string; message: string }> };
    expect(body.diagnostics[0]?.code).toBe('scale_level_unknown');
    expect(body.diagnostics[0]?.message).toContain('manual_tubes');
    await app.close();
  });

  it('reuses the realization the eager pass already built instead of drafting it twice', async () => {
    const { store, records } = makeMockStore([
      { recordId: treePayload.recordId, schemaId: PROTOCOL_DECISION_TREE_SCHEMA_ID, payload: treePayload },
      { recordId: proposalPayload.recordId, schemaId: SUBGRAPH_PROPOSAL_SCHEMA_ID, payload: proposalPayload },
    ]);
    const app = await buildApp(store);
    const before = records.size;

    const res = await app.inject({
      method: 'POST',
      url: `/api/protocol-ide/intake/trees/${treePayload.recordId}/realize`,
      payload: { choices: { 'branch-axis-step-001': 'branch-1' }, scaleLevel: 'manual_tubes' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { proposalRecordIds: string[]; eventGraphRecordIds: string[]; diagnostics: Array<{ code: string }> };
    expect(body.proposalRecordIds).toEqual([proposalPayload.recordId]);
    expect(body.eventGraphRecordIds).toEqual(['EVG-PDT-route-doc-b0-s0']);
    expect(body.diagnostics.some((d) => d.code === 'proposal_exists')).toBe(true);
    expect(records.size).toBe(before);
    await app.close();
  });

  it('404s on a tree that does not exist, and 400s on a body with no answers', async () => {
    const { store } = makeMockStore([
      { recordId: treePayload.recordId, schemaId: PROTOCOL_DECISION_TREE_SCHEMA_ID, payload: treePayload },
    ]);
    const app = await buildApp(store);

    const missing = await app.inject({ method: 'POST', url: '/api/protocol-ide/intake/trees/PDT-nope/realize', payload: { choices: { a: 'b' } } });
    expect(missing.statusCode).toBe(404);

    const empty = await app.inject({ method: 'POST', url: `/api/protocol-ide/intake/trees/${treePayload.recordId}/realize`, payload: {} });
    expect(empty.statusCode).toBe(400);
    await app.close();
  });

  it('end-to-end: a CAPPED branch product still builds the branch the reviewer picked', async () => {
    // The reviewer's reported dead end: the tree asks 2 questions, the eager
    // pass caps the product, and their combination has no realization. The tree
    // is cheap; the draft is not — so it is built here, for that branch only.
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'intake-realize-'));
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
      // Cap the eager pass at ONE realization, so almost every combination is
      // missing — exactly the situation the reviewer hit.
      const ingested = await service.ingestDocument({
        artifactPath: 'artifacts/foundry/pdfs/zymo-magbead.pdf',
        documentId: 'zymo-realize',
        maxProposals: 1,
      });
      expect(ingested.proposalRecordIds).toHaveLength(1);

      const tree = records.get(ingested.treeRecordId)!.payload as {
        axes: Array<{ axisId: string; conditions: Array<{ id: string }> }>;
      };
      expect(tree.axes.length).toBeGreaterThanOrEqual(2);
      // Answer every axis with its LAST option: the deepest point of the
      // product, which the cap never reached.
      const choices: Record<string, string> = {};
      let expectedIndex = 0;
      for (const axis of tree.axes) {
        const last = axis.conditions[axis.conditions.length - 1]!;
        choices[axis.axisId] = last.id;
        expectedIndex = expectedIndex * axis.conditions.length + (axis.conditions.length - 1);
      }

      const handlers = createProtocolIntakeHandlers(makeMockCtx(store, workspaceRoot), { compileRunner: compileStub });
      const app = Fastify();
      await app.register((instance) => {
        instance.post('/protocol-ide/intake/trees/:treeId/realize', handlers.realizeBranch.bind(handlers));
      }, { prefix: '/api' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/protocol-ide/intake/trees/${ingested.treeRecordId}/realize`,
        payload: { choices },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { success: boolean; proposalRecordIds: string[] };
      expect(body.success).toBe(true);
      expect(body.proposalRecordIds).toHaveLength(1);
      // The id is the one the eager pass WOULD have used for this combination.
      expect(body.proposalRecordIds[0]).toBe(`SGP-zymo-realize-b${expectedIndex}-s0`);

      const proposal = records.get(body.proposalRecordIds[0]!)!.payload as {
        branchPath: Array<{ axisId: string; conditionId: string }>;
        activeStepIds?: string[];
      };
      expect(proposal.branchPath.map((step) => [step.axisId, step.conditionId])).toEqual(
        tree.axes.map((axis) => [axis.axisId, choices[axis.axisId]]),
      );
      expect((proposal.activeStepIds ?? []).length).toBeGreaterThan(0);
      await app.close();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 60_000);
});

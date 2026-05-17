import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FoundryHumanReviewService,
  syncFoundryReviewImplementationStatus,
} from './FoundryHumanReview.js';
import { scanFoundryLedger, saveFoundryLedger } from './FoundryLedger.js';
import { writeYamlFile } from './FoundryArtifacts.js';

describe('FoundryHumanReviewService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function makeReviewRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'foundry-human-review-'));
    await mkdir(join(root, 'segments'), { recursive: true });
    await mkdir(join(root, 'material-context'), { recursive: true });
    await mkdir(join(root, 'text'), { recursive: true });
    await writeFile(join(root, 'segments', 'demo-protocol.yaml'), 'protocolId: demo-protocol\ntext: Add PBS.\n', 'utf-8');
    await writeFile(join(root, 'segments', 'other-protocol.yaml'), 'protocolId: other-protocol\ntext: SECRET OTHER PDF CONTENT.\n', 'utf-8');
    await writeFile(join(root, 'text', 'demo-protocol.txt'), 'Step 1. Add PBS to each well.', 'utf-8');
    await writeFile(join(root, 'text', 'other-protocol.txt'), 'SECRET OTHER PDF CONTENT should never enter demo review context.', 'utf-8');
    await writeYamlFile(join(root, 'material-context', 'demo-protocol.yaml'), {
      kind: 'protocol-material-context',
      material_mentions: [{ label: 'PBS', layer: 'material', candidate_binding: { kind: 'ontology', id: 'CHEBI:123' } }],
    });
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
      diagnostics: [{ code: 'missing_wash' }],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
      events: [{ eventId: 'evt-1', semanticKey: 'EVT-add-pbs-1', event_type: 'add_material' }],
      labwares: [],
      deckPlacements: [],
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
    });
    await writeYamlFile(join(root, 'browser-review', 'demo-protocol', 'manual_tubes', 'report.yaml'), {
      kind: 'protocol-browser-review-report',
      status: 'fail',
    });
    await writeYamlFile(join(root, 'architect', 'demo-protocol', 'manual_tubes', 'verdict.yaml'), {
      kind: 'protocol-foundry-architect-verdict',
      verdict: 'needs_fix',
      primary_fix_class: 'verb_mapping',
      recommended_patch: { change: 'Add a data-only verb-action mapping.' },
    });
    await writeYamlFile(join(root, 'patch-specs', 'demo-protocol', 'manual_tubes', 'fix-wash.yaml'), {
      kind: 'protocol-foundry-patch-spec',
      title: 'Add wash mapping',
      recommendedFixType: 'data-only',
    });
    await writeYamlFile(join(root, 'compiler', 'other-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 99,
      diagnostics: [{ code: 'secret_other_protocol_diagnostic' }],
    });
    await writeYamlFile(join(root, 'event-graphs', 'other-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
      events: [{ eventId: 'other-secret-event', semanticKey: 'SECRET-OTHER-EVENT' }],
    });
    const ledger = await scanFoundryLedger(root);
    await saveFoundryLedger(ledger);
    return root;
  }

  it('lists reviewable protocol variants from Foundry artifacts', async () => {
    const root = await makeReviewRoot();
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });

    const result = await service.listReviews();

    expect(result.reviews).toContainEqual(expect.objectContaining({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      patchSpecCount: 1,
      fixClassification: expect.stringMatching(/data-only|registry|unknown/),
    }));
  });

  it('assembles exact context for one protocol and variant', async () => {
    const root = await makeReviewRoot();
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });

    const result = await service.getReviewContext('demo-protocol', 'manual_tubes');

    expect(result.context.protocolId).toBe('demo-protocol');
    expect(result.context.variant).toBe('manual_tubes');
    expect(result.context.source.extractedText).toContain('Add PBS');
    expect(result.context.artifacts.patchSpecs).toHaveLength(1);
    expect(result.context.semantic.eventSemanticKeys).toEqual(['EVT-add-pbs-1']);
    expect(JSON.stringify(result.context)).not.toContain('other-protocol');
  });

  it('returns events/labwares/deckPlacements from the production event-graph YAML shape', async () => {
    const root = await makeReviewRoot();
    // Overwrite the demo-protocol event-graph YAML with the production-shaped
    // nested layout that ProtocolFoundryCompileRunner actually emits.
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
      eventGraph: {
        events: [
          { eventId: 'evt-1', semanticKey: 'EVT-add-pbs-1', event_type: 'add_material' },
        ],
        labwares: [
          { labwareId: 'sample_plate', labwareType: 'plate_96', name: 'sample plate' },
        ],
      },
      terminalArtifacts: {
        labStateDelta: {
          snapshotAfter: {
            deck: [{ slot: 'A1', labwareId: 'sample_plate' }],
          },
        },
      },
    });
    const ledger = await scanFoundryLedger(root);
    await saveFoundryLedger(ledger);
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });

    const result = await service.getReviewEventGraph('demo-protocol', 'manual_tubes');

    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ eventId: 'evt-1', semanticKey: 'EVT-add-pbs-1' });
    expect(result.labwares).toHaveLength(1);
    expect(result.labwares[0]).toMatchObject({ labwareId: 'sample_plate' });
    expect(result.deckPlacements).toEqual([{ slot: 'A1', labwareId: 'sample_plate' }]);
  });

  it('exposes lastInnerLoopAt on the review summary when present on the review record', async () => {
    const root = await makeReviewRoot();
    // Seed a human-review record carrying lastInnerLoopAt directly.
    const reviewYamlPath = join(root, 'human-review', 'demo-protocol', 'manual_tubes', 'review.yaml');
    await writeYamlFile(reviewYamlPath, {
      kind: 'protocol-foundry-human-review',
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      status: 'reviewing',
      createdAt: '2026-05-15T00:00:00Z',
      updatedAt: '2026-05-15T00:01:00Z',
      lastInnerLoopAt: '2026-05-15T00:00:30Z',
    });
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });
    const result = await service.listReviews();
    const summary = result.reviews.find(
      (r) => r.protocolId === 'demo-protocol' && r.variant === 'manual_tubes',
    );
    expect(summary).toBeTruthy();
    expect(summary!.lastInnerLoopAt).toBe('2026-05-15T00:00:30Z');
  });

  it('writes a rejection claim + evidence + index to the knowledge layer on reject', async () => {
    const root = await makeReviewRoot();
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });

    await service.reject({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      reason: 'No new vendor evidence supports this verb mapping',
      reasonClass: 'evidence_insufficient',
    });

    const knowledgeDir = join(root, 'knowledge-layer', 'demo-protocol', 'manual_tubes');
    const fs = await import('node:fs/promises');
    const entries = await fs.readdir(knowledgeDir);
    expect(entries).toContain('rejections-index.yaml');
    const claimFile = entries.find((name) => name.startsWith('CLM-FDRY-RJC-'));
    const evidenceFile = entries.find((name) => name.startsWith('EVD-FDRY-RJC-'));
    expect(claimFile).toBeTruthy();
    expect(evidenceFile).toBeTruthy();
    const claimText = await readFile(join(knowledgeDir, claimFile!), 'utf-8');
    expect(claimText).toContain('rejects-foundry-improvement');
    expect(claimText).toContain('No new vendor evidence supports this verb mapping');
    const evidenceText = await readFile(join(knowledgeDir, evidenceFile!), 'utf-8');
    expect(evidenceText).toContain('rejection: true');
    expect(evidenceText).toContain('rejectionReasonClass: evidence_insufficient');
    const indexText = await readFile(join(knowledgeDir, 'rejections-index.yaml'), 'utf-8');
    expect(indexText).toContain('protocol-foundry-rejection-knowledge-index');
    expect(indexText).toContain('reasonClass: evidence_insufficient');
    // Review YAML now carries the claim/evidence refs under rejection.knowledgeLayer.
    const review = await service.getReviewContext('demo-protocol', 'manual_tubes');
    expect(review.context.artifacts.humanReview).toMatchObject({
      rejection: {
        knowledgeLayer: {
          claimRef: expect.objectContaining({ type: 'claim' }),
          evidenceRef: expect.objectContaining({ type: 'evidence' }),
        },
      },
    });
  });

  it('rejects unknown Foundry protocol/variant for event-graph fetch', async () => {
    const root = await makeReviewRoot();
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });
    await expect(service.getReviewEventGraph('nope', 'manual_tubes')).rejects.toThrow(/Unknown Foundry protocol/);
    await expect(service.getReviewEventGraph('demo-protocol', 'fake_variant')).rejects.toThrow(/Unknown Foundry variant/);
  });

  it('persists rejection as Foundry human-review data', async () => {
    const root = await makeReviewRoot();
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });

    const result = await service.reject({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      reason: 'redundant',
    });
    const context = await service.getReviewContext('demo-protocol', 'manual_tubes');

    expect(result.status).toBe('rejected');
    expect(context.context.status).toBe('rejected');
    expect(context.context.artifacts.humanReview).toMatchObject({
      status: 'rejected',
      rejection: { reason: 'redundant' },
    });
  });

  it('reopens a rejected review while preserving rejection audit data', async () => {
    const root = await makeReviewRoot();
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });

    await service.reject({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      reason: 'duplicate architect recommendation',
    });
    const result = await service.reopen({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      reason: 'human wants to revisit',
    });
    const context = await service.getReviewContext('demo-protocol', 'manual_tubes');

    expect(result.status).toBe('reviewing');
    expect(context.context.status).toBe('reviewing');
    expect(context.context.artifacts.humanReview).toMatchObject({
      status: 'reviewing',
      rejection: { reason: 'duplicate architect recommendation' },
      reopen: {
        reason: 'human wants to revisit',
        previousStatus: 'rejected',
      },
    });
  });

  it('writes reviewed specs into the review bundle and live Foundry patch queue', async () => {
    const root = await makeReviewRoot();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: [
        'title: Add wash mapping',
        'fixClass: material_catalog_or_spec_gap',
        'rationale: Add durable mapping data for wash semantics.',
        'ownedFiles:',
        '  - records',
        'acceptance:',
        '  - event graph gains wash event',
        'dataFirstDisposition: YAML data is sufficient.',
        'semanticLayer: event_derived',
        'evidenceCitations:',
        '  - artifacts/text/demo-protocol.txt',
        'graphAnchors:',
        '  - EVT-add-pbs-1',
        'tests:',
        '  - npm run test:run -w server -- FoundryHumanReview.test.ts',
        'expectedArtifactDelta:',
        '  - compiler event count increases',
      ].join('\n') } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });

    const result = await service.synthesizeSpec({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      humanInstruction: 'Make it data-only.',
    });

    expect(result.status).toBe('queued');
    expect(result.queuePath).toMatch(/ralph-queue/);
    expect(result.patchSpecPath).toMatch(/patch-specs/);
    expect(result.adoptionPath).toMatch(/adoption/);
    await expect(readFile(result.patchSpecPath!, 'utf-8')).resolves.toContain('reviewedSpec:');
    await expect(readFile(result.patchSpecPath!, 'utf-8')).resolves.toContain('knowledgeLayer:');
    await expect(readFile(result.patchSpecPath!, 'utf-8')).resolves.toContain('executableQueue: patch-specs');
    await expect(readFile(result.adoptionPath!, 'utf-8')).resolves.toContain('status: accepted');
    await expect(readFile(result.adoptionPath!, 'utf-8')).resolves.toContain('durableReviewBundle: ralph-queue');
    await expect(readFile(join(root, 'ralph-queue', 'foundry-demo-protocol-manual_tubes', 'index.yaml'), 'utf-8')).resolves.toContain('schedulerStage: coder_patch');
    await expect(readFile(join(root, 'knowledge-layer', 'demo-protocol', 'manual_tubes', 'index.yaml'), 'utf-8')).resolves.toContain('protocol-foundry-knowledge-layer-index');
    const context = await service.getReviewContext('demo-protocol', 'manual_tubes');
    expect(context.context.status).toBe('queued');
    expect(context.context.knowledgeLayer.contextRefs).toHaveLength(1);
    expect(context.context.artifacts.humanReview).toMatchObject({
      runnerQueuePolicy: {
        durableReviewBundle: 'ralph-queue',
        executableQueue: 'patch-specs',
        schedulerStage: 'coder_patch',
      },
    });
    const body = JSON.stringify(fetchMock.mock.calls[0]?.[1]);
    expect(body).toContain('demo-protocol');
    expect(body).not.toContain('SECRET OTHER PDF CONTENT');
    expect(body).not.toContain('other-secret-event');
  });

  it('marks reviewed specs implemented after patch critic passes and rerun completes', async () => {
    const root = await makeReviewRoot();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: [
        'title: Add wash mapping',
        'fixClass: material_catalog_or_spec_gap',
        'rationale: Add durable mapping data for wash semantics.',
        'ownedFiles:',
        '  - records',
        'acceptance:',
        '  - event graph gains wash event',
        'dataFirstDisposition: YAML data is sufficient.',
        'semanticLayer: event_derived',
        'evidenceCitations:',
        '  - artifacts/text/demo-protocol.txt',
        'graphAnchors:',
        '  - EVT-add-pbs-1',
        'tests:',
        '  - npm run test:run -w server -- FoundryHumanReview.test.ts',
        'expectedArtifactDelta:',
        '  - compiler event count increases',
      ].join('\n') } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });
    const queued = await service.synthesizeSpec({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      humanInstruction: 'Make it data-only.',
    });

    await writeYamlFile(join(root, 'code-patches', 'demo-protocol', 'manual_tubes', 'result.yaml'), {
      kind: 'protocol-foundry-coder-patch-result',
      status: 'applied',
      touchedFiles: ['records/wash.yaml'],
    });
    await writeYamlFile(join(root, 'patch-critic', 'demo-protocol', 'manual_tubes', 'report.yaml'), {
      kind: 'protocol-foundry-critic-report',
      verdict: 'pass',
      message: 'Patch satisfies the reviewed spec.',
    });
    await writeYamlFile(join(root, 'rerun', 'demo-protocol', 'manual_tubes', 'rerun.yaml'), {
      kind: 'protocol-foundry-rerun-report',
      outcome: 'complete',
      eventCount: 2,
      blockerCount: 0,
    });

    const synced = await syncFoundryReviewImplementationStatus({
      artifactRoot: root,
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      workspaceRoot: root,
    });

    expect(synced).toMatchObject({
      updated: true,
      status: 'implemented',
      implementation: { status: 'implemented', terminal: true },
    });
    const review = await service.getReviewContext('demo-protocol', 'manual_tubes');
    expect(review.context.status).toBe('implemented');
    expect(review.context.artifacts.humanReview).toMatchObject({
      status: 'implemented',
      implementation: {
        status: 'implemented',
        artifacts: {
          coderPatch: 'code-patches/demo-protocol/manual_tubes/result.yaml',
          criticReport: 'patch-critic/demo-protocol/manual_tubes/report.yaml',
          rerunReport: 'rerun/demo-protocol/manual_tubes/rerun.yaml',
        },
      },
    });
    await expect(readFile(queued.queuePath!, 'utf-8')).resolves.toContain('status: implemented');
    await expect(readFile(join(root, 'ralph-queue', 'foundry-demo-protocol-manual_tubes', 'index.yaml'), 'utf-8')).resolves.toContain('status: implemented');
  });
});

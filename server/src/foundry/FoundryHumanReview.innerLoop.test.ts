import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';

vi.mock('./FoundryCoderPatch.js', () => ({
  runFoundryCoderPatch: vi.fn(),
}));
vi.mock('./ProtocolFoundryCompileRunner.js', async () => {
  const FOUNDRY_VARIANTS = ['manual_tubes', 'bench_plate_multichannel', 'robot_deck'] as const;
  return {
    FOUNDRY_VARIANTS,
    runProtocolFoundryCompile: vi.fn(),
  };
});

import { runFoundryCoderPatch } from './FoundryCoderPatch.js';
import { runProtocolFoundryCompile } from './ProtocolFoundryCompileRunner.js';
import { FoundryHumanReviewService } from './FoundryHumanReview.js';
import { scanFoundryLedger, saveFoundryLedger } from './FoundryLedger.js';
import { writeYamlFile } from './FoundryArtifacts.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function makeReviewRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'foundry-inner-loop-'));
  await mkdir(join(root, 'segments'), { recursive: true });
  await mkdir(join(root, 'material-context'), { recursive: true });
  await mkdir(join(root, 'text'), { recursive: true });
  await writeFile(join(root, 'segments', 'demo-protocol.yaml'), 'protocolId: demo-protocol\ntext: Add PBS.\n', 'utf-8');
  await writeFile(join(root, 'text', 'demo-protocol.txt'), 'Step 1. Add PBS.', 'utf-8');
  await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
    kind: 'protocol-foundry-compiler-result',
    outcome: 'gap',
    eventCount: 1,
  });
  await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
    kind: 'protocol-event-graph-proposal',
    eventGraph: {
      events: [
        { eventId: 'evt-1', semanticKey: 'EVT-add-pbs-1', event_type: 'add_material' },
      ],
      labwares: [],
    },
  });
  await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), { kind: 'execution-scale-plan' });
  await writeYamlFile(join(root, 'browser-review', 'demo-protocol', 'manual_tubes', 'report.yaml'), { kind: 'protocol-browser-review-report' });
  await writeYamlFile(join(root, 'architect', 'demo-protocol', 'manual_tubes', 'verdict.yaml'), {
    kind: 'protocol-foundry-architect-verdict',
    verdict: 'needs_fix',
  });
  await writeYamlFile(join(root, 'patch-specs', 'demo-protocol', 'manual_tubes', 'fix-wash.yaml'), {
    kind: 'protocol-foundry-patch-spec',
    title: 'Add wash mapping',
  });
  const ledger = await scanFoundryLedger(root);
  await saveFoundryLedger(ledger);
  return root;
}

function mockReviewModelResponse(): void {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content: [
      'title: Add wash mapping',
      'fixClass: material_catalog_or_spec_gap',
      'rationale: Test draft.',
      'ownedFiles:',
      '  - records',
      'acceptance:',
      '  - event-graph gains wash event',
      'dataFirstDisposition: YAML is sufficient.',
      'semanticLayer: event_derived',
      'evidenceCitations:',
      '  - artifacts/text/demo-protocol.txt',
      'graphAnchors:',
      '  - EVT-add-pbs-1',
      'tests:',
      '  - npm run test:run -w server',
      'expectedArtifactDelta:',
      '  - compiler event count increases',
    ].join('\n') } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

describe('FoundryHumanReviewService.runInnerLoop', () => {
  beforeEach(() => {
    vi.mocked(runFoundryCoderPatch).mockReset();
    vi.mocked(runProtocolFoundryCompile).mockReset();
  });

  it('writes a completed trace with semantic diff when coder applies and recompile succeeds', async () => {
    const root = await makeReviewRoot();
    mockReviewModelResponse();

    vi.mocked(runFoundryCoderPatch).mockResolvedValue({
      status: 'applied',
      resultPath: join(root, 'code-patches', 'demo-protocol', 'manual_tubes', 'result.yaml'),
      touchedFiles: ['records/wash.yaml'],
      message: 'patched',
    });

    vi.mocked(runProtocolFoundryCompile).mockImplementation(async () => {
      // Simulate the compile rewriting the event-graph YAML with a new event added.
      const newPath = join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml');
      await writeYamlFile(newPath, {
        kind: 'protocol-event-graph-proposal',
        eventGraph: {
          events: [
            { eventId: 'evt-1', semanticKey: 'EVT-add-pbs-1', event_type: 'add_material' },
            { eventId: 'evt-2', semanticKey: 'EVT-wash-1', event_type: 'wash' },
          ],
          labwares: [],
        },
      });
      return {
        kind: 'protocol-foundry-compile-summary',
        protocolId: 'demo-protocol',
        artifactRoot: root,
        variants: [{
          variant: 'manual_tubes',
          outcome: 'complete',
          eventGraphArtifact: newPath,
          executionScaleArtifact: join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'),
          compilerArtifact: join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'),
          eventCount: 2,
          blockerCount: 0,
        }],
      };
    });

    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });
    const result = await service.runInnerLoop({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      prompt: 'Add a wash step before quenching.',
    });

    expect(result.trace.status).toBe('completed');
    expect(result.trace.coder?.status).toBe('applied');
    expect(result.trace.recompile?.outcome).toBe('complete');
    expect(result.trace.diff?.added).toEqual([
      expect.objectContaining({ semanticKey: 'EVT-wash-1', eventType: 'wash' }),
    ]);
    expect(result.trace.diff?.removed).toEqual([]);
    expect(result.trace.diff?.changed).toEqual([]);
    expect(result.trace.criticInvoked).toBe(false);
    // Persisted trace + index + before-snapshot
    expect(existsSync(result.tracePath)).toBe(true);
    const indexPath = join(root, 'human-review', 'demo-protocol', 'manual_tubes', 'inner-loop', 'index.yaml');
    expect(existsSync(indexPath)).toBe(true);
    const beforePath = join(root, 'human-review', 'demo-protocol', 'manual_tubes', 'inner-loop', `${result.trace.id}.before.yaml`);
    expect(existsSync(beforePath)).toBe(true);
  });

  it('drafts land under inner-loop/drafts and not in patch-specs', async () => {
    const root = await makeReviewRoot();
    mockReviewModelResponse();

    vi.mocked(runFoundryCoderPatch).mockResolvedValue({
      status: 'skipped',
      resultPath: join(root, 'code-patches', 'demo-protocol', 'manual_tubes', 'result.yaml'),
      touchedFiles: [],
      message: 'no apply (test)',
    });

    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });
    const result = await service.runInnerLoop({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      prompt: 'try this',
    });

    const draftsDir = join(root, 'human-review', 'demo-protocol', 'manual_tubes', 'inner-loop', 'drafts');
    expect(existsSync(draftsDir)).toBe(true);
    const draftPath = result.trace.draftSpec.draftPath;
    expect(draftPath.startsWith(draftsDir)).toBe(true);
    // Original architect patch-spec file is preserved; no new draft file in patch-specs.
    const patchSpecsDir = join(root, 'patch-specs', 'demo-protocol', 'manual_tubes');
    const fs = await import('node:fs/promises');
    const entries = await fs.readdir(patchSpecsDir);
    expect(entries).toContain('fix-wash.yaml');
    expect(entries.some((name) => name.startsWith('foundry-draft-'))).toBe(false);
    // Recompile not invoked when the coder did not apply.
    expect(vi.mocked(runProtocolFoundryCompile)).not.toHaveBeenCalled();
    expect(result.trace.diff).toBeUndefined();
  });

  it('promoteDraftSpec moves a draft into ralph-queue + patch-specs + adoption', async () => {
    const root = await makeReviewRoot();
    mockReviewModelResponse();

    vi.mocked(runFoundryCoderPatch).mockResolvedValue({
      status: 'skipped',
      resultPath: join(root, 'code-patches', 'demo-protocol', 'manual_tubes', 'result.yaml'),
      touchedFiles: [],
      message: 'noop',
    });

    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });
    const loop = await service.runInnerLoop({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      prompt: 'try this',
    });
    const promote = await service.promoteDraftSpec({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      draftId: loop.trace.draftSpec.id,
    });

    expect(promote.status).toBe('queued');
    expect(promote.queuePath).toMatch(/ralph-queue/);
    expect(promote.patchSpecPath).toMatch(/patch-specs/);
    expect(promote.adoptionPath).toMatch(/adoption/);
    await expect(readFile(promote.patchSpecPath, 'utf-8')).resolves.toContain('reviewedSpec:');
    const reviewYaml = await readFile(promote.reviewPath, 'utf-8');
    const review = YAML.parse(reviewYaml) as Record<string, unknown>;
    expect(review['status']).toBe('queued');
    expect(review['promotedDraftId']).toBe(loop.trace.draftSpec.id);
  });

  it('writes an inner-loop assertion + index to the knowledge layer per completed trace', async () => {
    const root = await makeReviewRoot();
    mockReviewModelResponse();

    vi.mocked(runFoundryCoderPatch).mockResolvedValue({
      status: 'applied',
      resultPath: join(root, 'code-patches', 'demo-protocol', 'manual_tubes', 'result.yaml'),
      touchedFiles: ['records/wash.yaml'],
      message: 'patched',
    });
    vi.mocked(runProtocolFoundryCompile).mockImplementation(async () => {
      const newPath = join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml');
      await writeYamlFile(newPath, {
        kind: 'protocol-event-graph-proposal',
        eventGraph: {
          events: [
            { eventId: 'evt-1', semanticKey: 'EVT-add-pbs-1', event_type: 'add_material' },
            { eventId: 'evt-2', semanticKey: 'EVT-wash-1', event_type: 'wash' },
          ],
          labwares: [],
        },
      });
      return {
        kind: 'protocol-foundry-compile-summary',
        protocolId: 'demo-protocol',
        artifactRoot: root,
        variants: [{
          variant: 'manual_tubes',
          outcome: 'complete',
          eventGraphArtifact: newPath,
          executionScaleArtifact: join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'),
          compilerArtifact: join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'),
          eventCount: 2,
          blockerCount: 0,
        }],
      };
    });

    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });
    const result = await service.runInnerLoop({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      prompt: 'Add a wash step before quenching.',
    });

    const knowledgeDir = join(root, 'knowledge-layer', 'demo-protocol', 'manual_tubes');
    const fs = await import('node:fs/promises');
    const entries = await fs.readdir(knowledgeDir);
    const assertionFile = entries.find((name) => name.startsWith('ASN-FDRY-INNERLOOP-'));
    expect(assertionFile).toBeTruthy();
    const assertionText = await readFile(join(knowledgeDir, assertionFile!), 'utf-8');
    expect(assertionText).toContain('inner_loop_outcome');
    expect(assertionText).toContain(`traceId: ${result.trace.id}`);
    expect(assertionText).toContain('direction: improved');
    const indexText = await readFile(join(knowledgeDir, 'inner-loop-assertions-index.yaml'), 'utf-8');
    expect(indexText).toContain('protocol-foundry-inner-loop-assertion-index');
    expect(indexText).toContain(`traceId: ${result.trace.id}`);
    // Review YAML carries the latest assertion ref so the UI can surface it.
    const reviewYamlPath = join(root, 'human-review', 'demo-protocol', 'manual_tubes', 'review.yaml');
    const reviewText = await readFile(reviewYamlPath, 'utf-8');
    expect(reviewText).toContain('lastInnerLoopAssertionRef');
  });

  it('writes a failed trace with an error when no prior event-graph exists', async () => {
    const root = await makeReviewRoot();
    // Wipe the event-graph artifact to simulate a missing prior graph and rebuild ledger.
    const fs = await import('node:fs/promises');
    await fs.rm(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'));
    const ledger = await scanFoundryLedger(root);
    await saveFoundryLedger(ledger);

    const service = new FoundryHumanReviewService({ artifactRoot: root, workspaceRoot: root });
    const result = await service.runInnerLoop({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      prompt: 'try this',
    });

    expect(result.trace.status).toBe('failed');
    expect(result.trace.error).toBeTruthy();
    expect(vi.mocked(runFoundryCoderPatch)).not.toHaveBeenCalled();
  });
});

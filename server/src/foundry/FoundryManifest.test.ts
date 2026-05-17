import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { writeYamlFile } from './FoundryArtifacts.js';
import { readyTasks, scanFoundryLedger } from './FoundryLedger.js';
import {
  buildFoundryOperationalStatus,
  buildFoundryVariantManifest,
  loadFoundryVariantManifest,
  writeFoundryLoopRuntimeStart,
  writeFoundryManifests,
  writeFoundryOperationalStatus,
} from './FoundryManifest.js';

describe('FoundryManifest', () => {
  async function makeArtifactRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'foundry-manifest-'));
    await mkdir(join(root, 'segments'), { recursive: true });
    await mkdir(join(root, 'text'), { recursive: true });
    await mkdir(join(root, 'pdfs'), { recursive: true });
    await writeFile(join(root, 'segments', 'demo-protocol.yaml'), 'protocolId: demo-protocol\ntext: Add PBS.\n', 'utf-8');
    await writeFile(join(root, 'text', 'demo-protocol.txt'), 'Step 1. Add PBS.', 'utf-8');
    await writeFile(join(root, 'pdfs', 'demo-protocol.pdf'), '%PDF fixture', 'utf-8');
    await writeYamlFile(join(root, 'pdfs', 'demo-protocol.pdf.procurement.yaml'), {
      kind: 'protocol-pdf-procurement',
      vendor: 'demo',
      title: 'Demo Protocol',
      sourceUrl: 'https://example.test/demo.pdf',
    });
    await writeYamlFile(join(root, 'material-context', 'demo-protocol.yaml'), {
      kind: 'protocol-material-context',
      materials: [{ label: 'PBS', layer: 'material' }],
    });
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
      diagnostics: [{ code: 'missing_wash', message: 'wash event missing' }],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
      events: [{ eventId: 'evt-1', semanticKey: 'EVT-add-pbs-1' }],
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
      accepted: false,
      recommendedFixes: [{ id: 'fix-wash' }],
    });
    await writeYamlFile(join(root, 'patch-specs', 'demo-protocol', 'manual_tubes', 'fix-wash.yaml'), {
      kind: 'protocol-foundry-patch-spec',
      id: 'fix-wash',
      fixClass: 'event_graph_coverage',
      ownedFiles: ['server/src/compiler'],
    });
    await writeYamlFile(join(root, 'human-review', 'demo-protocol', 'manual_tubes', 'review.yaml'), {
      kind: 'protocol-foundry-human-review',
      status: 'queued',
      latestReviewedSpecPath: join(root, 'ralph-queue', 'foundry-demo-protocol-manual_tubes', 'reviewed.yaml'),
      livePatchSpecPath: join(root, 'patch-specs', 'demo-protocol', 'manual_tubes', 'human-reviewed.yaml'),
      knowledgeLayerPaths: { index: 'knowledge-layer/demo-protocol/manual_tubes/index.yaml' },
    });
    return root;
  }

  it('builds a per-variant manifest with artifacts, missing diagnostics, and human-review status', async () => {
    const root = await makeArtifactRoot();
    const ledger = await scanFoundryLedger(root);

    const manifest = await buildFoundryVariantManifest(ledger, 'demo-protocol', 'manual_tubes');

    expect(manifest.protocolId).toBe('demo-protocol');
    expect(manifest.variant).toBe('manual_tubes');
    expect(manifest.artifacts.extractedText).toMatchObject({ exists: true });
    expect(manifest.artifacts.patchSpecs).toHaveLength(1);
    expect(manifest.humanReview.status).toBe('queued');
    expect(manifest.humanReview.livePatchSpecPath).toBe('patch-specs/demo-protocol/manual_tubes/human-reviewed.yaml');
    expect(manifest.nextActions).toContain('Run Foundry coder/critic loop for queued reviewed spec.');
  });

  it('writes manifest index, variant manifests, and operational status rollups', async () => {
    const root = await makeArtifactRoot();
    const ledger = await scanFoundryLedger(root);

    const index = await writeFoundryManifests(ledger);
    const status = await writeFoundryOperationalStatus(ledger, readyTasks(ledger));

    expect(index.protocolCount).toBe(1);
    expect(index.variantCount).toBe(3);
    await expect(readFile(join(root, 'manifests', 'index.yaml'), 'utf-8')).resolves.toContain('protocol-foundry-manifest-index');
    await expect(readFile(join(root, 'manifests', 'status.yaml'), 'utf-8')).resolves.toContain('protocol-foundry-operational-status');
    await expect(loadFoundryVariantManifest(root, 'demo-protocol', 'manual_tubes')).resolves.toMatchObject({
      kind: 'protocol-foundry-variant-manifest',
      humanReview: { status: 'queued' },
    });
    expect(status.counts.compiled).toBeGreaterThanOrEqual(1);
    expect(status.counts.architectReviewed).toBeGreaterThanOrEqual(1);
    expect(status.counts.queued).toBe(1);
    expect(status.loop).toMatchObject({
      metadataPath: 'manifests/loop-runtime.yaml',
      running: false,
      status: 'missing',
    });
    expect(status.latestErrors).toContainEqual(expect.objectContaining({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      category: 'missing_wash',
    }));
  });

  it('includes running loop PID and log path when runtime metadata exists', async () => {
    const root = await makeArtifactRoot();
    await writeFoundryLoopRuntimeStart({
      artifactRoot: root,
      repoRoot: '/repo/computable-foundry',
      args: ['--artifact-root', root, '--watch'],
      logPath: '/tmp/foundry-loop-test.log',
    });
    const ledger = await scanFoundryLedger(root);

    const status = await buildFoundryOperationalStatus(ledger, readyTasks(ledger));

    expect(status.loop).toMatchObject({
      metadataPath: 'manifests/loop-runtime.yaml',
      running: true,
      status: 'running',
      pid: process.pid,
      logPath: '/tmp/foundry-loop-test.log',
    });
    expect(status.loop.command).toContain('--watch');
  });

  it('reports partial variants with missing-artifact diagnostics', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-manifest-partial-'));
    await mkdir(join(root, 'segments'), { recursive: true });
    await writeFile(join(root, 'segments', 'partial-protocol.yaml'), 'protocolId: partial-protocol\n', 'utf-8');
    const ledger = await scanFoundryLedger(root);

    const manifest = await buildFoundryVariantManifest(ledger, 'partial-protocol', 'manual_tubes');

    expect(manifest.missingArtifacts).toContainEqual(expect.objectContaining({ key: 'extractedText' }));
    expect(manifest.missingArtifacts).toContainEqual(expect.objectContaining({ key: 'compiler' }));
    expect(manifest.nextActions).toContain('Run or repair PDF extraction/pre-compile artifacts.');
  });

  it('builds status counts for awaiting human review when an architect verdict exists without review state', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'human-review', 'demo-protocol', 'manual_tubes', 'review.yaml'), {
      kind: 'protocol-foundry-human-review',
    });
    const ledger = await scanFoundryLedger(root);

    const status = await buildFoundryOperationalStatus(ledger, readyTasks(ledger));

    expect(status.counts.awaitingHumanReview).toBe(1);
  });
});

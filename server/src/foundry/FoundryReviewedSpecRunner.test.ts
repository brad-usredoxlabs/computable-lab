import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { writeYamlFile } from './FoundryArtifacts.js';
import { runFoundryReviewedSpecBatch } from './FoundryReviewedSpecRunner.js';

describe('FoundryReviewedSpecRunner', () => {
  async function makeQueuedReviewRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'foundry-reviewed-run-'));
    await mkdir(join(root, 'segments'), { recursive: true });
    await writeFile(join(root, 'segments', 'demo-protocol.yaml'), [
      'protocolId: demo-protocol',
      'protocol_text: Add PBS to sample tube.',
    ].join('\n'), 'utf-8');
    await writeYamlFile(join(root, 'material-context', 'demo-protocol.yaml'), {
      kind: 'protocol-foundry-material-context',
      materials: [],
    });
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
      events: [{ eventId: 'evt-1', semanticKey: 'EVT-add-pbs-1' }],
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
    });
    const patchSpecPath = join(root, 'patch-specs', 'demo-protocol', 'manual_tubes', 'human-reviewed.yaml');
    await writeYamlFile(patchSpecPath, {
      kind: 'protocol-foundry-patch-spec',
      id: 'human-reviewed',
      title: 'Add wash mapping',
      fixClass: 'material_catalog_or_spec_gap',
      rationale: 'Fixture reviewed spec.',
      ownedFiles: ['records'],
      acceptance: ['event graph gains wash event'],
    });
    await writeYamlFile(join(root, 'adoption', 'demo-protocol', 'manual_tubes', 'adoption.yaml'), {
      kind: 'protocol-foundry-adoption-decision',
      status: 'accepted',
      applyPatches: true,
      patchSpecs: [{ id: 'human-reviewed', path: patchSpecPath }],
    });
    const queuePath = join(root, 'ralph-queue', 'foundry-demo-protocol-manual_tubes', 'human-reviewed.yaml');
    await writeYamlFile(queuePath, {
      kind: 'protocol-foundry-reviewed-spec',
      id: 'human-reviewed',
      status: 'queued',
    });
    await writeYamlFile(join(root, 'ralph-queue', 'foundry-demo-protocol-manual_tubes', 'index.yaml'), {
      kind: 'protocol-foundry-reviewed-spec-bundle',
      specs: [{ id: 'human-reviewed', path: queuePath, status: 'queued' }],
    });
    await writeYamlFile(join(root, 'human-review', 'demo-protocol', 'manual_tubes', 'review.yaml'), {
      kind: 'protocol-foundry-human-review',
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      status: 'queued',
      latestReviewedSpecPath: queuePath,
      livePatchSpecPath: patchSpecPath,
      liveAdoptionPath: join(root, 'adoption', 'demo-protocol', 'manual_tubes', 'adoption.yaml'),
    });
    return root;
  }

  it('runs a bounded dry reviewed-spec pass and writes an inspectable blocked report', async () => {
    const root = await makeQueuedReviewRoot();

    const report = await runFoundryReviewedSpecBatch({
      artifactRoot: root,
      repoRoot: root,
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      maxSpecs: 1,
      maxAttempts: 2,
      dryRun: true,
    });

    expect(report.selectedCount).toBe(1);
    expect(report.items[0]).toMatchObject({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      status: 'blocked',
      reviewStatus: 'failed',
    });
    expect(report.items[0]?.attempts).toHaveLength(1);
    expect(report.items[0]?.attempts[0]).toMatchObject({
      coder: { status: 'blocked', message: 'coder not configured' },
      critic: { verdict: 'block' },
    });
    await expect(readFile(join(root, 'queues', 'reviewed-spec-run-latest.yaml'), 'utf-8')).resolves.toContain('protocol-foundry-reviewed-spec-run-report');
    await expect(readFile(join(root, 'human-review', 'demo-protocol', 'manual_tubes', 'review.yaml'), 'utf-8')).resolves.toContain('status: failed');
    await expect(readFile(join(root, 'code-patches', 'demo-protocol', 'manual_tubes', 'result.yaml'), 'utf-8')).resolves.toContain('coder not configured');
  });
});

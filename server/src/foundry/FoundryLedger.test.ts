import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { scanFoundryLedger, readyTasks, markFoundryTask, saveFoundryLedger } from './FoundryLedger.js';
import { selectRunnableTasks } from './FoundrySupervisor.js';
import { writeYamlFile } from './FoundryArtifacts.js';

describe('FoundryLedger', () => {
  async function makeArtifactRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'foundry-ledger-'));
    await mkdir(join(root, 'segments'), { recursive: true });
    await mkdir(join(root, 'material-context'), { recursive: true });
    await writeFile(join(root, 'segments', 'demo-protocol.yaml'), 'protocolId: demo-protocol\ntext: Add PBS.\n', 'utf-8');
    await writeFile(join(root, 'material-context', 'demo-protocol.yaml'), 'materials: []\n', 'utf-8');
    return root;
  }

  async function tick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  it('discovers protocols and exposes compile as the first ready task', async () => {
    const root = await makeArtifactRoot();
    const ledger = await scanFoundryLedger(root);

    expect(ledger.protocols).toEqual(['demo-protocol']);
    expect(readyTasks(ledger)).toEqual([
      { protocolId: 'demo-protocol', variant: 'manual_tubes', stage: 'compile' },
    ]);
  });

  it('detects compiled variants and advances to architect review before browser review', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'complete',
      eventCount: 1,
      diagnostics: [],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
      blockers: [],
    });
    await writeYamlFile(join(root, 'assumptions', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-test-assumption-profile',
    });

    const ledger = await scanFoundryLedger(root);

    expect(ledger.protocol_status['demo-protocol']?.variants.manual_tubes.status).toBe('completed');
    expect(readyTasks(ledger)).toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'architect_review',
    });
  });

  it('does not mark rerun gaps as completed', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 0,
      diagnostics: [{ code: 'extractor_repair_exhausted' }],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
      blockers: [],
    });
    await writeYamlFile(join(root, 'assumptions', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-test-assumption-profile',
    });
    await writeYamlFile(join(root, 'rerun', 'demo-protocol', 'manual_tubes', 'rerun.yaml'), {
      kind: 'protocol-foundry-rerun-report',
      outcome: 'gap',
      eventCount: 0,
      blockerCount: 0,
    });

    const ledger = await scanFoundryLedger(root);

    expect(ledger.protocol_status['demo-protocol']?.variants.manual_tubes.status).toBe('gap');
  });

  it('schedules architect review again when a rerun updates the event graph', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
      diagnostics: [],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
      revision: 1,
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
      blockers: [],
    });
    await writeYamlFile(join(root, 'assumptions', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-test-assumption-profile',
    });
    await writeYamlFile(join(root, 'browser-review', 'demo-protocol', 'manual_tubes', 'report.yaml'), {
      kind: 'protocol-browser-review-report',
      status: 'pass',
    });
    await writeYamlFile(join(root, 'architect', 'demo-protocol', 'manual_tubes', 'verdict.yaml'), {
      kind: 'protocol-foundry-architect-verdict',
      accepted: false,
    });
    await writeYamlFile(join(root, 'adoption', 'demo-protocol', 'manual_tubes', 'adoption.yaml'), {
      kind: 'protocol-foundry-patch-adoption',
      status: 'skipped',
    });
    await writeYamlFile(join(root, 'rerun', 'demo-protocol', 'manual_tubes', 'rerun.yaml'), {
      kind: 'protocol-foundry-rerun-report',
      outcome: 'gap',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
      revision: 2,
    });

    const ledger = await scanFoundryLedger(root);

    expect(readyTasks(ledger)).toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'architect_review',
    });
  });

  it('reruns compiled variants that predate Foundry test assumption artifacts', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
      diagnostics: [],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
      blockers: [],
    });

    const ledger = await scanFoundryLedger(root);

    expect(readyTasks(ledger)).toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'rerun',
    });
  });

  it('recovers stale running variants so they can be rerun after supervisor restart', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
      diagnostics: [],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
      blockers: [],
    });
    await writeYamlFile(join(root, 'assumptions', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-test-assumption-profile',
    });

    const firstLedger = await scanFoundryLedger(root);
    const staleVariant = firstLedger.protocol_status['demo-protocol']!.variants.bench_plate_multichannel;
    staleVariant.status = 'running';
    staleVariant.startedAt = '2000-01-01T00:00:00.000Z';
    await saveFoundryLedger(firstLedger);

    const ledger = await scanFoundryLedger(root);

    expect(ledger.protocol_status['demo-protocol']?.variants.bench_plate_multichannel.status).toBe('pending');
    expect(readyTasks(ledger)).toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'bench_plate_multichannel',
      stage: 'rerun',
    });
  });

  it('prioritizes coder tournaments before generic reruns', () => {
    expect(selectRunnableTasks([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'compile' },
      { protocolId: 'p2', variant: 'manual_tubes', stage: 'architect_review' },
      { protocolId: 'p3', variant: 'manual_tubes', stage: 'patch_adoption' },
    ])).toEqual([
      { protocolId: 'p3', variant: 'manual_tubes', stage: 'patch_adoption' },
    ]);

    expect(selectRunnableTasks([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'compile' },
      { protocolId: 'p2', variant: 'manual_tubes', stage: 'patch_adoption' },
      { protocolId: 'p3', variant: 'manual_tubes', stage: 'coder_patch' },
    ])).toEqual([
      { protocolId: 'p3', variant: 'manual_tubes', stage: 'coder_patch' },
    ]);

    expect(selectRunnableTasks([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'compile' },
      { protocolId: 'p2', variant: 'manual_tubes', stage: 'rerun' },
      { protocolId: 'p3', variant: 'manual_tubes', stage: 'architect_review' },
      { protocolId: 'p4', variant: 'manual_tubes', stage: 'architect_review' },
    ])).toEqual([
      { protocolId: 'p2', variant: 'manual_tubes', stage: 'rerun' },
    ]);

    expect(selectRunnableTasks([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'coder_patch' },
      { protocolId: 'p2', variant: 'manual_tubes', stage: 'rerun' },
      { protocolId: 'p3', variant: 'manual_tubes', stage: 'coder_patch' },
    ])).toEqual([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'coder_patch' },
    ]);
  });

  it('throttles patch adoption so the next cycle can run a coder tournament', () => {
    expect(selectRunnableTasks([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'patch_adoption' },
      { protocolId: 'p2', variant: 'manual_tubes', stage: 'patch_adoption' },
      { protocolId: 'p3', variant: 'manual_tubes', stage: 'patch_adoption' },
    ])).toEqual([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'patch_adoption' },
    ]);
  });

  it('runs one review or rerun task before rechecking for newly unblocked coder work', () => {
    expect(selectRunnableTasks([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'architect_review' },
      { protocolId: 'p2', variant: 'manual_tubes', stage: 'architect_review' },
      { protocolId: 'p3', variant: 'manual_tubes', stage: 'architect_review' },
    ])).toEqual([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'architect_review' },
    ]);

    expect(selectRunnableTasks([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'rerun' },
      { protocolId: 'p2', variant: 'manual_tubes', stage: 'rerun' },
    ])).toEqual([
      { protocolId: 'p1', variant: 'manual_tubes', stage: 'rerun' },
    ]);
  });

  it('schedules coder patch from real patch spec files after adoption', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
      diagnostics: [],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
      blockers: [],
    });
    await writeYamlFile(join(root, 'assumptions', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-test-assumption-profile',
    });
    await writeYamlFile(join(root, 'architect', 'demo-protocol', 'manual_tubes', 'verdict.yaml'), {
      kind: 'protocol-foundry-architect-verdict',
      accepted: false,
    });
    const patchSpecPath = join(root, 'patch-specs', 'demo-protocol', 'manual_tubes', 'fix-extractor.yaml');
    await writeYamlFile(patchSpecPath, {
      id: 'fix-extractor',
      fixClass: 'extractor_prompt_contract',
      ownedFiles: ['server/src/extract'],
    });
    const adoptionPath = join(root, 'adoption', 'demo-protocol', 'manual_tubes', 'adoption.yaml');
    await writeYamlFile(adoptionPath, {
      kind: 'protocol-foundry-adoption-decision',
      status: 'accepted',
    });

    const ledger = await scanFoundryLedger(root);

    expect(ledger.protocol_status['demo-protocol']?.variants.manual_tubes.artifacts.patchSpecs).toEqual([patchSpecPath]);
    expect(ledger.protocol_status['demo-protocol']?.variants.manual_tubes.artifacts.adoptionDecision).toBe(adoptionPath);
    expect(readyTasks(ledger)).toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'coder_patch',
    });
  });

  it('returns control to the architect when a coder tournament needs human review', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
      diagnostics: [],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
      blockers: [],
    });
    await writeYamlFile(join(root, 'assumptions', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-test-assumption-profile',
    });
    await writeYamlFile(join(root, 'architect', 'demo-protocol', 'manual_tubes', 'verdict.yaml'), {
      kind: 'protocol-foundry-architect-verdict',
      accepted: false,
    });
    await writeYamlFile(join(root, 'patch-specs', 'demo-protocol', 'manual_tubes', 'fix-extractor.yaml'), {
      id: 'fix-extractor',
      fixClass: 'extractor_prompt_contract',
      ownedFiles: ['server/src/extract'],
    });
    await writeYamlFile(join(root, 'adoption', 'demo-protocol', 'manual_tubes', 'adoption.yaml'), {
      kind: 'protocol-foundry-adoption-decision',
      status: 'accepted',
    });
    await tick();
    await writeYamlFile(join(root, 'code-patches', 'demo-protocol', 'manual_tubes', 'result.yaml'), {
      kind: 'protocol-foundry-coder-patch-result',
      status: 'needs-human',
      message: 'coder found the selected spec already satisfied',
    });

    const ledger = await scanFoundryLedger(root);

    expect(readyTasks(ledger)).toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'architect_review',
    });
  });

  it('schedules a fresh coder tournament after stale patch specs have been refreshed', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
      diagnostics: [],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
      blockers: [],
    });
    await writeYamlFile(join(root, 'assumptions', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-test-assumption-profile',
    });
    await writeYamlFile(join(root, 'architect', 'demo-protocol', 'manual_tubes', 'verdict.yaml'), {
      kind: 'protocol-foundry-architect-verdict',
      accepted: false,
    });
    await writeYamlFile(join(root, 'patch-specs', 'demo-protocol', 'manual_tubes', 'fix-extractor.yaml'), {
      id: 'fix-extractor',
      fixClass: 'extractor_prompt_contract',
      ownedFiles: ['server/src/extract'],
    });
    await writeYamlFile(join(root, 'adoption', 'demo-protocol', 'manual_tubes', 'adoption.yaml'), {
      kind: 'protocol-foundry-adoption-decision',
      status: 'accepted',
    });
    await writeYamlFile(join(root, 'code-patches', 'demo-protocol', 'manual_tubes', 'result.yaml'), {
      kind: 'protocol-foundry-coder-patch-result',
      status: 'stale',
      message: 'stale patch specs; rerun and refresh architect context',
    });

    const ledger = await scanFoundryLedger(root);

    expect(readyTasks(ledger)).toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'coder_patch',
    });
  });

  it('stalls a variant after repeated unsuccessful vertical attempts so the loop can move on', async () => {
    const root = await makeArtifactRoot();
    await writeYamlFile(join(root, 'compiler', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 1,
      diagnostics: [{ code: 'extractor_repair_exhausted' }],
    });
    await writeYamlFile(join(root, 'event-graphs', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-event-graph-proposal',
    });
    await writeYamlFile(join(root, 'execution-scale', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'execution-scale-plan',
      blockers: [{ reason: 'still incomplete' }],
    });
    await writeYamlFile(join(root, 'assumptions', 'demo-protocol', 'manual_tubes.yaml'), {
      kind: 'protocol-foundry-test-assumption-profile',
    });
    await writeYamlFile(join(root, 'architect', 'demo-protocol', 'manual_tubes', 'verdict.yaml'), {
      kind: 'protocol-foundry-architect-verdict',
      accepted: false,
    });
    await writeYamlFile(join(root, 'adoption', 'demo-protocol', 'manual_tubes', 'adoption.yaml'), {
      kind: 'protocol-foundry-adoption-decision',
      status: 'accepted',
    });
    await writeYamlFile(join(root, 'code-patches', 'demo-protocol', 'manual_tubes', 'result.yaml'), {
      kind: 'protocol-foundry-coder-patch-result',
      status: 'applied',
    });
    await writeYamlFile(join(root, 'rerun', 'demo-protocol', 'manual_tubes', 'rerun.yaml'), {
      kind: 'protocol-foundry-rerun-report',
      outcome: 'gap',
      eventCount: 1,
      blockerCount: 1,
    });

    const firstLedger = await scanFoundryLedger(root);
    firstLedger.protocol_status['demo-protocol']!.variants.manual_tubes.attempt = 24;
    await saveFoundryLedger(firstLedger);

    const ledger = await scanFoundryLedger(root);
    const variant = ledger.protocol_status['demo-protocol']!.variants.manual_tubes;

    expect(variant.status).toBe('stalled');
    expect(variant.artifacts.stallReport).toContain('/stalled/demo-protocol/manual_tubes/stall.yaml');
    expect(readyTasks(ledger)).not.toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'architect_review',
    });
    expect(readyTasks(ledger)).not.toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'coder_patch',
    });
  });

  it('marks task status and persists stage artifacts in memory', async () => {
    const root = await makeArtifactRoot();
    const ledger = await scanFoundryLedger(root);

    markFoundryTask(ledger, {
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'architect_review',
      status: 'gap',
      artifacts: { architectVerdict: '/tmp/verdict.yaml' },
      metrics: { qualityScore: 0.4 },
    });

    const variant = ledger.protocol_status['demo-protocol']?.variants.manual_tubes;
    expect(variant?.status).toBe('gap');
    expect(variant?.artifacts.architectVerdict).toBe('/tmp/verdict.yaml');
    expect(variant?.metrics.qualityScore).toBe(0.4);
  });
});

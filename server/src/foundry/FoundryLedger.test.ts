import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { scanFoundryLedger, readyTasks, markFoundryTask } from './FoundryLedger.js';
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

  it('discovers protocols and exposes compile as the first ready task', async () => {
    const root = await makeArtifactRoot();
    const ledger = await scanFoundryLedger(root);

    expect(ledger.protocols).toEqual(['demo-protocol']);
    expect(readyTasks(ledger)).toEqual([
      { protocolId: 'demo-protocol', variant: 'manual_tubes', stage: 'compile' },
    ]);
  });

  it('detects compiled variants and advances to browser review', async () => {
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

    const ledger = await scanFoundryLedger(root);

    expect(ledger.protocol_status['demo-protocol']?.variants.manual_tubes.status).toBe('completed');
    expect(readyTasks(ledger)).toContainEqual({
      protocolId: 'demo-protocol',
      variant: 'manual_tubes',
      stage: 'browser_review',
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

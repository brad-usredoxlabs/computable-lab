import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FoundryAcquisitionJobManager } from './FoundryAcquisitionJobManager.js';

describe('FoundryAcquisitionJobManager', () => {
  it('persists jobs, events, continuation turns, and review artifacts', async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), 'foundry-acquisition-'));
    try {
      const manager = new FoundryAcquisitionJobManager({
        artifactRoot,
        idFactory: () => 'job-001',
      });

      const queued = await manager.enqueue({
        jobKind: 'literature-extraction',
        prompt: 'Search PubMed for magnetic bead DNA extraction',
      });
      expect(queued.status).toBe('queued');
      expect(queued.turns[0]).toMatchObject({ role: 'user' });

      await manager.startJob('job-001', '/tmp/trace.jsonl');
      const completed = await manager.completeJob('job-001', { finalText: 'draft' }, 'draft report', {
        status: 'ready_for_review',
        nextAction: 'Review the structured artifacts, then mark complete or continue with requested edits.',
        artifacts: [{ kind: 'vendor-protocol-event-graph-draft', path: 'artifacts/foundry/protocol-event-graph-drafts/demo.json' }],
        records: [],
        blockers: [],
        toolRuns: [],
      });
      expect(completed.status).toBe('needs-review');
      expect(completed.outputSummary?.artifacts[0]?.path).toBe('artifacts/foundry/protocol-event-graph-drafts/demo.json');
      expect(completed.resultPath).toBe(join(completed.jobRoot, 'result.json'));
      expect(completed.turns.at(-1)).toMatchObject({ role: 'assistant', content: 'draft report' });
      await expect(readFile(join(completed.jobRoot, 'assistant.md'), 'utf-8')).resolves.toContain('draft report');
      await expect(readFile(join(completed.jobRoot, 'result.json'), 'utf-8')).resolves.toContain('outputSummary');

      await manager.continueJob('job-001', 'Prefer protocol papers.');
      const continued = await manager.getJob('job-001');
      expect(continued?.status).toBe('queued');
      expect(continued?.turns.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user']);

      const events = await manager.readEvents('job-001');
      expect(events.map((event) => event.phase)).toEqual(expect.arrayContaining(['queued', 'running', 'continued', 'needs_review']));

      const failed = await manager.failJob('job-001', 'Agent did not complete: max-turns', { status: 'max-turns' }, {
        status: 'incomplete',
        nextAction: 'Review the assistant report; no structured artifacts were detected.',
        artifacts: [],
        records: [],
        blockers: [],
        toolRuns: [],
      });
      expect(failed.status).toBe('failed');
      expect(failed.resultPath).toBe(join(failed.jobRoot, 'result.json'));
      await expect(readFile(join(failed.jobRoot, 'result.json'), 'utf-8')).resolves.toContain('max-turns');
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});

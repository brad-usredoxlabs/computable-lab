import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildFoundryLoopStartPlan,
  defaultFoundryLoopLogPath,
  stopFoundryLoop,
} from './protocolFoundryLoopControl.js';

describe('protocolFoundryLoopControl', () => {
  it('builds a full safe restart profile with durable log/runtime args', () => {
    const plan = buildFoundryLoopStartPlan({
      artifactRoot: '/tmp/foundry-artifacts',
      repoRoot: '/repo/computable-foundry',
      controlArgs: [
        '--worker-base-url',
        'http://thunderbeast:8888/v1',
        '--worker-model',
        'Qwen',
        '--max-cycles',
        '100',
      ],
    });

    expect(plan.profile).toBe('full');
    expect(plan.logPath).toBe(defaultFoundryLoopLogPath('/tmp/foundry-artifacts'));
    expect(plan.loopArgs).toEqual(expect.arrayContaining([
      '--artifact-root',
      '/tmp/foundry-artifacts',
      '--repo-root',
      '/repo/computable-foundry',
      '--log-path',
      join('/tmp/foundry-artifacts', 'manifests', 'foundry-loop.log'),
      '--watch',
      '--skip-browser',
      '--improvement-mode',
      '--apply-patches',
      '--auto-commit-patches',
      '--worker-base-url',
      'http://thunderbeast:8888/v1',
      '--worker-model',
      'Qwen',
      '--max-cycles',
      '100',
    ]));
  });

  it('builds a review-only profile without patch application flags', () => {
    const plan = buildFoundryLoopStartPlan({
      artifactRoot: '/tmp/foundry-artifacts',
      repoRoot: '/repo/computable-foundry',
      profile: 'review',
      logPath: '/tmp/foundry-review.log',
    });

    expect(plan.profile).toBe('review');
    expect(plan.loopArgs).toContain('--watch');
    expect(plan.loopArgs).toContain('--skip-browser');
    expect(plan.loopArgs).not.toContain('--apply-patches');
    expect(plan.loopArgs).not.toContain('--auto-commit-patches');
  });

  it('stop is a no-op when no runtime metadata exists', async () => {
    const result = await stopFoundryLoop('/tmp/foundry-loop-control-missing');

    expect(result).toMatchObject({
      success: true,
      command: 'stop',
      stopped: {
        pid: 0,
        signal: 'none',
      },
    });
    expect(result.status.status).toBe('missing');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createTreeHandlers } from './TreeHandlers.js';

/**
 * Exercises GET /runs (listRuns). Regression for the bug where a study's
 * direct (experiment-less) runs and fully unrooted runs were invisible:
 * the endpoint only iterated study.experiments[].runs[].
 */

const RECORDS: Record<string, { payload: Record<string, unknown> }> = {
  'RUN-DIRECT': { payload: { status: 'planned', updatedAt: '2026-09-06T10:00:00Z', startedAt: '2026-09-06T09:59:00Z' } },
  'RUN-LONE': { payload: { status: 'in_progress', updatedAt: '2026-09-06T11:00:00Z' } },
};

function makeHandlers(opts: { tree: unknown[]; unrooted: unknown[] }) {
  const indexManager = {
    getStudyTree: vi.fn().mockResolvedValue(opts.tree),
    query: vi.fn().mockResolvedValue(opts.unrooted),
  } as never;
  const recordStore = {
    get: vi.fn(async (id: string) => RECORDS[id] ?? null),
  } as never;
  const platformRegistry = { hasPlatform: () => false } as never;
  return createTreeHandlers(indexManager, recordStore, platformRegistry);
}

describe('createTreeHandlers.listRuns', () => {
  it('includes a study-level (direct, experiment-less) run', async () => {
    const handlers = makeHandlers({
      tree: [
        {
          recordId: 'STU-1',
          title: 'My Project',
          path: 'records/studies/STU-1/workspace.yaml',
          experiments: [],
          runs: [{ recordId: 'RUN-DIRECT', title: 'Sunday Run' }],
        },
      ],
      unrooted: [],
    });

    const res = (await handlers.listRuns(
      { query: {} } as never,
      {} as never,
    )) as { runs: unknown[]; total: number };

    expect(res.total).toBe(1);
    expect(res.runs[0]).toMatchObject({
      recordId: 'RUN-DIRECT',
      title: 'Sunday Run',
      status: 'planned',
      studyId: 'STU-1',
      studyTitle: 'My Project',
    });
    expect('experimentId' in (res.runs[0] as object)).toBe(false);
  });

  it('includes an unrooted run as Unassigned (no parent fields)', async () => {
    const handlers = makeHandlers({
      tree: [],
      unrooted: [{ recordId: 'RUN-LONE', title: 'Lone Run' }],
    });

    const res = (await handlers.listRuns(
      { query: {} } as never,
      {} as never,
    )) as { runs: Array<Record<string, unknown>>; total: number };

    expect(res.total).toBe(1);
    expect(res.runs[0].recordId).toBe('RUN-LONE');
    expect('studyId' in res.runs[0]).toBe(false);
    expect('experimentId' in res.runs[0]).toBe(false);
  });

  it('dedupes an unrooted run already placed by the tree', async () => {
    const handlers = makeHandlers({
      tree: [
        {
          recordId: 'STU-1',
          title: 'P',
          path: 'x',
          experiments: [],
          runs: [{ recordId: 'RUN-LONE', title: 'Lone Run' }],
        },
      ],
      // query returns the same run — it must NOT be double-listed.
      unrooted: [{ recordId: 'RUN-LONE', title: 'Lone Run' }],
    });

    const res = (await handlers.listRuns(
      { query: {} } as never,
      {} as never,
    )) as { runs: unknown[]; total: number };

    expect(res.total).toBe(1);
    expect(res.runs[0]).toMatchObject({ recordId: 'RUN-LONE', studyId: 'STU-1' });
  });
});
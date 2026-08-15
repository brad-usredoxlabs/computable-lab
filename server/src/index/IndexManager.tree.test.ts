/**
 * IndexManager.getStudyTree — Phase 12 verifies that artifacts get
 * attached to the most-specific tree node based on their links:
 *
 *   links.runId        → RunTreeNode.artifacts
 *   links.experimentId → ExperimentTreeNode.artifacts (and NOT also study)
 *   links.studyId      → StudyTreeNode.artifacts
 *   (no parent link)   → dropped (not surfaced in the Find tree)
 *
 * The pre-existing run record-counts behavior is unchanged.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IndexManager } from './IndexManager.js';
import type { IndexEntry, RecordIndex } from './types.js';

/**
 * Minimal in-memory repo that lets us seed the JSONL index file the
 * IndexManager loads on first use. Returns null for everything else
 * since getStudyTree doesn't reach back to YAML payloads.
 */
class MockRepoAdapter {
  private indexJsonl = '';

  setIndex(entries: IndexEntry[]): void {
    this.indexJsonl = entries.map((e) => JSON.stringify(e)).join('\n');
  }

  async getFile(
    path: string,
  ): Promise<{ content: string; sha: string } | null> {
    if (path === 'records/_index/records.jsonl') {
      return { content: this.indexJsonl, sha: 'mock' };
    }
    return null;
  }
  async listFiles(): Promise<string[]> {
    return [];
  }
  async fileExists(): Promise<boolean> {
    return false;
  }
  async createFile(): Promise<unknown> {
    return undefined;
  }
  async updateFile(): Promise<unknown> {
    return undefined;
  }
}

function entry(partial: Partial<IndexEntry> & { recordId: string; kind: string }): IndexEntry {
  return {
    schemaId: `https://example.com/${partial.kind}.schema.yaml`,
    status: 'filed',
    path: `records/${partial.kind}/${partial.recordId}.yaml`,
    ...partial,
  } as IndexEntry;
}

describe('IndexManager.getStudyTree — Phase 12 artifact attachment', () => {
  let repo: MockRepoAdapter;
  let mgr: IndexManager;

  beforeEach(() => {
    repo = new MockRepoAdapter();
    mgr = new IndexManager(repo as never);
  });

  it('study-only links land artifacts on StudyTreeNode.artifacts', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study', title: 'My study' }),
      entry({
        recordId: 'ART-1',
        kind: 'artifact',
        artifactKind: 'protocol',
        title: 'Buffer prep',
        links: { studyId: 'STU-1' },
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree).toHaveLength(1);
    expect(tree[0].recordId).toBe('STU-1');
    expect(tree[0].artifacts).toEqual([
      expect.objectContaining({
        recordId: 'ART-1',
        artifactKind: 'protocol',
        title: 'Buffer prep',
        studyId: 'STU-1',
      }),
    ]);
    expect(tree[0].experiments).toEqual([]);
  });

  it('experiment-scoped artifacts attach to the experiment, not the study', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study', title: 'S' }),
      entry({
        recordId: 'EXP-1',
        kind: 'experiment',
        title: 'E1',
        links: { studyId: 'STU-1' },
      }),
      entry({
        recordId: 'ART-EXP',
        kind: 'artifact',
        artifactKind: 'writeup',
        title: 'E1 writeup',
        links: { studyId: 'STU-1', experimentId: 'EXP-1' },
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].artifacts).toBeUndefined();
    expect(tree[0].experiments[0].artifacts).toEqual([
      expect.objectContaining({
        recordId: 'ART-EXP',
        artifactKind: 'writeup',
        experimentId: 'EXP-1',
      }),
    ]);
  });

  it('run-scoped artifacts attach to the run, not the experiment or study', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({ recordId: 'EXP-1', kind: 'experiment', links: { studyId: 'STU-1' } }),
      entry({
        recordId: 'RUN-1',
        kind: 'run',
        links: { studyId: 'STU-1', experimentId: 'EXP-1' },
      }),
      entry({
        recordId: 'ART-RUN',
        kind: 'artifact',
        artifactKind: 'pdf',
        title: 'Run 1 PDF',
        links: { studyId: 'STU-1', experimentId: 'EXP-1', runId: 'RUN-1' },
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].artifacts).toBeUndefined();
    expect(tree[0].experiments[0].artifacts).toBeUndefined();
    expect(tree[0].experiments[0].runs[0].artifacts).toEqual([
      expect.objectContaining({
        recordId: 'ART-RUN',
        artifactKind: 'pdf',
        experimentId: 'EXP-1',
      }),
    ]);
  });

  it('orphan artifacts (no parent link) are dropped from the tree', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({
        recordId: 'ART-ORPHAN',
        kind: 'artifact',
        artifactKind: 'protocol',
        // no links at all
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].artifacts).toBeUndefined();
  });

  it('artifactKind falls back to "unknown" when the IndexEntry lacks it', async () => {
    // An older record indexed before Phase 12 wouldn't carry artifactKind.
    // The tree still surfaces it so the Find tab can render *something*.
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({
        recordId: 'ART-OLD',
        kind: 'artifact',
        title: 'Legacy',
        links: { studyId: 'STU-1' },
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].artifacts?.[0].artifactKind).toBe('unknown');
  });

  it('mixes attribution levels in a single study', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({ recordId: 'EXP-1', kind: 'experiment', links: { studyId: 'STU-1' } }),
      entry({
        recordId: 'RUN-1',
        kind: 'run',
        links: { studyId: 'STU-1', experimentId: 'EXP-1' },
      }),
      entry({
        recordId: 'ART-S',
        kind: 'artifact',
        artifactKind: 'training',
        links: { studyId: 'STU-1' },
      }),
      entry({
        recordId: 'ART-E',
        kind: 'artifact',
        artifactKind: 'writeup',
        links: { studyId: 'STU-1', experimentId: 'EXP-1' },
      }),
      entry({
        recordId: 'ART-R',
        kind: 'artifact',
        artifactKind: 'pdf',
        links: { studyId: 'STU-1', experimentId: 'EXP-1', runId: 'RUN-1' },
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].artifacts).toEqual([
      expect.objectContaining({ recordId: 'ART-S' }),
    ]);
    expect(tree[0].experiments[0].artifacts).toEqual([
      expect.objectContaining({ recordId: 'ART-E' }),
    ]);
    expect(tree[0].experiments[0].runs[0].artifacts).toEqual([
      expect.objectContaining({ recordId: 'ART-R' }),
    ]);
  });

  it('attaches project-scoped protocols and inventory as a query-derived protocol library', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({
        recordId: 'PRT-1',
        kind: 'protocol',
        title: 'Vendor protocol',
        links: { studyId: 'STU-1' },
      }),
      entry({
        recordId: 'LPR-1',
        kind: 'local-protocol',
        title: 'Bench method',
        links: { studyId: 'STU-1' },
      }),
      entry({
        recordId: 'PLR-1',
        kind: 'planned-run',
        title: 'Run intent',
        links: { studyId: 'STU-1' },
      }),
      entry({
        recordId: 'ALQ-1',
        kind: 'aliquot',
        title: 'Prepared stock',
        links: { studyId: 'STU-1' },
      }),
    ]);

    const tree = await mgr.getStudyTree();

    expect(tree[0].protocolLibrary?.protocols).toEqual([
      expect.objectContaining({ recordId: 'PRT-1' }),
    ]);
    expect(tree[0].protocolLibrary?.localProtocols).toEqual([
      expect.objectContaining({ recordId: 'LPR-1' }),
    ]);
    expect(tree[0].protocolLibrary?.plannedRuns).toEqual([
      expect.objectContaining({ recordId: 'PLR-1' }),
    ]);
    expect(tree[0].protocolLibrary?.inventory).toEqual([
      expect.objectContaining({ recordId: 'ALQ-1' }),
    ]);
  });

  it('study with no artifacts at any level omits the artifacts field', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({ recordId: 'EXP-1', kind: 'experiment', links: { studyId: 'STU-1' } }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].artifacts).toBeUndefined();
    expect(tree[0].experiments[0].artifacts).toBeUndefined();
  });

  it('preserves run recordCounts independent of artifact attachment', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({ recordId: 'EXP-1', kind: 'experiment', links: { studyId: 'STU-1' } }),
      entry({
        recordId: 'RUN-1',
        kind: 'run',
        links: { studyId: 'STU-1', experimentId: 'EXP-1' },
      }),
      entry({
        recordId: 'EVG-1',
        kind: 'event-graph',
        links: { runId: 'RUN-1' },
      }),
      entry({
        recordId: 'ART-1',
        kind: 'artifact',
        artifactKind: 'pdf',
        links: { runId: 'RUN-1' },
      }),
    ]);
    const tree = await mgr.getStudyTree();
    const run = tree[0].experiments[0].runs[0];
    expect(run.recordCounts.eventGraphs).toBe(1);
    expect(run.artifacts).toHaveLength(1);
  });

  // ── Flattened ownership (2026-08-15 schema audit, Task 6) ──────────────
  // The run schema makes experiment an OPTIONAL grouping: a run may link to
  // its study directly (studyId), to multiple studies (projectIds[]), or to
  // an experiment. The tree must surface all three; before this fix, a run
  // without an experimentId was invisible in the Projects tree.

  it('shows a run under the study (no experiment) via studyId', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({
        recordId: 'RUN-1',
        kind: 'run',
        links: { studyId: 'STU-1' },
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].runs).toEqual([
      expect.objectContaining({ recordId: 'RUN-1', studyId: 'STU-1' }),
    ]);
    expect(tree[0].experiments).toEqual([]);
  });

  it('shows a run under EACH study in projectIds[]', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({ recordId: 'STU-2', kind: 'study' }),
      entry({
        recordId: 'RUN-1',
        kind: 'run',
        projectIds: ['STU-1', 'STU-2'],
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].runs).toEqual([
      expect.objectContaining({ recordId: 'RUN-1' }),
    ]);
    expect(tree[1].runs).toEqual([
      expect.objectContaining({ recordId: 'RUN-1' }),
    ]);
  });

  it('still nests experiment-linked runs under their experiment', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({ recordId: 'EXP-1', kind: 'experiment', links: { studyId: 'STU-1' } }),
      entry({
        recordId: 'RUN-1',
        kind: 'run',
        links: { studyId: 'STU-1', experimentId: 'EXP-1' },
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].experiments[0].runs).toEqual([
      expect.objectContaining({ recordId: 'RUN-1', experimentId: 'EXP-1' }),
    ]);
    // An experiment-nested run is NOT also duplicated at study level
    expect(tree[0].runs).toBeUndefined();
  });

  it('does not duplicate an experiment-nested run at study level when both links exist', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({ recordId: 'EXP-1', kind: 'experiment', links: { studyId: 'STU-1' } }),
      entry({
        recordId: 'RUN-1',
        kind: 'run',
        links: { studyId: 'STU-1', experimentId: 'EXP-1' },
        projectIds: ['STU-1'],
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].experiments[0].runs).toHaveLength(1);
    expect(tree[0].runs).toBeUndefined();
  });

  it('keeps study-level runs out of experiments and vice versa (mixed tree)', async () => {
    repo.setIndex([
      entry({ recordId: 'STU-1', kind: 'study' }),
      entry({ recordId: 'EXP-1', kind: 'experiment', links: { studyId: 'STU-1' } }),
      entry({
        recordId: 'RUN-EXP',
        kind: 'run',
        links: { studyId: 'STU-1', experimentId: 'EXP-1' },
      }),
      entry({
        recordId: 'RUN-DIRECT',
        kind: 'run',
        links: { studyId: 'STU-1' },
      }),
      entry({
        recordId: 'RUN-MULTI',
        kind: 'run',
        projectIds: ['STU-1'],
      }),
    ]);
    const tree = await mgr.getStudyTree();
    expect(tree[0].experiments[0].runs).toEqual([
      expect.objectContaining({ recordId: 'RUN-EXP' }),
    ]);
    expect(tree[0].runs?.map(r => r.recordId).sort()).toEqual([
      'RUN-DIRECT',
      'RUN-MULTI',
    ]);
  });
});

// Marker so the file isn't flagged as missing exports under isolatedModules.
export const __PHASE_12_INDEX_MANAGER_TREE_TEST__: undefined = undefined;
// Avoid `RecordIndex` unused-import lint by referencing the type once.
type _Touch = RecordIndex;

/**
 * resolveReviewTrees — the handbook case: one artifact (one PDF), MANY trees
 * derived from the same bytes, ALL returned. Plus the compat guarantees:
 * basename fallback stays first-match; no-match reports the gap.
 */
import { describe, expect, it } from 'vitest';
import { resolveReviewTrees } from './reviewDocuments.js';

const SHA_A = 'a'.repeat(64);

function tree(recordId: string, sourcePdf: Record<string, unknown>) {
  return { recordId, documentId: `doc-${recordId}`, sourcePdf };
}

describe('resolveReviewTrees', () => {
  it('returns EVERY sha256-matching tree for a handbook artifact', () => {
    const res = resolveReviewTrees({
      file: { sha256: SHA_A, stored_path: 'artifacts/foundry/pdfs/dneasy.pdf' },
      trees: [
        tree('PDT-dneasy__tissue-96', { sha256: SHA_A, artifactPath: '/x/dneasy.pdf' }),
        tree('PDT-dneasy__blood-spin', { sha256: SHA_A, artifactPath: '/x/dneasy.pdf' }),
        tree('PDT-dneasy__blood-96', { sha256: SHA_A, artifactPath: '/x/dneasy.pdf' }),
        tree('PDT-other-kit', { sha256: 'b'.repeat(64), artifactPath: '/x/other.pdf' }),
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.matchVia).toBe('sha256');
    expect(res.matches.map((m) => m.treeRecordId)).toEqual([
      'PDT-dneasy__blood-96',
      'PDT-dneasy__blood-spin',
      'PDT-dneasy__tissue-96',
    ]);
    expect(res.matches[0]).toMatchObject({ documentId: 'doc-PDT-dneasy__blood-96' });
  });

  it('a single tree yields a one-element match list (no behavior change for single-protocol docs)', () => {
    const res = resolveReviewTrees({
      file: { sha256: SHA_A },
      trees: [tree('PDT-kit', { sha256: SHA_A })],
    });
    expect(res.ok && res.matches).toHaveLength(1);
  });

  it('falls back to the stored file name — first match only (legacy, pre-sha)', () => {
    const res = resolveReviewTrees({
      file: { stored_path: 'artifacts/foundry/pdfs/Zymo.pdf' },
      trees: [
        tree('PDT-legacy-b', { artifactPath: '/elsewhere/Zymo.pdf' }),
        tree('PDT-legacy-a', { artifactPath: '/somewhere/ZYMO.PDF' }),
      ],
    });
    expect(res.ok && res.matchVia).toBe('stored_path_basename');
    expect(res.ok && res.matches).toHaveLength(1);
    expect(res.ok && res.matches[0]?.treeRecordId).toBe('PDT-legacy-a');
  });

  it('reports the gap with candidates when nothing matches', () => {
    const res = resolveReviewTrees({
      file: { sha256: SHA_A },
      trees: [tree('PDT-unrelated', { sha256: 'c'.repeat(64) })],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.gap).toContain('no decision tree');
    expect(res.candidates).toEqual(['PDT-unrelated']);
  });
});

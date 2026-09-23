/**
 * resolveReviewTrees — the PLURAL join: an artifact's bytes can be the source
 * of MANY decision trees when the PDF is a handbook (the section split derives
 * one tree per protocol section, all sharing the same sourcePdf.sha256).
 *
 * Matching semantics are the sibling resolveReviewTree's, unchanged:
 *   1. sha256 first — EVERY tree whose sourcePdf.sha256 equals the artifact's
 *      is returned, in recordId order (a handbook never silently hides 7 of
 *      its 8 protocols);
 *   2. stored_path_basename fallback stays FIRST-match (legacy trees from
 *      before the sha was recorded — one name, one pre-split tree);
 *   3. otherwise UNRESOLVED with the candidates it saw.
 *
 * resolveReviewTree (singular) keeps its exact contract by delegating:
 * ok:true + first of the sha matches, else the basename first-match.
 */

import { storedBasename, type ReviewTreeLike, type VendorPdfFileLike } from './resolveReviewDocument.js';

export type ReviewTreeMatchPlural =
  | {
      ok: true;
      matchVia: 'sha256' | 'stored_path_basename';
      matches: Array<{ treeRecordId: string; documentId: string }>;
    }
  | { ok: false; gap: string; candidates: string[] };

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function shaOf(value: unknown): string {
  return asString(value).toLowerCase();
}

const GAP_MESSAGE =
  'no decision tree was derived from this vendor PDF (intake has not run, or its provenance does not match this artifact)';

export function resolveReviewTrees(input: {
  file?: VendorPdfFileLike | null;
  trees: ReviewTreeLike[];
}): ReviewTreeMatchPlural {
  const ordered = [...input.trees].sort((a, b) =>
    asString(a.recordId).localeCompare(asString(b.recordId)),
  );
  const candidates = ordered.map((t) => asString(t.recordId)).filter((id) => id.length > 0);

  const wantedSha = shaOf(input.file?.sha256);
  if (wantedSha.length > 0) {
    const matches: Array<{ treeRecordId: string; documentId: string }> = [];
    for (const tree of ordered) {
      const sourcePdf = (tree.sourcePdf ?? {}) as Record<string, unknown>;
      if (shaOf(sourcePdf['sha256']) === wantedSha) {
        const treeRecordId = asString(tree.recordId);
        if (treeRecordId.length > 0) {
          matches.push({ treeRecordId, documentId: asString(tree.documentId) });
        }
      }
    }
    if (matches.length > 0) return { ok: true, matchVia: 'sha256', matches };
  }

  const wantedName = storedBasename(
    asString(input.file?.stored_path) || asString(input.file?.file_name),
  );
  if (wantedName.length > 0) {
    for (const tree of ordered) {
      const sourcePdf = (tree.sourcePdf ?? {}) as Record<string, unknown>;
      const treeName = storedBasename(asString(sourcePdf['artifactPath']));
      if (treeName.length > 0 && treeName === wantedName) {
        return {
          ok: true,
          matchVia: 'stored_path_basename',
          matches: [{ treeRecordId: asString(tree.recordId), documentId: asString(tree.documentId) }],
        };
      }
    }
  }

  return { ok: false, gap: GAP_MESSAGE, candidates };
}

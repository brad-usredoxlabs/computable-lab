/**
 * resolveReviewTree — join a `vendor-pdf` ARTIFACT record to the intake decision
 * tree derived from the same document.
 *
 * Why this exists: the two halves of the protocol pipeline name the same PDF
 * differently. The artifact store writes VPDF records with
 * `file.stored_path` ('artifacts/foundry/pdfs/ZymoBIOMICS-96-MagBead-DNA-Kit.pdf')
 * and `file.sha256`; the intake tree carries `sourcePdf.artifactPath` — which
 * the nightly corpus crawl stores ABSOLUTE and possibly URL-encoded. Without a
 * deliberate join, the review surface can only guess.
 *
 * The join is content-first and never guesses:
 *   1. `sha256`: tree.sourcePdf.sha256 === file.sha256  (the PDF bytes;
 *      survives renames, re-downloads and different stored filenames);
 *   2. `stored_path_basename`: same file name after decoding (legacy trees
 *      derived before the sha was recorded);
 *   3. otherwise UNRESOLVED — the caller reports the gap and lists the trees it
 *      did see, so a human can fix the provenance rather than the code inventing
 *      a match.
 *
 * Pure and deterministic: trees are evaluated in a stable order and the result
 * depends only on its inputs.
 */

export interface VendorPdfFileLike {
  stored_path?: unknown;
  sha256?: unknown;
  file_name?: unknown;
}

export interface ReviewTreeLike {
  recordId?: unknown;
  documentId?: unknown;
  sourcePdf?: unknown;
}

export type ReviewTreeMatch =
  | { ok: true; treeRecordId: string; documentId: string; matchVia: 'sha256' | 'stored_path_basename' }
  | { ok: false; gap: string; candidates: string[] };

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function shaOf(value: unknown): string {
  return asString(value).toLowerCase();
}

/** Last path segment, URL-decoded and lowercased ('.../a%20b.pdf' -> 'a b.pdf'). */
export function storedBasename(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Malformed percent-encoding: compare the raw string rather than throwing.
  }
  const parts = decoded.split(/[\\/]/).filter((p) => p.length > 0);
  return (parts[parts.length - 1] ?? '').trim().toLowerCase();
}

export function resolveReviewTree(input: {
  file?: VendorPdfFileLike | null;
  trees: ReviewTreeLike[];
}): ReviewTreeMatch {
  const ordered = [...input.trees].sort((a, b) =>
    asString(a.recordId).localeCompare(asString(b.recordId)),
  );
  const candidates = ordered.map((t) => asString(t.recordId)).filter((id) => id.length > 0);

  const wantedSha = shaOf(input.file?.sha256);
  if (wantedSha.length > 0) {
    for (const tree of ordered) {
      const sourcePdf = (tree.sourcePdf ?? {}) as Record<string, unknown>;
      if (shaOf(sourcePdf['sha256']) === wantedSha) {
        return {
          ok: true,
          treeRecordId: asString(tree.recordId),
          documentId: asString(tree.documentId),
          matchVia: 'sha256',
        };
      }
    }
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
          treeRecordId: asString(tree.recordId),
          documentId: asString(tree.documentId),
          matchVia: 'stored_path_basename',
        };
      }
    }
  }

  return {
    ok: false,
    gap: 'no decision tree was derived from this vendor PDF (intake has not run, or its provenance does not match this artifact)',
    candidates,
  };
}
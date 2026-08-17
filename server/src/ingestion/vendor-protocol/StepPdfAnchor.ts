/**
 * StepPdfAnchor — map a protocol step to a stable PDF text anchor (Plan 1, F1).
 *
 * The ingest extractor records each step's `sourceText` and
 * `provenance.pageStart`. Given the vendor document's per-page extracted text
 * (the same array both the PDF viewer and the extracted-text panel render),
 * produce a stable anchor `{ page, startText, endText }` so BOTH views can
 * scroll to and highlight the same span.
 *
 * Pure + deterministic. Falls back to the step's declared pageStart with a
 * neutral anchor when the sourceText cannot be located (best-effort — never
 * throws).
 */

export interface PdfPageText {
  text?: string;
  page?: number;
  [k: string]: unknown;
}

export interface PdfAnchor {
  /** 1-based page number. */
  page: number;
  /** Stable leading token(s) used to locate/highlight in the extracted text. */
  startText: string;
  /** Optional trailing token for an exact span. */
  endText?: string;
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Locate a step's sourceText in the document's per-page extracted text and
 * return a stable anchor. `pages` may be 0-indexed arrays; we normalize to
 * 1-based pages for the viewer.
 */
export function anchorForStep(
  pages: PdfPageText[],
  sourceText: string,
  pageStart = 1,
): PdfAnchor {
  const target = norm(sourceText);
  const tokens = target.split(' ').filter((t) => t.length > 1);

  // Try to find the page whose text contains a distinctive slice of the step.
  for (const p of pages) {
    const body = norm(p.text ?? '');
    if (!body) continue;
    // A long distinctive chunk first, else the full target.
    const probe = target.length > 40 ? target.slice(0, 40) : target;
    if (probe.length > 0 && body.includes(norm(probe))) {
      return {
        page: typeof p.page === 'number' ? p.page : pageStart,
        startText: tokens[0] ?? probe.slice(0, 20),
      };
    }
  }

  // Not found: best-effort fallback to the declared page with a neutral anchor.
  return { page: pageStart, startText: tokens[0] ?? '' };
}

/**
 * Build the extracted-text span for highlighting: page + the sourceText line.
 * The extracted-text panel highlights by searching `startText..endText`.
 */
export function spanForExtracted(pages: PdfPageText[], sourceText: string, pageStart = 1): PdfAnchor {
  const anchor = anchorForStep(pages, sourceText, pageStart);
  const body = norm(sourceText);
  return {
    ...anchor,
    ...(body.length > 2 ? { startText: body.slice(0, 60), endText: body.slice(-40) } : {}),
  };
}
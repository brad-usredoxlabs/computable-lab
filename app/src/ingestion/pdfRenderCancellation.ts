/**
 * pdf.js paint bookkeeping for the vendor-PDF review pane.
 *
 * pdf.js paints a page by applying the page's viewport transform to the canvas
 * context. For these manuals that transform is [1, 0, 0, -1, 0, H] — a pure
 * y-flip that maps PDF space (y up) onto canvas space (y down). Applying it
 * TWICE to one canvas leaves the page upside-down, so two overlapping paints of
 * the same page are a correctness bug, not just wasted work: the reviewer sees
 * a mirrored page and cannot read the document they are authoring from.
 *
 * Overlap is easy to hit here — the pane renders every page of a 69-page
 * handbook, then re-renders when the pane is measured, when the split moves,
 * when the zoom changes, and when the extraction payload arrives (which is why
 * the flip is reported at the END of an ingestion). A newer paint therefore
 * cancels the older one and waits for it to unwind before touching the canvas.
 */

/**
 * Is this the cancellation pdf.js raises when a paint was superseded?
 *
 * Treating it as a failure would fill the console with "Failed to render page"
 * for pages that are about to be painted correctly.
 */
export function isCancelledRender(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const name = (error as { name?: unknown }).name;
  return name === 'RenderingCancelledException';
}

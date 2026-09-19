/**
 * PDF zoom geometry — pure, so the arithmetic that decides "does this page fit
 * in its pane" is testable without a canvas.
 *
 * The bug this answers: the preview rendered every page at a fixed
 * `scale: 1.4`, which is wider than the review pane on a laptop, so the PDF
 * scrolled out of the window horizontally with no way to zoom back out.
 */

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 3

/** Clamp a scale into the supported range. */
export function clampZoom(scale: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(max, Math.max(min, scale))
}

/**
 * The scale at which a page exactly fits the pane's width.
 *
 * `paneWidth` is the container's inner width; `pageWidth` is the page's width at
 * scale 1; `paddingPx` is the horizontal breathing room the container keeps on
 * each side (the pages column pads 16px per side).
 */
export function fitWidthScale(
  paneWidth: number,
  pageWidth: number,
  paddingPx: number,
  min = MIN_ZOOM,
  max = MAX_ZOOM,
): number {
  if (!Number.isFinite(paneWidth) || !Number.isFinite(pageWidth) || pageWidth <= 0) return 1
  const usable = paneWidth - paddingPx * 2
  if (usable <= 0) return min
  return clampZoom(usable / pageWidth, min, max)
}

/** One zoom step, clamped. `direction` is +1 (in) or -1 (out). */
export function steppedZoom(scale: number, direction: 1 | -1, step = 0.15): number {
  return clampZoom(scale + step * direction)
}
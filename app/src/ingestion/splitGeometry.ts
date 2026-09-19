/**
 * Split-pane geometry — pure, so the arithmetic that turns a pointer position
 * into a pane width is testable without a DOM drag.
 *
 * The bug this answers: the drag delta was applied correctly, but the pointer
 * handlers lived on a 6px handle with no pointer capture, so the drag ended the
 * moment the pointer left the handle — the split felt "largely borked" rather
 * than unusable.
 */

/** How much of the pane container each side may take. */
export const MIN_SPLIT_PCT = 15
export const MAX_SPLIT_PCT = 85
export const DEFAULT_SPLIT_PCT = 40

/** Clamp a split percentage into the usable range. */
export function clampSplitPct(pct: number, min = MIN_SPLIT_PCT, max = MAX_SPLIT_PCT): number {
  if (!Number.isFinite(pct)) return DEFAULT_SPLIT_PCT
  return Math.min(max, Math.max(min, pct))
}

/**
 * The left pane's share of the container after dragging the handle from
 * `startX` to `clientX`. `panelWidth` is the container's width in px.
 */
export function splitPctFromDrag(input: {
  startPct: number;
  startX: number;
  clientX: number;
  panelWidth: number;
  min?: number;
  max?: number;
}): number {
  const { startPct, startX, clientX, panelWidth } = input;
  if (!Number.isFinite(panelWidth) || panelWidth <= 0) return clampSplitPct(startPct, input.min, input.max);
  const deltaPct = ((clientX - startX) / panelWidth) * 100;
  return clampSplitPct(startPct + deltaPct, input.min, input.max);
}

/** Keyboard nudge for the focused handle (arrow keys). */
export function nudgeSplitPct(pct: number, direction: 1 | -1, step = 2): number {
  return clampSplitPct(pct + step * direction);
}
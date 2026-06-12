import type { WellComputedState } from './eventGraph'

/**
 * Stable, composition-based signature for a well. Two wells that resolve to the
 * same signature are replicates — same materials at the same concentrations,
 * same harvest/incubation treatment — and should render in the same hue,
 * regardless of which individual events produced them.
 *
 * Deliberately built from the *derived composition*, NOT the raw eventHistory:
 * two wells filled by separate-but-identical add_material events carry distinct
 * event IDs yet are true replicates, so event IDs must never enter the key.
 * Absolute volume is likewise excluded — a 100 µL and a 200 µL well of the same
 * recipe are the same condition.
 *
 * Returns null for an empty well (no hue).
 */
export function wellCompositionSignature(
  state: WellComputedState | null | undefined,
): string | null {
  if (!state) return null
  const hasContent =
    state.materials.length > 0 || state.harvested || state.volume_uL > 0
  if (!hasContent) return null

  const materialTokens = state.materials
    .map((m) => {
      const conc = m.concentrationUnknown
        ? '?'
        : m.concentration
          ? `${m.concentration.value}${m.concentration.unit}`
          : ''
      return `${m.materialRef}~${m.role ?? ''}~${conc}`
    })
    .sort()

  const incubationTokens = state.incubations
    .map(
      (i) =>
        `${i.duration ?? ''}@${
          i.temperature ? `${i.temperature.value}${i.temperature.unit}` : ''
        }`,
    )
    .sort()

  return JSON.stringify({
    m: materialTokens,
    h: state.harvested,
    i: incubationTokens,
  })
}

export interface WellHueStyle {
  fill: string
  stroke: string
}

// Golden-angle hue stepping gives well-separated, visually distinct hues for an
// arbitrary number of conditions without the colors of later conditions
// collapsing toward earlier ones. The start offset lands the first condition in
// the cyan/teal range and away from the amber selection ring (~45°).
const HUE_START = 200
const HUE_STEP = 137.508

/** Hue (degrees) for the i-th distinct composition on a plate. */
export function compositionHue(index: number): number {
  return (HUE_START + index * HUE_STEP) % 360
}

/**
 * Fill + stroke for a composition hue. Membership in a knowledge-layer group is
 * a *modifier*: grouped wells render vivid (the condition is semantically
 * committed), ungrouped wells render muted (composition known, not yet grouped).
 * Selection is handled separately as an amber ring overlaid by the grid.
 */
export function compositionWellStyle(
  hue: number,
  opts: { inGroup: boolean },
): WellHueStyle {
  if (opts.inGroup) {
    return {
      fill: `hsl(${hue} 72% 55% / 0.42)`,
      stroke: `hsl(${hue} 78% 62% / 0.95)`,
    }
  }
  return {
    fill: `hsl(${hue} 45% 52% / 0.22)`,
    stroke: `hsl(${hue} 52% 60% / 0.75)`,
  }
}

/**
 * Build a per-well fill/stroke map for one labware, assigning a distinct hue to
 * each distinct composition signature (replicates share a hue). `wellOrder`
 * should be a stable ordering (e.g. sorted well IDs) so a given condition keeps
 * its hue as the plate grows. `groupWells` are wells assigned to any
 * knowledge-layer group.
 */
export function buildCompositionStyles(
  wellOrder: string[],
  signatureOf: (wellId: string) => string | null,
  groupWells: ReadonlySet<string>,
): Map<string, WellHueStyle> {
  const hueBySig = new Map<string, number>()
  const sigByWell = new Map<string, string>()
  for (const wellId of wellOrder) {
    const sig = signatureOf(wellId)
    if (!sig) continue
    sigByWell.set(wellId, sig)
    if (!hueBySig.has(sig)) hueBySig.set(sig, compositionHue(hueBySig.size))
  }
  const styles = new Map<string, WellHueStyle>()
  for (const [wellId, sig] of sigByWell) {
    styles.set(
      wellId,
      compositionWellStyle(hueBySig.get(sig)!, { inGroup: groupWells.has(wellId) }),
    )
  }
  return styles
}

export interface CompositionLegendEntry {
  signature: string
  /** Swatch styling (vivid when any well of this condition is grouped). */
  fill: string
  stroke: string
  /** Human-readable composition, e.g. "clofibrate @ 1 mM". */
  label: string
  /** All wells holding this composition (the replicate set, in plate order). */
  wells: string[]
  /** How many of those wells are in a knowledge-layer group. */
  groupedCount: number
}

/**
 * Ordered legend of the distinct compositions on a labware — one entry per hue.
 * Hues are assigned in the same appearance order as {@link buildCompositionStyles}
 * (same `wellOrder` → matching colors), so the legend's swatches line up with
 * the well fills.
 */
export function buildCompositionLegend(
  wellOrder: string[],
  signatureOf: (wellId: string) => string | null,
  labelOf: (wellId: string) => string,
  groupWells: ReadonlySet<string>,
): CompositionLegendEntry[] {
  const bySig = new Map<
    string,
    { hue: number; wells: string[]; grouped: number; label: string }
  >()
  for (const wellId of wellOrder) {
    const sig = signatureOf(wellId)
    if (!sig) continue
    let entry = bySig.get(sig)
    if (!entry) {
      entry = {
        hue: compositionHue(bySig.size),
        wells: [],
        grouped: 0,
        label: labelOf(wellId),
      }
      bySig.set(sig, entry)
    }
    entry.wells.push(wellId)
    if (groupWells.has(wellId)) entry.grouped += 1
  }
  return [...bySig.entries()].map(([signature, e]) => {
    const style = compositionWellStyle(e.hue, { inGroup: e.grouped > 0 })
    return {
      signature,
      fill: style.fill,
      stroke: style.stroke,
      label: e.label,
      wells: e.wells,
      groupedCount: e.grouped,
    }
  })
}

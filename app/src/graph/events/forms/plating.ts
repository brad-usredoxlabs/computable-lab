/**
 * computePlating — derive suspension + top-up volumes for count-based seeding.
 *
 * The scientist's real workflow: get the source off the plate → count it on a
 * counter → add N biological units per well by the volume that carries them →
 * top up to final volume. `count` is the invariant; volume derives.
 *
 *   suspension_µl = count / counter_density_per_µl
 *   top_up_µl     = final_volume_µl − suspension_µl
 *
 * Parameterized by unit, so it works for cells, worms, organoids, CFU — the
 * caller supplies the count in the type's units. Pure + total; no I/O.
 */

export interface PlatingInput {
  /** Number of biological units per well (cells, worms, organoids, CFU). */
  count: number | undefined
  /** Optional source/counter density in per-µL units (e.g. cells/µL). */
  densityPerUl?: number | undefined
  /** Final volume per well in µL. */
  finalVolumeUl: number | undefined
}

export interface PlatingResult {
  /** Volume of source suspension that carries `count` units (µL). */
  suspensionUl?: number
  /** Volume of diluent/top-up to reach final volume (µL). May be negative when
   *  the density implies more suspension than the final volume allows. */
  topUpUl?: number
}

export function computePlating({ count, densityPerUl, finalVolumeUl }: PlatingInput): PlatingResult {
  const countOk = typeof count === 'number' && Number.isFinite(count) && count > 0
  const finalOk = typeof finalVolumeUl === 'number' && Number.isFinite(finalVolumeUl) && finalVolumeUl > 0
  if (!countOk || !finalOk) return {}

  // Without a density we cannot derive anything — the form just asks for
  // count + final volume (the generic count+volume fallback).
  if (densityPerUl === undefined || !Number.isFinite(densityPerUl) || densityPerUl <= 0) return {}

  const suspensionUl = count / densityPerUl
  const topUpUl = finalVolumeUl - suspensionUl
  return { suspensionUl, topUpUl }
}
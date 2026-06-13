/**
 * Shared tube-size presets for the lightweight tube-occupancy feature.
 *
 * Single source of truth for the deck "Place tube" picker and the AI `/t`
 * (tube) slash command, so the two never offer different sizes. Placement is
 * permissive — these are convenience presets, not a constraint; capacity
 * follows whichever tube is placed.
 */

import type { TubeDescriptor } from './events'

export const TUBE_SIZE_PRESETS: readonly TubeDescriptor[] = [
  { sizeLabel: '0.2 mL', maxVolume_uL: 200, wellShape: 'round' },
  { sizeLabel: '0.5 mL', maxVolume_uL: 500, wellShape: 'round' },
  { sizeLabel: '1.5 mL', maxVolume_uL: 1500, wellShape: 'round' },
  { sizeLabel: '2 mL', maxVolume_uL: 2000, wellShape: 'round' },
  { sizeLabel: '5 mL', maxVolume_uL: 5000, wellShape: 'round' },
  { sizeLabel: '15 mL', maxVolume_uL: 15000, wellShape: 'conical' },
  { sizeLabel: '50 mL', maxVolume_uL: 50000, wellShape: 'conical' },
]

/** The preset whose nominal capacity is closest to a given volume. */
export function nearestTubePreset(maxVolume_uL: number): TubeDescriptor {
  let best = TUBE_SIZE_PRESETS[0]
  let bestDiff = Infinity
  for (const preset of TUBE_SIZE_PRESETS) {
    const diff = Math.abs(preset.maxVolume_uL - maxVolume_uL)
    if (diff < bestDiff) {
      bestDiff = diff
      best = preset
    }
  }
  return best
}

/** Filter presets by a free-text query (substring match on the size label). */
export function filterTubePresets(query: string): readonly TubeDescriptor[] {
  const q = query.trim().toLowerCase()
  if (!q) return TUBE_SIZE_PRESETS
  return TUBE_SIZE_PRESETS.filter((preset) => preset.sizeLabel.toLowerCase().includes(q))
}

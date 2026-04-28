import { useMemo } from 'react'
import type { PlatformManifest } from '../../types/platformRegistry'
import { getPlatformManifest } from '../../shared/lib/platformRegistry'

const ALLOWED_PLATFORM_IDS = ['manual', 'integra_assist', 'opentrons_ot2', 'opentrons_flex'] as const

interface DeckPickerSelectProps {
  platforms: PlatformManifest[]
  currentPlatformId: string
  onPlatformChange: (platformId: string) => void
}

export function DeckPickerSelect({
  platforms,
  currentPlatformId,
  onPlatformChange,
}: DeckPickerSelectProps) {
  const allowedPlatforms = useMemo(
    () => platforms.filter((p) => ALLOWED_PLATFORM_IDS.includes(p.id as typeof ALLOWED_PLATFORM_IDS[number])),
    [platforms],
  )

  const currentManifest = useMemo(
    () => getPlatformManifest(platforms, currentPlatformId),
    [platforms, currentPlatformId],
  )

  return (
    <label className="binding-deck-picker">
      <span className="binding-deck-picker__label">Deck</span>
      <select
        value={currentManifest?.id ?? currentPlatformId}
        onChange={(e) => onPlatformChange(e.target.value)}
      >
        {allowedPlatforms.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
    </label>
  )
}

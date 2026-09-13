import type { DragEvent } from 'react'
import type { Equipment } from '../../types/equipment'
import type { EventEditorPlacement, LabwareOrientation } from '../types'
import { InstrumentGlyph } from './InstrumentGlyphs'

/**
 * Render one first-class Equipment entity on the bench. An equipment is NOT
 * labware — no wells, no geometry — so this renders the instrument silhouette
 * (from `equipment.instrumentKind`), the name, and a read-only settings chip
 * (e.g. "55 °C" for a water bath) instead of a well grid. Live settings
 * editing is a later pass; this pass prototypes the read-only chip.
 */

interface EquipmentTileProps {
  equipment: Equipment
  placement: EventEditorPlacement
  orientation: LabwareOrientation
  variant: 'slot' | 'lawn'
  width?: number
  height?: number
  /** True when this tile is a proposed AI placement (rendered as a ghost). */
  ghost?: boolean
  onRemove?: () => void
  onFocus?: () => void
}

const LAWN_LANDSCAPE = { w: 110, h: 70 }
const LAWN_PORTRAIT = { w: 70, h: 110 }

/** Render a settings entry key : value as human text, e.g. { temperature_c: 55 } → "55 °C". */
export function formatSettingKey(key: string): string {
  if (key === 'temperature_c') return '°C'
  return key.replace(/_/g, ' ')
}

export function formatSettingValue(value: unknown): string {
  if (value === true) return 'on'
  if (value === false) return 'off'
  return String(value)
}

/** Concise chip label for a cycling-program settings value. */
export function formatProfileChip(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as { initial?: unknown; cycles?: { count?: unknown; steps?: Array<{ temperature_c?: unknown; duration_sec?: unknown }> } }
  const cycles = v.cycles
  if (!cycles || !Array.isArray(cycles.steps) || cycles.steps.length === 0) return null
  const stepsLabel = cycles.steps.map((s) => `${s.temperature_c}°C/${s.duration_sec}s`).join(' · ')
  return `${cycles.count}× (${stepsLabel})`
}

export function settingsChipText(equipment: Equipment): string | null {
  const entries = Object.entries(equipment.settings ?? {})
  if (entries.length === 0) return null
  return entries
    .map(([key, value]) => {
      // A cycling program gets a concise profile chip, not "[object Object]".
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'cycles' in value) {
        const profile = formatProfileChip(value)
        return profile ? `${formatSettingKey(key).replace(/\s+$/g, '')}: ${profile}` : null
      }
      const unit = formatSettingKey(key)
      // temperature_c is a number of degrees; keep the numeric value + unit.
      if (key === 'temperature_c') return `${String(value)} ${unit}`
      return `${unit}: ${formatSettingValue(value)}`
    })
    .filter((s) => s !== null)
    .join(' · ')
}

export function EquipmentTile({
  equipment,
  placement,
  orientation,
  variant,
  width,
  height,
  ghost = false,
  onRemove,
  onFocus,
}: EquipmentTileProps) {
  const sized =
    width && height
      ? { w: width, h: height }
      : variant === 'slot'
        ? orientation === 'portrait'
          ? LAWN_PORTRAIT
          : LAWN_LANDSCAPE
        : orientation === 'portrait'
          ? LAWN_PORTRAIT
          : LAWN_LANDSCAPE

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData(
      'application/x-event-editor-placement',
      placement.placementId,
    )
    event.dataTransfer.effectAllowed = 'move'
  }

  const chip = settingsChipText(equipment)
  const tileTitle = ghost
    ? `${equipment.name} · ${chip ?? 'no settings'} · proposed — click to keep`
    : `${equipment.name} · ${chip ?? 'no settings set'} — click to focus`

  return (
    <div
      className="tile tile--equipment"
      data-variant={variant}
      data-orientation={orientation}
      data-ghost={ghost ? 'true' : 'false'}
      draggable={!ghost}
      onDragStart={ghost ? undefined : handleDragStart}
      onClick={(event) => {
        if (!onFocus) return
        if ((event.target as HTMLElement).closest('.tile__btn')) return
        event.stopPropagation()
        onFocus()
      }}
      style={{ width: sized.w, height: sized.h }}
      title={tileTitle}
    >
      <InstrumentGlyph kind={equipment.instrumentKind} color="#ff922b" />
      <span className="tile__name">{equipment.name}</span>
      {chip ? <span className="tile__chip tile__chip--settings">{chip}</span> : null}
      {ghost ? <span className="tile__ghost-tag">Proposed</span> : null}
      {!ghost ? (
        <div className="tile__controls" onMouseDown={(e) => e.stopPropagation()}>
          {onRemove ? (
            <button
              type="button"
              className="tile__btn tile__btn--danger"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              title="Remove"
            >×</button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
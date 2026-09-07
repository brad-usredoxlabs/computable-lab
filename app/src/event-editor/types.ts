import type { Labware } from '../types/labware'

export type LabwareOrientation = 'portrait' | 'landscape'

/**
 * Which freebench surface a lawn placement belongs to. `'primary'` is the main
 * bench (`surface`); `'side'` is the secondary bench (`sideLawn`). A lawn
 * placement must carry this so each LawnSurface renders ONLY its own tiles
 * (without it, every lawn renders every lawn placement — the double-render bug
 * two coexisting surfaces expose). Absent (legacy records) → 'primary'.
 */
export type LawnSurfaceId = 'primary' | 'side'

export const DEFAULT_LAWN_SURFACE_ID: LawnSurfaceId = 'primary'

export type PlacementLocation =
  | { kind: 'slot'; slotId: string }
  | { kind: 'lawn'; xMm: number; yMm: number; surfaceId?: LawnSurfaceId }

export interface EventEditorPlacement {
  placementId: string
  labwareId: string
  location: PlacementLocation
  orientation: LabwareOrientation
}

export interface PlacementValidationResult {
  ok: boolean
  forcedOrientation: LabwareOrientation | null
  errors: string[]
  warnings: string[]
}

export type DragSource =
  | { kind: 'palette'; labwareType: string }
  | { kind: 'placement'; placementId: string }

export type DropTarget =
  | { kind: 'slot'; slotId: string }
  | { kind: 'lawn'; xMm: number; yMm: number }

import type { WellId } from '../types/plate'

export interface WellSelection {
  labwareId: string
  wells: WellId[]
  anchor: WellId | null
}

export type SelectionMode =
  // Plain click — replace selection. Multichannel pipettes expand to channel pattern.
  | 'replace'
  // Shift-click — extend from anchor to clicked well (contiguous range).
  | 'extend'
  // Ctrl/Cmd-click — toggle individual well.
  | 'toggle'

export type TipState =
  | { kind: 'empty' }
  | {
      kind: 'loaded'
      sourceLabwareId: string
      sourceWells: WellId[]
      volume_uL: number
      // Cached well contents at aspirate time for tooltips/labels.
      sourceLabel: string
    }

export type { Labware }

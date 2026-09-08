import { useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import { resolveOrientation, validatePlacement } from '../lib/placementRules'
import { AddToDeckDialog } from './AddToDeckDialog'
import { LabwareTile } from './LabwareTile'
import {
  buildPreviewWellIndex,
  previewLawnPlacements,
} from '../lib/previewProjection'
import type { Labware } from '../../types/labware'
import type { LawnSurfaceId, EventEditorPlacement } from '../types'
import { DEFAULT_LAWN_SURFACE_ID } from '../types'

interface LawnSurfaceProps {
  widthMm: number
  heightMm: number
  title: string
  primary?: boolean
  /** Which freebench surface this is; lawn placements are scoped to it. */
  surfaceId?: LawnSurfaceId
}

const MM_PER_PIXEL_PRIMARY = 1.6
const MM_PER_PIXEL_SIDE = 1.4
// Physical footprint (mm) used for placement math — clamping into the lawn and
// collision/validation. Kept in mm because positions are real-world.
const TILE_MM_WIDTH = 127 // SBS footprint approx
const TILE_MM_HEIGHT = 85
const TILE_MM_HEIGHT_PORTRAIT = TILE_MM_WIDTH
const TILE_MM_WIDTH_PORTRAIT = TILE_MM_HEIGHT
// Lawn/bench tiles *render* at the same fixed pixel footprint as robot-deck
// slot tiles (LabwareTile SLOT_* sizes) so the labware schematics stay equally
// legible on freeform surfaces. Only the tile position is scaled to physical
// mm (left/top below); the tile size is not, otherwise a fit-the-bench scale
// shrinks them to ~half the deck tiles and 96- vs 384-well becomes unreadable.
const LAWN_TILE_LANDSCAPE = { w: 126, h: 80 }
const LAWN_TILE_PORTRAIT = { w: 80, h: 126 }

export function LawnSurface({ widthMm, heightMm, title, primary = false, surfaceId = DEFAULT_LAWN_SURFACE_ID }: LawnSurfaceProps) {
  const { state, actions } = useEventEditor()
  const scale = primary ? MM_PER_PIXEL_PRIMARY : MM_PER_PIXEL_SIDE
  const widthPx = Math.round(widthMm / scale)
  const heightPx = Math.round(heightMm / scale)
  const gridPx = Math.round(50 / scale)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const [dialogState, setDialogState] = useState<{ open: boolean; xMm: number; yMm: number }>({
    open: false,
    xMm: 0,
    yMm: 0,
  })
  const [isDragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const platform = getPlatformManifest(state.platforms, state.platformId)
  const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)

  // Only this surface's own lawn placements. Without scoping, every lawn would
  // render every lawn placement (double-render with two coexisting benches).
  const lawnPlacements = useMemo(
    () =>
      state.placements.filter(
        (p): p is EventEditorPlacement & { location: { kind: 'lawn'; xMm: number; yMm: number; surfaceId?: LawnSurfaceId } } =>
          p.location.kind === 'lawn' && (p.location.surfaceId ?? DEFAULT_LAWN_SURFACE_ID) === surfaceId,
      ),
    [state.placements, surfaceId],
  )

  const previewIndex = useMemo(() => buildPreviewWellIndex(state.preview), [state.preview])
  const ghostLawnPlacements = useMemo(
    () =>
      previewLawnPlacements(state.preview).filter(
        (p): p is EventEditorPlacement & { location: { kind: 'lawn'; xMm: number; yMm: number; surfaceId?: LawnSurfaceId } } =>
          p.location.kind === 'lawn' && (p.location.surfaceId ?? DEFAULT_LAWN_SURFACE_ID) === surfaceId,
      ),
    [state.preview, surfaceId],
  )

  const screenToLawnMm = useCallback(
    (clientX: number, clientY: number): { xMm: number; yMm: number } | null => {
      const surface = surfaceRef.current
      if (!surface) return null
      const rect = surface.getBoundingClientRect()
      const xPx = clientX - rect.left
      const yPx = clientY - rect.top
      const xMm = Math.round(xPx * scale)
      const yMm = Math.round(yPx * scale)
      return { xMm, yMm }
    },
    [scale],
  )

  function clampToLawn(xMm: number, yMm: number, tileWmm: number, tileHmm: number) {
    return {
      xMm: Math.max(0, Math.min(widthMm - tileWmm, xMm)),
      yMm: Math.max(0, Math.min(heightMm - tileHmm, yMm)),
    }
  }

  /** Build a lawn location carrying this surface's id (placement is scoped to it). */
  function lawnLoc(xMm: number, yMm: number): { kind: 'lawn'; xMm: number; yMm: number; surfaceId: LawnSurfaceId } {
    return { kind: 'lawn', xMm, yMm, surfaceId }
  }

  function handleSurfaceClick(event: MouseEvent<HTMLDivElement>) {
    // Ignore clicks that bubbled up from a tile.
    if ((event.target as HTMLElement).closest('.tile')) return
    const coords = screenToLawnMm(event.clientX, event.clientY)
    if (!coords) return
    setDialogState({ open: true, xMm: coords.xMm, yMm: coords.yMm })
  }

  function handlePick(picked: Labware) {
    if (!platform || !variant) return
    const tileW = picked.layoutFamily === 'tube' ? TILE_MM_HEIGHT : TILE_MM_WIDTH
    const tileH = picked.layoutFamily === 'tube' ? TILE_MM_HEIGHT : TILE_MM_HEIGHT
    const clamped = clampToLawn(
      dialogState.xMm - tileW / 2,
      dialogState.yMm - tileH / 2,
      tileW,
      tileH,
    )
    const validation = validatePlacement({
      platform,
      variant,
      location: lawnLoc(clamped.xMm, clamped.yMm),
      labware: picked,
    })
    if (!validation.ok) {
      setError(validation.errors.join(' '))
      return
    }
    const orientation = resolveOrientation(validation, undefined, picked)
    actions.placeNewLabware(
      picked,
      lawnLoc(clamped.xMm, clamped.yMm),
      orientation,
    )
    setError(null)
  }

  /** Place a minted instrument at a staggered top-left bench spot (no click needed). */

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('application/x-event-editor-placement')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
    if (!platform || !variant) return
    const placementId = event.dataTransfer.getData('application/x-event-editor-placement')
    if (!placementId) return
    const moving = state.placements.find((p) => p.placementId === placementId)
    if (!moving) return
    const movingLabware = state.labwares[moving.labwareId]
    if (!movingLabware) return
    const coords = screenToLawnMm(event.clientX, event.clientY)
    if (!coords) return
    const isPortrait = moving.orientation === 'portrait'
    const tileW = isPortrait ? TILE_MM_WIDTH_PORTRAIT : TILE_MM_WIDTH
    const tileH = isPortrait ? TILE_MM_HEIGHT_PORTRAIT : TILE_MM_HEIGHT
    const clamped = clampToLawn(coords.xMm - tileW / 2, coords.yMm - tileH / 2, tileW, tileH)
    const validation = validatePlacement({
      platform,
      variant,
      location: lawnLoc(clamped.xMm, clamped.yMm),
      labware: movingLabware,
      desiredOrientation: moving.orientation,
    })
    if (!validation.ok) {
      setError(validation.errors.join(' '))
      return
    }
    const orientation = resolveOrientation(validation, moving.orientation, movingLabware)
    // Stamping `lawnLoc(... )` (this surfaceId) is what MOVES a placement from
    // one bench to another: the same placementId now belongs to the drop surface.
    actions.movePlacement(
      moving.placementId,
      lawnLoc(clamped.xMm, clamped.yMm),
      orientation,
    )
    setError(null)
  }

  return (
    <section className={`lawn${primary ? ' lawn--primary' : ''}`} aria-label={title}>
      <div className="lawn__title">
        <span>{title}</span>
      </div>
      <div
        ref={surfaceRef}
        className="lawn__surface"
        data-dragover={isDragOver ? 'true' : 'false'}
        style={{
          width: widthPx,
          height: heightPx,
          ['--cl-lawn-grid' as unknown as string]: `${gridPx}px`,
        }}
        onClick={handleSurfaceClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {lawnPlacements.length === 0 ? (
          <div className="lawn__hint">
            {widthMm}×{heightMm} mm · click anywhere to place labware
          </div>
        ) : null}
        {lawnPlacements.map((placement) => {
          const labware = state.labwares[placement.labwareId]
          if (!labware) return null
          const isPortrait = placement.orientation === 'portrait'
          const tileSize = isPortrait ? LAWN_TILE_PORTRAIT : LAWN_TILE_LANDSCAPE
          const leftPx = Math.round(placement.location.xMm / scale)
          const topPx = Math.round(placement.location.yMm / scale)
          const affected = previewIndex.byLabware.has(placement.labwareId)
          return (
            <div
              key={placement.placementId}
              className="lawn__tile-anchor"
              style={{ left: leftPx, top: topPx }}
            >
              <LabwareTile
                labware={labware}
                placement={placement}
                orientation={placement.orientation}
                variant="lawn"
                width={tileSize.w}
                height={tileSize.h}
                affected={affected}
                onRemove={() => actions.removePlacement(placement.placementId)}
                onFocus={() => actions.setFocus(placement.placementId)}
                onRotate={() => {
                  const next = placement.orientation === 'portrait' ? 'landscape' : 'portrait'
                  if (!platform || !variant) return
                  const validation = validatePlacement({
                    platform,
                    variant,
                    location: placement.location,
                    labware,
                    desiredOrientation: next,
                  })
                  if (!validation.ok) {
                    setError(validation.errors.join(' '))
                    return
                  }
                  actions.movePlacement(
                    placement.placementId,
                    placement.location,
                    resolveOrientation(validation, next, labware),
                  )
                }}
              />
            </div>
          )
        })}
        {ghostLawnPlacements.map((placement) => {
          const labware = state.preview?.previewLabwares[placement.labwareId]
            ?? state.labwares[placement.labwareId]
            ?? null
          if (!labware) return null
          const isPortrait = placement.orientation === 'portrait'
          const tileSize = isPortrait ? LAWN_TILE_PORTRAIT : LAWN_TILE_LANDSCAPE
          const leftPx = Math.round(placement.location.xMm / scale)
          const topPx = Math.round(placement.location.yMm / scale)
          return (
            <div
              key={`ghost-${placement.placementId}`}
              className="lawn__tile-anchor"
              style={{ left: leftPx, top: topPx }}
            >
              <LabwareTile
                labware={labware}
                placement={placement}
                orientation={placement.orientation}
                variant="lawn"
                width={tileSize.w}
                height={tileSize.h}
                ghost
                onFocus={() => actions.setFocus(placement.placementId)}
              />
            </div>
          )
        })}
        {error ? (
          <div
            className="lawn__error"
            onClick={(e) => {
              e.stopPropagation()
              setError(null)
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
      <AddToDeckDialog
        open={dialogState.open}
        contextLabel={`${title} (${dialogState.xMm}, ${dialogState.yMm} mm)`}
        surfaceKind="lawn"
        onClose={() => setDialogState((s) => ({ ...s, open: false }))}
        onPick={handlePick}
      />
    </section>
  )
}

import { useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import { resolveOrientation, validatePlacement } from '../lib/placementRules'
import { AddLabwareDialog } from './AddLabwareDialog'
import { LabwareTile } from './LabwareTile'
import {
  buildPreviewWellIndex,
  previewLawnPlacements,
} from '../lib/previewProjection'
import type { Labware } from '../../types/labware'
import type { EventEditorPlacement } from '../types'

interface LawnSurfaceProps {
  widthMm: number
  heightMm: number
  title: string
  primary?: boolean
}

const MM_PER_PIXEL_PRIMARY = 1.6
const MM_PER_PIXEL_SIDE = 1.4
const TILE_MM_WIDTH = 127 // SBS footprint approx
const TILE_MM_HEIGHT = 85
const TILE_MM_HEIGHT_PORTRAIT = TILE_MM_WIDTH
const TILE_MM_WIDTH_PORTRAIT = TILE_MM_HEIGHT

export function LawnSurface({ widthMm, heightMm, title, primary = false }: LawnSurfaceProps) {
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

  const lawnPlacements = useMemo(
    () =>
      state.placements.filter(
        (p): p is EventEditorPlacement & { location: { kind: 'lawn'; xMm: number; yMm: number } } =>
          p.location.kind === 'lawn',
      ),
    [state.placements],
  )

  const previewIndex = useMemo(() => buildPreviewWellIndex(state.preview), [state.preview])
  const ghostLawnPlacements = useMemo(
    () =>
      previewLawnPlacements(state.preview).filter(
        (p): p is EventEditorPlacement & { location: { kind: 'lawn'; xMm: number; yMm: number } } =>
          p.location.kind === 'lawn',
      ),
    [state.preview],
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
      location: { kind: 'lawn', xMm: clamped.xMm, yMm: clamped.yMm },
      labware: picked,
    })
    if (!validation.ok) {
      setError(validation.errors.join(' '))
      return
    }
    const orientation = resolveOrientation(validation, undefined, picked)
    actions.placeNewLabware(
      picked,
      { kind: 'lawn', xMm: clamped.xMm, yMm: clamped.yMm },
      orientation,
    )
    setError(null)
  }

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
      location: { kind: 'lawn', xMm: clamped.xMm, yMm: clamped.yMm },
      labware: movingLabware,
      desiredOrientation: moving.orientation,
    })
    if (!validation.ok) {
      setError(validation.errors.join(' '))
      return
    }
    const orientation = resolveOrientation(validation, moving.orientation, movingLabware)
    actions.movePlacement(
      moving.placementId,
      { kind: 'lawn', xMm: clamped.xMm, yMm: clamped.yMm },
      orientation,
    )
    setError(null)
  }

  return (
    <section className={`lawn${primary ? ' lawn--primary' : ''}`} aria-label={title}>
      <div className="lawn__title">{title}</div>
      <div
        ref={surfaceRef}
        className="lawn__surface"
        data-dragover={isDragOver ? 'true' : 'false'}
        style={{
          width: widthPx,
          height: heightPx,
          ['--ee-lawn-grid' as unknown as string]: `${gridPx}px`,
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
          const tileWmm = isPortrait ? TILE_MM_WIDTH_PORTRAIT : TILE_MM_WIDTH
          const tileHmm = isPortrait ? TILE_MM_HEIGHT_PORTRAIT : TILE_MM_HEIGHT
          const leftPx = Math.round(placement.location.xMm / scale)
          const topPx = Math.round(placement.location.yMm / scale)
          const widthTilePx = Math.round(tileWmm / scale)
          const heightTilePx = Math.round(tileHmm / scale)
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
                width={widthTilePx}
                height={heightTilePx}
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
          const tileWmm = isPortrait ? TILE_MM_WIDTH_PORTRAIT : TILE_MM_WIDTH
          const tileHmm = isPortrait ? TILE_MM_HEIGHT_PORTRAIT : TILE_MM_HEIGHT
          const leftPx = Math.round(placement.location.xMm / scale)
          const topPx = Math.round(placement.location.yMm / scale)
          const widthTilePx = Math.round(tileWmm / scale)
          const heightTilePx = Math.round(tileHmm / scale)
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
                width={widthTilePx}
                height={heightTilePx}
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
      <AddLabwareDialog
        open={dialogState.open}
        contextLabel={`${title} (${dialogState.xMm}, ${dialogState.yMm} mm)`}
        onClose={() => setDialogState((s) => ({ ...s, open: false }))}
        onPick={handlePick}
      />
    </section>
  )
}

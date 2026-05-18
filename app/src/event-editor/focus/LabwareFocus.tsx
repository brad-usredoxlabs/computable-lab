import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import { computeLabwareStates, getWellState } from '../../graph/lib/eventGraph'
import type { Labware } from '../../types/labware'
import { LABWARE_TYPE_ICONS, LABWARE_TYPE_LABELS } from '../../types/labware'
import type { WellId } from '../../types/plate'
import { WellGrid } from './WellGrid'
import { WellTooltip } from './WellTooltip'
import { resolveOrientation, validatePlacement } from '../lib/placementRules'
import {
  expandMultichannelSelection,
  expandRangeSelection,
  resolveActivePipette,
} from '../lib/pipetteSelection'
import { ContextMenu, type ContextMenuItem } from '../menus/ContextMenu'
import { buildWellMenuItems } from '../menus/wellMenuItems'
import { AddMaterialModal } from '../material/AddMaterialModal'
import {
  buildPreviewWellIndex,
  previewWellsForLabware,
} from '../lib/previewProjection'
import type { LabwareOrientation, WellSelection } from '../types'

/**
 * Maximum long-edge pixel size for the well-grid SVG. The actual rendered
 * size is the smaller of this and the available container space — see
 * the ResizeObserver wiring on `stageRef` below. On mobile the
 * `--ee-focus-size` CSS token narrows the container, so the SVG shrinks
 * with the viewport without any media-query duplication here.
 */
const MAX_FOCUS_SIZE_PX = 720
const MIN_FOCUS_SIZE_PX = 200

export function LabwareFocus() {
  const { state, actions } = useEventEditor()
  const placementId = state.focusPlacementId
  // Look for the focused placement in committed state first, then in the
  // current preview so a click on a ghost tile drills into the proposed
  // labware just like a committed one would.
  const placement =
    (placementId
      ? state.placements.find((p) => p.placementId === placementId)
        ?? state.preview?.previewPlacements.find((p) => p.placementId === placementId)
      : null) ?? null
  const isPreviewPlacement =
    placement != null && !state.placements.includes(placement)
  const labware: Labware | null = placement
    ? state.labwares[placement.labwareId]
      ?? state.preview?.previewLabwares[placement.labwareId]
      ?? null
    : null

  const platform = getPlatformManifest(state.platforms, state.platformId)
  const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)

  // `pinned` distinguishes a hover that's stuck because the user tapped
  // (touch UX, no hover) from a hover that follows the mouse. Pinned
  // tooltips ignore mouseleave-driven clears and auto-dismiss on a timer.
  const [hover, setHover] = useState<{ wellId: WellId; clientX: number; clientY: number; pinned?: boolean } | null>(null)
  const [menu, setMenu] = useState<{
    open: boolean
    x: number
    y: number
    targetWells: WellId[]
  }>({ open: false, x: 0, y: 0, targetWells: [] })
  const canvasRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // Rendered size of the well-grid SVG. Tracks the actual width/height of
  // `.focus__stage` (whose max-width is driven by `--ee-focus-size`) so
  // the SVG shrinks smoothly with the viewport on mobile and stays at
  // 720 on desktop.
  const [focusSize, setFocusSize] = useState(MAX_FOCUS_SIZE_PX)

  // Open state for the AddMaterialModal. The well-context-menu sets
  // this; the modal owns its own internal state machine and clears
  // back to null on apply / cancel / escape.
  const [addMaterialWells, setAddMaterialWells] = useState<WellId[] | null>(null)

  // Auto-dismiss a pinned tooltip after a few seconds — touch users
  // don't have a "move pointer away" gesture to clear it themselves.
  useEffect(() => {
    if (!hover?.pinned) return
    const timer = window.setTimeout(() => setHover(null), 4000)
    return () => window.clearTimeout(timer)
  }, [hover])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => {
      const cs = window.getComputedStyle(el)
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const w = el.clientWidth - padX
      const h = el.clientHeight - padY
      const long = Math.max(w, h)
      const next = Math.max(MIN_FOCUS_SIZE_PX, Math.min(long, MAX_FOCUS_SIZE_PX))
      setFocusSize((prev) => (Math.abs(prev - next) < 1 ? prev : next))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const activePipette = useMemo(
    () => resolveActivePipette(state.toolTypeId, state.assistPipetteId),
    [state.toolTypeId, state.assistPipetteId],
  )

  const labwareStates = useMemo(() => {
    if (!labware) return null
    const labwareMap = new Map<string, Labware>()
    for (const lw of Object.values(state.labwares)) labwareMap.set(lw.labwareId, lw)
    return computeLabwareStates(state.events, labwareMap)
  }, [labware, state.labwares, state.events])

  const previewIndex = useMemo(() => buildPreviewWellIndex(state.preview), [state.preview])
  const previewWells = useMemo(
    () =>
      labware ? new Set<WellId>(previewWellsForLabware(previewIndex, labware.labwareId)) : EMPTY_SET,
    [previewIndex, labware],
  )
  const previewEventsForLabware = useMemo(
    () => (labware ? previewIndex.eventsByLabware.get(labware.labwareId) ?? [] : []),
    [previewIndex, labware],
  )

  // ESC: clear a pinned tooltip first (touch-only state); then selection;
  // then exit focus. Each press peels one layer of context.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (hover?.pinned) {
        setHover(null)
        return
      }
      if (state.selection && state.selection.wells.length > 0) {
        actions.clearSelection()
      } else {
        actions.setFocus(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [actions, hover, state.selection])

  const selectedSet = useMemo(() => {
    if (!state.selection || !labware || state.selection.labwareId !== labware.labwareId) {
      return EMPTY_SET
    }
    return new Set<WellId>(state.selection.wells)
  }, [state.selection, labware])

  const [selectionWarning, setSelectionWarning] = useState<string | null>(null)

  const handleWellClick = useCallback(
    (wellId: WellId, event: React.MouseEvent) => {
      if (!labware) return
      // Pin the tooltip on tap. Desktop already shows it on hover but
      // pinning is harmless there; on touch this is the only way to see
      // a well's metadata.
      setHover({ wellId, clientX: event.clientX, clientY: event.clientY, pinned: true })
      const labwareId = labware.labwareId
      const existing: WellSelection | null =
        state.selection && state.selection.labwareId === labwareId ? state.selection : null

      // Cmd/Ctrl-click: toggle a single well in the current selection.
      if (event.metaKey || event.ctrlKey) {
        const current = new Set(existing?.wells ?? [])
        if (current.has(wellId)) current.delete(wellId)
        else current.add(wellId)
        const wells = Array.from(current)
        actions.setSelection(
          wells.length === 0
            ? null
            : { labwareId, wells, anchor: existing?.anchor ?? wellId },
        )
        setSelectionWarning(null)
        return
      }

      // Shift-click: extend from current anchor to the clicked well (range).
      if (event.shiftKey && existing?.anchor) {
        const wells = expandRangeSelection(labware, existing.anchor, wellId)
        actions.setSelection({ labwareId, wells, anchor: existing.anchor })
        setSelectionWarning(null)
        return
      }

      // Plain click: replace selection. If a multichannel pipette is active,
      // expand to its channel pattern; otherwise just the single well.
      if (activePipette) {
        const expansion = expandMultichannelSelection(
          activePipette,
          labware,
          placement?.orientation ?? 'landscape',
          wellId,
        )
        actions.setSelection({
          labwareId,
          wells: expansion.wells,
          anchor: wellId,
        })
        setSelectionWarning(expansion.warning)
        return
      }
      actions.setSelection({ labwareId, wells: [wellId], anchor: wellId })
      setSelectionWarning(null)
    },
    [actions, activePipette, labware, placement, state.selection],
  )

  if (!placement || !labware) return null

  const slotForLock = (() => {
    if (!variant) return null
    if (placement.location.kind !== 'slot') return null
    const slotId = placement.location.slotId
    return variant.slots.find((s) => s.id === slotId) ?? null
  })()
  const rotateLocked = slotForLock?.orientationMode === 'locked_portrait'
    || slotForLock?.orientationMode === 'locked_landscape'

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (canvasRef.current && canvasRef.current.contains(event.target as Node)) {
      return
    }
    setHover(null)
    actions.clearSelection()
    actions.setFocus(null)
  }

  function handleRotate() {
    if (!placement || !labware || !platform || !variant) return
    const next: LabwareOrientation = placement.orientation === 'portrait' ? 'landscape' : 'portrait'
    const validation = validatePlacement({
      platform,
      variant,
      location: placement.location,
      labware,
      desiredOrientation: next,
    })
    if (!validation.ok) return
    actions.movePlacement(
      placement.placementId,
      placement.location,
      resolveOrientation(validation, next, labware),
    )
  }

  const wellState = hover && labwareStates ? getWellState(labwareStates, labware.labwareId, hover.wellId) : null

  const tooltipPos = hover && canvasRef.current
    ? (() => {
        const rect = canvasRef.current.getBoundingClientRect()
        return { x: hover.clientX - rect.left + 12, y: hover.clientY - rect.top + 12 }
      })()
    : null

  const locationLabel =
    placement.location.kind === 'slot'
      ? `slot ${placement.location.slotId}`
      : `lawn (${placement.location.xMm}, ${placement.location.yMm} mm)`

  const selectionCount = state.selection?.labwareId === labware.labwareId
    ? state.selection.wells.length
    : 0

  return (
    <div className="focus" onClick={handleBackdropClick}>
      <div className="focus__canvas" ref={canvasRef} onClick={(e) => e.stopPropagation()}>
        <header className="focus__header">
          <span className="focus__icon" aria-hidden>{LABWARE_TYPE_ICONS[labware.labwareType]}</span>
          <div className="focus__title-block">
            <div className="focus__name">
              {labware.name}
              {isPreviewPlacement ? <span className="focus__preview-tag">Proposed</span> : null}
            </div>
            <div className="focus__meta">
              {LABWARE_TYPE_LABELS[labware.labwareType]} · {locationLabel} · {placement.orientation}
              {activePipette ? ` · tool: ${activePipette.label}` : ''}
            </div>
          </div>
          {!isPreviewPlacement ? (
            <button
              type="button"
              className="focus__btn"
              disabled={Boolean(rotateLocked)}
              onClick={handleRotate}
              title="Rotate"
            >⟲ Rotate</button>
          ) : null}
          <button
            type="button"
            className="focus__btn focus__btn--ghost"
            onClick={() => actions.setFocus(null)}
            title="Close (Esc)"
          >Close</button>
        </header>
        <div className="focus__stage" ref={stageRef}>
          <WellGrid
            labware={labware}
            orientation={placement.orientation}
            size={focusSize}
            hoveredWellId={hover?.wellId ?? null}
            selectedWellIds={selectedSet}
            previewWellIds={previewWells}
            onHover={(wellId, event) => {
              if (!wellId || !event) {
                // Mouseleave shouldn't dismiss a tooltip that the user
                // explicitly pinned by tapping. They'll clear it via
                // tap-elsewhere, the auto-dismiss timer, or Escape.
                setHover((prev) => (prev?.pinned ? prev : null))
                return
              }
              setHover({ wellId, clientX: event.clientX, clientY: event.clientY })
            }}
            onWellClick={handleWellClick}
            onWellContextMenu={(wellId, event) => {
              const targetWells = selectedSet.has(wellId)
                ? Array.from(selectedSet)
                : [wellId]
              setMenu({ open: true, x: event.clientX, y: event.clientY, targetWells })
            }}
          />
          {hover && wellState && tooltipPos ? (
            <WellTooltip wellId={hover.wellId} state={wellState} x={tooltipPos.x} y={tooltipPos.y} />
          ) : null}
        </div>
        {menu.open && labware && labwareStates ? (
          (() => {
            const built = buildWellMenuItems({
              labware,
              labwareStates,
              targetWells: menu.targetWells,
              tip: state.tipState,
              actions,
              onClearSelection: () => actions.clearSelection(),
              onAddMaterial: (wells) => {
                setMenu((m) => ({ ...m, open: false }))
                setAddMaterialWells(wells)
              },
            })
            const items: ContextMenuItem[] = built.items
            return (
              <ContextMenu
                open={menu.open}
                x={menu.x}
                y={menu.y}
                items={items}
                title={built.title}
                onClose={() => setMenu((m) => ({ ...m, open: false }))}
              />
            )
          })()
        ) : null}
        <footer className="focus__footer">
          {previewEventsForLabware.length > 0 ? (
            <span className="focus__preview-summary" title="Use the floating Accept button on the deck to commit.">
              {previewEventsForLabware.length} proposed event
              {previewEventsForLabware.length === 1 ? '' : 's'} touch this labware
            </span>
          ) : null}
          {selectionCount > 0 ? (
            <>
              <span className="focus__selection-count">
                {selectionCount} well{selectionCount === 1 ? '' : 's'} selected
              </span>
              <span className="focus__hint">
                {activePipette ? `${activePipette.label} pattern` : 'single well'}
                {' · '}
                shift-click for range · cmd-click to toggle · esc to clear
              </span>
              {selectionWarning ? <span className="focus__warning">{selectionWarning}</span> : null}
            </>
          ) : (
            <span className="focus__hint">
              Hover a well to inspect · click to select{activePipette ? ` (expands to ${activePipette.label})` : ''}
            </span>
          )}
        </footer>
      </div>
      <AddMaterialModal
        isOpen={addMaterialWells !== null && Boolean(labware)}
        labware={labware!}
        wells={addMaterialWells ?? []}
        onClose={() => setAddMaterialWells(null)}
      />
    </div>
  )
}

const EMPTY_SET: ReadonlySet<WellId> = new Set()

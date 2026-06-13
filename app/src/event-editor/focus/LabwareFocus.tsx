import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import { computeLabwareStates, getWellState, getMaterialsSummary } from '../../graph/lib/eventGraph'
import { buildCompositionStyles, buildCompositionLegend, wellCompositionSignature, type WellHueStyle } from '../../graph/lib/wellSignature'
import { eventsWithPreviewState, labwareMapWithPreviewState, occupiedWellsForLabware, tubeWellsForLabware } from './wellStateProjection'
import type { Labware } from '../../types/labware'
import { LABWARE_TYPE_ICONS, LABWARE_TYPE_LABELS, isTubeRack } from '../../types/labware'
import { generateEventId } from '../../types/events'
import type { WellId } from '../../types/plate'
import { WellGrid } from './WellGrid'
import { WellTooltip } from './WellTooltip'
import { resolveOrientation, validatePlacement } from '../lib/placementRules'
import { findLabwareNameConflict } from '../labwareHandles'
import {
  expandMultichannelSelection,
  expandRangeSelection,
  resolveActivePipette,
} from '../lib/pipetteSelection'
import { ContextMenu, type ContextMenuItem } from '../menus/ContextMenu'
import { buildWellMenuItems } from '../menus/wellMenuItems'
import { useFocusModals } from './FocusModalsProvider'
import {
  buildPreviewWellIndex,
  previewWellsForLabware,
} from '../lib/previewProjection'
import { ReadPlateModal } from '../rail/ReadPlateModal'
import type { LabwareOrientation, WellSelection } from '../types'

/**
 * Maximum long-edge pixel size for the well-grid SVG. The actual rendered
 * size is the smaller of this and the available container space — see
 * the ResizeObserver wiring on `stageRef` below. On mobile the
 * `--cl-focus-size` CSS token narrows the container, so the SVG shrinks
 * with the viewport without any media-query duplication here.
 */
const MAX_FOCUS_SIZE_PX = 720
const MIN_FOCUS_SIZE_PX = 200

export function LabwareFocus() {
  const { state, actions } = useEventEditor()
  const { openAddMaterial } = useFocusModals()
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
  // When set, the next well click commits a move_tube from this position into
  // the clicked destination (within the focused rack).
  const [moveTubeFrom, setMoveTubeFrom] = useState<WellId | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // Rendered size of the well-grid SVG. Tracks the actual width/height of
  // `.focus__stage` (whose max-width is driven by `--cl-focus-size`) so
  // the SVG shrinks smoothly with the viewport on mobile and stays at
  // 720 on desktop.
  const [focusSize, setFocusSize] = useState(MAX_FOCUS_SIZE_PX)

  // Phase 13: AddMaterialModal is hosted by FocusModalsProvider so the
  // right-pane Details tab can trigger the same modal instance. The
  // well-context-menu here calls openAddMaterial(wells) instead of
  // setting a local open-state. ReadPlateModal still lives here because
  // it's only triggered from the header's "Read plate" button.
  const [readPlateOpen, setReadPlateOpen] = useState(false)
  // Inline rename of the focused labware. `null` = not editing; otherwise the
  // working draft of the name shown in the header input.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Duplicate display names break the AI's labware-ref repair (it requires
  // a unique name match), so renames are validated against committed AND
  // preview-ghost labwares before dispatch.
  const renameConflict = useCallback((): Labware | null => {
    if (!labware || nameDraft === null) return null
    return findLabwareNameConflict(
      nameDraft,
      [
        ...Object.values(state.labwares),
        ...Object.values(state.preview?.previewLabwares ?? {}),
      ],
      labware.labwareId,
    )
  }, [labware, nameDraft, state.labwares, state.preview])

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
    return computeLabwareStates(
      eventsWithPreviewState(state.events, state.preview),
      labwareMapWithPreviewState(state.labwares, state.preview),
    )
  }, [labware, state.labwares, state.events, state.preview])

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
  const occupiedWellIds = useMemo(
    () => occupiedWellsForLabware(labwareStates, labware?.labwareId),
    [labwareStates, labware],
  )
  const tubeWellIds = useMemo(
    () => tubeWellsForLabware(labwareStates, labware?.labwareId),
    [labwareStates, labware],
  )

  // Per-well fill/stroke keyed on a composition signature: replicates share a
  // hue, distinct conditions get distinct hues. Hue is further modulated by
  // knowledge-layer group membership (vivid when grouped). Selection is layered
  // on top by the grid as an amber ring.
  const compositionStyles = useMemo(() => {
    if (!labware || !labwareStates) return EMPTY_STYLE_MAP
    const groupWells = new Set<WellId>()
    const rail = placementId ? state.plateRail[placementId] : undefined
    for (const group of rail?.knowledge.groups ?? []) {
      for (const well of group.wells) groupWells.add(well)
    }
    const wellOrder = [...occupiedWellIds].sort()
    return buildCompositionStyles(
      wellOrder,
      (wellId) =>
        wellCompositionSignature(getWellState(labwareStates, labware.labwareId, wellId)),
      groupWells,
    )
  }, [labware, labwareStates, occupiedWellIds, placementId, state.plateRail])

  // Legend mapping each distinct composition hue back to a readable condition,
  // built from the same well order so swatches match the on-plate fills.
  const compositionLegend = useMemo(() => {
    if (!labware || !labwareStates) return []
    const groupWells = new Set<WellId>()
    const rail = placementId ? state.plateRail[placementId] : undefined
    for (const group of rail?.knowledge.groups ?? []) {
      for (const well of group.wells) groupWells.add(well)
    }
    const wellOrder = [...occupiedWellIds].sort()
    return buildCompositionLegend(
      wellOrder,
      (wellId) =>
        wellCompositionSignature(getWellState(labwareStates, labware.labwareId, wellId)),
      (wellId) => getMaterialsSummary(getWellState(labwareStates, labware.labwareId, wellId)),
      groupWells,
    )
  }, [labware, labwareStates, occupiedWellIds, placementId, state.plateRail])

  // ESC: clear a pinned tooltip first (touch-only state); then selection;
  // then exit focus. Each press peels one layer of context.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (moveTubeFrom) {
        setMoveTubeFrom(null)
        return
      }
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
  }, [actions, hover, state.selection, moveTubeFrom])

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
      // Complete a pending "move tube" gesture: the click is the destination.
      if (moveTubeFrom) {
        const labwareId = labware.labwareId
        if (wellId !== moveTubeFrom) {
          actions.appendEvent({
            eventId: generateEventId(),
            event_type: 'move_tube',
            details: {
              source: { labwareId, well: moveTubeFrom },
              target: { labwareId, well: wellId },
            },
          })
        }
        setMoveTubeFrom(null)
        return
      }
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
    [actions, activePipette, labware, placement, state.selection, moveTubeFrom],
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
              {nameDraft !== null ? (
                <input
                  ref={nameInputRef}
                  className="focus__name-input"
                  value={nameDraft}
                  autoFocus
                  onChange={(e) => {
                    setNameDraft(e.target.value)
                    setNameError(null)
                  }}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => {
                    // Click-away with a conflicting draft reverts silently —
                    // don't trap focus on a transient error.
                    if (!renameConflict()) {
                      actions.renameLabware(labware.labwareId, nameDraft)
                    }
                    setNameDraft(null)
                    setNameError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const conflict = renameConflict()
                      if (conflict) {
                        setNameError(`Name already used by “${conflict.name}”`)
                        return
                      }
                      nameInputRef.current?.blur()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setNameDraft(null)
                      setNameError(null)
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="focus__name-btn"
                  disabled={isPreviewPlacement}
                  onClick={() => setNameDraft(labware.name)}
                  title={isPreviewPlacement ? undefined : 'Click to rename'}
                >
                  {labware.name}
                </button>
              )}
              {isPreviewPlacement ? <span className="focus__preview-tag">Proposed</span> : null}
            </div>
            {nameError ? (
              <div className="focus__name-error" role="alert">{nameError}</div>
            ) : null}
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
            className="focus__btn"
            onClick={() => setReadPlateOpen(true)}
          >Read plate</button>
          <button
            type="button"
            className="focus__btn focus__btn--ghost"
            onClick={() => actions.setFocus(null)}
            title="Close (Esc)"
          >Close</button>
        </header>
        <div className="focus__body">
        <div className="focus__stage" ref={stageRef}>
          <WellGrid
            labware={labware}
            orientation={placement.orientation}
            size={focusSize}
            hoveredWellId={hover?.wellId ?? null}
            selectedWellIds={selectedSet}
            previewWellIds={previewWells}
            occupiedWellIds={occupiedWellIds}
            tubeWellIds={tubeWellIds}
            compositionStyles={compositionStyles}
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
          {hover && wellState ? (
            <WellTooltip wellId={hover.wellId} state={wellState} isTubeRack={labware ? isTubeRack(labware) : false} clientX={hover.clientX} clientY={hover.clientY} />
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
                openAddMaterial(wells)
              },
              onBeginMoveTube: (fromWell) => {
                setMenu((m) => ({ ...m, open: false }))
                setMoveTubeFrom(fromWell)
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
          {moveTubeFrom ? (
            <span className="focus__hint">
              Moving tube from {moveTubeFrom} — click a destination well · esc to cancel
            </span>
          ) : null}
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
        {compositionLegend.length > 0 ? (
          <div className="focus__legend" role="list" aria-label="Well compositions">
            {compositionLegend.map((entry) => (
              <button
                key={entry.signature}
                type="button"
                role="listitem"
                className="focus__legend-chip"
                title={`Select the ${entry.wells.length} well${entry.wells.length === 1 ? '' : 's'} of ${entry.label}`}
                onClick={() => {
                  if (!labware) return
                  const wells = entry.wells as WellId[]
                  actions.setSelection({
                    labwareId: labware.labwareId,
                    wells,
                    anchor: wells[0] ?? null,
                  })
                }}
              >
                <span
                  className="focus__legend-swatch"
                  style={{ background: entry.fill, borderColor: entry.stroke }}
                  aria-hidden
                />
                <span className="focus__legend-label">{entry.label}</span>
                <span className="focus__legend-count">
                  ×{entry.wells.length}
                  {entry.groupedCount > 0 ? ' ⬢' : ''}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        </div>
      </div>
      <ReadPlateModal
        isOpen={readPlateOpen && Boolean(labware) && Boolean(placement)}
        placementId={placement.placementId}
        labware={labware!}
        rail={state.plateRail}
        events={state.events}
        onClose={() => setReadPlateOpen(false)}
      />
    </div>
  )
}

const EMPTY_SET: ReadonlySet<WellId> = new Set()
const EMPTY_STYLE_MAP: ReadonlyMap<WellId, WellHueStyle> = new Map()

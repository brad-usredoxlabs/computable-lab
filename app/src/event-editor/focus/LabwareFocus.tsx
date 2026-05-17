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
import type { LabwareOrientation, WellSelection } from '../types'

const FOCUS_SIZE_PX = 720

export function LabwareFocus() {
  const { state, actions } = useEventEditor()
  const placementId = state.focusPlacementId
  const placement = placementId ? state.placements.find((p) => p.placementId === placementId) : null
  const labware: Labware | null = placement ? state.labwares[placement.labwareId] ?? null : null

  const platform = getPlatformManifest(state.platforms, state.platformId)
  const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)

  const [hover, setHover] = useState<{ wellId: WellId; clientX: number; clientY: number } | null>(null)
  const [menu, setMenu] = useState<{
    open: boolean
    x: number
    y: number
    targetWells: WellId[]
  }>({ open: false, x: 0, y: 0, targetWells: [] })
  const canvasRef = useRef<HTMLDivElement>(null)

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

  // ESC: first press clears selection (if any), second press exits focus.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (state.selection && state.selection.wells.length > 0) {
        actions.clearSelection()
      } else {
        actions.setFocus(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [actions, state.selection])

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
    if (canvasRef.current && canvasRef.current.contains(event.target as Node)) return
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
            <div className="focus__name">{labware.name}</div>
            <div className="focus__meta">
              {LABWARE_TYPE_LABELS[labware.labwareType]} · {locationLabel} · {placement.orientation}
              {activePipette ? ` · tool: ${activePipette.label}` : ''}
            </div>
          </div>
          <button
            type="button"
            className="focus__btn"
            disabled={Boolean(rotateLocked)}
            onClick={handleRotate}
            title="Rotate"
          >⟲ Rotate</button>
          <button
            type="button"
            className="focus__btn focus__btn--ghost"
            onClick={() => actions.setFocus(null)}
            title="Close (Esc)"
          >Close</button>
        </header>
        <div className="focus__stage">
          <WellGrid
            labware={labware}
            orientation={placement.orientation}
            size={FOCUS_SIZE_PX}
            hoveredWellId={hover?.wellId ?? null}
            selectedWellIds={selectedSet}
            onHover={(wellId, event) => {
              if (!wellId || !event) {
                setHover(null)
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
    </div>
  )
}

const EMPTY_SET: ReadonlySet<WellId> = new Set()

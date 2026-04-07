/**
 * DualLabwarePane - Side-by-side display of source and target labwares.
 * 
 * Supports tool-constrained selection expansion when toolExpander is provided.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useLabwareEditor, type LabwareOrientation as PoseOrientation } from '../context/LabwareEditorContext'
import { LabwareCanvas, type ToolExpander } from './LabwareCanvas'
import { WellTooltip } from './WellTooltip'
import type { WellId } from '../../types/plate'
import type { PlateEvent } from '../../types/events'
import type { TransferDetails } from '../../types/events'
import type { MacroProgram } from '../../types/macroProgram'
import type { ValidationMessage } from '../tools'
import { getAddresses } from '../tools'
import { getAffectedWells, EVENT_TYPE_COLORS } from '../../types/events'
import { normalizeTransferDetails } from '../../types/events'
import { computeLabwareStates } from '../lib/eventGraph'
import { getEventFocusTargets } from '../lib/eventFocus'
import { getEventSummary } from '../../types/events'
import { getLabwareDefaultOrientation, isTipRackType } from '../../types/labware'

interface DualLabwarePaneProps {
  /** Active editor mode */
  mode?: 'plan' | 'biology' | 'readouts' | 'results'
  /** Events to calculate well contents from */
  events?: PlateEvent[]
  /** Number of events applied from timeline playback (0..events.length) */
  playbackPosition?: number
  /** Tool expansion function (from useToolConstraints) */
  toolExpander?: ToolExpander
  /** Callback for validation messages from tool expansion */
  onValidation?: (messages: ValidationMessage[]) => void
  /** AI preview events (shown as purple overlay) */
  previewEvents?: PlateEvent[]
  /** Lock tiprack orientation to landscape */
  lockLandscapeTipracks?: boolean
  /** Whether a labware can currently rotate in the active deck/platform context */
  canRotateLabware?: (labwareId: string) => boolean
  /** Explanation when rotation is unavailable for a labware */
  getRotateDisabledReason?: (labwareId: string) => string | null
  /** Optional overlay rendered over the source pane */
  leftOverlay?: ReactNode
  /** Optional overlay rendered over the target pane */
  rightOverlay?: ReactNode
  /** Optional source pane well fills for non-plan modes */
  sourceWellContentsOverride?: Map<WellId, { color?: string }>
  /** Optional target pane well fills for non-plan modes */
  targetWellContentsOverride?: Map<WellId, { color?: string }>
  /** Optional source pane semantic tooltip metadata */
  sourceTooltipMeta?: Map<WellId, { biology?: string[]; readouts?: string[]; results?: string[] }>
  /** Optional target pane semantic tooltip metadata */
  targetTooltipMeta?: Map<WellId, { biology?: string[]; readouts?: string[]; results?: string[] }>
}

/**
 * Empty pane placeholder
 */
function EmptyPane({ label }: { label: string }) {
  return (
    <div className="dual-pane__empty">
      <div className="empty-content">
        <span className="empty-icon">📭</span>
        <p>No {label} labware selected</p>
        <p className="hint">Use the deck slots to place labware and assign source or target.</p>
      </div>
    </div>
  )
}

function PaneFocusInfo({
  summary,
  count,
}: {
  summary: string
  count: number
}) {
  return (
    <div className="pane-focus-info">
      <span className="pane-focus-info__label">Focused Event</span>
      <span className="pane-focus-info__summary" title={summary}>
        {summary}
      </span>
      <span className="pane-focus-info__count">
        {count} well{count === 1 ? '' : 's'}
      </span>
    </div>
  )
}

/**
 * DualLabwarePane component
 */
export function DualLabwarePane({
  mode = 'plan',
  events = [],
  playbackPosition,
  toolExpander,
  onValidation,
  previewEvents = [],
  lockLandscapeTipracks = false,
  canRotateLabware,
  getRotateDisabledReason,
  leftOverlay,
  rightOverlay,
  sourceWellContentsOverride,
  targetWellContentsOverride,
  sourceTooltipMeta,
  targetTooltipMeta,
}: DualLabwarePaneProps) {
  const {
    state,
    sourceLabware,
    targetLabware,
    sourceSelection,
    targetSelection,
    selectWells,
    swapSourceTarget,
    getLabwareOrientation,
    setLabwareOrientation,
  } = useLabwareEditor()

  // Hover state for tooltips
  const [hoveredWell, setHoveredWell] = useState<{
    wellId: WellId
    labwareId: string
    position: { x: number; y: number }
  } | null>(null)
  const [activeOverlayPane, setActiveOverlayPane] = useState<'source' | 'target' | null>(null)

  const sourceOrientation = sourceLabware ? getLabwareOrientation(sourceLabware.labwareId) : 'landscape'
  const targetOrientation = targetLabware ? getLabwareOrientation(targetLabware.labwareId) : 'landscape'
  const sourceCanRotate = sourceLabware ? canRotateLabware?.(sourceLabware.labwareId) ?? true : false
  const targetCanRotate = targetLabware ? canRotateLabware?.(targetLabware.labwareId) ?? true : false
  const sourceRotateDisabledReason = sourceLabware ? getRotateDisabledReason?.(sourceLabware.labwareId) ?? null : null
  const targetRotateDisabledReason = targetLabware ? getRotateDisabledReason?.(targetLabware.labwareId) ?? null : null

  // Toggle orientation handler
  const toggleOrientation = (current: PoseOrientation): PoseOrientation => {
    return current === 'portrait' ? 'landscape' : 'portrait'
  }

  const handleRotateSource = useCallback(() => {
    if (!sourceLabware || !sourceCanRotate) return
    const nextOrientation = toggleOrientation(sourceOrientation)
    setLabwareOrientation(sourceLabware.labwareId, nextOrientation)
    const anchor = sourceSelection?.lastClickedWell
    if (!toolExpander || !anchor) return
    const expansion = toolExpander(anchor, sourceLabware, 'source', nextOrientation)
    if (!expansion) return
    selectWells(sourceLabware.labwareId, getAddresses(expansion.selection) as WellId[], 'replace')
  }, [sourceCanRotate, sourceLabware, sourceOrientation, sourceSelection?.lastClickedWell, toolExpander, selectWells, setLabwareOrientation])

  const handleRotateTarget = useCallback(() => {
    if (!targetLabware || !targetCanRotate) return
    const nextOrientation = toggleOrientation(targetOrientation)
    setLabwareOrientation(targetLabware.labwareId, nextOrientation)
    const anchor = targetSelection?.lastClickedWell
    if (!toolExpander || !anchor) return
    const expansion = toolExpander(anchor, targetLabware, 'target', nextOrientation)
    if (!expansion) return
    selectWells(targetLabware.labwareId, getAddresses(expansion.selection) as WellId[], 'replace')
  }, [targetCanRotate, targetLabware, targetOrientation, targetSelection?.lastClickedWell, toolExpander, selectWells, setLabwareOrientation])

  const appliedEvents = useMemo(() => {
    if (typeof playbackPosition !== 'number') return events
    const clamped = Math.max(0, Math.min(events.length, playbackPosition))
    return events.slice(0, clamped)
  }, [events, playbackPosition])

  // Compute labware states for tooltip content
  const computedStates = useMemo(
    () => computeLabwareStates(appliedEvents, state.labwares),
    [appliedEvents, state.labwares]
  )

  // Source hover handler
  const handleSourceWellHover = useCallback(
    (wellId: WellId | null, position?: { x: number; y: number }) => {
      if (wellId && position && sourceLabware) {
        setHoveredWell({ wellId, labwareId: sourceLabware.labwareId, position })
      } else {
        setHoveredWell(null)
      }
    },
    [sourceLabware]
  )

  // Target hover handler
  const handleTargetWellHover = useCallback(
    (wellId: WellId | null, position?: { x: number; y: number }) => {
      if (wellId && position && targetLabware) {
        setHoveredWell({ wellId, labwareId: targetLabware.labwareId, position })
      } else {
        setHoveredWell(null)
      }
    },
    [targetLabware]
  )

  // Calculate well contents for source labware
  const sourceWellContents = useMemo(() => {
    const contents = new Map<WellId, { color?: string }>()
    if (!sourceLabware) return contents

    appliedEvents.forEach((event) => {
      const details = event.details as Record<string, unknown>
      const eventLabwareId = details.labwareId as string
      const normalized = normalizeTransferDetails(event.details as TransferDetails)
      const sourceLabwareId = normalized.sourceLabwareId
      const program = details.program as MacroProgram | undefined
      
      // Show events on this labware
      if (eventLabwareId === sourceLabware.labwareId || 
          sourceLabwareId === sourceLabware.labwareId) {
        const wells = eventLabwareId === sourceLabware.labwareId 
          ? getAffectedWells(event)
          : normalized.sourceWells
        const color = EVENT_TYPE_COLORS[event.event_type]
        
        wells.forEach((wellId) => {
          contents.set(wellId, { color })
        })
      }
      if (event.event_type === 'macro_program' && program?.kind === 'quadrant_replicate' && program.params.sourceLabwareId === sourceLabware.labwareId) {
        for (const wellId of program.params.sourceWells) {
          contents.set(wellId, { color: EVENT_TYPE_COLORS.macro_program })
        }
      }
      if (event.event_type === 'macro_program' && program?.kind === 'spacing_transition_transfer' && program.params.sourceLabwareId === sourceLabware.labwareId) {
        for (const wellId of program.params.sourceWells) {
          contents.set(wellId, { color: EVENT_TYPE_COLORS.macro_program })
        }
      }
    })

    return contents
  }, [appliedEvents, sourceLabware])

  const effectiveSourceWellContents = sourceWellContentsOverride ?? sourceWellContents
  const sourceHasActivity = sourceWellContents.size > 0

  // Calculate well contents for target labware
  const targetWellContents = useMemo(() => {
    const contents = new Map<WellId, { color?: string }>()
    if (!targetLabware) return contents

    appliedEvents.forEach((event) => {
      const details = event.details as Record<string, unknown>
      const eventLabwareId = details.labwareId as string
      const normalized = normalizeTransferDetails(event.details as TransferDetails)
      const destLabwareId = normalized.destLabwareId
      const program = details.program as MacroProgram | undefined
      
      // Show events on this labware
      if (eventLabwareId === targetLabware.labwareId || 
          destLabwareId === targetLabware.labwareId) {
        const wells = eventLabwareId === targetLabware.labwareId 
          ? getAffectedWells(event)
          : normalized.destWells
        const color = EVENT_TYPE_COLORS[event.event_type]
        
        wells.forEach((wellId) => {
          contents.set(wellId, { color })
        })
      }
      if (event.event_type === 'macro_program' && program?.kind === 'quadrant_replicate' && program.params.targetLabwareId === targetLabware.labwareId) {
        const targets = sourceLabware
          ? computeLabwareStates([event], state.labwares).get(targetLabware.labwareId)
          : undefined
        if (targets) {
          for (const wellId of targets.keys()) {
            contents.set(wellId, { color: EVENT_TYPE_COLORS.macro_program })
          }
        }
      }
      if (event.event_type === 'macro_program' && program?.kind === 'spacing_transition_transfer' && program.params.targetLabwareId === targetLabware.labwareId) {
        for (const wellId of program.params.targetWells) {
          contents.set(wellId, { color: EVENT_TYPE_COLORS.macro_program })
        }
      }
    })

    return contents
  }, [appliedEvents, targetLabware])

  const effectiveTargetWellContents = targetWellContentsOverride ?? targetWellContents
  const targetHasActivity = targetWellContents.size > 0

  // Calculate preview well contents for source labware
  const sourcePreviewWells = useMemo(() => {
    const contents = new Map<WellId, { color?: string }>()
    if (!sourceLabware || previewEvents.length === 0) return contents

    previewEvents.forEach((event) => {
      const details = event.details as Record<string, unknown>
      const eventLabwareId = details.labwareId as string
      const normalized = normalizeTransferDetails(event.details as TransferDetails)
      const sourceLabwareId = normalized.sourceLabwareId

      if (eventLabwareId === sourceLabware.labwareId ||
          sourceLabwareId === sourceLabware.labwareId) {
        const wells = eventLabwareId === sourceLabware.labwareId
          ? getAffectedWells(event)
          : normalized.sourceWells
        wells.forEach((wellId) => {
          contents.set(wellId, { color: '#be4bdb' })
        })
      }
    })
    return contents
  }, [previewEvents, sourceLabware])

  // Calculate preview well contents for target labware
  const targetPreviewWells = useMemo(() => {
    const contents = new Map<WellId, { color?: string }>()
    if (!targetLabware || previewEvents.length === 0) return contents

    previewEvents.forEach((event) => {
      const details = event.details as Record<string, unknown>
      const eventLabwareId = details.labwareId as string
      const normalized = normalizeTransferDetails(event.details as TransferDetails)
      const destLabwareId = normalized.destLabwareId

      if (eventLabwareId === targetLabware.labwareId ||
          destLabwareId === targetLabware.labwareId) {
        const wells = eventLabwareId === targetLabware.labwareId
          ? getAffectedWells(event)
          : normalized.destWells
        wells.forEach((wellId) => {
          contents.set(wellId, { color: '#be4bdb' })
        })
      }
    })
    return contents
  }, [previewEvents, targetLabware])

  // Handlers for source pane
  const handleSourceSelectWells = useCallback(
    (wells: WellId[], mode: 'replace' | 'add' | 'toggle') => {
      if (sourceLabware) {
        selectWells(sourceLabware.labwareId, wells, mode)
      }
    },
    [sourceLabware, selectWells]
  )

  // Handlers for target pane
  const handleTargetSelectWells = useCallback(
    (wells: WellId[], mode: 'replace' | 'add' | 'toggle') => {
      if (targetLabware) {
        selectWells(targetLabware.labwareId, wells, mode)
      }
    },
    [targetLabware, selectWells]
  )

  // Calculate canvas dimensions based on labware type
  const getCanvasDimensions = (
    labware: typeof sourceLabware,
    orientation?: PoseOrientation
  ) => {
    if (!labware) return { width: 400, height: 350 }
    
    const { addressing } = labware
    
    if (addressing.type === 'grid') {
      const rows = addressing.rows || 8
      // Make it fit in the available space
      if (rows > 8) {
        return { width: 500, height: 420 }
      }
      return { width: 450, height: 350 }
    }
    
    if (addressing.type === 'linear') {
      const count = addressing.linearLabels?.length || 8
      const effectiveOrientation = orientation || getLabwareDefaultOrientation(labware)
      const baseAxis = labware.linearAxis || 'x'
      const rendersLandscape =
        (baseAxis === 'x' && effectiveOrientation === 'landscape') ||
        (baseAxis === 'y' && effectiveOrientation === 'portrait')

      if (labware.linearWellStyle === 'trough') {
        return rendersLandscape
          ? { width: 520, height: 210 }
          : { width: 140, height: Math.max(320, count * 34) }
      }

      // Channel-style linear labware needs wide canvas when rendered in landscape mode.
      return rendersLandscape
        ? { width: 520, height: 180 }
        : { width: 120, height: Math.max(300, count * 35) }
    }
    
    // Single
    return { width: 120, height: 180 }
  }

  const sourceDims = getCanvasDimensions(sourceLabware, sourceOrientation)
  const targetDims = getCanvasDimensions(targetLabware, targetOrientation)
  const sourceIsGrid = sourceLabware?.addressing.type === 'grid'
  const targetIsGrid = targetLabware?.addressing.type === 'grid'
  const focusedEvent = useMemo(
    () => state.events.find((event) => event.eventId === state.selectedEventId) || null,
    [state.events, state.selectedEventId]
  )
  const focusedEventTargets = useMemo(
    () => (focusedEvent ? getEventFocusTargets(focusedEvent, state.labwares) : []),
    [focusedEvent, state.labwares]
  )
  const sourceFocusedCount = useMemo(() => {
    if (!sourceLabware) return 0
    return focusedEventTargets.find((target) => target.labwareId === sourceLabware.labwareId)?.wells.length || 0
  }, [focusedEventTargets, sourceLabware])
  const targetFocusedCount = useMemo(() => {
    if (!targetLabware) return 0
    return focusedEventTargets.find((target) => target.labwareId === targetLabware.labwareId)?.wells.length || 0
  }, [focusedEventTargets, targetLabware])
  const focusedEventSummary = focusedEvent ? getEventSummary(focusedEvent) : null

  return (
    <div className="dual-labware-pane" data-editor-mode={mode}>
      {/* Source Pane */}
      <div className="dual-pane dual-pane--source" data-pane-role="source" data-labware-id={sourceLabware?.labwareId || ''}>
        <div className="pane-header">
          <span className="pane-label">SOURCE</span>
          {sourceLabware && <span className="pane-name">{sourceLabware.name}</span>}
          {focusedEvent && sourceFocusedCount > 0 && (
            <span className="pane-focus-badge" title={focusedEventSummary || undefined}>
              Focus: {sourceFocusedCount} well{sourceFocusedCount === 1 ? '' : 's'}
            </span>
          )}
          <div className="pane-header-spacer" />
          {sourceLabware && sourceLabware.addressing.type === 'grid' && sourceLabware.orientationPolicy !== 'fixed_columns' && !(lockLandscapeTipracks && isTipRackType(sourceLabware.labwareType)) && (
            <button
              className="rotate-btn"
              onClick={handleRotateSource}
              title={sourceCanRotate ? `Rotate to ${sourceOrientation === 'portrait' ? 'landscape' : 'portrait'}` : (sourceRotateDisabledReason || 'Rotation unavailable')}
              disabled={!sourceCanRotate}
            >
              🔄
            </button>
          )}
        </div>
        {focusedEventSummary && sourceFocusedCount > 0 && (
          <PaneFocusInfo summary={focusedEventSummary} count={sourceFocusedCount} />
        )}
        <div
          className="pane-content"
          onPointerDown={() => {
            if (sourceLabware) setActiveOverlayPane('source')
          }}
        >
          {leftOverlay && (
            <div className={`pane-overlay ${activeOverlayPane === 'source' || sourceHasActivity ? 'pane-overlay--muted' : ''}`}>
              {leftOverlay}
            </div>
          )}
          {sourceLabware ? (
            <LabwareCanvas
              labware={sourceLabware}
              selectedWells={sourceSelection?.selectedWells || new Set()}
              highlightedWells={sourceSelection?.highlightedWells || new Set()}
              wellContents={effectiveSourceWellContents}
              previewWellContents={sourcePreviewWells}
              onSelectWells={handleSourceSelectWells}
              onWellHover={handleSourceWellHover}
              width={sourceIsGrid && sourceOrientation === 'portrait' ? sourceDims.height : sourceDims.width}
              height={sourceIsGrid && sourceOrientation === 'portrait' ? sourceDims.width : sourceDims.height}
              orientation={sourceOrientation}
              lastClickedWell={sourceSelection?.lastClickedWell}
              toolExpander={toolExpander}
              paneContext="source"
              onValidation={onValidation}
            />
          ) : (
            <EmptyPane label="source" />
          )}
        </div>
      </div>

      {/* Center Column */}
      <div className="dual-pane-center">
        <div className="swap-button-container">
          <button 
            className="swap-button"
            onClick={swapSourceTarget}
            title="Swap source and target"
          >
            ↔
          </button>
        </div>
      </div>

      {/* Target Pane */}
      <div className="dual-pane dual-pane--target" data-pane-role="target" data-labware-id={targetLabware?.labwareId || ''}>
        <div className="pane-header">
          <span className="pane-label">TARGET</span>
          {targetLabware && <span className="pane-name">{targetLabware.name}</span>}
          {focusedEvent && targetFocusedCount > 0 && (
            <span className="pane-focus-badge" title={focusedEventSummary || undefined}>
              Focus: {targetFocusedCount} well{targetFocusedCount === 1 ? '' : 's'}
            </span>
          )}
          <div className="pane-header-spacer" />
          {targetLabware && targetLabware.addressing.type === 'grid' && targetLabware.orientationPolicy !== 'fixed_columns' && !(lockLandscapeTipracks && isTipRackType(targetLabware.labwareType)) && (
            <button
              className="rotate-btn"
              onClick={handleRotateTarget}
              title={targetCanRotate ? `Rotate to ${targetOrientation === 'portrait' ? 'landscape' : 'portrait'}` : (targetRotateDisabledReason || 'Rotation unavailable')}
              disabled={!targetCanRotate}
            >
              🔄
            </button>
          )}
        </div>
        {focusedEventSummary && targetFocusedCount > 0 && (
          <PaneFocusInfo summary={focusedEventSummary} count={targetFocusedCount} />
        )}
        <div
          className="pane-content"
          onPointerDown={() => {
            if (targetLabware) setActiveOverlayPane('target')
          }}
        >
          {rightOverlay && (
            <div className={`pane-overlay ${activeOverlayPane === 'target' || targetHasActivity ? 'pane-overlay--muted' : ''}`}>
              {rightOverlay}
            </div>
          )}
          {targetLabware ? (
            <LabwareCanvas
              labware={targetLabware}
              selectedWells={targetSelection?.selectedWells || new Set()}
              highlightedWells={targetSelection?.highlightedWells || new Set()}
              wellContents={effectiveTargetWellContents}
              previewWellContents={targetPreviewWells}
              onSelectWells={handleTargetSelectWells}
              onWellHover={handleTargetWellHover}
              width={targetIsGrid && targetOrientation === 'portrait' ? targetDims.height : targetDims.width}
              height={targetIsGrid && targetOrientation === 'portrait' ? targetDims.width : targetDims.height}
              orientation={targetOrientation}
              lastClickedWell={targetSelection?.lastClickedWell}
              toolExpander={toolExpander}
              paneContext="target"
              onValidation={onValidation}
            />
          ) : (
            <EmptyPane label="target" />
          )}
        </div>
      </div>

      {/* Well Tooltip */}
      {hoveredWell && (
        <div
          className="well-tooltip-container"
          style={{
            position: 'fixed',
            left: hoveredWell.position.x,
            top: hoveredWell.position.y,
            zIndex: 9999,
          }}
        >
          <WellTooltip
            wellId={hoveredWell.wellId}
            labwareId={hoveredWell.labwareId}
            events={events}
            computedStates={computedStates}
            semanticInfo={
              hoveredWell.labwareId === sourceLabware?.labwareId
                ? sourceTooltipMeta?.get(hoveredWell.wellId)
                : hoveredWell.labwareId === targetLabware?.labwareId
                  ? targetTooltipMeta?.get(hoveredWell.wellId)
                  : undefined
            }
          />
        </div>
      )}

      <style>{`
        .dual-labware-pane {
          display: flex;
          align-items: stretch;
          gap: 0.8rem;
          background:
            radial-gradient(circle at top left, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.9) 46%, rgba(241, 245, 249, 0.95)),
            linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
          border: 1px solid #dbe2ea;
          border-radius: 18px;
          padding: 0.8rem;
          min-height: 400px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
        }

        .dual-pane {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: rgba(255, 255, 255, 0.96);
          border-radius: 16px;
          border: 1px solid rgba(203, 213, 225, 0.9);
          overflow: hidden;
          box-shadow:
            0 14px 36px rgba(15, 23, 42, 0.06),
            0 2px 8px rgba(15, 23, 42, 0.04);
        }

        .dual-pane--source {
          border-color: rgba(51, 154, 240, 0.42);
        }

        .dual-pane--target {
          border-color: rgba(64, 192, 87, 0.42);
        }

        .dual-pane-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.9rem;
          flex: 0 0 auto;
          justify-content: center;
          padding: 0.25rem 0;
        }

        .pane-header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.7rem 0.9rem;
          border-bottom: 1px solid rgba(226, 232, 240, 0.9);
        }

        .dual-pane--source .pane-header {
          background: linear-gradient(180deg, rgba(231, 245, 255, 0.98) 0%, rgba(243, 249, 255, 0.98) 100%);
        }

        .dual-pane--target .pane-header {
          background: linear-gradient(180deg, rgba(235, 251, 238, 0.98) 0%, rgba(244, 252, 246, 0.98) 100%);
        }

        .pane-label {
          display: inline-flex;
          align-items: center;
          height: 1.5rem;
          padding: 0 0.55rem;
          border-radius: 999px;
          font-size: 0.66rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.9);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        .dual-pane--source .pane-label {
          color: #1769aa;
        }

        .dual-pane--target .pane-label {
          color: #207943;
        }

        .pane-name {
          min-width: 0;
          font-size: 0.88rem;
          font-weight: 700;
          color: #1f2937;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pane-focus-badge {
          font-size: 0.68rem;
          font-weight: 600;
          color: #364fc7;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(54, 79, 199, 0.16);
          border-radius: 999px;
          padding: 0.2rem 0.5rem;
        }

        .pane-focus-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.9rem;
          border-bottom: 1px solid rgba(219, 234, 254, 0.8);
          background: linear-gradient(180deg, #f8fbff 0%, #f3f7fd 100%);
        }

        .pane-focus-info__label {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #364fc7;
          flex-shrink: 0;
        }

        .pane-focus-info__summary {
          font-size: 0.78rem;
          color: #495057;
          min-width: 0;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pane-focus-info__count {
          font-size: 0.72rem;
          color: #748ffc;
          font-weight: 600;
          flex-shrink: 0;
        }

        .pane-header-spacer {
          flex: 1;
        }

        .rotate-btn {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(203, 213, 225, 0.9);
          background: rgba(255, 255, 255, 0.88);
          cursor: pointer;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          padding: 0;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
        }

        .rotate-btn:hover {
          border-color: #339af0;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .rotate-btn:active {
          transform: rotate(90deg);
        }

        .pane-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.85rem;
          min-height: 300px;
          overflow-x: auto;
          overflow-y: hidden;
          position: relative;
          background:
            radial-gradient(circle at top, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.92) 45%, rgba(241, 245, 249, 0.9)),
            linear-gradient(180deg, #fbfdff 0%, #f5f8fc 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        .pane-overlay {
          position: absolute;
          inset: 0.55rem;
          pointer-events: none;
          transition: opacity 140ms ease;
          border-radius: 12px;
        }

        .pane-overlay--muted {
          opacity: 0.4;
        }

        .dual-pane__empty {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          min-height: 250px;
        }

        .empty-content {
          text-align: center;
          color: #64748b;
          max-width: 15rem;
        }

        .empty-icon {
          font-size: 2.2rem;
          display: block;
          margin-bottom: 0.65rem;
          opacity: 0.9;
        }

        .empty-content p {
          margin: 0.25rem 0;
          font-size: 0.88rem;
        }

        .empty-content .hint {
          font-size: 0.75rem;
          font-style: italic;
          line-height: 1.45;
        }

        .swap-button-container {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .swap-button {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 1px solid rgba(203, 213, 225, 0.9);
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          cursor: pointer;
          font-size: 1.15rem;
          color: #334155;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          box-shadow:
            0 10px 24px rgba(15, 23, 42, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.95);
        }

        .swap-button:hover {
          border-color: #339af0;
          color: #339af0;
          background: #eff6ff;
          transform: translateY(-1px);
        }

        @media (max-width: 768px) {
          .dual-labware-pane {
            flex-direction: column;
          }

          .swap-button-container {
            padding: 0.5rem 0;
          }

          .swap-button {
            transform: rotate(90deg);
          }
        }
      `}</style>
    </div>
  )
}

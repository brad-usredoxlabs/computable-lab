/**
 * WellContextPanelV2 - Enhanced well context panel for multi-labware support.
 * Shows computed state, validation warnings, and event history using the eventGraph library.
 */

import { useMemo } from 'react'
import type { WellId } from '../../types/plate'
import type { Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '../../types/events'
import type { TransferDetails } from '../../types/events'
import { normalizeTransferDetails } from '../../types/events'
import { LABWARE_TYPE_ICONS } from '../../types/labware'
import {
  computeLabwareStates,
  getWellState,
  getWellEvents,
  formatVolume,
  getMaterialsSummary,
  type WellComputedState,
  type LabwareStates,
} from '../lib/eventGraph'
import {
  formatComputedConcentration,
  formatComputedCount,
  formatScientificStateSummary,
} from '../../shared/lib/formHelpers'
import {
  validateEventGraph,
  getWellErrors,
  formatValidationError,
  type ValidationResult,
  type ValidationError,
} from '../lib/eventValidation'

/**
 * Selected well with labware context
 */
export interface SelectedWell {
  labwareId: string
  wellId: WellId
}

interface WellContextPanelV2Props {
  /** Selected wells with their labware IDs */
  selectedWells: SelectedWell[]
  /** All events in the graph */
  events: PlateEvent[]
  /** All labwares */
  labwares: Map<string, Labware>
  /** Callback when event is clicked */
  onEventClick?: (eventId: string) => void
  /** Show validation warnings */
  showValidation?: boolean
  /** Compact mode (less detail) */
  compact?: boolean
}

/**
 * WellContextPanelV2 component
 */
export function WellContextPanelV2({
  selectedWells,
  events,
  labwares,
  onEventClick,
  showValidation = true,
  compact = false,
}: WellContextPanelV2Props) {
  // Compute states and validation in one pass
  const { computedStates, validation } = useMemo(() => {
    const states = computeLabwareStates(events, labwares)
    const result = showValidation 
      ? validateEventGraph(events, labwares)
      : null
    return { computedStates: states, validation: result }
  }, [events, labwares, showValidation])

  if (selectedWells.length === 0) {
    return (
      <div className="well-context-panel-v2 well-context-panel-v2--empty">
        <div className="empty-state">
          <span className="empty-icon">🔬</span>
          <p>Select wells to view context</p>
          <p className="hint">Click wells on the labware to see their contents and history.</p>
        </div>
        <style>{styles}</style>
      </div>
    )
  }

  // Group selected wells by labware
  const wellsByLabware = useMemo(() => {
    const grouped = new Map<string, WellId[]>()
    for (const { labwareId, wellId } of selectedWells) {
      const wells = grouped.get(labwareId) || []
      wells.push(wellId)
      grouped.set(labwareId, wells)
    }
    return grouped
  }, [selectedWells])

  return (
    <div className="well-context-panel-v2">
      <div className="panel-header">
        <h3>Well Context</h3>
        <span className="well-count">
          {selectedWells.length} well{selectedWells.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Validation summary if there are errors */}
      {validation && (validation.errorCount > 0 || validation.warningCount > 0) && (
        <div className="validation-summary">
          {validation.errorCount > 0 && (
            <span className="error-badge">❌ {validation.errorCount}</span>
          )}
          {validation.warningCount > 0 && (
            <span className="warning-badge">⚠️ {validation.warningCount}</span>
          )}
        </div>
      )}

      <div className="panel-content">
        {Array.from(wellsByLabware).map(([labwareId, wells]) => {
          const labware = labwares.get(labwareId)
          if (!labware) return null

          return (
            <LabwareWellsSection
              key={labwareId}
              labware={labware}
              wells={wells}
              events={events}
              computedStates={computedStates}
              validation={validation}
              onEventClick={onEventClick}
              compact={compact}
              showLabwareHeader={wellsByLabware.size > 1}
            />
          )
        })}
      </div>

      <style>{styles}</style>
    </div>
  )
}

/**
 * Section for wells from a single labware
 */
function LabwareWellsSection({
  labware,
  wells,
  events,
  computedStates,
  validation,
  onEventClick,
  compact,
  showLabwareHeader,
}: {
  labware: Labware
  wells: WellId[]
  events: PlateEvent[]
  computedStates: LabwareStates
  validation: ValidationResult | null
  onEventClick?: (eventId: string) => void
  compact: boolean
  showLabwareHeader: boolean
}) {
  return (
    <div className="labware-section">
      {showLabwareHeader && (
        <div className="labware-header" style={{ borderColor: labware.color }}>
          <span className="labware-icon">{LABWARE_TYPE_ICONS[labware.labwareType]}</span>
          <span className="labware-name">{labware.name}</span>
        </div>
      )}

      <div className="wells-list">
        {wells.map((wellId) => {
          const state = getWellState(computedStates, labware.labwareId, wellId)
          const wellEvents = getWellEvents(events, labware.labwareId, wellId)
          const errors = validation 
            ? getWellErrors(validation, labware.labwareId, wellId)
            : []

          return (
            <WellStateCard
              key={wellId}
              wellId={wellId}
              state={state}
              events={wellEvents}
              errors={errors}
              maxVolume={labware.geometry.maxVolume_uL}
              onEventClick={onEventClick}
              compact={compact}
              showWellId={wells.length > 1 || showLabwareHeader}
            />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Card showing state for a single well
 */
function WellStateCard({
  wellId,
  state,
  events,
  errors,
  maxVolume,
  onEventClick,
  compact,
  showWellId,
}: {
  wellId: WellId
  state: WellComputedState
  events: PlateEvent[]
  errors: ValidationError[]
  maxVolume: number
  onEventClick?: (eventId: string) => void
  compact: boolean
  showWellId: boolean
}) {
  const volumePercent = Math.min(100, (state.volume_uL / maxVolume) * 100)
  const hasWarnings = errors.some(e => e.severity === 'warning')
  const hasErrors = errors.some(e => e.severity === 'error')
  const scientificSummary = formatScientificStateSummary(state.materials.length, formatVolume(state.volume_uL))
  const lineageContexts = useMemo(() => {
    const refs: Array<{ id: string; label: string }> = []
    const seen = new Set<string>()
    for (const event of events) {
      if (event.event_type !== 'transfer' && event.event_type !== 'multi_dispense') continue
      const transfer = normalizeTransferDetails(event.details as TransferDetails)
      if (!transfer.destWells.includes(wellId)) continue
      for (const input of transfer.inputs || []) {
        const id = typeof input.contextRef === 'string' ? input.contextRef : input.contextRef.id
        const label = typeof input.contextRef === 'string'
          ? input.contextRef
          : input.contextRef.label || input.contextRef.id
        if (!seen.has(id)) {
          seen.add(id)
          refs.push({ id, label })
        }
      }
    }
    return refs
  }, [events, wellId])

  return (
    <div className={`well-state-card ${hasErrors ? 'has-error' : hasWarnings ? 'has-warning' : ''}`}>
      {/* Header */}
      <div className="well-state-header">
        {showWellId && <span className="well-id">{wellId}</span>}
        <span className="volume">{formatVolume(state.volume_uL)}</span>
        {state.harvested && <span className="badge badge--harvested">Harvested</span>}
      </div>
      <div className="well-scientific-summary">{scientificSummary}</div>

      {/* Volume bar */}
      <div className="volume-bar">
        <div 
          className={`volume-bar-fill ${volumePercent > 90 ? 'volume-bar-fill--high' : ''}`}
          style={{ width: `${volumePercent}%` }}
        />
      </div>

      {/* Materials */}
      {!compact && state.materials.length > 0 && (
        <div className="materials-section">
          <h5>Scientific State</h5>
          <ul className="materials-list">
            {state.materials.map((material, idx) => (
              <li key={idx}>
                <span className="material-name">{material.materialRef}</span>
                <span className="material-meta">
                  {formatComputedConcentration(material.concentration, material.concentrationUnknown) || 'no concentration'}
                  {' · '}
                  {formatVolume(material.volume_uL)}
                  {typeof material.count === 'number' ? ` · ${formatComputedCount(material.count)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Compact summary */}
      {compact && state.materials.length > 0 && (
        <div className="materials-summary">{getMaterialsSummary(state)}</div>
      )}

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="errors-section">
          {errors.map((error) => (
            <div 
              key={error.id} 
              className={`error-item error-item--${error.severity}`}
            >
              {formatValidationError(error)}
            </div>
          ))}
        </div>
      )}

      {/* Lineage context references for aliquot seeding */}
      {!compact && lineageContexts.length > 0 && (
        <div className="lineage-section">
          <h5>Lineage Inputs</h5>
          <div className="lineage-chips">
            {lineageContexts.map((ctx) => (
              <span key={ctx.id} className="lineage-chip" title={ctx.id}>
                {ctx.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Event history */}
      {!compact && events.length > 0 && (
        <div className="history-section">
          <h5>History ({events.length})</h5>
          <ul className="history-list">
            {events.map((event, idx) => (
              <li 
                key={event.eventId}
                className="history-item"
                onClick={() => onEventClick?.(event.eventId)}
              >
                <span className="history-index">{idx + 1}</span>
                <span className="history-icon">{EVENT_TYPE_ICONS[event.event_type]}</span>
                <span className="history-label">{EVENT_TYPE_LABELS[event.event_type]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Compact event count */}
      {compact && events.length > 0 && (
        <div className="events-count">{events.length} event{events.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  )
}

/**
 * Styles
 */
const styles = `
  .well-context-panel-v2 {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: white;
    border-radius: 8px;
    overflow: hidden;
  }

  .well-context-panel-v2--empty {
    justify-content: center;
    align-items: center;
  }

  .empty-state {
    text-align: center;
    color: #868e96;
    padding: 2rem;
  }

  .empty-icon {
    font-size: 2rem;
    display: block;
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    margin: 0.25rem 0;
  }

  .empty-state .hint {
    font-size: 0.75rem;
    font-style: italic;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e9ecef;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
  }

  .well-count {
    background: #e9ecef;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    color: #495057;
  }

  .validation-summary {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: #f8f9fa;
    border-bottom: 1px solid #e9ecef;
  }

  .error-badge, .warning-badge {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
  }

  .error-badge {
    background: #ffe3e3;
    color: #c92a2a;
  }

  .warning-badge {
    background: #fff3bf;
    color: #e67700;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .labware-section {
    margin-bottom: 1rem;
  }

  .labware-section:last-child {
    margin-bottom: 0;
  }

  .labware-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #f8f9fa;
    border-left: 3px solid;
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }

  .labware-icon {
    font-size: 1rem;
  }

  .labware-name {
    font-weight: 500;
    font-size: 0.875rem;
  }

  .wells-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .well-state-card {
    background: #f8f9fa;
    border-radius: 6px;
    padding: 0.75rem;
    border-left: 3px solid #dee2e6;
  }

  .well-state-card.has-warning {
    border-left-color: #fcc419;
  }

  .well-state-card.has-error {
    border-left-color: #ff6b6b;
  }

  .well-state-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .well-scientific-summary {
    font-size: 0.72rem;
    color: #868e96;
    margin-bottom: 0.5rem;
  }

  .well-id {
    font-weight: 700;
    font-size: 1rem;
    color: #228be6;
  }

  .volume {
    font-family: monospace;
    font-size: 0.875rem;
    color: #495057;
  }

  .badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .badge--harvested {
    background: #d3f9d8;
    color: #2b8a3e;
  }

  .volume-bar {
    height: 4px;
    background: #e9ecef;
    border-radius: 2px;
    margin-bottom: 0.5rem;
  }

  .volume-bar-fill {
    height: 100%;
    background: #339af0;
    border-radius: 2px;
    transition: width 0.2s;
  }

  .volume-bar-fill--high {
    background: #fcc419;
  }

  .materials-section, .history-section, .errors-section {
    margin-top: 0.5rem;
  }

  .lineage-section {
    margin-top: 0.5rem;
  }

  .lineage-section h5 {
    margin: 0 0 0.25rem;
    font-size: 0.625rem;
    text-transform: uppercase;
    color: #868e96;
    letter-spacing: 0.5px;
  }

  .lineage-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .lineage-chip {
    font-size: 0.68rem;
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
    background: #fff3bf;
    color: #5f3b00;
    border: 1px solid #ffe066;
    max-width: 210px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .materials-section h5, .history-section h5 {
    margin: 0 0 0.25rem;
    font-size: 0.625rem;
    text-transform: uppercase;
    color: #868e96;
    letter-spacing: 0.5px;
  }

  .materials-list, .history-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .materials-list li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.25rem 0;
    font-size: 0.75rem;
    border-bottom: 1px solid #e9ecef;
  }

  .materials-list li:last-child {
    border-bottom: none;
  }

  .material-name {
    flex: 1;
    font-weight: 500;
  }

  .material-meta {
    color: #868e96;
    font-size: 0.68rem;
  }

  .materials-summary {
    font-size: 0.75rem;
    color: #495057;
  }

  .errors-section {
    margin-top: 0.5rem;
  }

  .error-item {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    margin-bottom: 0.25rem;
  }

  .error-item--error {
    background: #ffe3e3;
    color: #c92a2a;
  }

  .error-item--warning {
    background: #fff3bf;
    color: #e67700;
  }

  .error-item--info {
    background: #e7f5ff;
    color: #1864ab;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .history-item:hover {
    background: #e9ecef;
  }

  .history-index {
    width: 1rem;
    height: 1rem;
    background: #dee2e6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.5rem;
    color: #495057;
  }

  .history-icon {
    font-size: 0.75rem;
  }

  .history-label {
    flex: 1;
  }

  .events-count {
    font-size: 0.75rem;
    color: #868e96;
    margin-top: 0.25rem;
  }
`

/**
 * Export helper hook for integrating with LabwareEditorContext
 */
export function useWellContextData(
  events: PlateEvent[],
  labwares: Map<string, Labware>
) {
  return useMemo(() => {
    const states = computeLabwareStates(events, labwares)
    const validation = validateEventGraph(events, labwares)
    return { states, validation }
  }, [events, labwares])
}

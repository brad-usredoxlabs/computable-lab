import { useCallback, useMemo } from 'react'
import { useOptionalLabwareEditor } from '../../graph/context/LabwareEditorContext'
import { getEventFocusTargets } from '../../graph/lib/eventFocus'
import type { WellId } from '../../types/plate'
import type { AddMaterialDetails, PlateEvent, TransferDetails } from '../../types/events'
import {
  EVENT_TYPE_COLORS,
  EVENT_TYPE_LABELS,
  getAddMaterialRef,
  getAffectedWells,
  getRefLabel,
  normalizeTransferDetails,
} from '../../types/events'

interface PreviewEventListProps {
  previewEvents: PlateEvent[]
}

function formatWellList(wells: WellId[]): string {
  if (wells.length === 0) return 'no wells'
  if (wells.length <= 4) return wells.join(', ')
  return `${wells.slice(0, 4).join(', ')} +${wells.length - 4} more`
}

function formatLabwareLabel(name: string | undefined, wells: WellId[]): string {
  const labwareName = name || 'Unknown labware'
  return `${labwareName} · ${formatWellList(wells)}`
}

function paneStatusLabel(isSource: boolean, isTarget: boolean): string | null {
  if (isSource && isTarget) return 'Visible in both panes'
  if (isTarget) return 'Current target pane'
  if (isSource) return 'Current source pane'
  return 'Not currently focused'
}

export function PreviewEventList({ previewEvents }: PreviewEventListProps) {
  const editor = useOptionalLabwareEditor()
  const state = editor?.state
  const clearSelection = editor?.clearSelection
  const selectWells = editor?.selectWells
  const setSourceLabware = editor?.setSourceLabware
  const setTargetLabware = editor?.setTargetLabware
  const setActiveLabware = editor?.setActiveLabware

  const previewRows = useMemo(() => {
    if (!state) return []
    return previewEvents.map((event) => {
      const color = EVENT_TYPE_COLORS[event.event_type] || '#868e96'

      if (event.event_type === 'add_material') {
        const addDetails = event.details as AddMaterialDetails
        const labwareId = typeof addDetails.labwareId === 'string' ? addDetails.labwareId : undefined
        const wells = getAffectedWells(event)
        const destinationName = labwareId ? state.labwares.get(labwareId)?.name : undefined
        const refLabel = getRefLabel(getAddMaterialRef(addDetails) as string | { label?: string; id?: string } | undefined) || 'Material'
        const amountParts = [
          addDetails.volume ? `${addDetails.volume.value} ${addDetails.volume.unit}` : null,
          typeof addDetails.count === 'number' ? `${addDetails.count} count` : null,
          addDetails.concentration ? `${addDetails.concentration.value} ${addDetails.concentration.unit}` : null,
        ].filter(Boolean) as string[]
        const isSource = labwareId != null && state.sourceLabwareId === labwareId
        const isTarget = labwareId != null && state.targetLabwareId === labwareId
        return {
          key: event.eventId,
          color,
          title: 'Add Material',
          primary: refLabel,
          secondary: amountParts.join(' · '),
          destination: labwareId ? formatLabwareLabel(destinationName, wells) : 'Destination unavailable',
          destinationStatus: paneStatusLabel(isSource, isTarget),
          focus: () => {
            if (!labwareId) return
            clearSelection?.()
            setTargetLabware?.(labwareId)
            setActiveLabware?.(labwareId)
            if (wells.length > 0) {
              selectWells?.(labwareId, wells, 'replace')
            }
          },
        }
      }

      if (event.event_type === 'transfer' || event.event_type === 'multi_dispense') {
        const transferDetails = normalizeTransferDetails(event.details as TransferDetails)
        const sourceName = transferDetails.sourceLabwareId
          ? state.labwares.get(transferDetails.sourceLabwareId)?.name
          : undefined
        const targetName = transferDetails.destLabwareId
          ? state.labwares.get(transferDetails.destLabwareId)?.name
          : undefined
        return {
          key: event.eventId,
          color,
          title: EVENT_TYPE_LABELS[event.event_type],
          primary: transferDetails.volume
            ? `${transferDetails.volume.value} ${transferDetails.volume.unit}`
            : 'Volume not specified',
          secondary: null,
          destination: `Source: ${formatLabwareLabel(sourceName, transferDetails.sourceWells)}\nTarget: ${formatLabwareLabel(targetName, transferDetails.destWells)}`,
          destinationStatus: null,
          focus: () => {
            clearSelection?.()
            if (transferDetails.sourceLabwareId) {
              setSourceLabware?.(transferDetails.sourceLabwareId)
              setActiveLabware?.(transferDetails.sourceLabwareId)
              if (transferDetails.sourceWells.length > 0) {
                selectWells?.(transferDetails.sourceLabwareId, transferDetails.sourceWells, 'replace')
              }
            }
            if (transferDetails.destLabwareId) {
              setTargetLabware?.(transferDetails.destLabwareId)
              if (transferDetails.destWells.length > 0) {
                selectWells?.(transferDetails.destLabwareId, transferDetails.destWells, 'replace')
              }
            }
          },
        }
      }

      const focusTargets = getEventFocusTargets(event, state.labwares)
      const firstTarget = focusTargets[0]
      const labwareName = firstTarget?.labwareId ? state.labwares.get(firstTarget.labwareId)?.name : undefined
      return {
        key: event.eventId,
        color,
        title: EVENT_TYPE_LABELS[event.event_type],
        primary: event.notes || 'Preview event',
        secondary: null,
        destination: firstTarget
          ? formatLabwareLabel(labwareName, firstTarget.wells)
          : 'No focused wells',
        destinationStatus: firstTarget ? paneStatusLabel(state.sourceLabwareId === firstTarget.labwareId, state.targetLabwareId === firstTarget.labwareId) : null,
        focus: () => {
          if (!firstTarget) return
          clearSelection?.()
          setTargetLabware?.(firstTarget.labwareId)
          setActiveLabware?.(firstTarget.labwareId)
          if (firstTarget.wells.length > 0) {
            selectWells?.(firstTarget.labwareId, firstTarget.wells, 'replace')
          }
        },
      }
    })
  }, [
    clearSelection,
    previewEvents,
    selectWells,
    setActiveLabware,
    setSourceLabware,
    setTargetLabware,
    state,
  ])

  const handleFocus = useCallback((focus: () => void) => {
    focus()
  }, [])

  if (previewRows.length === 0) return null

  return (
    <div className="preview-event-list">
      <div className="preview-event-list__header">Preview Changes</div>
      <div className="preview-event-list__rows">
        {previewRows.map((row) => (
          <button
            key={row.key}
            type="button"
            className="preview-event-list__row"
            onClick={() => handleFocus(row.focus)}
          >
            <span className="preview-event-list__accent" style={{ background: row.color }} />
            <div className="preview-event-list__body">
              <div className="preview-event-list__title-row">
                <span className="preview-event-list__title">{row.title}</span>
                <span className="preview-event-list__focus">Focus</span>
              </div>
              <div className="preview-event-list__primary">{row.primary}</div>
              {row.secondary && <div className="preview-event-list__secondary">{row.secondary}</div>}
              <div className="preview-event-list__destination">{row.destination}</div>
              {row.destinationStatus && (
                <div className="preview-event-list__status">{row.destinationStatus}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      <style>{`
        .preview-event-list {
          border-top: 1px solid #e9ecef;
          border-bottom: 1px solid #e9ecef;
          background: #faf7fd;
          flex-shrink: 0;
        }

        .preview-event-list__header {
          padding: 0.5rem 0.75rem 0.25rem;
          font-size: 0.73rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #7b2cbf;
        }

        .preview-event-list__rows {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0 0.5rem 0.6rem;
          max-height: 220px;
          overflow-y: auto;
        }

        .preview-event-list__row {
          display: flex;
          gap: 0.6rem;
          align-items: flex-start;
          width: 100%;
          padding: 0.55rem 0.65rem;
          border: 1px solid #e9d8fd;
          border-radius: 8px;
          background: white;
          text-align: left;
          cursor: pointer;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
        }

        .preview-event-list__row:hover {
          border-color: #c77dff;
          box-shadow: 0 2px 10px rgba(123, 44, 191, 0.08);
          transform: translateY(-1px);
        }

        .preview-event-list__accent {
          width: 4px;
          min-width: 4px;
          align-self: stretch;
          border-radius: 999px;
        }

        .preview-event-list__body {
          flex: 1;
          min-width: 0;
        }

        .preview-event-list__title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .preview-event-list__title {
          font-size: 0.77rem;
          font-weight: 700;
          color: #6f2dbd;
        }

        .preview-event-list__focus {
          font-size: 0.72rem;
          font-weight: 600;
          color: #495057;
        }

        .preview-event-list__primary {
          margin-top: 0.15rem;
          font-size: 0.84rem;
          font-weight: 600;
          color: #212529;
        }

        .preview-event-list__secondary {
          margin-top: 0.15rem;
          font-size: 0.75rem;
          color: #495057;
        }

        .preview-event-list__destination {
          margin-top: 0.35rem;
          font-size: 0.75rem;
          color: #343a40;
          white-space: pre-wrap;
        }

        .preview-event-list__status {
          margin-top: 0.22rem;
          font-size: 0.72rem;
          font-weight: 600;
          color: #7c6f64;
        }
      `}</style>
    </div>
  )
}

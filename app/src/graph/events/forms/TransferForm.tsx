/**
 * TransferForm - Form for transfer event type.
 * 
 * Enhanced for dual-pane layout:
 * - Shows source/target labware names
 * - Buttons to pull selections from source/target panes
 * - Visual indicators for well counts
 */

import { useCallback } from 'react'
import type { EventDetails, TransferDetails } from '../../../types/events'
import { normalizeTransferDetails, serializeTransferDetails } from '../../../types/events'
import { WellsSelector, VolumeInput } from '../EventEditor'
import { useLabwareEditor } from '../../context/LabwareEditorContext'
import { formatWellList } from '../../../shared/utils/wellUtils'

interface FormProps {
  details: EventDetails
  onChange: (details: EventDetails) => void
}

export function TransferForm({ details, onChange }: FormProps) {
  const d = details as TransferDetails
  const normalized = normalizeTransferDetails(d)
  const { 
    sourceLabware, 
    targetLabware, 
    sourceSelection, 
    targetSelection,
    state 
  } = useLabwareEditor()

  // Get labware names for display
  const sourceLabwareName = normalized.sourceLabwareId
    ? state.labwares.get(normalized.sourceLabwareId)?.name || 'Unknown'
    : sourceLabware?.name || 'Not set'
  
  const targetLabwareName = normalized.destLabwareId
    ? state.labwares.get(normalized.destLabwareId)?.name || 'Unknown'
    : targetLabware?.name || 'Not set'

  // Pull source wells from left pane selection
  const handleUseSourceSelection = useCallback(() => {
    if (sourceLabware && sourceSelection && sourceSelection.selectedWells.size > 0) {
      const wells = Array.from(sourceSelection.selectedWells)
      onChange({
        ...serializeTransferDetails({
          ...normalized,
          sourceLabwareId: sourceLabware.labwareId,
          sourceWells: wells,
        }, d),
      } as EventDetails)
    }
  }, [sourceLabware, sourceSelection, d, normalized, onChange])

  // Pull destination wells from right pane selection
  const handleUseTargetSelection = useCallback(() => {
    if (targetLabware && targetSelection && targetSelection.selectedWells.size > 0) {
      const wells = Array.from(targetSelection.selectedWells)
      onChange({
        ...serializeTransferDetails({
          ...normalized,
          destLabwareId: targetLabware.labwareId,
          destWells: wells,
        }, d),
      } as EventDetails)
    }
  }, [targetLabware, targetSelection, d, normalized, onChange])

  const sourceWellCount = normalized.sourceWells.length
  const destWellCount = normalized.destWells.length
  const sourceSelectionCount = sourceSelection?.selectedWells.size || 0
  const targetSelectionCount = targetSelection?.selectedWells.size || 0

  return (
    <div className="event-form transfer-form">
      {/* Source Section */}
      <div className="transfer-section transfer-section--source">
        <div className="section-header">
          <span className="section-label">SOURCE</span>
          <span className="labware-name">{sourceLabwareName}</span>
        </div>
        
        <div className="wells-row">
          <WellsSelector
            label="Source Wells"
            value={normalized.sourceWells}
            onChange={(wells) =>
              onChange(
                serializeTransferDetails(
                  { ...normalized, sourceWells: wells },
                  d
                ) as EventDetails
              )
            }
          />
          
          {sourceSelectionCount > 0 && (
            <button 
              type="button"
              className="use-selection-btn use-selection-btn--source"
              onClick={handleUseSourceSelection}
              title={`Use ${sourceSelectionCount} selected wells from source pane`}
            >
              ← Use Selection ({sourceSelectionCount})
            </button>
          )}
        </div>
        
        {sourceWellCount > 0 && (
          <div className="wells-preview">
            {formatWellList(normalized.sourceWells)}
          </div>
        )}
      </div>

      {/* Transfer Arrow */}
      <div className="transfer-arrow">
        <span className="arrow-icon">→</span>
        <span className="arrow-label">transfer to</span>
      </div>

      {/* Destination Section */}
      <div className="transfer-section transfer-section--target">
        <div className="section-header">
          <span className="section-label">TARGET</span>
          <span className="labware-name">{targetLabwareName}</span>
        </div>
        
        <div className="wells-row">
          <WellsSelector
            label="Destination Wells"
            value={normalized.destWells}
            onChange={(wells) =>
              onChange(
                serializeTransferDetails(
                  { ...normalized, destWells: wells },
                  d
                ) as EventDetails
              )
            }
          />
          
          {targetSelectionCount > 0 && (
            <button 
              type="button"
              className="use-selection-btn use-selection-btn--target"
              onClick={handleUseTargetSelection}
              title={`Use ${targetSelectionCount} selected wells from target pane`}
            >
              ← Use Selection ({targetSelectionCount})
            </button>
          )}
        </div>
        
        {destWellCount > 0 && (
          <div className="wells-preview">
            {formatWellList(normalized.destWells)}
          </div>
        )}
      </div>

      {/* Volume */}
      <div className="volume-section">
        <VolumeInput
          value={d.volume}
          onChange={(volume) =>
            onChange(
              serializeTransferDetails(
                { ...normalized, volume },
                d
              ) as EventDetails
            )
          }
        />
      </div>

      {/* Well count mismatch warning */}
      {sourceWellCount > 0 && destWellCount > 0 && sourceWellCount !== destWellCount && (
        <div className="well-count-warning">
          ⚠️ Source ({sourceWellCount}) and destination ({destWellCount}) well counts don't match.
          Consider using 1:1 or 1:many mapping.
        </div>
      )}

      <style>{`
        .transfer-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .transfer-section {
          padding: 0.75rem;
          border-radius: 8px;
          border: 2px solid #dee2e6;
        }

        .transfer-section--source {
          border-color: #339af0;
          background: #f8fbff;
        }

        .transfer-section--target {
          border-color: #40c057;
          background: #f8fff8;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .section-label {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
        }

        .transfer-section--source .section-label {
          background: #339af0;
          color: white;
        }

        .transfer-section--target .section-label {
          background: #40c057;
          color: white;
        }

        .labware-name {
          font-size: 0.8rem;
          color: #495057;
        }

        .wells-row {
          display: flex;
          align-items: flex-end;
          gap: 0.5rem;
        }

        .wells-row > :first-child {
          flex: 1;
        }

        .use-selection-btn {
          padding: 0.375rem 0.5rem;
          font-size: 0.7rem;
          border: 1px solid;
          border-radius: 4px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }

        .use-selection-btn--source {
          border-color: #339af0;
          background: #e7f5ff;
          color: #1971c2;
        }

        .use-selection-btn--source:hover {
          background: #339af0;
          color: white;
        }

        .use-selection-btn--target {
          border-color: #40c057;
          background: #ebfbee;
          color: #2f9e44;
        }

        .use-selection-btn--target:hover {
          background: #40c057;
          color: white;
        }

        .wells-preview {
          margin-top: 0.375rem;
          font-family: monospace;
          font-size: 0.7rem;
          color: #868e96;
          max-height: 2.5rem;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .transfer-arrow {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.25rem 0;
          color: #868e96;
        }

        .arrow-icon {
          font-size: 1.5rem;
          line-height: 1;
        }

        .arrow-label {
          font-size: 0.65rem;
          text-transform: uppercase;
        }

        .volume-section {
          padding-top: 0.5rem;
          border-top: 1px solid #e9ecef;
        }

        .well-count-warning {
          padding: 0.5rem;
          background: #fff9db;
          border: 1px solid #ffe066;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #e67700;
        }
      `}</style>
    </div>
  )
}

/**
 * MultiDispenseForm - Form for multi_dispense event type.
 * 
 * Similar to Transfer but with different volume calculation semantics:
 * - Transfer: (volume + dead) × N aspirations
 * - Multi-dispense: (volume × N) + dead (single aspiration)
 * 
 * Shows source/target wells and volume per dispense.
 */

import { useCallback } from 'react'
import type { EventDetails, TransferDetails } from '../../../types/events'
import { WellsSelector, VolumeInput } from '../EventEditor'
import { useLabwareEditor } from '../../context/LabwareEditorContext'
import { formatWellList } from '../../../shared/utils/wellUtils'

interface FormProps {
  details: EventDetails
  onChange: (details: EventDetails) => void
}

export function MultiDispenseForm({ details, onChange }: FormProps) {
  // Multi-dispense uses the same details structure as Transfer
  const d = details as TransferDetails
  const { 
    sourceLabware, 
    targetLabware, 
    sourceSelection, 
    targetSelection,
    state 
  } = useLabwareEditor()

  // Get labware names for display
  const sourceLabwareName = d.source_labwareId 
    ? state.labwares.get(d.source_labwareId)?.name || 'Unknown'
    : sourceLabware?.name || 'Not set'
  
  const targetLabwareName = d.dest_labwareId 
    ? state.labwares.get(d.dest_labwareId)?.name || 'Unknown'
    : targetLabware?.name || 'Not set'

  // Pull source wells from left pane selection
  const handleUseSourceSelection = useCallback(() => {
    if (sourceLabware && sourceSelection && sourceSelection.selectedWells.size > 0) {
      const wells = Array.from(sourceSelection.selectedWells)
      onChange({
        ...d,
        source_labwareId: sourceLabware.labwareId,
        source_wells: wells,
      })
    }
  }, [sourceLabware, sourceSelection, d, onChange])

  // Pull destination wells from right pane selection
  const handleUseTargetSelection = useCallback(() => {
    if (targetLabware && targetSelection && targetSelection.selectedWells.size > 0) {
      const wells = Array.from(targetSelection.selectedWells)
      onChange({
        ...d,
        dest_labwareId: targetLabware.labwareId,
        dest_wells: wells,
      })
    }
  }, [targetLabware, targetSelection, d, onChange])

  const sourceWellCount = d.source_wells?.length || 0
  const destWellCount = d.dest_wells?.length || 0
  const sourceSelectionCount = sourceSelection?.selectedWells.size || 0
  const targetSelectionCount = targetSelection?.selectedWells.size || 0
  
  // Calculate volumes for multi-dispense
  const volumePerDispense = d.volume?.value || 0
  const deadVolume = d.dead_volume?.value || 0
  const dispensesPerSource = sourceWellCount > 0 ? Math.ceil(destWellCount / sourceWellCount) : destWellCount
  const totalVolumeFromSource = (volumePerDispense * dispensesPerSource) + deadVolume

  return (
    <div className="event-form multi-dispense-form">
      {/* Info banner explaining multi-dispense */}
      <div className="multi-dispense-info">
        <span className="info-icon">ℹ️</span>
        <span className="info-text">
          <strong>Multi-Dispense:</strong> Single aspiration, multiple dispenses.
          Source loses (volume × N) + dead volume.
        </span>
      </div>

      {/* Source Section */}
      <div className="transfer-section transfer-section--source">
        <div className="section-header">
          <span className="section-label">SOURCE</span>
          <span className="labware-name">{sourceLabwareName}</span>
        </div>
        
        <div className="wells-row">
          <WellsSelector
            label="Source Wells"
            value={d.source_wells || []}
            onChange={(wells) => onChange({ ...d, source_wells: wells })}
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
            {formatWellList(d.source_wells || [])}
          </div>
        )}
      </div>

      {/* Transfer Arrow */}
      <div className="transfer-arrow">
        <span className="arrow-icon">⬇️⬇️</span>
        <span className="arrow-label">multi-dispense to</span>
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
            value={d.dest_wells || []}
            onChange={(wells) => onChange({ ...d, dest_wells: wells })}
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
            {formatWellList(d.dest_wells || [])}
          </div>
        )}
      </div>

      {/* Volume per dispense */}
      <div className="volume-section">
        <VolumeInput
          label="Volume per Dispense"
          value={d.volume}
          onChange={(volume) => onChange({ ...d, volume })}
        />
      </div>

      {/* Dead volume (overage) */}
      <div className="form-field">
        <label>Dead Volume (Overage)</label>
        <div className="dead-volume-input">
          <input
            type="number"
            value={d.dead_volume?.value ?? ''}
            onChange={(e) => {
              const num = parseFloat(e.target.value)
              if (!isNaN(num)) {
                onChange({ 
                  ...d, 
                  dead_volume: { value: num, unit: d.dead_volume?.unit || 'uL' } 
                })
              } else if (e.target.value === '') {
                onChange({ ...d, dead_volume: undefined })
              }
            }}
            placeholder="0"
            min="0"
            step="any"
          />
          <select
            value={d.dead_volume?.unit || 'uL'}
            onChange={(e) => {
              if (d.dead_volume) {
                onChange({ 
                  ...d, 
                  dead_volume: { ...d.dead_volume, unit: e.target.value as 'uL' | 'mL' | '%' } 
                })
              }
            }}
          >
            <option value="uL">µL</option>
            <option value="mL">mL</option>
            <option value="%">%</option>
          </select>
        </div>
      </div>

      {/* Volume calculation summary */}
      {sourceWellCount > 0 && destWellCount > 0 && volumePerDispense > 0 && (
        <div className="volume-summary">
          <div className="summary-header">📊 Volume Calculation</div>
          <div className="summary-row">
            <span>Dispenses per source:</span>
            <span>{dispensesPerSource}</span>
          </div>
          <div className="summary-row">
            <span>Volume per dispense:</span>
            <span>{volumePerDispense} µL</span>
          </div>
          <div className="summary-row">
            <span>Dead volume:</span>
            <span>{deadVolume} µL</span>
          </div>
          <div className="summary-row summary-row--total">
            <span>Total from each source:</span>
            <span>{totalVolumeFromSource.toFixed(1)} µL</span>
          </div>
          <div className="summary-formula">
            ({volumePerDispense} × {dispensesPerSource}) + {deadVolume} = {totalVolumeFromSource.toFixed(1)} µL
          </div>
        </div>
      )}

      <style>{`
        .multi-dispense-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .multi-dispense-info {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: #f3f0ff;
          border: 1px solid #b197fc;
          border-radius: 6px;
        }

        .info-icon {
          font-size: 1rem;
        }

        .info-text {
          font-size: 0.75rem;
          color: #5f3dc4;
          line-height: 1.4;
        }

        .transfer-section {
          padding: 0.75rem;
          border-radius: 8px;
          border: 2px solid #dee2e6;
        }

        .transfer-section--source {
          border-color: #7950f2;
          background: #f8f0ff;
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
          background: #7950f2;
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
          border-color: #7950f2;
          background: #f3f0ff;
          color: #5f3dc4;
        }

        .use-selection-btn--source:hover {
          background: #7950f2;
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
          color: #7950f2;
        }

        .arrow-icon {
          font-size: 1.25rem;
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

        .dead-volume-input {
          display: flex;
          gap: 0.5rem;
        }

        .dead-volume-input input {
          flex: 1;
          max-width: 120px;
          padding: 0.5rem;
          border: 1px solid #ced4da;
          border-radius: 4px;
        }

        .dead-volume-input select {
          width: 70px;
          padding: 0.5rem;
          border: 1px solid #ced4da;
          border-radius: 4px;
        }

        .volume-summary {
          padding: 0.75rem;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 6px;
        }

        .summary-header {
          font-size: 0.75rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #495057;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          padding: 0.125rem 0;
        }

        .summary-row--total {
          margin-top: 0.25rem;
          padding-top: 0.25rem;
          border-top: 1px solid #dee2e6;
          font-weight: 600;
        }

        .summary-formula {
          margin-top: 0.5rem;
          padding: 0.375rem;
          background: white;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.7rem;
          text-align: center;
          color: #7950f2;
        }
      `}</style>
    </div>
  )
}

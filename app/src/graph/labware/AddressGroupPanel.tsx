/**
 * AddressGroupPanel - Panel for quick selection of address groups.
 * 
 * Shows collapsible sections for:
 * - Rows (A-H)
 * - Columns (1-12)
 * - Quadrants (4 sections)
 * - Halves (left/right, top/bottom)
 * - Custom groups
 */

import { useState, useMemo, useCallback } from 'react'
import type { Labware } from '../../types/labware'
import type { WellId } from '../../types/plate'
import type { AddressGroup } from '../../types/addressGroup'
import {
  generateRowGroups,
  generateColumnGroups,
  generateQuadrantGroups,
  generateHalfGroups,
  createCustomGroup,
  LABEL_PRESETS,
} from '../../types/addressGroup'

export interface AddressGroupPanelProps {
  labware: Labware
  /** Current selection to enable "Save as Group" */
  selectedWells?: WellId[]
  /** Callback when a group is clicked (replaces selection) */
  onSelectGroup?: (wells: WellId[]) => void
  /** Callback to add to selection */
  onAddToSelection?: (wells: WellId[]) => void
  /** Custom groups defined by user */
  customGroups?: AddressGroup[]
  /** Callback when custom group is created */
  onCreateCustomGroup?: (group: AddressGroup) => void
  /** Compact mode */
  compact?: boolean
}

type SectionId = 'rows' | 'columns' | 'quadrants' | 'halves' | 'custom' | 'presets'

export function AddressGroupPanel({
  labware,
  selectedWells = [],
  onSelectGroup,
  onAddToSelection,
  customGroups = [],
  onCreateCustomGroup,
  compact = false,
}: AddressGroupPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(
    new Set(['rows', 'columns'])
  )
  const [newGroupName, setNewGroupName] = useState('')

  // Generate standard groups
  const rowGroups = useMemo(() => generateRowGroups(labware), [labware])
  const columnGroups = useMemo(() => generateColumnGroups(labware), [labware])
  const quadrantGroups = useMemo(() => generateQuadrantGroups(labware), [labware])
  const halfGroups = useMemo(() => generateHalfGroups(labware), [labware])

  const toggleSection = useCallback((section: SectionId) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }, [])

  const handleGroupClick = useCallback((group: AddressGroup, addToSelection: boolean) => {
    if (addToSelection && onAddToSelection) {
      onAddToSelection(group.wells)
    } else if (onSelectGroup) {
      onSelectGroup(group.wells)
    }
  }, [onSelectGroup, onAddToSelection])

  const handleCreateCustomGroup = useCallback(() => {
    if (newGroupName.trim() && selectedWells.length > 0 && onCreateCustomGroup) {
      const group = createCustomGroup(newGroupName.trim(), selectedWells)
      onCreateCustomGroup(group)
      setNewGroupName('')
    }
  }, [newGroupName, selectedWells, onCreateCustomGroup])

  const handlePresetClick = useCallback((presetType: 'positive' | 'negative' | 'blank' | 'vehicle') => {
    if (selectedWells.length > 0) {
      const preset = LABEL_PRESETS.controls[presetType]
      const group = createCustomGroup(preset.fullLabel, selectedWells, preset.color)
      onCreateCustomGroup?.(group)
    }
  }, [selectedWells, onCreateCustomGroup])

  const renderGroupPill = (group: AddressGroup) => (
    <button
      key={group.groupId}
      className="group-pill"
      style={{ '--group-color': group.color } as React.CSSProperties}
      onClick={(e) => handleGroupClick(group, e.shiftKey)}
      title={`${group.name} (${group.wells.length} wells)\nShift+click to add`}
    >
      {compact ? group.name.replace('Row ', '').replace('Col ', '') : group.name}
    </button>
  )

  const renderSection = (
    id: SectionId,
    title: string,
    groups: AddressGroup[],
    icon: string
  ) => {
    if (groups.length === 0) return null

    const isExpanded = expandedSections.has(id)

    return (
      <div className="group-section">
        <button
          className="section-header"
          onClick={() => toggleSection(id)}
        >
          <span className="section-icon">{icon}</span>
          <span className="section-title">{title}</span>
          <span className="section-count">{groups.length}</span>
          <span className={`section-chevron ${isExpanded ? 'expanded' : ''}`}>▾</span>
        </button>
        {isExpanded && (
          <div className="section-content">
            {groups.map(renderGroupPill)}
          </div>
        )}
      </div>
    )
  }

  // Only show for grid labware
  if (labware.addressing.type !== 'grid') {
    return (
      <div className="address-group-panel address-group-panel--empty">
        <p>Address groups not available for this labware type</p>
      </div>
    )
  }

  return (
    <div className={`address-group-panel ${compact ? 'compact' : ''}`}>
      <div className="panel-header">
        <span className="panel-title">Quick Select</span>
      </div>

      <div className="panel-content">
        {renderSection('rows', 'Rows', rowGroups, '━')}
        {renderSection('columns', 'Columns', columnGroups, '┃')}
        {renderSection('quadrants', 'Quadrants', quadrantGroups, '◧')}
        {renderSection('halves', 'Halves', halfGroups, '◨')}
        {renderSection('custom', 'Custom', customGroups, '★')}

        {/* Create custom group */}
        {selectedWells.length > 0 && onCreateCustomGroup && (
          <div className="create-group-section">
            <div className="section-header">
              <span className="section-icon">+</span>
              <span className="section-title">Save Selection</span>
            </div>
            <div className="create-group-form">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name..."
                className="group-name-input"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCustomGroup()}
              />
              <button
                className="create-group-btn"
                onClick={handleCreateCustomGroup}
                disabled={!newGroupName.trim()}
              >
                Save
              </button>
            </div>
            <div className="preset-buttons">
              <button
                className="preset-btn preset-btn--positive"
                onClick={() => handlePresetClick('positive')}
                title="Mark as Positive Control"
              >
                +Ctrl
              </button>
              <button
                className="preset-btn preset-btn--negative"
                onClick={() => handlePresetClick('negative')}
                title="Mark as Negative Control"
              >
                -Ctrl
              </button>
              <button
                className="preset-btn preset-btn--blank"
                onClick={() => handlePresetClick('blank')}
                title="Mark as Blank"
              >
                Blank
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .address-group-panel {
          display: flex;
          flex-direction: column;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e9ecef;
          font-size: 0.85rem;
          min-width: 180px;
        }

        .address-group-panel.compact {
          font-size: 0.8rem;
          min-width: 140px;
        }

        .address-group-panel--empty {
          padding: 1rem;
          text-align: center;
          color: #868e96;
        }

        .panel-header {
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid #e9ecef;
          background: #fff;
          border-radius: 8px 8px 0 0;
        }

        .panel-title {
          font-weight: 600;
          font-size: 0.8rem;
          color: #495057;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .panel-content {
          display: flex;
          flex-direction: column;
        }

        .group-section {
          border-bottom: 1px solid #e9ecef;
        }

        .group-section:last-child {
          border-bottom: none;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          font-size: inherit;
        }

        .section-header:hover {
          background: rgba(0, 0, 0, 0.03);
        }

        .section-icon {
          font-size: 0.9rem;
          opacity: 0.7;
          width: 1rem;
          text-align: center;
        }

        .section-title {
          flex: 1;
          font-weight: 500;
          color: #495057;
        }

        .section-count {
          font-size: 0.75rem;
          color: #868e96;
          background: #e9ecef;
          padding: 0.125rem 0.375rem;
          border-radius: 10px;
        }

        .section-chevron {
          color: #868e96;
          transition: transform 0.15s;
        }

        .section-chevron.expanded {
          transform: rotate(180deg);
        }

        .section-content {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
          padding: 0.5rem 0.75rem;
          padding-top: 0;
        }

        .group-pill {
          padding: 0.25rem 0.5rem;
          border: none;
          border-radius: 4px;
          background: var(--group-color, #868e96);
          color: white;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }

        .group-pill:hover {
          opacity: 0.85;
          transform: scale(1.02);
        }

        .group-pill:active {
          transform: scale(0.98);
        }

        .compact .group-pill {
          padding: 0.2rem 0.375rem;
          font-size: 0.7rem;
        }

        .create-group-section {
          padding: 0.5rem 0.75rem;
          border-top: 1px solid #e9ecef;
        }

        .create-group-form {
          display: flex;
          gap: 0.375rem;
          margin-top: 0.375rem;
        }

        .group-name-input {
          flex: 1;
          padding: 0.375rem 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.8rem;
        }

        .create-group-btn {
          padding: 0.375rem 0.625rem;
          background: #228be6;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 0.8rem;
          cursor: pointer;
        }

        .create-group-btn:disabled {
          background: #adb5bd;
          cursor: not-allowed;
        }

        .preset-buttons {
          display: flex;
          gap: 0.25rem;
          margin-top: 0.375rem;
        }

        .preset-btn {
          flex: 1;
          padding: 0.25rem 0.375rem;
          border: none;
          border-radius: 4px;
          font-size: 0.7rem;
          cursor: pointer;
          color: white;
        }

        .preset-btn--positive { background: #40c057; }
        .preset-btn--negative { background: #fa5252; }
        .preset-btn--blank { background: #868e96; }
      `}</style>
    </div>
  )
}

export default AddressGroupPanel

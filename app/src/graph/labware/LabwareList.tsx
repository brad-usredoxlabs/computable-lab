/**
 * LabwareList - Sidebar component showing all labwares in the editor.
 * Allows adding, removing, renaming, and selecting labwares.
 */

import { useState } from 'react'
import { useLabwareEditor } from '../context/LabwareEditorContext'
import type { LabwareType } from '../../types/labware'
import {
  LABWARE_TYPE_LABELS,
  LABWARE_TYPE_ICONS,
  getLabwareWellCount,
} from '../../types/labware'

/**
 * Available labware types grouped by category
 */
const LABWARE_TYPE_OPTIONS: { category: string; types: LabwareType[] }[] = [
  {
    category: 'Plates',
    types: ['plate_96', 'plate_384', 'deepwell_96'],
  },
  {
    category: 'Reservoirs',
    types: ['reservoir_12', 'reservoir_8', 'reservoir_1'],
  },
  {
    category: 'Tubes',
    types: ['tube', 'tubeset_24'],
  },
]

/**
 * Add labware dialog
 */
function AddLabwareDialog({
  onAdd,
  onCancel,
}: {
  onAdd: (labwareType: LabwareType, name: string) => void
  onCancel: () => void
}) {
  const [selectedType, setSelectedType] = useState<LabwareType>('plate_96')
  const [name, setName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onAdd(selectedType, name || LABWARE_TYPE_LABELS[selectedType])
  }

  return (
    <div className="add-labware-dialog">
      <form onSubmit={handleSubmit}>
        <h4>Add Labware</h4>
        
        <div className="form-group">
          <label htmlFor="labware-type">Type:</label>
          <select
            id="labware-type"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as LabwareType)}
            className="select"
          >
            {LABWARE_TYPE_OPTIONS.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.types.map((type) => (
                  <option key={type} value={type}>
                    {LABWARE_TYPE_ICONS[type]} {LABWARE_TYPE_LABELS[type]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="labware-name">Name:</label>
          <input
            id="labware-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={LABWARE_TYPE_LABELS[selectedType]}
            className="input"
          />
        </div>

        <div className="dialog-actions">
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </div>
      </form>

      <style>{`
        .add-labware-dialog {
          padding: 1rem;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .add-labware-dialog h4 {
          margin: 0 0 1rem;
        }
        .add-labware-dialog .form-group {
          margin-bottom: 0.75rem;
        }
        .add-labware-dialog label {
          display: block;
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }
        .add-labware-dialog .select,
        .add-labware-dialog .input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.875rem;
        }
        .dialog-actions {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
          margin-top: 1rem;
        }
      `}</style>
    </div>
  )
}

/**
 * Single labware item in the list
 */
function LabwareItem({
  labwareId,
  isActive,
  onSelect,
  onRemove,
  onRename,
}: {
  labwareId: string
  isActive: boolean
  onSelect: () => void
  onRemove: () => void
  onRename: (newName: string) => void
}) {
  const { state } = useLabwareEditor()
  const labware = state.labwares.get(labwareId)
  const selection = state.selections.get(labwareId)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')

  if (!labware) return null

  const wellCount = getLabwareWellCount(labware)
  const selectedCount = selection?.selectedWells.size || 0
  const icon = LABWARE_TYPE_ICONS[labware.labwareType]

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditName(labware.name)
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    if (editName.trim()) {
      onRename(editName.trim())
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  return (
    <div
      className={`labware-item ${isActive ? 'labware-item--active' : ''}`}
      onClick={onSelect}
      style={{ borderLeftColor: labware.color || '#339af0' }}
    >
      <div className="labware-item__icon">{icon}</div>
      
      <div className="labware-item__info">
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyDown}
            autoFocus
            className="labware-item__name-input"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="labware-item__name" onDoubleClick={handleStartEdit}>
            {labware.name}
          </div>
        )}
        <div className="labware-item__meta">
          {wellCount} wells
          {selectedCount > 0 && (
            <span className="labware-item__selection">
              • {selectedCount} selected
            </span>
          )}
        </div>
      </div>

      <div className="labware-item__actions">
        <button
          className="btn-icon"
          onClick={handleStartEdit}
          title="Rename"
        >
          ✏️
        </button>
        <button
          className="btn-icon btn-icon--danger"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="Remove"
        >
          🗑️
        </button>
      </div>

      <style>{`
        .labware-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          border-left: 3px solid;
          cursor: pointer;
          transition: background-color 0.15s;
        }
        .labware-item:hover {
          background: #f8f9fa;
        }
        .labware-item--active {
          background: #e7f5ff;
        }
        .labware-item__icon {
          font-size: 1.25rem;
        }
        .labware-item__info {
          flex: 1;
          min-width: 0;
        }
        .labware-item__name {
          font-weight: 500;
          font-size: 0.875rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .labware-item__name-input {
          width: 100%;
          padding: 0.25rem;
          font-size: 0.875rem;
          border: 1px solid #339af0;
          border-radius: 4px;
        }
        .labware-item__meta {
          font-size: 0.75rem;
          color: #868e96;
        }
        .labware-item__selection {
          color: #339af0;
          margin-left: 0.25rem;
        }
        .labware-item__actions {
          display: flex;
          gap: 0.25rem;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .labware-item:hover .labware-item__actions {
          opacity: 1;
        }
        .btn-icon {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.25rem;
          font-size: 0.875rem;
          border-radius: 4px;
        }
        .btn-icon:hover {
          background: #e9ecef;
        }
        .btn-icon--danger:hover {
          background: #ffe3e3;
        }
      `}</style>
    </div>
  )
}

/**
 * LabwareList component
 */
export function LabwareList() {
  const { state, addLabware, removeLabware, setActiveLabware, dispatch } = useLabwareEditor()
  const [showAddDialog, setShowAddDialog] = useState(false)

  const labwareIds = Array.from(state.labwares.keys())

  const handleAddLabware = (labwareType: LabwareType, name: string) => {
    addLabware(labwareType, name)
    setShowAddDialog(false)
  }

  const handleRename = (labwareId: string, newName: string) => {
    dispatch({ type: 'UPDATE_LABWARE', labwareId, updates: { name: newName } })
  }

  return (
    <div className="labware-list">
      <div className="labware-list__header">
        <h3>Labware</h3>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAddDialog(true)}
        >
          + Add
        </button>
      </div>

      {showAddDialog && (
        <div className="labware-list__dialog-container">
          <AddLabwareDialog
            onAdd={handleAddLabware}
            onCancel={() => setShowAddDialog(false)}
          />
        </div>
      )}

      <div className="labware-list__items">
        {labwareIds.length === 0 ? (
          <div className="labware-list__empty">
            <p>No labware added yet.</p>
            <p>Click "+ Add" to get started.</p>
          </div>
        ) : (
          labwareIds.map((labwareId) => (
            <LabwareItem
              key={labwareId}
              labwareId={labwareId}
              isActive={state.activeLabwareId === labwareId}
              onSelect={() => setActiveLabware(labwareId)}
              onRemove={() => removeLabware(labwareId)}
              onRename={(newName) => handleRename(labwareId, newName)}
            />
          ))
        )}
      </div>

      <style>{`
        .labware-list {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: white;
          border-radius: 8px;
          overflow: hidden;
        }
        .labware-list__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e9ecef;
        }
        .labware-list__header h3 {
          margin: 0;
          font-size: 1rem;
        }
        .labware-list__dialog-container {
          padding: 0.5rem;
          border-bottom: 1px solid #e9ecef;
        }
        .labware-list__items {
          flex: 1;
          overflow-y: auto;
        }
        .labware-list__empty {
          padding: 2rem 1rem;
          text-align: center;
          color: #868e96;
        }
        .labware-list__empty p {
          margin: 0.5rem 0;
        }
        .btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  )
}

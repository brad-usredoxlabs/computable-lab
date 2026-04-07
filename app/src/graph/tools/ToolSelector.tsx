/**
 * ToolSelector Component
 * 
 * Dropdown selector for tools (pipettes, plate washer, etc.)
 * Shows tool types with icons and channel counts.
 */

import { useState, useMemo } from 'react'
import type { ToolType } from './types'
import { BUILTIN_TOOL_TYPES, getToolType } from '.'
import type { AssistPipetteModel } from '../lib/assistPipetteRegistry'

// =============================================================================
// Types
// =============================================================================

/** Local state for selected tool (includes toolType for UI display) */
export interface SelectedTool {
  toolId: string
  toolTypeId: string
  displayName: string
  toolType: ToolType
  assistPipetteModel?: AssistPipetteModel
}

export interface ToolSelectorProps {
  /** Currently selected tool */
  value?: SelectedTool | null
  /** Callback when tool is selected */
  onChange: (tool: SelectedTool | null) => void
  /** Disabled state */
  disabled?: boolean
  /** Compact mode */
  compact?: boolean
  /** Custom className */
  className?: string
  /** Optional allowlist of tool type IDs */
  allowedToolTypeIds?: string[]
  /** Optional explicit Assist model picker entries */
  assistPipetteModels?: AssistPipetteModel[]
}

// Helper function
function generateToolId(): string {
  return `tool-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

// =============================================================================
// Main Component
// =============================================================================

export function ToolSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
  className = '',
  allowedToolTypeIds,
  assistPipetteModels,
}: ToolSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Categorize tools
  const { pipettes, others, assistModels } = useMemo(() => {
    const visibleTools = Array.isArray(allowedToolTypeIds) && allowedToolTypeIds.length > 0
      ? BUILTIN_TOOL_TYPES.filter((t) => allowedToolTypeIds.includes(t.toolTypeId))
      : BUILTIN_TOOL_TYPES
    const pipettes = visibleTools.filter(t => t.toolTypeId.includes('pipette'))
    const others = visibleTools.filter(t => !t.toolTypeId.includes('pipette'))
    const assistModels = Array.isArray(assistPipetteModels)
      ? assistPipetteModels.filter((model) => {
        if (!Array.isArray(allowedToolTypeIds) || allowedToolTypeIds.length === 0) return true
        return allowedToolTypeIds.includes(model.id)
      })
      : []
    return { pipettes, others, assistModels }
  }, [allowedToolTypeIds, assistPipetteModels])

  // Create tool instance from type
  const handleSelect = (toolType: ToolType) => {
    const instance: SelectedTool = {
      toolId: generateToolId(),
      toolTypeId: toolType.toolTypeId,
      displayName: toolType.displayName,
      toolType,
    }
    onChange(instance)
    setIsOpen(false)
  }

  const handleSelectAssistModel = (model: AssistPipetteModel) => {
    const baseTool = getToolType(model.baseToolTypeId)
    if (!baseTool) return
    const instance: SelectedTool = {
      toolId: generateToolId(),
      toolTypeId: model.id,
      displayName: model.displayName,
      toolType: baseTool,
      assistPipetteModel: model,
    }
    onChange(instance)
    setIsOpen(false)
  }

  const handleClear = () => {
    onChange(null)
    setIsOpen(false)
  }

  return (
    <div className={`tool-selector ${compact ? 'compact' : ''} ${disabled ? 'disabled' : ''} ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        className="tool-selector-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        {value ? (
          <>
            <span className="tool-icon">{value.toolType.icon}</span>
            {!compact && (
              <>
                <span className="tool-label">{value.displayName}</span>
                {value.toolType.channelCount && (
                  <span className="tool-channels">{value.toolType.channelCount}ch</span>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <span className="tool-icon">🔧</span>
            {!compact && <span className="tool-placeholder">Select tool...</span>}
          </>
        )}
        <span className="tool-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="tool-selector-dropdown">
          {/* None option */}
          <button
            type="button"
            className={`tool-option ${!value ? 'selected' : ''}`}
            onClick={handleClear}
          >
            <span className="tool-icon">❌</span>
            <span className="tool-label">No tool selected</span>
          </button>

          {(assistModels.length > 0 || pipettes.length > 0) && (
            <>
              <div className="tool-group-divider" />
              <div className="tool-group-header">Pipettes</div>
            </>
          )}
          {assistModels.map((model) => (
            <button
              key={model.id}
              type="button"
              className={`tool-option ${value?.toolTypeId === model.id ? 'selected' : ''}`}
              onClick={() => handleSelectAssistModel(model)}
            >
              <span className="tool-icon">{model.family === 'voyager' ? '🧬' : '🔬'}</span>
              <span className="tool-label">{model.displayName}</span>
              <span className="tool-channels">{model.channels} channel</span>
            </button>
          ))}
          {pipettes.map(tool => (
            <button
              key={tool.toolTypeId}
              type="button"
              className={`tool-option ${value?.toolTypeId === tool.toolTypeId ? 'selected' : ''}`}
              onClick={() => handleSelect(tool)}
            >
              <span className="tool-icon">{tool.icon}</span>
              <span className="tool-label">{tool.displayName}</span>
              {tool.channelCount && (
                <span className="tool-channels">{tool.channelCount} channel</span>
              )}
            </button>
          ))}

          {others.length > 0 && (
            <>
              <div className="tool-group-divider" />
              <div className="tool-group-header">Other</div>
            </>
          )}
          {others.map(tool => (
            <button
              key={tool.toolTypeId}
              type="button"
              className={`tool-option ${value?.toolTypeId === tool.toolTypeId ? 'selected' : ''}`}
              onClick={() => handleSelect(tool)}
            >
              <span className="tool-icon">{tool.icon}</span>
              <span className="tool-label">{tool.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Styles */}
      <style>{`
        .tool-selector {
          position: relative;
          display: inline-block;
        }
        
        .tool-selector.compact {
          min-width: unset;
        }
        
        .tool-selector.disabled {
          opacity: 0.6;
          pointer-events: none;
        }
        
        .tool-selector-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          text-align: left;
        }
        
        .tool-selector.compact .tool-selector-trigger {
          padding: 4px 8px;
        }
        
        .tool-selector-trigger:hover {
          border-color: #adb5bd;
          background: #f8f9fa;
        }
        
        .tool-selector-trigger:focus {
          outline: none;
          border-color: #228be6;
          box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.2);
        }
        
        .tool-icon {
          font-size: 14px;
        }
        
        .tool-label {
          font-weight: 500;
        }
        
        .tool-channels {
          font-size: 11px;
          padding: 1px 5px;
          background: #e9ecef;
          border-radius: 8px;
          color: #495057;
        }
        
        .tool-placeholder {
          color: #868e96;
        }
        
        .tool-chevron {
          color: #868e96;
          font-size: 9px;
          margin-left: 2px;
        }
        
        .tool-selector-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 4px;
          min-width: 200px;
          background: #fff;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .tool-group-header {
          padding: 4px 10px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          color: #868e96;
          background: #f8f9fa;
        }
        
        .tool-group-divider {
          border-top: 1px solid #e9ecef;
        }
        
        .tool-option {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 13px;
          text-align: left;
        }
        
        .tool-option:hover {
          background: #f1f3f4;
        }
        
        .tool-option.selected {
          background: #e7f5ff;
        }
      `}</style>
    </div>
  )
}

export default ToolSelector

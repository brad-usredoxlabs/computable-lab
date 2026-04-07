/**
 * useToolConstraints Hook
 * 
 * Integrates the Tool Constraint Engine with the Labware Editor.
 * Handles selection expansion and validation based on active tool.
 */

import { useState, useCallback, useMemo } from 'react'
import type { WellId } from '../../types/plate'
import type { Labware } from '../../types/labware'
import type { LabwareOrientation } from '../labware/LabwareCanvas'
import type {
  ConstrainedToolType,
  ContainerGeometry,
  Operation,
  Selection,
  SelectionExpansion,
  ValidationResult,
  ValidationMessage,
} from '../tools'
import { constraintEngine, flatSelection, getAddresses } from '../tools'
import { CONSTRAINED_TOOLS, getConstrainedTool } from '../tools/constrainedTools'

// =============================================================================
// Types
// =============================================================================

export type ToolMode = 'constrained' | 'manual'

export interface ToolState {
  /** Selected constrained tool (null = no tool) */
  selectedTool: ConstrainedToolType | null
  /** Mode: constrained (auto-expand) or manual */
  mode: ToolMode
  /** Number of active channels (1-8 for 8-channel pipette) */
  activeChannels: number
  /** Current operation context */
  currentOperation: Operation | null
  /** Last validation result */
  lastValidation: ValidationResult | null
}

export interface UseToolConstraintsReturn {
  // State
  toolState: ToolState
  
  // Actions
  selectTool: (toolTypeId: string | null) => void
  setMode: (mode: ToolMode) => void
  setActiveChannels: (count: number) => void
  setOperation: (operation: Operation | null) => void
  
  // Constraint operations
  expandClick: (
    click: WellId,
    labware: Labware,
    context: 'source' | 'target',
    _orientation?: LabwareOrientation
  ) => SelectionExpansion | null
  
  validateSelection: (
    wells: WellId[],
    labware: Labware
  ) => ValidationResult
  
  suggestTargets: (
    sourceWells: WellId[],
    sourceLabware: Labware,
    targetLabware: Labware
  ) => WellId[]
  
  // Computed
  availableTools: ConstrainedToolType[]
  hasErrors: boolean
  hasWarnings: boolean
  validationMessages: ValidationMessage[]
}

// =============================================================================
// Geometry Conversion
// =============================================================================

/**
 * Convert Labware to ContainerGeometry for the constraint engine
 */
function labwareToGeometry(labware: Labware): ContainerGeometry {
  const { addressing } = labware
  
  // Use the labware's addressing config directly
  if (addressing.type === 'grid') {
    return {
      type: 'grid',
      templateId: labware.labwareType,
      addressing: 'alphanumeric',
      domain: 'liquid-handling',
      rows: addressing.rows ?? 8,
      columns: addressing.columns ?? 12,
      rowLabels: addressing.rowLabels ?? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: addressing.columnLabels ?? Array.from({ length: 12 }, (_, i) => String(i + 1)),
      viewOrientation: 'landscape',
    }
  }
  
  // Linear (reservoirs) - preserve as linear type for proper strategy matching
  if (addressing.type === 'linear') {
    const channelCount = addressing.linearLabels?.length ?? 1
    return {
      type: 'linear',  // Keep as linear for strategy matching
      templateId: labware.labwareType,
      addressing: 'numeric',
      domain: 'liquid-handling',
      rows: 1,
      columns: channelCount,
      rowLabels: ['A'],
      columnLabels: addressing.linearLabels ?? ['1'],
      linearLabels: addressing.linearLabels ?? ['1'],  // Include linearLabels for LinearAllStrategy
      viewOrientation: 'landscape',
    }
  }
  
  // Single (tube, single reservoir)
  return {
    type: 'grid',
    templateId: labware.labwareType,
    addressing: 'numeric',
    domain: 'liquid-handling',
    rows: 1,
    columns: 1,
    rowLabels: ['A'],
    columnLabels: ['1'],
  }
}

/**
 * Convert Selection addresses to WellIds
 */
function selectionToWells(selection: Selection): WellId[] {
  return getAddresses(selection) as WellId[]
}

// =============================================================================
// Default Operation
// =============================================================================

function createDefaultOperation(verb: string, scope: 'within' | 'between' = 'within'): Operation {
  return {
    verb,
    scope,
    domain: 'liquid-handling',
  }
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useToolConstraints(): UseToolConstraintsReturn {
  // State
  const [selectedTool, setSelectedTool] = useState<ConstrainedToolType | null>(null)
  const [mode, setMode] = useState<ToolMode>('constrained')
  const [activeChannels, setActiveChannels] = useState<number>(8)
  const [currentOperation, setCurrentOperation] = useState<Operation | null>(null)
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null)
  
  // Computed tool state
  const toolState: ToolState = useMemo(() => ({
    selectedTool,
    mode,
    activeChannels,
    currentOperation,
    lastValidation,
  }), [selectedTool, mode, activeChannels, currentOperation, lastValidation])
  
  // Select tool by ID
  const selectTool = useCallback((toolTypeId: string | null) => {
    if (!toolTypeId) {
      setSelectedTool(null)
      return
    }
    
    const tool = getConstrainedTool(toolTypeId)
    setSelectedTool(tool ?? null)
    
    // Reset active channels to tool default
    if (tool?.channelCount) {
      setActiveChannels(tool.channelCount)
    }
  }, [])
  
  // Set mode
  const handleSetMode = useCallback((newMode: ToolMode) => {
    setMode(newMode)
  }, [])
  
  // Set active channels (clamped to tool limits)
  const handleSetActiveChannels = useCallback((count: number) => {
    if (!selectedTool) {
      setActiveChannels(count)
      return
    }
    
    const min = selectedTool.minActiveChannels ?? 1
    const max = selectedTool.maxActiveChannels ?? selectedTool.channelCount ?? 8
    setActiveChannels(Math.max(min, Math.min(max, count)))
  }, [selectedTool])
  
  // Set operation
  const setOperation = useCallback((operation: Operation | null) => {
    setCurrentOperation(operation)
  }, [])
  
  // Expand a click to a full selection
  const expandClick = useCallback((
    click: WellId,
    labware: Labware,
    context: 'source' | 'target',
    _orientation?: LabwareOrientation
  ): SelectionExpansion | null => {
    if (!selectedTool) {
      return null
    }
    
    const geometry = labwareToGeometry(labware)
    const operation = currentOperation ?? createDefaultOperation('transfer', 'between')
    
    const expansion = constraintEngine.expandSelection(
      selectedTool,
      geometry,
      click,
      operation,
      context,
      {
        activeChannels,
        mode,
      }
    )
    
    setLastValidation(expansion.validation)
    return expansion
  }, [selectedTool, currentOperation, activeChannels, mode])
  
  // Validate a manual selection
  const validateSelection = useCallback((
    wells: WellId[],
    labware: Labware
  ): ValidationResult => {
    if (!selectedTool) {
      return { valid: true, errors: [], warnings: [], info: [] }
    }
    
    const geometry = labwareToGeometry(labware)
    const operation = currentOperation ?? createDefaultOperation('transfer', 'between')
    const selection = flatSelection(wells)
    
    const result = constraintEngine.validateSelection(
      selectedTool,
      geometry,
      selection,
      operation
    )
    
    setLastValidation(result)
    return result
  }, [selectedTool, currentOperation])
  
  // Suggest targets based on source selection
  const suggestTargets = useCallback((
    sourceWells: WellId[],
    sourceLabware: Labware,
    targetLabware: Labware
  ): WellId[] => {
    if (!selectedTool) {
      return sourceWells // Default: same wells
    }
    
    const sourceGeometry = labwareToGeometry(sourceLabware)
    const targetGeometry = labwareToGeometry(targetLabware)
    const operation = currentOperation ?? createDefaultOperation('transfer', 'between')
    const sourceSelection = flatSelection(sourceWells)
    
    const suggestedSelection = constraintEngine.suggestTargets(
      selectedTool,
      { selection: sourceSelection, geometry: sourceGeometry },
      targetGeometry,
      operation
    )
    
    return selectionToWells(suggestedSelection)
  }, [selectedTool, currentOperation])
  
  // Computed values
  const hasErrors = lastValidation?.errors.length ? lastValidation.errors.length > 0 : false
  const hasWarnings = lastValidation?.warnings.length ? lastValidation.warnings.length > 0 : false
  
  const validationMessages = useMemo(() => {
    if (!lastValidation) return []
    return [
      ...lastValidation.errors,
      ...lastValidation.warnings,
      ...lastValidation.info,
    ]
  }, [lastValidation])
  
  return {
    toolState,
    selectTool,
    setMode: handleSetMode,
    setActiveChannels: handleSetActiveChannels,
    setOperation,
    expandClick,
    validateSelection,
    suggestTargets,
    availableTools: CONSTRAINED_TOOLS,
    hasErrors,
    hasWarnings,
    validationMessages,
  }
}

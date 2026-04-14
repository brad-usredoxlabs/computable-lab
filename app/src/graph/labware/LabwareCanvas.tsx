/**
 * LabwareCanvas - Renders the appropriate visualization for any labware type.
 * Dispatches to PlateCanvas, ReservoirCanvas, or TubeCanvas based on labware type.
 * 
 * Supports tool-constrained selection expansion (e.g., 8-channel pipette auto-selects column).
 */

import { useCallback, type ReactNode } from 'react'
import type { WellId } from '../../types/plate'
import type { Labware } from '../../types/labware'
import { LABWARE_CATEGORIES } from '../../types/labware'
import { getLabwareDefaultOrientation } from '../../types/labware'
import { useLabwareEditor } from '../context/LabwareEditorContext'
import type { SelectionExpansion, ValidationMessage } from '../tools'
import { getAddresses } from '../tools'
import { createGridViewTransform, resolveOrientationForLabware } from '../lib/labwareView'

/**
 * Orientation for linear labware rendering
 */
export type LabwareOrientation = 'auto' | 'portrait' | 'landscape'

/**
 * Tool expander function type - expands a click to multiple wells
 */
export type ToolExpander = (
  click: WellId,
  labware: Labware,
  context: 'source' | 'target',
  orientation?: LabwareOrientation
) => SelectionExpansion | null

interface LabwareCanvasProps {
  labware: Labware
  selectedWells: Set<WellId>
  highlightedWells: Set<WellId>
  wellContents?: Map<WellId, { color?: string }>
  /** AI preview wells — rendered as purple dashed overlay */
  previewWellContents?: Map<WellId, { color?: string }>
  onSelectWells: (wells: WellId[], mode: 'replace' | 'add' | 'toggle') => void
  /** Called when mouse enters/leaves a well. Returns position for tooltip */
  onWellHover?: (wellId: WellId | null, position?: { x: number; y: number }) => void
  width?: number
  height?: number
  /** Orientation hint for linear labware. Default 'auto' uses portrait for <=12 wells */
  orientation?: LabwareOrientation
  /** Last clicked well for rectangular selection (shift-click) */
  lastClickedWell?: WellId | null
  /** Tool expansion function (from useToolConstraints) */
  toolExpander?: ToolExpander
  /** Context for tool expansion: 'source' or 'target' pane */
  paneContext?: 'source' | 'target'
  /** Callback for validation messages from tool expansion */
  onValidation?: (messages: ValidationMessage[]) => void
  /** Optional preview event badges overlay rendered inside the SVG */
  previewEventBadges?: ReactNode
}

/**
 * Generic well click handler props
 */
interface WellClickEvent {
  wellId: WellId
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

/**
 * Grid-based labware renderer (plates, tubesets)
 */
function GridLabwareCanvas({
  labware,
  selectedWells,
  highlightedWells,
  wellContents,
  previewWellContents,
  previewEventBadges,
  onSelectWells,
  onWellHover,
  width = 500,
  height = 380,
  orientation = 'landscape',
  lastClickedWell,
  toolExpander,
  paneContext = 'source',
  onValidation,
}: LabwareCanvasProps & { lastClickedWell?: WellId | null }) {
  const { color } = labware
  const resolvedOrientation = resolveOrientationForLabware(labware, orientation === 'auto' ? 'landscape' : orientation)
  const view = createGridViewTransform(labware, resolvedOrientation)
  const rows = view.displayRows
  const cols = view.displayCols
  const rowLabels = view.displayRowLabels
  const colLabels = view.displayColLabels

  const displayToWellId = useCallback((displayRow: number, displayCol: number): WellId => {
    return (view.displayToCanonical(displayRow, displayCol) || 'A1') as WellId
  }, [view])

  const parseWellToDisplay = useCallback((wellId: WellId): { row: number; col: number } | null => {
    return view.canonicalToDisplay(wellId)
  }, [view])

  const getWellsInDisplayRectangle = useCallback(
    (anchor: { row: number; col: number }, current: { row: number; col: number }): WellId[] => {
      const minRow = Math.min(anchor.row, current.row)
      const maxRow = Math.max(anchor.row, current.row)
      const minCol = Math.min(anchor.col, current.col)
      const maxCol = Math.max(anchor.col, current.col)
      const wells: WellId[] = []
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          wells.push(displayToWellId(r, c))
        }
      }
      return wells
    },
    [displayToWellId]
  )

  // Calculate dimensions
  const padding = 40
  const wellPadding = 2
  const availableWidth = width - padding * 2
  const availableHeight = height - padding * 2
  const wellWidth = availableWidth / cols
  const wellHeight = availableHeight / rows
  const wellRadius = Math.min(wellWidth, wellHeight) / 2 - wellPadding

  const handleWellClick = useCallback(
    (event: WellClickEvent) => {
      const { wellId, shiftKey, ctrlKey, metaKey } = event
      
      // With tool expander active (e.g., 8-channel pipette)
      if (toolExpander) {
        const expansion = toolExpander(wellId, labware, paneContext, orientation)
        if (expansion) {
          const expandedWells = getAddresses(expansion.selection) as WellId[]
          
          // Report validation messages
          if (onValidation && expansion.validation) {
            const messages = [
              ...expansion.validation.errors,
              ...expansion.validation.warnings,
              ...expansion.validation.info,
            ]
            onValidation(messages)
          }

          if (expandedWells.length === 0) {
            return
          }
          
          // Ctrl/Cmd + click: ADD expanded selection (for non-contiguous)
          if (ctrlKey || metaKey) {
            onSelectWells(expandedWells, 'add')
            return
          }
          
          // Shift + click: Select all columns from anchor to current
          if (shiftKey && lastClickedWell) {
            const anchor = parseWellToDisplay(lastClickedWell)
            const current = parseWellToDisplay(wellId)
            
            if (anchor && current) {
              // Get all columns between anchor and current (inclusive)
              const minCol = Math.min(anchor.col, current.col)
              const maxCol = Math.max(anchor.col, current.col)
              
              // Select all wells in those columns
              const columnRangeWells: WellId[] = []
              for (let c = minCol; c <= maxCol; c++) {
                for (let r = 0; r < rows; r++) {
                  columnRangeWells.push(displayToWellId(r, c))
                }
              }
              onSelectWells(columnRangeWells, 'replace')
              return
            }
          }
          
          // Default click: Replace with expanded selection
          onSelectWells(expandedWells, 'replace')
          return
        }
      }
      
      // Without tool expander - standard behavior
      // Ctrl/Cmd always toggles single well
      if (ctrlKey || metaKey) {
        onSelectWells([wellId], 'toggle')
        return
      }
      
      // Shift+click for rectangular selection
      if (shiftKey && lastClickedWell) {
        const anchor = parseWellToDisplay(lastClickedWell)
        const current = parseWellToDisplay(wellId)
        
        if (anchor && current) {
          const rectangleWells = getWellsInDisplayRectangle(anchor, current)
          onSelectWells(rectangleWells, 'replace')
        } else {
          onSelectWells([wellId], 'add')
        }
        return
      }
      
      // Default: single well selection
      if (shiftKey) {
        onSelectWells([wellId], 'add')
      } else {
        onSelectWells([wellId], 'replace')
      }
    },
    [onSelectWells, lastClickedWell, parseWellToDisplay, getWellsInDisplayRectangle, toolExpander, labware, paneContext, onValidation, rows, displayToWellId]
  )

  return (
    <svg width={width} height={height} className="labware-canvas labware-canvas--grid">
      {/* Background */}
      <rect width={width} height={height} fill="#f8f9fa" rx="8" />

      {/* Column labels */}
      {colLabels.map((label, col) => (
        <text
          key={`col-${col}`}
          x={padding + col * wellWidth + wellWidth / 2}
          y={padding / 2 + 4}
          textAnchor="middle"
          fontSize="11"
          fill="#495057"
        >
          {label}
        </text>
      ))}

      {/* Row labels */}
      {rowLabels.map((label, row) => (
        <text
          key={`row-${row}`}
          x={padding / 2}
          y={padding + row * wellHeight + wellHeight / 2 + 4}
          textAnchor="middle"
          fontSize="11"
          fill="#495057"
        >
          {label}
        </text>
      ))}

      {/* Wells */}
      {rowLabels.map((_, row) =>
        colLabels.map((__, col) => {
          const wellId = displayToWellId(row, col)
          const isSelected = selectedWells.has(wellId)
          const isHighlighted = highlightedWells.has(wellId)
          const content = wellContents?.get(wellId)
          const hasContent = !!content

          const cx = padding + col * wellWidth + wellWidth / 2
          const cy = padding + row * wellHeight + wellHeight / 2

          let fillColor = '#fff'
          if (content?.color) {
            fillColor = content.color
          } else if (hasContent) {
            fillColor = color || '#339af0'
          }

          let strokeColor = '#dee2e6'
          let strokeWidth = 1
          if (isSelected) {
            strokeColor = '#339af0'
            strokeWidth = 2
          } else if (isHighlighted) {
            strokeColor = '#fcc419'
            strokeWidth = 2
          }

          return (
            <g key={wellId}>
              <circle
                data-well-id={wellId}
                data-selected={isSelected ? 'true' : 'false'}
                data-highlighted={isHighlighted ? 'true' : 'false'}
                cx={cx}
                cy={cy}
                r={wellRadius}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                style={{ cursor: 'pointer' }}
                onClick={(e) =>
                  handleWellClick({
                    wellId,
                    shiftKey: e.shiftKey,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                  })
                }
                onMouseEnter={(e) => {
                  if (onWellHover) {
                    const rect = (e.target as SVGCircleElement).getBoundingClientRect()
                    onWellHover(wellId, { x: rect.right + 10, y: rect.top })
                  }
                }}
                onMouseLeave={() => onWellHover?.(null)}
              />
              {isSelected && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={wellRadius - 3}
                  fill="none"
                  stroke="#339af0"
                  strokeWidth={1}
                  strokeDasharray="3,2"
                  pointerEvents="none"
                />
              )}
            </g>
          )
        })
      )}

      {/* Preview overlay (AI-proposed events) */}
      {previewWellContents && previewWellContents.size > 0 &&
        rowLabels.map((_, row) =>
          colLabels.map((__, col) => {
            const wellId = displayToWellId(row, col)
            const preview = previewWellContents.get(wellId)
            if (!preview) return null

            const cx = padding + col * wellWidth + wellWidth / 2
            const cy = padding + row * wellHeight + wellHeight / 2
            const previewColor = preview.color || '#be4bdb'

            return (
              <g key={`preview-${wellId}`} pointerEvents="none">
                <circle
                  cx={cx}
                  cy={cy}
                  r={wellRadius}
                  fill={previewColor}
                  fillOpacity={0.2}
                  stroke={previewColor}
                  strokeWidth={2}
                  strokeDasharray="4,3"
                />
                <text
                  x={cx}
                  y={cy + 3}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="bold"
                  fill={previewColor}
                >
                  AI
                </text>
              </g>
            )
          })
        )}

      {/* Preview event badges overlay */}
      {previewEventBadges}
    </svg>
  )
}

/**
 * Linear labware renderer (reservoirs) - Landscape orientation
 */
function LinearLabwareCanvasLandscape({
  labware,
  selectedWells,
  highlightedWells,
  wellContents,
  onSelectWells,
  onWellHover,
  width = 500,
  height = 120,
  orientation = 'landscape',
  toolExpander,
  paneContext = 'source',
  onValidation,
}: LabwareCanvasProps) {
  const { addressing } = labware
  const labels = addressing.linearLabels || []
  const count = labels.length
  const useTroughStyle = labware.linearWellStyle === 'trough'

  // Calculate dimensions
  const padding = useTroughStyle ? 24 : 30
  const availableWidth = width - padding * 2
  const cellWidth = availableWidth / Math.max(1, count)
  const slotGap = useTroughStyle ? Math.min(6, cellWidth * 0.18) : 0
  const slotWidth = Math.max(6, cellWidth - slotGap)
  const slotHeight = height - padding * 2

  const handleSlotClick = useCallback(
    (wellId: WellId, e: React.MouseEvent) => {
      // Ctrl/Cmd always toggles single well
      if (e.ctrlKey || e.metaKey) {
        onSelectWells([wellId], 'toggle')
        return
      }
      
      // Tool expansion: if a tool is active, expand the click
      if (toolExpander) {
        const logicalOrientation = orientation === 'auto' ? 'landscape' : orientation
        const expansion = toolExpander(wellId, labware, paneContext, logicalOrientation)
        if (expansion) {
          // Get expanded wells from selection
          const expandedWells = getAddresses(expansion.selection) as WellId[]
          
          // Report validation messages
          if (onValidation && expansion.validation) {
            const messages = [
              ...expansion.validation.errors,
              ...expansion.validation.warnings,
              ...expansion.validation.info,
            ]
            onValidation(messages)
          }
          if (expandedWells.length === 0) {
            return
          }
          onSelectWells(expandedWells, e.shiftKey ? 'add' : 'replace')
          return
        }
      }
      
      // Default: single well selection
      if (e.shiftKey) {
        onSelectWells([wellId], 'add')
      } else {
        onSelectWells([wellId], 'replace')
      }
    },
    [onSelectWells, toolExpander, labware, paneContext, onValidation, orientation]
  )

  return (
    <svg width={width} height={height} className="labware-canvas labware-canvas--linear labware-canvas--landscape">
      {/* Background */}
      <rect width={width} height={height} fill="#f8f9fa" rx="8" />

      {/* Slots */}
      {labels.map((label, idx) => {
        const isSelected = selectedWells.has(label)
        const isHighlighted = highlightedWells.has(label)
        const content = wellContents?.get(label)

        const x = padding + idx * cellWidth + (cellWidth - slotWidth) / 2
        const slotPadding = 3

        let fillColor = '#fff'
        if (content?.color) {
          fillColor = content.color
        }

        let strokeColor = '#dee2e6'
        let strokeWidth = 1
        if (isSelected) {
          strokeColor = '#339af0'
          strokeWidth = 2
        } else if (isHighlighted) {
          strokeColor = '#fcc419'
          strokeWidth = 2
        }

        return (
          <g key={label}>
            {useTroughStyle ? (
              <rect
                data-well-id={label}
                data-selected={isSelected ? 'true' : 'false'}
                data-highlighted={isHighlighted ? 'true' : 'false'}
                x={x + slotPadding}
                y={padding}
                width={Math.max(4, slotWidth - slotPadding * 2)}
                height={slotHeight}
                rx={Math.min(8, Math.max(3, (slotWidth - slotPadding * 2) * 0.35))}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleSlotClick(label, e)}
                onMouseEnter={(e) => {
                  if (onWellHover) {
                    const rect = (e.target as SVGRectElement).getBoundingClientRect()
                    onWellHover(label, { x: rect.right + 10, y: rect.top })
                  }
                }}
                onMouseLeave={() => onWellHover?.(null)}
              />
            ) : (
              /* Generic linear slot (v-bottom approximation) */
              <path
                data-well-id={label}
                data-selected={isSelected ? 'true' : 'false'}
                data-highlighted={isHighlighted ? 'true' : 'false'}
                d={`
                  M ${x + slotPadding} ${padding}
                  L ${x + slotWidth - slotPadding} ${padding}
                  L ${x + slotWidth - slotPadding} ${padding + slotHeight * 0.7}
                  L ${x + slotWidth / 2} ${padding + slotHeight}
                  L ${x + slotPadding} ${padding + slotHeight * 0.7}
                  Z
                `}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleSlotClick(label, e)}
                onMouseEnter={(e) => {
                  if (onWellHover) {
                    const rect = (e.target as SVGPathElement).getBoundingClientRect()
                    onWellHover(label, { x: rect.right + 10, y: rect.top })
                  }
                }}
                onMouseLeave={() => onWellHover?.(null)}
              />
            )}
            {/* Label */}
            <text
              x={x + slotWidth / 2}
              y={padding / 2 + 4}
              textAnchor="middle"
              fontSize="11"
              fill="#495057"
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Linear labware renderer (reservoirs) - Portrait orientation
 * Wells are arranged vertically for better side-by-side viewing
 */
function LinearLabwareCanvasPortrait({
  labware,
  selectedWells,
  highlightedWells,
  wellContents,
  onSelectWells,
  onWellHover,
  width = 100,
  height = 400,
  orientation = 'portrait',
  toolExpander,
  paneContext = 'source',
  onValidation,
}: LabwareCanvasProps) {
  const { addressing } = labware
  const labels = addressing.linearLabels || []
  const count = labels.length

  // Calculate dimensions
  const padding = 30
  const labelWidth = 30
  const availableHeight = height - padding * 2
  const slotHeight = availableHeight / count
  const slotWidth = width - padding - labelWidth

  const handleSlotClick = useCallback(
    (wellId: WellId, e: React.MouseEvent) => {
      // Ctrl/Cmd always toggles single well
      if (e.ctrlKey || e.metaKey) {
        onSelectWells([wellId], 'toggle')
        return
      }
      
      // Tool expansion: if a tool is active, expand the click
      if (toolExpander) {
        const logicalOrientation = orientation === 'auto' ? 'portrait' : orientation
        const expansion = toolExpander(wellId, labware, paneContext, logicalOrientation)
        if (expansion) {
          // Get expanded wells from selection
          const expandedWells = getAddresses(expansion.selection) as WellId[]
          
          // Report validation messages
          if (onValidation && expansion.validation) {
            const messages = [
              ...expansion.validation.errors,
              ...expansion.validation.warnings,
              ...expansion.validation.info,
            ]
            onValidation(messages)
          }
          if (expandedWells.length === 0) {
            return
          }
          onSelectWells(expandedWells, e.shiftKey ? 'add' : 'replace')
          return
        }
      }
      
      // Default: single well selection
      if (e.shiftKey) {
        onSelectWells([wellId], 'add')
      } else {
        onSelectWells([wellId], 'replace')
      }
    },
    [onSelectWells, toolExpander, labware, paneContext, onValidation, orientation]
  )

  return (
    <svg width={width} height={height} className="labware-canvas labware-canvas--linear labware-canvas--portrait">
      {/* Background */}
      <rect width={width} height={height} fill="#f8f9fa" rx="8" />

      {/* Slots */}
      {labels.map((label, idx) => {
        const isSelected = selectedWells.has(label)
        const isHighlighted = highlightedWells.has(label)
        const content = wellContents?.get(label)

        const y = padding + idx * slotHeight
        const slotPadding = 3

        let fillColor = '#fff'
        if (content?.color) {
          fillColor = content.color
        }

        let strokeColor = '#dee2e6'
        let strokeWidth = 1
        if (isSelected) {
          strokeColor = '#339af0'
          strokeWidth = 2
        } else if (isHighlighted) {
          strokeColor = '#fcc419'
          strokeWidth = 2
        }

        const slotX = labelWidth
        const slotTop = y + slotPadding
        const slotBottom = y + slotHeight - slotPadding
        const slotRight = labelWidth + slotWidth

        return (
          <g key={label}>
            {/* Label on left */}
            <text
              x={labelWidth / 2}
              y={y + slotHeight / 2 + 4}
              textAnchor="middle"
              fontSize="11"
              fill="#495057"
            >
              {label}
            </text>
            {/* Slot rectangle (v-bottom shape pointing right) */}
            <path
              data-well-id={label}
              data-selected={isSelected ? 'true' : 'false'}
              data-highlighted={isHighlighted ? 'true' : 'false'}
              d={`
                M ${slotX} ${slotTop}
                L ${slotX + slotWidth * 0.7} ${slotTop}
                L ${slotRight} ${y + slotHeight / 2}
                L ${slotX + slotWidth * 0.7} ${slotBottom}
                L ${slotX} ${slotBottom}
                Z
              `}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              style={{ cursor: 'pointer' }}
              onClick={(e) => handleSlotClick(label, e)}
              onMouseEnter={(e) => {
                if (onWellHover) {
                  const rect = (e.target as SVGPathElement).getBoundingClientRect()
                  onWellHover(label, { x: rect.right + 10, y: rect.top })
                }
              }}
              onMouseLeave={() => onWellHover?.(null)}
            />
            {/* Selection indicator */}
            {isSelected && (
              <circle
                cx={slotX + slotWidth * 0.4}
                cy={y + slotHeight / 2}
                r={4}
                fill="#339af0"
                pointerEvents="none"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Single container renderer (single tube, single reservoir)
 */
function SingleLabwareCanvas({
  labware,
  selectedWells,
  highlightedWells,
  wellContents,
  onSelectWells,
  width = 150,
  height = 200,
}: LabwareCanvasProps) {
  const wellId = '1'

  const isSelected = selectedWells.has(wellId)
  const isHighlighted = highlightedWells.has(wellId)
  const content = wellContents?.get(wellId)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        onSelectWells([wellId], 'toggle')
      } else {
        onSelectWells([wellId], isSelected ? 'toggle' : 'replace')
      }
    },
    [onSelectWells, isSelected]
  )

  let fillColor = '#fff'
  if (content?.color) {
    fillColor = content.color
  }

  let strokeColor = '#dee2e6'
  let strokeWidth = 2
  if (isSelected) {
    strokeColor = '#339af0'
    strokeWidth = 3
  } else if (isHighlighted) {
    strokeColor = '#fcc419'
    strokeWidth = 3
  }

  const centerX = width / 2
  const tubeWidth = width * 0.6

  return (
    <svg width={width} height={height} className="labware-canvas labware-canvas--single">
      {/* Background */}
      <rect width={width} height={height} fill="#f8f9fa" rx="8" />

      {/* Tube shape */}
      <path
        data-well-id={wellId}
        data-selected={isSelected ? 'true' : 'false'}
        data-highlighted={isHighlighted ? 'true' : 'false'}
        d={`
          M ${centerX - tubeWidth / 2} ${height * 0.1}
          L ${centerX + tubeWidth / 2} ${height * 0.1}
          L ${centerX + tubeWidth / 2} ${height * 0.6}
          Q ${centerX + tubeWidth / 2} ${height * 0.9} ${centerX} ${height * 0.9}
          Q ${centerX - tubeWidth / 2} ${height * 0.9} ${centerX - tubeWidth / 2} ${height * 0.6}
          Z
        `}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
      />

      {/* Label */}
      <text
        x={centerX}
        y={height * 0.5}
        textAnchor="middle"
        fontSize="14"
        fill={isSelected ? '#339af0' : '#495057'}
        fontWeight={isSelected ? 'bold' : 'normal'}
      >
        {labware.name}
      </text>
    </svg>
  )
}

/**
 * Determine effective orientation for linear labware
 */
function getEffectiveOrientation(
  labware: Labware,
  orientation: LabwareOrientation,
  _wellCount: number
): 'portrait' | 'landscape' {
  if (orientation === 'portrait') return 'portrait'
  if (orientation === 'landscape') return 'landscape'
  return getLabwareDefaultOrientation(labware)
}

function getLinearRendererMode(
  labware: Labware,
  orientation: 'portrait' | 'landscape'
): 'portrait' | 'landscape' {
  const linearAxis = labware.linearAxis || 'x'
  if (linearAxis === 'x') {
    return orientation === 'landscape' ? 'landscape' : 'portrait'
  }
  return orientation === 'landscape' ? 'portrait' : 'landscape'
}

/**
 * Main LabwareCanvas component
 */
export function LabwareCanvas(props: LabwareCanvasProps) {
  const { labware, orientation = 'auto' } = props
  // Category reserved for future use (different rendering styles per category)
  void LABWARE_CATEGORIES[labware.labwareType]

  // Determine canvas type based on addressing scheme
  if (labware.addressing.type === 'single') {
    return <SingleLabwareCanvas {...props} />
  }

  if (labware.addressing.type === 'linear') {
    const wellCount = labware.addressing.linearLabels?.length || 0
    const effectiveOrientation = getEffectiveOrientation(labware, orientation, wellCount)

    const rendererMode = getLinearRendererMode(labware, effectiveOrientation)
    if (rendererMode === 'portrait') {
      return <LinearLabwareCanvasPortrait {...props} />
    }
    return <LinearLabwareCanvasLandscape {...props} />
  }

  // Default to grid
  return <GridLabwareCanvas {...props} />
}

/**
 * Wrapper that uses LabwareEditorContext
 */
export function LabwareCanvasWithContext({
  labwareId,
  wellContents,
  width,
  height,
}: {
  labwareId: string
  wellContents?: Map<WellId, { color?: string }>
  width?: number
  height?: number
}) {
  const { state, selectWells } = useLabwareEditor()

  const labware = state.labwares.get(labwareId)
  const selection = state.selections.get(labwareId)

  if (!labware) {
    return <div className="labware-canvas-empty">No labware selected</div>
  }

  const handleSelectWells = useCallback(
    (wells: WellId[], mode: 'replace' | 'add' | 'toggle') => {
      selectWells(labwareId, wells, mode)
    },
    [labwareId, selectWells]
  )

  return (
    <LabwareCanvas
      labware={labware}
      selectedWells={selection?.selectedWells || new Set()}
      highlightedWells={selection?.highlightedWells || new Set()}
      wellContents={wellContents}
      onSelectWells={handleSelectWells}
      width={width}
      height={height}
    />
  )
}

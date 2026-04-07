/**
 * PlateCanvas component - Renders an interactive 96 or 384 well plate.
 * Includes row/column labels and handles well selection.
 */

import { useMemo } from 'react'
import type { PlateFormat, PlateConfig, WellId } from '../../types/plate'
import { PLATE_CONFIGS } from '../../types/plate'
import { SelectionProvider, useSelection } from '../context/SelectionContext'
import { createWellId } from '../utils/wellUtils'
import { Well } from './Well'

/**
 * Layout constants for plate rendering
 */
const LAYOUT = {
  // Padding around the plate
  padding: 40,
  // Space for row/column labels
  labelOffset: 30,
  // Well sizing (relative to cell size)
  wellRadiusRatio: 0.4, // Well radius as fraction of cell size
  // Font sizes
  labelFontSize: 12,
  // Minimum well radius
  minWellRadius: 8,
}

interface PlateCanvasProps {
  format?: PlateFormat
  wellContents?: Map<WellId, { color?: string }>
  width?: number
  height?: number
  onSelectionChange?: (selectedWells: WellId[]) => void
}

/**
 * Inner component that uses the selection context
 */
function PlateCanvasInner({
  config,
  wellContents,
  width,
  height,
}: {
  config: PlateConfig
  wellContents?: Map<WellId, { color?: string }>
  width: number
  height: number
}) {
  const { clearSelection } = useSelection()

  // Calculate cell size based on available space
  const cellSize = useMemo(() => {
    const availableWidth = width - LAYOUT.padding * 2 - LAYOUT.labelOffset
    const availableHeight = height - LAYOUT.padding * 2 - LAYOUT.labelOffset
    const cellWidth = availableWidth / config.columns
    const cellHeight = availableHeight / config.rows
    return Math.min(cellWidth, cellHeight)
  }, [width, height, config.rows, config.columns])

  const wellRadius = Math.max(cellSize * LAYOUT.wellRadiusRatio, LAYOUT.minWellRadius)

  // Calculate SVG dimensions
  const svgWidth = LAYOUT.padding * 2 + LAYOUT.labelOffset + config.columns * cellSize
  const svgHeight = LAYOUT.padding * 2 + LAYOUT.labelOffset + config.rows * cellSize

  // Starting position for wells (after labels)
  const startX = LAYOUT.padding + LAYOUT.labelOffset
  const startY = LAYOUT.padding + LAYOUT.labelOffset

  // Handle click on empty space to clear selection
  const handleBackgroundClick = () => {
    clearSelection()
  }

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="plate-canvas"
      onClick={handleBackgroundClick}
    >
      {/* Background */}
      <rect
        x={startX - 5}
        y={startY - 5}
        width={config.columns * cellSize + 10}
        height={config.rows * cellSize + 10}
        fill="#ffffff"
        stroke="#ced4da"
        strokeWidth={1}
        rx={4}
      />

      {/* Column labels (1, 2, 3, ... or 1-24) */}
      {config.columnLabels.map((label, colIndex) => (
        <text
          key={`col-${label}`}
          x={startX + colIndex * cellSize + cellSize / 2}
          y={LAYOUT.padding + LAYOUT.labelOffset / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={LAYOUT.labelFontSize}
          fill="#495057"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      ))}

      {/* Row labels (A, B, C, ... or A-P) */}
      {config.rowLabels.map((label, rowIndex) => (
        <text
          key={`row-${label}`}
          x={LAYOUT.padding + LAYOUT.labelOffset / 2}
          y={startY + rowIndex * cellSize + cellSize / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={LAYOUT.labelFontSize}
          fill="#495057"
          fontWeight="500"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      ))}

      {/* Wells */}
      {Array.from({ length: config.rows }, (_, rowIndex) =>
        Array.from({ length: config.columns }, (_, colIndex) => {
          const wellId = createWellId(rowIndex, colIndex)
          const x = startX + colIndex * cellSize + cellSize / 2
          const y = startY + rowIndex * cellSize + cellSize / 2
          const content = wellContents?.get(wellId)

          return (
            <Well
              key={wellId}
              wellId={wellId}
              x={x}
              y={y}
              radius={wellRadius}
              hasContent={content !== undefined}
              contentColor={content?.color}
            />
          )
        })
      )}
    </svg>
  )
}

/**
 * PlateCanvas - Main plate visualization component
 * Wraps the inner component with SelectionProvider
 */
export function PlateCanvas({
  format = '96',
  wellContents,
  width = 600,
  height = 450,
}: PlateCanvasProps) {
  const config = PLATE_CONFIGS[format]

  return (
    <SelectionProvider plateConfig={config}>
      <div className="plate-canvas-container">
        <PlateCanvasInner
          config={config}
          wellContents={wellContents}
          width={width}
          height={height}
        />
      </div>
    </SelectionProvider>
  )
}

/**
 * PlateCanvasWithContext - For use when SelectionProvider is already available
 */
export function PlateCanvasWithContext({
  format = '96',
  wellContents,
  width = 600,
  height = 450,
}: Omit<PlateCanvasProps, 'onSelectionChange'>) {
  const config = PLATE_CONFIGS[format]

  return (
    <div className="plate-canvas-container">
      <PlateCanvasInner
        config={config}
        wellContents={wellContents}
        width={width}
        height={height}
      />
    </div>
  )
}

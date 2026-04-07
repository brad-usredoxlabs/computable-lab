import { useMemo, useRef, useState } from 'react'
import type { CaymanReviewModel, CaymanReviewPlate, CaymanReviewPlateAssignment, IngestionMaterialStatus } from '../lib/ingestionReview'
import { IngestionCompoundHoverCard } from './IngestionCompoundHoverCard'

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COLS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

function toneForStatus(status: IngestionMaterialStatus | 'unused' | 'empty'): string {
  if (status === 'existing_local') return '#2b8a3e'
  if (status === 'new_clean') return '#1864ab'
  if (status === 'new_with_issues') return '#d9480f'
  if (status === 'unused') return '#ced4da'
  return '#e9ecef'
}

function toneLabel(status: IngestionMaterialStatus | 'unused' | 'empty'): string {
  if (status === 'existing_local') return 'Saved locally'
  if (status === 'new_clean') return 'Ready to create'
  if (status === 'new_with_issues') return 'Needs review'
  if (status === 'unused') return 'Unused well'
  return 'No assignment'
}

interface PlateCell {
  well: string
  assignment?: CaymanReviewPlateAssignment
  status: IngestionMaterialStatus | 'unused' | 'empty'
}

function buildCells(plate: CaymanReviewPlate): PlateCell[] {
  const assignmentsByWell = new Map(plate.assignments.map((assignment) => [assignment.well, assignment]))
  const unusedWells = new Set(plate.unusedWells)

  const cells: PlateCell[] = []
  for (const row of ROWS) {
    for (const col of COLS) {
      const well = `${row}${col}`
      const assignment = assignmentsByWell.get(well)
      cells.push({
        well,
        assignment,
        status: assignment?.compound?.status ?? (unusedWells.has(well) ? 'unused' : 'empty'),
      })
    }
  }
  return cells
}

export function IngestionPlateBrowser({ model }: { model: CaymanReviewModel }) {
  const [selectedPlateNumber, setSelectedPlateNumber] = useState<number>(model.plates[0]?.plateNumber ?? 1)
  const [hoveredWell, setHoveredWell] = useState<{ cell: PlateCell; x: number; y: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const selectedPlate = useMemo(
    () => model.plates.find((plate) => plate.plateNumber === selectedPlateNumber) ?? model.plates[0] ?? null,
    [model.plates, selectedPlateNumber],
  )
  const cells = useMemo(() => (selectedPlate ? buildCells(selectedPlate) : []), [selectedPlate])

  if (!selectedPlate) return null

  return (
    <section className="ingestion-section">
      <div className="ingestion-section__head">
        <div>
          <p className="ingestion-section__eyebrow">Plate Browser</p>
          <h3>{model.stats.totalPlates} review plates</h3>
        </div>
        <div className="ingestion-plate-browser__toolbar">
          <label>
            Plate
            <select value={selectedPlateNumber} onChange={(event) => setSelectedPlateNumber(Number(event.target.value))}>
              {model.plates.map((plate) => (
                <option key={plate.plateNumber} value={plate.plateNumber}>
                  Plate {plate.plateNumber}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="ingestion-card-grid">
        <article className="ingestion-card">
          <div className="ingestion-card__head">
            <div>
              <h4>{selectedPlate.title}</h4>
              <p>96-well screening layout</p>
            </div>
          </div>
          <div className="ingestion-card__meta">
            <span>{selectedPlate.assignmentCount} assigned wells</span>
            <span>{selectedPlate.unusedWellCount} unused wells</span>
          </div>
          <div className="ingestion-plate-browser__legend">
            <span><i style={{ background: toneForStatus('existing_local') }} />Saved locally</span>
            <span><i style={{ background: toneForStatus('new_clean') }} />Ready to create</span>
            <span><i style={{ background: toneForStatus('new_with_issues') }} />Needs review</span>
            <span><i style={{ background: toneForStatus('unused') }} />Unused</span>
          </div>
        </article>
      </div>

      <div className="ingestion-plate-browser">
        <div ref={canvasRef} className="ingestion-plate-browser__canvas">
          <PlateSvg
            plate={selectedPlate}
            cells={cells}
            hoveredWell={hoveredWell?.cell.well ?? null}
            onHoverWell={(cell, position) => {
              if (!cell || !position || !canvasRef.current) {
                setHoveredWell(null)
                return
              }
              const bounds = canvasRef.current.getBoundingClientRect()
              const tooltipWidth = 340
              const tooltipHeight = 320
              const x = Math.min(Math.max(position.x - bounds.left + 18, 12), Math.max(12, bounds.width - tooltipWidth - 12))
              const y = Math.min(Math.max(position.y - bounds.top + 18, 12), Math.max(12, bounds.height - tooltipHeight - 12))
              setHoveredWell({ cell, x, y })
            }}
          />
          {!hoveredWell && (
            <div className="ingestion-plate-browser__empty">
              Hover a well to inspect the compound, local match, and review issues.
            </div>
          )}
          {hoveredWell && (
            <div
              className="ingestion-plate-browser__tooltip"
              style={{ left: hoveredWell.x, top: hoveredWell.y }}
            >
              {hoveredWell.cell.assignment?.compound ? (
                <>
                  <div className="ingestion-plate-browser__well-head">
                    <div>
                      <p className="ingestion-section__eyebrow">Well {hoveredWell.cell.well}</p>
                      <h4>{hoveredWell.cell.assignment.contents}</h4>
                    </div>
                    <span className="ingestion-plate-browser__status">
                      {toneLabel(hoveredWell.cell.status)}
                    </span>
                  </div>
                  {hoveredWell.cell.assignment.itemNumber ? (
                    <p className="ingestion-plate-browser__meta">Catalog number {hoveredWell.cell.assignment.itemNumber}</p>
                  ) : null}
                  <IngestionCompoundHoverCard compound={hoveredWell.cell.assignment.compound} />
                </>
              ) : (
                <>
                  <div className="ingestion-plate-browser__well-head">
                    <div>
                      <p className="ingestion-section__eyebrow">Well {hoveredWell.cell.well}</p>
                      <h4>{hoveredWell.cell.status === 'unused' ? 'Unused well' : 'No assignment'}</h4>
                    </div>
                    <span className="ingestion-plate-browser__status">
                      {toneLabel(hoveredWell.cell.status)}
                    </span>
                  </div>
                  <p className="ingestion-plate-browser__meta">
                    {hoveredWell.cell.status === 'unused'
                      ? 'This position was explicitly marked unused in the source plate map.'
                      : 'No parsed assignment is attached to this well.'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .ingestion-plate-browser__toolbar { display: flex; gap: 0.75rem; align-items: center; }
        .ingestion-plate-browser__toolbar label { display: flex; gap: 0.5rem; align-items: center; font-size: 0.9rem; color: #334155; }
        .ingestion-plate-browser__toolbar select {
          border: 1px solid #d0d7de; border-radius: 8px; padding: 0.45rem 0.65rem; background: white; font-size: 0.9rem;
        }
        .ingestion-plate-browser__legend { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-top: 0.8rem; font-size: 0.82rem; color: #475569; }
        .ingestion-plate-browser__legend span { display: inline-flex; gap: 0.35rem; align-items: center; }
        .ingestion-plate-browser__legend i { width: 0.8rem; height: 0.8rem; border-radius: 999px; display: inline-block; }
        .ingestion-plate-browser { display: block; }
        .ingestion-plate-browser__canvas {
          position: relative;
          background: white; border: 1px solid #e9ecef; border-radius: 12px; padding: 1rem;
        }
        .ingestion-plate-browser__canvas .ingestion-hover-card a { color: #1864ab; text-decoration: none; }
        .ingestion-plate-browser__tooltip {
          position: absolute; z-index: 30; width: 340px; max-width: calc(100% - 24px); background: white;
          border: 1px solid #d0d7de; border-radius: 12px; box-shadow: 0 18px 38px rgba(15, 23, 42, 0.15); padding: 0.85rem;
          pointer-events: none;
        }
        .ingestion-plate-browser__well-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.5rem; }
        .ingestion-plate-browser__well-head h4 { margin: 0; color: #1f2937; }
        .ingestion-plate-browser__status {
          display: inline-flex; align-items: center; border-radius: 999px; padding: 0.3rem 0.6rem; background: #f8f9fa; color: #334155; font-size: 0.78rem; font-weight: 700;
        }
        .ingestion-plate-browser__meta { color: #64748b; font-size: 0.86rem; margin-top: 0; }
        .ingestion-plate-browser__empty {
          position: absolute; left: 1rem; bottom: 1rem; color: #64748b; font-size: 0.9rem; line-height: 1.5;
          background: rgba(255,255,255,0.92); border: 1px solid #e9ecef; border-radius: 10px; padding: 0.6rem 0.8rem;
        }
        @media (max-width: 1200px) {
          .ingestion-plate-browser__tooltip { width: min(340px, calc(100% - 24px)); }
        }
      `}</style>
    </section>
  )
}

function PlateSvg(props: {
  plate: CaymanReviewPlate
  cells: PlateCell[]
  hoveredWell: string | null
  onHoverWell: (cell: PlateCell | null, position?: { x: number; y: number }) => void
}) {
  const { cells, hoveredWell, onHoverWell } = props
  const width = 720
  const height = 500
  const paddingLeft = 50
  const paddingTop = 45
  const cellWidth = 52
  const cellHeight = 50
  const radius = 16

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="ingestion-plate-svg" role="img" aria-label="Cayman plate layout review">
      <rect x={30} y={24} width={width - 60} height={height - 48} rx={16} fill="#f8f9fa" stroke="#dee2e6" />
      {COLS.map((label, colIndex) => (
        <text
          key={label}
          x={paddingLeft + colIndex * cellWidth + cellWidth / 2}
          y={24}
          textAnchor="middle"
          fontSize="12"
          fill="#475569"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      ))}
      {ROWS.map((label, rowIndex) => (
        <text
          key={label}
          x={20}
          y={paddingTop + rowIndex * cellHeight + cellHeight / 2 + 4}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill="#475569"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      ))}
      {cells.map((cell) => {
        const rowIndex = ROWS.indexOf(cell.well.charAt(0))
        const colIndex = COLS.indexOf(cell.well.slice(1))
        const centerX = paddingLeft + colIndex * cellWidth + cellWidth / 2
        const centerY = paddingTop + rowIndex * cellHeight + cellHeight / 2
        const fill = toneForStatus(cell.status)
        const isHovered = hoveredWell === cell.well
        return (
          <g
            key={cell.well}
            onMouseEnter={(event) => onHoverWell(cell, { x: event.clientX, y: event.clientY })}
            onMouseMove={(event) => onHoverWell(cell, { x: event.clientX, y: event.clientY })}
            onMouseLeave={() => onHoverWell(null)}
            style={{ cursor: 'default' }}
          >
            <circle
              cx={centerX}
              cy={centerY}
              r={radius}
              fill={fill}
              fillOpacity={cell.status === 'unused' ? 0.45 : cell.status === 'empty' ? 0.2 : 0.88}
              stroke={isHovered ? '#111827' : '#ffffff'}
              strokeWidth={isHovered ? 3 : 2}
            />
            <text
              x={centerX}
              y={centerY + 4}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill={cell.status === 'unused' || cell.status === 'empty' ? '#475569' : '#ffffff'}
              fontFamily="system-ui, sans-serif"
            >
              {cell.well}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

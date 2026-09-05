/**
 * GraphSearchPlateView — render query-result wells as a highlighted plate grid.
 *
 * Groups wells into plates (by owning record+labware). Each plate is a grid of
 * cells; matched wells are filled/highlighted and clickable to toggle selection
 * (spec §10 plate view, §7 selectable results).
 */
import type { PlateOfWells } from './wellNodes'
import { wellCoordinate } from './wellNodes'

export interface GraphSearchPlateViewProps {
  plates: PlateOfWells[]
  selectedIds: ReadonlySet<string>
  onToggle: (nodeId: string) => void
}

export function GraphSearchPlateView({ plates, selectedIds, onToggle }: GraphSearchPlateViewProps) {
  return (
    <div className="graph-search__plates" data-testid="graph-search-plates">
      {plates.map((plate) => (
        <div className="graph-search__plate" key={plate.key} data-testid="graph-search-plate">
          <div className="graph-search__plate-heading">
            {plate.recordId} · {plate.labwareId}
          </div>
          <table className="graph-search__grid">
            <tbody>
              {plate.rows.map((row) => (
                <tr key={row}>
                  <th className="graph-search__grid-label">{row}</th>
                  {plate.cols.map((col) => {
                    const label = `${row}${col}`
                    const nodeId = plate.wells[label]
                    const highlighted = nodeId !== undefined
                    const selected = nodeId !== undefined && selectedIds.has(nodeId)
                    return (
                      <td key={label}
                        className={`graph-search__cell${highlighted ? ' graph-search__cell--hit' : ''}${selected ? ' graph-search__cell--selected' : ''}`}
                        data-well={label}
                        data-hit={highlighted ? 'true' : 'false'}
                        data-selected={selected ? 'true' : 'false'}
                        title={highlighted ? label : undefined}
                        onClick={nodeId ? () => onToggle(nodeId) : undefined}
                        aria-label={label}
                      />
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

/** Named re-export for tests. */
export const __wellCoordinate = wellCoordinate
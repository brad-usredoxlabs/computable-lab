/**
 * GraphSearchPlateView — render query-result wells on their REAL plate frame.
 *
 * Groups wells into plates (by owning record+labware) and draws the full
 * declared frame from `PlateOfWells.rows`/`cols` (or `linearLabels` for
 * reservoirs/tubes). Matching wells are filled/highlighted and clickable to
 * toggle selection; non-matching wells are dimmed but still labeled so the
 * spatial layout of the plate reads correctly (spec §10 plate view, §7
 * selectable results). A 96-well plate always shows 8×12, a 384 shows 16×24,
 * etc. — never a truncated bounding box of just the touched wells.
 */
import type { PlateOfWells } from './wellNodes'

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
            {plate.labwareType ? <span className="graph-search__plate-type"> · {plate.labwareType}</span> : null}
          </div>
          {plate.linearLabels ? (
            <LinearStrip plate={plate} selectedIds={selectedIds} onToggle={onToggle} />
          ) : (
            <GridFrame plate={plate} selectedIds={selectedIds} onToggle={onToggle} />
          )}
        </div>
      ))}
    </div>
  )
}

function GridFrame({ plate, selectedIds, onToggle }: Required<Pick<GraphSearchPlateViewProps, 'selectedIds' | 'onToggle'>> & { plate: PlateOfWells }) {
  return (
    <table className="graph-search__grid">
      <thead>
        <tr>
          <th className="graph-search__grid-label"></th>
          {plate.cols.map((col) => <th key={col} className="graph-search__grid-col">{col}</th>)}
        </tr>
      </thead>
      <tbody>
        {plate.rows.map((row) => (
          <tr key={row}>
            <th className="graph-search__grid-label">{row}</th>
            {plate.cols.map((col) => {
              const label = `${row}${col}`
              const nodeId = plate.wells[label]
              const hit = nodeId !== undefined
              const selected = nodeId !== undefined && selectedIds.has(nodeId)
              return (
                <td key={label}
                  className={`graph-search__cell${hit ? ' graph-search__cell--hit' : ' graph-search__cell--empty'}${selected ? ' graph-search__cell--selected' : ''}`}
                  data-well={label}
                  data-hit={hit ? 'true' : 'false'}
                  data-selected={selected ? 'true' : 'false'}
                  title={label}
                  onClick={nodeId ? () => onToggle(nodeId) : undefined}
                  aria-label={label}
                />
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function LinearStrip({ plate, selectedIds, onToggle }: { plate: PlateOfWells; selectedIds: ReadonlySet<string>; onToggle: (nodeId: string) => void }) {
  return (
    <table className="graph-search__grid graph-search__grid--linear">
      <tbody>
        <tr>
          {plate.linearLabels!.map((slot) => {
            const nodeId = plate.wells[slot]
            const hit = nodeId !== undefined
            const selected = nodeId !== undefined && selectedIds.has(nodeId)
            return (
              <td key={slot}
                className={`graph-search__cell${hit ? ' graph-search__cell--hit' : ' graph-search__cell--empty'}${selected ? ' graph-search__cell--selected' : ''}`}
                data-well={slot}
                data-hit={hit ? 'true' : 'false'}
                data-selected={selected ? 'true' : 'false'}
                title={slot}
                onClick={nodeId ? () => onToggle(nodeId) : undefined}
                aria-label={slot}
              >
                {slot}
              </td>
            )
          })}
        </tr>
      </tbody>
    </table>
  )
}
/**
 * GraphSearchTable — generic table result view for graph query results
 * (spec §10 table, §11 relationship-column expansion via per-node type).
 *
 * Renders each object as a row with selectable checkbox, type badge, label,
 * and a compact JSON of its properties. Well rows also show their plate label.
 */
import type { GraphNode } from '../shared/api/graphSearchClient'

export interface GraphSearchTableProps {
  nodes: GraphNode[]
  selectedIds: ReadonlySet<string>
  onToggle: (nodeId: string) => void
}

function displayProps(node: GraphNode): string {
  const { source: _source, ...rest } = node.properties ?? {}
  if (Object.keys(rest).length === 0) return '—'
  return JSON.stringify(rest)
}

export function GraphSearchTable({ nodes, selectedIds, onToggle }: GraphSearchTableProps) {
  if (nodes.length === 0) {
    return <div className="graph-search__empty" data-testid="graph-search-empty">No objects to display.</div>
  }
  return (
    <table className="graph-search__table" data-testid="graph-search-table">
      <thead>
        <tr>
          <th></th>
          <th>Type</th>
          <th>Label</th>
          <th>ID</th>
          <th>Properties</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node) => (
          <tr key={node.id} data-node-id={node.id} data-node-type={node.type}>
            <td>
              <input
                type="checkbox"
                checked={selectedIds.has(node.id)}
                onChange={() => onToggle(node.id)}
                data-testid={`row-select-${node.type}`}
                aria-label={`select ${node.label}`}
              />
            </td>
            <td className="graph-search__type">{node.type}</td>
            <td>{node.label}</td>
            <td className="graph-search__id" title={node.id}>{node.id}</td>
            <td className="graph-search__props">{displayProps(node)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}